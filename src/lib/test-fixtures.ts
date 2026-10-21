import type {JobPart} from './job';
export const rectangle=(w=2,h=1,x=0,y=0)=>[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}];
export function fixturePart(overrides:Partial<JobPart>={}):JobPart {
  return {id:'plate',name:'Plate.dxf',stockId:'al7075-3',quantity:2,analysis:{sourceUnit:'in',boundingBox:{minX:0,minY:0,maxX:2,maxY:1,width:2,height:1},cutLengthIn:7,closedLoopCount:2,loops:[{points:rectangle(),perimeterIn:6},{points:rectangle(.25,.25,.5,.25),perimeterIn:1}],warnings:[]},...overrides};
}
