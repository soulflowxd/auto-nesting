import { beforeEach,expect,it } from 'vitest';
import { currentJob, useJobStore } from './job-store';
import { fixturePart } from '../lib/test-fixtures';
import { nestJob } from '../lib/nest-job';

beforeEach(()=>useJobStore.getState().clear());
it('defaults new stock to 1.5 mm spacing and edge margin',()=>{
  useJobStore.getState().addParts([fixturePart()]);
  const settings=useJobStore.getState().settings['al7075-3'];
  expect(settings.gapIn).toBeCloseTo(1.5/25.4);
  expect(settings.marginIn).toBeCloseTo(1.5/25.4);
});
it('uses free rotation when opening older projects and editing settings',()=>{
  useJobStore.getState().loadJob({version:1,name:'Older job',parts:[fixturePart()],settings:{'al7075-3':{widthIn:5,heightIn:4,gapIn:.1,marginIn:.25,rotation:'fixed'}}});
  expect(useJobStore.getState().settings['al7075-3'].rotation).toBe('free');
  useJobStore.getState().updateSettings('al7075-3',{rotation:'quarter'});
  expect(useJobStore.getState().settings['al7075-3'].rotation).toBe('free');
});
it('invalidates stale placements on quantity, stock and sheet edits',()=>{
  const s=()=>useJobStore.getState();
  s().addParts([fixturePart()]);
  s().setResults(nestJob(s().parts,{'al7075-3':{widthIn:5,heightIn:4,gapIn:.1,marginIn:.25,rotation:'quarter'}}),s().revision);
  expect(s().results).toHaveLength(1);
  const revision=s().revision;
  const stale=s().results;
  s().updatePart('plate',{quantity:3});
  expect(s().results).toHaveLength(0);
  s().setResults(stale,revision);
  expect(s().results).toHaveLength(0);
  s().updatePart('plate',{stockId:'al7075-6'});
  expect(s().settings['al7075-6']).toBeDefined();
  s().updateSettings('al7075-6',{gapIn:.2});
  expect(s().results).toHaveLength(0);
});
it('removes an added sheet and shifts later used areas in saved projects',()=>{
  const s=()=>useJobStore.getState();
  s().addParts([fixturePart()]);
  s().addMarkedSheet('al7075-3');
  s().addMarkedSheet('al7075-3');
  const second={x:1,y:1,width:1,height:1};
  const third={x:2,y:2,width:1,height:1};
  s().markUsedAreas('al7075-3',1,[second]);
  s().markUsedAreas('al7075-3',2,[third]);
  s().removeMarkedSheet('al7075-3',0);
  expect(s().settings['al7075-3'].markedSheetCount).toBe(3);
  s().removeMarkedSheet('al7075-3',1);
  expect(s().settings['al7075-3'].markedSheetCount).toBe(2);
  expect(s().settings['al7075-3'].blockedAreasBySheet).toEqual({'1':[third]});
  expect(currentJob().settings['al7075-3'].blockedAreasBySheet?.['1']).toEqual([third]);
});
