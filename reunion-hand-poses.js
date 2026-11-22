import * as T from 'three';

const vec=()=>new T.Vector3();
const at=bone=>bone.getWorldPosition(vec());
const neutral=new WeakMap();
// Cache the distal skin in the final phalanx frame. The imported Mixamo terminal
// is a rig marker: its distance from the visible pad varies between characters.
const pads=new WeakMap();
const weightedPads=new WeakMap();
export function registerSkinPads(actor){
 const clouds=new Map();
 actor.model.updateMatrixWorld(true);
 actor.model.traverse(mesh=>{
  if(!mesh.isSkinnedMesh)return;
  const {position,skinIndex,skinWeight}=mesh.geometry.attributes;
  const joints=mesh.skeleton.bones.map(b=>{
   const m=b.name.match(/(Right|Left)Hand(Thumb|Index|Middle|Ring|Pinky)[34]$/);
   return m?actor.bones[m[1]+'Hand'+m[2]+'3']:null;
  });
  if(!joints.some(Boolean))return;
  for(let i=0;i<position.count;i++){
   let bone,weight=0;
   for(let j=0;j<4;j++){
    const joint=joints[skinIndex.getComponent(i,j)];
    if(joint){bone=joint;weight+=skinWeight.getComponent(i,j);}
   }
   if(weight<.56)continue;
   const p=bone.worldToLocal(mesh.localToWorld(mesh.getVertexPosition(i,vec())));
   if(!clouds.has(bone))clouds.set(bone,[]);
   clouds.get(bone).push(p);
   if(!weightedPads.has(bone))weightedPads.set(bone,[]);
   weightedPads.get(bone).push([mesh,i]);
  }
 });
 for(const [bone,cloud] of clouds){
  const points=new Set();
  for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++){
   if(!x&&!y&&!z)continue;
   const dir=new T.Vector3(x,y,z);
   points.add(cloud.reduce((a,b)=>a.dot(dir)>b.dot(dir)?a:b));
  }
  pads.set(bone,[...points]);
 }
}
function skinDistance(bone,measure){
 const points=pads.get(bone);if(!points)return null;
 bone.updateWorldMatrix(true,false);
 const p=vec();let min=Infinity;
 for(const local of points)min=Math.min(min,measure(p.copy(local).applyMatrix4(bone.matrixWorld)));
 return min;
}
export function stringContact(bones,side,digit,goal,f,height){
 const target=goal.clone(),bone=bones[side+'Hand'+digit+'3'];
 for(let i=0;i<3;i++){
  fingerContact(bones,side,digit,target,f);
  const cloud=pads.get(bone);if(!cloud)break;
  bone.updateWorldMatrix(true,false);
  let best=Infinity,minY=Infinity;const delta=vec(),p=vec();
  for(const local of cloud){
   p.copy(local).applyMatrix4(bone.matrixWorld);
   minY=Math.min(minY,p.y);
   const dx=goal.x-p.x,dy=height-p.y,d2=dx*dx+dy*dy;
   if(d2<best){best=d2;delta.set(dx,dy,0);}
  }
  // The underside may touch an adjacent string but cannot fall through it.
  delta.y=Math.max(delta.y,height-.001-minY);
  if(delta.lengthSq()<.00000036)break;
  target.add(delta.clampLength(0,.009));

 }
}
function aim(bone,next,direction){
 const origin=at(bone),from=at(next).sub(origin).normalize(),to=direction.clone().normalize();
 const parent=bone.parent.getWorldQuaternion(new T.Quaternion());
 bone.quaternion.premultiply(parent.clone().invert().multiply(new T.Quaternion().setFromUnitVectors(from,to)).multiply(parent));
}
export function handFrame(bones,side){
 const hand=side+'Hand',wrist=at(bones[hand]),middle=at(bones[hand+'Middle1']);
 const forward=middle.clone().sub(wrist).normalize();
 const radial=at(bones[hand+'Index1']).sub(at(bones[hand+'Pinky1']));
 radial.addScaledVector(forward,-radial.dot(forward)).normalize();
 const palm=radial.clone().cross(forward).multiplyScalar(side==='Right'?1:-1);
 return {wrist,middle,forward,radial,palm,length:wrist.distanceTo(middle)};
}

