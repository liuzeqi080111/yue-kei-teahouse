import {loadVoiceClip} from './voice-clips.js';
import {systemText} from './ui-language.js';

const TIMEOUT_MS=30000,SLOW_RATE=0.65,CACHE_LIMIT=24;
const clean=text=>String(text||'').trim().slice(0,500);

/** 保留标点分句；没有分句时仍可作为一整句跟读。 */
export function splitPracticeSentence(text){
 const value=clean(text);
 if(!value)return [];
 return (value.match(/[^，。！？；,.!?;]+[，。！？；,.!?;]?/g)||[value]).map(part=>part.trim()).filter(Boolean);
}

/**
 * 独立练习播放器：只读学习引导和游戏快照，不派发游戏动作，也不接触 NPC 的离场 hold。
 * 云端仍使用原有 {text} TTS 请求；同一文本只缓存一份音频，慢速由浏览器保音高播放。
 */
export function createPracticeAudio({getSnapshot,getPractice,enabled=true}={}){
 if(typeof getSnapshot!=='function'||typeof getPractice!=='function')throw new TypeError('createPracticeAudio 需要 getSnapshot 与 getPractice');
 const cache=new Map();
 let generation=0,audio=null,url=null,controller=null,deadline=0,active=false;
 let current={key:'',example:'',parts:[],npcText:''},contextKey='',sourceKind='',status='';
 let follow=false,fullText='',parts=[],partIndex=0,rate=1;
 let voiceState={active:false,npcActive:false,recording:false,busy:false};

 function emit(){
  window.dispatchEvent(new CustomEvent('practice-activity',{detail:{active,source:'practice'}}));
 }
 function blockedMessage(){
  if(voiceState.npcActive)return '请等阿明说完，再听示范。';
  if(voiceState.recording)return '录音期间不能播放示范；停止录音后再试。';
  if(voiceState.busy)return '语音处理中，完成后再试听。';
  return '';
 }
 function paint(){
  document.querySelectorAll('[data-learning-guide]').forEach(guide=>{
   const controls=guide.querySelector('[data-practice-controls]');
   if(controls)controls.hidden=!enabled;
   const hasExample=Boolean(current.example),hasNpc=Boolean(current.npcText);
   guide.querySelectorAll('[data-practice-action]').forEach(button=>{
    const action=button.dataset.practiceAction;
    button.disabled=(action==='npc-slow'?!hasNpc:!hasExample);
    if(action==='normal')button.textContent=follow?'正常分句':'试听';
    if(action==='slow')button.textContent=follow?'慢速分句':'慢速试听';
    if(action==='follow')button.textContent=follow?'从頭跟读':'跟读';
    if(action==='next'){
     button.hidden=!follow;
     button.disabled=!follow||partIndex>=parts.length-1;
    }
    if(action==='whole'){
     button.hidden=!follow;
     button.disabled=!follow;
    }
    if(action==='stop'){
     button.hidden=!(active||follow);
     button.disabled=false;
    }
   });
  });
  document.querySelectorAll('[data-practice-status]').forEach(result=>{
   result.textContent=enabled?systemText(status):'';result.hidden=!enabled||!status;
  });
 }
 function cleanup(){
  clearTimeout(deadline);deadline=0;
  if(audio){audio.onended=null;audio.onerror=null;audio.pause();audio=null;}
  if(url)URL.revokeObjectURL(url);url=null;
 }
 function cancel({message='',keepFollow=false}={}){
  generation++;controller?.abort();controller=null;cleanup();active=false;
  if(!keepFollow){follow=false;fullText='';parts=[];partIndex=0;rate=1;sourceKind='';}
  status=message;emit();paint();
 }
 function settle(id,message){
  if(id!==generation)return;
  generation++;controller=null;cleanup();active=false;status=message;emit();paint();
 }
 function partStatus(prefix=''){
  const next=partIndex<parts.length-1?'准备好再按「下一句」。':'可按「整句」再听一次。';
  return `${prefix}第 ${partIndex+1}/${parts.length} 句：「${parts[partIndex]}」。听完可自行录音，${next}`;
 }

 async function playText(value,playbackRate){
  const text=clean(value);
  if(!enabled||!text)return;
  const blocked=blockedMessage();
  if(blocked){cancel({message:blocked});return;}
  cancel({keepFollow:true});
  const id=generation;
  active=true;rate=playbackRate;status='准备示范音…';emit();paint();
  deadline=setTimeout(()=>{controller?.abort();settle(id,'示范音逾时，请重试。');},TIMEOUT_MS);
  try{
   let clip=cache.get(text);
   if(!clip){
    const ctrl=new AbortController();controller=ctrl;
    clip=await loadVoiceClip(text,{signal:ctrl.signal});
    if(id!==generation)return;
    cache.set(text,clip);if(cache.size>CACHE_LIMIT)cache.delete(cache.keys().next().value);
   }
   controller=null;
   if(id!==generation)return;
   url=URL.createObjectURL(clip);
   audio=new Audio(url);
   audio.playbackRate=playbackRate;
   audio.preservesPitch=true;audio.mozPreservesPitch=true;audio.webkitPreservesPitch=true;
   audio.onended=()=>settle(id,follow?partStatus():'试听完成。');
   audio.onerror=()=>{if(id!==generation)return;cache.delete(text);settle(id,'示范音播放失败，请重试。');};
   await audio.play();
   if(id!==generation)return;
   status=follow?partStatus('正在播放：'):playbackRate<1?'正在慢速试听。':'正在试听。';paint();
  }catch(error){
   if(id!==generation)return;
   cache.delete(text);
   const message=error?.name==='NotAllowedError'?'浏览器拒絕播放，请再按一次试听。':'示范音连接或播放失敗，请检查网絡后重试。';
   settle(id,message);
  }
 }

 function playPart(nextRate){
  if(!follow||!parts[partIndex])return;
  playText(parts[partIndex],nextRate);
 }
 function startFollow(){
  const text=clean(current.example);if(!text)return;
  fullText=text;parts=current.parts.length?[...current.parts]:splitPracticeSentence(text);partIndex=0;follow=true;rate=1;
  playText(parts[0],rate);
 }
 function handle(action,source){
  if(!enabled)return;
  const kind=source?.classList.contains('learning-guide-panel')?'panel':'scene';
  if(action==='stop'){cancel({message:'已停止练习。'});return;}
  if(action==='npc-slow'){
   follow=false;parts=[];partIndex=0;fullText=clean(current.npcText);sourceKind=kind;
   playText(fullText,SLOW_RATE);return;
  }
  if(!current.example)return;
  if(action==='follow'){sourceKind=kind;startFollow();return;}
  if(action==='next'){
   if(!follow)return;
   if(partIndex>=parts.length-1){status='已经是最后一句，可以听完整句子。';paint();return;}
   partIndex++;sourceKind=kind;playPart(rate);return;
  }
  if(action==='whole'){
   if(!follow)return;
   const text=fullText,nextRate=rate;follow=false;parts=[];partIndex=0;sourceKind=kind;
   playText(text,nextRate);return;
  }
  if(action==='normal'||action==='slow'){
   const nextRate=action==='slow'?SLOW_RATE:1;sourceKind=kind;
   if(follow){rate=nextRate;playPart(nextRate);}
   else{fullText=clean(current.example);parts=[];partIndex=0;playText(fullText,nextRate);}
  }
 }

 function sync(snapshot){
  const next=getPractice()||{key:'',example:'',parts:[],npcText:''};
  const nextKey=JSON.stringify([snapshot?.state?.round,snapshot?.state?.phase,next.key||'']);
  const changed=Boolean(contextKey&&nextKey!==contextKey);
  const open=['menu','bill'].includes(snapshot?.view?.camera);
  const sourceGone=(sourceKind==='panel'&&!open)||(sourceKind==='scene'&&open);
  current={key:next.key||'',example:clean(next.example),parts:Array.isArray(next.parts)?next.parts.map(clean).filter(Boolean):[],npcText:clean(next.npcText)};
  if((changed||sourceGone)&&(active||follow))cancel({message:'階段或面板已切换，练习已停止。'});
  else if(changed)status='';
  contextKey=nextKey;paint();
 }
 function onVoice(event){
  const detail=event.detail||{};if(detail.source==='practice')return;
  voiceState={active:Boolean(detail.active),npcActive:Boolean(detail.npcActive),recording:Boolean(detail.recording),busy:Boolean(detail.busy)};
  if((voiceState.npcActive||voiceState.recording||voiceState.busy)&&active){
   const message=voiceState.npcActive?'阿明开始说话，练习已停止。':voiceState.recording?'录音开始，示范已停止。':'语音处理开始，示范已停止。';
   cancel({message,keepFollow:follow});
  }else paint();
 }
 function onHide(){cancel();}
 window.addEventListener('voice-activity',onVoice);
 window.addEventListener('pagehide',onHide);
 paint();
 return {
  handle,sync,
  preview(text,source='scene'){
   if(!enabled)return;
   follow=false;parts=[];partIndex=0;fullText=clean(text);sourceKind=source==='review'?'review':'scene';
   playText(fullText,1);
  },
  stop:()=>cancel({message:'已停止练习。'}),
  destroy(){window.removeEventListener('voice-activity',onVoice);window.removeEventListener('pagehide',onHide);cancel();},
  get active(){return active;}
 };
}
