import { useRef, useState } from 'react';
import { Upload, FileUp, FlaskConical, LoaderCircle, X, CircleAlert, Check } from 'lucide-react';
import { StockSelector } from './StockSelector';
import { importCad } from '../lib/worker-client';
import { useJobStore } from '../stores/job-store';
import type { UnitOverride } from '../lib/reference/geometry/types';
import { STOCKS, getStock } from '../lib/materials';

type ImportStatus={name:string;error?:string;done?:boolean};
export function ImportPanel({busy,onActivity}:{busy:boolean;onActivity:(value:boolean)=>void}) {
  const [stockId,setStockId]=useState('al7075-3');
  const [unit,setUnit]=useState<UnitOverride>('in');
  const [autoThickness,setAutoThickness]=useState(false);
  const [statuses,setStatuses]=useState<ImportStatus[]>([]);
  const [active,setActive]=useState('');
  const [drag,setDrag]=useState(false);
  const input=useRef<HTMLInputElement>(null);
  const controller=useRef<AbortController|null>(null);
  async function upload(files:File[],sample=false) {
    if(busy||!files.length)return;
    const control=new AbortController();controller.current=control;
    onActivity(true);setStatuses([]);
    try {
      for(const file of files) {
        if(control.signal.aborted)break;
        setActive(file.name);
        try {
          const current=useJobStore.getState();
          if(current.parts.length>=100)throw new Error('A job can contain up to 100 unique parts.');
          const analysis=await importCad(file,unit,control.signal);
          let assigned=stockId;
          if(autoThickness&&analysis.sourceThicknessMm) {
            const selected=getStock(stockId);
            const match=STOCKS.find(s=>s.material===selected.material&&s.color===selected.color&&Math.abs(s.thicknessMm-analysis.sourceThicknessMm!)<.01);
            if(!match)throw new Error('The STEP thickness does not match this material’s available stock. Select a stock thickness explicitly.');
            assigned=match.id;
          }
          const total=current.parts.reduce((sum,p)=>sum+p.quantity,0);
          const quantity=sample?4:1;
          if(total+quantity>500)throw new Error('A job can contain up to 500 copies.');
          current.addParts([{id:crypto.randomUUID(),name:file.name,stockId:assigned,quantity,analysis}]);
          setStatuses(s=>[...s,{name:file.name,done:true}]);
        }catch(error){setStatuses(s=>[...s,{name:file.name,error:error instanceof Error?error.message:'Import failed.'}]);}
      }
    } finally {setActive('');onActivity(false);controller.current=null;if(input.current)input.current.value='';}
  }
  async function sample() {
    try {
      const names=['bearing-plate.dxf','gusset.dxf'];
      const files=await Promise.all(names.map(async name=>{
        const r=await fetch(`/samples/${name}`);if(!r.ok)throw new Error('Sample files could not be loaded.');
        return new File([await r.blob()],name);
      }));
      await upload(files,true);
    }catch(error){setStatuses([{name:'Sample job',error:error instanceof Error?error.message:'Could not load samples.'}]);}
  }
  return <section className="import-panel panel-section">
    <div className="section-heading"><span className="section-icon"><Upload size={16}/></span><h2>Import parts</h2><span className="step-number">01</span></div>
    <p className="section-description">Choose stock, then drop in your CAD files.</p>
    <StockSelector value={stockId} onChange={setStockId} disabled={busy}/>
    <input ref={input} className="sr-only" aria-label="Upload CAD files" type="file" multiple accept=".dxf,.step,.stp" disabled={busy} onChange={e=>void upload(Array.from(e.target.files??[]))}/>
    <button className={`drop-zone ${drag?'dragging':''}`} disabled={busy} onClick={()=>input.current?.click()} onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);void upload(Array.from(e.dataTransfer.files));}}>
      {active?<LoaderCircle size={23} className="spin"/>:<FileUp size={25} strokeWidth={1.5}/>}
      <strong>{active?'Reading geometry…':'Drop files or browse'}</strong>
      <span>STEP, STP or DXF · up to 20 MB each</span>
    </button>
    <label className="inline-select">Unitless DXF units<select aria-label="Unitless DXF units" value={unit} disabled={busy} onChange={e=>setUnit(e.target.value as UnitOverride)}><option value="in">Inches (mm shown)</option><option value="mm">Millimeters (in shown)</option></select></label>
    <label className="checkbox-label"><input type="checkbox" checked={autoThickness} disabled={busy} onChange={e=>setAutoThickness(e.target.checked)}/>Match STEP thickness to selected material</label>
    <button className="sample-button" onClick={()=>void sample()} disabled={busy}><FlaskConical size={15}/>Try a sample job<span>↗</span></button>
    {active&&<div className="processing-row"><span className="truncate">{active}</span><button className="icon-button" title="Cancel import" aria-label="Cancel import" onClick={()=>controller.current?.abort()}><X size={16}/></button></div>}
    {statuses.length>0&&<div className="import-status" aria-live="polite">{statuses.map((s,i)=><div key={i} className={s.error?'status-error':'status-success'}>{s.error?<CircleAlert size={14}/>:<Check size={14}/>}<span><strong>{s.name}</strong>{s.error&&<span>{s.error}</span>}</span></div>)}</div>}
  </section>;
}
