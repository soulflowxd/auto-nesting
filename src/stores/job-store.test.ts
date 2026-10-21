import { beforeEach,expect,it } from 'vitest';
import { useJobStore } from './job-store';
import { fixturePart } from '../lib/test-fixtures';
import { nestJob } from '../lib/nest-job';

beforeEach(()=>useJobStore.getState().clear());
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
