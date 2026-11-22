import {createReunionWall,savedPrint} from './reunion-wall.js';
import * as T from 'three';
import {mouthShapes} from './voice-clips.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

const tableY = .945;
const materials = new Map();
const vesselWall=new T.CylinderGeometry(.5,.40,1,32,1,true);
const glassMaterial=new T.MeshStandardMaterial({color:0xc2e3df,transparent:true,opacity:.28,side:T.DoubleSide,roughness:.17,depthWrite:false});
const cube = new T.BoxGeometry(1,1,1);
const sphere = new T.SphereGeometry(.5,20,14);
const cup = new T.CylinderGeometry(.5,.40,1,32);
const disc = new T.CylinderGeometry(.5,.48,1,36);

function part(parent, shape, color, x,y,z, w,h,d) {
 if (!materials.has(color)) materials.set(color,new T.MeshStandardMaterial({color,roughness:.55}));
 const mesh = new T.Mesh(shape,materials.get(color));
 mesh.position.set(x,y,z);
 mesh.scale.set(w,h,d);
 parent.add(mesh);
 return mesh;
}

function dish(item,remaining) {
 const group = new T.Group();
 const piece = (shape,color,x,y,z,w,h,d) => part(group,shape,color,x,y,z,w,h,d);
 const key = item.itemId.slice(item.itemId.indexOf('-')+1);
 const porcelain = 0xf4eddd;
 if (item.options.serving === '外賣') {
  piece(cube,0xb98a52,0,.085,0,.17,.17,.12);
  piece(cube,0xd9b78b,0,.174,0,.17,.018,.094);
 } else if (item.itemId.startsWith('drink-')) {
  const iced=item.options.temperature==='凍', height=iced?.146:.095;
  piece(disc,porcelain,0,.004,0,.135,.008,.135);
  // Open vessels keep the empty state hollow. Liquid drops with every sip.
  const wall=piece(vesselWall,iced?0xdae7dd:porcelain,0,.009+height/2,0,.094,height,.094);
  if(iced)wall.material=glassMaterial;
  piece(disc,porcelain,0,.012,0,.075,.005,.075);
  const colors={'lemon-tea':0x884016,'milk-tea':0xb87945,yuanyang:0x895633,horlicks:0xc7a878};
  if(remaining){
   const liquidHeight=height*(.12+.26*Math.min(remaining,3));
   const width=.074+.014*liquidHeight/height;
   piece(cup,colors[key],0,.014+liquidHeight/2,0,width,liquidHeight,width);
  }
  if (iced && remaining) {
   piece(cup,0xb24437,.022,height+.035,0,.006,.078,.006).rotation.z=-.17;
   if(key==='lemon-tea') piece(disc,0xe4c744,-.032,height+.018,0,.048,.005,.048).rotation.z=1.15;
  } else if(!iced) piece(new T.TorusGeometry(.024,.005,8,20),porcelain,0,.065,.047,1,1,1).rotation.y=Math.PI/2;
 } else {
  piece(disc,0x35645d,0,.004,0,.214,.008,.214);
  piece(cup,porcelain,0,.013,0,.224,.014,.224);
  const size=Math.min(1,.56+remaining*.15);
  const filling=new T.Group();group.add(filling);filling.position.y=.02;filling.scale.setScalar(size);
  const food=(shape,color,x,y,z,w,h,d)=>part(filling,shape,color,x,y,z,w,h,d);
  if(!remaining) return group;
  if(key==='pineapple-bun'){
   food(sphere,0xb66e28,0,.025,0,.166,.058,.15);
   food(cube,0xffda74,.022,.046,.013,.114,.012,.101);
   food(sphere,0xd49438,0,.064,0,.17,.065,.153);
   for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++)food(sphere,0xe5af51,i*.039,.091-(i*i+j*j)*.005,j*.033,.044,.012,.036);
  }else if(key==='charsiu-rice'){
   food(sphere,0xf7e5be,0,.024,0,.17,.064,.146);
   for(let i=0;i<5;i++)food(sphere,0xa3432c,(i-2)*.025,.05,(i-2)*.01,.047,.021,.081).rotation.y=.32;
  }else if(key==='wonton-noodle'){
   food(cup,porcelain,0,.031,0,.18,.062,.18);
   food(disc,0xae8546,0,.061,0,.16,.004,.16);
   for(let i=0;i<4;i++)food(sphere,0xe2bb72,Math.cos(i*1.6)*.048,.067,Math.sin(i*1.6)*.046,.05,.03,.042);
   for(let i=0;i<7;i++)food(new T.TorusGeometry(.025,.002,6,18),0xf2ca73,i*.004-.015,.067,i*.003,1,1,1).rotation.x=1.5;
  }else if(key==='french-toast'||key==='egg-sandwich'){
   for(let i=0;i<3;i++)food(cube,[0xcc8841,0xffcc59,0xe1a95d][i],0,.013+i*.015,0,.133,.019,.134);
   if(key==='french-toast')food(cube,0xffde78,.013,.058,0,.043,.012,.041);
  }else for(let i=0;i<5;i++)food(sphere,0xc08a37,.054*Math.cos(i*1.25),.025,.054*Math.sin(i*1.25),.05,.05,.05);
 }
 return group;
}

