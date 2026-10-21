import { STOCKS, getStock, thicknessLabel } from '../lib/materials';

export function StockSelector({value,onChange,disabled=false}:{value:string;onChange:(id:string)=>void;disabled?:boolean}) {
  const selected=getStock(value);
  const materialOptions=[...new Set(STOCKS.map(s=>s.material))];
  const thicknesses=[...new Set(STOCKS.filter(s=>s.material===selected.material&&s.color===selected.color).map(s=>s.thicknessMm))];
  const colors=[...new Set(STOCKS.filter(s=>s.material===selected.material).map(s=>s.color))];
  const change=(material:string,thicknessMm:number,color:string)=>{
    const candidates=STOCKS.filter(s=>s.material===material);
    const chosen=candidates.find(s=>s.thicknessMm===thicknessMm&&s.color===color)??candidates.find(s=>s.color===color)??candidates.find(s=>s.thicknessMm===thicknessMm)??candidates[0];
    onChange(chosen.id);
  };
  return <div className="stock-selector">
    <label>Material<select aria-label="Import material" value={selected.material} disabled={disabled} onChange={e=>change(e.target.value,selected.thicknessMm,selected.color)}>{materialOptions.map(m=><option key={m}>{m}</option>)}</select></label>
    <div className="field-pair">
      <label>Thickness<select aria-label="Import thickness" value={selected.thicknessMm} disabled={disabled} onChange={e=>change(selected.material,Number(e.target.value),selected.color)}>{thicknesses.map(mm=><option key={mm} value={mm}>{thicknessLabel(mm)}</option>)}</select></label>
      {colors.length>1?<label>Color<select aria-label="Import color" value={selected.color} disabled={disabled} onChange={e=>change(selected.material,selected.thicknessMm,e.target.value)}>{colors.map(c=><option key={c}>{c}</option>)}</select></label>:<label>Finish<span className="static-field">{selected.color}</span></label>}
    </div>
    {selected.nominal&&<p className="field-hint">Nominal 0.1181″ (3 mm). Check your actual acetal stock thickness.</p>}
  </div>;
}
