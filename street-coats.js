import * as T from 'three';
import {createPlayerForearm} from './reunion-boards.js';
import {fingerContact,handFrame} from './reunion-hand-poses.js';

const v=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const smooth=(t,a,b)=>T.MathUtils.smoothstep(t,a,b);
const duration=2100;
const sides={original:'Right',loan:'Left'};

// Each garment is a single scene object. During the exchange both people
// grip opposite shoulders of this same object.
export function createStreetCoats(scene,camera,actors,models,kit){
 const hands={},owners={original:null,loan:null};
 let pass=null;
 for(const [kind,coat] of Object.entries(models)){
  const side=sides[kind],hand=createPlayerForearm(actors.get('friend'),side);
  // Carry the existing sleeve past the camera edge when the arm reaches
  // forward. Keep the wrist, cuff and finger skin in their original positions.
  hand.root.traverse(mesh=>{
   if(!mesh.isSkinnedMesh)return;
   const positions=mesh.geometry.attributes.position;
   for(let i=0;i<positions.count;i++){
    const y=positions.getY(i);
    if(y<-.145)positions.setY(i,y+(y+.145)*6);
   }
   positions.needsUpdate=true;
  });
  hands[kind]=hand;
  scene.add(coat,hand.root);
  coat.visible=hand.root.visible=false;
  const f=handFrame(hand.bones,side);
  const pinch=f.middle.clone().addScaledVector(f.forward,.033).addScaledVector(f.palm,.023);
  for(const [digit,offset] of [['Index',0],['Thumb',.008],['Middle',-.018],['Ring',-.030],['Pinky',-.040]]){
   const target=pinch.clone().addScaledVector(f.radial,offset);
   if(digit==='Thumb')target.addScaledVector(f.palm,.010);
   fingerContact(hand.bones,side,digit,target,f);
  }
  hand.grip=pinch;
 }
 function show(current){Object.assign(owners,current);}
 function transfer(kind,npc,receiving){
  pass={kind,npc,receiving,start:performance.now()};
 }
 kit.coatHandOccupied=(id,side)=>Object.keys(owners).some(kind=>sides[kind]===side&&(owners[kind]===id||pass?.kind===kind&&pass.npc===id));
 function pose(kind,now){
  const coat=models[kind],hand=hands[kind],moving=pass?.kind===kind;
  const side=sides[kind],sign=side==='Right'?1:-1;
  const npc=moving?pass.npc:owners[kind]!=='player'&&owners[kind];
  const actor=npc&&actors.get(npc)?.model;
  coat.visible=moving||owners[kind]==='player'||!!actor?.visible;
  hand.root.visible=moving||owners[kind]==='player';
  if(!coat.visible)return;
  // Keep the two jackets at different depths even in a narrow portrait view.
  // Each grip remains in place when the other garment changes hands.
  const playerCentre=camera.localToWorld(v(sign*Math.min(.33,camera.aspect*.19),kind==='loan'?-.12:-.145,kind==='loan'?-.84:-.69));
  // Keep the garment hanging vertically while the player looks around.
  const cameraYaw=new T.Euler().setFromQuaternion(camera.quaternion,'YXZ').y;
  const playerRot=new T.Quaternion().setFromEuler(new T.Euler(.09,cameraYaw,sign*-.07,'YXZ'));
  const shoulder=v(sign*.131,-.014,0);
  const npcShoulder=shoulder.clone().negate();npcShoulder.y=shoulder.y;
  const gripAt=(centre,rotation,offset)=>offset.clone().applyQuaternion(rotation).add(centre);
  let centre=playerCentre,rotation=playerRot,playerGrip;
  if(actor){
   const npcRot=new T.Quaternion().setFromAxisAngle(v(0,1,0),actor.rotation.y);
   const rest=actor.localToWorld(v(-sign*.17,.645,kind==='loan'?.32:.245));
   const npcCentre=rest.clone().sub(npcShoulder.clone().applyQuaternion(npcRot));
   centre=npcCentre;rotation=npcRot;
   if(moving){
    const t=Math.min(1,(now-pass.start)/duration),fromPlayer=!pass.receiving;
    const toward=camera.position.clone().sub(actor.position);toward.y=0;toward.normalize();
    const meetRot=new T.Quaternion().setFromAxisAngle(v(0,1,0),Math.atan2(toward.x,toward.z));
    const meet=actor.position.clone().addScaledVector(toward,.56);meet.y=rest.y+.075;
    const source=fromPlayer?playerCentre:npcCentre,dest=fromPlayer?npcCentre:playerCentre;
    const sourceRot=fromPlayer?playerRot:npcRot,destRot=fromPlayer?npcRot:playerRot;
    centre=source.clone().lerp(meet,smooth(t,0,.38)).lerp(dest,smooth(t,.66,1));
    rotation=sourceRot.clone().slerp(meetRot,smooth(t,0,.38)).slerp(destRot,smooth(t,.66,1));
    const playerContact=gripAt(centre,rotation,shoulder);
    const npcContact=gripAt(centre,rotation,npcShoulder);
    const parked=camera.localToWorld(v(sign*.45,-.53,-.25));
    const playerWeight=fromPlayer?1-smooth(t,.61,.88):smooth(t,.07,.39);
    playerGrip=parked.lerp(playerContact,playerWeight);
    const npcWeight=fromPlayer?smooth(t,.07,.39):1-smooth(t,.61,.88);
    const released=actor.localToWorld(v(-sign*.17,.425,.085));
    const actual=kit.coatGrip(npc,side,released.lerp(npcContact,npcWeight),npcWeight);
    // Before or after the shared grip the cloth follows its owner's palm.
    const heldByNpc=fromPlayer?smooth(t,.07,.38):1-smooth(t,.62,.9);
    const correction=actual.sub(npcContact).multiplyScalar(heldByNpc);
    centre.add(correction);playerGrip.addScaledVector(correction,playerWeight);
   }else if(actor.position.distanceToSquared(camera.position)<100){
    const actual=kit.coatGrip(npc,side,rest,1);
    centre=actual.sub(npcShoulder.clone().applyQuaternion(rotation));
   }
  }
  coat.position.copy(centre);coat.quaternion.copy(rotation);
  if(hand.root.visible){
   playerGrip??=gripAt(centre,rotation,shoulder);
   // Fingers approach the collar from above and behind. The forearm runs
   // down and out of the camera frame, keeping the grip clear of the cloth.
   const forward=v(-sign*.43,.40,-.81).applyQuaternion(camera.quaternion).normalize();
   const radial=v(sign,0,0).applyQuaternion(camera.quaternion);
   radial.addScaledVector(forward,-radial.dot(forward)).normalize();
   if(side==='Left')radial.negate();
   const palm=radial.clone().cross(forward).normalize();
   hand.root.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(radial,forward,palm));
   hand.root.position.copy(playerGrip).sub(hand.grip.clone().applyQuaternion(hand.root.quaternion));
  }
 }
 return {show,transfer,get moving(){return !!pass;},update(){
  const now=performance.now();
  if(pass&&now-pass.start>=duration)pass=null;
  for(const kind of Object.keys(models))pose(kind,now);
 }};
}
