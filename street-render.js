import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

import {SHOPS} from './street-space.js';

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
  model.traverse(o=>{if(o.isMesh){o.castShadow=!(o.material.transparent&&o.material.opacity<.4);o.receiveShadow=true;}});
  if(!animations.length)return {model};
  const mixer=new T.AnimationMixer(model),clip=animations[0];
  if(name==='friend-styled-v3.glb'){
   const hips=clip.tracks.find(track=>/Hips\.position$/i.test(track.name));
   if(hips){
    const {times,values}=hips,last=times.length-1;
    for(const axis of [0,2]){
     const displacement=values[last*3+axis]-values[axis];
     for(let i=1;i<=last;i++)values[i*3+axis]-=displacement*(times[i]-times[0])/(times[last]-times[0]);
    }
   }
  }
  mixer.clipAction(clip).play();mixer.setTime(0);
  return {model,mixer};
 }
 const [layout,env]=await Promise.all([
  fetch('./assets/street/walk.json').then(res=>{if(!res.ok)throw Error('步行数据无法读取');return res.json();}),
  load('district.glb'),
 ]);
 scene.add(env.model);
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
 const palette=new Map();
 env.model.traverse(o=>{if(o.isMesh&&o.material?.name)palette.set(o.material.name,o.material);});
 for(const [id,shop] of Object.entries(SHOPS)){
  if(id==='juiceCart'){actors.set(id,actors.get('vendor'));continue;}
  furnishShop(scene,shop,palette);
  const source=actors.get(shop.cast), original=source.model,model=original.clone(true);
  const originals=[],copies=[];original.traverse(o=>originals.push(o));model.traverse(o=>copies.push(o));
  const cloned=new Map(originals.map((o,i)=>[o,copies[i]]));
  originals.forEach(o=>{if(o.isSkinnedMesh){
   const copy=cloned.get(o),skeleton=o.skeleton.clone();
   skeleton.bones=o.skeleton.bones.map(b=>cloned.get(b));copy.bind(skeleton,o.bindMatrix);
  }});
  model.position.set(shop.x-1.25*Math.sin(shop.yaw)+.38*Math.cos(shop.yaw),.22,shop.z-1.25*Math.cos(shop.yaw)-.38*Math.sin(shop.yaw));
  model.rotation.y=shop.yaw;scene.add(model);actors.set(id,{model,spec:{rotationY:shop.yaw}});
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
 const ledger=new T.Group();ledger.position.set(15.62,1.31,.58);scene.add(ledger);
 for(let i=0;i<3;i++){
  const sheet=new T.Mesh(new T.BoxGeometry(.26,.012,.19),new T.MeshStandardMaterial({color:i===2?0xf1dfb0:0x688d87}));
  sheet.position.y=i*.016;ledger.add(sheet);
 }
 for(const x of [16.10,16.86])fitting(0x746754,x,2.82,1.58,.014,1.02,.014);
 const sign=storeSign('憑單取衣',.94,.24);sign.position.set(16.48,2.20,1.58);sign.rotation.y=Math.PI;scene.add(sign);
 const desk=new T.Group();desk.position.set(14.99,0,1.54);scene.add(desk);
 for(let i=0;i<6;i++){
  const fold=new T.Mesh(new T.BoxGeometry(.52,.065,.34),new T.MeshStandardMaterial({color:i%2?0x879eb2:0xe8d4b4}));
  fold.position.set(.64,1.32+i*.065,.25);desk.add(fold);
 }
 const paper=new T.Mesh(new T.BoxGeometry(.27,.025,.32),new T.MeshStandardMaterial({color:0xf3e1bc}));
 paper.position.set(15.61,1.30,.98);scene.add(paper);
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
 return {layout,actors,render,face,illuminate,placeRack,refreshShadows};
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
 for(let i=0;i<3;i++)stock(-.49+i*.32,1.01,-.62,i);
 for(const x of [-.69,.69])box(wood,x,1.23,-.88,.042,.55,.042);
 if(shop.kind==='bakery')box(cream,0,1.51,-.88,1.46,.055,.29);
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
