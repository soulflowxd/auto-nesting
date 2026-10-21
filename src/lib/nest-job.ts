import { defaultSettings, getStock, rotationAngles, settingsErrors, type SheetSettings } from './materials';
import { parseJob, type GroupResult, type JobPart } from './job';
import { nestParts } from './reference/nesting';
import { outlineFromAnalysis } from './reference/nest-outline';
import { validateOutline, validateSheet } from './validate-sheet';

export function nestJob(parts: JobPart[], settings: Record<string, SheetSettings>): GroupResult[] {
  parseJob(JSON.stringify({version:1,name:'Validation',parts,settings}));
  return [...new Set(parts.map(p=>p.stockId))].map(stockId => {
    const s=settings[stockId]??defaultSettings(getStock(stockId));
    const errors=settingsErrors(s);
    if(errors.length) throw new Error(errors.join(' '));
    const input=parts.filter(p=>p.stockId===stockId).map(p=>{
      const outline=outlineFromAnalysis(p.analysis);
      if(!outline) throw new Error(`${p.name}: no closed contours.`);
      const errors=validateOutline(outline);
      if(errors.length) throw new Error(`${p.name}: ${errors.join(' ')}`);
      return {id:p.id,label:p.name,widthIn:p.analysis.boundingBox.width,heightIn:p.analysis.boundingBox.height,quantity:p.quantity,outline};
    });
    const rotations=rotationAngles(s);
    const nest=nestParts(input,s.widthIn,s.heightIn,{marginIn:s.marginIn,gapIn:s.gapIn,rotations,allowInsideHoles:false,freeRotation:s.rotation==='free'});
    const sheetErrors:Record<number,string[]>={};
    for(let i=0;i<nest.sheetsUsed;i++) sheetErrors[i]=validateSheet(nest.placements.filter(p=>p.sheetIndex===i),s);
    return {stockId,settings:s,nest,errors:sheetErrors};
  });
}
