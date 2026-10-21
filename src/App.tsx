import { useCallback, useRef, useState } from 'react';
import { Boxes, ChevronRight, FolderOpen, Save, Play, LoaderCircle, X, RotateCcw, Cloud, CircleHelp } from 'lucide-react';
import { ImportPanel } from './components/ImportPanel';
import { PartList } from './components/PartList';
import { StockPanel } from './components/StockPanel';
import { SheetPreview } from './components/SheetPreview';
import { CloudProjects } from './components/CloudProjects';
import { currentJob, useJobStore } from './stores/job-store';
import { defaultSettings, getStock } from './lib/materials';
import { runNest } from './lib/worker-client';
import { parseJob } from './lib/job';
import { downloadFile } from './lib/export-sheet';
import { useDialogFocus } from './lib/use-dialog-focus';

export default function App() {
  const {name,setName,parts,settings,results,clear}=useJobStore();
  const [busy,setBusy]=useState<'import'|'nest'|null>(null);
  const [error,setError]=useState('');
  const [active,setActive]=useState('al7075-3');
  const [cloud,setCloud]=useState(false);
  const [help,setHelp]=useState(false);
  const [reset,setReset]=useState(false);
  const closeDialogs=useCallback(()=>{setCloud(false);setHelp(false);setReset(false);},[]);
  useDialogFocus(cloud||help||reset,closeDialogs);
  const controller=useRef<AbortController|null>(null);
  const open=useRef<HTMLInputElement>(null);
  const groups=[...new Set(parts.map(p=>p.stockId))];
  const stockId=groups.includes(active)?active:groups[0]??'al7075-3';
  const sheetSettings=settings[stockId]??defaultSettings(getStock(stockId));
  const group=results.find(g=>g.stockId===stockId);
  async function nest() {
    if(!parts.length||busy)return;
    setBusy('nest');setError('');
    const control=new AbortController();controller.current=control;
    const snapshot=useJobStore.getState();
    try {const next=await runNest(snapshot.parts,snapshot.settings,control.signal);useJobStore.getState().setResults(next,snapshot.revision);}
    catch(e){setError(e instanceof Error?e.message:'Nesting failed.');}
    finally {setBusy(null);controller.current=null;}
  }
  async function openFile(file?:File) {
    if(!file)return;
    try {if(file.size>750*1024)throw new Error('Project exceeds 750 KB.');const job=parseJob(await file.text());useJobStore.getState().loadJob(job);setError('');}
    catch(e){setError(e instanceof Error?e.message:'Project could not be opened.');}
    if(open.current)open.current.value='';
  }
  return <div className="app-shell">
    <header className="app-header"><a className="brand" href="/" aria-label="ITKAN Nest home"><span className="brand-mark"><Boxes size={23} strokeWidth={1.8}/></span><span>ITKAN<span className="brand-light"> Nest</span><small>ROBOTICS FABRICATION</small></span></a><div className="header-divider"/><span className="workspace-breadcrumb">Workspace<ChevronRight size={13}/><span>Sheet nesting</span></span><div className="header-actions"><span className="local-status"><span className="status-dot"/>Local workspace</span><button className="icon-button" title="How it works" aria-label="How it works" onClick={()=>setHelp(true)}><CircleHelp size={18}/></button><button className="secondary-button cloud-trigger" onClick={()=>setCloud(true)} disabled={!!busy}><Cloud size={16}/><span>Cloud projects</span></button></div></header>
    <div className="job-toolbar"><div className="job-name-wrap"><span className="job-name-icon"><FolderOpen size={18}/></span><input className="job-name" aria-label="Job name" value={name} maxLength={120} onChange={e=>setName(e.target.value)}/><span className="job-format">STEP + DXF</span></div><div className="job-actions"><input ref={open} type="file" accept=".json" className="sr-only" aria-label="Open saved job" disabled={!!busy} onChange={e=>void openFile(e.target.files?.[0])}/><button className="text-button" disabled={!!busy} onClick={()=>open.current?.click()}><FolderOpen size={15}/><span>Open job</span></button><button className="text-button" disabled={!!busy||!parts.length||!name.trim()} onClick={()=>downloadFile(`${name.replace(/[^a-zA-Z0-9_-]/g,'-')}.nest.json`,JSON.stringify(currentJob()),'application/json')}><Save size={15}/><span>Save job</span></button><button className="icon-button" aria-label="Start new job" title="Start new job" disabled={!!busy||!parts.length} onClick={()=>setReset(true)}><RotateCcw size={15}/></button><span className="toolbar-divider"/>{busy==='nest'?<button className="primary-button" onClick={()=>controller.current?.abort()}><X size={16}/>Cancel nesting</button>:<button className="primary-button" onClick={()=>void nest()} disabled={!!busy||!parts.length}><Play size={15} fill="currentColor"/>Auto Nest</button>}</div></div>
    {error&&<div className="global-error" role="alert"><span>{error}</span><button aria-label="Dismiss error" className="icon-button" onClick={()=>setError('')}><X size={16}/></button></div>}
    <div className="workspace-grid"><aside className="parts-sidebar"><ImportPanel busy={!!busy} onActivity={isBusy=>setBusy(isBusy?'import':null)}/><PartList disabled={!!busy}/></aside><SheetPreview key={stockId} group={group} settings={sheetSettings} hasParts={parts.some(p=>p.stockId===stockId)} busy={busy==='nest'} onError={setError}/><StockPanel stockId={stockId} onSelect={setActive} disabled={!!busy}/></div>
    <footer className="app-footer"><span>Built for the parts that build your robot.</span><span>{busy?<><LoaderCircle size={12} className="spin"/>{busy==='import'?'Reading CAD geometry':'Calculating layout'}</>:<><span className="status-dot"/>Geometry processed on your device</>}</span><span>FTC / FRC</span></footer>
    {cloud&&<CloudProjects onClose={()=>setCloud(false)}/>}
    {help&&<div className="modal-backdrop" onClick={()=>setHelp(false)}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="help-title" onClick={e=>e.stopPropagation()}><div className="modal-heading"><h2 id="help-title">From CAD to a nested sheet</h2><button className="icon-button" aria-label="Close help" onClick={()=>setHelp(false)}><X size={18}/></button></div><ol className="help-steps"><li>Choose material, thickness and color. Upload one flat part per STEP or DXF file.</li><li>Set quantities and sheet dimensions. Every dimension shows inches and millimeters.</li><li>Auto Nest creates separate sheets for each material, color and thickness.</li><li>Export a DXF for each sheet. Blue contours use outward offsets; red holes use inward offsets in your CAM software.</li></ol><p className="field-hint">STEP supports uniform flat extrusions with through-holes. Bent parts, assemblies and disconnected profiles must be exported as separate flat parts. Nesting uses a contour grid and discrete rotations.</p><p className="field-hint">Save job downloads an editable project file. Cloud projects require a configured Convex deployment and sign-in.</p><a href="/samples/bearing-plate.step" download className="text-button">Download sample STEP ↗</a></section></div>}
    {reset&&<div className="modal-backdrop"><section className="modal small-modal" role="dialog" aria-modal="true" aria-labelledby="reset-title"><h2 id="reset-title">Start a new job?</h2><p>Save the current job first if you want to keep it.</p><div className="modal-actions"><button className="secondary-button" onClick={()=>setReset(false)}>Keep editing</button><button className="primary-button" onClick={()=>{clear();setReset(false);setError('');}}>Start new job</button></div></section></div>}
  </div>;
}
