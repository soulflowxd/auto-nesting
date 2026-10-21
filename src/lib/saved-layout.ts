import type {GroupResult,JobDocument} from './job';
import {defaultSettings,getStock} from './materials';
import {outlineFromAnalysis} from './reference/nest-outline';
import {rotateOutline} from './reference/nesting';
import {validateSheet} from './validate-sheet';

// Save transforms only; rebuild contours from the project's validated source parts.
export function restoreLayouts(job:JobDocument):GroupResult[] {
  const seen=new Set<string>();
  return (job.layouts??[]).map(layout=>{
    if(!layout||seen.has(layout.stockId)||!Array.isArray(layout.placements)||layout.placements.length>500)throw new Error('Invalid saved layout.');
    seen.add(layout.stockId);
    const settings=job.settings[layout.stockId]??defaultSettings(getStock(layout.stockId));
    const parts=job.parts.filter(p=>p.stockId===layout.stockId);
    if(!parts.length)throw new Error('Saved layout has no matching parts.');
    const counts=new Map<string,number>();
    const placements=layout.placements.map(p=>{
      const part=parts.find(part=>part.id===p.partId);
      if(!part||![p.x,p.y,p.rotationDeg].every(Number.isFinite)||!Number.isInteger(p.sheetIndex)||p.sheetIndex<0||p.sheetIndex>=500)throw new Error('Invalid saved placement.');
      const count=(counts.get(part.id)??0)+1;counts.set(part.id,count);
      if(count>part.quantity)throw new Error('Saved layout exceeds part quantity.');
      const base=outlineFromAnalysis(part.analysis);
      if(!base)throw new Error('Invalid saved contour.');
      const outline=rotateOutline(base,p.rotationDeg);
      return {...p,label:part.name,sheetId:`restored-${p.sheetIndex}`,outline,width:Math.max(...outline.flat().map(v=>v.x)),height:Math.max(...outline.flat().map(v=>v.y))};
    });
    const sheetsUsed=placements.length?Math.max(...placements.map(p=>p.sheetIndex))+1:0;
    const errors:Record<number,string[]>={};
    for(let i=0;i<sheetsUsed;i++) {
      const sheet=placements.filter(p=>p.sheetIndex===i);
      if(!sheet.length)throw new Error('Saved layout has a missing sheet.');
      errors[i]=validateSheet(sheet,settings);
      if(errors[i].length)throw new Error(`Invalid saved layout: ${errors[i].join(' ')}`);
    }
    const unplaced=parts.flatMap(p=>Array.from({length:p.quantity-(counts.get(p.id)??0)},()=>({id:p.id,label:p.name,widthIn:p.analysis.boundingBox.width,heightIn:p.analysis.boundingBox.height,quantity:1,outline:outlineFromAnalysis(p.analysis)})));
    return {stockId:layout.stockId,settings,nest:{placements,sheetsUsed,unplaced},errors};
  });
}
