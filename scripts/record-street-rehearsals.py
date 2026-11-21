"""Record current street rigs, props and contact poses, including a shared-coat exchange."""
from pathlib import Path
import json,subprocess,wave,sys
import imageio_ffmpeg
from playwright.sync_api import sync_playwright

root=Path(__file__).resolve().parents[1]
out=root/'output/strict-review/films'
out.mkdir(parents=True,exist_ok=True)
films={'aqing':'street-line-65c5964a033fdf','fang':'street-line-fang-12','friend':'fp1-line-home'}
if '--actor' in sys.argv:
 selected=sys.argv[sys.argv.index('--actor')+1]
 films={selected:films[selected]}
markup='''<style>body{margin:0}canvas{width:100vw;height:100vh;display:block}</style><canvas></canvas>
<script type="importmap">{"imports":{"three":"./assets/street/three/build/three.module.min.js","three/addons/":"./assets/street/three/examples/jsm/"}}</script>
<script type="module">
import * as T from 'three';import {loadStreet} from './street-render.js';import {NPC_SPEECH_CUES} from './npc-voice-manifest.js';
window.street=await loadStreet(document.querySelector('canvas'));
const v=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),q=()=>new T.Quaternion();
window.drawSingle=({id,frame,voice})=>{
 const model=street.actors.get(id).model,point={x:model.position.x,z:model.position.z};
 street.animateWork(point,id==='aqing'?id:null,10000+frame*1000/24);
 const cue=NPC_SPEECH_CUES[voice+'.wav'],time=frame/24;let index=0;
 if(cue){while(index+1<cue[0].length&&cue[0][index+1]<=time*100)index++;street.speak(id,index<cue[1].length?.65:0,cue[1][index]||'X');}
 const angle=model.rotation.y+.12,d=1.8,x=model.position.x+Math.sin(angle)*d,z=model.position.z+Math.cos(angle)*d;
 street.render({x,y:1.46,z,heading:Math.atan2(model.position.x-x,z-model.position.z),pitch:-.12});
};
const smooth=(time,a,b)=>T.MathUtils.smoothstep(time,a,b);
function basis(a,b){a.normalize();b.addScaledVector(a,-b.dot(a)).normalize();return q().setFromRotationMatrix(new T.Matrix4().makeBasis(a,b,a.clone().cross(b)));}
function hold(job,side,target,amount){
 const b=job.bones,wrist=b[side+'Hand'],knuckle=b[side+'HandMiddle1'];
 const neutral=wrist.getWorldQuaternion(q());
 const along=knuckle.getWorldPosition(v()).sub(wrist.getWorldPosition(v()));
 const across=b[side+'HandIndex1'].getWorldPosition(v()).sub(b[side+'HandPinky1'].getWorldPosition(v()));
 const desired=neutral.clone().slerp(basis(v(0,-.72,.69),v(side==='Left'?-1:1,0,0)).multiply(basis(along,across).invert()).multiply(neutral),amount);
 const goal=knuckle.getWorldPosition(v()).lerp(target,amount);
 for(let iteration=0;iteration<4;iteration++){
  wrist.quaternion.copy(wrist.parent.getWorldQuaternion(q()).invert().multiply(desired));
  rig.reach(job,side,goal,1);
 }
 wrist.quaternion.copy(wrist.parent.getWorldQuaternion(q()).invert().multiply(desired));
 if(amount>.01){
  for(const digit of ['Index','Middle','Ring','Pinky'])for(let n=1;n<=3;n++){
   const joint=b[side+'Hand'+digit+n],child=b[side+'Hand'+digit+(n+1)];
   const original=joint.quaternion.clone();rig.aim(joint,child,joint.getWorldPosition(v()).add(v(0,-1,.015)));
   joint.quaternion.copy(original.slerp(joint.quaternion,amount));
  }
  rig.placeFingertip(job,side,'Thumb',goal.clone().add(v(side==='Left'?-.045:.045,.008,-.055)));
 }
}
window.prepareExchange=()=>{
 const allowed=new Set(['fang','aqing'].map(id=>street.actors.get(id).model));
 for(const child of reviewScene.children)if(!child.isLight&&!allowed.has(child))child.visible=false;
 reviewScene.background=new T.Color(0x71695d);reviewScene.fog=null;
 const floor=new T.Mesh(new T.PlaneGeometry(6,6),new T.MeshStandardMaterial({color:0x71695d,roughness:1}));
 floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;reviewScene.add(floor);
 window.pair=['fang','aqing'].map((id,i)=>{
  const job=rig.jobs.find(j=>j.id===id);job.model.position.set(i?.42:-.42,0,0);job.model.rotation.y=0;job.model.visible=true;
  job.left.visible=job.right.visible=false;return job;
 });
 window.sharedCoat=pair[1].left.children[0];sharedCoat.position.set(0,0,0);sharedCoat.rotation.set(0,0,0);
 reviewScene.attach(sharedCoat);sharedCoat.scale.setScalar(1);sharedCoat.visible=true;
};
window.drawExchange=({frame,close=false})=>{
 const t=frame/24,accept=smooth(t,.45,1.45),release=smooth(t,1.9,2.85),move=smooth(t,1.55,3.3);
 const contacts=[];
 sharedCoat.position.set(T.MathUtils.lerp(-.08,.08,move),1.15+.025*move,.27);
 sharedCoat.quaternion.identity();
 for(const [i,job] of pair.entries()){
  for(const [bone,rotation] of job.base)bone.quaternion.copy(rotation);
  job.model.updateMatrixWorld(true);
  const side=i?'Right':'Left',amount=i?accept:1-release;
  const target=sharedCoat.position.clone().add(v(i?.145:-.145,-.005,.046));
  hold(job,side,target,amount);
  if(amount>.999)contacts.push(job.bones[side+'HandMiddle1'].getWorldPosition(v()).distanceTo(target));
  // The free arm rests outside the apron instead of retaining a walking pose.
  const free=i?'Left':'Right',arm=job.bones[free+'Arm'],elbow=job.bones[free+'ForeArm'],hand=job.bones[free+'Hand'];
  rig.aim(arm,elbow,arm.getWorldPosition(v()).add(v(i?.16:-.16,-1,.04)));
  rig.aim(elbow,hand,elbow.getWorldPosition(v()).add(v(0,-1,.08)));
  job.bones.Head.rotateY(i?-.13:.13);job.bones.Head.rotateX(.10*accept);
 }
 street.refreshShadows();street.render({x:close?.32:0,y:close?1.11:1.35,z:close?1.50:2.80,heading:close?Math.atan2(-.32,1.23):0,pitch:close?-.04:-.07});
 return contacts;
};
window.ready=true;
</script>'''

