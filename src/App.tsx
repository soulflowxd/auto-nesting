import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronRight, FolderOpen, Save, Play, LoaderCircle, X, RotateCcw, CircleHelp, Download } from 'lucide-react';
import { ImportPanel, type CadImportHandle } from './components/ImportPanel';
import { PartList } from './components/PartList';
import { StockPanel } from './components/StockPanel';
import { SheetPreview } from './components/SheetPreview';
import { currentJob, useJobStore } from './stores/job-store';
import { defaultSettings, getStock } from './lib/materials';
import { runNest, runServerNest } from './lib/worker-client';
import { parseJob, MAX_PROJECT_BYTES } from './lib/job';
import { downloadFile, exportSheet } from './lib/export-sheet';
import { useDialogFocus } from './lib/use-dialog-focus';

export default function App() {
  const {name,setName,parts,settings,results,clear}=useJobStore();
  const [busy,setBusy]=useState<'import'|'nest'|null>(null);
  const [error,setError]=useState('');
  const [draggingFiles,setDraggingFiles]=useState(false);
  const dragDepth=useRef(0);
  const [active,setActive]=useState('srpp-3-black');
  const [sheetIndices,setSheetIndices]=useState<Record<string,number>>({});
  const [help,setHelp]=useState(false);
  const [reset,setReset]=useState(false);
  const [admin,setAdmin]=useState(false);
  const [adminAvailable,setAdminAvailable]=useState(false);
  const [nestMode,setNestMode]=useState<'local'|'server'>('local');
  useEffect(()=>{if(!import.meta.env.PROD)return;const refresh=()=>{void fetch('/api/auth/session').then(response=>response.ok?response.json():null).then(data=>{setAdmin(!!data?.admin);setAdminAvailable(!!data?.configured);}).catch(()=>{});};refresh();window.addEventListener('focus',refresh);return()=>window.removeEventListener('focus',refresh);},[]);
  const closeDialogs=useCallback(()=>{setHelp(false);setReset(false);},[]);
  useDialogFocus(help||reset,closeDialogs);
  const controller=useRef<AbortController|null>(null);
  const open=useRef<HTMLInputElement>(null);
  const cadImport=useRef<CadImportHandle>(null);
  const groups=[...new Set(parts.map(p=>p.stockId))];
  const stockId=groups.includes(active)?active:groups[0]??'srpp-3-black';
  const sheetSettings=settings[stockId]??defaultSettings(getStock(stockId));
  const group=results.find(g=>g.stockId===stockId);
  const previewSheets=group?group.nest.sheetsUsed:Math.max(sheetSettings.originalSheetCount??0,sheetSettings.markedSheetCount??0,parts.some(p=>p.stockId===stockId)?1:0);
  const sheetIndex=Math.min(sheetIndices[stockId]??0,Math.max(0,previewSheets-1));
  const canExport=!!group&&group.nest.placements.some(p=>p.sheetIndex===sheetIndex)&&!(group.errors[sheetIndex]?.length);
  function exportCurrentSheet() {
    if(!group)return;
    try {const file=exportSheet(group,sheetIndex,name);downloadFile(file.filename,file.dxf);}
    catch(e){setError(e instanceof Error?e.message:'Export failed.');}
  }
  async function nest() {
    if(!parts.length||busy)return;
    setBusy('nest');setError('');
    const control=new AbortController();controller.current=control;
    const snapshot=useJobStore.getState();
    try {const next=await (nestMode==='server'&&admin?runServerNest(snapshot.parts,snapshot.settings,control.signal):runNest(snapshot.parts,snapshot.settings,control.signal));useJobStore.getState().setResults(next,snapshot.revision);}
    catch(e){setError(e instanceof Error?e.message:'Nesting failed.');}
    finally {setBusy(null);controller.current=null;}
  }
  async function openFile(file?:File) {
    if(!file||busy)return;
    setBusy('import');
    try {if(file.size>MAX_PROJECT_BYTES)throw new Error('Project exceeds 20 MB.');const job=parseJob(await file.text());useJobStore.getState().loadJob(job);setError('');}
    catch(e){setError(e instanceof Error?e.message:'Project could not be opened.');}
    if(open.current)open.current.value='';
    setBusy(null);
  }
  return <div className="app-shell"
    onDragEnterCapture={e=>{if(e.dataTransfer.types.includes('Files')){dragDepth.current++;setDraggingFiles(true);}}}
    onDragLeaveCapture={()=>{dragDepth.current=Math.max(0,dragDepth.current-1);if(!dragDepth.current)setDraggingFiles(false);}}
    onDragOver={e=>{if(e.dataTransfer.types.includes('Files'))e.preventDefault();}}
    onDrop={e=>{if(e.dataTransfer.types.includes('Files'))e.preventDefault();}}
    onDropCapture={e=>{
      dragDepth.current=0;setDraggingFiles(false);
      const files=Array.from(e.dataTransfer.files);
      e.preventDefault();e.stopPropagation();
      if(busy||!files.length)return;
      if(files.some(file=>/\.json$/i.test(file.name))){
        if(files.length!==1){setError('Drop one project JSON by itself, or drop STEP/DXF files together.');return;}
        void openFile(files[0]);
      }else if(files.every(file=>/\.(step|stp|dxf)$/i.test(file.name))){
        setError('');void cadImport.current?.upload(files);
      }else setError('Drop STEP, STP or DXF parts, or a project JSON.');
    }}>
    {draggingFiles&&!busy&&<div className="project-drop-overlay" role="status"><FolderOpen size={32}/><strong>Drop STEP, DXF or project JSON</strong><span>Choose material and thickness after CAD import</span><small>A project JSON restores its saved nest and replaces the current job</small></div>}
    <header className="app-header"><a className="brand" href="/" aria-label="ITKAN Nest home"><img className="brand-logo" src="/brand/itkan-mark-black.png" width="40" height="40" alt=""/><span className="brand-lockup"><span className="brand-wordmark">ITKAN</span><span className="brand-light"> Nest</span><small>ROBOTICS FABRICATION</small></span></a><div className="header-divider"/><span className="workspace-breadcrumb">Workspace<ChevronRight size={13}/><span>Sheet nesting</span></span><div className="header-actions"><span className="local-status"><span className="status-dot"/>{nestMode==='server'&&admin?'Admin server mode':'Local workspace'}</span>{adminAvailable&&(admin?<button className="text-button" onClick={()=>{void fetch('/api/auth/logout',{method:'POST'}).then(()=>{setAdmin(false);setNestMode('local');});}}>Admin sign out</button>:<a className="text-button" href="/api/auth/start" target="_blank" rel="noopener noreferrer" title="Sign in with Vercel in a new tab, then return here">Admin sign in</a>)}<button className="icon-button" title="How it works" aria-label="How it works" onClick={()=>setHelp(true)}><CircleHelp size={18}/></button></div></header>
    <div className="job-toolbar"><div className="job-name-wrap"><span className="job-name-icon"><FolderOpen size={18}/></span><input className="job-name" aria-label="Job name" value={name} maxLength={120} onChange={e=>setName(e.target.value)}/><span className="job-format">STEP + DXF</span></div><div className="job-actions"><input ref={open} type="file" accept=".json" className="sr-only" aria-label="Open saved job" disabled={!!busy} onChange={e=>void openFile(e.target.files?.[0])}/><button className="text-button" disabled={!!busy} title="Open a project JSON, or drag it anywhere onto the workspace" onClick={()=>open.current?.click()}><FolderOpen size={15}/><span>Open job</span></button><button className="text-button" disabled={!!busy||!parts.length||!name.trim()} onClick={()=>downloadFile(`${name.replace(/[^a-zA-Z0-9_-]/g,'-')}.nest.json`,JSON.stringify(currentJob()),'application/json')}><Save size={15}/><span>Save job</span></button><button className="icon-button" aria-label="Start new job" title="Start new job" disabled={!!busy||!parts.length} onClick={()=>setReset(true)}><RotateCcw size={15}/></button><span className="toolbar-divider"/>{admin&&<select aria-label="Nesting computer" value={nestMode} disabled={!!busy} onChange={e=>setNestMode(e.target.value as 'local'|'server')}><option value="local">This device</option><option value="server">Vercel server</option></select>}<button className="secondary-button" disabled={!!busy||!canExport} title="Export the selected sheet as DXF" onClick={exportCurrentSheet}><Download size={15}/>Export DXF</button>{busy==='nest'?<button className="primary-button" onClick={()=>controller.current?.abort()}><X size={16}/>Cancel nesting</button>:<button className="primary-button" onClick={()=>void nest()} disabled={!!busy||!parts.length}><Play size={15} fill="currentColor"/>Auto Nest</button>}</div></div>
    {error&&<div className="global-error" role="alert"><span>{error}</span><button aria-label="Dismiss error" className="icon-button" onClick={()=>setError('')}><X size={16}/></button></div>}
    <div className="workspace-grid"><aside className="parts-sidebar"><ImportPanel ref={cadImport} busy={!!busy} onActivity={isBusy=>setBusy(isBusy?'import':null)}/><PartList disabled={!!busy}/></aside><SheetPreview key={stockId} index={sheetIndex} onIndexChange={index=>setSheetIndices(s=>({...s,[stockId]:index}))} group={group} settings={sheetSettings} hasParts={parts.some(p=>p.stockId===stockId)} busy={busy==='nest'} onBlockedAreasChange={(index,blockedAreas)=>useJobStore.getState().markUsedAreas(stockId,index,blockedAreas)} onAddSheet={()=>useJobStore.getState().addMarkedSheet(stockId)}/><StockPanel stockId={stockId} onSelect={setActive} disabled={!!busy}/></div>
    <footer className="app-footer"><span>Built for the parts that build your robot.</span><span>{busy?<><LoaderCircle size={12} className="spin"/>{busy==='import'?'Reading CAD geometry':'Calculating layout'}</>:<><span className="status-dot"/>Geometry processed on your device</>}</span><span>FTC / FRC</span></footer>
    {help&&<div className="modal-backdrop" onClick={()=>setHelp(false)}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="help-title" onClick={e=>e.stopPropagation()}><div className="modal-heading"><h2 id="help-title">From CAD to a nested sheet</h2><button className="icon-button" aria-label="Close help" onClick={()=>setHelp(false)}><X size={18}/></button></div><ol className="help-steps"><li>Upload one flat part per STEP or DXF file, then choose its material, thickness and color.</li><li>Set quantities and sheet dimensions. Every dimension shows inches and millimeters.</li><li>Run Auto Nest once to see the original sheet count. Then select any sheet, mark its used areas, and re-nest to compare counts. Add another sheet with + Sheet.</li><li>Auto Nest creates separate sheets for each material, color and thickness.</li><li>Use the sheet controls in the preview to switch sheets, and the material group selector in Sheet setup to switch materials. Export a DXF for each sheet. Blue contours use outward offsets; red holes use inward offsets in your CAM software.</li></ol><p className="field-hint">STEP supports uniform flat extrusions with through-holes. Bent parts, assemblies and disconnected profiles must be exported as separate flat parts. Nesting uses a contour grid with automatic free rotation.</p><p className="field-hint">Save job downloads an editable JSON project to your device. Open job restores it. Export DXF downloads the selected sheet for your cutting software. No files or jobs are stored on a server.</p><a href="/samples/bearing-plate.step" download className="text-button">Download sample STEP ↗</a></section></div>}
    {reset&&<div className="modal-backdrop"><section className="modal small-modal" role="dialog" aria-modal="true" aria-labelledby="reset-title"><h2 id="reset-title">Start a new job?</h2><p>Save the current job first if you want to keep it.</p><div className="modal-actions"><button className="secondary-button" onClick={()=>setReset(false)}>Keep editing</button><button className="primary-button" onClick={()=>{clear();setReset(false);setError('');}}>Start new job</button></div></section></div>}
  </div>;
}
