import type { GeometryAnalysis, UnitOverride } from './reference/geometry/types';
import type { GroupResult, JobPart } from './job';
import type { SheetSettings } from './materials';

function runWorker<T>(worker: Worker, message: unknown, signal?: AbortSignal, transfer: Transferable[]=[], label='CAD'): Promise<T> {
  return new Promise((resolve,reject)=>{
    const end=()=>{signal?.removeEventListener('abort',cancel);worker.terminate();};
    const cancel=()=>{end();reject(new Error('Operation cancelled.'));};
    signal?.addEventListener('abort',cancel,{once:true});
    if(signal?.aborted) {cancel();return;}
    worker.onmessage=e=>{end();if(e.data.error) reject(new Error(e.data.error));else resolve(e.data.result as T);};
    worker.onerror=e=>{end();reject(new Error(e.message || `${label} worker could not load. Save your job, reload the page, then open the saved job and try again.`));};
    worker.postMessage(message,transfer);
  });
}

export async function importCad(file: File, unit: UnitOverride, signal?: AbortSignal): Promise<GeometryAnalysis> {
  if(!/\.(dxf|step|stp)$/i.test(file.name)) throw new Error('Choose a DXF, STEP or STP file.');
  if(!file.size) throw new Error('The file is empty.');
  if(file.size>20*1024*1024) throw new Error('Files must be smaller than 20 MB.');
  const bytes=await file.arrayBuffer();
  return runWorker(new Worker(new URL('../workers/cad.worker.ts',import.meta.url),{type:'module'}),{bytes,filename:file.name,unit},signal,[bytes]);
}
export function runNest(parts: JobPart[],settings: Record<string,SheetSettings>,signal?:AbortSignal):Promise<GroupResult[]> {
  return runWorker(new Worker(new URL('../workers/nest.worker.ts',import.meta.url),{type:'module'}),{parts,settings},signal,[],'Nesting');
}

export async function runServerNest(parts:JobPart[],settings:Record<string,SheetSettings>,signal?:AbortSignal):Promise<GroupResult[]> {
  const body=JSON.stringify({version:1,name:'Server nest',parts,settings});
  if(new TextEncoder().encode(body).length>4_000_000)throw new Error('This job is too large for Vercel server nesting. Use local nesting.');
  const response=await fetch('/api/nest',{method:'POST',headers:{'Content-Type':'application/json'},body,signal,credentials:'same-origin'});
  const data=await response.json();
  if(!response.ok)throw new Error(data.error??'Server nesting failed.');
  return data as GroupResult[];
}
