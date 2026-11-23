import * as T from 'three';
import {MARKET_ROOMS} from './street-space.js';

// The grocer's original signage, windows and displays share a GLB node.
// Preserve the residential shell and floor behind the two market entrances.
export function clearFormerGrocer(district){
 const ground=district.getObjectByName('market-back_|_market-back');
 const shell=new Set(['pink','terrazzo']);
 ground.traverse(mesh=>{
  if(!mesh.isMesh)return;
  if(mesh.material.name!=='cream'){
   mesh.visible=shell.has(mesh.material.name);
   return;
  }
  // The slab between the ground and first floors shares the display trim.
  const geometry=mesh.geometry,index=geometry.index,positions=geometry.attributes.position;
  const slab=[];
  for(let i=0;i<index.count;i+=3){
   const a=index.getX(i),b=index.getX(i+1),c=index.getX(i+2);
   if(Math.min(positions.getY(a),positions.getY(b),positions.getY(c))>3.3)slab.push(a,b,c);
  }
  geometry.setIndex(slab);
 });
}

// Measurements are in the district's world space. Fixtures in this file stay
// behind existing counters and leave the navigation raster clear.
export function dressStoryShops(scene,env){
 const cube=new T.BoxGeometry(1,1,1),drum=new T.CylinderGeometry(.5,.5,1,32),ball=new T.SphereGeometry(.5,20,14),mats=new Map();
 function piece(parent,geo,color,x,y,z,w,h,d){
  if(!mats.has(color))mats.set(color,new T.MeshStandardMaterial({color,roughness:.64}));
  const m=new T.Mesh(geo,mats.get(color));m.position.set(x,y,z);m.scale.set(w,h,d);parent.add(m);m.receiveShadow=true;return m;
 }
 const box=(p,c,x,y,z,w,h,d)=>piece(p,cube,c,x,y,z,w,h,d);
 const cyl=(p,c,x,y,z,w,h,d)=>piece(p,drum,c,x,y,z,w,h,d);
 function sign(p,words,x,y,z,w,h,angle=0,color='#803f35'){
  const c=document.createElement('canvas');c.width=512;c.height=160;const g=c.getContext('2d');g.fillStyle=color;g.fillRect(0,0,512,160);g.strokeStyle='#dbca9d';g.strokeRect(9,9,494,142);g.textAlign='center';g.textBaseline='middle';g.fillStyle='#f6e9ce';g.font='bold 65px serif';g.fillText(words,256,84,475);
  const map=new T.CanvasTexture(c);map.colorSpace=T.SRGBColorSpace;
  const m=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshStandardMaterial({map,side:T.DoubleSide}));p.add(m);m.position.set(x,y,z);m.rotation.y=angle;return m;
 }
 // Keep the vintage merchandise, rails and counters inside two shop rooms.
 // The passage between the two entrances opens onto the empty rear bay.
 clearFormerGrocer(env);
 for(const room of MARKET_ROOMS){
  const display=env.getObjectByName(room.id+'_|_'+room.id);
  display.position.z=room.z;display.scale.x=room.width/4.85;
  display.traverse(m=>{
   if(!m.isMesh)return;
   const g=m.geometry,idx=g.index,pos=g.attributes.position,keep=[];
   for(let i=0;i<idx.count;i+=3){
    const a=idx.getX(i),b=idx.getX(i+1),c=idx.getX(i+2);
    const floor=Math.min(pos.getY(a),pos.getY(b),pos.getY(c));
    if(floor>=2.24 || (['blue','linen','red'].includes(m.material.name)&&floor>2.07))continue;
    if(m.material.name==='rail')continue;
    keep.push(a,b,c);
   }
   g.setIndex(keep);
  });
  const trim=room.id==='records'?0x6e4034:0x355951;
  const w=room.width,z=room.z;
  for(const side of [-1,1]){
   box(scene,0xd6c6a8,-17.55,1.42,z+side*w/2,5.2,2.62,.10);
   box(scene,trim,-14.96,1.38,z+side*w/2,.13,2.53,.14);
  }
  box(scene,0xd6c6a8,-17.55,2.78,z,5.30,.17,w+.12);
  box(scene,trim,-14.94,2.57,z,.16,.46,w+.14);
  sign(scene,room.sign,-14.85,2.57,z,w-.19,.39,Math.PI/2,room.id==='records'?'#713d32':'#35574e');
 }
 const laundry=env.getObjectByName('laundry_|_laundry');
 // Tint the diffuse artwork locally so the plaster grain and tile seams survive.
 const laundryFinishes={aqua:[204,208,207],tile:[125,148,158]};
 laundry?.traverse(m=>{
  if(!m.isMesh)return;const g=m.geometry,pos=g.attributes.position,idx=g.index;if(!idx)return;
  const tint=laundryFinishes[m.material.name],source=m.material.map;
  if(tint&&source?.image){
   const image=source.image,c=document.createElement('canvas');
   c.width=image.width;c.height=image.height;
   const ctx=c.getContext('2d');ctx.drawImage(image,0,0);
   const pixels=ctx.getImageData(0,0,c.width,c.height),data=pixels.data;
   let total=0;for(let i=0;i<data.length;i+=4)total+=data[i]*.213+data[i+1]*.715+data[i+2]*.072;
   const mean=total/(data.length/4);
   for(let i=0;i<data.length;i+=4){
    const shade=(data[i]*.213+data[i+1]*.715+data[i+2]*.072)/mean;
    for(let channel=0;channel<3;channel++)data[i+channel]=tint[channel]*shade;
   }
   ctx.putImageData(pixels,0,0);
   const map=source.clone();map.source=new T.Source(c);map.needsUpdate=true;
   m.material=m.material.clone();m.material.map=map;m.material.color.setHex(0xffffff);
  }
  const keep=[];
  for(let i=0;i<idx.count;i+=3){
   const v=[idx.getX(i),idx.getX(i+1),idx.getX(i+2)],inside=v.every(j=>pos.getX(j)>1.1&&pos.getX(j)<3.28&&pos.getZ(j)>-1.64&&pos.getZ(j)<-.76);
   if(inside&&['cream','blue'].includes(m.material.name)&&v.every(j=>pos.getY(j)>1.28&&pos.getY(j)<1.56))continue;
   if(['cloth','seat','linen','blue','cream'].includes(m.material.name)&&v.every(j=>pos.getZ(j)<-2.84&&pos.getZ(j)>-3.08&&pos.getY(j)>1.52&&pos.getY(j)<2.42))continue;
   keep.push(...v);
  }
  if(keep.length!==idx.count)g.setIndex(keep);
  if(['terrazzo','tile'].includes(m.material.name)){
   for(let j=0;j<pos.count;j++)if(pos.getX(j)>1.1&&pos.getX(j)<3.28&&pos.getZ(j)>-1.64&&pos.getZ(j)<-.76&&pos.getY(j)>1.18&&pos.getY(j)<1.29)pos.setY(j,pos.getY(j)-.24);
   pos.needsUpdate=true;g.computeBoundingSphere();
  }
 });
 const wine=0x803e38,brass=0xa78355,cream=0xe5d7ba,iron=0x3e4548,wood=0x84583e;
 for(const z of [-2.65,-1.81]){
  box(scene,0xc9cbc3,18.39,.72,z,.65,1.0,.77);
  for(const [c,size,x] of [[iron,.54,18.056],[0x889797,.47,18.037],[0x38454b,.37,18.020]]){
   cyl(scene,c,x,.69,z,size,.026,size).rotation.z=Math.PI/2;
  }
  box(scene,0x545653,18.05,1.09,z,.025,.105,.59);
  for(let i=0;i<3;i++)cyl(scene,i===0?wine:cream,18.027,1.09,z-.18+i*.16,.056,.018,.056).rotation.z=Math.PI/2;
 }
 for(let i=0;i<2;i++){
  const z=-2.13+i*3.57;cyl(scene,iron,16.94,2.92,z,.018,.57,.018);
  const shade=new T.ConeGeometry(.22,.14,28,1,true);piece(scene,shade,0x754b3b,16.94,2.57,z,1,1,1);
  cyl(scene,cream,16.94,2.506,z,.39,.012,.39);
 }
 sign(scene,'收衣  ｜  取件',18.92,1.64,-1.52,1.19,.20,-Math.PI/2,'#756354');
 sign(scene,'芳記洗衣 · 熨衫',18.91,2.15,-1.56,1.55,.38,-Math.PI/2);
 for(let i=0;i<8;i++){
  const z=-2.88+i*.68,x=17.32;
  const hanger=new T.Group();hanger.position.set(x,0,z);hanger.rotation.y=-Math.PI/2+.16*Math.sin(i*2);scene.add(hanger);
  cyl(hanger,brass,0,2.32,0,.016,.145,.016);
  for(const side of [-1,1])box(hanger,wood,side*.095,2.22,0,.22,.024,.039).rotation.z=-side*.30;
  const color=[0x935047,0x62717d,0xd5bb9a,0x464b4c][i%4];
  const gar=new T.Shape();gar.moveTo(-.073,0);gar.lineTo(-.235,-.072);gar.lineTo(-.286,-.36);gar.lineTo(-.207,-.385);gar.lineTo(-.159,-.215);gar.lineTo(-.163,-.66);gar.quadraticCurveTo(0,-.70,.162,-.65);gar.lineTo(.158,-.215);gar.lineTo(.208,-.385);gar.lineTo(.284,-.36);gar.lineTo(.233,-.072);gar.lineTo(.075,0);gar.quadraticCurveTo(0,-.084,-.073,0);
  const jacket=piece(hanger,new T.ExtrudeGeometry(gar,{depth:.055,bevelSize:.014,bevelThickness:.014,bevelSegments:2,steps:1}),color,0,2.215,0,1,1,1);
  for(const side of [-1,1])box(jacket,cream,side*.038,-.047,.078,.088,.019,.013).rotation.z=side*.74;
  for(let k=0;k<3;k++)piece(jacket,ball,iron,0,-.16-k*.093,.078,.015,.015,.012);
  box(jacket,cream,.109,-.16,.078,.044,.065,.008);
 }
 box(scene,0x526363,15.81,1.054,1.19,.37,.014,.63);
 const pressing=new T.Group();scene.add(pressing);
 box(pressing,0xa5b3bf,15.85,1.068,1.18,.28,.012,.48);
 box(pressing,0x8395a4,15.85,1.077,.99,.27,.008,.067);
 piece(pressing,ball,cream,15.94,1.083,.99,.019,.009,.019);
 // Sorting pigeonholes with claim tickets and paper-wrapped orders.
 for(let row=0;row<3;row++)for(let col=0;col<4;col++){
  const x=18.66,y=.85+row*.36,z=.05+col*.43;
  box(scene,wood,x,y,z,.44,.035,.43);box(scene,wood,x,y+.16,z-.21,.44,.32,.026);
  box(scene,row%2?0xb49773:0xc6b597,x-.04,y+.10,z,.37,.14,.34);box(scene,cream,x-.235,y+.103,z,.01,.09,.09);
 }
 // A record player's controls, sleeves in slanted bins and a price card.
 function player(p,x,y,z){
  box(p,wood,x,y,z,.47,.094,.34);const disc=cyl(p,0x282425,x-.048,y+.055,z,.27,.015,.27);
  cyl(p,0xab4c3d,x-.048,y+.067,z,.078,.006,.078);box(p,brass,x+.127,y+.084,z-.006,.018,.018,.19).rotation.y=-.32;
  return disc;
 }
 box(scene,wood,-15.96,.56,-6.35,.58,.88,.71);
 player(scene,-15.96,1.04,-6.35);
 for(let k=0;k<3;k++){
  const z=-6.48+k*.52;box(scene,wood,-16.45,.99,z,.53,.36,.48);
  for(let j=0;j<6;j++){
   const sleeve=box(scene,[wine,iron,cream,0xa47d49][(k+j)%4],-16.60+j*.055,1.19,z,.027,.34,.36);sleeve.rotation.z=-.16;
   box(scene,cream,sleeve.position.x+.02,1.32,z,.01,.036,.24);
  }
 }
 sign(scene,'二手黑膠',-16.54,1.58,-6.48,.46,.17,Math.PI/2);
 // Tailor's machine with flywheel, needle, spool pins and sample card.
 box(scene,wood,-16.11,.55,-11.34,.53,.86,.75);
 box(scene,wood,-16.11,1.01,-11.34,.53,.065,.78);
 box(scene,iron,-16.13,1.09,-11.38,.27,.08,.48);box(scene,iron,-16.13,1.23,-11.56,.14,.3,.15);
 box(scene,iron,-16.13,1.36,-11.39,.14,.105,.42);box(scene,brass,-16.13,1.24,-11.21,.026,.20,.019);
 cyl(scene,iron,-16.13,1.34,-11.64,.19,.042,.19).rotation.x=Math.PI/2;
 for(let i=0;i<4;i++)cyl(scene,[wine,cream,brass,iron][i],-16.33,1.12,-11.59+i*.13,.066,.13,.066);
 sign(scene,'改衣 · 車邊',-16.14,1.78,-11.37,.60,.17,Math.PI/2, '#655245');
 const reunion=new T.Group();scene.add(reunion);reunion.visible=false;
 box(reunion,wood,16.17,.95,-12.20,.59,.06,.39);
 for(const x of [15.94,16.4])for(const z of [-12.34,-12.06])box(reunion,wood,x,.55,z,.045,.76,.045);
 player(reunion,16.17,1.024,-12.20);
 return {piece,box,cyl,ball,sign,reunion,pressing};
}
// Contact points live in each worker's model space. A hand follows its tool
// through reach, contact and return; conversations fade back to the rest pose.
export function createOccupations(scene,actors,kit){
 const jobs=[];
 for(const id of ['fang','ale','ling','aming','regular','buyer','lin','vendor','friend','aqing']){
  const actor=actors.get(id),model=actor.model,bones={};
  model.traverse(b=>{if(b.isBone)bones[b.name.replace(/^mixamorig[:_]?/i,'')]=b;});
  if(!bones.RightHand)continue;
  const base=new Map();
  for(const k of ['RightArm','RightForeArm','LeftArm','LeftForeArm','Head','Spine1'])if(bones[k])base.set(bones[k],bones[k].quaternion.clone());
  for(const [name,bone] of Object.entries(bones))if(name.includes('Hand'))base.set(bone,bone.quaternion.clone());
  const left=new T.Group(),right=new T.Group();scene.add(left,right);left.visible=right.visible=false;
  const {box,cyl,piece,ball}=kit;
  if(id==='fang'){
   piece(right,ball,0x636c70,0,-.039,.022,.087,.033,.18);box(right,0x994c3c,0,-.016,.007,.072,.045,.109);box(right,0x42372c,0,.017,0,.024,.021,.08);
  }else if(id==='aqing'){
   kit.purchaseCoat.position.set(-.13,-.005,-.020);left.add(kit.purchaseCoat);
  }else if(id==='ale'){
   const lp=cyl(left,0x282324,.085,.018,.028,.27,.013,.27);cyl(lp,0xc46946,0,.66,0,.31,.12,.31);
   box(right,0xddc7a4,0,-.008,0,.077,.016,.066);
  }else if(id==='aming'){
   const pad=new T.Group();pad.rotation.x=-.05;left.add(pad);
   box(pad,0x69432e,-.095,.012,0,.205,.012,.252);
   box(pad,0xf3e3bf,-.095,.020,0,.191,.006,.232);
   const paper=document.createElement('canvas');paper.width=304;paper.height=368;
   const ink=paper.getContext('2d');ink.fillStyle='#f3e3bf';ink.fillRect(0,0,304,368);
   ink.fillStyle='#544a41';ink.font='bold 36px serif';ink.fillText('粵記  點單紙',22,58);
   ink.font='28px serif';['熱奶茶　少甜','菠蘿油　堂食'].forEach((line,i)=>ink.fillText(line,24,135+i*62));
   for(const y of [78,148,210,272,334]){ink.fillStyle='#b4a48a';ink.fillRect(18,y,268,2);}
   const map=new T.CanvasTexture(paper);map.colorSpace=T.SRGBColorSpace;
   const sheet=new T.Mesh(new T.PlaneGeometry(.188,.229),new T.MeshStandardMaterial({map}));
   sheet.rotation.set(-Math.PI/2,0,Math.PI);sheet.position.set(-.095,.024,0);pad.add(sheet);
   cyl(right,0x314639,0,.080,0,.009,.135,.009);
   const nib=new T.Mesh(new T.ConeGeometry(.0045,.013,8),new T.MeshStandardMaterial({color:0x484337}));
   nib.rotation.z=Math.PI;nib.position.y=.0065;right.add(nib);
  }else if(id==='vendor'){
   cyl(left,0xe8d5b7,0,.059,.017,.083,.08,.083);cyl(left,0x856143,0,.101,.017,.073,.004,.073);
   cyl(right,0x957653,0,.012,0,.008,.13,.008);
  }else if(id==='lin'){piece(right,ball,0x363332,0,-.008,0,.028,.016,.028);}
  else if(id==='ling'||id==='regular'){
   box(left,id==='ling'?0xa6624e:0x556775,.053,.037,.04,.17,.036,.22);
   if(id==='ling')box(right,0xe7cf98,0,0,.02,.016,.008,.14);
  }else if(id!=='friend'&&id!=='aqing'){
   const cover=id==='buyer';box(left,cover?0xa96845:0xdbccac,.057,.020,.04,cover?.22:.13,.012,cover?.21:.10);
   for(let i=0;i<3;i++)box(left,cover?0x795747:0xa38e76,.057,.027,i*.017-.003,.074,.002,.004);
  }
  const still=model.position.clone();jobs.push({id,actor,model,bones,base,left,right,still,weight:0,index:jobs.length});
 }
 const v=()=>new T.Vector3();
 function leanForward(bone,model,amount){
  if(!bone)return;
  const axis=v().set(1,0,0).applyQuaternion(model.getWorldQuaternion(new T.Quaternion()));
  axis.applyQuaternion(bone.parent.getWorldQuaternion(new T.Quaternion()).invert());
  bone.quaternion.premultiply(new T.Quaternion().setFromAxisAngle(axis,amount));
 }
 function aim(joint,child,target){
  const pivot=joint.getWorldPosition(v());
  const from=child.getWorldPosition(v()).sub(pivot).normalize(),to=target.clone().sub(pivot).normalize();
  if(!from.lengthSq()||!to.lengthSq())return;
  const parent=joint.parent.getWorldQuaternion(new T.Quaternion());
  const delta=new T.Quaternion().setFromUnitVectors(from,to);
  joint.quaternion.premultiply(parent.clone().invert().multiply(delta).multiply(parent));
 }
 function reach(job,side,target,weight){
  const b=job.bones,upper=b[side+'Arm'],elbow=b[side+'ForeArm'],end=b[side+'HandMiddle1']||b[side+'Hand'];
  if(!weight)return end.getWorldPosition(v());
  const root=upper.getWorldPosition(v()),bend=elbow.getWorldPosition(v()),hand=end.getWorldPosition(v());
  const goal=hand.clone().lerp(target,weight),axis=goal.clone().sub(root).normalize();
  const upperLength=root.distanceTo(bend),foreLength=hand.distanceTo(bend);
  const distance=T.MathUtils.clamp(root.distanceTo(goal),Math.abs(upperLength-foreLength)+.004,upperLength+foreLength-.004);
  const along=(upperLength**2-foreLength**2+distance**2)/(2*distance);
  const hint=v().set(side==='Left'?.86:-.86,-.8,-.16)
   .applyQuaternion(job.model.getWorldQuaternion(new T.Quaternion()));
  hint.addScaledVector(axis,-axis.dot(hint)).normalize();
  aim(upper,elbow,root.clone().addScaledVector(axis,along)
   .addScaledVector(hint,Math.sqrt(Math.max(0,upperLength**2-along**2))));
  aim(elbow,end,root.addScaledVector(axis,distance));
  return end.getWorldPosition(v());
 }
 function openPalm(job,side){
  const wrist=job.bones[side+'Hand'],middle=job.bones[side+'HandMiddle1'];
  const index=job.bones[side+'HandIndex1'],pinky=job.bones[side+'HandPinky1'];
  if(!middle||!index||!pinky)return;
  const along=middle.getWorldPosition(v()).sub(wrist.getWorldPosition(v())).normalize();
  const across=index.getWorldPosition(v()).sub(pinky.getWorldPosition(v())).normalize();
  const desired=v().set(0,1,0).cross(along).normalize();
  if(!desired.lengthSq())return;
  // Roll the palm up while keeping the knuckle in the prop's contact plane.
  if(side==='Right')desired.negate();
  const rotation=new T.Quaternion().setFromUnitVectors(across,desired);
  const axis=new T.Vector3(rotation.x,rotation.y,rotation.z);
  const twist=axis.dot(along),roll=new T.Quaternion(along.x*twist,along.y*twist,along.z*twist,rotation.w).normalize();
  const parent=wrist.parent.getWorldQuaternion(new T.Quaternion());
  wrist.quaternion.premultiply(parent.clone().invert().multiply(new T.Quaternion().slerp(roll,job.weight)).multiply(parent));
 }
 function placeFingertip(job,side,digit,target){
  const tip=job.bones[side+'Hand'+digit+'4'];
  const joints=[3,2,1].map(index=>job.bones[side+'Hand'+digit+index]);
  if(!tip||joints.some(joint=>!joint))return;
  for(let iteration=0;iteration<10;iteration++){
   if(tip.getWorldPosition(v()).distanceTo(target)<.0015)break;
   for(const joint of joints){
    const origin=joint.getWorldPosition(v());
    const from=tip.getWorldPosition(v()).sub(origin).normalize();
    const to=target.clone().sub(origin).normalize();
    const rotation=new T.Quaternion().setFromUnitVectors(from,to);
    const angle=rotation.angleTo(new T.Quaternion());
    if(angle>.18)rotation.slerp(new T.Quaternion(),1-.18/angle);
    const parent=joint.parent.getWorldQuaternion(new T.Quaternion());
    joint.quaternion.premultiply(parent.clone().invert().multiply(rotation).multiply(parent));
    const rest=job.base.get(joint),bend=rest.angleTo(joint.quaternion);
    if(bend>.85)joint.quaternion.copy(rest.clone().slerp(joint.quaternion,.85/bend));
   }
  }
 }
 kit.coatGrip=(id,side,target,grip)=>{
  const job=jobs.find(j=>j.id===id);
  const offset=new T.Vector3(0,-.006,.013).applyQuaternion(job.model.quaternion);
  const palm=reach(job,side,target.clone().sub(offset),1);
  const contact=palm.add(offset);
  if(grip>.01){
   for(const [digit,x,z] of [['Thumb',.003,.010],['Index',0,-.008],['Middle',-.012,-.007]]){
    placeFingertip(job,side,digit,contact.clone().add(new T.Vector3(x*(side==='Left'?1:-1),-.006,z).applyQuaternion(job.model.quaternion)));
   }
  }
  return contact;
 };
 return (point,engaged,now)=>{
  let changed=false;
  for(const j of jobs){
   const {model,id}=j;
   const dt=j.last===undefined?0:T.MathUtils.clamp((now-j.last)/1000,0,.1);j.last=now;
   if(!model.visible||Math.hypot(model.position.x-point.x,model.position.z-point.z)>10){j.left.visible=j.right.visible=false;continue;}
   const moved=j.still.distanceToSquared(model.position)>.00001;j.still.copy(model.position);
   if((moved||j.actor.walking)&&id!=='aqing'){j.weight=0;j.left.visible=j.right.visible=false;continue;}
   if(id==='friend'){
    j.left.visible=j.right.visible=false;
    const head=j.bones.Head;head.quaternion.copy(j.base.get(head));head.rotateY((engaged===id?.025:.09)*Math.sin(now*.00055));head.rotateX(.012*Math.sin(now*.0011));changed=true;
    continue;
   }
   const coatOnCounter=kit.coatShown&&(id==='fang'||id==='aqing'&&Math.hypot(model.position.x-15.54,model.position.z-1.19)<2.4);
   const giving=kit.coatHandOccupied(id,'Left')||kit.coatHandOccupied(id,'Right');
   const tryingPurchase=id==='aqing'&&kit.tryingPurchase&&!giving;
   const working=!coatOnCounter&&(giving||tryingPurchase||id!=='aqing'&&engaged!==id&&!(id==='vendor'&&engaged==='juiceCart'));
   if(!working&&!j.weight)continue;
   if(working&&engaged!==id&&['fang','ale','aming','ling','regular'].includes(id)){
    const delta=j.actor.spec.rotationY-model.rotation.y;
    model.rotation.y+=T.MathUtils.clamp(Math.atan2(Math.sin(delta),Math.cos(delta)),-.85*dt,.85*dt);
   }
   j.weight=T.MathUtils.clamp(j.weight+(working?3:-4)*dt,0,1);
   for(const [bone,rot] of j.base)bone.quaternion.copy(rot);
   const t=now*.001+j.index*.86,swing=Math.sin(t*1.6),lift=(1-Math.cos(t*1.6))*.5;
   let l=v().set(.07,.59,.18),r=v().set(-.042+.035*swing,.62,.18);
   switch(id){
    case 'aqing':l.set(.17,tryingPurchase?.65:.425,tryingPurchase?.27:.085);r.set(-.17,.425,.085);break;
    case 'fang': l.set(.12,.55,.22);r.set(-.073+.102*swing,.55+.032*Math.max(0,-Math.cos(t*1.6)),.24);break;
    case 'ale':l.set(.115,.56,.22);r.set(-.038+.056*Math.cos(t*2.5),.624,.26+.026*Math.sin(t*2.5));break;
    case 'ling':r.set(-.05+.08*lift,.625,.225+.035*lift);break;
    case 'lin':l.set(.10,.73,.22);r.set(-.10+.092*lift,.74+.045*Math.abs(swing),.44+.11*lift);break;
    case 'vendor':l.set(.102,.57,.24);r.set(-.052+.048*Math.cos(t*2),.660,.265+.024*Math.sin(t*2));break;
    case 'aming':l.set(.085,.61,.15);break;
    case 'regular':r.set(-.064+.05*lift,.615,.235+.037*lift);break;
    default:r.set(-.071+.073*lift,.613+.033*Math.abs(swing),.23+.027*lift);break;
   }
   leanForward(j.bones.Head,model,(id==='aqing'?(engaged===id?.025:.10):.19)*j.weight);
   if(id==='fang')leanForward(j.bones.Spine1,model,.44*j.weight);
   if(id==='fang'){
    l=model.worldToLocal(v().set(15.89,1.12,1.37));
    const stroke=1.18+swing*.135,cuff=.008*(1-T.MathUtils.smoothstep(stroke,1.08,1.14));
    r=model.worldToLocal(v().set(15.85+.015*Math.cos(t*1.6),1.130+cuff+.002*lift,stroke));
   }
   if(id==='lin'){
    r=model.worldToLocal(v().set(15.56+.10*lift,1.043+.085*lift,-12.32+.106*lift));
   }
   j.left.position.copy(reach(j,'Left',model.localToWorld(l),j.weight));
   if(id!=='aming'&&id!=='fang'&&id!=='lin'&&id!=='aqing')openPalm(j,'Left');
   j.left.rotation.y=j.right.rotation.y=model.rotation.y;
   if(id==='aming'){
    const wrist=j.bones.LeftHand,knuckle=j.bones.LeftHandMiddle1;
    const from=knuckle.getWorldPosition(v()).sub(wrist.getWorldPosition(v())).normalize();
    const toward=v().set(-1,.05,.18).normalize().applyQuaternion(model.getWorldQuaternion(new T.Quaternion()));
    const parent=wrist.parent.getWorldQuaternion(new T.Quaternion());
    const turn=new T.Quaternion().identity().slerp(new T.Quaternion().setFromUnitVectors(from,toward),j.weight);
    wrist.quaternion.premultiply(parent.clone().invert().multiply(turn).multiply(parent));
    j.left.position.copy(knuckle.getWorldPosition(v()));
    for(const digit of ['Index','Middle','Ring','Pinky']){
     for(let index=1;index<=3;index++){
      const joint=j.bones['LeftHand'+digit+index],child=j.bones['LeftHand'+digit+(index+1)];
      const direction=v().set(-1,-.025,0).applyQuaternion(model.getWorldQuaternion(new T.Quaternion()));
      aim(joint,child,joint.getWorldPosition(v()).add(direction));
     }
    }
    // Locate the nib on the page, then aim the barrel through the writing hand.
    const cycle=(t%6)/6,mark=cycle<.64?Math.min(1,(cycle%.32)/.22):1;
    const lifted=cycle>=.64?.033*Math.sin((cycle-.64)*Math.PI/.36):0;
    const tip=j.left.children[0].localToWorld(v().set(-.155+.025*mark,.025+lifted,cycle<.32?.026:-.016));
    const grip=tip.clone().add(v().set(-.032,.085,-.010).applyQuaternion(model.getWorldQuaternion(new T.Quaternion())));
    reach(j,'Right',grip,j.weight);
    const fingers=j.bones.RightHandIndex2||j.bones.RightHand;
    j.right.position.copy(tip);
    j.right.quaternion.setFromUnitVectors(v().set(0,1,0),fingers.getWorldPosition(v()).sub(tip).normalize());
    const pinch=j.right.localToWorld(v().set(0,.082,0));
    const across=v().set(.009,0,0).applyQuaternion(model.quaternion);
    placeFingertip(j,'Right','Index',pinch.clone().add(across));
    placeFingertip(j,'Right','Thumb',pinch.clone().sub(across));
    placeFingertip(j,'Right','Middle',pinch.clone().add(v().set(.012,-.016,.005).applyQuaternion(model.quaternion)));
    for(const digit of ['Ring','Pinky']){
     const wrist=j.bones.RightHand.getWorldPosition(v());
     const knuckle=j.bones['RightHand'+digit+'1'].getWorldPosition(v());
     const target=wrist.lerp(knuckle,.72).add(v().set(0,-.012,.018).applyQuaternion(model.quaternion));
     target.y=Math.max(target.y,tip.y+.045);
     placeFingertip(j,'Right',digit,target);
    }
   }else j.right.position.copy(reach(j,'Right',model.localToWorld(r),j.weight));
   j.left.visible=j.right.visible=j.weight>.045;
   if(id==='aqing'){
    j.left.visible=tryingPurchase;j.right.visible=false;
   }
   if(id==='fang'&&working){
    for(const [index,digit] of ['Index','Middle','Ring','Pinky'].entries()){
     placeFingertip(j,'Right',digit,j.right.localToWorld(v().set(.020,.006,-.030+index*.020)));
    }
    placeFingertip(j,'Right','Thumb',j.right.localToWorld(v().set(-.020,.018,.018)));
   }
   if(id==='aming'&&!working)j.left.visible=j.right.visible=false;
   if(id==='fang'&&!working){j.right.position.set(15.97,1.116,1.60);j.right.visible=true;}
   if(giving){j.left.visible=j.right.visible=false;}
   changed=true;
  }
  return changed;
 };
}
