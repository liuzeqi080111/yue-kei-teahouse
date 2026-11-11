import {createFp1Story} from './fp1-story.js';
import {createFp1Travel} from './fp1-travel.js';
import {createFp1Voice} from './fp1-voice.js';
import {createFp1Dictation} from './fp1-dictation.js';
import {FP1_CLIPS} from './fp1-clips.js';
import {canMove, createFp1Scene, people, shopPath, start, streetPath} from './fp1-scene.js';
import {voiceUrl} from './voice-endpoint.js';

const $=id=>document.getElementById(id);
const canvas=$('scene');
const ui=Object.fromEntries([
  'experience','goal','dialogue','speaker','subtitle','explanation','choices','walk-tools','direction',
  'follow','dialogue-tools','speak','help','help-options','type','type-form','voice-text','voice-status',
  'sound','restart','loading','context-line','dictation-consent','dictate','view-hint'
].map(id=>[id,$(id)]));
const story=createFp1Story();
const journey={street:streetPath.slice(1),approach:shopPath.slice(1)};
const stopAction={street:'arriveStreet',approach:'arriveCounter'};
const walking=phase=>phase==='street'||phase==='approach';
const voiceStage=phase=>phase==='counter'||phase==='choice';
const stage=()=>story.snapshot().phase;
const camera={...start,y:1.58,yaw:-.25,pitch:-.09};
const keys=new Set();
const moves={arrowup:'forward',w:'forward',arrowdown:'back',s:'back',
  arrowleft:'left',a:'left',arrowright:'right',d:'right'};
const helpText={
  counter:{
    meaning:'她问你有没有带取件单。',
    example:'可以说：「有呀，麻烦你帮我睇吓。」'
  },
  choice:{
    meaning:'芳姐查过记录，觉得可能是两位客人拿反了衣服。',
    example:'可以说：「我哋先搵返原本嗰件褛。」'
  }
};
const shortCommands={
  counter:{handTicket:['递上取件单','遞上取件單','给你取件单','取件单给你','呢張係取件單','呢张系取件单','呢張取件單俾你','有呀麻煩你幫我睇吓']},
  choice:{
    recover:['先找回原来的外套','找回外套','搵返原本嗰件褛','我哋先搵返原本嗰件褸'],
    borrow:['先借一件应急','借一件外套','借件褸頂住','借件褛顶住'],
    buy:['先买一件新的','买一件新外套','買一件新外套','買件新褸']
  }
};
let scene, frame=0, lastFrame=0, lastLook=0, pointer=null;
let audible=true, providerReady=false, providerChecked=false, permissionPending=false;
let currentLine=null, refreshAfterVoice=false, isLoading=true;
let followDisplay='', friend={...people.friend}, heading=0;
let pausedForVisibility=false;
let clip=null;
const meetingTranslation='她明天要面试，取错了外套。我们陪她去问问？';

function sayStatus(text='') {
  ui['voice-status'].textContent=text;
  ui['voice-status'].hidden=!text;
}
function explain(text='') {
  ui.explanation.textContent=text;
  ui.explanation.hidden=!text;
}
function toggle(control,panel,open) {
  panel.hidden=!open;
  control.setAttribute('aria-expanded',String(open));
}
function closeExtras() {
  toggle(ui.help,ui['help-options'],false);
  toggle(ui.type,ui['type-form'],false);
  explain();
  sayStatus();
  ui['dictation-consent'].hidden=true;
  ui['voice-text'].value='';
}
function stopLocalSpeech() {
  globalThis.speechSynthesis?.cancel();
  if (clip) {
    clip.onended=null;
    clip.pause();
    clip=null;
  }
}
function stopSpeech() { stopLocalSpeech(); voice.stopAudio(); }
function speakLocal(text,lang) {
  if (!audible||!text||!globalThis.speechSynthesis||!globalThis.SpeechSynthesisUtterance) return false;
  const voices=speechSynthesis.getVoices();
  const match=lang==='zh-HK'
    ? voices.find(item=>/^(zh[-_]HK|yue)([-_]|$)/i.test(item.lang))
    : voices.find(item=>/^(zh[-_](CN|Hans|SG)|cmn)([-_]|$)/i.test(item.lang));
  if (!match) return false;
  stopLocalSpeech();
  const utterance=new SpeechSynthesisUtterance(text);
  utterance.voice=match;
  utterance.lang=match.lang;
  utterance.rate=.96;
  speechSynthesis.speak(utterance);
  return true;
}

