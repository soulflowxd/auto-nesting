import { defaultSettings, getStock, rotationAngles, settingsErrors, usedAreas, type SheetSettings } from './materials.js';
import { parseJob, type GroupResult, type JobPart } from './job.js';
import { nestOntoStock } from './reference/nesting.js';
import { outlineFromAnalysis } from './reference/nest-outline.js';
import { validateOutline, validateSheet } from './validate-sheet.js';

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
    const fresh={id:'new',widthIn:s.widthIn,heightIn:s.heightIn};
    const highestMarked=Math.max(-1,...Object.keys(s.blockedAreasBySheet??{}).filter(key=>usedAreas(s,Number(key)).length>0).map(Number),s.blockedAreas?.length?0:-1);
    const sheetCount=Math.max(s.markedSheetCount??0,highestMarked+1);
    const marked=Array.from({length:sheetCount},(_,i)=>({...fresh,id:`used-sheet-${i+1}`,blocked:usedAreas(s,i)}));
    const nest=nestOntoStock(input,marked,fresh,{marginIn:s.marginIn,gapIn:s.gapIn,rotations,allowInsideHoles:false,freeRotation:s.rotation==='free'});
    const sheetErrors:Record<number,string[]>={};
    for(let i=0;i<nest.sheetsUsed;i++) sheetErrors[i]=validateSheet(nest.placements.filter(p=>p.sheetIndex===i),s,i);
    return {stockId,settings:s,nest,errors:sheetErrors};
  });
}
