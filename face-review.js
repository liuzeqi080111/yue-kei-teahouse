import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {mouthPose} from './dining-room.js';
import {followSpeech} from './voice-clips.js';
import {STREET_CLIPS,ROLE_CLIPS} from './fp1-clips.js';
import {SHOPS} from './street-space.js';

const cast={
 aming:['阿明','story-table-tea'],aqing:['阿晴','fp1-line-meeting'],
 fang:['方姐','street-line-fang-12'],regular:['周叔','story-photo-bench'],
 friend:['同行朋友','fp1-line-home'],ale:['阿乐','street-line-3852e2eb415a04'],
 buyer:['等碟的街坊','street-line-a176526070a34a'],ling:['玲姐','street-line-ling-18'],
 lin:['林伯','street-line-lam-15'],vendor:['蔗水摊主','street-line-b7d05e6879dc36'],
};
const rows=Object.entries(cast).map(([id,[name,clip]])=>[id,name,id+'-styled-v3','assets/'+clip+'.wav']);
for(const [id,shop] of Object.entries(SHOPS)){
 if(id!=='juiceCart') rows.push([id,shop.name,'shopkeepers/'+id,ROLE_CLIPS[id+'|'+shop.line]??STREET_CLIPS[shop.line]]);
}
const get=selector=>document.querySelector(selector);
const select=get('#actor'),canvas=get('canvas'),audio=get('audio'),status=get('#status');
const renderer=new T.WebGLRenderer({canvas,antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.toneMapping=T.ACESFilmicToneMapping;
const scene=new T.Scene();scene.background=new T.Color(0x66665e);
const light=new T.DirectionalLight(0xffdfbf,2.0);light.position.set(2,4,5);
scene.add(light,new T.HemisphereLight(0xf7eee1,0xb0a397,1.65));
const camera=new T.OrthographicCamera();camera.near=.01;camera.far=10;
const focus=new T.Vector3(),loader=new GLTFLoader();
let model,applyPose,blob,file,stop,turn=0,objectUrl,frame;
function draw(){
 if(frame)return;
 frame=requestAnimationFrame(()=>{
  frame=0;
  const w=canvas.clientWidth,h=canvas.clientHeight,half=.116,a=Number(get('#angle').value);
  renderer.setSize(w,h,false);camera.left=-half*w/h;camera.right=-camera.left;
  camera.top=half;camera.bottom=-half;camera.updateProjectionMatrix();
  camera.position.set(focus.x+Math.sin(a),focus.y+.006,focus.z+Math.cos(a));
  camera.lookAt(focus);renderer.render(scene,camera);
 });
}
const buttons=[];
function mark(shape){for(const [key,button] of buttons)button.setAttribute('aria-pressed',String(key===shape));}
function dispose(root){
 const textures=new Set();
 root.traverse(o=>{if(!o.isMesh)return;
  o.geometry.dispose();o.skeleton?.dispose();
  for(const m of [].concat(o.material)){for(const v of Object.values(m))if(v?.isTexture)textures.add(v);m.dispose();}
 });
 for(const t of textures)t.dispose();
}
async function load(){
 const generation=++turn;
 audio.pause();stop?.();stop=null;audio.removeAttribute('src');audio.load();
 if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl=null;}
 if(model){scene.remove(model);dispose(model);model=null;}
 blob=null;applyPose=null;mark('X');status.textContent='正在载入人物…';get('#play').disabled=true;
 const [id,,path,clip]=rows.find(row=>row[0]===select.value);
 history.replaceState(null,'','#'+id);
 try{
  const [gltf,recording]=await Promise.all([loader.loadAsync('assets/street/'+path+'.glb'),fetch(clip).then(r=>{if(!r.ok)throw Error('录音');return r.blob();})]);
  if(generation!==turn){dispose(gltf.scene);return;}
  model=gltf.scene;scene.add(model);
  if(gltf.animations.length){const mixer=new T.AnimationMixer(model);mixer.clipAction(gltf.animations[0]).play();mixer.setTime(0);}
  model.updateMatrixWorld(true);
  let face;
  model.traverse(o=>{if(o.morphTargetDictionary?.jawOpen!==undefined && o.material?.name?.includes('Oral tissue'))face=o;});
  if(!face)throw Error('面部网格');
  const bounds=new T.Box3(),point=new T.Vector3();
  for(let i=0;i<face.geometry.attributes.position.count;i+=4)bounds.expandByPoint(face.localToWorld(face.getVertexPosition(i,point)));
  bounds.getCenter(focus);focus.y+=.025;
  applyPose=mouthPose(model);file=clip;blob=recording;objectUrl=URL.createObjectURL(blob);
  audio.src=objectUrl;get('#play').disabled=false;status.textContent='';draw();
 }catch(error){if(generation===turn)status.textContent='无法打开人物或录音。'+error.message;}
}
for(const [id,name] of rows)select.add(new Option(name,id));
for(const [key,label] of Object.entries({X:'静止',A:'双唇闭合',D:'张口',F:'圆唇',B:'展唇',G:'唇齿音',H:'抬舌'})){
 const button=document.createElement('button');button.textContent=label;
 button.onclick=()=>{audio.pause();stop?.();stop=null;applyPose?.(1,key);mark(key);draw();};
 get('#poses').append(button);buttons.push([key,button]);
}
audio.onplay=()=>{stop?.();mark(null);stop=followSpeech(audio,blob,(v,p)=>{applyPose?.(v,p);draw();},file);};
audio.onpause=audio.onended=()=>{if(stop){stop();stop=null;mark('X');draw();}};
get('#play').onclick=()=>{audio.currentTime=0;audio.play().catch(()=>{status.textContent='请用播放器重试。';});};
get('#angle').onchange=draw;select.onchange=load;new ResizeObserver(draw).observe(canvas);
if(rows.some(row=>row[0]===location.hash.slice(1)))select.value=location.hash.slice(1);
load();
