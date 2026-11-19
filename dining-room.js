import * as T from 'three';
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
const leadRoute=aisle([[.34,-1.12],[.54,-2.64],[2.06,-2.64]]);
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
}

export async function createDiningRoom(canvas) {
 const loader=new GLTFLoader();
 const [district,ming]=await Promise.all(['district','aming-styled-v3'].map(name=>loader.loadAsync('./assets/street/'+name+'.glb')));
 const renderer=new T.WebGLRenderer({canvas,antialias:true});
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
 renderer.toneMapping=T.ACESFilmicToneMapping;
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(67,1,.025,140);
 scene.background=new T.Color(0xc6d8dd);
 // Work in the shop's modelling coordinates. The district, including the window view,
 // stays registered to the existing booth and counter.
 district.scene.rotation.y=-Math.PI/2;
 district.scene.position.set(8.8,0,15.72);
 // Clear the two decorative cup sets baked into this booth only. The neighboring
 // tables keep their original crockery. Indices here are shop-local GLB vertices.
 district.scene.traverse(node=>{
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
 scene.add(district.scene);
 furnishKitchen(scene,district.scene);
 const sky=new T.HemisphereLight(0xffeed4,0xab9680,1.75);
 const sun=new T.DirectionalLight(0xffdfaf,2.1);
 sun.position.set(2,7,4);scene.add(sun,sky);
 const warm=new T.PointLight(0xffddac,10,8);warm.position.set(1.6,2.65,-1.5);scene.add(warm);
 const actor=ming.scene;actor.scale.setScalar(1.72);scene.add(actor);
 const mixer=new T.AnimationMixer(actor);
 const stride=ming.animations[0];
 let walkAction,idleAction;
 if(stride){
  walkAction=mixer.clipAction(stride).play();
  // Sample each leg in its planted phase. Freezing a single walking frame
  // leaves the back foot in the air while the waiter stands at the stove.
  const planted=stride.tracks.map(track=>{
   const phase=/Right(UpLeg|Leg|Foot|Toe)/i.test(track.name) ? 0.60 : 0;
   const value=track.createInterpolant().evaluate(phase);
   return new track.constructor(track.name,[0],value);
  });
  idleAction=mixer.clipAction(new T.AnimationClip('Standing',1,planted)).play();
 }
 const bones={};actor.traverse(o=>{if(o.isBone)bones[o.name.replace(/^mixamorig[:_]?/i,'')]=o;});
 // Undo the previous procedural offsets before sampling animation. Mixers
 // can skip writing unchanged tracks on repeated renders of the same time.
 const poseBones=[bones.Head,bones.LeftForeArm,bones.RightForeArm].filter(Boolean)
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
 const water=part(scene,cup,0xb1d3cc,1.79,tableY+.057,-1.16,.076,.113,.076);
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
  const walkRoute=view.camera==='walk'?leadRoute:serviceRoute;
  const walkProgress=view.camera==='walk'?Math.min(1,progress*1.24):progress;
  const strideWeight=walking?T.MathUtils.smoothstep(walkProgress,0,.07)*(1-T.MathUtils.smoothstep(walkProgress,.92,1)):0;
  walkAction?.setEffectiveWeight(strideWeight);
  idleAction?.setEffectiveWeight(1-strideWeight);
  mixer.setTime(walkProgress*walkRoute.getLength()/1.05);
  for(const {bone,base} of poseBones)base.copy(bone.quaternion);
  const writing=pose==='talk'&&['order-review','food'].includes(beat.kind);
  if(bones.Head)bones.Head.rotateX(pose==='place'||writing?.23:.035);
  if(writing&&bones.LeftForeArm)bones.LeftForeArm.rotateX(-.55);
  docket.visible=!!(writing&&hand);
  if(docket.visible){hand.getWorldPosition(docket.position);docket.rotation.y=actor.rotation.y;}
  if(pose==='place'&&bones.RightForeArm)bones.RightForeArm.rotateX(-.78*Math.sin(progress*Math.PI));
  eye.set(2.73,1.48,-1.55);focus.set(1.89,1.28,-2.51);
  if(['table','menu','bill'].includes(view.camera)){
   focus.set(2.08,.94,-1.59);
   if(camera.aspect<1){eye.y+=.36;eye.x+=.12;}
  }
  if(view.camera==='window')focus.set(1.85,1.52,1.9);
  if(view.camera==='cashier')focus.set(-2,1.35,-2.8);
  if(['walk','entrance'].includes(view.camera)){
   const t=view.camera==='walk'?progress:0;
   seatingRoute.getPoint(t,eye);eye.y=1.78-.30*T.MathUtils.smoothstep(t,.82,1);
   const leadProgress=Math.min(1,t*1.24);
   leadRoute.getPoint(leadProgress,actor.position);
   focus.copy(actor.position);focus.y=1.55;
   const direction=leadRoute.getTangent(Math.min(.999,leadProgress));
   const leadYaw=blendYaw(.13,Math.atan2(direction.x,direction.z),T.MathUtils.smootherstep(leadProgress,0,.14));
   actor.rotation.y=blendYaw(leadYaw,tableYaw,T.MathUtils.smootherstep(leadProgress,.86,1));
  }
  camera.position.copy(eye);
  const dx=focus.x-eye.x,dy=focus.y-eye.y,dz=focus.z-eye.z;
  const elevation=Math.atan2(dy,Math.hypot(dx,dz));
  camera.rotation.set(T.MathUtils.clamp(elevation+pitch,-1.43,1.32),Math.atan2(-dx,-dz)+yaw,0,'YXZ');
  camera.updateMatrixWorld();
  sky.intensity=view.weather==='rain'?1.16:1.75;
  water.visible=!!view.water;sticks.forEach(stick=>stick.visible=!!view.utensils);
  const items=state.items.filter(i=>i.status==='served'||(pose==='place'&&beat.orderItemId===i.id)).slice(view.tablePage*6,view.tablePage*6+6);
  const key=JSON.stringify(items.map(i=>[i.id,i.itemId,i.options,view.diningPortions.get(i.id)??3]));
  if(key!==orderKey){
   orderKey=key;plates.traverse(o=>{if(o.geometry?.type==='TorusGeometry')o.geometry.dispose();});plates.clear();
   slots=items.map((item,i)=>{
    const mesh=dish(item,view.diningPortions.get(item.id)??3);
    const x=1.90+Math.floor(i/3)*.35,z=-1.40-i%3*.27;
    const shadeMesh=new T.Mesh(shadowPlane,contact);shadeMesh.rotation.x=-Math.PI/2;shadeMesh.position.set(x,tableY-.001,z);
    mesh.position.set(x,tableY,z);plates.add(shadeMesh,mesh);return {item,mesh,x,z};
   });
  }
  for(const {item,mesh,x,z} of slots){
   const lift=pose==='place'&&beat.orderItemId===item.id?1-progress:0;
   mesh.position.set(x,tableY+.29*lift,z-.52*lift);
  }
  renderer.render(scene,camera);
  positionButtons();
 }
 function pin(el,point,w,h){
  if(!el)return;
  const p=point.clone().project(camera);
  Object.assign(el.style,{left:((p.x+1)*canvas.clientWidth/2-w/2+canvas.offsetLeft)+'px',top:((1-p.y)*canvas.clientHeight/2-h/2+canvas.offsetTop)+'px',width:w+'px',height:h+'px',transform:'none',visibility:p.z>1||p.z< -1?'hidden':''});
 }
 function positionButtons(){
  pin(document.querySelector('.table-menu-hotspot'),menu.position,68,46);
  for(const {item,mesh} of slots)pin(document.querySelector('[data-dining-select="'+CSS.escape(item.id)+'"].dining-food-spot'),mesh.position,52,46);
 }
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
