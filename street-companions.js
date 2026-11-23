import { distance, PERSON_CLEARANCE } from './street-space.js';

// Centre-to-centre clearance for the two character rigs and the first-person camera.
const CLEARANCE=PERSON_CLEARANCE;
const position=actor=>actor.model.position;
const point=(p,dx,dz)=>({x:p.x+dx,z:p.z+dz});
const angles=[0,.45,-.45,.88,-.88,1.35,-1.35];

export function createStreetCompanions(nav,friend,qing){
 const actors=[qing,friend];
 let trail=[],retryPlayer=false;
 function put(actor,p){
  actor.model.position.set(p.x,(nav.cell(p.x,p.z)-11)/100,p.z);
 }
 function clear(actor,p,player){
  return distance(p,player)>=CLEARANCE&&actors.every(other=>other===actor||!other.model.visible||distance(p,position(other))>=CLEARANCE);
 }
 function standNear(actor,anchor,player){
  for(let r=0;r<3.2;r+=.17){
   for(let k=0;k<(r?16:1);k++){
    const a=k*Math.PI/8,spot=point(anchor,r*Math.cos(a),r*Math.sin(a));
    if(clear(actor,spot,player)&&nav.walkable(spot.x,spot.z)&&nav.path(spot,player).length){
     put(actor,spot);actor.path=[];return;
    }
   }
  }
 }
 function reset(player){
  trail=[{x:player.x,z:player.z}];retryPlayer=false;
  for(const actor of actors){actor.path=[];actor.yieldTime=0;actor.walkSpeed=0;actor.strideDistance=0;}
 }
 // The player gets the inside of a turn. Step aside before the camera reaches
 // the body, or back up when the navmesh only has room for one person.
 function canPlayerMove(from,to,qingIsWalking){
  retryPlayer=false;
  if(!nav.line(from,to))return false;
  const len=distance(from,to);
  if(!len)return true;
  const dx=(to.x-from.x)/len,dz=(to.z-from.z)/len;
  for(const actor of actors){
   const p=position(actor),d=distance(p,to);
   if(!actor.model.visible||d>=1.25||d>=distance(p,from))continue;
   if(actor===qing&&!qingIsWalking){
    if(d<CLEARANCE)return false;
    continue;
   }
   const sign=(p.x-from.x)*dz-(p.z-from.z)*dx>=0?1:-1;
   const sideways=Math.min(.14,len*1.15),ahead=point(to,dx*.85,dz*.85);
   let best=null,score=-Infinity;
   for(const [forward,side] of [[0,sign],[0,-sign],[.72,sign*.7],[.72,-sign*.7],[1,0]]){
    const dest=point(p,(dx*forward+dz*side)*sideways,(dz*forward-dx*side)*sideways);
    if(!nav.line(p,dest)||!clear(actor,dest,from)||distance(dest,to)<d)continue;
    const room=distance(dest,ahead)+.25*distance(dest,to);
    if(room>score){score=room;best=dest;}
   }
   if(best){
    const moved=distance(p,best);
    put(actor,best);actor.strideDistance=(actor.strideDistance||0)+moved;actor.yieldTime=.4;actor.path=[];
   }
   if(distance(position(actor),to)<CLEARANCE){retryPlayer=true;return false;}
  }
  return true;
 }
 function follow(actor,dest,player,dt){
  if(actor.yieldTime>0){actor.yieldTime-=dt;return;}
  const p=position(actor);
  if(!nav.walkable(p.x,p.z)){standNear(actor,p,player);return;}
  if(!dest||distance(p,dest)<.095){actor.walkSpeed=0;return;}
  if(nav.line(p,dest)){actor.path=[dest];actor.dest={...dest};}
  else if(!actor.path.length||distance(actor.dest,dest)>.38||!nav.line(p,actor.path[0])){
   actor.path=nav.path(p,dest);actor.dest={...dest};
  }
  while(actor.path.length&&distance(p,actor.path[0])<.025)actor.path.shift();
  const next=actor.path[0];if(!next)return;
  const heading=Math.atan2(next.x-p.x,next.z-p.z);
  const turn=Math.atan2(Math.sin(heading-actor.model.rotation.y),Math.cos(heading-actor.model.rotation.y));
  actor.model.rotation.y+=Math.max(-3.8*dt,Math.min(3.8*dt,turn));
  actor.walkSpeed=Math.min(2.85,(actor.walkSpeed||0)+4*dt);
  const step=Math.min(distance(p,next),actor.walkSpeed*dt)*Math.max(.28,Math.cos(turn));
  for(const offset of angles){
   const a=heading+offset,dest=point(p,Math.sin(a)*step,Math.cos(a)*step);
   if(!nav.line(p,dest)||!clear(actor,dest,player))continue;
   put(actor,dest);actor.strideDistance=(actor.strideDistance||0)+step;return;
  }
  actor.walkSpeed=0;
 }
 // Follow the path actually walked, keeping two places in line through tight
 // passages. On broad pavements each companion can use their own side.
 function record(player){
  if(distance(trail.at(-1),player)<.12)return;
  trail.push({x:player.x,z:player.z});
  if(trail.length>40)trail.shift();
 }
 function slot(player,lag,side){
  let next=player;
  for(let i=trail.length-1;i>=0;i--){
   const previous=trail[i],len=distance(next,previous);
   if(len>=lag&&len>0){
    const dx=(previous.x-next.x)/len,dz=(previous.z-next.z)/len;
    const centre=point(next,dx*lag,dz*lag),offset=point(centre,dz*side,-dx*side);
    return nav.line(centre,offset)?offset:centre;
   }
   lag-=len;next=previous;
  }
  return null;
 }
 function walk(player,dt,counterPoint){
  record(player);
  follow(qing,counterPoint||slot(player,1.16,.3),player,dt);
  follow(friend,counterPoint?{x:12.55,z:.48}:slot(player,2.48,-.36),player,dt);
 }
 return {reset,standNear,canPlayerMove,walk,get retryPlayer(){return retryPlayer;}};
}
