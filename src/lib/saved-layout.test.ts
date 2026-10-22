import {expect,it} from 'vitest';
import {currentJob,useJobStore} from '../stores/job-store';
import {fixturePart} from './test-fixtures';
import {parseJob} from './job';
import {nestJob} from './nest-job';
import {exportSheet} from './export-sheet';

it('saves and restores a nest without rerunning the optimizer',()=>{
  const store=()=>useJobStore.getState();store().clear();store().setName('23778 v1 2026');
  store().addParts([fixturePart()]);store().updateSettings('al7075-3',{widthIn:5,heightIn:4,rotation:'quarter'});
  store().setResults(nestJob(store().parts,store().settings),store().revision);
  const before=exportSheet(store().results[0],0,store().name);
  const json=JSON.stringify(currentJob());store().clear();store().loadJob(parseJob(json));
  expect(exportSheet(store().results[0],0,store().name)).toEqual(before);
  expect(before.filename).toBe('23778 v1 2026.dxf');
  store().updatePart('plate',{quantity:3});expect(store().results).toEqual([]);
});

it('validates saved transforms and still opens old projects without layouts',()=>{
  const job={version:1 as const,name:'Job',parts:[fixturePart()],settings:{}};
  useJobStore.getState().loadJob(parseJob(JSON.stringify(job)));
  expect(useJobStore.getState().results).toEqual([]);
  expect(()=>useJobStore.getState().loadJob({...job,layouts:[{stockId:'al7075-3',placements:[{partId:'plate',sheetIndex:0,x:-10,y:0,rotationDeg:3.84731}]}]})).toThrow('Invalid saved layout');
});

it('saves every sheet in a multi-sheet project',()=>{
  const store=()=>useJobStore.getState();store().clear();store().setName('Three sheets');
  store().addParts([fixturePart({quantity:3})]);
  store().updateSettings('al7075-3',{widthIn:3,heightIn:2,gapIn:.1,marginIn:.25});
  store().setResults(nestJob(store().parts,store().settings),store().revision);
  const saved=parseJob(JSON.stringify(currentJob()));
  expect(saved.layouts?.[0].placements.map(p=>p.sheetIndex)).toEqual([0,1,2]);
  store().clear();store().loadJob(saved);
  expect(store().results[0].nest.sheetsUsed).toBe(3);
  expect(exportSheet(store().results[0],2,store().name).dxf).toContain('CUT-OUTSIDE');
});

it('keeps marked used areas when saving and restoring a job',()=>{
  const store=()=>useJobStore.getState();store().clear();store().addParts([fixturePart({quantity:1})]);
  const blockedAreas=[{x:0,y:0,width:2,height:4}];
  store().updateSettings('al7075-3',{widthIn:5,heightIn:4,gapIn:.1,marginIn:.25,blockedAreas});
  store().setResults(nestJob(store().parts,store().settings),store().revision);
  const saved=parseJob(JSON.stringify(currentJob()));
  store().clear();store().loadJob(saved);
  expect(store().settings['al7075-3'].blockedAreas).toEqual(blockedAreas);
  expect(store().results[0].errors[0]).toEqual([]);
  expect(store().results[0].nest.placements[0].x).toBeGreaterThan(2);
});

it('restores a fully used first sheet followed by fresh stock',()=>{
  const store=()=>useJobStore.getState();store().clear();store().addParts([fixturePart({quantity:1})]);
  store().updateSettings('al7075-3',{widthIn:5,heightIn:4,gapIn:.1,marginIn:.25,blockedAreas:[{x:0,y:0,width:5,height:4}]});
  store().setResults(nestJob(store().parts,store().settings),store().revision);
  expect(store().results[0].nest.placements[0].sheetIndex).toBe(1);
  const saved=parseJob(JSON.stringify(currentJob()));
  store().clear();store().loadJob(saved);
  expect(store().results[0].nest.sheetsUsed).toBe(2);
  expect(store().results[0].nest.placements[0].sheetIndex).toBe(1);
  expect(exportSheet(store().results[0],1).dxf).toContain('CUT-OUTSIDE');
});
