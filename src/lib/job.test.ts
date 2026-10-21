import { describe, expect, it } from 'vitest';
import DxfParser from 'dxf-parser';
import { defaultSettings, getStock, mmToIn, thicknessLabel } from './materials';
import { nestJob } from './nest-job';
import { parseJob } from './job';
import { rectangle, fixturePart } from './test-fixtures';
import { exportSheet } from './export-sheet';
import { validateOutline, validateSheet } from './validate-sheet';
import { holeFlags } from './reference/cut-edges';
import type { NestPlacement } from './reference/nesting';

const settings={widthIn:5,heightIn:4,gapIn:.1,marginIn:.25,rotation:'quarter' as const};
const placement=(x=0,y=0):NestPlacement=>({partId:'p',label:'P',sheetIndex:0,sheetId:'s',x,y,width:2,height:1,rotationDeg:0,outline:[rectangle()]});

describe('stock and job contracts',()=>{
  it('keeps exact metric stock dimensions behind inch-first labels',()=>{
    const stock=getStock('al7075-3');
    expect(defaultSettings(stock).widthIn*25.4).toBeCloseTo(700,10);
    expect(thicknessLabel(3)).toBe('0.1181″ (3 mm)');
    expect(mmToIn(6)).toBeCloseTo(.23622047,7);
    expect(()=>getStock('abs-1.5')).toThrow();
  });
  it('separates thicknesses and colors into different groups',()=>{
    const parts=[fixturePart(),fixturePart({id:'thick',stockId:'al7075-6'}),fixturePart({id:'black',stockId:'srpp-3-black'}),fixturePart({id:'white',stockId:'srpp-3-white'})];
    const groups=nestJob(parts,Object.fromEntries(parts.map(p=>[p.stockId,settings])));
    expect(groups.map(g=>g.stockId)).toEqual(parts.map(p=>p.stockId));
    expect(groups.every(g=>g.nest.placements.length===2)).toBe(true);
    expect(groups.every(g=>Object.values(g.errors).flat().length===0)).toBe(true);
  });
  it('places every quantity on multiple sheets and reports oversized copies',()=>{
    const groups=nestJob([fixturePart({quantity:4}),fixturePart({id:'large',analysis:{...fixturePart().analysis,boundingBox:{minX:0,minY:0,maxX:20,maxY:20,width:20,height:20},loops:[{points:rectangle(20,20),perimeterIn:80}]}})],{'al7075-3':{...settings,widthIn:3,heightIn:2}});
    expect(groups[0].nest.placements).toHaveLength(4);
    expect(groups[0].nest.sheetsUsed).toBe(4);
    expect(groups[0].nest.unplaced).toHaveLength(2);
  });
  it('respects rotation lock',()=>{
    const fixed=nestJob([fixturePart({quantity:1})],{'al7075-3':{...settings,widthIn:1.8,heightIn:3,rotation:'fixed'}})[0];
    const rotated=nestJob([fixturePart({quantity:1})],{'al7075-3':{...settings,widthIn:1.8,heightIn:3,rotation:'quarter'}})[0];
    expect(fixed.nest.unplaced).toHaveLength(1);
    expect(rotated.nest.placements).toHaveLength(1);
    expect(rotated.nest.placements[0].rotationDeg%180).toBe(90);
  });
  it('rejects invalid quantities and duplicate IDs in saved projects',()=>{
    const base={version:1,name:'Job',parts:[fixturePart({quantity:0})],settings:{}};
    expect(()=>parseJob(JSON.stringify(base))).toThrow(/quantity/);
    expect(()=>parseJob(JSON.stringify({...base,parts:[fixturePart(),fixturePart()]}))).toThrow();
  });
});

describe('export safety and cut direction',()=>{
  it('blocks overlap, containment, missing margin and insufficient spacing',()=>{
    expect(validateSheet([placement(.25,.25)],settings)).toEqual([]);
    expect(validateSheet([placement(.25,.25),placement(1,.25)],settings)).not.toEqual([]);
    expect(validateSheet([placement(0,0)],settings)).not.toEqual([]);
    expect(validateSheet([placement(.25,.25),placement(2.3,.25)],settings)).not.toEqual([]);
    expect(validateSheet([placement(.25,.25),placement(2.36,.25)],settings)).toEqual([]);
  });
  it('rejects self-crossing and disconnected contours',()=>{
    expect(validateOutline([[{x:0,y:0},{x:2,y:2},{x:0,y:2},{x:2,y:0}]])).not.toEqual([]);
    expect(validateOutline([rectangle(),rectangle(1,1,3,3)])).not.toEqual([]);
  });
  it('classifies reversed holes and nested islands by containment',()=>{
    expect(holeFlags([rectangle(6,6).reverse(),rectangle(4,4,1,1),rectangle(2,2,2,2).reverse()])).toEqual([false,true,false]);
  });
  it('writes actual entity and layer colors with unmodified inch dimensions',()=>{
    const group=nestJob([fixturePart({quantity:1})],{'al7075-3':settings})[0];
    const {dxf,filename}=exportSheet(group,0);
    const parsed=new DxfParser().parseSync(dxf)!;
    expect(parsed.header.$INSUNITS).toBe(1);
    const outside=parsed.entities.find(e=>e.layer==='CUT-OUTSIDE')!;
    const hole=parsed.entities.find(e=>e.layer==='CUT-HOLES')!;
    expect(outside.colorIndex).toBe(5);
    expect(hole.colorIndex).toBe(1);
    expect(parsed.tables.layer.layers['CUT-OUTSIDE'].colorIndex).toBe(5);
    expect(parsed.tables.layer.layers['CUT-HOLES'].colorIndex).toBe(1);
    expect(filename).toContain('0.1181in-3mm');
    const bounds=group.nest.placements[0];
    expect([bounds.width,bounds.height].sort()).toEqual([1,2]);
    expect(dxf.match(/^POINT$/gm)).toHaveLength(4);
  });
  it('refuses to export tampered placements',()=>{
    const group=nestJob([fixturePart({quantity:1})],{'al7075-3':settings})[0];
    group.nest.placements[0].x=-1;
    expect(()=>exportSheet(group,0)).toThrow(/blocked/);
  });
});
