import { Ruler, RotateCw, MoveHorizontal, Scan, Info } from 'lucide-react';
import { useJobStore } from '../stores/job-store';
import { defaultSettings, dimension, getStock, inToMm, number, settingsErrors, thicknessLabel, type SheetSettings } from '../lib/materials';
import { useState } from 'react';

function DimensionField({label,value,onChange,disabled}:{label:string;value:number;onChange:(n:number)=>void;disabled:boolean}) {
  const [editing,setEditing]=useState<string|null>(null);
  return <label className="dimension-field">{label}<div className="input-unit"><input aria-label={label} inputMode="decimal" type="number" step="any" min="0" value={editing??String(Number(value.toFixed(4)))} disabled={disabled} onFocus={()=>setEditing(String(Number(value.toFixed(6))))} onChange={e=>{setEditing(e.target.value);onChange(Number(e.target.value));}} onBlur={()=>setEditing(null)}/><span>in</span></div><span className="field-hint">{number(inToMm(value),3)} mm</span></label>;
}
export function StockPanel({stockId,onSelect,disabled}:{stockId:string;onSelect:(id:string)=>void;disabled:boolean}) {
  const {parts,settings,updateSettings}=useJobStore();
  const groups=[...new Set(parts.map(p=>p.stockId))];
  const stock=getStock(stockId);
  const s=settings[stockId]??defaultSettings(stock);
  const update=(patch:Partial<SheetSettings>)=>updateSettings(stockId,patch);
  const errors=settingsErrors(s);
  return <aside className="stock-panel">
    <div className="panel-section"><div className="section-heading"><span className="section-icon"><Ruler size={16}/></span><h2>Sheet setup</h2><span className="step-number">02</span></div>
      <p className="section-description">One material and thickness per sheet.</p>
      {groups.length>1&&<label>Material group<select aria-label="Active material group" value={stockId} onChange={e=>onSelect(e.target.value)}>{groups.map(id=><option value={id} key={id}>{getStock(id).material} · {thicknessLabel(getStock(id).thicknessMm)} · {getStock(id).color}</option>)}</select></label>}
      <div className="stock-summary"><span className={`material-swatch ${stock.color.toLowerCase()}`}/><div><strong>{stock.material}</strong><p>{thicknessLabel(stock.thicknessMm)} · {stock.color}</p></div><span className="stock-vendor">SWYFT</span></div>
      <label>Sheet size<select aria-label="Sheet size preset" disabled={disabled} value={Math.abs(s.widthIn-stock.widthMm/25.4)<1e-8&&Math.abs(s.heightIn-stock.heightMm/25.4)<1e-8?'stock':'custom'} onChange={e=>{if(e.target.value==='stock')update({widthIn:stock.widthMm/25.4,heightIn:stock.heightMm/25.4});}}><option value="stock">SWYFT stock · {number(stock.widthMm/25.4)}″ × {number(stock.heightMm/25.4)}″ ({stock.widthMm} × {stock.heightMm} mm)</option><option value="custom">Custom sheet / remnant</option></select></label>
      <div className="field-pair dimension-pair"><DimensionField label="Sheet width" value={s.widthIn} onChange={widthIn=>update({widthIn})} disabled={disabled}/><DimensionField label="Sheet height" value={s.heightIn} onChange={heightIn=>update({heightIn})} disabled={disabled}/></div>
      <button className="text-button rotate-sheet" disabled={disabled} onClick={()=>update({widthIn:s.heightIn,heightIn:s.widthIn})}><RotateCw size={13}/>Swap width & height</button>
    </div>
    <div className="panel-section"><h3 className="subheading"><MoveHorizontal size={15}/>Placement rules</h3><div className="field-pair dimension-pair"><DimensionField label="Part spacing" value={s.gapIn} onChange={gapIn=>update({gapIn})} disabled={disabled}/><DimensionField label="Edge margin" value={s.marginIn} onChange={marginIn=>update({marginIn})} disabled={disabled}/></div>
      <label>Allowed rotations<select aria-label="Allowed rotations" disabled={disabled} value={s.rotation} onChange={e=>update({rotation:e.target.value as SheetSettings['rotation']})}><option value="quarter">Quarter turns · 90°</option><option value="fine">Fine turns · 30°</option><option value="fixed">Locked · 0° only</option></select></label>
      <p className="field-hint"><Scan size={13}/>Parts stay outside other parts’ holes.</p>
      {errors.length>0&&<div className="error-message" role="alert">{errors.join(' ')}</div>}
    </div>
    <div className="panel-section export-guide"><h3 className="subheading">Cut layer guide</h3><div className="legend-row"><span className="line-swatch blue"/><div><strong>Outside contours</strong><p>Blue · outward kerf offset</p></div><span className="layer-code">05</span></div><div className="legend-row"><span className="line-swatch red"/><div><strong>Holes & internal cuts</strong><p>Red · inward kerf offset</p></div><span className="layer-code">01</span></div><p className="guide-note"><Info size={14}/><span>DXF uses nominal dimensions. Apply kerf compensation in your cutting software.</span></p></div>
    <div className="stock-footer">Inches first. Millimeters alongside.<br/><span>Current stock: {dimension(s.widthIn)} × {dimension(s.heightIn)}</span></div>
  </aside>;
}
