import { create } from 'zustand';
import type { GroupResult, JobDocument, JobPart } from '../lib/job';
import { defaultSettings, getStock, type SheetSettings } from '../lib/materials';

type JobState = {
  name:string;parts:JobPart[];settings:Record<string,SheetSettings>;results:GroupResult[];revision:number;
  setName:(name:string)=>void;addParts:(parts:JobPart[])=>void;
  updatePart:(id:string,patch:Partial<Pick<JobPart,'quantity'|'stockId'|'name'>>)=>void;
  removePart:(id:string)=>void;updateSettings:(id:string,patch:Partial<SheetSettings>)=>void;
  setResults:(results:GroupResult[],revision:number)=>void;loadJob:(job:JobDocument)=>void;clear:()=>void;
};
function ensureSettings(parts:JobPart[],settings:Record<string,SheetSettings>) {
  const next={...settings};
  for(const p of parts) next[p.stockId]??=defaultSettings(getStock(p.stockId));
  return next;
}
export const useJobStore=create<JobState>((set)=>({
  name:'Untitled job',parts:[],settings:{},results:[],revision:0,
  setName:name=>set({name}),
  addParts:added=>set(s=>({parts:[...s.parts,...added],settings:ensureSettings(added,s.settings),results:[],revision:s.revision+1})),
  updatePart:(id,patch)=>set(s=>{
    const parts=s.parts.map(p=>p.id===id?{...p,...patch}:p);
    const affected=new Set([s.parts.find(p=>p.id===id)?.stockId,patch.stockId]);
    return {parts,settings:ensureSettings(parts,s.settings),results:s.results.filter(g=>!affected.has(g.stockId)),revision:s.revision+1};
  }),
  removePart:id=>set(s=>({parts:s.parts.filter(p=>p.id!==id),results:s.results.filter(g=>g.stockId!==s.parts.find(p=>p.id===id)?.stockId),revision:s.revision+1})),
  updateSettings:(id,patch)=>set(s=>({settings:{...s.settings,[id]:{...(s.settings[id]??defaultSettings(getStock(id))),...patch}},results:s.results.filter(g=>g.stockId!==id),revision:s.revision+1})),
  setResults:(results,revision)=>set(s=>s.revision===revision?{results}:{}),
  loadJob:job=>set(s=>({name:job.name,parts:job.parts,settings:ensureSettings(job.parts,job.settings),results:[],revision:s.revision+1})),
  clear:()=>set(s=>({name:'Untitled job',parts:[],settings:{},results:[],revision:s.revision+1})),
}));
export function currentJob():JobDocument {
  const {name,parts,settings}=useJobStore.getState();
  return {version:1,name,parts,settings};
}
