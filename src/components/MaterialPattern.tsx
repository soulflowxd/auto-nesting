import { srppTextureUrl, type StockPreset } from '../lib/materials';

/** Use inside an SVG's defs; the compound part path leaves holes unfilled. */
export function MaterialPattern({id,stock,size}:{id:string;stock:StockPreset;size:number}) {
  const texture=srppTextureUrl(stock);
  if(!texture)return null;
  return <pattern id={id} patternUnits="userSpaceOnUse" width={size} height={size}>
    <rect width={size} height={size} fill={stock.color==='White'?'#e8e8e3':'#111318'}/>
    <image href={texture} width={size} height={size} preserveAspectRatio="xMidYMid slice"/>
  </pattern>;
}