// Move the fingertip to a pad contact with a flexing PIP and DIP, preserving
// the lengths and bend direction of each digit on its own skeleton.
export function fingerContact(bones,side,digit,goal,frame,blend=1){
 const chain=[1,2,3,4].map(i=>bones[side+'Hand'+digit+i]);
 for(const joint of chain.slice(0,3)){
  if(!neutral.has(joint))neutral.set(joint,joint.quaternion.clone());
  joint.quaternion.copy(neutral.get(joint));
 }
 if(blend<=0)return;
 const [mcp,pip,dip,tip]=chain;
 if(blend<1)goal=at(tip).lerp(goal,blend);
 const origin=at(mcp),second=at(pip),third=at(dip);
 const a=origin.distanceTo(second),b=second.distanceTo(third),c=third.distanceTo(at(tip));
 const axis=goal.clone().sub(origin).normalize();
 const distance=T.MathUtils.clamp(goal.distanceTo(origin),(a+b+c)*.48,(a+b+c)*.987);
 const curl=T.MathUtils.lerp(.25,1.0,1-T.MathUtils.smoothstep(distance/(a+b+c),.47,1));
 const span=Math.sqrt(b*b+c*c+2*b*c*Math.cos(curl));
 const along=(a*a-span*span+distance*distance)/(2*distance);
 const pole=frame.palm.clone().negate();
 if(digit==='Thumb')pole.copy(frame.radial).multiplyScalar(.9).addScaledVector(frame.palm,-.2);
 pole.addScaledVector(axis,-pole.dot(axis));
 if(pole.lengthSq()<.01)pole.copy(frame.forward).addScaledVector(axis,-frame.forward.dot(axis));
 pole.normalize();
 const knee=origin.clone().addScaledVector(axis,along).addScaledVector(pole,Math.sqrt(Math.max(0,a*a-along*along)));
 aim(mcp,pip,knee.clone().sub(origin));
 const end=origin.clone().addScaledVector(axis,distance),toTip=end.clone().sub(knee).normalize();
 const hinge=pole.clone().addScaledVector(toTip,-pole.dot(toTip)).normalize();
 const bAlong=(b*b-c*c+span*span)/(2*span);
 const last=knee.clone().addScaledVector(toTip,bAlong).addScaledVector(hinge,Math.sqrt(Math.max(0,b*b-bAlong*bAlong)));
 aim(pip,dip,last.clone().sub(knee));aim(dip,tip,end.sub(last));
}

export function positionChopsticks(bones,side,pair){
 const f=handFrame(bones,side);
 const toward=f.forward.clone().multiplyScalar(.52).addScaledVector(f.radial,-.68).addScaledVector(f.palm,.50).normalize();
 const y=toward.clone().negate();
 const x=f.radial.clone().addScaledVector(y,-f.radial.dot(y)).normalize();
 const z=x.clone().cross(y);
 const grip=f.middle.clone().addScaledVector(f.forward,.018).addScaledVector(f.radial,.008).addScaledVector(f.palm,.034);
 const origin=grip.addScaledVector(toward,.045);
 const rotation=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x,y,z));
 pair.position.copy(pair.parent.worldToLocal(origin));
 pair.quaternion.copy(pair.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(rotation));
}

const chopstickPoses=new WeakMap();
function openSticks(pair,opening){
 // Choji & Saito, J Phys Ther Sci 36 (2024), 551–556. The lower shaft
 // stays in the ring-finger/web support; only the upper shaft pivots.
 const [lower,upper]=pair.children;
 lower.rotation.z=.032;upper.rotation.z=-.032+.135*opening;
 lower.position.x=-.007+.045*Math.sin(lower.rotation.z);
 upper.position.x=.007+.045*Math.sin(upper.rotation.z);
}
function fitChopstickPads(bones,side,pair){
 const f=handFrame(bones,side),[lower,upper]=pair.children;
 for(const [digit,rod,y,radial,palmar] of [
  ['Thumb',upper,.067,.003,-.003],['Index',upper,.021,.001,-.005],['Middle',upper,.013,-.002,.004],
  ['Ring',lower,-.024,-.004,.003],['Pinky',lower,-.040,-.003,.008]
 ]){
  const centre=rod.localToWorld(new T.Vector3(0,y,0));
  const along=new T.Vector3(0,1,0).applyQuaternion(rod.getWorldQuaternion(new T.Quaternion()));
  const normal=f.radial.clone().multiplyScalar(radial).addScaledVector(f.palm,palmar);
  normal.addScaledVector(along,-normal.dot(along)).normalize();
  const sideOfRods=new T.Vector3(0,0,1).applyQuaternion(pair.getWorldQuaternion(new T.Quaternion()));
  if(normal.dot(sideOfRods)<0)sideOfRods.negate();
  if(digit==='Middle'||digit==='Thumb')normal.lerp(sideOfRods,.68).normalize();
  const target=centre.clone().addScaledVector(normal,.005);
  const bone=bones[side+'Hand'+digit+'3'],surface=weightedPads.get(bone);
  const tracks=[lower,upper].map(shaft=>[shaft.getWorldPosition(vec()),new T.Vector3(0,1,0).applyQuaternion(shaft.getWorldQuaternion(new T.Quaternion()))]);
  for(let i=0;i<9;i++){
   fingerContact(bones,side,digit,target,f);
   if(digit==='Pinky'||!surface)break;
   bones[side+'Hand'].updateWorldMatrix(true,true);
   const pos=vec(),radial=vec(),closest=vec();let distance=Infinity,padSide=Infinity;
   for(const [mesh,index] of surface){
    mesh.getVertexPosition(index,pos).applyMatrix4(mesh.matrixWorld);
    padSide=Math.min(padSide,radial.copy(pos).sub(centre).dot(sideOfRods));
    for(const [origin,shaftAxis] of tracks){
     radial.copy(pos).sub(origin);radial.addScaledVector(shaftAxis,-radial.dot(shaftAxis));
     if(radial.lengthSq()<distance){distance=radial.lengthSq();closest.copy(radial);}
    }
   }
   distance=Math.sqrt(distance);
   // Both shafts lie in this plane. Keep the entire pad outside the plane
   // while placing the closest part of the pad against its supporting shaft.
   const correction=closest.normalize().multiplyScalar(.0029-distance);
   const separation=.0025-padSide;
   if(correction.dot(sideOfRods)<separation)correction.addScaledVector(sideOfRods,separation-correction.dot(sideOfRods));
   if(correction.lengthSq()<.00000016)break;
   target.add(correction.clampLength(0,.011));
  }
 }
}

