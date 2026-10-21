import type {NestOutline,NestPoint} from './nesting';

export const normalizeRotation=(angle:number)=>((angle%360)+360)%360;
const cross=(a:NestPoint,b:NestPoint,c:NestPoint)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);

function convexHull(points:NestPoint[]):NestPoint[] {
  const ordered=[...points].sort((a,b)=>a.x-b.x||a.y-b.y);
  const build=(list:NestPoint[])=>{
    const result:NestPoint[]=[];
    for(const point of list){
      while(result.length>=2&&cross(result.at(-2)!,result.at(-1)!,point)<=0)result.pop();
      result.push(point);
    }
    return result;
  };
  return [...build(ordered).slice(0,-1),...build([...ordered].reverse()).slice(0,-1)];
}

function extentAt(points:NestPoint[],angle:number) {
  const radians=angle*Math.PI/180,c=Math.cos(radians),s=Math.sin(radians);
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const p of points){
    const x=p.x*c-p.y*s,y=p.x*s+p.y*c;
    minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
  }
  return {width:maxX-minX,height:maxY-minY};
}

/** Continuous scalar search within a promising orientation interval. */
function minimizeAngle(cost:(angle:number)=>number,low:number,high:number):number {
  const ratio=(Math.sqrt(5)-1)/2;
  let a=high-ratio*(high-low),b=low+ratio*(high-low),fa=cost(a),fb=cost(b);
  for(let i=0;i<40&&high-low>1e-7;i++){
    if(fa<fb){high=b;b=a;fb=fa;a=high-ratio*(high-low);fa=cost(a);}
    else{low=a;a=b;fa=fb;b=low+ratio*(high-low);fb=cost(b);}
  }
  return normalizeRotation((low+high)/2);
}

/**
 * Geometry-derived seeds have unrestricted floating-point angles. The coarse
 * sweep only supplies basins; it is not a list the final orientation is locked to.
 */
export function freeRotationSeeds(outline:NestOutline,sheetWidth:number,sheetHeight:number):number[] {
  const hull=convexHull(outline.flat());
  const seeds=Array.from({length:12},(_,i)=>i*30);
  const edges=hull.map((a,i)=>{
    const b=hull[(i+1)%hull.length];
    return {length:Math.hypot(b.x-a.x,b.y-a.y),angle:Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI};
  }).sort((a,b)=>b.length-a.length).slice(0,16);
  for(const edge of edges)for(const turn of [0,90,180,270])seeds.push(normalizeRotation(turn-edge.angle));
  const cost=(angle:number)=>{
    const e=extentAt(hull,angle);
    return Math.max(e.width/Math.max(sheetWidth,1e-9),e.height/Math.max(sheetHeight,1e-9));
  };
  // A stock-fit optimum can lie between every edge-alignment orientation.
  const promising=Array.from({length:12},(_,i)=>({angle:i*30,cost:cost(i*30)})).sort((a,b)=>a.cost-b.cost).slice(0,4);
  for(const p of promising)seeds.push(minimizeAngle(cost,p.angle-30,p.angle+30));
  const seen=new Set<string>();
  return seeds.filter(angle=>{const key=normalizeRotation(angle).toFixed(8);if(seen.has(key))return false;seen.add(key);return true;});
}

/** Adaptive local search uses the live sheet's fit/collision score, not rounding. */
export function refineFreeRotation<T>(initial:T,angleOf:(value:T)=>number,evaluate:(angle:number)=>T|null,better:(a:T,b:T)=>boolean):T {
  let best=initial;
  for(let step=12;step>0.000001;step/=3){
    for(let move=0;move<3;move++){
      const angle=angleOf(best);
      let next=best;
      for(const delta of [-step,step]){
        const trial=evaluate(normalizeRotation(angle+delta));
        if(trial&&better(trial,next))next=trial;
      }
      if(next===best)break;
      best=next;
    }
  }
  return best;
}
