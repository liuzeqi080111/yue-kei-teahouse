import {chapters, morning, names, voices} from './story-chapters.js';
import {createStoryScene} from './story-scene.js';
import {followSpeech, prepareVoiceRecording} from './voice-clips.js';
import {createPracticeRecorder} from './practice-recorder.js';
import {voiceUrl} from './voice-endpoint.js';

const $ = selector => document.querySelector(selector);
const chapter = new URLSearchParams(location.search).get('story') === 'table' ? 'table' : 'photo';
const book = chapters[chapter];
const key = 'yuekei-story-trial-v1:' + chapter;
const defaults = () => ({node:book.start, layout:'wait', drink:null, invited:false, photo:null, zoom:.2, pan:0, tilt:0});
let state = defaults();
try {
 const saved = JSON.parse(localStorage.getItem(key));
 if (saved && Object.hasOwn(book.nodes,saved.node)) Object.assign(state,saved);
 if (['proof','hung','tomorrow'].includes(state.node) && !state.photo?.startsWith('data:image/jpeg;base64,')) state.node='finder';
} catch {}
let scene, generation=0, playback, stopTracking, audioUrl, displayVersion=0, dragging,wideWindow=false;
const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
const audio=new Audio();
let recording=false,transcription,revision=0;
const recorder=createPracticeRecorder(active=>{recording=active;});
const spokenChoices={
 window:[/相|照片/],print:[/背|翻/],back:[/等|收[铺舖鋪工]/,/凳|椅/],wait:[/招牌|影相|合照/],bench:[/阿晴|影相|合照/],assemble:[/相[机機]|影相/],
 finder:[/影|拍|快[门門]/],proof:[/放|橱窗|櫥窗|挂|掛/,/重[拍影來来]|再[拍影]/],hung:[/第二[日天]|[听聽明]朝/],
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
  await audio.play();if(turn===generation)$('#status').textContent='';
 }catch(e){if(turn===generation && e.name!=='AbortError')$('#status').textContent=e.name==='NotAllowedError'?'点「听这句」播放对白。':'录音读取失败，可点「听这句」重试。';}
}
function button(text,fn,primary=false){
 const b=document.createElement('button');b.type='button';b.textContent=text;b.classList.toggle('primary',primary);b.onclick=fn;$('#choices').append(b);return b;
}
async function showPaper(node) {
 const version=++displayVersion;
 $('#photo-view').hidden=true;
 if(!['print','back','proof'].includes(node))return;
 const paper=$('#paper'),c=paper.getContext('2d');
 const img=new Image();img.src=node==='back'?'assets/story-photo-inscription.png':node==='proof'?state.photo:scene.oldPhoto;
 await img.decode();if(version!==displayVersion)return;
 paper.width=img.width;paper.height=img.height;c.drawImage(img,0,0);
 paper.setAttribute('aria-label',node==='back'?'芳姐手书：散工之後，老地方。阿芳記於永光門前。':'街坊合照');
 $('#photo-view').hidden=false;
 $('figcaption').textContent={print:'旧相正面 · 永光门前',back:'旧相背面 · 芳姐的字',proof:'刚拍下的合照'}[node];
}
function transition(dest){
 if(dest==='proof')state.photo=scene.photograph(state);
 if(dest==='wait'||dest==='bench')state.layout=dest;
 if(dest==='tea'||dest==='lemon')state.drink=dest;
 if(dest==='invite'||dest==='takeaway')state.invited=dest==='invite';
 state.node=dest;display();persist();
}
function display(){
 revision++;recorder.cancel();transcription?.abort();
 wideWindow=false;
 document.body.dataset.moment=state.node;
 const n=state.node,[actor,original,translation,options]=book.nodes[n];
 const [line,meaning]=n==='morning'?morning(state.drink):[original,translation];
 $('#place').textContent=(chapter==='photo'?'永光照相馆':n==='farewell'?'粤记门外':'粤记茶餐厅')+'　·　'+(['tomorrow','morning'].includes(n)?'第二天早上':n==='farewell'?'晚饭后':'收工时分');
 $('#speaker').textContent=names[actor];$('#line').textContent=line;$('#line').lang=actor==='friend'?'zh':'yue';
 $('#meaning').textContent=meaning;$('#status').textContent='';$('#choices').replaceChildren();
 $('#crop').hidden=$('#finder').hidden=n!=='finder';$('#crop input').value=state.zoom;
 scene.set(n,state);if(chapter==='photo')scene.hang(['hung','tomorrow'].includes(n)?state.photo:scene.oldPhoto);
 scene.tick(performance.now());scene.render(state);void showPaper(n);
 for(const [index,[label,dest]] of options.entries())button(label,()=>transition(dest),index===0);
 if(!options.length){
  button('再玩一次',()=>{state=defaults();display();persist();},true);
  if(n==='tomorrow')button('退后看新招牌',event=>{
   wideWindow=!wideWindow;scene.windowView(wideWindow);scene.render(state);
   event.currentTarget.textContent=wideWindow?'走近看合照':'退后看新招牌';
  });
  button('试玩另一段',()=>location.assign('?story='+book.other));
 }
 if(options.length)button('讲粤语',listen).id='record';
 button('听这句',()=>{recorder.cancel();transcription?.abort();const mic=$('#record');if(mic){mic.disabled=false;mic.textContent='讲粤语';}void speak();});void speak();
}
$('h1').textContent=book.title;document.title=book.title+' · 街坊故事';
$('#other').href='?story='+book.other;$('#other').textContent=chapters[book.other].title;
const canvas=$('#stage');
$('#crop input').oninput=e=>{state.zoom=Number(e.target.value);scene.render(state);persist();};
canvas.onpointerdown=e=>{if(state.node==='finder'){dragging=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId);}};
canvas.onpointermove=e=>{
 if(!dragging)return;
 state.pan=clamp(state.pan-(e.clientX-dragging[0])*3/canvas.clientWidth,-1.4,1.4);
 state.tilt=clamp(state.tilt+(e.clientY-dragging[1])*2/canvas.clientHeight,-.6,.65);
 dragging=[e.clientX,e.clientY];scene.render(state);
};
canvas.onpointerup=canvas.onpointercancel=()=>{if(dragging)persist();dragging=null;};
canvas.tabIndex=0;canvas.onkeydown=e=>{
 if(state.node!=='finder')return;
 const keys={ArrowLeft:[-.08,0],ArrowRight:[.08,0],ArrowUp:[0,.06],ArrowDown:[0,-.06]};
 if(e.code==='Space'){e.preventDefault();transition('proof');}
 if(keys[e.key]){e.preventDefault();const [x,y]=keys[e.key];state.pan=clamp(state.pan+x,-1.4,1.4);state.tilt=clamp(state.tilt+y,-.6,.65);scene.render(state);persist();}
};
window.addEventListener('pagehide',()=>{stopAudio();recorder.cancel();transcription?.abort();});
try{
 scene=await createStoryScene(canvas,chapter);$('#loading').hidden=true;$('#dialogue').hidden=false;display();
 let last=0;function frame(t){if(!document.hidden&&t-last>40){scene.tick(t);scene.render(state);last=t;}requestAnimationFrame(frame);}requestAnimationFrame(frame);
}catch(error){console.error(error);$('#loading').textContent='场景未能载入，请使用支持 WebGL 的浏览器刷新重试。';}
