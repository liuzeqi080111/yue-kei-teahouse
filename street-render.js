import {dressStoryShops,createOccupations} from './street-fixtures.js';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

import {furnishKitchen,mouthPose,plantedStance} from './dining-room.js';
import {SHOPS,ACTORS,createStreetNav,shopBlocks,marketRoomBlocks,pedestrianRoutes,PASSERS} from './street-space.js';

// The stall portraits have no leg bones. Add a stride to their existing body
// geometry in bind space. Both skin and shadows then see the same moving feet.
function residentStride(model){
 const legs=[];
 model.traverse(mesh=>{
  if(!mesh.isMesh || mesh.morphTargetDictionary?.workLeft===undefined ||
     mesh.morphTargetDictionary.jawOpen!==undefined)return;
  const geometry=mesh.geometry=mesh.geometry.clone(),pos=geometry.attributes.position;
  const swing=new Float32Array(pos.count*3),left=new Float32Array(swing.length),right=new Float32Array(swing.length);
  let min=Infinity,max=-Infinity;
  for(let i=0;i<pos.count;i++)if(pos.getY(i)<.11){min=Math.min(min,pos.getX(i));max=Math.max(max,pos.getX(i));}
  const mid=(min+max)/2;
  for(let i=0;i<pos.count;i++){
   const y=pos.getY(i),x=pos.getX(i)-mid;
   const side=T.MathUtils.smoothstep(x,-.017,.017)*2-1;
   const leg=1-T.MathUtils.smoothstep(y,.06,.52);
   swing[i*3+2]=side*.084*leg;
   // On the recovery half-step bend the knee forward and lift the shoe.
   const lift=x>0?left:right;
   lift[i*3+1]=.037*leg*Math.abs(side);
   lift[i*3+2]=.027*Math.exp(-(((y-.24)/.085)**2))*Math.abs(side);
   const arm=T.MathUtils.smoothstep(Math.abs(x),.11,.21)*(1-T.MathUtils.smoothstep(y,.58,.78))*T.MathUtils.smoothstep(y,.32,.48);
   swing[i*3+2]-=side*.021*arm;
  }
  const start=geometry.morphAttributes.position.length;
  for(const [name,values] of [['stride',swing],['leftStep',left],['rightStep',right]]){
   const attr=new T.BufferAttribute(values,3);attr.name=name;geometry.morphAttributes.position.push(attr);
   if(geometry.morphAttributes.normal)geometry.morphAttributes.normal.push(new T.BufferAttribute(new Float32Array(values.length),3));
  }
  const originalKeys=mesh.morphTargetDictionary;mesh.updateMorphTargets();Object.assign(mesh.morphTargetDictionary,originalKeys);legs.push({weights:mesh.morphTargetInfluences,start});
 });
 let phase=0,amount=0;
 return (distance,dt)=>{
  if(distance===0 && amount===0)return false;
  phase+=distance*Math.PI*2/(.336*model.scale.x);
  amount=T.MathUtils.clamp(amount+(distance>0?5:-6)*dt,0,1);
  const wave=2*Math.asin(Math.sin(phase))/Math.PI;
  for(const {weights,start} of legs){
   weights[start]=wave*amount;
   weights[start+1]=Math.max(0,Math.cos(phase))*amount;
   weights[start+2]=Math.max(0,-Math.cos(phase))*amount;
  }
  return true;
 };
}

