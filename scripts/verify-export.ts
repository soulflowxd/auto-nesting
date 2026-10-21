import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import DxfParser from 'dxf-parser';

const filename=process.argv[2];
if(!filename)throw new Error('Usage: bun scripts/verify-export.ts <sheet.dxf>');
const dxf=new DxfParser().parseSync(await readFile(filename,'utf8'));
assert(dxf,'DXF must parse');assert.equal(dxf.header.$INSUNITS,1);
const counts={outside:0,holes:0,datum:0};
for(const entity of dxf.entities){
  if(entity.layer==='CUT-OUTSIDE'){assert.equal(entity.colorIndex,5);counts.outside++;}
  else if(entity.layer==='CUT-HOLES'){assert.equal(entity.colorIndex,1);counts.holes++;}
  else if(entity.layer==='SHEET-DATUM'){assert.equal(entity.type,'POINT');assert.equal(entity.colorIndex,8);counts.datum++;}
  else throw new Error(`Unexpected export layer: ${entity.layer}`);
}
assert(counts.outside>0);assert.equal(counts.datum,4);
assert.equal(dxf.tables.layer.layers['CUT-OUTSIDE'].colorIndex,5);
assert.equal(dxf.tables.layer.layers['CUT-HOLES'].colorIndex,1);
console.log(JSON.stringify({units:'inches',...counts,colors:'Blue ACI 5 outside; red ACI 1 holes; gray ACI 8 datum'},null,2));
