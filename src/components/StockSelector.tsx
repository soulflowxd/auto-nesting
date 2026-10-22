import { STOCKS, thicknessLabel } from '../lib/materials';

export type StockChoice={material:string;thicknessMm:number|null;color:string};
export function StockSelector({value,onChange,disabled=false}:{value:StockChoice;onChange:(choice:StockChoice)=>void;disabled?:boolean}) {
  const materials=[...new Set(STOCKS.map(s=>s.material))];
  const thicknesses=[...new Set(STOCKS.filter(s=>s.material===value.material).map(s=>s.thicknessMm))];
  const colors=[...new Set(STOCKS.filter(s=>s.material===value.material&&s.thicknessMm===value.thicknessMm).map(s=>s.color))];
  return <div className="stock-selector">
    <label>Material<select aria-label="Part material" value={value.material} disabled={disabled} onChange={e=>onChange({material:e.target.value,thicknessMm:null,color:''})}><option value="">Select material</option>{materials.map(m=><option key={m} value={m}>{m}</option>)}</select></label>
    <label>Thickness<select aria-label="Part thickness" value={value.thicknessMm??''} disabled={disabled||!value.material} onChange={e=>{const mm=Number(e.target.value);const matching=STOCKS.filter(s=>s.material===value.material&&s.thicknessMm===mm);onChange({...value,thicknessMm:mm,color:matching.length===1?matching[0].color:''});}}><option value="">{value.material?'Select thickness':'Select material first'}</option>{thicknesses.map(mm=><option key={mm} value={mm}>{thicknessLabel(mm)}</option>)}</select></label>
    {colors.length>1&&<label>Color<select aria-label="Part color" value={value.color} disabled={disabled} onChange={e=>onChange({...value,color:e.target.value})}><option value="">Select color</option>{colors.map(c=><option key={c}>{c}</option>)}</select></label>}
  </div>;
}