async function readProvider() {
  try {
    const response=await fetch(voiceUrl('/api/voice/status'),{signal:AbortSignal.timeout(5000)});
    providerReady=response.ok&&(await response.json()).configured===true;
  } catch { providerReady=false; }
  providerChecked=true;
  return providerReady;
}
const providerCheck=readProvider();

function playCurrent(announce=false) {
  if (!audible||!currentLine?.text) return;
  const {text,speaker}=currentLine;
  const revision=story.snapshot().revision;
  if (Object.hasOwn(FP1_CLIPS,text)) {
    stopSpeech();
    const player=new Audio(FP1_CLIPS[text]);
    player.volume=.92;
    player.playbackRate=speaker==='芳姐'?.93:1;
    clip=player;
    player.onended=()=>{
      if (clip!==player) return;
      clip=null;
      if (!announce&&stage()==='meeting'&&story.snapshot().revision===revision&&audible) {
        const translation=new Audio(FP1_CLIPS[meetingTranslation]);
        translation.volume=.86;
        clip=translation;
        void translation.play().catch(()=>{if(clip===translation)clip=null;});
      }
    };
    void player.play().catch(()=>{
      if (clip!==player) return;
      clip=null;
      if (announce) sayStatus('配音暂时没能播放，可以再点一次台词。');
    });
    return;
  }
  if (speaker==='芳姐'&&providerReady&&voiceStage(stage())) {
    const meaning=helpText[stage()]?.meaning||'芳姐的回应。';
    if (voice.setLine({npcId:'fang',text,meaning})) void voice.replay();
    return;
  }
  const lang=speaker==='老朋友'?'zh-CN':'zh-HK';
  if (!speakLocal(text,lang)&&announce) sayStatus('当前设备没有可用配音，可以继续看字幕。');
}

const travel=createFp1Travel({
  initial:start,
  canMove:(from,to)=>{
    if (!['approach','counter','choice','end'].includes(stage())&&to.z<-13.14) return false;
    return canMove(from,to);
  },
  onArrive:tag=>{
    if (stage()===tag) advance(stopAction[tag]);
  }
});

const voice=createFp1Voice({
  getStory:story.snapshot,
  applyChoice:id=>{
    if (!story.act(id)) return false;
    refreshAfterVoice=true;
    closeExtras();
    return true;
  },
  onLine:({text,meaning})=>{
    if (refreshAfterVoice) {
      refreshAfterVoice=false;
      renderStory();
    } else if (voiceStage(stage())) {
      currentLine={speaker:'芳姐',text};
      ui.subtitle.textContent=text;
      explain(meaning);
    }
    // The reused client finishes its current attempt after this callback.
    const revision=story.snapshot().revision;
    queueMicrotask(()=>{if (story.snapshot().revision===revision) playCurrent();});
  },
  onStatus:({state,message,busy,recording})=>{
    if (!voiceStage(stage())) return;
    if (state==='error') sayStatus(message);
    else if (busy) sayStatus(message);
    else sayStatus();
    ui.speak.disabled=busy&&!recording;
    ui.speak.textContent=recording?'结束录音':'说话';
    ui.speak.dataset.recording=String(recording);
  },
  onTranscript:text=>{if (text) sayStatus(`听到：${text}`);}
});
const dictation=createFp1Dictation({
  onText:text=>{
    if (!voiceStage(stage())) return;
    ui['voice-text'].value=text.slice(0,160);
    toggle(ui.type,ui['type-form'],true);
    ui['voice-text'].focus();
    sayStatus('确认听写内容后发送。');
  },
  onStatus:({state,message})=>{
    ui.speak.textContent=state==='listening'?'结束听写':'说话';
    ui.speak.dataset.recording=String(state==='listening');
    if (message!=='听写完成。') sayStatus(message);
  }
});

