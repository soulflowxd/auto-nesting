import type { GeometryAnalysis, UnitOverride } from './reference/geometry/types';
import type { GroupResult, JobPart } from './job';
import type { SheetSettings } from './materials';

function runWorker<T>(worker: Worker, message: unknown, signal?: AbortSignal, transfer: Transferable[]=[]): Promise<T> {
  return new Promise((resolve,reject)=>{
    const end=()=>{clearTimeout(timer);signal?.removeEventListener('abort',cancel);worker.terminate();};
    const cancel=()=>{end();reject(new Error('Operation cancelled.'));};
    const timer=setTimeout(()=>{end();reject(new Error('Processing timed out. Try fewer copies or a simpler part.'));},180000);
    signal?.addEventListener('abort',cancel,{once:true});
    if(signal?.aborted) {cancel();return;}
    worker.onmessage=e=>{end();if(e.data.error) reject(new Error(e.data.error));else resolve(e.data.result as T);};
    worker.onerror=e=>{end();reject(new Error(e.message || 'CAD worker failed to start. Reload and try again.'));};
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
  return runWorker(new Worker(new URL('../workers/nest.worker.ts',import.meta.url),{type:'module'}),{parts,settings},signal);
}
