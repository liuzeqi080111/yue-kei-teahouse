import {createReunionWall,savedPrint,portraitVersion} from './reunion-wall.js';
import {createReunionScene} from './reunion-scene.js';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {plantedStance,mouthPose,clearBoothCups} from './dining-room.js';

const v=(x,y,z)=>new T.Vector3(x,y,z);
const boothSeat=.605;
export async function createStoryScene(canvas,chapter){
 const renderer=new T.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true});
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=T.SRGBColorSpace;
 renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.13;
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(49,1,.025,110);
 scene.background=new T.Color(0xcbd2ce);
 const key=new T.DirectionalLight(0xffe3be,2.25);key.position.set(-3,7,5);
 scene.add(key,new T.HemisphereLight(0xfff0da,0xd8d5cf,1.8));
 const material=new Map(),cube=new T.BoxGeometry(1,1,1),cylinder=new T.CylinderGeometry(.5,.5,1,36);
 const sphere=new T.SphereGeometry(.5,28,16);
 function part(parent,geo,color,x,y,z,w,h,d){
  if(!material.has(color))material.set(color,new T.MeshStandardMaterial({color,roughness:.76}));
  const obj=new T.Mesh(geo,material.get(color));parent.add(obj);obj.position.set(x,y,z);obj.scale.set(w,h,d);return obj;
 }
 const box=(...args)=>part(args[0],cube,...args.slice(1));
 const cyl=(...args)=>part(args[0],cylinder,...args.slice(1));
 const group=(p=scene)=>{const g=new T.Group();p.add(g);return g};
 function texture(draw,w=768,h=256){
  const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);
  const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;return tex;
 }
 function print(parent,tex,x,y,z,w,h){
  const mesh=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({map:tex,side:T.DoubleSide}));mesh.position.set(x,y,z);parent.add(mesh);return mesh;
 }
 const loader=new GLTFLoader(),cast={};
 const ids=['friend','regular','fang','aming',...(chapter==='reunion'?['master','player']:['lin'])];
 const roleLibraries=chapter==='reunion'?{master:'lin',player:'ale',regular:'regular'}:{};
 const poses=await fetch('assets/story-poses.json').then(r=>r.json());
 await Promise.all(ids.map(async id=>{
  const library=roleLibraries[id];
  const actorLoader=library?new GLTFLoader().register(parser=>({
   name:'ReunionCast',beforeRoot(){
    const {asset,meshes}=parser.json,variant=asset.extras?.reunionMeshSet;
    if(variant?.role!==id)throw Error('Missing supper character '+id);
    for(const [base,index] of Object.entries(variant.meshes))Object.assign(meshes[base],meshes[index]);
   }
  })):loader;
  const file='assets/street/'+(library||id)+'-styled-v3.glb';
  const {scene:model,animations}=await actorLoader.loadAsync(library?file+'?portrait='+portraitVersion:file);
  model.name=id;
  const mixer=new T.AnimationMixer(model);if(animations.length){mixer.clipAction(plantedStance(animations[0])).play();mixer.setTime(0);}
  const bones={},rest={};
  model.traverse(o=>{if(o.isBone){const n=o.name.replace(/^mixamorig[:_]?/,'');bones[n]=o;rest[n]=o.quaternion.clone();}});
  model.scale.setScalar(({regular:1.69,friend:1.75,fang:1.62,aqing:1.67,aming:1.72,ale:1.73,ling:1.64,lin:1.66,master:1.64,player:1.79})[id]);scene.add(model);
  cast[id]={model,bones,rest,world:{},mouth:mouthPose(model,id)};
 }));
 function point(joint,child,at){
  if(!joint||!child)return;
  const base=joint.getWorldPosition(v()),dir=child.getWorldPosition(v()).sub(base).normalize(),aim=at.clone().sub(base).normalize();
  const p=joint.parent.getWorldQuaternion(new T.Quaternion());
  joint.quaternion.premultiply(p.clone().invert().multiply(new T.Quaternion().setFromUnitVectors(dir,aim)).multiply(p));
 }
 const bindRotation=new WeakMap();
 for(const a of Object.values(cast))for(const [name,bone] of Object.entries(a.bones))bindRotation.set(bone,a.rest[name]);
 function placeHand(bones,side,target,front,across,elbowDrop=0,palmDirection,fingerDirection){
  const shoulder=bones[side+'Arm'],elbow=bones[side+'ForeArm'],wrist=bones[side+'Hand'];
  const sign=side==='Left'?1:-1;
  if(palmDirection)for(const bone of [shoulder,elbow,wrist])bone.quaternion.copy(bindRotation.get(bone)??bone.quaternion);
  const origin=shoulder.getWorldPosition(v()),joint=elbow.getWorldPosition(v());
  const l1=origin.distanceTo(joint),l2=joint.distanceTo(wrist.getWorldPosition(v()));
  const axis=target.clone().sub(origin);
  const reach=angle=>Math.sqrt(l1*l1+l2*l2+2*l1*l2*Math.cos(angle*T.MathUtils.DEG2RAD));
  const d=T.MathUtils.clamp(axis.length(),palmDirection?reach(131):Math.abs(l1-l2)+.001,palmDirection?reach(12):l1+l2-.001);
  axis.normalize();const along=(l1*l1-l2*l2+d*d)/(2*d);
  const pole=across.clone().multiplyScalar(sign).addScaledVector(front,-1.8);
  pole.y-=elbowDrop;
  pole.addScaledVector(axis,-pole.dot(axis)).normalize();
  point(shoulder,elbow,origin.addScaledVector(axis,along).addScaledVector(pole,Math.sqrt(Math.max(0,l1*l1-along*along))));
  point(elbow,wrist,shoulder.getWorldPosition(v()).addScaledVector(axis,d));
  const fingers=fingerDirection??front.clone().multiplyScalar(.16).add(v(0,-.025,0));
  const fore=wrist.getWorldPosition(v()).sub(elbow.getWorldPosition(v())).normalize();
  if(palmDirection){
   fingers.normalize();
   const bend=fore.angleTo(fingers),limit=.54;
   if(bend>limit){
    const hinge=fore.clone().cross(fingers).normalize();
    fingers.copy(fore).applyAxisAngle(hinge,limit);
   }
   // Pronation belongs on the forearm, not as a large twist in the wrist.
   const k=name=>bones[side+'Hand'+name+'1'].getWorldPosition(v()).sub(wrist.getWorldPosition(v()));
   const normal=k('Index').cross(k('Pinky')).multiplyScalar(-sign);
   normal.addScaledVector(fore,-normal.dot(fore)).normalize();
   const desired=palmDirection.clone().addScaledVector(fore,-palmDirection.dot(fore)).normalize();
   const roll=Math.atan2(fore.dot(normal.clone().cross(desired)),normal.dot(desired));
   elbow.rotateOnAxis(fore.clone().applyQuaternion(elbow.getWorldQuaternion(new T.Quaternion()).invert()),T.MathUtils.clamp(roll,-1.42,1.42));
  }
  point(wrist,bones[side+'HandMiddle1'],wrist.getWorldPosition(v()).add(fingers));
  if(palmDirection){
   const base=wrist.getWorldPosition(v());
   const knuckle=name=>bones[side+'Hand'+name+'1'].getWorldPosition(v()).sub(base);
   const axis=knuckle('Middle').normalize();
   const normal=knuckle('Index').cross(knuckle('Pinky')).multiplyScalar(-sign);
   normal.addScaledVector(axis,-normal.dot(axis)).normalize();
   const desired=palmDirection.clone().addScaledVector(axis,-palmDirection.dot(axis)).normalize();
   const angle=Math.atan2(axis.dot(normal.clone().cross(desired)),normal.dot(desired));
   wrist.rotateOnAxis(axis.applyQuaternion(wrist.getWorldQuaternion(new T.Quaternion()).invert()),T.MathUtils.clamp(angle,-.27,.27));
  }
 }
 function actor(id,x,y,z,yaw,sit=false,rightHandTarget,leftHandTarget){
  const {model,bones,rest}=cast[id];model.visible=true;model.position.set(x,y,z);model.rotation.y=yaw;
  for(const [n,b] of Object.entries(bones))b.quaternion.copy(rest[n]);
  model.updateMatrixWorld(true);
  if(!sit){
   for(const side of ['Left','Right']){
    const sign=side==='Left'?1:-1;
    const direction=d=>v(...d).applyQuaternion(model.quaternion);
    const arm=bones[side+'Arm'],elbow=bones[side+'ForeArm'],hand=bones[side+'Hand'];
    point(arm,elbow,arm.getWorldPosition(v()).add(direction([sign*.18,-1,.035])));
    point(elbow,hand,elbow.getWorldPosition(v()).add(direction([sign*.035,-1,.075])));
   }
  }
  if(sit){
   for(const side of ['Left','Right']){
    const sign=side==='Left'?1:-1;
    const at=(joint,dx,dy,dz)=>joint.getWorldPosition(v()).add(v(dx,dy,dz).applyAxisAngle(v(0,1,0),yaw));
    const up=bones[side+'UpLeg'],knee=bones[side+'Leg'],foot=bones[side+'Foot'];
    point(up,knee,at(up,sign*.055,-.23,.55));point(knee,foot,at(knee,0,-.44,-.04));
   }
   // Match the actual skinned trouser underside to the top of the cushion.
   // Measure a patch on the upper thighs, excluding the knees, hands and coat hem.
   if(cast[id].supportOffset===undefined){
    model.updateMatrixWorld(true);
    const hip=bones.Hips.getWorldPosition(v()),forward=v(Math.sin(yaw),0,Math.cos(yaw)),right=v(Math.cos(yaw),0,-Math.sin(yaw));
    const heights=[],p=v();
    model.traverse(mesh=>{
     if(!mesh.isSkinnedMesh)return;
     const {position,skinIndex,skinWeight}=mesh.geometry.attributes;
     const support=mesh.skeleton.bones.map(b=>/(Hips|UpLeg)$/.test(b.name));
     for(let i=0;i<position.count;i++){
      let weight=0;for(let j=0;j<4;j++)if(support[skinIndex.getComponent(i,j)])weight+=skinWeight.getComponent(i,j);
      if(weight<.55)continue;
      mesh.localToWorld(mesh.getVertexPosition(i,p));const h=p.y;p.sub(hip);
      const depth=p.dot(forward);
      if(depth>.01&&depth<.20&&Math.abs(p.dot(right))<.20&&p.y<0)heights.push(h-model.position.y);
     }
    });
    if(heights.length<4)throw Error('Missing seated support patch for '+id);
    heights.sort((a,b)=>a-b);cast[id].supportOffset=heights[Math.floor(heights.length*.025)];
   }
   const seat=boothSeat;
   model.position.y=seat-.003-cast[id].supportOffset;
   model.updateMatrixWorld(true);
   for(const side of ['Left','Right']){
    const leg=bones[side+'Leg'],foot=bones[side+'Foot'],ankle=foot.getWorldPosition(v());
    ankle.y=.19+.095;
    point(leg,foot,ankle);
    const front=v(Math.sin(yaw),0,Math.cos(yaw)),across=v(Math.cos(yaw),0,-Math.sin(yaw));
    const sign=side==='Left'?1:-1;
    const restAt=bones.Hips.getWorldPosition(v()).addScaledVector(front,.19).addScaledVector(across,sign*.22);
    restAt.y=seat+.25;
    if(side==='Right'&&rightHandTarget)restAt.fromArray(rightHandTarget);
    if(side==='Left'&&leftHandTarget)restAt.fromArray(leftHandTarget);
    placeHand(bones,side,restAt,front,across);
   }
  }
  for(const [n,b] of Object.entries(bones)){
   cast[id].neutral[n]=b.quaternion.clone();
   if(['Head','LeftArm','RightArm','LeftForeArm','RightForeArm'].includes(n))cast[id].world[n]=b.getWorldQuaternion(new T.Quaternion());
  }
 }
 for(const entry of Object.values(cast))entry.neutral={};
 let serviceTake;
 let meal,carry,cups=[],cupTea,cupLemon,extraSticks,looseNews,newsFold;
 {
  const [districtFile,take]=await Promise.all([loader.loadAsync('assets/street/district.glb'),loader.loadAsync('assets/street/aming-service.glb')]);
  const district=districtFile.scene,rig=take.scene;scene.add(rig);rig.scale.setScalar(1.72);rig.position.set(2.21,.19,-2.42);
  const mixer=new T.AnimationMixer(rig),actions=[];
  for(const clip of take.animations){const a=mixer.clipAction(clip);a.setLoop(T.LoopOnce,1);a.clampWhenFinished=true;a.play();actions.push(a);}
  const saucer=rig.getObjectByName('ServiceSaucer');
  const vessel=[];
  rig.traverse(o=>{if(/^(Hot|Cold)/.test(o.name))vessel.push(o);});
  serviceTake={rig,mixer,actions,saucer,vessel,mouth:mouthPose(rig,'aming'),duration:Math.max(...take.animations.map(c=>c.duration))};
  rig.visible=false;
  clearBoothCups(district);
  district.position.set(8.8,0,15.72);district.rotation.y=-Math.PI/2;scene.add(district);
  // These two upholstered benches and their plinths share meshes with other
  // fittings. Adjust only the vertices belonging to the window booth.
  district.updateMatrixWorld(true);
  district.traverse(mesh=>{
   if(!mesh.isMesh||!mesh.parent.name.includes('Service_counter')||!['seat','wood'].includes(mesh.material.name))return;
   const pos=mesh.geometry.attributes.position,p=v();
   for(let i=0;i<pos.count;i++){
    mesh.localToWorld(p.fromBufferAttribute(pos,i));
    if(p.x<1.25||p.x>2.99||p.z< -2.14||p.z> -1.08)continue;
    p.y-=(.705-boothSeat)*T.MathUtils.clamp((p.y-.175)/(.705-.175),0,1);
    mesh.worldToLocal(p);pos.setXYZ(i,p.x,p.y,p.z);
   }
   pos.needsUpdate=true;mesh.geometry.computeVertexNormals();
  });
  const lamp=new T.PointLight(0xffddb0,8,6);lamp.position.set(1.4,2.6,-1.6);scene.add(lamp);
  function service(x,z){
   const g=group();g.position.set(x,.948,z);

    cyl(g,0xdfcba5,0,.003,0,.14,.009,.14);cyl(g,0xe9d9b9,0,.047,0,.087,.079,.087);cyl(g,0xb38554,0,.088,0,.078,.003,.078);
    part(g,new T.TorusGeometry(.022,.005,8,20),0xe4d4b1,.049,.054,0,1,1,1);

   return g;
  }
  function servedDrink(cold){
   const drink=saucer.clone(true);scene.add(drink);drink.scale.setScalar(1.72);
   drink.traverse(o=>{if(/^(Hot|Cold)/.test(o.name))o.visible=o.name.startsWith(cold?'Cold':'Hot');});
   return drink;
  }
  cupTea=servedDrink(false);cupLemon=servedDrink(true);cups=[service(1.94,-1.82),service(2.23,-1.87),service(1.89,-1.32)];
  meal=group();
  for(const z of [-1.39,-1.82]){
   cyl(meal,0x39625a,2.09,.957,z,.235,.014,.190);cyl(meal,0xeadbc0,2.09,.966,z,.213,.012,.171);
   part(meal,sphere,0xbb793c,2.086,.998,z,.126,.082,.094);box(meal,0xf1cc74,2.111,.98,z+.033,.076,.012,.046);
  }
  extraSticks=group();for(const offset of [0,.013])box(extraSticks,0x865530,1.89,.955,-1.44+offset,.192,.008,.008);
  carry=group();box(carry,0xcbae80,2.03,1.012,-1.50,.16,.12,.13);box(carry,0xe0c695,2.03,1.078,-1.50,.171,.013,.14);
  const news=texture((c,w,h)=>{
   c.fillStyle='#d9d0b7';c.fillRect(0,0,w,h);c.fillStyle='#393831';c.textAlign='center';c.font='bold 42px KaiTi';c.fillText('街 坊 日 報',w/2,51);
   for(let col=0;col<4;col++)for(let row=0;row<23;row++)c.fillRect(18+col*w/4,78+row*9,w/4-31,2);
  },512,320);
  looseNews=group();looseNews.position.set(1.97,.97,-1.51);looseNews.rotation.y=Math.PI/2;
  const leftPage=print(looseNews,news,-.095,0,0,.19,.25);leftPage.rotation.x=-Math.PI/2;
  newsFold=group(looseNews);
  const rightPage=print(newsFold,news,.095,0,0,.19,.25);rightPage.rotation.x=-Math.PI/2;
 }
 let mode='',view={},eye=v(),aim=v(),focus=v(),entered=0;
 function shot(pos,target,fov=49){
  eye.fromArray(pos);aim.fromArray(target);view.fov=fov;
 }
 function portraitArm(id,side,upperDirection,forearmDirection,fingers){
  const {bones,model}=cast[id],upper=bones[side+'Arm'],elbow=bones[side+'ForeArm'],hand=bones[side+'Hand'];
  const target=(bone,direction)=>v(...direction).applyQuaternion(model.quaternion).add(bone.getWorldPosition(v()));
  point(upper,elbow,target(upper,upperDirection));
  point(elbow,hand,target(elbow,forearmDirection));
  if(fingers)point(hand,bones[side+'HandMiddle1'],target(hand,fingers));
 }
 function portraitLean(id,tilt,turn){
  const {bones,neutral}=cast[id];
  // Tilt the upper body toward a neighbour, then turn the face back toward the lens.
  for(const [joint,axis,angle] of [[bones.Spine,v(0,0,1),tilt],[bones.Head,v(0,1,0),turn]]){
   const localAxis=axis.applyQuaternion(joint.parent.getWorldQuaternion(new T.Quaternion()).invert());
   joint.quaternion.premultiply(new T.Quaternion().setFromAxisAngle(localAxis,angle));
  }
  neutral.Head.copy(bones.Head.quaternion);
 }
 function castAtTable(id,state){
  const entry=id==='door'||id==='ask'||id==='morning',eating=['supper','invite','takeaway'].includes(id);
  if(entry&&id!=='morning'){
   actor('friend',.38,.18,-.51,.37);actor('aming',-.58,.18,-1.19,.24);actor('regular',1.61,.19,-1.81,1.55,true);
   shot([.24,1.58,.97],[-.18,1.43,-1.07],54);
   if(id==='ask')shot([2.57,1.70,-2.63],[1.61,1.38,-1.81],54);
  }else if(id==='farewell'){
   actor('friend',.65,.15,1.24,.35);
   shot([1.27,1.62,2.98],[.42,1.52,.96],55);
  }else{
   actor('regular',1.62,.19,-1.83,1.55,true);
   if(id==='seat')actor('friend',1.03,.19,-2.64,.68);
   else actor('friend',2.64,.19,-1.84,-1.57,true);
   if(['arrive','takeaway','invite','supper','morning'].includes(id)){
    const joins=id==='invite'||id==='morning'||(id==='supper'&&state.invited);
    if(id!=='supper'||joins)actor('fang',joins?1.61:1.06,.19,joins?-1.22:-2.47,joins?1.53:.57,joins);
   }
   if(['seat','tea','lemon'].includes(id))actor('lin',1.62,.19,-1.22,1.54,true);
   if(id==='arrive')actor('lin',1.71,.19,-2.62,-.35);
   if(['morning','supper'].includes(id))actor('aming',2.21,.19,-2.42,.02);
   shot([2.22,1.59,-.39],[1.82,1.24,-1.79],60);
   if(id==='seat')shot([2.57,1.70,-2.63],[1.48,1.40,-1.90],60);
   if(id==='supper')shot([2.55,1.49,-1.49],[1.62,1.30,-1.83],50);
   if(id==='arrive')shot([1.34,1.59,-1.43],[1.42,1.46,-2.51],47);
   if(id==='invite')shot([2.30,1.48,-.83],[1.63,1.30,-1.24],48);
   if(id==='takeaway')shot([1.49,1.61,-1.18],[1.06,1.55,-2.47],44);
   if(id==='tea'||id==='lemon')shot([2.05,1.64,-1.17],[2.12,1.12,-2.13],54);
   if(id==='morning')shot([2.16,1.64,-.17],[1.42,1.35,-1.92],53);
  }
  looseNews.position.set(1.97,.958,-1.51);looseNews.rotation.set(0,Math.PI/2,0);newsFold.rotation.z=0;
  cupTea.position.set(2.21-.070*1.72,.9425,-2.42+.173*1.72);cupLemon.position.copy(cupTea.position);
  const serving=id==='tea'||id==='lemon';
  serviceTake.rig.visible=serving;
  if(serving){
   for(const act of serviceTake.actions)act.reset().play();
   serviceTake.mixer.setTime(0);
   for(const o of serviceTake.vessel)o.visible=o.name.startsWith(id==='tea'?'Hot':'Cold');
  }
  const ordered=!serving&&Boolean(state.drink)&&(!entry||id==='morning');
  cupTea.visible=ordered&&state.drink==='tea';cupLemon.visible=ordered&&state.drink==='lemon';
  cups[0].visible=true;cups[1].visible=ordered;cups[2].visible=Boolean((eating&&state.invited)||id==='morning');
  looseNews.visible=true;if(!['ask','door','seat'].includes(id)){looseNews.position.set(1.77,.96,-1.84);newsFold.rotation.z=Math.PI-.025;}extraSticks.visible=cups[2].visible;
  meal.visible=eating;carry.visible=eating&&!state.invited&&id!=='invite';
 }
 if(chapter==='table')createReunionWall(scene)(savedPrint());
 const reunion=chapter==='reunion' ? createReunionScene({scene,camera,cast,group,box,cyl,part,sphere,print,texture,actor,placeHand,shot,portraitLean,portraitArm}) : null;
 function set(id,state){
  mode=id;
  canvas.classList.toggle('framing',id==='proof');
  for(const a of Object.values(cast))a.model.visible=false;
  if(reunion){
   for(const prop of [meal,carry,...cups,cupTea,cupLemon,extraSticks,looseNews])prop.visible=false;
   reunion.stage(id,state);
  }else castAtTable(id,state);
  entered=performance.now();
 }
 function resize(){
  const w=canvas.clientWidth,h=canvas.clientHeight,p=renderer.getPixelRatio();
  if(canvas.width!==Math.floor(w*p)||canvas.height!==Math.floor(h*p))renderer.setSize(w,h,false);
  camera.aspect=w/h;
 }
 function render(){
  resize();
  camera.position.copy(eye);focus.copy(aim);
  if(mode==='tea'||mode==='lemon'){
   const t=(performance.now()-entered)/1000;
   focus.y+=.20*(1-T.MathUtils.smoothstep(t,.30,1.25))+.08*T.MathUtils.smoothstep(t,2.85,3.55);
  }
  if(camera.aspect<.8&&chapter==='table'&&mode==='morning'){
   camera.position.set(2.16,1.66,-.47);focus.set(1.96,1.32,-1.95);
  }
  const base=camera.aspect<.8&&chapter==='table'&&['seat','supper','morning'].includes(mode)?Math.max(view.fov,69):view.fov;
  camera.fov=camera.aspect<1?T.MathUtils.radToDeg(2*Math.atan(Math.tan(T.MathUtils.degToRad(base)/2)/camera.aspect)):base;
  if(camera.aspect<.8&&['takeaway','invite','tea','lemon'].includes(mode))camera.fov=64;
  camera.updateProjectionMatrix();camera.lookAt(focus);renderer.render(scene,camera);
 }
 // Render both portraits at a fixed print aspect, independent of phone orientation.
 function photograph(pose,state){
  set(pose,state);
  const pixelRatio=renderer.getPixelRatio();
  renderer.setPixelRatio(1);renderer.setSize(840,560,false);
  camera.aspect=1.5;camera.fov=view.fov;camera.position.copy(eye);camera.lookAt(aim);camera.updateProjectionMatrix();
  renderer.render(scene,camera);
  const photo=canvas.toDataURL('image/jpeg',.87);
  renderer.setPixelRatio(pixelRatio);resize();
  return photo;
 }
 let level=0,speechShape,speaker=null;
 const q=new T.Quaternion(),nextQ=new T.Quaternion(),parentQ=new T.Quaternion(),yawQ=new T.Quaternion();
 const perform={seat:'regular',door:'friend'};
 function gesture(id,a,phase){
  const frames=poses[id];
  const index=Math.max(1,frames.findIndex(frame=>frame[0]>=phase));
  const [start,left]=frames[index-1],[end,right]=frames[index];
  a.model.getWorldQuaternion(yawQ);
  for(const joint of ['Head','LeftArm','RightArm','LeftForeArm','RightForeArm']){
   const b=a.bones[joint];if(!b||!left[joint])continue;
   q.fromArray(left[joint]).slerp(nextQ.fromArray(right[joint]),(phase-start)/(end-start));
   q.premultiply(yawQ).multiply(nextQ.copy(yawQ).invert()).multiply(a.world[joint]);
   b.parent.getWorldQuaternion(parentQ);b.quaternion.copy(parentQ.invert().multiply(q));
  }
 }
 function newspaper(a,time){
  const t=T.MathUtils.clamp((time-entered)/3600,0,1);
  const fold=T.MathUtils.smoothstep(t,.22,.66),reach=T.MathUtils.smoothstep(t,0,.20)*(1-T.MathUtils.smoothstep(t,.76,1));
  looseNews.position.set(T.MathUtils.lerp(1.97,1.77,fold),.97+.06*Math.sin(Math.PI*fold),T.MathUtils.lerp(-1.51,-1.84,fold));
  newsFold.rotation.z=(Math.PI-.025)*fold;
  for(const side of ['Left','Right']){
   const b=a.bones,arm=b[side+'Arm'],elbow=b[side+'ForeArm'],hand=b[side+'Hand'],middle=b[side+'HandMiddle1'];
   for(const name of [side+'Arm',side+'ForeArm',side+'Hand'])b[name].quaternion.copy(a.neutral[name]);
   const edge=v(side==='Right'?-.13:.13*Math.cos(Math.PI*fold),.028+(side==='Left'?.13*Math.sin(Math.PI*fold):0),0);
   const goal=looseNews.localToWorld(edge);
   const wristOrientation=hand.getWorldQuaternion(new T.Quaternion());
   const offset=middle.getWorldPosition(v()).sub(hand.getWorldPosition(v()));
   const target=hand.getWorldPosition(v()).lerp(goal.sub(offset),reach);
   const origin=arm.getWorldPosition(v()),joint=elbow.getWorldPosition(v());
   const l1=origin.distanceTo(joint),l2=joint.distanceTo(hand.getWorldPosition(v()));
   const axis=target.clone().sub(origin),d=T.MathUtils.clamp(axis.length(),Math.abs(l1-l2)+.001,l1+l2-.001);axis.normalize();
   const along=(l1*l1-l2*l2+d*d)/(2*d);
   const pole=v(0,-1,side==='Left'?-1:1);pole.addScaledVector(axis,-pole.dot(axis)).normalize();
   point(arm,elbow,origin.clone().addScaledVector(axis,along).addScaledVector(pole,Math.sqrt(Math.max(0,l1*l1-along*along))));
   point(elbow,hand,target);
   hand.quaternion.copy(hand.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(wristOrientation));
  }
 }
 function speech(id,value,shape){speaker=id;level=value;speechShape=shape;}
 function tick(time,singing){
  if(mode==='gather'){
   const level=singing?.voice??0;
   speech('master',level,[level*.80,level*.18,level*.20,level*.14]);
  }
  if(serviceTake?.rig.visible){
   serviceTake.mixer.setTime(Math.min(serviceTake.duration,(time-entered)/1000));
   serviceTake.mouth(speaker==='aming'?level:0,speechShape);
  }
  for(const [id,a] of Object.entries(cast)){
   if(!a.model.visible)continue;
   a.mouth(id===speaker?level:0,speechShape);
   const head=a.bones.Head;if(!head||!a.neutral.Head)continue;
   if(id==='regular'&&mode==='seat'){newspaper(a,time);continue;}
   if(perform[mode]===id&&id!=='regular'){
    const phase=T.MathUtils.clamp((time-entered)/2600,0,1);
    gesture(id,a,phase);
    continue;
   }
   head.quaternion.copy(a.neutral.Head);
   const targetTalk=id===speaker&&level>.03;
   const sw=targetTalk?.023*Math.sin(time*.006):.009*Math.sin(time*.001+id.length);
   head.rotateY(sw);
  }
  reunion?.tick(time,entered,mode,singing);
 }
 const pointer=new T.Raycaster();
 function hit(x,y){
  const rect=canvas.getBoundingClientRect();
  pointer.setFromCamera(new T.Vector2(2*(x-rect.left)/rect.width-1,1-2*(y-rect.top)/rect.height),camera);
  return reunion?.hit(pointer,mode);
 }
 return {set,render,tick,speech,photograph,strike:onContact=>reunion?.strike(onContact),hit};
}
