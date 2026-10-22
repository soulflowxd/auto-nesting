import { Layers2, Trash2, FileBox } from 'lucide-react';
import { useId } from 'react';
import { useJobStore } from '../stores/job-store';
import { AVAILABLE_STOCKS, dimension, getStock, stockLabel, srppTextureUrl } from '../lib/materials';
import { MaterialPattern } from './MaterialPattern';
import { outlineFromAnalysis } from '../lib/reference/nest-outline';
import { holeFlags } from '../lib/reference/cut-edges';
import { outlinePathData } from '../lib/reference/nesting';
import type { JobPart } from '../lib/job';

function PartThumb({part}:{part:JobPart}) {
  const patternId=`thumb-${useId().replace(/[^a-zA-Z0-9_-]/g,'')}`;
  const stock=getStock(part.stockId);
  const loops=outlineFromAnalysis(part.analysis)??[];
  const flags=holeFlags(loops);
  const {width,height}=part.analysis.boundingBox;
  const padding=Math.max(width,height)*.08;
  return <svg viewBox={`${-padding} ${-padding} ${width+padding*2} ${height+padding*2}`} aria-hidden="true"><defs><MaterialPattern id={patternId} stock={stock} size={Math.max(width,height)*.39}/></defs><g transform={`translate(0 ${height}) scale(1 -1)`}><path d={outlinePathData(loops)} fill={srppTextureUrl(stock)?`url(#${patternId})`:'#e6edf8'} fillRule="evenodd"/>{loops.map((l,i)=><path key={i} d={outlinePathData([l])} fill="none" stroke={flags[i]?'#e25252':'#326de6'} strokeWidth="1.2" vectorEffect="non-scaling-stroke"/>)}</g></svg>;
}
export function PartList({disabled}:{disabled:boolean}) {
  const {parts,updatePart,removePart}=useJobStore();
  const total=parts.reduce((sum,p)=>sum+p.quantity,0);
  return <section className="parts-panel panel-section">
    <div className="section-heading"><span className="section-icon"><Layers2 size={16}/></span><h2>Parts queue</h2><span className="count-badge">{total}</span></div>
    {!parts.length?<div className="parts-empty"><FileBox size={27} strokeWidth={1.3}/><p>Your parts will appear here.</p><span>Each file is one unique part.</span></div>:<div className="parts-list">{parts.map((p,index)=>{
      const stock=getStock(p.stockId);
      const choices=AVAILABLE_STOCKS.some(s=>s.id===stock.id)?AVAILABLE_STOCKS:[stock,...AVAILABLE_STOCKS];
      const measured=p.analysis.sourceThicknessMm;
      const mismatch=measured!==undefined&&Math.abs(measured-stock.thicknessMm)>.01;
      return <article className="part-card" key={p.id}>
        <div className="part-overview"><div className="part-thumb"><PartThumb part={p}/></div><div className="part-info"><span className="part-index">PART {String(index+1).padStart(2,'0')}</span><h3 title={p.name}>{p.name}</h3><p>{dimension(p.analysis.boundingBox.width)} ×<br/>{dimension(p.analysis.boundingBox.height)}</p></div><button className="icon-button delete-button" disabled={disabled} title={`Remove ${p.name}`} aria-label={`Remove ${p.name}`} onClick={()=>removePart(p.id)}><Trash2 size={15}/></button></div>
        <div className="part-edit"><label>Stock<select value={p.stockId} disabled={disabled} aria-label={`Stock for ${p.name}`} onChange={e=>updatePart(p.id,{stockId:e.target.value})}>{choices.map(s=><option key={s.id} value={s.id}>{stockLabel(s)}</option>)}</select></label><label className="quantity-label">Qty<input aria-label={`Quantity for ${p.name}`} type="number" min={1} max={500} step={1} value={p.quantity} disabled={disabled} onChange={e=>updatePart(p.id,{quantity:Number(e.target.value)})}/></label></div>
        {measured!==undefined&&<p className={mismatch?'part-warning':'field-hint'}>STEP: {dimension(measured/25.4)}{mismatch?' — differs from selected stock. Profile stays unchanged.':''}</p>}
        {p.analysis.warnings.filter(w=>!w.startsWith('STEP thickness')).map((w,i)=><p className="field-hint" key={i}>{w}</p>)}
      </article>;
    })}</div>}
  </section>;
}
