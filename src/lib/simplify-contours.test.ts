import { describe, expect, it } from 'vitest';
import { simplifyStepContours } from './simplify-contours';
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