// Shop-local coordinates in metres. The 0.8 m cross-aisle runs between the
// two booth rows. Enter it from the central aisle, never across a bench.
function aisle(points){
 const route=new T.CurvePath();
 const knots=points.map(([x,z])=>new T.Vector3(x,.195,z));
 let start=knots[0];
 for(let i=1;i<knots.length-1;i++){
  const corner=knots[i],radius=Math.min(.24,corner.distanceTo(start)*.35,corner.distanceTo(knots[i+1])*.35);
  const entry=corner.clone().addScaledVector(start.clone().sub(corner).normalize(),radius);
  const exit=corner.clone().addScaledVector(knots[i+1].clone().sub(corner).normalize(),radius);
  route.add(new T.LineCurve3(start,entry));route.add(new T.QuadraticBezierCurve3(entry,corner,exit));start=exit;
 }
 route.add(new T.LineCurve3(start,knots.at(-1)));return route;
}
const serviceRoute=aisle([[-.74,-4.03],[.56,-4.03],[.56,-2.64],[2.06,-2.64]]);
const seatingRoute=aisle([[.18,.27],[.26,-.61],[.54,-2.64],[2.72,-2.64],[2.73,-1.55]]);

export function furnishKitchen(scene,district){
 // The original bakery and tea equipment were baked into multi-material
 // meshes. Vacate just the rear service bay before building the kitchen.
 district.traverse(node=>{
  if(!node.isMesh||!/(service_counter|tea_room_wall_fittings)/i.test(node.parent.name))return;
  const g=node.geometry,index=g.index,pos=g.attributes.position;
  if(!index)return;
  const kept=[];
  for(let i=0;i<index.count;i+=3){
   const a=index.getX(i),b=index.getX(i+1),c=index.getX(i+2);
   const x=(pos.getX(a)+pos.getX(b)+pos.getX(c))/3;
   const z=(pos.getZ(a)+pos.getZ(b)+pos.getZ(c))/3;
   if(z< -3.03 && (x<1.16||(/wall_fittings/i.test(node.parent.name)&&z< -4.65)))continue;
   kept.push(a,b,c);
  }
  if(kept.length!==index.count)g.setIndex(kept);
 });
 const kitchen=new T.Group();kitchen.name='Kitchen';scene.add(kitchen);
 const box=(color,x,y,z,w,h,d)=>part(kitchen,cube,color,x,y,z,w,h,d);
 const metal=new T.MeshStandardMaterial({color:0xadbcbb,metalness:.43,roughness:.31});
 const stainless=(x,y,z,w,h,d)=>{const m=box(0xabb9ba,x,y,z,w,h,d);m.material=metal;return m;};
 const round=(color,x,y,z,w,h,d)=>part(kitchen,disc,color,x,y,z,w,h,d);
 const enamel=0xe8e2ca, teal=0x47776d, ink=0x283b39;
 // Full-height partition, a recessed pass on the left and a separate 1.10 m
 // personnel doorway on the right. All dimensions use the same local frame
 // as the waiter path and both rendered views of the shop.
 const tileCanvas=document.createElement('canvas');tileCanvas.width=256;tileCanvas.height=128;
 const ctx=tileCanvas.getContext('2d');ctx.fillStyle='#9ba69c';ctx.fillRect(0,0,256,128);
 for(let i=0;i<2;i++){ctx.fillStyle=i?'#dedfd0':'#e6e6d8';ctx.fillRect(i*128+2,2,125,125);}
 const tiles=new T.CanvasTexture(tileCanvas);tiles.colorSpace=T.SRGBColorSpace;
 tiles.wrapS=tiles.wrapT=T.RepeatWrapping;
 const tile=(x,y,z,w,h,d)=>{
  const mesh=box(enamel,x,y,z,w,h,d);
  // World-scaled UVs keep grout lines the same size on jambs and lintels.
  const g=cube.clone(),uv=g.attributes.uv,pos=g.attributes.position,n=g.attributes.normal;
  for(let i=0;i<uv.count;i++){
   const X=x+pos.getX(i)*w,Y=y+pos.getY(i)*h,Z=z+pos.getZ(i)*d;
   uv.setXY(i,(Math.abs(n.getX(i))>.5?Z:X)/.44,(Math.abs(n.getY(i))>.5?Z:Y)/.22);
  }
  mesh.geometry=g;mesh.material=new T.MeshStandardMaterial({map:tiles,roughness:.36});return mesh;
 };
 tile(-1.76,.65,-3.10,3.42,.98,.18);
 tile(-3.17,1.73,-3.10,.60,1.20,.18);
 tile(-.28,1.73,-3.10,.46,1.20,.18);
 tile(-1.15,2.78,-3.10,4.65,.92,.18);
 tile(1.17,1.71,-4.23,.12,3.08,2.43);
 tile(-1.17,1.70,-5.23,4.68,3.09,.12);
 stainless(-1.69,1.16,-3.10,2.61,.065,.53);
 for(const x of [-.055,1.11])box(teal,x,1.27,-3.10,.045,2.22,.20);
 box(teal,.53,2.34,-3.10,1.19,.07,.20);
 // Cabinet fronts, inset burner deck, wok rings and a hood with baffle filters.
 stainless(-1.40,.62,-4.91,3.18,.87,.57);stainless(-1.40,1.075,-4.91,3.28,.05,.68);
 for(const x of [-2.63,-2.01,-1.39,-.77,-.15]){
  box(0x708584,x,.64,-4.612,.59,.72,.022);stainless(x,.91,-4.585,.20,.023,.032);
 }
 for(const x of [-2.54,-1.94]){
  round(ink,x,1.12,-4.90,.43,.06,.43);
  part(kitchen,cup,0x384543,x,1.19,-4.90,.40,.12,.40);
  round(0x302e24,x,1.253,-4.90,.37,.011,.37);
  box(0x594233,x+.22,1.24,-4.90,.15,.032,.038);
 }
 stainless(-2.24,2.13,-4.84,1.63,.22,.76);
 stainless(-2.24,2.68,-4.95,.51,.88,.42);
 for(let i=0;i<15;i++)box(0x656f68,-2.94+i*.10,2.12,-4.45,.043,.145,.015);
 // Wall-mounted utensil rail and a condiment shelf beside the wok station.
 stainless(-1.58,1.87,-5.09,1.19,.025,.035);
 for(const [i,x] of [-2.02,-1.84,-1.66,-1.48].entries()){
  const drop=.20+(i%2)*.04;
  stainless(x,1.86-drop/2,-5.06,.014,drop,.014);
  part(kitchen,sphere,i===3?0x85613d:0x899b99,x,1.82-drop,-5.05,.075,.09,.033);
 }
 stainless(-.72,1.76,-5.00,.88,.025,.24);
 for(let i=0;i<5;i++){
  const x=-1.02+i*.147,h=i%2?.18:.22;
  round(i%2?0x805032:0x624230,x,1.78+h/2,-5.0,.08,h,.08);
  round(0xebe1bc,x,1.80+h/2,-5.0,.081,.063,.081);
  round(i%2?0x974a32:0x373e35,x,1.79+h,-5.0,.049,.034,.049);
 }
 // A chopping station and deep sink share the rear wall.
 box(0xb78c5a,-1.20,1.123,-4.84,.55,.043,.39);
 for(let i=0;i<5;i++)box(0x628447,-1.22+i*.019,1.152,-4.86,.015,.01,.135).rotation.y=.27;
 box(0x9aa9a3,-1.01,1.155,-4.81,.12,.008,.048);
 box(0x704b33,-.92,1.155,-4.81,.075,.018,.018);
 box(0x4b5c58,-.39,1.103,-4.90,.50,.012,.38);
 stainless(-.39,1.113,-5.096,.56,.024,.03);
 stainless(-.39,1.113,-4.704,.56,.024,.03);
 for(const x of [-.66,-.12])stainless(x,1.113,-4.90,.026,.024,.40);
 stainless(-.39,1.28,-5.07,.026,.33,.026);stainless(-.39,1.44,-4.99,.026,.026,.18);
 stainless(-.39,1.41,-4.90,.026,.07,.026);
 for(const x of [-1.10,-.78,-.46])for(let i=0;i<4;i++)round(enamel,x,1.18+i*.019,-3.16,.22,.019,.22);
 const strip=box(0xffefd0,-1.74,2.29,-3.23,2.18,.031,.05);
 strip.material=new T.MeshStandardMaterial({color:0xffefd0,emissive:0xffdc9b,emissiveIntensity:1.1});
 const passLight=new T.PointLight(0xffe3bb,6,3);passLight.position.set(-1.68,2.15,-3.72);kitchen.add(passLight);
 // Dockets clipped to the pass rail.
 stainless(-1.59,2.22,-3.01,1.61,.032,.042);
 for(let i=0;i<4;i++){
  const x=-2.18+i*.23;box(enamel,x,2.121,-2.99,.133,.18,.005);
  for(let j=0;j<3;j++)box(0x968571,x,2.16-j*.026,-2.986,.087,.006,.003);
 }
 const panels=[];
 const cloth=new T.MeshStandardMaterial({color:0x924c38,roughness:.98,side:T.DoubleSide});
 for(const side of [-1,1]){
  const geo=new T.PlaneGeometry(.58,2.12,32,10),p=geo.attributes.position;
  for(let i=0;i<p.count;i++){
   const u=(p.getX(i)+.29)/.58;
   p.setXYZ(i,side*(u*.58),p.getY(i)+.016*Math.cos(u*20),.035*Math.sin(u*Math.PI*8));
  }
  geo.computeVertexNormals();const panel=new T.Mesh(geo,cloth);
  panel.name='Kitchen curtain';panel.castShadow=true;panel.receiveShadow=true;panel.position.set(.53-side*.56,1.23,-3.11);kitchen.add(panel);panels.push(panel);
 }
 return openness=>{for(const panel of panels)panel.scale.x=1-.84*openness;};
}

