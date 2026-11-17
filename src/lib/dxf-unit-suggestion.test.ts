import { expect, it } from 'vitest';
import { suggestDxfUnit } from './dxf-unit-suggestion';
import type { GeometryAnalysis } from './reference/geometry/types';

function drawing(unit:GeometryAnalysis['sourceUnit'],width:number,height:number):GeometryAnalysis {
  return {sourceUnit:unit,boundingBox:{minX:0,minY:0,maxX:width,maxY:height,width,height},cutLengthIn:0,closedLoopCount:0,loops:[],warnings:[]};
}

it('suggests millimeters for a 300-inch square DXF',()=>{
  expect(suggestDxfUnit(drawing('in',300,300))?.unit).toBe('mm');
});

it('suggests inches for a 10-mm square DXF',()=>{
  expect(suggestDxfUnit(drawing('mm',10/25.4,10/25.4))?.unit).toBe('in');
});

it('does not suggest a unit change for ordinary or long narrow parts',()=>{
  expect(suggestDxfUnit(drawing('in',10,10))).toBeNull();
  expect(suggestDxfUnit(drawing('in',300,2))).toBeNull();
  expect(suggestDxfUnit(drawing('mm',100/25.4,100/25.4))).toBeNull();
});
