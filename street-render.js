import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

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
  piece.position.z+=.27;
  rack.add(piece);
 });
 scene.add(rack);
 function placeRack({x,z,length,visible}){
  rack.position.set(x,0,z);rack.rotation.y=Math.PI/2;
  rack.scale.set(length/3.8,.82,.82);rack.visible=visible;refreshShadows();
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
