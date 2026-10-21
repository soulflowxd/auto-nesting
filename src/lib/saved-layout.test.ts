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
