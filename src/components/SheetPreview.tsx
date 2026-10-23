import { useId, useState, type PointerEvent } from 'react';
import { Maximize, Minus, Plus, LayoutDashboard, ArrowUpLeft, CircleAlert, CheckCircle2, ChevronLeft, ChevronRight, Pencil, Undo2 } from 'lucide-react';
import type { GroupResult } from '../lib/job';
import { dimension, getStock, number, srppTextureUrl, usedAreas, type SheetSettings } from '../lib/materials';
import { MaterialPattern } from './MaterialPattern';
import { holeFlags } from '../lib/reference/cut-edges';
import { outlinePathData, outlineTransform, placementCentre } from '../lib/reference/nesting';
import { polygonArea } from '../lib/validate-sheet';

type UsedArea={x:number;y:number;width:number;height:number};
export function SheetPreview({group,settings,hasParts,busy,index,onIndexChange,onBlockedAreasChange,onAddSheet}:{group?:GroupResult;settings:SheetSettings;hasParts:boolean;busy:boolean;index:number;onIndexChange:(index:number)=>void;onBlockedAreasChange:(index:number,areas:UsedArea[])=>void;onAddSheet:()=>void}) {
  const patternId=`sheet-material-${useId().replace(/[^a-zA-Z0-9_-]/g,'')}`;
  const [zoom,setZoom]=useState(1);
  const [selected,setSelected]=useState<number|null>(null);
  const [drawing,setDrawing]=useState(false);
  const [draft,setDraft]=useState<{start:{x:number;y:number};end:{x:number;y:number}}|null>(null);
  const sheets=group?group.nest.sheetsUsed:Math.max(settings.originalSheetCount??0,settings.markedSheetCount??0,hasParts?1:0);
  const currentIndex=Math.min(index,Math.max(0,sheets-1));
  const placements=group?.nest.placements.filter(p=>p.sheetIndex===currentIndex)??[];
  const errors=group?.errors[currentIndex]??[];
  const materialArea=placements.reduce((sum,p)=>{
    const flags=holeFlags(p.outline);
    return sum+p.outline.reduce((a,l,i)=>a+polygonArea(l)*(flags[i]?-1:1),0);
  },0);
  const utilization=materialArea/(settings.widthIn*settings.heightIn)*100;
  const changeSheet=(next:number)=>{if(next>=0&&next<sheets){onIndexChange(next);setSelected(null);setDrawing(false);setDraft(null);}};
  const w=settings.widthIn>0?settings.widthIn:27.5591,h=settings.heightIn>0?settings.heightIn:27.5591;
  const pad=Math.max(w,h)*.095;
  const textSize=Math.max(w,h)*.022;
  const stock=group?getStock(group.stockId):null;
  const textured=stock!==null&&srppTextureUrl(stock)!==null;
  const darkTexture=textured&&stock.color==='Black';
  const blockedAreas=usedAreas(settings,currentIndex);
  const pointOnSheet=(e:PointerEvent<SVGSVGElement>)=>{
    const matrix=e.currentTarget.getScreenCTM()?.inverse();
    if(!matrix)return null;
    const point=new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix);
    return {x:Math.max(0,Math.min(w,point.x)),y:Math.max(0,Math.min(h,h-point.y))};
  };
  const draftArea=draft?{x:Math.min(draft.start.x,draft.end.x),y:Math.min(draft.start.y,draft.end.y),width:Math.abs(draft.end.x-draft.start.x),height:Math.abs(draft.end.y-draft.start.y)}:null;
  const finishDrawing=(e:PointerEvent<SVGSVGElement>)=>{
    if(!draft)return;
    const end=pointOnSheet(e)??draft.end;
    const area={x:Math.min(draft.start.x,end.x),y:Math.min(draft.start.y,end.y),width:Math.abs(end.x-draft.start.x),height:Math.abs(end.y-draft.start.y)};
    setDraft(null);
    if(area.width>=.04&&area.height>=.04&&blockedAreas.length<32)onBlockedAreasChange(currentIndex,[...blockedAreas,area]);
  };
  return <main className="preview-panel">
    <div className="preview-heading"><div><span className="eyebrow">NESTING WORKSPACE</span><h1>Sheet preview</h1></div><span className={`result-status ${group&&!errors.length?'ready':''}`}>{group&&!errors.length?<CheckCircle2 size={13}/>:<span className="status-dot"/>}{busy?'Processing':group?'Layout ready':hasParts?'Ready to nest':'Waiting for parts'}</span></div>
    <div className="preview-footer"><div className="preview-legend"><span><i className="legend-dot outside"/>Outside cuts</span><span><i className="legend-dot holes"/>Holes / inside cuts</span></div><span>{stock?`${stock.material} · ${stock.color}`:'Preview matches exported cut paths'}</span></div>
    <div className="nest-summary"><div><span>PARTS ON SHEET</span><strong>{placements.length.toString().padStart(2,'0')}<small>parts</small></strong></div><div><span>MATERIAL UTILIZATION</span><strong>{number(Number.isFinite(utilization)?utilization:0,1)}<small>%</small></strong></div><div className="sheet-summary"><span>VIEW SHEETS</span><div className="sheet-stepper"><button type="button" aria-label="Previous sheet" title="Previous sheet" disabled={currentIndex===0||sheets===0} onClick={()=>changeSheet(currentIndex-1)}><ChevronLeft size={16}/></button><strong aria-live="polite"><small>Sheet </small>{sheets?currentIndex+1:0}/{sheets}</strong><button type="button" aria-label="Next sheet" title="Next sheet" disabled={currentIndex>=sheets-1} onClick={()=>changeSheet(currentIndex+1)}><ChevronRight size={16}/></button></div></div></div>
    <div className="sheet-toolbar"><div className="sheet-tabs" aria-label="Sheets">{sheets?Array.from({length:sheets},(_,i)=><button key={i} className={currentIndex===i?'active':''} onClick={()=>changeSheet(i)}>Sheet {String(i+1).padStart(2,'0')}</button>):<span className="sheet-placeholder">Sheet 01</span>}{hasParts&&sheets<500&&<button type="button" onClick={()=>{onAddSheet();onIndexChange(sheets);setDrawing(false);}} title="Add a physical sheet to mark">+ Sheet</button>}</div><div className="zoom-controls"><button aria-label="Zoom out" title="Zoom out" onClick={()=>setZoom(z=>Math.max(.5,z-.25))}><Minus size={15}/></button><span>{Math.round(zoom*100)}%</span><button aria-label="Zoom in" title="Zoom in" onClick={()=>setZoom(z=>Math.min(3,z+.25))}><Plus size={15}/></button><button aria-label="Fit sheet" title="Fit sheet" onClick={()=>setZoom(1)}><Maximize size={15}/></button></div></div>
    <div className="used-area-toolbar"><button type="button" className={`used-area-draw ${drawing?'active':''}`} aria-pressed={drawing} disabled={busy||!hasParts||blockedAreas.length>=32} onClick={()=>{setDrawing(value=>!value);setDraft(null);}}><Pencil size={13}/>{drawing?'Done marking':'Mark used area'}</button>{blockedAreas.length>0&&<><span>{blockedAreas.length} used {blockedAreas.length===1?'area':'areas'} on sheet {currentIndex+1}</span><button type="button" disabled={busy} onClick={()=>onBlockedAreasChange(currentIndex,blockedAreas.slice(0,-1))}><Undo2 size={13}/>Undo last</button><button type="button" disabled={busy} onClick={()=>onBlockedAreasChange(currentIndex,[])}>Clear</button></>}{drawing&&<span className="used-area-hint">Drag on this sheet, then re-nest.</span>}{settings.originalSheetCount!==undefined&&<span className="sheet-comparison">Before used areas: {settings.originalSheetCount} {settings.originalSheetCount===1?'sheet':'sheets'} · {group?`Now: ${group.nest.sheetsUsed}`:'Re-nest to compare'}</span>}</div>
    <div className="sheet-viewport">
      {!placements.length&&!drawing&&!blockedAreas.length?<div className="preview-empty"><div className="empty-sheet-icon"><LayoutDashboard size={39} strokeWidth={1}/></div><h2>{busy?'Finding a home for every part…':hasParts?'Your next cut starts here.':'A clean sheet. A better fit.'}</h2><p>{busy?'You can cancel while the layout is being calculated.':hasParts?'Click Mark used area to reserve stock, then Auto Nest.':'Import your STEP or DXF files to arrange parts on a sheet.'}</p>{!hasParts&&<span className="empty-point"><ArrowUpLeft size={16}/>Start with your material and CAD files</span>}<span className="empty-sheet-size">{dimension(w)} × {dimension(h)}</span></div>:<div className="svg-scroll" style={{width:`${zoom*100}%`,minHeight:`${zoom*100}%`}}><svg className="sheet-svg" viewBox={`${-pad} ${-pad} ${w+pad*2} ${h+pad*2}`} role="img" aria-label={`Sheet ${currentIndex+1}, ${placements.length} parts, ${number(utilization,1)} percent material utilization`} onPointerDown={e=>{if(!drawing||busy)return;const start=pointOnSheet(e);if(!start)return;e.currentTarget.setPointerCapture(e.pointerId);setDraft({start,end:start});}} onPointerMove={e=>{if(!draft)return;const end=pointOnSheet(e);if(end)setDraft({...draft,end});}} onPointerUp={finishDrawing} onPointerCancel={()=>setDraft(null)}>
        <defs><pattern id="sheet-grid" width={w/20} height={w/20} patternUnits="userSpaceOnUse"><path d={`M ${w/20} 0 L 0 0 0 ${w/20}`} fill="none" stroke="#edf0f4" strokeWidth={w*.0006}/></pattern><filter id="sheet-shadow" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="0" dy={w*.008} stdDeviation={w*.012} floodColor="#1c344a" floodOpacity=".09"/></filter></defs>
        {stock&&<defs><MaterialPattern id={patternId} stock={stock} size={2}/></defs>}
        <rect width={w} height={h} fill="white" stroke="#cbd2da" strokeWidth={w*.001} filter="url(#sheet-shadow)"/>
        <rect width={w} height={h} fill="url(#sheet-grid)"/>
        <rect x={settings.marginIn} y={settings.marginIn} width={Math.max(0,w-settings.marginIn*2)} height={Math.max(0,h-settings.marginIn*2)} fill="none" stroke="#d2d8e2" strokeDasharray={`${w*.006} ${w*.006}`} strokeWidth={w*.0007}/>
        <line x1={0} y1={-pad*.38} x2={w} y2={-pad*.38} stroke="#b3bdc8" strokeWidth={w*.001}/>
        <text x={w/2} y={-pad*.5} textAnchor="middle" fill="#6a7787" fontSize={textSize*.8}>{dimension(w)}</text>
        <text transform={`translate(${-pad*.42} ${h/2}) rotate(-90)`} textAnchor="middle" fill="#6a7787" fontSize={textSize*.8}>{dimension(h)}</text>
        {placements.map((p,i)=>{
          const flags=holeFlags(p.outline);
          const centre=placementCentre(p,h);
          return <g key={`${p.partId}-${i}`} onClick={()=>setSelected(selected===i?null:i)} className="placed-part"><title>{p.label} · {number(p.rotationDeg,5)}°</title><g transform={outlineTransform(p,h)}><path d={outlinePathData(p.outline)} fill={textured?`url(#${patternId})`:selected===i?'#dce8f7':'#e5edf9'} fillRule="evenodd" stroke="none"/>{textured&&selected===i&&<path d={outlinePathData(p.outline)} fill="#4779b8" fillOpacity={.2} fillRule="evenodd" pointerEvents="none"/>}{p.outline.map((loop,j)=><path key={j} d={outlinePathData([loop])} fill="none" stroke={flags[j]?'#e34b4b':'#2d64e4'} strokeWidth={selected===i?2:1.35} vectorEffect="non-scaling-stroke"/>)}</g><text x={centre.x} y={centre.y} textAnchor="middle" dominantBaseline="central" fill={darkTexture?'#f1f5f9':'#425671'} paintOrder="stroke" stroke={darkTexture?'#111318':'#ffffff'} strokeWidth={textSize*.12} fontSize={Math.min(textSize*.75,p.width*.15,p.height*.25)} pointerEvents="none">{String(i+1).padStart(2,'0')}</text></g>;
        })}
        {blockedAreas.map((area,i)=><rect key={i} className="used-area-shape" x={area.x} y={h-area.y-area.height} width={area.width} height={area.height}><title>Used area {i+1}</title></rect>)}
        {drawing&&draftArea&&<rect className="used-area-draft" x={draftArea.x} y={h-draftArea.y-draftArea.height} width={draftArea.width} height={draftArea.height}/>}
        {drawing&&<rect className="used-area-pointer" x={0} y={0} width={w} height={h}/>}
        <path d={`M 0 ${h-pad*.12} V ${h} H ${pad*.12}`} fill="none" stroke="#657487" strokeWidth={w*.002}/>
        <text x={0} y={h+pad*.35} fill="#7a8796" fontSize={textSize*.65}>ORIGIN · 0, 0</text>
      </svg></div>}
    </div>
    {selected!==null&&placements[selected]&&<div className="selection-detail"><strong>{placements[selected].label}</strong><span>{dimension(placements[selected].width)} × {dimension(placements[selected].height)} · {number(placements[selected].rotationDeg,5)}°</span></div>}
    {group?.nest.unplaced.length!==undefined&&group.nest.unplaced.length>0&&<div className="unplaced-banner" role="status"><CircleAlert size={16}/><span><strong>{group.nest.unplaced.length} copies could not fit.</strong> Increase the sheet size or change the allowed rotations. {Array.from(new Set(group.nest.unplaced.map(p=>p.label))).join(', ')}</span></div>}
    {errors.length>0&&<div className="error-message" role="alert">Export blocked: {errors.join(' ')}</div>}

  </main>;
}
