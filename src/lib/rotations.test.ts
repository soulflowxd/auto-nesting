import {describe,expect,it} from 'vitest';
import {defaultSettings,getStock,rotationAngles,settingsErrors} from './materials';
import {nestJob} from './nest-job';
import {fixturePart,rectangle} from './test-fixtures';
import {parseJob} from './job';
import {exportSheet} from './export-sheet';
import {analyzeDxf} from './reference/geometry/analyze-dxf';
import {freeRotationSeeds,refineFreeRotation} from './reference/free-rotation';
import {useJobStore,currentJob} from '../stores/job-store';

const base=defaultSettings(getStock('al7075-3'));
function angledBar(angle:number,quantity=1){
  const radians=-angle*Math.PI/180,c=Math.cos(radians),s=Math.sin(radians);
  const rotate=(loop:ReturnType<typeof rectangle>)=>loop.map(p=>({x:p.x*c-p.y*s,y:p.x*s+p.y*c}));
  const loops=[rotate(rectangle(8,.5)),rotate(rectangle(.25,.15,1,.15))];
  const points=loops.flat(),xs=points.map(p=>p.x),ys=points.map(p=>p.y);
  const minX=Math.min(...xs),minY=Math.min(...ys),maxX=Math.max(...xs),maxY=Math.max(...ys);
  return fixturePart({quantity,analysis:{...fixturePart().analysis,boundingBox:{minX,minY,maxX,maxY,width:maxX-minX,height:maxY-minY},loops:loops.map(points=>({points,perimeterIn:17}))}});
}

describe('automatic unrestricted rotation',()=>{
  it('defaults to automatic free rotation, without angle-entry fields',()=>{
    expect(base.rotation).toBe('free');
    expect(settingsErrors(base)).toEqual([]);
  });
  it('keeps existing constrained presets compatible with saved jobs',()=>{
    expect(rotationAngles({...base,rotation:'fixed'})).toEqual([0]);
    expect(rotationAngles({...base,rotation:'quarter'})).toEqual([0,90,180,270]);
    expect(rotationAngles({...base,rotation:'fine'})).toEqual(Array.from({length:12},(_,i)=>i*30));
    const doc=parseJob(JSON.stringify({version:1,name:'Old job',parts:[fixturePart()],settings:{'al7075-3':{widthIn:12,heightIn:12,gapIn:.1,marginIn:.25,rotation:'quarter'}}}));
    expect(doc.settings['al7075-3'].rotation).toBe('quarter');
  });
  it.each([3.84731,4.6153])('automatically discovers a %.5f degree orientation that constrained modes miss',angle=>{
    const part=angledBar(angle);
    const settings={...base,widthIn:9,heightIn:.9,gapIn:.02,marginIn:.1};
    const constrained=nestJob([part],{'al7075-3':{...settings,rotation:'quarter'}})[0];
    expect(constrained.nest.unplaced).toHaveLength(1);
    const group=nestJob([part],{'al7075-3':settings})[0];
    expect(group.nest.placements).toHaveLength(1);
    const actual=group.nest.placements[0].rotationDeg%180;
    expect(actual).toBeCloseTo(angle,4);
    expect(group.errors[0]).toEqual([]);
    const exported=analyzeDxf(exportSheet(group,0).dxf);
    expect(exported.closedLoopCount).toBe(2);
    expect(exported.boundingBox.width).toBeCloseTo(8,4);
    expect(exported.boundingBox.height).toBeCloseTo(.5,4);
  });
  it('refines between its initial seeds rather than choosing a fixed angular grid',()=>{
    const optimum=4.6153;
    const result=refineFreeRotation({angle:0,cost:optimum**2},p=>p.angle,angle=>({angle,cost:(angle-optimum)**2}),(a,b)=>a.cost<b.cost);
    expect(result.angle).toBeCloseTo(optimum,5);
    expect(result.angle).not.toBe(4.6);
    const part=angledBar(3.84731);
    const seeds=freeRotationSeeds(part.analysis.loops.map(l=>l.points),9,1);
    expect(seeds.some(a=>Math.abs(a-3.84731)<1e-7)).toBe(true);
  });
  it('checks exact clearance and holes for multiple freely rotated copies',()=>{
    const group=nestJob([angledBar(4.6153,3)],{'al7075-3':{...base,widthIn:9,heightIn:3,gapIn:.125,marginIn:.1}})[0];
    expect(group.nest.placements).toHaveLength(3);
    expect(group.nest.unplaced).toHaveLength(0);
    expect(Object.values(group.errors).flat()).toEqual([]);
    expect(analyzeDxf(exportSheet(group,0).dxf).closedLoopCount).toBe(6);
  });
  it('persists free rotation and invalidates stale layouts when the rule changes',()=>{
    useJobStore.getState().clear();
    useJobStore.getState().addParts([fixturePart({quantity:1})]);
    expect(parseJob(JSON.stringify(currentJob())).settings['al7075-3'].rotation).toBe('free');
    const state=useJobStore.getState();
    state.setResults(nestJob(state.parts,state.settings),state.revision);
    expect(useJobStore.getState().results).toHaveLength(1);
    useJobStore.getState().updateSettings('al7075-3',{rotation:'quarter'});
    expect(useJobStore.getState().results).toHaveLength(0);
    useJobStore.getState().clear();
  });
});
