import * as T from 'three';
import {applyChopstickGrip,positionChopsticks} from './reunion-hand-poses.js';

const v=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const ease=T.MathUtils.smootherstep;
const forward=v(0,0,-1),across=v(-1,0,0),left=v(-1,0,0);

// Render the player's own seated arm through the eye camera. Keep the upper
// arm and shoulder on the original skeleton so reaching has a physical limit.
function firstPersonSleeve(player){
 const parts=[];
 player.model.traverse(mesh=>{
  if(!mesh.isSkinnedMesh)return;
  const source=mesh.geometry,{skinIndex,skinWeight}=source.attributes;
  const right=mesh.skeleton.bones.map(b=>/Right(Shoulder|Arm|ForeArm|Hand)/.test(b.name));
  const inSleeve=new Uint8Array(skinIndex.count);
  for(let i=0;i<inSleeve.length;i++){
   let weight=0;
   for(let j=0;j<4;j++)if(right[skinIndex.getComponent(i,j)])weight+=skinWeight.getComponent(i,j);
   inSleeve[i]=weight>.48;
  }
  const indices=[],index=source.index;
  for(let i=0;i<index.count;i+=3){
   const a=index.getX(i),b=index.getX(i+1),c=index.getX(i+2);
   if(inSleeve[a]&&inSleeve[b]&&inSleeve[c])indices.push(a,b,c);
  }
  let sleeve;
  if(indices.length){
   sleeve=new T.BufferGeometry();
   for(const [key,attribute] of Object.entries(source.attributes))sleeve.setAttribute(key,attribute);
   sleeve.setIndex(indices);
  }
  parts.push({mesh,source,sleeve,visible:mesh.visible});
 });
 return active=>{
  for(const {mesh,source,sleeve,visible} of parts){
   mesh.geometry=active&&sleeve?sleeve:source;
   mesh.visible=visible&&(!active||Boolean(sleeve));
  }
 };
}

