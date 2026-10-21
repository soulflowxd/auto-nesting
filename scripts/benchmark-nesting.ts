import {nestJob} from '../src/lib/nest-job';
import {fixturePart} from '../src/lib/test-fixtures';
const parts=Array.from({length:7},(_,i)=>{const w=4+i*.3,h=1.5+i*.1;const points=Array.from({length:240},(_,j)=>({x:w/2*(1+Math.cos(j/240*Math.PI*2)),y:h/2*(1+Math.sin(j/240*Math.PI*2))}));return fixturePart({id:`p${i}`,quantity:2,analysis:{...fixturePart().analysis,boundingBox:{minX:0,minY:0,maxX:w,maxY:h,width:w,height:h},loops:[{points,perimeterIn:15}]}});});
const start=performance.now();const result=nestJob(parts,{'al7075-3':{widthIn:24,heightIn:24,gapIn:.04,marginIn:.07,rotation:'free'}});console.log(JSON.stringify({ms:performance.now()-start,placed:result[0].nest.placements.length,sheets:result[0].nest.sheetsUsed,errors:result[0].errors}));
