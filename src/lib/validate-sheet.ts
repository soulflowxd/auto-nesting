import type { NestPlacement, NestPoint } from './reference/nesting';
import { holeFlags } from './reference/cut-edges';
import { sanitizeLoopPoints } from './reference/geometry/loop-hierarchy';
import { settingsErrors, usedAreas, type SheetSettings } from './materials';

const EPS = 2e-6; // DXF coordinates are written to six decimal places in inches.
const cross = (a: NestPoint, b: NestPoint, c: NestPoint) => (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
function onSegment(p: NestPoint, a: NestPoint, b: NestPoint) {
  return Math.abs(cross(a,b,p)) < 1e-10 && p.x >= Math.min(a.x,b.x)-1e-10 && p.x <= Math.max(a.x,b.x)+1e-10 && p.y >= Math.min(a.y,b.y)-1e-10 && p.y <= Math.max(a.y,b.y)+1e-10;
}
function intersects(a: NestPoint, b: NestPoint, c: NestPoint, d: NestPoint): boolean {
  if (Math.max(a.x,b.x) < Math.min(c.x,d.x)-1e-10 || Math.max(c.x,d.x) < Math.min(a.x,b.x)-1e-10 || Math.max(a.y,b.y) < Math.min(c.y,d.y)-1e-10 || Math.max(c.y,d.y) < Math.min(a.y,b.y)-1e-10) return false;
  const ca=cross(a,b,c), da=cross(a,b,d), ac=cross(c,d,a), bc=cross(c,d,b);
  return (ca*da < 0 && ac*bc < 0) || onSegment(a,c,d) || onSegment(b,c,d) || onSegment(c,a,b) || onSegment(d,a,b);
}
function inside(p: NestPoint, polygon: NestPoint[]): boolean {
  let contained = false;
  for (let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
    const a=polygon[i],b=polygon[j];
    if (onSegment(p,a,b)) return true;
    if ((a.y>p.y)!==(b.y>p.y) && p.x < (b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x) contained=!contained;
  }
  return contained;
}
function pointDistance(p: NestPoint,a: NestPoint,b: NestPoint) {
  const dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy;
  const t=l ? Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/l)) : 0;
  return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
}
function segmentDistance(a: NestPoint,b: NestPoint,c: NestPoint,d: NestPoint) {
  if (intersects(a,b,c,d)) return 0;
  return Math.min(pointDistance(a,c,d),pointDistance(b,c,d),pointDistance(c,a,b),pointDistance(d,a,b));
}
export function polygonArea(points: NestPoint[]) {
  return Math.abs(points.reduce((sum,a,i) => {const b=points[(i+1)%points.length];return sum+a.x*b.y-b.x*a.y;},0))/2;
}
export function validateOutline(loops: NestPoint[][]): string[] {
  const errors: string[]=[];
  const clean = loops.map(sanitizeLoopPoints);
  if (!clean.length || clean.some(l => l.length < 3 || l.some(p => !Number.isFinite(p.x)||!Number.isFinite(p.y)) || polygonArea(l) < 1e-10)) return ['The file contains an invalid or zero-area contour.'];
  // The reference packer uses one outer footprint. Keep disconnected designs explicit.
  const flags=holeFlags(clean);
  if (flags.filter(f=>!f).length !== 1) errors.push('Import one connected part per file. Separate disconnected contours or islands into individual files.');
  for (const loop of clean) {
    for (let i=0;i<loop.length;i++) for (let j=i+2;j<loop.length;j++) {
      if (i===0 && j===loop.length-1) continue;
      if (intersects(loop[i],loop[(i+1)%loop.length],loop[j],loop[(j+1)%loop.length])) return [...errors,'A cut contour intersects itself. Repair the drawing before importing.'];
    }
  }
  for (let i=0;i<clean.length;i++) for(let j=i+1;j<clean.length;j++) {
    for(let a=0;a<clean[i].length;a++) for(let b=0;b<clean[j].length;b++) if(intersects(clean[i][a],clean[i][(a+1)%clean[i].length],clean[j][b],clean[j][(b+1)%clean[j].length])) return [...errors,'Cut contours cross or touch. Repair the drawing before importing.'];
  }
  return errors;
}
export function validateSheet(placements: NestPlacement[], settings: SheetSettings, sheetIndex=0): string[] {
  const errors = settingsErrors(settings);
  if (errors.length) return errors;
  const polygons=placements.map(p => {
    const flags=holeFlags(p.outline);
    return p.outline.filter((_,i)=>!flags[i]).map(l=>l.map(v=>({x:v.x+p.x,y:v.y+p.y})));
  });
  for (let i=0;i<placements.length;i++) {
    const p=placements[i];
    const points=p.outline.flat().map(v=>({x:v.x+p.x,y:v.y+p.y}));
    if (!points.length || ![p.x,p.y,p.width,p.height].every(Number.isFinite) || points.some(v=>!Number.isFinite(v.x)||!Number.isFinite(v.y))) {errors.push(`${p.label}: invalid coordinates.`);continue;}
    if (points.some(v=>v.x<settings.marginIn-EPS||v.y<settings.marginIn-EPS||v.x>settings.widthIn-settings.marginIn+EPS||v.y>settings.heightIn-settings.marginIn+EPS)) errors.push(`${p.label}: outside the sheet margin.`);
    for (const area of usedAreas(settings,sheetIndex)) {
      const blocked=[{x:area.x,y:area.y},{x:area.x+area.width,y:area.y},{x:area.x+area.width,y:area.y+area.height},{x:area.x,y:area.y+area.height}];
      let invalid=false;
      for (const polygon of polygons[i]) {
        if (inside(polygon[0],blocked)||inside(blocked[0],polygon)) invalid=true;
        for(let a=0;a<polygon.length&&!invalid;a++)for(let b=0;b<blocked.length;b++) {
          const distance=segmentDistance(polygon[a],polygon[(a+1)%polygon.length],blocked[b],blocked[(b+1)%blocked.length]);
          if(distance<=EPS||distance<settings.gapIn-EPS){invalid=true;break;}
        }
      }
      if(invalid)errors.push(`${p.label}: overlaps a marked used area or its spacing.`);
    }
    for (let j=0;j<i;j++) {
      const other=placements[j];
      if(p.x>other.x+other.width+settings.gapIn || other.x>p.x+p.width+settings.gapIn || p.y>other.y+other.height+settings.gapIn || other.y>p.y+p.height+settings.gapIn) continue;
      let invalid=false;
      for(const a of polygons[i]) for(const b of polygons[j]) {
        if(inside(a[0],b)||inside(b[0],a)) invalid=true;
        for(let ai=0;ai<a.length&&!invalid;ai++) for(let bi=0;bi<b.length;bi++) {
          const dist=segmentDistance(a[ai],a[(ai+1)%a.length],b[bi],b[(bi+1)%b.length]);
          if(dist<=1e-10 || dist < settings.gapIn-EPS) {invalid=true;break;}
        }
      }
      if(invalid) errors.push(`${p.label} and ${other.label}: overlap or insufficient spacing.`);
    }
  }
  return errors;
}