// The rods are registered to the palm. Once a shape is fitted for an aperture,
// keep it in joint-local space while the shoulder, elbow and wrist carry it.
export function applyChopstickGrip(bones,side,pair,opening){
 let cache=chopstickPoses.get(pair);
 if(!cache){
  const joints=['Thumb','Index','Middle','Ring','Pinky'].flatMap(f=>[1,2,3].map(i=>bones[side+'Hand'+f+i]));
  cache={joints,shapes:new Map()};chopstickPoses.set(pair,cache);
 }
 const u=T.MathUtils.clamp(opening,0,1)*12,lo=Math.floor(u),hi=Math.ceil(u);
 for(const key of new Set([lo,hi])){
  if(cache.shapes.has(key))continue;
  openSticks(pair,key/12);fitChopstickPads(bones,side,pair);
  cache.shapes.set(key,cache.joints.map(j=>j.quaternion.clone()));
 }
 openSticks(pair,opening);
 const a=cache.shapes.get(lo),b=cache.shapes.get(hi);
 cache.joints.forEach((joint,i)=>joint.quaternion.slerpQuaternions(a[i],b[i],u-lo));
}

export function applyCupGrip(bones,side,cup,amount,diameter=cup.userData.diameter??.079){
 const f=handFrame(bones,side),centre=cup.getWorldPosition(vec()),up=new T.Vector3(0,1,0);
 const near=f.wrist.clone().sub(centre);near.y=0;near.normalize();
 const around=up.clone().cross(near);
 if(around.dot(f.radial)<0)around.negate();
 // The thumb opposes the index and middle. The other two fingers support
 // the sloped lower wall; their pads stay above the tabletop.
 for(const [digit,angle,h] of [['Thumb',1.03,.33],['Index',-1.80,.42],['Middle',-1.48,.29],['Ring',-1.15,.18],['Pinky',-.79,.13]]){
  const normal=near.clone().multiplyScalar(Math.cos(angle)).addScaledVector(around,Math.sin(angle));
  const radius=(.28+.215*T.MathUtils.smoothstep(h,.02,.42))*diameter+.005;
  const target=centre.clone().addScaledVector(normal,radius).addScaledVector(up,h*diameter);
  const bone=bones[side+'Hand'+digit+'3'];
  for(let i=0;i<3;i++){
   fingerContact(bones,side,digit,target,f,amount);
   if(amount<=0)break;
   const gap=skinDistance(bone,p=>{
    const dy=(p.y-centre.y)/diameter;
    if(dy<.02||dy>.44)return Infinity;
    const r=dy<.19?.27+(dy-.02)*.07/.17:dy<.35?.34+(dy-.19)*.14/.16:.48+.02*T.MathUtils.smoothstep(dy,.35,.43);
    return Math.hypot(p.x-centre.x,p.z-centre.z)-r*diameter;
   });
   if(gap===null||!Number.isFinite(gap))break;
   const error=.001-gap;
   if(Math.abs(error)<.0006||(amount<.99&&error<0))break;
   target.addScaledVector(normal,T.MathUtils.clamp(error,-.008,.012));
  }
 }
}
