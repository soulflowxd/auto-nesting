import {describe,expect,it} from 'vitest';
import {nestJob} from './nest-job';
import {defaultSettings,getStock} from './materials';
import {fixturePart,rectangle} from './test-fixtures';

const stockId='srpp-3-black';
const circle=Array.from({length:64},(_,i)=>{
  const angle=2*Math.PI*i/64;
  return {x:5+3*Math.cos(angle),y:5+3*Math.sin(angle)};
});
const base=fixturePart();
const ring=fixturePart({
  id:'turret',name:'Turret plate',stockId,quantity:1,
  analysis:{...base.analysis,boundingBox:{minX:0,minY:0,maxX:10,maxY:10,width:10,height:10},closedLoopCount:2,loops:[{points:rectangle(10,10),perimeterIn:40},{points:circle,perimeterIn:6*Math.PI}]},
});
function peg(size:number){return fixturePart({
  id:'peg',name:'Small plate',stockId,quantity:1,
  analysis:{...base.analysis,boundingBox:{minX:0,minY:0,maxX:size,maxY:size,width:size,height:size},closedLoopCount:1,loops:[{points:rectangle(size,size),perimeterIn:4*size}]},
});}
const settings={...defaultSettings(getStock(stockId)),widthIn:10.5,heightIn:10.5,gapIn:.1,marginIn:.1,rotation:'fixed' as const};

describe('job nesting inside a large cutout',()=>{
  it('places a small part inside a turret plate hole with valid cut clearance',()=>{
    const group=nestJob([ring,peg(2)],{[stockId]:settings})[0];
    expect(group.nest.sheetsUsed).toBe(1);
    expect(group.nest.unplaced).toHaveLength(0);
    expect(group.nest.placements).toHaveLength(2);
    expect(Object.values(group.errors).flat()).toEqual([]);
  });

  it('uses another sheet when a part cannot fit fully inside the hole',()=>{
    const group=nestJob([ring,peg(6)],{[stockId]:settings})[0];
    expect(group.nest.sheetsUsed).toBe(2);
    expect(Object.values(group.errors).flat()).toEqual([]);
  });
});