export function createPlayerMeal({player,actor,placeHand,shot,sticks,bite,shared,table}){
 const showSleeve=firstPersonSleeve(player);
 const bones=player.bones,tip=v();
 const armJoints=['Spine','RightArm','RightForeArm','RightHand'];
 const reachPalm=v(-.65,-.75,-.08).normalize(),reachFingers=v(-.40,-.16,-.90).normalize();
 let action;
 function stage(id){
  const active=['chicken','fish','passFish'].includes(id);
  showSleeve(false);
  if(!active)return;
  actor('player',2.08,.19,-1.025,Math.PI,true);
  showSleeve(true);
  shot([2.035,1.59,-1.105],[2.07,.995,-1.70],72);
  action=servingPoses(id);
 }
 function lean(amount){
  const spine=bones.Spine;
  const axis=left.clone().applyQuaternion(spine.parent.getWorldQuaternion(new T.Quaternion()).invert());
  spine.quaternion.copy(player.neutral.Spine)
   .premultiply(new T.Quaternion().setFromAxisAngle(axis,amount));
 }
 function applyArm(wrist,palm,along){
  // Start each solve from the seated pose instead of accumulating wrist twist.
  for(const key of ['RightArm','RightForeArm','RightHand'])bones[key].quaternion.copy(player.neutral[key]);
  placeHand(bones,'Right',wrist,forward,across,3.2,palm,along.clone());
 }
 function measureTip(){
  const [fixed,moving]=sticks.children;
  tip.copy(fixed.localToWorld(v(0,-.121,0))).lerp(moving.localToWorld(v(0,-.121,0)),.5);
 }
 function setSticks(open){
  positionChopsticks(bones,'Right',sticks);
  applyChopstickGrip(bones,'Right',sticks,open);
  measureTip();
 }
 function armPose(tilt,wrist,palm=reachPalm,fingers=reachFingers,contact){
  lean(tilt);
  // Solve each contact pose once. A damped Jacobian corrects the wrist in
  // directions the arm can actually move with the current joint limits.
  function sample(at){
   applyArm(at,palm,fingers);
   positionChopsticks(bones,'Right',sticks);measureTip();
   return tip.clone();
  }
  const pose=()=>armJoints.map(name=>bones[name].quaternion.clone());
  applyArm(wrist,palm,fingers);setSticks(.72);
  if(!contact)return pose();
  let best=pose(),bestDistance=tip.distanceToSquared(contact);
  const basis=[v(1,0,0),v(0,1,0),v(0,0,1)];
  for(let pass=0;pass<14&&bestDistance>2.5e-7;pass++){
   const origin=sample(wrist);
   const columns=basis.map(e=>sample(wrist.clone().addScaledVector(e,.001)).sub(origin).multiplyScalar(1000));
   const [a,b,c]=columns;
   const jt=new T.Matrix3().set(a.x,a.y,a.z,b.x,b.y,b.z,c.x,c.y,c.z);
   const normal=jt.clone().multiply(jt.clone().transpose());
   for(const j of [0,4,8])normal.elements[j]+=.025;
   const delta=contact.clone().sub(origin).applyMatrix3(jt).applyMatrix3(normal.invert()).clampLength(0,.065);
   let accepted=false;
   for(const step of [1,.5,.25]){
    const next=wrist.clone().addScaledVector(delta,step),distance=sample(next).distanceToSquared(contact);
    if(distance>=bestDistance)continue;
    wrist.copy(next);bestDistance=distance;best=pose();accepted=true;break;
   }
   if(!accepted)break;
  }
  armJoints.forEach((name,i)=>bones[name].quaternion.copy(best[i]));
  return best;
 }
 function servingPoses(mode){
  const chicken=mode==='chicken',sharing=mode==='passFish';
  const pick=table.localToWorld(chicken?v(.043,.073,.068):v(.055,.077,-.149));
  const tilt=sharing?.34:.25;
  const home=armPose(.055,v(2.31,1.19,-1.26),reachPalm,reachFingers,v(2.23,1.112,-1.445));
  const pinched=armPose(tilt,pick.clone().add(v(.08,.14,.20)),reachPalm,reachFingers,pick);
  const wristAtDish=bones.RightHand.getWorldPosition(v());
  const above=armPose(tilt,wristAtDish.add(v(0,.055,0)),reachPalm,reachFingers,pick.clone().add(v(0,.057,0)));
  const bowl=shared.getWorldPosition(v());
  let carrying,served;
  if(sharing){
   const hover=bowl.clone().add(v(.04,.095,.042));
   carrying=armPose(.36,hover.clone().add(v(.10,.12,.19)),reachPalm,reachFingers,hover);
   served=armPose(.36,bowl.clone().add(v(.10,.13,.20)),reachPalm,reachFingers,bowl);
  }else{
   carrying=armPose(.09,v(2.273,1.241,-1.32),v(-.79,-.46,.38),v(-.72,.48,-.28));
   served=armPose(.04,v(2.23,1.33,-1.24),v(-.3,0,.7),v(-.3,.75,.55),v(2.08,1.444,-1.105));
  }
  return {pick,frames:[[0,home],[.61,above],[.88,pinched],[1.13,pinched],[1.51,above],[2.00,carrying],
   [2.62,served],[2.91,served],[3.38,carrying],[4.04,home]]};
 }
 function serve(mode,time){
  const {pick,frames}=action;
  let i=1;while(i<frames.length-1&&time>frames[i][0])i++;
  const [fromTime,from]=frames[i-1],[toTime,to]=frames[i];
  const phase=ease(time,fromTime,toTime);
  armJoints.forEach((name,j)=>bones[name].quaternion.copy(from[j]).slerp(to[j],phase));
  const opening=1-.28*ease(time,.85,1.12)+.28*ease(time,2.68,2.89);
  setSticks(opening);
  sticks.visible=true;bite.visible=time<2.78;
  const lifted=time>=1.12;
  bite.position.copy(bite.parent.worldToLocal((lifted?tip:pick).clone()));
  if(lifted)bite.quaternion.copy(sticks.quaternion);
  if(mode==='passFish')shared.visible=time>=2.78;
 }
 function tick(mode,seconds){
  if(['chicken','fish','passFish'].includes(mode))serve(mode,seconds);
 }
 return {stage,tick};
}
