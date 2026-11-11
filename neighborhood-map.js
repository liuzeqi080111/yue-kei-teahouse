// Geometry is independent from Canvas so paths and collision can be verified in Node.
export const SIZE=1536;
export const GRID=16;
export const INTERACT_DISTANCE=88;
export const ROADS=Object.freeze([
 {x:380,y:220,w:180,h:1080},
 {x:1000,y:220,w:175,h:1080},
 {x:380,y:220,w:795,h:120},
 {x:380,y:1080,w:795,h:220},
 {x:1100,y:180,w:300,h:170}
]);
export const STALL_OBSTACLE=Object.freeze({x:385,y:960,w:90,h:50});
export const PLACES=Object.freeze([
 {id:'restaurant',name:'粤记茶餐厅',x:400,y:1150,kind:'restaurant',action:'进入茶餐厅'},
 {id:'market',name:'庙街夜市',x:400,y:560,kind:'outdoor',action:'看看夜市'},
 {id:'home',name:'住处',x:1120,y:1210,kind:'room',action:'回住处'},
 {id:'laundry',name:'芳姐洗衣',x:1140,y:800,kind:'room',action:'进入洗衣店'},
 {id:'rest',name:'街坊休憩处',x:1280,y:280,kind:'outdoor',action:'在休憩处坐坐'}
]);
export const PEOPLE=Object.freeze([
 {id:'qing',x:1040,y:1260},
 {id:'lok',x:420,y:490},
 {id:'ling',x:425,y:670},
 {id:'buyer',x:510,y:530},
 {id:'lam',x:1280,y:320},
 {id:'guest',x:1160,y:290},
 {id:'ming',x:440,y:1070}
]);

export function placeById(id){return PLACES.find(place=>place.id===id)||null;}
export function entryPosition(id){const place=placeById(id);return place?{x:place.x,y:place.y}:null;}
export function nearestPlace(point,maxDistance=INTERACT_DISTANCE){
 if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y))return null;
 let nearest=null,best=maxDistance*maxDistance;
 for(const place of PLACES){
  const distance=(place.x-point.x)**2+(place.y-point.y)**2;
  if(distance<=best){best=distance;nearest=place;}
 }
 return nearest;
}
export function walkable(x,y,obstacle=false){
 if(!Number.isFinite(x)||!Number.isFinite(y))return false;
 const onRoad=ROADS.some(road=>x>=road.x+10&&y>=road.y+10&&x<=road.x+road.w-10&&y<=road.y+road.h-10);
 if(!onRoad)return false;
 return !(obstacle&&x>STALL_OBSTACLE.x&&x<STALL_OBSTACLE.x+STALL_OBSTACLE.w&&y>STALL_OBSTACLE.y&&y<STALL_OBSTACLE.y+STALL_OBSTACLE.h);
}
// Always returns a legal point on the same grid used by findPath.
export function nearestRoad(point,obstacle=false){
 if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y))return null;
 let best=null,distance=Infinity;
 for(let y=0;y<=SIZE;y+=GRID)for(let x=0;x<=SIZE;x+=GRID){
  if(!walkable(x,y,obstacle))continue;
  const next=(x-point.x)**2+(y-point.y)**2;
  if(next<distance){distance=next;best={x,y};}
 }
 return best;
}
export function findPath(start,end,obstacle=false){
 const first=nearestRoad(start,obstacle),last=nearestRoad(end,obstacle);
 if(!first||!last)return [];
 const key=point=>`${point.x},${point.y}`,firstKey=key(first),lastKey=key(last);
 const points=new Map([[firstKey,first]]),previous=new Map([[firstKey,null]]),queue=[firstKey];
 for(let index=0;index<queue.length;index++){
  const currentKey=queue[index];
  if(currentKey===lastKey)break;
  const point=points.get(currentKey);
  for(const [dx,dy] of [[GRID,0],[-GRID,0],[0,GRID],[0,-GRID]]){
   const next={x:point.x+dx,y:point.y+dy},nextKey=key(next);
   if(next.x<0||next.y<0||next.x>SIZE||next.y>SIZE||previous.has(nextKey)||!walkable(next.x,next.y,obstacle))continue;
   previous.set(nextKey,currentKey);points.set(nextKey,next);queue.push(nextKey);
  }
 }
 if(!previous.has(lastKey))return [];
 const path=[];
 for(let current=lastKey;current!==null;current=previous.get(current))path.push(points.get(current));
 return path.reverse();
}
export function moveSafely(point,dx,dy,obstacle=false){
 const next={x:point.x,y:point.y};
 if(!Number.isFinite(dx)||!Number.isFinite(dy)||!walkable(next.x,next.y,obstacle))return next;
 const steps=Math.max(1,Math.ceil(Math.hypot(dx,dy)/5));
 for(let index=0;index<steps;index++){
  if(walkable(next.x+dx/steps,next.y,obstacle))next.x+=dx/steps;
  if(walkable(next.x,next.y+dy/steps,obstacle))next.y+=dy/steps;
 }
 return next;
}