export function mouthPose(model){
 const bindings=[];
 model.traverse(mesh=>{
  const keys=mesh.morphTargetDictionary;
  if(keys?.jawOpen===undefined)return;
  bindings.push({keys,weights:mesh.morphTargetInfluences});
 });
 return (level=0,shape)=>{
  const pose=Array.isArray(shape)?shape:mouthShapes[shape]??mouthShapes.C;
  const [jaw,round,wide,upper,press=0,tuck=0,tongue=0]=pose;
  const energy=T.MathUtils.clamp(level,0,1);
  const effort=energy*(2-energy);
  for(const {keys,weights} of bindings){
   weights[keys.jawOpen]=effort*jaw;
   weights[keys.mouthPucker]=effort*round;
   weights[keys.mouthStretch]=effort*wide;
   weights[keys.upperLipRaise]=effort*upper*.75;
   weights[keys.mouthPress]=effort*press;
   weights[keys.lowerLipTuck]=effort*tuck;
   weights[keys.tongueUp]=effort*tongue;
  }
 };
}

// Each character shares a two-cycle walking clip. Sample the opposite
// planted leg a quarter of the way through instead of freezing mid-stride.
export function plantedStance(stride){
 const tracks=stride.tracks.map(track=>{
  const phase=/Right(UpLeg|Leg|Foot|Toe)/i.test(track.name)?stride.duration*.25:0;
  return new track.constructor(track.name,[0],track.createInterpolant().evaluate(phase));
 });
 return new T.AnimationClip('Standing',1,tracks);
}

