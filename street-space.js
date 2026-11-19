import { rackStatus } from './neighborhood-state.js';

export const HOME = { x: 12.22, z: 8.94, heading: 1.56 };
export const COUNTER = { x: 16.70, z: -0.45 };
export const LAUNDRY_DOOR = { x: 13.86, z: -0.50 };
export const RESTAURANT = { x: -13.56, z: 9.22, heading: -1.48 };
export const REST = { x: 13.45, z: -12.9 };

const ORIGINAL_RACK={x:-13.20,z:7.18,length:2.25};
export function rackLayout(world){
 const status=rackStatus(world);
 if(status.placement==='compact')return {...ORIGINAL_RACK,x:-13.72,length:1,visible:true};
 if(status.placement==='move')return {x:-13.32,z:4.90,length:1.85,visible:true};
 return {...ORIGINAL_RACK,visible:status.blocked};
}

export function rackBlocks(rack,point){
 return rack.visible&&Math.abs(point.x-rack.x)<.43&&Math.abs(point.z-rack.z)<rack.length/2+.19;
}

export const ACTORS = Object.freeze({
 qing: { model:'aqing', point:HOME, zone:[11.65,13.20,7.60,9.81] },
 fang: { model:'fang', point:COUNTER },
 ming: { model:'aming', point:{x:-13.86,z:8.43}, zone:[-14.65,-13.22,7.60,9.34] },
 guest: { model:'regular', point:{x:-13.33,z:10.38}, zone:[-14.05,-12.50,9.60,11.78] },
 lam: { model:'lin', point:REST, zone:[13.0,14.63,-14.78,-11.56] },
 lok: { model:'ale', point:{x:-13.68,z:-6.38}, zone:[-14.61,-12.83,-7.48,-5.78] },
 buyer: { model:'buyer', point:{x:-12.70,z:-5.03}, zone:[-13.60,-11.38,-5.76,-3.62] },
 ling: { model:'ling', point:{x:-14.02,z:-10.46}, zone:[-14.84,-13.07,-11.98,-9.19] },
});

export function within(point, [minX,maxX,minZ,maxZ]) {
 return point.x>=minX && point.x<=maxX && point.z>=minZ && point.z<=maxZ;
}

export function distance(a,b) {
 return Math.hypot(a.x-b.x,a.z-b.z);
}

export function createStreetNav(layout, blocked=()=>false) {
 const {x0,z0,step,w,h,rows}=layout;
 const pixels=new Uint8Array(w*h);
 rows.forEach((runs,j)=>{
  for(let k=0;k<runs.length;k+=3){
   const first=j*w+runs[k];
   pixels.fill(runs[k+2],first,first+runs[k+1]);
  }
 });
 const index=(x,z)=>{
  const i=Math.round((x-x0)/step),j=Math.round((z-z0)/step);
  return i>=0&&i<w&&j>=0&&j<h?j*w+i:-1;
 };
 const point=i=>({x:x0+(i%w)*step,z:z0+Math.floor(i/w)*step});
 const cell=(x,z)=>pixels[index(x,z)]||0;
 const walkable=(x,z)=>cell(x,z)>0&&!blocked({x,z});
 function line(from,to){
  const steps=Math.max(1,Math.ceil(distance(from,to)/.033));
  for(let i=1;i<=steps;i++){
   const u=i/steps;
   if(!walkable(from.x+(to.x-from.x)*u,from.z+(to.z-from.z)*u))return false;
  }
  return true;
 }
 function path(from,to){
  if(!walkable(from.x,from.z)||!walkable(to.x,to.z))return [];
  if(line(from,to))return [to];
  const start=index(from.x,from.z),end=index(to.x,to.z);
  const prev=new Int32Array(w*h).fill(-1),queue=new Int32Array(w*h);
  let head=0,tail=1;
  queue[0]=start;prev[start]=start;
  while(head<tail&&prev[end]===-1){
   const i=queue[head++],col=i%w;
   for(const j of [col>0?i-1:-1,col<w-1?i+1:-1,i-w,i+w]){
    if(j<0||j>=pixels.length||!pixels[j]||prev[j]!==-1||blocked(point(j)))continue;
    prev[j]=i;queue[tail++]=j;
   }
  }
  if(prev[end]===-1)return [];
  const reverse=[to];
  for(let i=end;i!==start;i=prev[i])reverse.push(point(i));
  reverse.push(point(start));
  const route=reverse.reverse(),result=[];
  let current=from;
  for(let i=0;i<route.length;){
   let far=i;
   if(!line(current,route[far]))return [];
   while(far+1<route.length&&line(current,route[far+1]))far++;
   current=route[far];result.push(current);i=far+1;
  }
  return result;
 }
 return {cell,walkable,line,path};
}
