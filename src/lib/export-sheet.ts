import { writeDxf } from './reference/dxf-writer';
import { edgeLayer, holeFlags } from './reference/cut-edges';
import { validateSheet } from './validate-sheet';
import { getStock, number } from './materials';
import type { GroupResult } from './job';

export function exportSheet(group: GroupResult, sheetIndex: number): {filename: string; dxf: string} {
  const placements=group.nest.placements.filter(p=>p.sheetIndex===sheetIndex);
  if(!placements.length) throw new Error('This sheet has no parts to export.');
  const errors=validateSheet(placements,group.settings);
  if(errors.length) throw new Error(`Export blocked: ${errors.join(' ')}`);
  const layers=[edgeLayer('CUT',false),edgeLayer('CUT',true),{name:'SHEET-DATUM',color:8}];
  const polylines=placements.flatMap(p=>{
    const holes=holeFlags(p.outline);
    return p.outline.map((loop,i)=>({layer:edgeLayer('CUT',holes[i]).name,closed:true,points:loop.map(v=>({x:v.x+p.x,y:v.y+p.y}))}));
  });
  const {widthIn,heightIn}=group.settings;
  const dxf=writeDxf({polylines,layers,points:[{x:0,y:0},{x:widthIn,y:0},{x:widthIn,y:heightIn},{x:0,y:heightIn}].map(at=>({at,layer:'SHEET-DATUM'})),extents:{minX:0,minY:0,maxX:widthIn,maxY:heightIn}});
  const stock=getStock(group.stockId);
  const stem=`${stock.material}-${stock.color}-${number(stock.thicknessMm/25.4)}in-${stock.thicknessMm}mm-sheet-${sheetIndex+1}`.replace(/[^a-zA-Z0-9._-]+/g,'-');
  return {filename:`${stem}.dxf`,dxf};
}

export function downloadFile(filename: string, content: string, type='application/dxf') {
  const url=URL.createObjectURL(new Blob([content],{type}));
  const link=document.createElement('a');link.href=url;link.download=filename;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
