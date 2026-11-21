import {dressStoryShops,createOccupations} from './street-fixtures.js';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

import {furnishKitchen,mouthPose,plantedStance} from './dining-room.js';
import {SHOPS,ACTORS,createStreetNav} from './street-space.js';

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
 const heights={eastBread:1.66,radio:1.81,herbs:1.52,westBread:1.70,arcade:1.61,marketBack:1.63,riceCorner:1.75,banyanCloth:1.58,lanePrint:1.68,southPrint:1.72,southRice:1.59,southCloth:1.74,eastPrint:1.70,eastRice:1.68,westCorner:1.51,workshop:1.80,gardenHomes:1.58,northTurn:1.82,eastTurn:1.67};
 await Promise.all(Object.entries(SHOPS).map(async ([id,shop],index)=>{
  if(id==='juiceCart'){actors.set(id,actors.get('vendor'));return;}
  furnishShop(scene,shop,palette);
  const {model}=await load('shopkeepers/'+id+'.glb');
  const bounds=new T.Box3().setFromObject(model);
  model.scale.setScalar(heights[id]/(bounds.max.y-bounds.min.y));
  const depth=shop.stall?-.31:-1.06,side=shop.stall?.95:.49;
  model.position.set(shop.x+depth*shop.sin+side*shop.cos,shop.stall?.105:.225,shop.z+depth*shop.cos-side*shop.sin);
  model.rotation.y=shop.yaw;scene.add(model);actors.set(id,{model,spec:{rotationY:shop.yaw}});
  const hands=[];model.traverse(o=>{if(o.morphTargetDictionary?.workLeft!==undefined)hands.push(o.morphTargetInfluences);});
  working.push({id,model,hands,phase:index*1.73,pace:({bakery:1.65,radio:.84,rice:1.06,cloth:.73,print:1.31,herbs:.94,fruit:1.15})[shop.kind],amount:0});
 }));
 const pedestrianNav=createStreetNav(layout);
 const strolls=[];
 for(const [id,dx,dz] of [['buyer',.9,1.6],['regular',.9,1.0],['ale',.4,1.15],['ling',.35,1.1]]){
  const actor=actors.get(id),start={...ACTORS[({buyer:'buyer',regular:'guest',ale:'lok',ling:'ling'})[id]].point};
  const end={x:start.x+dx,z:start.z+dz};
  if(pedestrianNav.line(start,end))strolls.push({id,actor,start,end,phase:0,last:0});
 }
 const workNearby=createOccupations(scene,actors,fittings);
 function animateWork(point,engaged,now){
  let strolling=false;
  for(const walk of strolls){
   const dt=walk.last?Math.min(.1,(now-walk.last)/1000):0;walk.last=now;
   if(engaged===walk.id){walk.actor.step(0,dt);continue;}
   if(!walk.lastPlaced){walk.actor.model.position.set(walk.start.x,(pedestrianNav.cell(walk.start.x,walk.start.z)-11)/100,walk.start.z);walk.lastPlaced=true;}
   walk.phase+=dt;
   const cycle=walk.phase%18;
   const progress=cycle<4?cycle/4:cycle<9?1:cycle<13?1-(cycle-9)/4:0;
   const next=new T.Vector3(T.MathUtils.lerp(walk.start.x,walk.end.x,progress),walk.actor.model.position.y,T.MathUtils.lerp(walk.start.z,walk.end.z,progress));
   const distance=next.distanceTo(walk.actor.model.position);
   if(distance>.00001){
    const delta=next.clone().sub(walk.actor.model.position);
    const target=Math.atan2(delta.x,delta.z);
    walk.actor.model.rotation.y+=Math.atan2(Math.sin(target-walk.actor.model.rotation.y),Math.cos(target-walk.actor.model.rotation.y))*Math.min(1,dt*3);
    walk.actor.model.position.copy(next);strolling=true;
   }
   walk.actor.step(distance,dt);
  }
  const bodiesChanged=workNearby(point,engaged,now);
  let changed=false;
  for(const actor of working){
   if(actor.id==='southRice'&&fittings.reunion.visible||Math.hypot(actor.model.position.x-point.x,actor.model.position.z-point.z)>9)continue;
   const t=actor.phase+now*.001*actor.pace,active=engaged!==actor.id;
   const target=active?1:0;
   if(!active&&actor.amount===0)continue;
   actor.amount+=T.MathUtils.clamp(target-actor.amount,-.16,.16);
   for(const weights of actor.hands){
    weights[0]=actor.amount*(.61+.32*Math.sin(t));
    weights[1]=actor.amount*(.52+.39*Math.sin(t*1.12+.8));
    weights[2]=actor.amount*(.60+.28*Math.cos(t*.65));
   }
   if(active)face(actor.id,null,.06);
   changed=true;
  }
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
 const coat=new T.Group(),cloth=new T.MeshStandardMaterial({color:0x37495a,roughness:.94});
 function panel(points,material,y){
  const shape=new T.Shape();points.forEach(([x,z],i)=>i?shape.lineTo(x,-z):shape.moveTo(x,-z));shape.closePath();
  const geo=new T.ExtrudeGeometry(shape,{depth:.011,bevelEnabled:true,bevelSize:.005,bevelThickness:.004,bevelSegments:2});
  geo.rotateX(-Math.PI/2);const part=new T.Mesh(geo,material);part.position.y=y;coat.add(part);
 }
 panel([[-.14,-.25],[-.06,-.28],[.06,-.28],[.14,-.25],[.28,.065],[.22,.10],[.145,-.034],[.16,.26],[-.16,.26],[-.145,-.034],[-.22,.10],[-.28,.065]],cloth,0);
 const trim=new T.MeshStandardMaterial({color:0x506475,roughness:.89});
 for(const s of [-1,1])panel([[s*.066,-.27],[s*.121,-.22],[s*.076,-.145],[s*.104,-.13],[0,.015]],trim,.016);
 coat.position.set(15.54,1.075,1.19);coat.rotation.y=-Math.PI/2;scene.add(coat);
 function showCoat(visible){coat.visible=visible;fittings.pressing.visible=!visible;}
 illuminate(false);
 function face(id,point,dt){
  const actor=actors.get(id);
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
  const actor=actors.get(id);if(!actor)return;
  if(!mouths.has(actor))mouths.set(actor,mouthPose(actor.model,id==='juiceCart'?'vendor':id));
  mouths.get(actor)(level,shape);
 }
 const elder=actors.get('southRice').model,stallPosition=elder.position.clone(),stallYaw=elder.rotation.y;
 function reunion(arrived){
  if(fittings.reunion.visible===arrived)return;
  fittings.reunion.visible=arrived;
  if(arrived){elder.position.set(16.16,.18,-11.58);elder.rotation.y=Math.atan2(lin.model.position.x-elder.position.x,lin.model.position.z-elder.position.z);}
  else{elder.position.copy(stallPosition);elder.rotation.y=stallYaw;}
  refreshShadows();
 }
 return {reunion,speak,layout,actors,render,face,showCoat,placeStones,animateWork,illuminate,placeRack,refreshShadows};
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
  }else if(shop.kind==='cloth'){
   const dyes=[0x285f61,0xd6ae88,0x9d5655,0x52688a];
   box(dyes[i%4],x,y+.075,z,.38,.14,.29);box(cream,x+.1,y+.15,z,.047,.012,.29);
  }else if(shop.kind==='print'){
   for(let j=0;j<3;j++)box(j===2?0xb96d57:cream,x+.013*j,y+.022+j*.037,z,.34,.035,.25);
  }else if(shop.kind==='fruit'){
   for(let j=0;j<3;j++)piece(bun,i%3?0xd98a30:0xa4ac57,x+(j-1)*.092,y+.078,z,.14,.14,.15);
  }else if(shop.kind==='rice'){
   piece(bun,0xb99c72,x,y+.16,z,.39,.36,.32);piece(round,cream,x,y+.29,z,.25,.045,.22);
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
 const captions={bakery:'每日出爐',radio:'收音機維修',rice:'本地米行',cloth:'棉麻布匹',herbs:'街坊乾貨',fruit:'時令鮮果',print:'街坊印務'};
 const counterLabels={bakery:'蛋撻　菠蘿包',radio:'零件配換',rice:'絲苗米',cloth:'剪布量身',herbs:'陳皮　乾貨',fruit:'鮮果到貨',print:'單簿　信紙'};
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
  box(wood,0,1.10,-1.64,2.57,.07,.37);
  for(const x of [-1.22,1.22])box(wood,x,.7,-1.64,.075,1.37,.19);
  for(let i=0;i<5;i++)stock(-.93+i*.45,1.15,-1.63,i);
  if(shop.kind==='print'){
   box(iron,-.91,1.34,-1.57,.48,.11,.39);box(iron,-1.1,1.52,-1.59,.075,.36,.1);
   box(iron,-.92,1.66,-1.59,.42,.07,.11);box(wood,-.70,1.73,-1.59,.07,.21,.07);
  }else if(shop.kind==='rice'){
   box(iron,-.92,1.24,-1.59,.41,.11,.30);box(cream,-.92,1.40,-1.59,.28,.22,.13);
   piece(round,iron,-.92,1.55,-1.59,.39,.033,.29);
  }else if(shop.kind==='cloth'){
   for(let i=0;i<4;i++)piece(round,[0x285f61,0xd6ae88,0x9d5655,0x52688a][i],-.87+i*.24,1.53,-1.62,.21,.74,.21);
  }
  box(wood,-1.03,.31,-.82,.48,.52,.55);box(wood,1.03,.28,-.74,.48,.46,.49);
  stock(-1.03,.58,-.82,2);stock(1.03,.52,-.74,1);
 }
 for(const {shape,color,matrices} of batches.values()){
  const original=new Map([[wood,'wood'],[teal,'jade'],[iron,'metal'],[cream,'cream'],[0xb99c72,'linen'],[0xd6ae88,'linen'],[0x285f61,'cloth']]).get(color);
  const material=palette.get(original)||new T.MeshStandardMaterial({color,roughness:.86});
  const mesh=new T.InstancedMesh(shape,material,matrices.length);
  matrices.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.receiveShadow=true;group.add(mesh);
 }
}