with sync_playwright() as p:
 browser=p.chromium.launch(channel='msedge',headless=True,args=['--enable-unsafe-swiftshader'])
 page=browser.new_page(viewport={'width':960,'height':720})
 page.route('**/street-fixtures.js',lambda route:route.fulfill(body=route.fetch().text().replace(' return (point,engaged,now)=>{',' window.rig={jobs,reach,aim,placeFingertip};return (point,engaged,now)=>{'),content_type='text/javascript'))
 page.route('**/street-render.js',lambda route:route.fulfill(body=route.fetch().text().replace('return {reunion,speak,layout,actors','window.reviewScene=scene;return {reunion,speak,layout,actors'),content_type='text/javascript'))
 page.route('**/film-stage.html',lambda route:route.fulfill(body=markup,content_type='text/html'))
 for actor,voice in ([] if '--exchange-only' in sys.argv else films.items()):
  folder=out/actor;folder.mkdir(exist_ok=True)
  page.goto('http://127.0.0.1:4236/film-stage.html');page.wait_for_function('window.ready',timeout=90000)
  with wave.open(str(root/'assets'/f'{voice}.wav')) as audio:
   # Streamed WAV headers can advertise an unknown (very large) data length.
   pcm=audio.readframes(audio.getnframes())
   duration=max(4,len(pcm)/(audio.getframerate()*audio.getnchannels()*audio.getsampwidth())+.2)
  for frame in range(int(duration*24)+1):
   page.evaluate('drawSingle',{'id':actor,'frame':frame,'voice':voice});page.screenshot(path=str(folder/f'{frame:04d}.jpg'),type='jpeg',quality=90)
  subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-y','-loglevel','error','-framerate','24','-i',str(folder/'%04d.jpg'),'-i',str(root/'assets'/f'{voice}.wav'),'-af','apad','-t',str(duration),'-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',str(root/'assets'/f'rehearsal-{actor}.mp4')],check=True)
  print('Recorded',actor,flush=True)
 if '--actor' in sys.argv:
  browser.close()
  sys.exit(0)
 page.goto('http://127.0.0.1:4236/film-stage.html');page.wait_for_function('window.ready',timeout=90000);page.evaluate('prepareExchange()');page.set_viewport_size({'width':540,'height':480})
 contacts=[]
 for mode in ('wide','close'):
  folder=out/f'handoff-{mode}';folder.mkdir(exist_ok=True)
  for frame in range(97):
   gaps=page.evaluate('drawExchange',{'frame':frame,'close':mode=='close'})
   assert gaps,'No hand supports the coat'
   assert max(gaps)<.015,(frame,gaps)
   if mode=='wide':contacts.append(gaps)
   page.screenshot(path=str(folder/f'{frame:04d}.jpg'),type='jpeg',quality=92)
 (out/'handoff-contact.json').write_text(json.dumps({'frames':len(contacts),'maxKnuckleTargetGap':max(max(gaps) for gaps in contacts),'gaps':contacts},indent=2))
 subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-y','-loglevel','error','-framerate','24','-i',str(out/'handoff-wide/%04d.jpg'),'-framerate','24','-i',str(out/'handoff-close/%04d.jpg'),'-filter_complex','[0:v][1:v]hstack[v]','-map','[v]','-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',str(root/'assets/rehearsal-handoff.mp4')],check=True)
 browser.close()
print('Recorded shared-coat exchange')
