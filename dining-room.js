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
 for(let i=1;i<points.length;i++){
  const at=([x,z])=>new T.Vector3(x,.17,z);
  route.add(new T.LineCurve3(at(points[i-1]),at(points[i])));
 }
 return route;
}
const serviceRoute=aisle([[.53,-4.45],[.55,-3.48],[.54,-2.64],[2.06,-2.64]]);
const leadRoute=aisle([[.34,-1.12],[.54,-2.64],[2.06,-2.64]]);
const seatingRoute=aisle([[.18,.27],[.26,-.61],[.54,-2.64],[2.72,-2.64],[2.73,-1.55]]);

export function furnishKitchen(scene){
 const box=(color,x,y,z,w,h,d)=>part(scene,cube,color,x,y,z,w,h,d);
 const steel=0xa4ada5, enamel=0xe8debe, tile=0x2e6456;
 // Reuse the shell's rear counters. The serving hatch opens to the bakery;
 // its right-hand end leaves the central aisle open into the kitchen.
 box(tile,-1.90,.68,-3.13,3.15,1.02,.12);
 box(steel,-1.90,1.21,-3.13,3.28,.065,.32);
 box(enamel,-1.90,2.56,-3.13,3.15,.38,.12);
 for(const x of [-3.41,-.39])box(tile,x,1.78,-3.13,.10,1.18,.12);
 box(steel,-1.88,2.34,-3.98,1.74,.25,.71);
 box(steel,-1.88,2.84,-4.18,.40,.79,.32);
 // The range sits over the existing rear counter in the same bay as the hood.
 box(steel,-1.88,1.19,-3.92,1.63,.09,.66);
 for(const x of [-2.31,-1.48]){
  const dial=part(scene,disc,0x343c35,x,1.18,-3.575,.059,.024,.059);
  dial.rotation.x=Math.PI/2;
  part(scene,disc,0x292b26,x,1.25,-3.92,.33,.045,.33);
  part(scene,cup,0x565e58,x,1.36,-3.92,.31,.18,.31);
  box(0x383936,x+.19,1.4,-3.92,.14,.034,.045);
 }
 box(steel,-.77,1.85,-4.71,.85,.045,.27);
 for(let i=0;i<6;i++)part(scene,disc,enamel,-.74,1.89+i*.021,-4.71,.22,.02,.22);
 const board=document.createElement('canvas');board.width=384;board.height=96;
 const ctx=board.getContext('2d');ctx.fillStyle='#18483e';ctx.fillRect(0,0,384,96);
 ctx.fillStyle='#efe4c4';ctx.font='bold 52px serif';ctx.textAlign='center';ctx.fillText('廚 房 出 餐',192,65);
 const map=new T.CanvasTexture(board);map.colorSpace=T.SRGBColorSpace;
 const sign=new T.Mesh(new T.PlaneGeometry(1.12,.28),new T.MeshBasicMaterial({map}));
 sign.position.set(-1.58,2.54,-3.064);scene.add(sign);
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
 furnishKitchen(scene);
 const sky=new T.HemisphereLight(0xffeed4,0xab9680,1.75);
 const sun=new T.DirectionalLight(0xffdfaf,2.1);
 sun.position.set(2,7,4);scene.add(sun,sky);
 const warm=new T.PointLight(0xffddac,10,8);warm.position.set(1.6,2.65,-1.5);scene.add(warm);
 const actor=ming.scene;actor.scale.setScalar(1.72);scene.add(actor);
 const mixer=new T.AnimationMixer(actor);
 if(ming.animations.length)mixer.clipAction(ming.animations[0]).play();
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
  const restingYaw=arrive>0 ? .5 : -1.7;
  actor.rotation.y=walking ? Math.atan2(heading.x,heading.z)+(pose==='depart'?Math.PI:0) : restingYaw;
  for(const {bone,base} of poseBones)bone.quaternion.copy(base);
  mixer.setTime(['approach','depart'].includes(pose)?progress*1.5:.21);
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
   leadRoute.getPoint(Math.min(1,t*1.24),actor.position);
   focus.copy(actor.position);focus.y=1.55;
   const direction=leadRoute.getTangent(Math.min(.999,t*1.24));
   actor.rotation.y=t>0&&t<.80?Math.atan2(direction.x,direction.z):t===0?.13:.5;
  }
  camera.position.copy(eye);camera.lookAt(focus);camera.rotateY(yaw);camera.rotateX(pitch);camera.updateMatrixWorld();
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
