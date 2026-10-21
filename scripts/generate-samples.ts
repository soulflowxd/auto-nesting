import {mkdir,writeFile} from 'node:fs/promises';
import {exportSTEP,makeBaseBox,makeCylinder} from 'replicad';
import {ensureOpenCascade} from '../src/lib/reference/geometry/analyze-step';
import {writeDxf} from '../src/lib/reference/dxf-writer';

const rectangle=(w:number,h:number)=>[{x:0,y:0},{x:w,y:0},{x:w,y:h},{x:0,y:h}];
const circle=(x:number,y:number,r:number)=>Array.from({length:90},(_,i)=>({x:x+r*Math.cos(i*Math.PI/45),y:y+r*Math.sin(i*Math.PI/45)}));
await mkdir('public/samples',{recursive:true});
for(const [name,loops] of [
  ['bearing-plate',[rectangle(5,3.5),circle(2.5,1.75,.55),circle(.5,.5,.1),circle(4.5,.5,.1),circle(4.5,3,.1),circle(.5,3,.1)]],
  ['gusset',[[{x:0,y:0},{x:5,y:0},{x:0,y:5}],circle(.55,.55,.1),circle(3.9,.55,.1),circle(.55,3.9,.1)]],
] as const){
  await writeFile(`public/samples/${name}.dxf`,writeDxf({polylines:loops.map((points,i)=>({points:[...points],layer:i?'CUT-HOLES':'CUT-OUTSIDE',closed:true})),layers:[{name:'CUT-OUTSIDE',color:5},{name:'CUT-HOLES',color:1}],extents:{minX:0,minY:0,maxX:5,maxY:5}}));
}
await ensureOpenCascade();
const shape=makeBaseBox(100,60,3).cut(makeCylinder(8,5,[0,0,-1]));
const blob=exportSTEP([{shape,name:'100 x 60 x 3mm plate with 16mm through-hole'}]);
await writeFile('public/samples/bearing-plate.step',new Uint8Array(await blob.arrayBuffer()));
shape.delete();
console.log('Generated two DXFs and one flat STEP sample in public/samples.');