function makeChoice({id,label}) {
  const button=document.createElement('button');
  button.type='button';
  button.dataset.action=id;
  button.textContent=label;
  button.addEventListener('click',()=>advance(id));
  return button;
}
function renderStory() {
  const state=story.snapshot();
  ui.experience.dataset.phase=state.phase;
  ui.experience.dataset.route=state.route||'';
  ui.goal.textContent=state.goal;
  ui.speaker.textContent=state.speaker;
  ui.subtitle.textContent=state.text;
  ui.subtitle.title=state.text?'点台词重听':'';
  ui['context-line'].hidden=state.phase!=='meeting';
  ui['context-line'].textContent=state.phase==='meeting'
    ? `老朋友：${meetingTranslation}` : '';
  currentLine={text:state.text,speaker:state.speaker};
  ui.choices.replaceChildren(...state.choices.map(makeChoice));
  ui.dialogue.hidden=!state.text&&!state.choices.length;
  ui['dialogue-tools'].hidden=!voiceStage(state.phase);
  ui.speak.disabled=false;
  ui.speak.textContent='说话';
  ui.speak.dataset.recording='false';
  ui['walk-tools'].hidden=!walking(state.phase);
  ui['view-hint'].textContent=walking(state.phase)||state.phase==='deferred'?'拖动环顾 · 方向键移动':'拖动环顾';
  if (state.phase==='end') sayStatus('这段试玩到这里。');
  updateFollow();
}

function advance(id) {
  if (isLoading||!story.act(id)) return false;
  refreshAfterVoice=false;
  dictation.cancel();
  voice.cancel('');
  stopLocalSpeech();
  closeExtras();
  keys.clear();
  const phase=stage();
  if (journey[phase]) travel.start(journey[phase],phase);
  if (phase==='meeting'||phase==='counter') lastLook=0;
  renderStory();
  playCurrent();
  return true;
}

function reset() {
  if (isLoading) return;
  refreshAfterVoice=false;
  dictation.cancel();
  voice.reset();
  stopLocalSpeech();
  story.reset();
  travel.reset(start);
  Object.assign(camera,start,{yaw:-.25,pitch:-.09});
  friend={...people.friend};
  heading=0;
  lastLook=0;
  keys.clear();
  closeExtras();
  renderStory();
  ui.choices.querySelector('button')?.focus();
}
function updateFollow() {
  const motion=travel.snapshot();
  if (followDisplay===motion.mode) return;
  followDisplay=motion.mode;
  ui.follow.textContent=motion.mode==='following'?'自己逛逛':'跟上朋友';
  ui.direction.hidden=motion.mode==='following';
}

function currentActors(phase,position,previous,dt) {
  const cast=[];
  if (walking(phase)) {
    const moved=Math.hypot(position.x-previous.x,position.z-previous.z);
    if (moved>.001&&travel.snapshot().mode==='following') {
      heading=Math.atan2(position.x-previous.x,previous.z-position.z);
      const x=position.x+Math.sin(heading)*1.72-.5;
      const z=position.z-Math.cos(heading)*1.72;
      const k=Math.min(1,dt*5);
      const next={x:friend.x+(x-friend.x)*k,z:friend.z+(z-friend.z)*k};
      if (canMove(friend,next)) friend=next;
      else if (canMove(position,{x:position.x-.22,z:position.z-.75})) {
        friend={x:position.x-.22,z:position.z-.75};
      }
    }
    cast.push({...friend,id:travel.snapshot().mode==='following'?'friendBack':'friend'});
  } else if (phase==='door') cast.push({id:'friend',x:-.48,z:-12.96});
  else if (['counter','choice','end'].includes(phase)) {
    cast.push({id:'friend',x:-1.29,z:-17.89},{id:'qing',x:1.58,z:-17.92});
  } else {
    cast.push({...people.friend,id:'friend'});
    if (phase!=='home') cast.push({...people.qing,id:'qing'});
  }
  cast.push({...people.fang,id:'fang'});
  return cast;
}

