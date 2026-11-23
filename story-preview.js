import {applyChapterDay} from './campaign.js';
import {accompanySinger,songHitMask} from './nanyin-practice.js';
import {isPrint,portraitVersion} from './reunion-wall.js';
import {reunionIntents} from './story-reunion.js';
import {chapters, chapterSaveKey, chapterCompleted, readChapter, morning, names, voices} from './story-chapters.js';
import {createStoryScene,tableActionDuration} from './story-scene.js';
import {followSpeech, prepareVoiceRecording} from './voice-clips.js';
import {createPracticeRecorder} from './practice-recorder.js';
import {voiceUrl} from './voice-endpoint.js';

const $ = selector => document.querySelector(selector);
const chapter = new URLSearchParams(location.search).get('story') === 'table' ? 'table' : 'reunion';
const book = chapters[chapter];
const key = chapterSaveKey(chapter);
const defaults = () => chapter==='table'
 ? {node:book.start,drink:null,invited:false}
 : {node:book.start,songVersion:2,songHits:0,photos:null,photo:null};
let state = defaults();
const tableDone=()=>chapterCompleted('table',readChapter(localStorage,'table'));
const locked=chapter==='reunion'&&!tableDone()&&!chapterCompleted('reunion',readChapter(localStorage,'reunion'));
try {
 const saved = JSON.parse(localStorage.getItem(key));
 const resumeAfterMeal=chapter==='reunion'&&saved?.node==='toast';
 if(resumeAfterMeal)saved.node='wait';
 if(chapter==='reunion'&&saved&&saved.songVersion!==2){
  if(saved.node==='riddle')saved.node='guess';
  if(saved.node==='gather')saved.node='wait';
  saved.songVersion=2;saved.songHits=0;
 }
 if (saved && Object.hasOwn(book.nodes,saved.node)) Object.assign(state,saved);
 if(chapter==='reunion'){
  state.songHits=Number.isInteger(state.songHits)?state.songHits & songHitMask:0;
  delete state.onBeat;
  delete state.beats;
  if(state.node==='proof' && !(Array.isArray(state.photos)&&state.photos.length===2&&state.photos.every(isPrint)))state.node='ready';
  if(['tidy','laugh'].includes(state.node)&&!isPrint(state.photo))state.node='ready';
  if(resumeAfterMeal)persist();
 }
} catch {}
let song,scene, generation=0, playback, stopTracking, audioUrl;
const audio=new Audio();
let recording=false,transcription,revision=0;
const recorder=createPracticeRecorder(active=>{recording=active;});
const spokenChoices=chapter==='reunion'?reunionIntents:{
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
 try{
  const previous=readChapter(localStorage,chapter);
  if(chapterCompleted(chapter,previous)&&!chapterCompleted(chapter,state))return;
  if(previous?.reunionDay)state.reunionDay=previous.reunionDay;
  if(chapterCompleted(chapter,state))state.completed=true;
  localStorage.setItem(key,JSON.stringify(state));
 }catch{$('#status').textContent='当前浏览器空间不足，进度未保存。';}
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
  if(!book.nodes[node][3].length)audio.onended=finishLine;
  await audio.play();
  if(!book.nodes[node][3].length)clearTimeout(endingTimer);
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
let enteringPortrait=false,actionEnds=0;
let endingTimer;
function showResult(kind){
 clearTimeout(endingTimer);audio.onended=null;stopAudio();
 const final=kind==='finished',wait=kind==='locked';
 const result=$('#chapter-result'),photo=$('#result-photo');
 photo.hidden=!final;
 if(final){photo.src=state.photo;state.endingSeen=true;persist();}
 $('#result-place').textContent=final?'粵記茶餐廳　·　團年留影':wait?'主线三　·　预埋你嗰份':'第 '+state.reunionDay+' 天　·　粤记茶餐厅';
 $('#result-title').textContent=final?'恭喜通关':wait?'团年饭尚未开启':'过了一天';
 $('#result-description').textContent=final?'下次嚟飲茶，預埋你嗰份。':wait?'完成《今晚搭张台》后，街坊会邀你来吃团年饭。':'今晚是年三十。芳姐招呼你入座，桌上已经留了你的位置。';
 const action=$('#result-action');
 action.textContent=final?'回到封面':wait?'前往《今晚搭张台》':'赴团年饭 · 预埋你嗰份';
 action.href=final?'./?street=3d':'?story='+(wait?'table':'reunion');
 result.hidden=false;result.focus();
}
function finishLine(){
 if(chapter==='table'){
  try{state.reunionDay=applyChapterDay(localStorage);}catch(e){$('#status').textContent=e.message;return;}
 }
 showResult(chapter==='table'?'next-day':'finished');
}

function capturePortraits(){
 state.photos=['snapTidy','snapLaugh'].map(pose=>scene.photograph(pose,state));
 state.portraitVersion=portraitVersion;
}
function transition(dest){
 if(enteringPortrait||performance.now()<actionEnds)return;
 if(dest==='proof'){
  enteringPortrait=true;revision++;recorder.cancel();transcription?.abort();stopAudio();
  document.body.dataset.moment='enterPortrait';
  $('#choices').replaceChildren();$('#speaker').textContent='你';$('#line').textContent='我嚟喇！';
  $('#meaning').textContent='你走到前排，站进街坊给你留的位置。';$('#status').textContent='';
  scene.set('enterPortrait',state);scene.tick(performance.now());scene.render();
  setTimeout(()=>{
   capturePortraits();enteringPortrait=false;state.node='proof';display();persist();
  },2100);
  return;
 }
 if(dest==='tidy'||dest==='laugh'){
  state.photo=state.photos[dest==='tidy'?0:1];
  state.photos=null;
 }
 if(chapter==='reunion')state.songHits=0;
 if(chapter==='table'&&(dest==='tea'||dest==='lemon'))state.drink=dest;
 if(dest==='invite'||dest==='takeaway')state.invited=dest==='invite';
 state.node=dest;display();persist();
 if(chapter==='table'&&dest==='morning'){
  try{state.reunionDay=applyChapterDay(localStorage);}catch(e){$('#status').textContent=e.message;}
 }
}
function sing(label,dest){
 const tap=button('敲板',()=>{},true);
 const next=button(label,()=>transition(dest));next.hidden=true;
 song=accompanySinger({
  audio:$('#master-recording'),panel:$('#song-panel'),tap,next,
  hits:state.songHits,onHit:hits=>{state.songHits=hits;persist();},
  strike:onContact=>scene.strike(onContact),advance:()=>transition(dest)
 });
}
function display(){
 revision++;recorder.cancel();transcription?.abort();song?.destroy();song=null;stopAudio();

 document.body.dataset.moment=state.node;
 const n=state.node,[actor,original,translation,options]=book.nodes[n];
 const [line,meaning]=n==='morning'?morning(state.drink):[original,translation];
 const afterDinner=['wait','gather','call','ready','proof','tidy','laugh'].includes(n);
 $('#place').textContent=chapter==='reunion'
  ? '粤记茶餐厅　·　年三十'+(afterDinner?'饭后':'团年饭')
  : (n==='farewell'?'粤记门外':'粤记茶餐厅')+'　·　'+(n==='morning'?'第二天早上':n==='farewell'?'晚饭后':'收工时分');
 $('#speaker').textContent=names[actor];$('#line').textContent=line;$('#line').lang=actor==='friend'?'zh':'yue';
 $('#meaning').textContent=meaning;$('#status').textContent='';$('#choices').replaceChildren();
 scene.set(n,state);scene.tick(performance.now());scene.render();showPhotoChoices();
 const playing=actor==='master';
 $('#song-panel').hidden=!playing;
 if(playing)sing(...options[0]);
 else for(const [index,[label,dest]] of options.entries())button(label,()=>transition(dest),index===0);
 if(!options.length){
  button(chapter==='table'?'前往下一天':'查看团年合照',finishLine,true);
  clearTimeout(endingTimer);endingTimer=setTimeout(finishLine,12000);
 }
 if(options.length && (chapter==='table'||reunionIntents[n]))button('讲粤语',listen).id='record';
 const duration=chapter==='table'?(tableActionDuration[n]||0):0;
 actionEnds=performance.now()+duration;
 if(duration){
  const controls=[...$('#choices').querySelectorAll('button')];
  for(const control of controls)control.disabled=true;
  setTimeout(()=>{for(const control of controls)control.disabled=false;},duration);
 }
 if(playing)return;
 button('听这句',()=>{recorder.cancel();transcription?.abort();const mic=$('#record');if(mic){mic.disabled=false;mic.textContent='讲粤语';}void speak();});void speak();
}
$('h1').textContent=book.title;document.title=book.title+' · 街坊故事';

const canvas=$('#stage');
canvas.addEventListener('click',event=>{
 const target=scene?.hit(event.clientX,event.clientY);
 if(target==='beat')$('#choices button')?.click();
 if(target==='lid')transition('dish');
 if(state.node==='supper'&&(target==='chicken'||target==='fish'))transition(target);
});
window.addEventListener('pagehide',()=>{clearTimeout(endingTimer);song?.pause();stopAudio();recorder.cancel();transcription?.abort();});
window.addEventListener('pageshow',event=>{
 if(event.persisted&&!locked&&!book.nodes[state.node][3].length&&$('#chapter-result').hidden)finishLine();
});
async function openChapter(){
 if(locked){showResult('locked');return;}
 if(chapter==='reunion'&&tableDone())applyChapterDay(localStorage);
 const returningToPhoto=chapter==='reunion'&&isPrint(state.photo)&&(state.endingSeen||new URLSearchParams(location.search).has('ending'));
 if(returningToPhoto&&state.portraitVersion===portraitVersion){showResult('finished');return;}
 if(chapter==='table'&&state.node==='morning'&&state.reunionDay){showResult('next-day');return;}
 scene=await createStoryScene(canvas,chapter);
 if(chapter==='reunion'&&state.portraitVersion!==portraitVersion&&['proof','tidy','laugh'].includes(state.node)){
  capturePortraits();
  if(state.node!=='proof'){state.photo=state.photos[state.node==='laugh'?1:0];state.photos=null;}
  persist();
 }
 if(returningToPhoto){showResult('finished');return;}
 $('#loading').hidden=true;$('#dialogue').hidden=false;display();persist();
 let last=0;
 function frame(t){
  if(!$('#chapter-result').hidden)return;
  if(!document.hidden&&t-last>40){scene.tick(t,song?.pose());scene.render();last=t;}
  requestAnimationFrame(frame);
 }
 requestAnimationFrame(frame);
}
try{
 await openChapter();
}catch(error){console.error(error);$('#loading').textContent='场景未能载入，请使用支持 WebGL 的浏览器刷新重试。';}