export function clearBoothCups(district){
 // Clear the two decorative cup sets baked into this booth only. The neighboring
 // tables keep their original crockery. Indices here are shop-local GLB vertices.
 district.traverse(node=>{
  if(!node.isMesh||!['white','tea'].includes(node.material.name)||!node.parent.name.toLowerCase().includes('counter'))return;
  const geometry=node.geometry,index=geometry.index,pos=geometry.attributes.position;
  if(!index)return;
  const kept=[];
  for(let i=0;i<index.count;i+=3){
   const a=index.getX(i),x=pos.getX(a),z=pos.getZ(a);
   if(x>1.91&&x<2.37&&z>-2.05&&z< -1.18)continue;
   kept.push(a,index.getX(i+1),index.getX(i+2));
  }
  geometry.setIndex(kept);
 });
}

export async function createDiningRoom(canvas) {
 const loader=new GLTFLoader();
 const [district,ming,service]=await Promise.all(
  ['district','aming-styled-v3','aming-service'].map(name=>loader.loadAsync('./assets/street/'+name+'.glb'))
 );
 const renderer=new T.WebGLRenderer({canvas,antialias:true});
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
 renderer.toneMapping=T.ACESFilmicToneMapping;
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(67,1,.025,140);
 scene.background=new T.Color(0xc6d8dd);
 // Work in the shop's modelling coordinates. The district, including the window view,
 // stays registered to the existing booth and counter.
 district.scene.rotation.y=-Math.PI/2;
 district.scene.position.set(8.8,0,15.72);
 clearBoothCups(district.scene);
 scene.add(district.scene);
 createReunionWall(scene)(savedPrint());
 const openCurtain=furnishKitchen(scene,district.scene);
 const sky=new T.HemisphereLight(0xf3ebe2,0xab9680,1.75);
 const sun=new T.DirectionalLight(0xffdfaf,2.1);
 sun.position.set(2,7,4);scene.add(sun,sky);
 const warm=new T.PointLight(0xffddac,10,8);warm.position.set(1.6,2.65,-1.5);scene.add(warm);
 const actor=ming.scene;actor.scale.setScalar(1.72);scene.add(actor);
 const setMouth=mouthPose(actor,'aming');
 const take=service.scene,scale=actor.scale.x;
 take.scale.setScalar(scale);
 const saucer=take.getObjectByName('ServiceSaucer');
 const serviceMixer=new T.AnimationMixer(take);
 for(const clip of service.animations)serviceMixer.clipAction(clip).setLoop(T.LoopOnce,1).play().clampWhenFinished=true;
 const takeDuration=Math.max(...service.animations.map(clip=>clip.duration));
 const takeBones={};
 take.traverse(o=>{if(o.isBone)takeBones[o.name.replace(/^mixamorig[:_]?/i,'')]=o;});
 const carriedCup=saucer.clone(true);scene.add(carriedCup);carriedCup.scale.setScalar(scale);carriedCup.visible=false;
 const teaColors={'milk-tea':0xb87945,'lemon-tea':0x884016,yuanyang:0x895633,horlicks:0xc7a878};
 const teaMaterials=new Map();
 const serviceGlass=saucer.getObjectByName('ColdGlass');
 serviceGlass.material=glassMaterial;
 carriedCup.getObjectByName('ColdGlass').material=glassMaterial;
 function setDrink(mesh,item,remaining=3){
  const key=item.itemId.slice('drink-'.length),iced=item.options.temperature==='凍';
  for(const piece of mesh.children){
   const liquid=piece.name.endsWith('Tea');
   piece.visible=piece.name.startsWith(iced?'Cold':'Hot')
    &&(piece.name!=='ColdLemon'||key==='lemon-tea'&&remaining>0)&&(!liquid||remaining>0);
   if(!liquid)continue;
   const color=teaColors[key]??0x9c5e30;
   if(!teaMaterials.has(color)){
    const material=piece.material.clone();material.color.setHex(color);teaMaterials.set(color,material);
   }
   piece.material=teaMaterials.get(color);
   const sipped=3-Math.max(0,Math.min(3,remaining));
   piece.position.y=saucer.getObjectByName(piece.name).position.y-sipped*(iced?.018:.008);
   piece.scale.x=piece.scale.z=1-sipped*(iced?.043:.052);
  }
 }
 serviceMixer.setTime(takeDuration-.001);
 const takeEndpoint=saucer.position.clone().multiplyScalar(scale),takeOffset=new T.Vector3(),drinks=new Map();

 const mixer=new T.AnimationMixer(actor);
 const stride=ming.animations[0];
 let walkAction,idleAction;
 if(stride){
  walkAction=mixer.clipAction(stride).play();
  idleAction=mixer.clipAction(plantedStance(stride)).play();
 }
 const bones={};actor.traverse(o=>{if(o.isBone)bones[o.name.replace(/^mixamorig[:_]?/i,'')]=o;});
 // Undo the previous procedural offsets before sampling animation. Mixers
 // can skip writing unchanged tracks on repeated renders of the same time.
 const poseBones=[bones.Spine,bones.Head,bones.LeftArm,bones.LeftForeArm,bones.RightArm,bones.RightForeArm,...Object.entries(bones)
  .filter(([name])=>name==='RightShoulder'||name.startsWith('RightHand')).map(([,bone])=>bone)].filter(Boolean)
  .map(bone=>({bone,base:bone.quaternion.clone()}));
 const docket=new T.Group();scene.add(docket);
 part(docket,cube,0x6f4732,0,0,0,.12,.014,.16);
 part(docket,cube,0xffedbf,0,.01,0,.11,.008,.15);
 for(let row=0;row<4;row++)part(docket,cube,0x958f76,0,.016,.025*row-.045,.08,.001,.002);
 const hand=bones.LeftHand;
 const menu=part(scene,cube,0x874038,2.19,tableY+.009,-1.13,.33,.017,.19);
 const cover=document.createElement('canvas');cover.width=384;cover.height=224;
 const ink=cover.getContext('2d');ink.fillStyle='#863e35';ink.fillRect(0,0,384,224);
 ink.strokeStyle='#d8b878';ink.lineWidth=4;ink.strokeRect(10,10,364,204);
 ink.fillStyle='#ffebb8';ink.textAlign='center';ink.font='bold 52px serif';ink.fillText('粵 記 餐 牌',192,113);
 ink.font='19px serif';ink.fillText('YUE KEI   ·   SINCE 1986',192,157);
 const paper=new T.CanvasTexture(cover);paper.colorSpace=T.SRGBColorSpace;
 const title=new T.Mesh(new T.PlaneGeometry(.19,.33),new T.MeshBasicMaterial({map:paper}));
 title.rotation.order='YXZ';title.rotation.set(-Math.PI/2,Math.PI/2,0);title.position.copy(menu.position);title.position.y+=.009;scene.add(title);
 const shade=document.createElement('canvas');shade.width=shade.height=64;
 const brush=shade.getContext('2d'),fade=brush.createRadialGradient(32,32,7,32,32,32);
 fade.addColorStop(0,'rgba(56,37,22,.52)');fade.addColorStop(1,'rgba(56,37,22,0)');
 brush.fillStyle=fade;brush.fillRect(0,0,64,64);
 const contact=new T.MeshBasicMaterial({map:new T.CanvasTexture(shade),transparent:true,depthWrite:false});
 const shadowPlane=new T.PlaneGeometry(.27,.27);
 const plates=new T.Group();scene.add(plates);
 const glass=new T.Vector3(2.09,tableY,-2.04);
 const tumbler=part(scene,vesselWall,0xd1ded8,glass.x,tableY+.066,glass.z,.102,.132,.102);
 tumbler.material=glassMaterial;
 part(scene,disc,0xc4d4ce,glass.x,tableY+.004,glass.z,.081,.008,.081);
 const water=part(scene,cup,0x9acac2,glass.x,tableY,glass.z,.083,.1,.083);
 const jug=new T.Group();scene.add(jug);
 part(jug,cup,0xcac4b6,0,-.017,0,.14,.20,.14);
 part(jug,disc,0x403832,0,.085,0,.14,.016,.14);
 const spout=part(jug,cup,0xb9b7a8,.075,.056,0,.047,.086,.047);spout.rotation.z=-.8;
 part(jug,new T.TorusGeometry(.06,.012,8,24),0x46372f,-.083,0,0,1,1,1);
 const stream=part(scene,disc,0xa2d4ce,0,0,0,.010,1,.010);
 const smooth=T.MathUtils.smoothstep,grip=new T.Vector3(),target=new T.Vector3(),rest=new T.Vector3();
 const tray=part(scene,disc,0x805541,0,0,0,.34,.015,.27);
 function aimHand(goal,weight,side='Right',contact='HandMiddle1'){
  const end=bones[side+contact]||bones[side+'Hand'];if(!end)return;
  end.getWorldPosition(rest);
  if(!weight){grip.copy(rest);return;}
  target.copy(rest).lerp(goal,weight);
  for(let i=0;i<9;i++)for(const joint of [bones[side+'ForeArm'],bones[side+'Arm']]){
   const pivot=joint.getWorldPosition(new T.Vector3());
   const from=end.getWorldPosition(new T.Vector3()).sub(pivot).normalize();
   const to=target.clone().sub(pivot).normalize();
   const delta=new T.Quaternion().setFromUnitVectors(from,to);
   const parent=joint.parent.getWorldQuaternion(new T.Quaternion());
   joint.quaternion.premultiply(parent.clone().invert().multiply(delta).multiply(parent));
  }
  end.getWorldPosition(grip);
 }
 const spoon=new T.Group();scene.add(spoon);
 part(spoon,sphere,0xd7d4c8,0,0,.068,.041,.011,.063);
 part(spoon,cube,0xc7c4b8,0,.002,-.017,.011,.006,.123);
 const sticks=[0,.014].map(offset=>part(scene,cube,0x814c2f,2.27,tableY+.007,-2.07+offset,.218,.008,.008));
 const eye=new T.Vector3(),focus=new T.Vector3();
 let orderKey='',lastSize='',slots=[],currentView;
 function update(state,view){
  currentView=view;
  const width=canvas.clientWidth,height=canvas.clientHeight;if(!width||!height)return;
  if(lastSize!==width+'x'+height){lastSize=width+'x'+height;renderer.setSize(width,height,false);camera.aspect=width/height;camera.fov=width<height?81:67;camera.updateProjectionMatrix();}
  const beat=view.beat,pose=beat?.pose;
  const progress=beat?T.MathUtils.clamp((Date.now()-beat.start)/beat.duration,0,1):1;
  const arrive=pose==='approach'?progress:pose==='depart'?1-progress:pose==='prepare'?0:state.waiterPresent||beat?1:0;
  serviceRoute.getPoint(arrive,actor.position);
  const walking=['approach','depart'].includes(pose);
  const heading=serviceRoute.getTangent(Math.min(.9999,Math.max(.0001,arrive)));
  const kitchenYaw=-2.70,tableYaw=.54,departing=pose==='depart';
  const travelYaw=Math.atan2(heading.x,heading.z)+(departing?Math.PI:0);
  const blendYaw=(from,to,fraction)=>from+Math.atan2(Math.sin(to-from),Math.cos(to-from))*fraction;
  if(walking){
   const startYaw=departing?tableYaw:kitchenYaw,endYaw=departing?kitchenYaw:tableYaw;
   actor.rotation.y=blendYaw(startYaw,travelYaw,T.MathUtils.smootherstep(progress,0,.14));
   actor.rotation.y=blendYaw(actor.rotation.y,endYaw,T.MathUtils.smootherstep(progress,.86,1));
  }else actor.rotation.y=arrive>0?tableYaw:kitchenYaw;
  for(const {bone,base} of poseBones)bone.quaternion.copy(base);
  const walkProgress=progress;
  const strideWeight=walking?T.MathUtils.smoothstep(walkProgress,0,.07)*(1-T.MathUtils.smoothstep(walkProgress,.92,1)):0;
  walkAction?.setEffectiveWeight(strideWeight);
  idleAction?.setEffectiveWeight(1-strideWeight);
  mixer.setTime(walkProgress*serviceRoute.getLength()/1.05);
  for(const {bone,base} of poseBones)base.copy(bone.quaternion);
  const writing=pose==='talk'&&['order-review','food'].includes(beat.kind);
  const placing=pose==='place', pouring=placing&&beat.kind==='REQUEST_WATER',laying=placing&&beat.kind==='REQUEST_UTENSILS';
  const extend=placing?smooth(progress,0,.38)*(1-smooth(progress,.75,1)):0;
  // Lean from the waist toward the table. Use the room axis since the
  // imported skeleton's local head and spine axes differ from the scene's.
  function lean(bone,angle){
   if(!bone||!angle)return;
   const axis=new T.Vector3(1,0,0).applyQuaternion(bone.parent.getWorldQuaternion(new T.Quaternion()).invert());
   bone.quaternion.premultiply(new T.Quaternion().setFromAxisAngle(axis,angle));
  }
  lean(bones.Spine,(pouring?.44:.86)*extend);
  lean(bones.Head,(writing?.19:.045)+.16*extend);
  if(writing&&bones.LeftForeArm)bones.LeftForeArm.rotateX(-.55);
  docket.visible=!!(writing&&hand);
  if(docket.visible){hand.getWorldPosition(docket.position);docket.rotation.y=actor.rotation.y;}

  eye.set(2.73,1.48,-1.55);focus.set(1.89,1.28,-2.51);
  if(['table','menu','bill'].includes(view.camera)){
   focus.set(2.08,.94,-1.59);
   if(camera.aspect<1){eye.y+=.36;eye.x+=.12;}
   if(view.camera==='table'&&(pouring||laying)){
    const framing=smooth(progress,0,.25)*(1-smooth(progress,.77,1));
    focus.lerp(new T.Vector3(2.06,1.27,-2.44),framing);
   }
  }
  if(view.camera==='window')focus.set(1.85,1.52,1.9);
  if(view.camera==='cashier')focus.set(-2,1.35,-2.8);
  if(['walk','entrance'].includes(view.camera)){
   const t=view.camera==='walk'?T.MathUtils.smootherstep(progress,0,1):0;
   seatingRoute.getPoint(t,eye);eye.y=1.78-.30*T.MathUtils.smoothstep(t,.82,1);
   actor.position.set(-.40,.195,-1.14);actor.rotation.y=.31;
   focus.copy(actor.position);focus.y=1.59;
   if(t>0){
    const ahead=seatingRoute.getPoint(Math.min(1,t+.13));ahead.y=eye.y-.10;
    ahead.lerp(new T.Vector3(1.89,1.28,-2.51),T.MathUtils.smoothstep(t,.77,1));
    focus.lerp(ahead,T.MathUtils.smoothstep(t,0,.16));
   }
  }
  openCurtain(1-T.MathUtils.smoothstep(Math.hypot(actor.position.x-.53,actor.position.z+3.11),.30,.83));
  setMouth(view.speechLevel||0,view.speechShape);
  camera.position.copy(eye);
  const dx=focus.x-eye.x,dy=focus.y-eye.y,dz=focus.z-eye.z;
  const elevation=Math.atan2(dy,Math.hypot(dx,dz));
  camera.rotation.set(T.MathUtils.clamp(elevation+pitch,-1.43,1.32),Math.atan2(-dx,-dz)+yaw,0,'YXZ');
  camera.updateMatrixWorld();
  sky.intensity=view.weather==='rain'?1.16:1.75;
  const utensilSpot=new T.Vector3(2.015,tableY+.008,-1.988);
  const fill=view.water?1:pouring?smooth(progress,.42,.73):0;
  water.visible=fill>0;water.scale.y=.098*fill;water.position.y=tableY+.009+water.scale.y/2;
  jug.visible=beat?.kind==='REQUEST_WATER';
  stream.visible=pouring&&progress>.42&&progress<.73;
  if(jug.visible){
   // Work backwards from the spout over the glass to the handle in his hand.
   jug.rotation.order='YXZ';
   jug.rotation.y=actor.rotation.y-tableYaw-1.02;
   jug.rotation.z=pouring?-.90*smooth(progress,.24,.41)*(1-smooth(progress,.74,.94)):0;
   const handle=new T.Vector3(-.137,0,0).applyQuaternion(jug.quaternion);
   const tip=new T.Vector3(.109,.088,0).applyQuaternion(jug.quaternion);
   const goal=glass.clone().add(new T.Vector3(0,.32,0)).sub(tip).add(handle);
   const carry=actor.localToWorld(new T.Vector3(-.065,.59,.12));
   aimHand(carry.lerp(goal,extend),1);
   jug.position.copy(grip).sub(handle);
   if(stream.visible){
    const top=jug.position.clone().add(tip),surface=tableY+.009+water.scale.y;
    stream.position.set(top.x,(top.y+surface)/2,top.z);
    stream.scale.y=Math.max(0,top.y-surface);
   }
  }
  const deliveringSticks=beat?.kind==='REQUEST_UTENSILS'&&!view.utensils;
  if(deliveringSticks){
   const reach=utensilSpot.clone().add(new T.Vector3(0,.043,-.062));
   aimHand(reach,extend);
  }
  for(const [i,tool] of [...sticks,spoon].entries()){
   tool.visible=!!view.utensils||deliveringSticks;
   const land=utensilSpot.clone();land.x+=i*.017;
   tool.position.copy(land);
   if(i<2)tool.rotation.y=-Math.PI/2;
   if(deliveringSticks){
    const release=laying?smooth(progress,.48,.64):0;
    const palm=grip.clone();palm.x+=i*.017;palm.z+=.062;
    tool.position.lerpVectors(palm,land,release);
    tool.rotation.x=-.58*(1-release);
    if(i<2)tool.rotation.z=.58*(1-release);
   }else{tool.rotation.x=0;tool.rotation.z=0;}
  }
  const pending=beat?.orderItemId?state.items.find(i=>i.id===beat.orderItemId):state.items.find(i=>i.status==='confirmed');
  const served=state.items.filter(i=>i.status==='served');
  const isCup=i=>i?.itemId.startsWith('drink-')&&i.options.serving!=='外賣';
  const confirmed=state.items.filter(i=>i.status==='confirmed');
  const activeDrink=beat?.carrying&&isCup(pending)&&(placing||walking)?pending:null;
  tray.visible=!!beat?.carrying&&(!activeDrink||confirmed.some(i=>i!==activeDrink));
  // Keep the landing points on the waiter-facing side of the table.
  drinks.clear();
  for(const item of state.items.filter(isCup)){
   const i=drinks.size;
   drinks.set(item.id,new T.Vector3(1.84+.232*(i%3),tableY,-1.862+.235*Math.floor(i/3)));
  }
  carriedCup.visible=Boolean(activeDrink);
  if(activeDrink){
   const finish=drinks.get(activeDrink.id),phase=placing?progress:0;
   const land=placing?smooth(phase,.02,.53):0,settle=placing?smooth(phase,.80,1):0;
   serviceMixer.setTime(Math.min(takeDuration-.001,phase*takeDuration));
   const facing=actor.rotation.y;
   const carryYaw=placing?facing*(1-smooth(phase,0,.33))+facing*settle:facing;
   actor.rotation.y=carryYaw;
   if(placing)actor.position.lerp(takeOffset.copy(finish).sub(takeEndpoint),land*(1-settle));
   // Sample Blender's fingers and wrist while the normal actor keeps its
   // locomotion. Drive the arm to the same saucer attachment used in the bake.
   for(const [name,bone] of Object.entries(bones)){
    if(!takeBones[name]||!/^Right(Shoulder|Arm|ForeArm|Hand)/.test(name))continue;
    bone.quaternion.slerp(takeBones[name].quaternion,1-settle);
   }
   if(placing&&bones.Spine&&takeBones.Spine)bones.Spine.quaternion.slerp(takeBones.Spine.quaternion,1-settle);
   const wrist=bones.RightHand,reference=takeBones.RightHand;
   const yawRotation=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),carryYaw);
   takeOffset.copy(saucer.position).sub(reference.getWorldPosition(target).divideScalar(scale));
   takeOffset.multiplyScalar(scale).applyQuaternion(yawRotation);
   carriedCup.position.copy(wrist.getWorldPosition(rest)).add(takeOffset);
   if(placing){
    carriedCup.position.lerp(finish,smooth(phase,.48,.56));
    carriedCup.position.y=Math.max(tableY,carriedCup.position.y);
   }
   aimHand(carriedCup.position.clone().sub(takeOffset),1-settle,'Right','Hand');
   const rotation=reference.getWorldQuaternion(new T.Quaternion()).premultiply(yawRotation);
   const localRotation=wrist.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(rotation);
   wrist.quaternion.slerp(localRotation,1-settle);
   carriedCup.rotation.y=carryYaw;setDrink(carriedCup,activeDrink);
  }
  if(tray.visible){
   const hold=actor.localToWorld(new T.Vector3(.110,.575,.145));
   aimHand(hold,1,'Left');
   tray.position.copy(grip);tray.position.y+=.028;
   tray.rotation.y=actor.rotation.y;tray.scale.x=.54;tray.scale.z=.31;
  }
  const cargo=tray.visible?confirmed.filter(i=>i!==activeDrink).slice(0,2):[];
  const items=served.slice(view.tablePage*6,view.tablePage*6+6).concat(cargo);
  const tableIndex=new Map(state.items.filter(i=>!isCup(i)).map((item,i)=>[item.id,i%6]));
  const key=JSON.stringify(items.map(i=>[i.id,i.itemId,i.options,tableIndex.get(i.id),view.diningPortions.get(i.id)??3]));
  if(key!==orderKey){
   orderKey=key;plates.traverse(o=>{if(o.geometry?.type==='TorusGeometry')o.geometry.dispose();});plates.clear();
   slots=items.map(item=>{
    const i=tableIndex.get(item.id)??0;
    const remaining=view.diningPortions.get(item.id)??3,drink=drinks.get(item.id);
    const mesh=drink?saucer.clone(true):dish(item,remaining);
    if(drink){mesh.scale.setScalar(scale);setDrink(mesh,item,remaining);}
    // Reserve the nearest row and the first spot in the second row for cups.
    const foodColumn=(i+1)%3,foodRow=Math.floor((i+1)/3);
    const x=drink?.x??1.84+foodColumn*.232,z=drink?.z??-1.627+foodRow*.235;
    const shadeMesh=new T.Mesh(shadowPlane,contact);shadeMesh.rotation.x=-Math.PI/2;shadeMesh.position.set(x,tableY-.001,z);
    mesh.position.set(x,tableY,z);plates.add(shadeMesh,mesh);return {item,mesh,shadeMesh,x,z};
   });
  }
  for(const {item,mesh,shadeMesh,x,z} of slots){
   mesh.position.set(x,tableY,z);
   const cargoIndex=cargo.findIndex(c=>c.id===item.id);
   shadeMesh.visible=cargoIndex<0;
   if(cargoIndex>=0){
    const onTray=tray.position.clone();onTray.y+=.010;
    if(cargo.length>1){
     const offset=new T.Vector3(cargoIndex===0?-.118:.118,0,0).applyAxisAngle(new T.Vector3(0,1,0),actor.rotation.y);
     onTray.add(offset);
    }
    mesh.position.copy(onTray);
    if(placing&&item.id===pending?.id){
     shadeMesh.visible=progress>.62;
     const edge=new T.Vector3(x,tableY,-1.99);
     const path=onTray.clone().lerp(edge,smooth(progress,.20,.66));
     path.y+=.09*Math.sin(Math.PI*smooth(progress,.20,.66));
     mesh.position.copy(path).lerp(new T.Vector3(x,tableY,z),smooth(progress,.62,.88));
     const rim=mesh.position.clone().add(new T.Vector3(0,.02,-.09));
     aimHand(rim,smooth(progress,0,.20)*(1-smooth(progress,.81,1)));
    }
   }
  }
  renderer.render(scene,camera);
  positionButtons();
 }
 // Project the whole dish or book, including its rim and height. Position in
 // the hotspot container's coordinates, including its mobile/letterbox offset.
 function pin(el,object){
  if(!el)return;
  const bounds=new T.Box3().setFromObject(object),c=canvas.getBoundingClientRect(),host=el.offsetParent?.getBoundingClientRect();
  if(!host)return;
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
   const p=new T.Vector3(x,y,z).project(camera);if(p.z< -1||p.z>1)continue;
   const px=c.left-host.left+(p.x+1)*c.width/2,py=c.top-host.top+(1-p.y)*c.height/2;
   x0=Math.min(x0,px);x1=Math.max(x1,px);y0=Math.min(y0,py);y1=Math.max(y1,py);
  }
  el.style.visibility=isFinite(x0)?'visible':'hidden';if(!isFinite(x0))return;
  const w=Math.max(48,x1-x0+12),h=Math.max(48,y1-y0+12);
  Object.assign(el.style,{left:(x0+x1-w)/2+'px',top:(y0+y1-h)/2+'px',width:w+'px',height:h+'px',transform:'none'});
 }
 function positionButtons(){
  pin(document.querySelector('.table-menu-hotspot'),menu);
  pin(document.querySelector('.water-spot'),tumbler);
  for(const {item,mesh} of slots)pin(document.querySelector('[data-dining-select="'+CSS.escape(item.id)+'"].dining-food-spot'),mesh);
 }
 const ray=new T.Raycaster();
 const hotspots=document.querySelector('#hotspots');
 hotspots.addEventListener('click',event=>{
  // In an oblique view two padded rectangles can overlap. Prefer the actual
  // frontmost object under the pointer; keep the padded target for edge taps.
  if(!event.detail||!event.target.closest('.dining-food-spot,.table-menu-hotspot,.water-spot'))return;
  const r=canvas.getBoundingClientRect();
  ray.setFromCamera(new T.Vector2((event.clientX-r.left)/r.width*2-1,1-(event.clientY-r.top)/r.height*2),camera);
  const targets=[[menu,hotspots.querySelector('.table-menu-hotspot')],[tumbler,hotspots.querySelector('.water-spot')],
   ...slots.map(({mesh,item})=>[mesh,hotspots.querySelector('[data-dining-select="'+CSS.escape(item.id)+'"]')])].filter(([,button])=>button);
  const hit=ray.intersectObjects(targets.map(([mesh])=>mesh),true)[0];
  for(let node=hit?.object;node;node=node.parent){
   const pair=targets.find(([mesh])=>mesh===node);if(!pair)continue;
   if(!pair[1].contains(event.target)){event.stopImmediatePropagation();pair[1].click();}
   break;
  }
 },true);
 let yaw=0,pitch=0,drag,lastCamera,lastState,lastView;
 canvas.addEventListener('pointerdown',e=>{drag=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId);});
 canvas.addEventListener('pointermove',e=>{
  if(!drag||!currentView)return;
  yaw=T.MathUtils.clamp(yaw-(e.clientX-drag[0])*.005,-1.5,1.5);
  pitch=T.MathUtils.clamp(pitch-(e.clientY-drag[1])*.004,-.65,.65);
  drag=[e.clientX,e.clientY];update(lastState,lastView);
 });
 canvas.addEventListener('lostpointercapture',()=>drag=null);
 return (state,view)=>{
  if(lastCamera!==view.camera){yaw=0;pitch=0;}
  lastCamera=view.camera;lastState=state;lastView=view;update(state,view);
  return T.MathUtils.clamp(actor.position.clone().project(camera).x,-1,1);
 };
}
