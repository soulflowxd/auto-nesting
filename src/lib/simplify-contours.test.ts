import { describe, expect, it } from 'vitest';
import { simplifyContours, simplifyStepContours } from './simplify-contours';
import { analyzeDxf } from './reference/geometry/analyze-dxf';
import { writeDxf } from './reference/dxf-writer';
import { outlineFromAnalysis } from './reference/nest-outline';
import { validateOutline } from './validate-sheet';
import type { GeometryAnalysis, Point2D } from './reference/geometry/types';

describe('STEP contour reduction',()=>{
  it('keeps a dense circular cutout closed and within the point budget',()=>{
    const circle=(radius:number):Point2D[]=>{
      const points=Array.from({length:30000},(_,i)=>({x:radius*Math.cos(i*Math.PI*2/30000),y:radius*Math.sin(i*Math.PI*2/30000)}));
      return [...points,points[0]];
    };
    const analysis={sourceUnit:'mm',sourceThicknessMm:3,boundingBox:{minX:-2,minY:-2,maxX:2,maxY:2,width:4,height:4},cutLengthIn:20,closedLoopCount:2,loops:[{points:circle(2),perimeterIn:12},{points:circle(1),perimeterIn:6}],warnings:[]} as GeometryAnalysis;
    const reduced=simplifyStepContours(analysis);
    expect(reduced.loops.reduce((sum,loop)=>sum+loop.points.length,0)).toBeLessThan(20000);
    for(const loop of reduced.loops){expect(loop.points[0]).toEqual(loop.points.at(-1));expect(loop.points.length).toBeGreaterThan(100);}
    expect(reduced.warnings[0]).toMatch(/simplified/);
  });
});

it('reduces a dense DXF while retaining the outside and hole loops',()=>{
  const circle=(radius:number):Point2D[]=>Array.from({length:24000},(_,i)=>({
    x:2+radius*Math.cos(i*Math.PI*2/24000),y:2+radius*Math.sin(i*Math.PI*2/24000),
  }));
  const dxf=writeDxf({
    polylines:[{points:circle(2),layer:'CUT-OUTSIDE',closed:true},{points:circle(0.5),layer:'CUT-HOLES',closed:true}],
    layers:[{name:'CUT-OUTSIDE',color:5},{name:'CUT-HOLES',color:1}],
    extents:{minX:0,minY:0,maxX:4,maxY:4},
  });
  const imported=analyzeDxf(dxf);
  expect(imported.loops.reduce((sum,loop)=>sum+loop.points.length,0)).toBeGreaterThan(20000);
  const reduced=simplifyContours(imported,'DXF');
  expect(reduced.loops.reduce((sum,loop)=>sum+loop.points.length,0)).toBeLessThan(20000);
  expect(reduced.loops).toHaveLength(2);
  expect(reduced.warnings.some(warning=>warning.includes('DXF contours were simplified'))).toBe(true);
  const outline=outlineFromAnalysis(reduced);
  expect(outline).toBeTruthy();
  expect(validateOutline(outline!)).toEqual([]);
});