function moveKeys(dt) {
  const longitudinal=Number(keys.has('forward'))-Number(keys.has('back'));
  const lateral=Number(keys.has('right'))-Number(keys.has('left'));
  if ((!longitudinal&&!lateral)||(!walking(stage())&&stage()!=='deferred')) return false;
  const amount=dt*1.55/Math.hypot(longitudinal,lateral);
  const s=Math.sin(camera.yaw),c=Math.cos(camera.yaw);
  travel.move((s*longitudinal+c*lateral)*amount,(-c*longitudinal+s*lateral)*amount);
  return true;
}
function aimAt(x,z,dt,rate) {
  const next=Math.atan2(x-camera.x,camera.z-z);
  const delta=Math.atan2(Math.sin(next-camera.yaw),Math.cos(next-camera.yaw));
  camera.yaw+=delta*Math.min(1,dt*rate);
  camera.pitch+=(-.08-camera.pitch)*Math.min(1,dt*rate);
}
function animate(now) {
  const dt=Math.min(.08,(now-(lastFrame||now))/1000);
  lastFrame=now;
  const previous=travel.snapshot().position;
  if (!document.hidden&&!moveKeys(dt)) travel.tick(dt);
  const position=travel.snapshot().position;
  Object.assign(camera,position);
  const phase=stage();
  if (!pointer&&now-lastLook>1800) {
    if (phase==='meeting') aimAt(.69,1.51,dt,2.6);
    if (phase==='counter') aimAt(people.fang.x,people.fang.z,dt,2.6);
    if (walking(phase)&&travel.snapshot().mode==='following') {
      const dx=position.x-previous.x,dz=position.z-previous.z;
      if (Math.hypot(dx,dz)>.0001) aimAt(position.x+dx,position.z+dz,dt,1.1);
    }
  }
  scene.draw(camera,currentActors(phase,position,previous,dt));
  updateFollow();
  frame=requestAnimationFrame(animate);
}

ui.follow.addEventListener('click',()=>{
  const motion=travel.snapshot();
  if (motion.mode==='following') travel.pause();
  else travel.resume();
  updateFollow();
  canvas.focus({preventScroll:true});
});
ui.restart.addEventListener('click',reset);
ui.sound.addEventListener('click',()=>{
  audible=!audible;
  ui.sound.setAttribute('aria-pressed',String(audible));
  ui.sound.textContent=audible?'声音':'静音';
  if (audible) playCurrent(true);
  else stopSpeech();
});
ui.subtitle.addEventListener('click',()=>{
  if (voice.recording||voice.busy||dictation.active) return;
  if (!audible) {
    audible=true;
    ui.sound.setAttribute('aria-pressed','true');
    ui.sound.textContent='声音';
  }
  playCurrent(true);
});
ui.help.addEventListener('click',()=>{
  if (!voiceStage(stage())) return;
  if (voice.busy) voice.cancel('');
  if (dictation.cancel()) {
    ui.speak.textContent='说话';
    ui.speak.dataset.recording='false';
    sayStatus();
  }
  stopSpeech();
  const open=ui['help-options'].hidden;
  toggle(ui.help,ui['help-options'],open);
  toggle(ui.type,ui['type-form'],false);
  ui['dictation-consent'].hidden=true;
  ui['help-options'].querySelector('[data-help="answer"]').hidden=stage()!=='counter';
});
for (const button of ui['help-options'].querySelectorAll('button')) {
  button.addEventListener('click',()=>{
    const phase=stage();
    toggle(ui.help,ui['help-options'],false);
    if (button.dataset.help==='answer'&&phase==='counter') {
      if (advance('handTicket')) explain('朋友把取件单递给了芳姐。');
      return;
    }
    const text=helpText[phase]?.[button.dataset.help];
    explain(text);
    if (text) speakLocal(text,'zh-CN');
    ui.help.focus();
  });
}
ui.type.addEventListener('click',()=>{
  const open=ui['type-form'].hidden;
  toggle(ui.type,ui['type-form'],open);
  toggle(ui.help,ui['help-options'],false);
  ui['dictation-consent'].hidden=true;
  if (open) ui['voice-text'].focus();
});
ui['type-form'].addEventListener('submit',async event=>{
  event.preventDefault();
  const text=ui['voice-text'].value.trim();
  if (!text||!voiceStage(stage())||voice.busy||dictation.active) return;
  const revision=story.snapshot().revision;
  await providerCheck;
  if (story.snapshot().revision!==revision||voice.busy) return;
  if (!providerReady) {
    const normalized=text.replace(/[\s\p{P}]/gu,'');
    const action=Object.entries(shortCommands[stage()]||{}).find(([,phrases])=>phrases.includes(normalized))?.[0];
    if (action&&advance(action)) ui['voice-text'].value='';
    else sayStatus('暂时只能识别这一步的简短指令。也可以点上方选项继续。');
    return;
  }
  stopLocalSpeech();
  ui['voice-text'].value='';
  toggle(ui.type,ui['type-form'],false);
  void voice.submitText(text);
});
ui.speak.addEventListener('click',async()=>{
  if (dictation.active) {dictation.stop();return;}
  if (voice.recording) { voice.stopRecording(); return; }
  if (voice.busy||permissionPending||!voiceStage(stage())) return;
  permissionPending=true;
  try {
    if (!providerChecked) await providerCheck;
    if (!voiceStage(stage())) return;
    if (!providerReady) {
      if (dictation.supported) {
        ui['dictation-consent'].hidden=!ui['dictation-consent'].hidden;
        sayStatus('本地云语音尚未配置。');
      } else sayStatus('语音服务尚未配置，请用上方文字选项继续。');
      return;
    }
    stopLocalSpeech();
    closeExtras();
    await voice.startRecording();
  } finally { permissionPending=false; }
});
ui.dictate.addEventListener('click',()=>{
  if (!voiceStage(stage())||voice.busy) return;
  stopSpeech();
  closeExtras();
  dictation.start();
});

