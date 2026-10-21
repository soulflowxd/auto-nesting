import { analyzeDxf } from '../lib/reference/geometry/analyze-dxf';
import { outlineFromAnalysis } from '../lib/reference/nest-outline';
import { validateOutline } from '../lib/validate-sheet';
import type { UnitOverride } from '../lib/reference/geometry/types';

self.onmessage=async(event:MessageEvent<{bytes:ArrayBuffer;filename:string;unit:UnitOverride}>)=>{
  try {
    const {bytes,filename,unit}=event.data;
    const analysis=await (async()=>{
      if(/\.dxf$/i.test(filename)) return analyzeDxf(new TextDecoder().decode(bytes),unit);
      const [{analyzeStep,ensureOpenCascade},{default:wasmUrl}]=await Promise.all([
        import('../lib/reference/geometry/analyze-step'),import('replicad-opencascadejs/wasm?url'),
      ]);
      await ensureOpenCascade(wasmUrl);
      return analyzeStep(new Uint8Array(bytes));
    })();
    const count=analysis.loops.reduce((sum,l)=>sum+l.points.length,0);
    if(count>20000 || analysis.loops.length>256) throw new Error('This part is too complex. Use fewer than 20,000 contour points and 256 loops.');
    const outline=outlineFromAnalysis(analysis);
    if(!outline) throw new Error('No closed cut geometry was found.');
    const errors=validateOutline(outline);
    if(errors.length) throw new Error(errors.join(' '));
    self.postMessage({result:analysis});
  } catch(error) {self.postMessage({error:error instanceof Error?error.message:'Could not read this CAD file.'});}
};
