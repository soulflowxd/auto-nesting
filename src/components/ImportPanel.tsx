import { useImperativeHandle, useRef, useState, type Ref } from 'react';
import { Upload, FileUp, LoaderCircle, X, CircleAlert } from 'lucide-react';
import { StockSelector, type StockChoice } from './StockSelector';
import { importCad } from '../lib/worker-client';
import { useJobStore } from '../stores/job-store';
import type { UnitOverride } from '../lib/reference/geometry/types';
import type { JobPart } from '../lib/job';
import { STOCKS, dimension } from '../lib/materials';
import { outlineFromAnalysis } from '../lib/reference/nest-outline';
import { outlinePathData } from '../lib/reference/nesting';
import { holeFlags } from '../lib/reference/cut-edges';

type PendingPart = { id:string; name:string; analysis:JobPart['analysis']; quantity:number; choice:StockChoice };
type ImportStatus={name:string;error:string};
const emptyChoice=():StockChoice=>({material:'',thicknessMm:null,color:''});
export type CadImportHandle={upload:(files:File[])=>Promise<void>};
function PendingPreview({part}:{part:PendingPart}) {
  const loops=outlineFromAnalysis(part.analysis)??[];
  const flags=holeFlags(loops);
  const {width,height}=part.analysis.boundingBox;
  const padding=Math.max(width,height)*.08;
  return <div className="pending-part-preview"><div className="pending-preview-art"><svg viewBox={`${-padding} ${-padding} ${width+padding*2} ${height+padding*2}`} role="img" aria-label={`${part.name} cut outline preview`}><g transform={`translate(0 ${height}) scale(1 -1)`}><path d={outlinePathData(loops)} fill="#e6edf8" fillRule="evenodd"/>{loops.map((loop,i)=><path key={i} d={outlinePathData([loop])} fill="none" stroke={flags[i]?'#e25252':'#326de6'} strokeWidth="1.2" vectorEffect="non-scaling-stroke"/>)}</g></svg></div><div><span>PART PREVIEW</span><strong>{dimension(width)} ×<br/>{dimension(height)}</strong></div></div>;
}
export function ImportPanel({busy,onActivity,ref}:{busy:boolean;onActivity:(value:boolean)=>void;ref?:Ref<CadImportHandle>}) {
  const [unit,setUnit]=useState<UnitOverride>('in');
  const [pending,setPending]=useState<PendingPart[]>([]);
  const [statuses,setStatuses]=useState<ImportStatus[]>([]);
  const [active,setActive]=useState('');
  const [drag,setDrag]=useState(false);
  const input=useRef<HTMLInputElement>(null);
  const controller=useRef<AbortController|null>(null);
  useImperativeHandle(ref,()=>({upload}));
  async function upload(files:File[]) {
    if(busy||!files.length)return;
    const control=new AbortController();controller.current=control;
    onActivity(true);setStatuses([]);
    try {
      for(const file of files) {
        if(control.signal.aborted)break;
        setActive(file.name);
        try {
          if(useJobStore.getState().parts.length+pending.length>=100)throw new Error('A job can contain up to 100 unique parts.');
          const analysis=await importCad(file,unit,control.signal);
          if(control.signal.aborted)break;
          setPending(current=>[...current,{id:crypto.randomUUID(),name:file.name,analysis,quantity:1,choice:emptyChoice()}]);
        }catch(error){if(!control.signal.aborted)setStatuses(s=>[...s,{name:file.name,error:error instanceof Error?error.message:'Import failed.'}]);}
      }
    } finally {setActive('');onActivity(false);controller.current=null;if(input.current)input.current.value='';}
  }
  function selectStock(part:PendingPart,choice:StockChoice) {
    const stock=STOCKS.find(s=>s.material===choice.material&&s.thicknessMm===choice.thicknessMm&&s.color===choice.color);
    if(!stock){setPending(current=>current.map(p=>p.id===part.id?{...p,choice}:p));return;}
    const job=useJobStore.getState();
    if(job.parts.length>=100||job.parts.reduce((sum,p)=>sum+p.quantity,0)+part.quantity>500){setStatuses(s=>[...s,{name:part.name,error:'A job can contain up to 100 designs and 500 copies.'}]);return;}
    job.addParts([{id:part.id,name:part.name,analysis:part.analysis,stockId:stock.id,quantity:part.quantity}]);
    setPending(current=>current.filter(p=>p.id!==part.id));
  }
  return <section className="import-panel panel-section">
    <div className="section-heading"><span className="section-icon"><Upload size={16}/></span><h2>Import parts</h2><span className="step-number">01</span></div>
    <p className="section-description">Drop CAD files, then choose material and thickness for each part.</p>
    <input ref={input} className="sr-only" aria-label="Upload CAD files" type="file" multiple accept=".dxf,.step,.stp" disabled={busy} onChange={e=>void upload(Array.from(e.target.files??[]))}/>
    <button className={`drop-zone ${drag?'dragging':''}`} disabled={busy} onClick={()=>input.current?.click()} onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);void upload(Array.from(e.dataTransfer.files));}}>
      {active?<LoaderCircle size={23} className="spin"/>:<FileUp size={25} strokeWidth={1.5}/>}
      <strong>{active?'Reading geometry…':'Drop files or browse'}</strong>
      <span>STEP, STP or DXF · up to 20 MB each</span>
    </button>
    <label className="inline-select">Unitless DXF units<select aria-label="Unitless DXF units" value={unit} disabled={busy} onChange={e=>setUnit(e.target.value as UnitOverride)}><option value="in">Inches (mm shown)</option><option value="mm">Millimeters (in shown)</option></select></label>
    {active&&<div className="processing-row"><span className="truncate">{active}</span><button className="icon-button" title="Cancel import" aria-label="Cancel import" onClick={()=>controller.current?.abort()}><X size={16}/></button></div>}
    {pending.length>0&&<div className="pending-parts"><strong className="pending-heading">Choose stock for imported parts</strong>{pending.map(part=><div className="pending-part" key={part.id}><div className="pending-part-header"><strong title={part.name}>{part.name}</strong><button className="icon-button" aria-label={`Discard ${part.name}`} onClick={()=>setPending(current=>current.filter(p=>p.id!==part.id))}><X size={14}/></button></div><PendingPreview part={part}/><StockSelector value={part.choice} disabled={busy} onChange={choice=>selectStock(part,choice)}/></div>)}</div>}
    {statuses.length>0&&<div className="import-status" aria-live="polite">{statuses.map((s,i)=><div key={i} className="status-error"><CircleAlert size={14}/><span><strong>{s.name}</strong><span>{s.error}</span></span></div>)}</div>}
  </section>;
}