function endLook(event) {
  if (pointer?.id!==event.pointerId) return;
  pointer=null;
}
canvas.addEventListener('pointerdown',event=>{
  if (event.button!==0||pointer) return;
  pointer={id:event.pointerId,x:event.clientX,y:event.clientY};
  lastLook=performance.now();
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove',event=>{
  if (pointer?.id!==event.pointerId) return;
  camera.yaw-=(event.clientX-pointer.x)*.005;
  camera.pitch=Math.max(-.66,Math.min(.57,camera.pitch+(event.clientY-pointer.y)*.004));
  pointer.x=event.clientX;pointer.y=event.clientY;
  lastLook=performance.now();
});
for (const event of ['pointerup','pointercancel','lostpointercapture']) canvas.addEventListener(event,endLook);
window.addEventListener('keydown',event=>{
  const key=moves[event.key.toLowerCase()];
  if (!key||isLoading||event.altKey||event.ctrlKey||event.metaKey||event.target instanceof HTMLInputElement) return;
  if (!walking(stage())&&stage()!=='deferred') return;
  event.preventDefault();
  keys.add(key);
});
window.addEventListener('keyup',event=>keys.delete(moves[event.key.toLowerCase()]));
window.addEventListener('blur',()=>keys.clear());
for (const button of ui.direction.querySelectorAll('button')) {
  button.addEventListener('pointerdown',event=>{
    button.setPointerCapture(event.pointerId);
    keys.add(button.dataset.move);
  });
  for (const event of ['pointerup','pointercancel','lostpointercapture']) {
    button.addEventListener(event,()=>keys.delete(button.dataset.move));
  }
}
document.addEventListener('visibilitychange',()=>{
  keys.clear();
  if (document.hidden) {
    pausedForVisibility=travel.snapshot().mode==='following';
    travel.pause();
    voice.cancel('');
    if (dictation.cancel()) {
      ui.speak.textContent='说话';
      ui.speak.dataset.recording='false';
    }
    stopLocalSpeech();
  } else if (pausedForVisibility&&walking(stage())) {
    pausedForVisibility=false;
    travel.resume();
  }
});
window.addEventListener('pagehide',event=>{
  cancelAnimationFrame(frame);
  voice.cancel('');
  dictation.cancel();
  stopLocalSpeech();
  if (!event.persisted) scene?.destroy();
});
window.addEventListener('pageshow',event=>{
  if (event.persisted&&scene) {lastFrame=0;frame=requestAnimationFrame(animate);}
});
canvas.addEventListener('webglcontextlost',event=>{
  event.preventDefault();
  cancelAnimationFrame(frame);
  voice.cancel('');
  dictation.cancel();
  stopLocalSpeech();
  ui.loading.hidden=false;
  ui.loading.textContent='三维画面已中断，请刷新后继续。';
});

try {
  scene=await createFp1Scene(canvas);
  ui.loading.hidden=true;
  isLoading=false;
  renderStory();
  frame=requestAnimationFrame(animate);
} catch (error) {
  ui.loading.textContent='街景暂时无法打开，请刷新，或换用支持 WebGL 的浏览器。';
  console.error(error);
}
