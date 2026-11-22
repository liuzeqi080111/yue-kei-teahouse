import {createBoardLesson,rehearseRecording} from './nanyin-practice.js';
import {reunionSaveKey,isPrint} from './reunion-wall.js';
import {reunionIntents} from './story-reunion.js';
import {chapters, morning, names, voices} from './story-chapters.js';
import {createStoryScene} from './story-scene.js';
import {followSpeech, prepareVoiceRecording} from './voice-clips.js';
import {createPracticeRecorder} from './practice-recorder.js';
import {voiceUrl} from './voice-endpoint.js';

const $ = selector => document.querySelector(selector);
const chapter = new URLSearchParams(location.search).get('story') === 'table' ? 'table' : 'reunion';
const book = chapters[chapter];
const key = chapter==='reunion'?reunionSaveKey:'yuekei-story-trial-v1:table';
const defaults = () => chapter==='table'
 ? {node:book.start,drink:null,invited:false}
 : {node:book.start,onBeat:0,photos:null,photo:null};
let state = defaults();
try {
 const saved = JSON.parse(localStorage.getItem(key));
 if (saved && Object.hasOwn(book.nodes,saved.node)) Object.assign(state,saved);
 if(chapter==='reunion'){
  state.onBeat=Number.isInteger(state.onBeat)?Math.max(0,Math.min(2,state.onBeat)):0;
  delete state.beats;
  if(state.node==='proof' && !(Array.isArray(state.photos)&&state.photos.length===2&&state.photos.every(isPrint)))state.node='ready';
  if(['tidy','laugh'].includes(state.node)&&!isPrint(state.photo))state.node='ready';
 }
} catch {}
let lesson,scene, generation=0, playback, stopTracking, audioUrl;
const audio=new Audio();
let recording=false,transcription,revision=0;
const recorder=createPracticeRecorder(active=>{recording=active;});
const spokenChoices={
 ...reunionIntents,
 door:[/搭[台枱桌]|[两兩]位/],ask:[/一[齐齊起]|搭[台枱桌]|介[意唔]/],seat:[/奶茶/,/[柠檸]/],tea:[/林|[听聽倾傾聊]|[邻鄰]桌/],lemon:[/林|[听聽倾傾聊]|[邻鄰]桌/],
 arrive:[/坐|一[齐齊起]/,/[拎帶带]走|打包|杯茶/],invite:[/筷|箸/],takeaway:[/[听聽明][日朝天]|[预預留].*位/],supper:[/[听聽明]朝|[再見见]|出[門门]/],farewell:[/第二[日天]|[听聽明]朝/]
};
async function listen(){
 if(recording){recorder.stop();return;}
 const turn=revision,n=state.node,options=book.nodes[n][3],control=$('#record');
 stopAudio();control.disabled=true;
 function feedback(msg){if(turn===revision)$('#status').textContent=msg;}
 await recorder.start('story',{
  score:false,onError:msg=>{feedback(msg);if(turn===revision){control.disabled=false;control.textContent='讲粤语';}},
  onState:status=>{if(turn!==revision)return;if(status==='recording'){control.disabled=false;control.textContent='讲完了';feedback('正在听…');}else if(status==='preparing'){control.disabled=true;feedback('正在识别…');}},
  onRecorded:async blob=>{
   if(turn!==revision)return;
   const abort=new AbortController();transcription=abort;const timeout=setTimeout(()=>abort.abort(),20000);
   try{
    const bytes=new Uint8Array(await blob.arrayBuffer());let raw='';
    for(let off=0;off<bytes.length;off+=8192)raw+=String.fromCharCode(...bytes.subarray(off,off+8192));
    const response=await fetch(voiceUrl('/api/voice/transcribe'),{method:'POST',signal:abort.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({audioBase64:btoa(raw),mimeType:blob.type.split(';')[0]})});
    if(!response.ok)throw Error('asr');
    const {text}=await response.json();if(turn!==revision)return;
    const i=spokenChoices[n]?.findIndex(pattern=>pattern.test(text));
    if(i>=0&&options[i])transition(options[i][1]);else feedback(text?'听到「'+text+'」。可以再说一次，或点选项。':'没听清，可以再说一次。');
   }catch{feedback('这次没能识别，可以再说一次，或点选项。');}
   finally{clearTimeout(timeout);if(turn===revision){control.disabled=false;control.textContent='讲粤语';}}
  }
 });
}
function persist(){
 try {localStorage.setItem(key,JSON.stringify(state));} catch {$('#status').textContent='当前浏览器空间不足，本次试玩仍可继续。';}
}
function stopAudio(){
 generation++;playback?.abort();audio.pause();stopTracking?.();stopTracking=null;
 if(audioUrl){URL.revokeObjectURL(audioUrl);audioUrl=null;}
}
async function speak(){
 stopAudio();
 const turn=generation, node=state.node, actor=book.nodes[node][0];
 playback=new AbortController();
 try{
  const suffix=node==='morning'?'-'+state.drink:'';
  const file='assets/story-'+chapter+'-'+node+suffix+'.wav';
  const response=await fetch(file,{signal:playback.signal});
  if(!response.ok)throw Error('recording');
  const clip=await prepareVoiceRecording(await response.blob(),voices[actor]);
  if(turn!==generation)return;
  audioUrl=URL.createObjectURL(clip.blob);audio.src=audioUrl;audio.playbackRate=clip.rate;
  stopTracking=followSpeech(audio,clip.blob,(value,shape)=>scene.speech(actor,value,shape),file);
  await audio.play();
 }catch(e){if(turn===generation && e.name!=='AbortError')$('#status').textContent=e.name==='NotAllowedError'?'点「听这句」播放对白。':'录音读取失败，可点「听这句」重试。';}
}
function button(text,fn,primary=false){
 const b=document.createElement('button');b.type='button';b.textContent=text;b.classList.toggle('primary',primary);b.onclick=fn;$('#choices').append(b);return b;
}
function showPhotoChoices(){
 const gallery=$('#photo-view');
 gallery.replaceChildren();gallery.hidden=state.node!=='proof';
 if(gallery.hidden)return;
 state.photos.forEach((src,index)=>{
  const fig=document.createElement('figure'),img=new Image();
  const title=index?'第二张 · 笑住过年':'第一张 · 齐齐整整';
  img.src=src;img.alt=title;
  const caption=document.createElement('figcaption');caption.textContent=title;
  fig.append(img,caption);gallery.append(fig);
 });
}
function transition(dest){
 if(dest==='proof')state.photos=['snapTidy','snapLaugh'].map(pose=>scene.photograph(pose,state));
 if(dest==='tidy'||dest==='laugh'){
  state.photo=state.photos[dest==='tidy'?0:1];
  state.photos=null;
 }
 if(chapter==='reunion')state.onBeat=0;
 if(chapter==='table'&&(dest==='tea'||dest==='lemon'))state.drink=dest;
 if(dest==='invite'||dest==='takeaway')state.invited=dest==='invite';
 state.node=dest;display();persist();
}
const listening=$('#nanyin-listen');
const recordingExample=$('#master-recording');
let endRecordingPractice;
function resetRecordingPractice(){
 endRecordingPractice?.();endRecordingPractice=null;$('#live-practice').hidden=true;
 $('#start-live-practice').disabled=recordingExample.readyState<1;
}
recordingExample.addEventListener('loadedmetadata',()=>{$('#start-live-practice').disabled=false;});
$('#start-live-practice').onclick=()=>{
 resetRecordingPractice();$('#live-practice').hidden=false;
 endRecordingPractice=rehearseRecording(recordingExample,state.node,{
  button:$('#live-tap'),cue:$('#live-cue'),progress:$('#live-score'),
  knock:()=>lesson.knock(),done:()=>lesson.completeFromRecording()
 });
};
function referenceMode(video){
 resetRecordingPractice();
 recordingExample.pause();$('#nanyin-player').replaceChildren();
 $('#listen-recording').hidden=video;$('#video-title').hidden=!video;
 $('#switch-reference').textContent=video?'听杜焕现场录音':'看慢板教学';
 if(video){
  const player=document.createElement('iframe');
  player.title='一才鑼鼓 · 南音慢板真人示范';
  player.src='https://www.youtube-nocookie.com/embed/DtuYBU4DKas?start=832&autoplay=1&playsinline=1';
  player.allow='autoplay; encrypted-media; fullscreen';player.allowFullscreen=true;
  player.referrerPolicy='strict-origin-when-cross-origin';$('#nanyin-player').append(player);
 }else{
  // Stream the journal's published listening example with its original credit.
  if(!recordingExample.hasAttribute('src'))recordingExample.src='https://chinoperl.org/audio/1-01WuSongKillsTheTiger.mp3';
  void recordingExample.play().catch(()=>{});
 }
}
function openReference(){lesson?.interrupt();listening.showModal();referenceMode(false);}
$('#switch-reference').onclick=()=>referenceMode($('#video-title').hidden);
function closeReference(){
 resetRecordingPractice();
 recordingExample.pause();recordingExample.removeAttribute('src');recordingExample.load();
 $('#nanyin-player').replaceChildren();listening.close();
}
$('#close-listen').onclick=closeReference;
listening.addEventListener('cancel',event=>{event.preventDefault();closeReference();});
function boardControls(label,dest){
 const beatButton=button('',()=>{},true),nextButton=button(label,()=>transition(dest));
 button('听真人唱 · 跟原声敲',openReference);
 lesson=createBoardLesson({panel:$('#board-lesson'),beatButton,nextButton,points:state.onBeat,
  onPoint:points=>{state.onBeat=points;persist();},onStrike:()=>scene.strike()});
}
function display(){
 revision++;recorder.cancel();transcription?.abort();lesson?.destroy();lesson=null;stopAudio();

 document.body.dataset.moment=state.node;
 const n=state.node,[actor,original,translation,options]=book.nodes[n];
 const [line,meaning]=n==='morning'?morning(state.drink):[original,translation];
 const afterDinner=['gather','call','ready','proof','tidy','laugh'].includes(n);
 $('#place').textContent=chapter==='reunion'
  ? '粤记茶餐厅　·　年三十'+(afterDinner?'饭后':'团年饭')
  : (n==='farewell'?'粤记门外':'粤记茶餐厅')+'　·　'+(n==='morning'?'第二天早上':n==='farewell'?'晚饭后':'收工时分');
 $('#speaker').textContent=names[actor];$('#line').textContent=line;$('#line').lang=actor==='friend'?'zh':'yue';
 $('#meaning').textContent=meaning;$('#status').textContent='';$('#choices').replaceChildren();
 scene.set(n,state);scene.tick(performance.now());scene.render();showPhotoChoices();
 const playing=actor==='master';
 $('#board-lesson').hidden=!playing;
 if(playing)boardControls(...options[0]);
 else for(const [index,[label,dest]] of options.entries())button(label,()=>transition(dest),index===0);
 if(!options.length){
  button('再玩一次',()=>{state=defaults();display();persist();},true);
  button('试玩另一段',()=>location.assign('?story='+book.other));
 }
 if(options.length && (chapter==='table'||reunionIntents[n]))button('讲粤语',listen).id='record';
 if(playing)return;
 button('听这句',()=>{recorder.cancel();transcription?.abort();const mic=$('#record');if(mic){mic.disabled=false;mic.textContent='讲粤语';}void speak();});void speak();
}
$('h1').textContent=book.title;document.title=book.title+' · 街坊故事';
$('#other').href='?story='+book.other;$('#other').textContent=chapters[book.other].title;
document.addEventListener('visibilitychange',()=>{if(document.hidden&&listening.open)closeReference();});
const canvas=$('#stage');
canvas.addEventListener('click',event=>{
 const target=scene?.hit(event.clientX,event.clientY);
 if(target==='beat')$('#choices button')?.click();
 if(target==='lid')transition('dish');
});
window.addEventListener('pagehide',()=>{lesson?.interrupt();if(listening.open)closeReference();stopAudio();recorder.cancel();transcription?.abort();});
try{
 scene=await createStoryScene(canvas,chapter);$('#loading').hidden=true;$('#dialogue').hidden=false;display();
 let last=0;function frame(t){if(!document.hidden&&t-last>40){scene.tick(t,lesson?.elapsed()??-1);scene.render();last=t;}requestAnimationFrame(frame);}requestAnimationFrame(frame);
}catch(error){console.error(error);$('#loading').textContent='场景未能载入，请使用支持 WebGL 的浏览器刷新重试。';}
