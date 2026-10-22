import type { GeometryAnalysis, Point2D } from './reference/geometry/types';

function deviation(point:Point2D, start:Point2D, end:Point2D) {
  const dx=end.x-start.x,dy=end.y-start.y;
  const t=dx*dx+dy*dy?Math.max(0,Math.min(1,((point.x-start.x)*dx+(point.y-start.y)*dy)/(dx*dx+dy*dy))):0;
  return Math.hypot(point.x-start.x-t*dx,point.y-start.y-t*dy);
}

function simplifyOpen(points:Point2D[],tolerance:number):Point2D[] {
  if(points.length<3)return points;
  const keep=new Uint8Array(points.length);keep[0]=1;keep[points.length-1]=1;
  const sections:[number,number][]=[[0,points.length-1]];
  while(sections.length){
    const [start,end]=sections.pop()!;
    let largest=tolerance,index=-1;
    for(let i=start+1;i<end;i++){
      const distance=deviation(points[i],points[start],points[end]);
      if(distance>largest){largest=distance;index=i;}
    }
    if(index>=0){keep[index]=1;sections.push([start,index],[index,end]);}
  }
  return points.filter((_,i)=>keep[i]);
}

function simplifyClosed(points:Point2D[],tolerance:number):Point2D[] {
  const ring=points.slice(0,-1);
  if(ring.length<4)return points;
  let split=1,distance=0;
  for(let i=1;i<ring.length;i++){const d=Math.hypot(ring[i].x-ring[0].x,ring[i].y-ring[0].y);if(d>distance){distance=d;split=i;}}
  const first=simplifyOpen(ring.slice(0,split+1),tolerance);
  const second=simplifyOpen([...ring.slice(split),ring[0]],tolerance);
  const simplified=[...first,...second.slice(1)];
  return simplified.length>=4?simplified:points;
}

/** Reduce oversampled STEP curves with a bounded geometric error (at most 0.005 in). */
export function simplifyStepContours(analysis:GeometryAnalysis,maxPoints=20000):GeometryAnalysis {
  if(analysis.loops.reduce((sum,loop)=>sum+loop.points.length,0)<=maxPoints)return analysis;
  for(const tolerance of [0.00025,0.0005,0.001,0.002,0.005]){
    const loops=analysis.loops.map(loop=>({...loop,points:simplifyClosed(loop.points,tolerance)}));
    if(loops.reduce((sum,loop)=>sum+loop.points.length,0)<=maxPoints){
      return {...analysis,loops,warnings:[...analysis.warnings,`Detailed STEP contours were simplified within ${tolerance} in (${(tolerance*25.4).toFixed(3)} mm) to keep nesting responsive.`]};
    }
  }
  return analysis;
}
