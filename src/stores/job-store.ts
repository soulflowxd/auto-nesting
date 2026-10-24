import { create } from 'zustand';
import type { GroupResult, JobDocument, JobPart } from '../lib/job';
import { defaultSettings, getStock, type SheetSettings } from '../lib/materials';
import { restoreLayouts } from '../lib/saved-layout';

type JobState = {
  name:string;parts:JobPart[];settings:Record<string,SheetSettings>;results:GroupResult[];revision:number;
  setName:(name:string)=>void;addParts:(parts:JobPart[])=>void;
  updatePart:(id:string,patch:Partial<Pick<JobPart,'quantity'|'stockId'|'name'>>)=>void;
  removePart:(id:string)=>void;updateSettings:(id:string,patch:Partial<SheetSettings>)=>void;
  markUsedAreas:(id:string,index:number,areas:NonNullable<SheetSettings['blockedAreas']>)=>void;
  addMarkedSheet:(id:string)=>void;
  removeMarkedSheet:(id:string,index:number)=>void;
  setResults:(results:GroupResult[],revision:number)=>void;loadJob:(job:JobDocument)=>void;clear:()=>void;
};
function ensureSettings(parts:JobPart[],settings:Record<string,SheetSettings>) {
  const next:Record<string,SheetSettings>=Object.fromEntries(Object.entries(settings).map(([id,value])=>[id,{...value,rotation:'free' as const}]));
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
    const settings=ensureSettings(parts,s.settings);
    for(const key of affected)if(key&&settings[key])settings[key]={...settings[key],originalSheetCount:undefined};
    return {parts,settings,results:s.results.filter(g=>!affected.has(g.stockId)),revision:s.revision+1};
  }),
  removePart:id=>set(s=>{const stockId=s.parts.find(p=>p.id===id)?.stockId;return {parts:s.parts.filter(p=>p.id!==id),settings:stockId&&s.settings[stockId]?{...s.settings,[stockId]:{...s.settings[stockId],originalSheetCount:undefined}}:s.settings,results:s.results.filter(g=>g.stockId!==stockId),revision:s.revision+1};}),
  updateSettings:(id,patch)=>set(s=>({settings:{...s.settings,[id]:{...(s.settings[id]??defaultSettings(getStock(id))),...patch,originalSheetCount:undefined,rotation:'free'}},results:s.results.filter(g=>g.stockId!==id),revision:s.revision+1})),
  markUsedAreas:(id,index,areas)=>set(s=>{
    const previous=s.settings[id]??defaultSettings(getStock(id));
    const baseline=previous.originalSheetCount??s.results.find(g=>g.stockId===id)?.nest.sheetsUsed;
    const blockedAreasBySheet={...previous.blockedAreasBySheet,[index]:areas};
    return {settings:{...s.settings,[id]:{...previous,blockedAreasBySheet,originalSheetCount:baseline,markedSheetCount:Math.max(previous.markedSheetCount??0,index+1)}},results:s.results.filter(g=>g.stockId!==id),revision:s.revision+1};
  }),
  addMarkedSheet:id=>set(s=>{const previous=s.settings[id]??defaultSettings(getStock(id));const baseline=previous.originalSheetCount??s.results.find(g=>g.stockId===id)?.nest.sheetsUsed;return {settings:{...s.settings,[id]:{...previous,markedSheetCount:Math.max(previous.markedSheetCount??0,baseline??0,1)+1,originalSheetCount:baseline}},results:s.results.filter(g=>g.stockId!==id),revision:s.revision+1};}),
  removeMarkedSheet:(id,index)=>set(s=>{
    const previous=s.settings[id];
    const baseline=previous?.originalSheetCount??1;
    const count=previous?.markedSheetCount??0;
    if(!previous||index<baseline||index>=count)return s;
    const blockedAreasBySheet:NonNullable<SheetSettings['blockedAreasBySheet']>={};
    for(const [key,areas] of Object.entries(previous.blockedAreasBySheet??{})){
      const sheet=Number(key);
      if(sheet<index)blockedAreasBySheet[key]=areas;
      else if(sheet>index)blockedAreasBySheet[String(sheet-1)]=areas;
    }
    return {settings:{...s.settings,[id]:{...previous,markedSheetCount:count-1,blockedAreasBySheet}},results:s.results.filter(g=>g.stockId!==id),revision:s.revision+1};
  }),
  setResults:(results,revision)=>set(s=>s.revision===revision?{results}:{}),
  loadJob:job=>{const settings=ensureSettings(job.parts,job.settings);const results=restoreLayouts({...job,settings});set(s=>({name:job.name,parts:job.parts,settings,results,revision:s.revision+1}));},
  clear:()=>set(s=>({name:'Untitled job',parts:[],settings:{},results:[],revision:s.revision+1})),
}));
export function currentJob():JobDocument {
  const {name,parts,settings,results}=useJobStore.getState();
  const layouts=results.map(g=>({stockId:g.stockId,sheetsUsed:g.nest.sheetsUsed,placements:g.nest.placements.map(({partId,sheetIndex,x,y,rotationDeg})=>({partId,sheetIndex,x,y,rotationDeg}))}));
  return {version:1,name,parts,settings,layouts};
}
