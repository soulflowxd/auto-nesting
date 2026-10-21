import {expect,it} from 'vitest';
import {MAX_PROJECT_BYTES,parseJob} from './job';
import {fixturePart} from './test-fixtures';

it('reopens geometry-heavy local projects larger than the old 750 KB limit',()=>{
  const part=fixturePart();
  part.analysis.loops=[{points:Array.from({length:19000},(_,i)=>({x:1+Math.cos(i/19000*Math.PI*2),y:1+Math.sin(i/19000*Math.PI*2)})),perimeterIn:Math.PI*2}];
  const json=JSON.stringify({version:1,name:'Large local job',parts:[part],settings:{}});
  expect(new TextEncoder().encode(json).length).toBeGreaterThan(750*1024);
  expect(parseJob(json).parts[0].analysis.loops[0].points).toHaveLength(19000);
});

it('still bounds local files before parsing',()=>{
  expect(()=>parseJob(' '.repeat(MAX_PROJECT_BYTES+1))).toThrow('20 MB');
});
