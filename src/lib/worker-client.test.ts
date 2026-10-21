import { afterEach, expect, it, vi } from 'vitest';
import { importCad, runNest } from './worker-client';

class UnavailableWorker {
  onerror: ((event: {message:string})=>void)|null=null;
  terminate=vi.fn();
  postMessage() { queueMicrotask(()=>this.onerror?.({message:''})); }
}

afterEach(()=>vi.unstubAllGlobals());

it('identifies a nesting startup failure and tells users to save before reloading',async()=>{
  vi.stubGlobal('Worker',UnavailableWorker);
  await expect(runNest([],{})).rejects.toThrow('Nesting worker could not load. Save your job');
});

it('identifies a CAD startup failure',async()=>{
  vi.stubGlobal('Worker',UnavailableWorker);
  const file={name:'part.dxf',size:1,arrayBuffer:async()=>new ArrayBuffer(1)} as File;
  await expect(importCad(file,'in')).rejects.toThrow('CAD worker could not load. Save your job');
});