export async function loadStreet(canvas) {
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(59,1,.055,200);
 camera.rotation.order='YXZ';
 const actors=new Map(),loader=new GLTFLoader();
 const sky=new T.HemisphereLight(0xe4efff,0xb6a48c,1.50);
 const sun=new T.DirectionalLight(0xffdeb0,2.8);
 scene.add(sky,sun);
 sun.position.set(24,48,32);sun.castShadow=true;
 sun.shadow.mapSize.set(2048,2048);
 Object.assign(sun.shadow.camera,{left:-38,right:38,top:37,bottom:-36,near:1,far:116});
 sun.shadow.normalBias=.023;sun.shadow.bias=-.00012;
 const lamps=[[-16.9,2.55,8.8],[15.8,2.5,-1],[15.4,2.62,9.55],[-16.1,2.13,-5.5],[-16.1,2.14,-10.3],[16.7,2.80,-12],[-18.5,2.4,-13.1]].map(p=>{
  const lamp=new T.PointLight(0xffc47e,11,8);
  lamp.position.fromArray(p);scene.add(lamp);return lamp;
 });
 function illuminate(night){
  scene.background=new T.Color(night?0x435471:0xbcd6e2);
  scene.fog=new T.FogExp2(scene.background,night?.009:.004);
  sky.color.setHex(night?0xaabfe3:0xe4efff);sky.intensity=night?.63:1.50;
  sun.color.setHex(night?0xb3c5ef:0xffdeb0);sun.intensity=night?.33:2.80;
  lamps.forEach(l=>l.intensity=night?34:11);
  refreshShadows();
 }
 let width=0,height=0;
 const renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;
 renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.04;
 function refreshShadows(){renderer.shadowMap.needsUpdate=true;}
 async function load(name) {
  const {scene:model,animations}=await loader.loadAsync('./assets/street/'+name);
  model.traverse(o=>{if(o.isMesh){o.castShadow=!(o.material.transparent&&o.material.opacity<.4);o.receiveShadow=name==='district.glb';}});
  if(!animations.length)return {model};
  const mixer=new T.AnimationMixer(model),clip=animations[0];
  const walk=mixer.clipAction(clip).play();
  if(animations.length){
   const hips=clip.tracks.find(track=>/Hips\.position$/i.test(track.name));
   if(hips){
    const {times,values}=hips,last=times.length-1;
    for(const axis of [0,2]){
     const displacement=values[last*3+axis]-values[axis];
     for(let i=1;i<=last;i++)values[i*3+axis]-=displacement*(times[i]-times[0])/(times[last]-times[0]);
    }
   }
   const stand=mixer.clipAction(plantedStance(clip)).play();
   let weight=0;walk.setEffectiveWeight(0);mixer.setTime(0);
   return {model,mixer,step(distance,dt){
    const next=T.MathUtils.clamp(weight+(distance>0?1:-1)*dt*7,0,1);
    if(!next&&!weight)return false;
    weight=next;walk.setEffectiveWeight(weight);stand.setEffectiveWeight(1-weight);
    mixer.update(distance>0?distance/1.12:dt);
    return true;
   }};
  }
  mixer.setTime(0);
  return {model,mixer};
 }
 const [layout,env]=await Promise.all([
  fetch('./assets/street/walk.json').then(res=>{if(!res.ok)throw Error('步行数据无法读取');return res.json();}),
  load('district.glb'),
 ]);
 scene.add(env.model);
 const fittings=dressStoryShops(scene,env.model);
 fittings.heldCoat=(await load('held-coat.glb')).model;
 const kitchen=new T.Group();
 kitchen.position.set(-15.72,0,8.8);kitchen.rotation.y=Math.PI/2;
 furnishKitchen(kitchen,env.model);scene.add(kitchen);
 const rack=new T.Group();
 const wear=env.model.getObjectByName('clothesclothes')||env.model.children.find(o=>o.name.includes('clothes'));
 wear?.traverse(mesh=>{
  if(!mesh.isMesh||!['metal','bronze','red','sun'].includes(mesh.material.name))return;
  const piece=mesh.clone();
  piece.geometry.computeBoundingBox();
  piece.position.z+=.27;
  rack.add(piece);
 });
 scene.add(rack);
 function placeRack({x,z,length,visible}){
  rack.position.set(x,0,z);rack.rotation.y=Math.PI/2;
  const horizontal=length/3.8;
  rack.scale.set(horizontal,.82,.82);rack.visible=visible;
  for(const piece of rack.children){
   const garment=piece.material.name;
   if(garment!=='red'&&garment!=='sun')continue;
   piece.visible=garment!=='sun'||length>1;
   piece.scale.x=.72/horizontal;
   const box=piece.geometry.boundingBox;
   const center=(box.min.x+box.max.x)/2;
   piece.position.x=length<=1?-center*piece.scale.x:center*(1-piece.scale.x);
  }
  refreshShadows();
 }
 function render({x,y,z,heading,pitch}){
  if(width!==canvas.clientWidth||height!==canvas.clientHeight){
   width=canvas.clientWidth;height=canvas.clientHeight;
   if(!width||!height)return;
   camera.aspect=width/height;camera.fov=camera.aspect<.82?78:59;
   camera.updateProjectionMatrix();renderer.setSize(width,height,false);
  }
  camera.position.set(x,y,z);camera.rotation.set(pitch,-heading,0,'YXZ');
  renderer.render(scene,camera);
 }
 await Promise.all(layout.characters.map(async spec=>{
  const actor=await load(spec.id+'-styled-v3.glb');
  actor.spec=spec;actor.model.position.fromArray(spec.position);
  if(spec.id==='fang')actor.model.position.x-=.09;
  actor.model.scale.setScalar(spec.height);actor.model.rotation.y=spec.rotationY;
  actors.set(spec.id,actor);scene.add(actor.model);
 }));
 const lin=actors.get('lin');
 lin.model.position.set(15.68,-.24,-13.20);lin.model.rotation.y=0;
 lin.model.updateMatrixWorld(true);
 const bones={};lin.model.traverse(o=>{if(o.isBone)bones[o.name.replace(/^mixamorig[:_]?/i,'')]=o;});
 function pointBone(bone,child,dir){
  if(!bone||!child)return;
  const from=child.getWorldPosition(new T.Vector3()).sub(bone.getWorldPosition(new T.Vector3())).normalize();
  const rotation=new T.Quaternion().setFromUnitVectors(from,dir.clone().normalize());
  const parent=bone.parent.getWorldQuaternion(new T.Quaternion());
  bone.quaternion.premultiply(parent.clone().invert().multiply(rotation).multiply(parent));
  bone.updateMatrixWorld(true);
 }
 for(const side of ['Left','Right']){
  const b=name=>bones[side+name],sign=side==='Left'?1:-1;
  pointBone(b('UpLeg'),b('Leg'),new T.Vector3(sign*.14,-.08,.99));
  pointBone(b('Leg'),b('Foot'),new T.Vector3(0,-1,.02));
  pointBone(b('Arm'),b('ForeArm'),new T.Vector3(sign*.24,-.93,.25));
  pointBone(b('ForeArm'),b('Hand'),new T.Vector3(-sign*.25,-.04,.97));
 }
 const board=new T.Group();board.position.set(15.68,1.009,-12.20);scene.add(board);
 const base=new T.Mesh(new T.BoxGeometry(.57,.032,.57),new T.MeshStandardMaterial({color:0xceac76,roughness:.88}));board.add(base);
 const grid=[],step=.061;
 for(let n=-4;n<=4;n++){grid.push(n*step,.017,-4*step,n*step,.017,4*step,-4*step,.017,n*step,4*step,.017,n*step);}
 const gridGeo=new T.BufferGeometry();gridGeo.setAttribute('position',new T.Float32BufferAttribute(grid,3));
 board.add(new T.LineSegments(gridGeo,new T.LineBasicMaterial({color:0x4c3524})));
 const stones=new T.Group();board.add(stones);
 const stoneMesh=new T.SphereGeometry(.027,14,9),stoneMats=[0x252524,0xf4e8ce].map(color=>new T.MeshStandardMaterial({color,roughness:.51}));
 function placeStones(cells){
  stones.clear();cells.forEach((color,i)=>{if(!color)return;const stone=new T.Mesh(stoneMesh,stoneMats[color-1]);stone.scale.y=.48;
   stone.position.set((i%9-4)*step,.026,(Math.floor(i/9)-4)*step);stones.add(stone);});
 }
 placeStones(Array(81).fill(0));
 const palette=new Map();
 env.model.traverse(o=>{if(o.isMesh&&o.material?.name)palette.set(o.material.name,o.material);});
 const working=[];
 const templates=new Map();
 const heights={eastBread:1.66,radio:1.81,herbs:1.52,westBread:1.70,arcade:1.61,marketBack:1.63,riceCorner:1.75,banyanCloth:1.58,lanePrint:1.68,southPrint:1.72,southRice:1.59,southCloth:1.74,eastPrint:1.70,eastRice:1.68,westCorner:1.51,workshop:1.80,gardenHomes:1.58,northTurn:1.82,eastTurn:1.67};
 const needed=new Set([...Object.keys(SHOPS),...Object.values(PASSERS).map(p=>p.model),'southRice']);
 needed.delete('juiceCart');
 await Promise.all([...needed].map(async id=>{
  const {model}=await load('shopkeepers/'+id+'.glb');
  const bounds=new T.Box3().setFromObject(model,true);
  model.scale.setScalar(heights[id]/(bounds.max.y-bounds.min.y));
  templates.set(id,model);
 }));
 for(const [index,[id,shop]] of Object.entries(SHOPS).entries()){
  if(id==='juiceCart'){
   // The old cart is replaced by a shop bay against the west market wall.
   const cart=env.model.getObjectByName('cart_|_cart');if(cart)cart.visible=false;
   furnishShop(scene,shop,palette);
   const actor=actors.get('vendor');actors.set(id,actor);
   actor.model.position.set(shop.x-1.28,.174,shop.z+.18);continue;
  }
  furnishShop(scene,shop,palette);
  const model=templates.get(id).clone(true);
  const depth=shop.stall?-1.30:-1.32,side=shop.stall?.29:.34;
  model.position.set(shop.x+depth*shop.sin+side*shop.cos,shop.stall?.174:.225,shop.z+depth*shop.cos-side*shop.sin);
  model.rotation.y=shop.yaw;scene.add(model);actors.set(id,{model,spec:{rotationY:shop.yaw}});
  const hands=[];model.traverse(o=>{if(o.morphTargetDictionary?.workLeft!==undefined)hands.push(o.morphTargetInfluences);});
  working.push({id,model,hands,phase:index*1.73,pace:({bakery:1.65,radio:.84,herbs:.94,fruit:1.15})[shop.kind],amount:0});
 }
 const shops=Object.values(SHOPS);
 const pedestrianNav=createStreetNav(layout,p=>marketRoomBlocks(p)||shops.some(shop=>shopBlocks(shop,p)));
 // The scans are unskinned. Instances share textures, but each has its own
 // morph weights and wardrobe material. Colour only the clothes below the neck.
 function resident(source,tint,height){
  const model=templates.get(source).clone(true);
  // A neutral template keeps pitch and roll out of turns and dialogue facing.
  model.rotation.set(0,0,0,'YXZ');
  model.scale.multiplyScalar(height);
  const color=new T.Color(tint);
  model.traverse(mesh=>{
   if(!mesh.isMesh || mesh.morphTargetDictionary?.workLeft===undefined || mesh.morphTargetDictionary.jawOpen!==undefined)return;
   const material=mesh.material=mesh.material.clone();
   material.onBeforeCompile=shader=>{
    shader.uniforms.coatTint={value:color};
    shader.vertexShader='varying vec3 residentBind;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nresidentBind=position;');
    shader.fragmentShader='varying vec3 residentBind;uniform vec3 coatTint;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
     float torso=smoothstep(.41,.46,residentBind.y)*(1.-smoothstep(.70,.76,residentBind.y))*(1.-smoothstep(.11,.16,abs(residentBind.x)));
     diffuseColor.rgb=mix(diffuseColor.rgb,(.12+dot(diffuseColor.rgb,vec3(.30,.59,.11)))*coatTint,torso*.83);`);
   };
  });
  scene.add(model);return model;
 }
 for(const [id,p] of Object.entries(PASSERS)){
  const model=resident(p.model,p.tint,.985);
  actors.set(id,{model,spec:{rotationY:0}});
 }
 const crowd=pedestrianRoutes().map((route,index)=>{
  const actor=actors.get(route.id),model=actor.model;
  actor.step=residentStride(model);
  const {start,points,next}=route,target=points[next];
  model.position.set(start.x,(pedestrianNav.cell(start.x,start.z)-11)/100,start.z);
  model.rotation.y=Math.atan2(target.x-start.x,target.z-start.z);
  return {...route,actor,cruise:.68+.025*(index%5),speed:.48,last:null,detour:null};
 });
 function stepResident(walk,player,engaged,now){
  const {actor,id,points}=walk,model=actor.model,p=model.position;
  const dt=walk.last===null?0:T.MathUtils.clamp((now-walk.last)/1000,0,.12);walk.last=now;
  if(engaged===id){
   walk.speed=0;return actor.step(0,dt);
  }
  let target=walk.detour||points[walk.next],dx=target.x-p.x,dz=target.z-p.z,len=Math.hypot(dx,dz);
  if(len<.045){
   if(walk.detour)walk.detour=null;else walk.next=(walk.next+1)%points.length;
   return false;
  }
  const ux=dx/len,uz=dz/len;
  // Pass a stopped player or neighbour on the clear side of the pavement.
  const blocker=q=>{
   const x=q.x-p.x,z=q.z-p.z,along=x*ux+z*uz;
   return along>.02 && along<1.22 && Math.abs(x*uz-z*ux)<.62;
  };
  const obstacle=blocker(player)?player:crowd.find(other=>other!==walk&&blocker(other.actor.model.position))?.actor.model.position;
  if(obstacle && !walk.detour){
   const side=((obstacle.x-p.x)*uz-(obstacle.z-p.z)*ux)>0?-1:1;
   for(const sign of [side,-side]){
    const pass={x:obstacle.x+uz*.86*sign+ux*.18,z:obstacle.z-ux*.86*sign+uz*.18};
    if(pedestrianNav.line(p,pass)&&pedestrianNav.line(pass,target)){
     walk.detour=pass;return true;
    }
   }
  }
  const heading=Math.atan2(dx,dz);
  const turn=Math.atan2(Math.sin(heading-model.rotation.y),Math.cos(heading-model.rotation.y));
  model.rotation.y+=T.MathUtils.clamp(turn,-1.9*dt,1.9*dt);
  if(Math.abs(turn)>.025){walk.speed=0;actor.step(.23*dt,dt);return true;}
  walk.speed=Math.min(walk.cruise,walk.speed+1.4*dt);
  const step=Math.min(len,walk.speed*dt),x=p.x+ux*step,z=p.z+uz*step;
  if([player,...crowd.filter(c=>c!==walk).map(c=>c.actor.model.position)].some(q=>
   Math.hypot(q.x-x,q.z-z)<.51 && Math.hypot(q.x-x,q.z-z)<Math.hypot(q.x-p.x,q.z-p.z))){
   walk.detour=null;walk.speed=0;return actor.step(0,dt);
  }
  p.set(x,(pedestrianNav.cell(x,z)-11)/100,z);actor.step(step,dt);return true;
 }

 // The record seller and tailor stay inside their premises. Their customers
 // look across the counter instead of pacing the street during a transaction.
 actors.get('ale').model.position.x=-15.78;
 actors.get('aming').model.position.x=-15.99;
 const counterCustomers=[['buyer','ale',-14.44,-5.28],['regular','aming',-14.47,9.66]];
 for(const [id,host,x,z] of counterCustomers){
  const model=actors.get(id).model,clerk=actors.get(host).model;
  model.position.set(x,.11,z);model.rotation.y=Math.atan2(clerk.position.x-x,clerk.position.z-z);
  actors.get(id).spec.rotationY=model.rotation.y;
 }
 const visits=[],donors=Object.values(PASSERS).map(p=>p.model);
 const shopsInOrder=Object.entries(SHOPS);
 for(const [index,[id,shop]] of shopsInOrder.entries()){
  const isElder=id==='marketBack';
  const guest=isElder?templates.get('southRice'):resident(donors[index%donors.length],[0x856540,0x585478,0x456c72,0x7a5150][index%4],.95+.024*(index%4));
  if(isElder){scene.add(guest);actors.set('southRice',{model:guest,spec:{rotationY:shop.yaw+Math.PI}});}
  const owner=actors.get(id).model,side=-.52,depth=.06;
  const x=shop.x+depth*shop.sin+side*shop.cos,z=shop.z+depth*shop.cos-side*shop.sin;
  guest.position.set(x,shop.stall?.174:.110,z);
  guest.rotation.y=Math.atan2(owner.position.x-x,owner.position.z-z);
  const weights=[];
  guest.traverse(m=>{if(m.morphTargetDictionary?.workLeft!==undefined)weights.push(m.morphTargetInfluences);});
  visits.push({id,guestId:isElder?'southRice':null,shop,guest,owner,weights,guestMouth:mouthPose(guest),ownerMouth:mouthPose(owner),phase:index*3.97,near:false});
 }
 const conversations=[...visits];
 for(const [guestId,id] of counterCustomers){
  const guest=actors.get(guestId).model,owner=actors.get(id).model;
  const record=id==='ale',shop={x:owner.position.x,z:owner.position.z,sin:1,cos:0,
   name:record?'阿乐':'阿明',
   customerLine:record?'呢隻碟兩面都有歌㗎？':'阿明，今日個包出爐未呀？',
   reply:record?'係呀，反轉仲有兩首㗎。':'啱啱出爐，周叔，坐陣先啦。'};
  conversations.push({id,guestId,shop,owner,guest,weights:[],guestMouth:mouthPose(guest),ownerMouth:mouthPose(owner),phase:record?7.3:2.9,near:false});
 }
 let overheard=null,visitTime=null;
 function shopVisits(point,engaged,now){
  let changed=false,best=3.8;overheard=null;
  const dt=visitTime===null?0:T.MathUtils.clamp((now-visitTime)/1000,0,.12);visitTime=now;
  for(const v of conversations){
   const {id,guest,owner,shop}=v,dist=Math.hypot(point.x-guest.position.x,point.z-guest.position.z);
   const near=dist<19 && !(v.guestId==='southRice'&&fittings.reunion.visible);
   if(!near&&!v.near)continue;
   const t=(now*.001+v.phase)%13;
   const guestTalking=Boolean(v.guestId)&&engaged===v.guestId;
   const isTalking=engaged===id||guestTalking;
   const ask=near&&!isTalking&&t>=2&&t<4.2,reply=near&&!isTalking&&t>=4.8&&t<8.9;
   // The customer indicates an item, asks, then nods as the clerk replies.
   for(const w of v.weights){
    w[0]=near&&!isTalking?.16+.52*Math.max(0,1-Math.abs(t-2.3)/1.9):0;
    w[1]=near&&!isTalking?.10+.24*Math.max(0,1-Math.abs(t-9.6)/1.2):0;
    w[2]=near&&!isTalking?.31*Math.max(0,1-Math.abs(t-1)/1.2)+.34*Math.max(0,1-Math.abs(t-8)/.65):0;
   }
   const pulse=.46+.34*Math.sin(t*15);
   if(!guestTalking)v.guestMouth(ask?pulse:0,'C');
   if(engaged!==id)v.ownerMouth(reply?pulse:0,'C');
   if(near&&!isTalking&&v.weights.length){
    const browse=t<2||t>10;
    const x=browse?shop.x-.48*shop.cos-.63*shop.sin:owner.position.x;
    const z=browse?shop.z+.48*shop.sin-.63*shop.cos:owner.position.z;
    const turn=Math.atan2(x-guest.position.x,z-guest.position.z)-guest.rotation.y;
    guest.rotation.y+=T.MathUtils.clamp(Math.atan2(Math.sin(turn),Math.cos(turn)),-1.25*dt,1.25*dt);
   }
   if(near&&!isTalking)face(id,(ask||reply)?guest.position:null,dt);
   if((ask||reply)&&!engaged&&dist<best){
    const dx=point.x-shop.x,dz=point.z-shop.z;
    if(dx*shop.sin+dz*shop.cos>=-.25 && ((guest.position.x-point.x)*Math.sin(point.heading)-(guest.position.z-point.z)*Math.cos(point.heading))>0){
     best=dist;overheard={name:ask?(v.guestId==='regular'?'周叔':v.guestId==='buyer'?'小文':v.guestId==='southRice'?'祥伯':'顾客'):shop.name,text:ask?shop.customerLine:shop.reply};
    }
   }
   v.near=near;changed=true;
  }
  return changed;
 }
 const workNearby=createOccupations(scene,actors,fittings);
 function animateWork(point,engaged,now){
  let strolling=false;
  for(const walk of crowd)strolling=stepResident(walk,point,engaged,now)||strolling;
  const bodiesChanged=workNearby(point,engaged,now);
  let changed=false;
  for(const actor of working){
   if(Math.hypot(actor.model.position.x-point.x,actor.model.position.z-point.z)>9)continue;
   const t=actor.phase+now*.001*actor.pace,active=engaged!==actor.id;
   const target=active?1:0;
   if(!active&&actor.amount===0)continue;
   actor.amount+=T.MathUtils.clamp(target-actor.amount,-.16,.16);
   for(const weights of actor.hands){
    weights[0]=actor.amount*(.61+.32*Math.sin(t));
    weights[1]=actor.amount*(.52+.39*Math.sin(t*1.12+.8));
    weights[2]=actor.amount*(.60+.28*Math.cos(t*.65));
   }
   changed=true;
  }
  changed=shopVisits(point,engaged,now)||changed;
  if(strolling)refreshShadows();
  return changed||bodiesChanged||strolling;
 }
 // Counter faces the side aisle. All new fixtures stay on the staff side.
 const laundryMaterial=new Map();
 function fitting(color,x,y,z,w,h,d){
  if(!laundryMaterial.has(color))laundryMaterial.set(color,new T.MeshStandardMaterial({color,roughness:.82}));
  const mesh=new T.Mesh(new T.BoxGeometry(w,h,d),laundryMaterial.get(color));mesh.position.set(x,y,z);scene.add(mesh);
 }
 for(let i=0;i<3;i++){
  fitting(0x926c4b,18.2,1.04+i*.43,1.2,1.2,.055,.44);
  for(let j=0;j<3;j++)for(let k=0;k<=j;k++){
   fitting([0x7f99ab,0xd2bc98,0xb88d84][j],17.81+.38*j,1.10+i*.43+k*.065,1.2,.33,.06,.29);
  }
 }
 for(const z of [-3.0,-2.2]){
  fitting(0xa67f53,16.6,.42,z,.62,.48,.54);
  for(let i=0;i<4;i++)fitting(0xdec7a4,16.28,.25+i*.115,z,.025,.038,.51);
  fitting(0xd4dfd7,16.6,.68,z,.56,.10,.46);
 }
 const ledger=new T.Group();ledger.position.set(15.62,1.055,.42);scene.add(ledger);
 for(let i=0;i<3;i++){
  const sheet=new T.Mesh(new T.BoxGeometry(.26,.012,.19),new T.MeshStandardMaterial({color:i===2?0xf1dfb0:0x688d87}));
  sheet.position.y=i*.016;ledger.add(sheet);
 }
 for(const x of [16.10,16.86])fitting(0x746754,x,2.82,1.58,.014,1.02,.014);
 const sign=storeSign('憑單取衣',.94,.24);sign.position.set(16.48,2.20,1.58);sign.rotation.y=-Math.PI/2;scene.add(sign);
 const desk=new T.Group();desk.position.set(14.99,0,1.54);scene.add(desk);
 for(let i=0;i<3;i++){
  const fold=new T.Mesh(new T.BoxGeometry(.52,.065,.34),new T.MeshStandardMaterial({color:i%2?0x879eb2:0xe8d4b4}));
  fold.position.set(.74,1.075+i*.065,.49);desk.add(fold);
 }
 const paper=new T.Mesh(new T.BoxGeometry(.27,.025,.32),new T.MeshStandardMaterial({color:0xf3e1bc}));
 paper.position.set(15.61,1.06,.69);scene.add(paper);
 const coat=new T.Group(),laidCoat=fittings.heldCoat.clone(true);
 laidCoat.rotation.x=-Math.PI/2;coat.add(laidCoat);
 coat.position.set(15.28,1.103,1.19);coat.rotation.y=Math.PI/2;coat.visible=false;scene.add(coat);
 function showCoat(visible){coat.visible=visible;fittings.coatShown=visible;fittings.pressing.visible=!visible;}
 illuminate(false);
 function face(id,point,dt){
  const actor=character(id);
  if(!actor)return;
  const {model}=actor;
  const target=point?Math.atan2(point.x-model.position.x,point.z-model.position.z):actor.spec.rotationY;
  const delta=target-model.rotation.y;
  if(Math.abs(Math.sin(delta))+Math.abs(1-Math.cos(delta))<.005)return;
  model.rotation.y+=Math.atan2(Math.sin(delta),Math.cos(delta))*Math.min(1,dt*8);
  return true;
 }
 const mouths=new Map();
 function speak(id,level,shape){
  const actor=character(id);if(!actor)return;
  if(!mouths.has(actor))mouths.set(actor,mouthPose(actor.model,id==='juiceCart'?'vendor':id));
  mouths.get(actor)(level,shape);
 }
 const elder=actors.get('southRice').model,guestPosition=elder.position.clone(),guestYaw=elder.rotation.y;
 function character(id){return actors.get(id);}
 function reunion(arrived){
  if(fittings.reunion.visible===arrived)return;
  fittings.reunion.visible=arrived;
  if(arrived){elder.position.set(16.16,.18,-11.58);elder.rotation.y=Math.atan2(lin.model.position.x-elder.position.x,lin.model.position.z-elder.position.z);}
  else{elder.position.copy(guestPosition);elder.rotation.y=guestYaw;}
  refreshShadows();
 }
 return {reunion,speak,layout,actors,character,overheard:()=>overheard,render,face,showCoat,placeStones,animateWork,illuminate,placeRack,refreshShadows};
}

function storeSign(text,w,h){
 const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;
 const ctx=canvas.getContext('2d');ctx.fillStyle='#38544c';ctx.fillRect(0,0,512,128);
 ctx.strokeStyle='#d4b88c';ctx.lineWidth=4;ctx.strokeRect(7,7,498,114);
 ctx.font='bold 64px "Microsoft JhengHei",serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#f3e5c9';ctx.fillText(text,256,68,475);
 const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;
 return new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({map}));
}
function furnishShop(scene,shop,palette){
 const group=new T.Group();group.position.set(shop.x,.11,shop.z);group.rotation.y=shop.yaw;scene.add(group);
 const batches=new Map(),cube=new T.BoxGeometry(),round=new T.CylinderGeometry(.5,.5,1,16),bun=new T.SphereGeometry(.5,12,8);
 function piece(shape,color,x,y,z,w,h,d){
  const key=shape.uuid+color;
  if(!batches.has(key))batches.set(key,{shape,color,matrices:[]});
  const m=new T.Matrix4().makeScale(w,h,d);m.setPosition(x,y,z);batches.get(key).matrices.push(m);
 }
 const wood=0x865636,teal=0x396059,cream=0xe2c79a,iron=0x68675a;
 const box=(...args)=>piece(cube,...args);
 function stock(x,y,z,i){
  if(shop.kind==='bakery'){
   if(i%2){piece(round,0xc38a49,x,y+.045,z,.24,.09,.24);piece(round,0xf3c857,x,y+.096,z,.19,.015,.19);for(let k=0;k<12;k++){const a=k*Math.PI/6;piece(bun,0xdfa45d,x+.106*Math.cos(a),y+.093,z+.106*Math.sin(a),.031,.024,.031);}}
   else{piece(bun,0xcf8943,x,y+.09,z,.34,.19,.27);for(let k=-1;k<=1;k++){box(0xe5a95d,x+k*.057,y+.182-Math.abs(k)*.009,z,.013,.008,.117);box(0xe5a95d,x,y+.183-Math.abs(k)*.009,z+k*.042,.151,.009,.012);}}
  }else if(shop.kind==='radio'){
   box(i%2?wood:teal,x,y+.16,z,.43,.32,.22);box(0xc4ab84,x-.07,y+.16,z+.114,.22,.21,.014);
   for(let k=0;k<5;k++)box(iron,x-.07,y+.08+k*.039,z+.125,.2,.012,.01);
   box(cream,x+.13,y+.2,z+.12,.07,.045,.02);box(iron,x+.13,y+.42,z,.012,.23,.012);
  }else if(shop.kind==='fruit'){
   for(let j=0;j<3;j++)piece(bun,i%3?0xd98a30:0xa4ac57,x+(j-1)*.092,y+.078,z,.14,.14,.15);
  }else{
   piece(round,[0x9c6945,0xab8955,0x765d43][i%3],x,y+.18,z,.25,.36,.25);
   piece(round,iron,x,y+.375,z,.27,.036,.27);box(cream,x,y+.18,z+.125,.14,.13,.014);
  }
 }
 // The central opening frames the keeper. Side displays read through the existing dark shop windows.
 for(const side of (shop.stall?[]:[-1,1])){
  for(const x of [-.91,.91])box(wood,side*2.5+x,1.07,.15,.055,1.8,.085);
  for(let j=0;j<3;j++){
   const y=.57+j*.48;box(wood,side*2.5,y,.18,1.92,.057,.34);
   for(let i=0;i<4;i++)stock(side*2.5-.71+i*.47,y+.036,.23,i+j);
  }
 }
 box(teal,0,.49,-.73,1.44,.84,.57);box(cream,0,.934,-.73,1.51,.065,.63);
 box(iron,-.16,.987,-.64,.97,.035,.40);
 const stockCount=shop.kind==='bakery'?3:2;
 for(let i=0;i<stockCount;i++)stock(-.50+i*.29,1.01,-.62,i);
 if(shop.kind==='bakery'){
  for(const x of [-.67,-.15])box(wood,x,1.12,-.88,.04,.32,.04);
  box(cream,-.41,1.29,-.88,.58,.045,.29);
 }
 for(let j=0;j<(shop.stall?0:3);j++){
  const y=.77+j*.48;box(wood,0,y,-3.23,2.85,.065,.42);
  for(let i=0;i<6;i++)stock(-1.17+i*.47,y+.04,-3.2,i+j);
 }
 function plaque(text,x,y,z,w,h){
  const sign=storeSign(text,w,h);sign.position.set(x,y,z);group.add(sign);
 }
 const captions={drinks:'街坊涼茶',bakery:'每日出爐',radio:'收音機維修',herbs:'街坊乾貨',fruit:'時令鮮果'};
 const counterLabels={drinks:'竹蔗　茅根',bakery:'蛋撻　菠蘿包',radio:'零件配換',herbs:'陳皮　乾貨',fruit:'鮮果到貨'};
 plaque(counterLabels[shop.kind],0,.67,-.435,1.03,.26);
 if(!shop.stall){
  // A tiled dado, task lamp and workstation frame the display at eye level.
  box(teal,0,.43,-4.55,5.8,.82,.10);box(cream,0,.89,-4.48,5.8,.07,.13);
  box(iron,-.34,2.81,-1.48,.026,.5,.026);piece(round,cream,-.34,2.53,-1.48,.51,.12,.51);
  plaque(captions[shop.kind],0,2.24,-3.35,1.77,.39);
  if(shop.kind==='bakery'){
   box(iron,-1.73,.94,-2.07,1.23,1.76,.82);
   for(const y of [.61,1.29]){
    box(0x322f2c,-1.73,y,-1.645,1.03,.42,.05);
    box(cream,-1.73,y+.26,-1.58,.8,.046,.07);
   }
   box(wood,1.6,.69,-2.02,1.05,1.24,.72);
   box(cream,1.6,1.34,-2.02,1.13,.08,.79);
   piece(round,0xe2dbbd,1.61,1.52,-1.97,.42,.28,.42);
   const glass=new T.Mesh(new T.BoxGeometry(1.37,.47,.018),new T.MeshStandardMaterial({color:0xc0dddd,transparent:true,opacity:.14,depthWrite:false}));
   glass.position.set(0,1.24,-.45);group.add(glass);
  }else if(shop.kind==='radio'){
   box(wood,-1.52,.77,-2.05,1.34,.11,.8);
   for(const x of [-2.05,-1])box(iron,x,.4,-2.05,.07,.74,.58);
   box(iron,-1.71,1.02,-2.07,.52,.37,.36);box(cream,-1.71,1.05,-1.88,.29,.16,.015);
   box(0xa65a38,-1.13,.85,-1.8,.32,.05,.05);
  }else{
   for(let i=0;i<8;i++){const x=-1.6+i%2*.49,y=.44+Math.floor(i/2)*.26;
    box(wood,x,y,-2.07,.47,.25,.55);box(cream,x,y,-1.78,.15,.055,.035);}
  }
 }else{
  // A shallow shop extension meets the existing facade 1.9 m behind
  // the threshold. The keeper stands between the counter and the back wall.
  box(cream,0,.034,-.91,2.96,.06,2.12);
  for(const side of [-1,1]){
   box(cream,side*1.43,1.22,-.92,.10,2.46,2.06);
   box(teal,side*1.43,1.19,.10,.12,2.40,.12);
   box(wood,side*.96,.43,.04,.78,.84,.10);
   box(cream,side*.96,1.03,-.12,.78,.065,.43);
   stock(side*.96,1.07,-.13,1);
  }
  box(wood,0,1.21,-1.88,2.89,2.46,.09);
  box(teal,0,2.46,-.9,3.03,.12,2.19);
  plaque(captions[shop.kind],0,2.29,.17,2.92,.36);
  box(wood,0,1.66,-1.75,2.54,.055,.25);
  for(let i=0;i<5;i++)stock(-1+i*.49,1.69,-1.74,i);

 }
 for(const {shape,color,matrices} of batches.values()){
  const original=new Map([[wood,'wood'],[teal,'jade'],[iron,'metal'],[cream,'cream'],[0xb99c72,'linen'],[0xd6ae88,'linen'],[0x285f61,'cloth']]).get(color);
  const material=palette.get(original)||new T.MeshStandardMaterial({color,roughness:.86});
  const mesh=new T.InstancedMesh(shape,material,matrices.length);
  matrices.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.receiveShadow=true;group.add(mesh);
 }
}
