import {streetVoiceIds} from './street-space.js';
import {createPracticeRecorder} from './practice-recorder.js';
import {voiceUrl} from './voice-endpoint.js';

const NPC_IDS=new Set(streetVoiceIds);
const DECISIONS=new Set(['execute','clarify','reply','reject']);
const MAX_TEXT=300,MAX_AUDIO_BYTES=2*1024*1024,SLOW_RATE=0.78;
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
const clean=value=>typeof value==='string'?value.trim():'';

function activityEvent(detail){
 if(typeof CustomEvent==='function')return new CustomEvent('voice-activity',{detail});
 if(typeof Event==='function'){const event=new Event('voice-activity');event.detail=detail;return event;}
 return null;
}

function bytesToBase64(bytes){
 let binary='';
 for(let offset=0;offset<bytes.length;offset+=8192)binary+=String.fromCharCode(...bytes.subarray(offset,offset+8192));
 return btoa(binary);
}

function base64ToBlob(value,mimeType){
  if(typeof value!=='string'||!value||value.length>Math.ceil(MAX_AUDIO_BYTES/3)*4||typeof mimeType!=='string'||!mimeType.startsWith('audio/'))throw Error('配音格式无效。');
  let binary;
  try{binary=atob(value);}catch{throw Error('配音格式无效。');}
  if(!binary.length||binary.length>MAX_AUDIO_BYTES)throw Error('配音格式无效。');
  const bytes=new Uint8Array(binary.length);
 for(let index=0;index<binary.length;index++)bytes[index]=binary.charCodeAt(index);
 return new Blob([bytes],{type:mimeType});
}

/**
 * 独立街坊对话客户端。applyAction 是唯一业务执行入口，且必须同步返回规则结果。
 * 模块不持有 DOM、世界状态或原始录音；录音仅在 startRecording() 中启动。
 */
export function createNeighborhoodVoice({
 getContext,getRevision,applyAction,matchFixedChoice,
 onLine=()=>{},onStatus=()=>{},onProgress=()=>{},onTranscript=()=>{},onActivity=()=>{},onRecording=()=>{},
 fetchImpl=globalThis.fetch?.bind(globalThis),recorder:providedRecorder=null,recorderFactory=createPracticeRecorder,
 audioFactory=url=>new Audio(url),resolveUrl=voiceUrl,
 eventTarget=typeof window==='undefined'?null:window,
 createObjectURL=blob=>URL.createObjectURL(blob),revokeObjectURL=url=>URL.revokeObjectURL(url),
 requestIdFactory=null,autoSpeak=true,requestTimeoutMs=35000,playbackTimeoutMs=44000,
}={}){
 if(typeof getContext!=='function'||typeof getRevision!=='function'||typeof applyAction!=='function')throw new TypeError('createNeighborhoodVoice 需要 getContext、getRevision、applyAction');
 if(typeof fetchImpl!=='function')throw new TypeError('createNeighborhoodVoice 需要 fetchImpl');

 let current=null,generation=0,requestCounter=0,busy=false,recording=false,speaking=false,lastLine=null;
 let playGeneration=0,playController=null,audio=null,audioUrl=null,playTimer=0;
 const speechCache=new Map();
 const histories=new Map(),handledRequests=new Set();

 const call=(fn,...args)=>{try{fn(...args);}catch{}};
 function emitActivity(){
  const detail={active:busy||recording||speaking,busy,recording,npcActive:speaking,source:'neighborhood-voice'};
  call(onActivity,detail);
  if(eventTarget&&typeof eventTarget.dispatchEvent==='function')try{const event=activityEvent(detail);if(event)eventTarget.dispatchEvent(event);}catch{}
 }
 function status(state,message=''){call(onStatus,{state,message,busy,recording,speaking});}
 function recordingChanged(value){recording=Boolean(value);call(onRecording,recording);emitActivity();}
 const recorder=providedRecorder||recorderFactory(recordingChanged);
 if(!recorder||typeof recorder.start!=='function'||typeof recorder.cancel!=='function')throw new TypeError('recorder 必须提供 start/cancel');

 function historyFor(npcId){return (histories.get(npcId)||[]).map(turn=>({...turn}));}
 function readContext(){
  const source=getContext();
  if(!source||typeof source!=='object'||!NPC_IDS.has(source.npcId)||!clean(source.name)||source.name.length>40||!clean(source.role)||source.role.length>80||!Array.isArray(source.facts)||!Array.isArray(source.allowedActions))throw Error('当前街坊上下文无效。');
  if(source.facts.length>12||source.facts.some(fact=>typeof fact!=='string'||!fact.trim()||fact.length>160))throw Error('当前街坊 facts 无效。');
  if(source.allowedActions.length>24)throw Error('当前街坊 allowedActions 无效。');
  const ids=new Set();
  const allowedActions=source.allowedActions.map(action=>{
   if(!action||typeof action!=='object'||typeof action.id!=='string'||!/^[A-Za-z][A-Za-z0-9_-]{0,47}$/.test(action.id)||ids.has(action.id)||!clean(action.label)||action.label.length>60)throw Error('当前街坊动作无效。');
   ids.add(action.id);return {id:action.id,label:action.label};
  });
  return {npcId:source.npcId,name:source.name,role:source.role,facts:[...source.facts],history:historyFor(source.npcId),allowedActions};
 }
 function readRevision(){const revision=getRevision();if(!Number.isSafeInteger(revision)||revision<0)throw Error('当前街坊 revision 无效。');return revision;}
 function rememberHandled(requestId){
  handledRequests.add(requestId);
  if(handledRequests.size>64)handledRequests.delete(handledRequests.values().next().value);
 }
 function appendExchange(attempt,line){
  const history=histories.get(attempt.context.npcId)||[];
  history.push({speaker:'player',text:attempt.playerText.slice(0,MAX_TEXT)},{speaker:'npc',text:line.text.slice(0,MAX_TEXT)});
  histories.set(attempt.context.npcId,history.slice(-6));
 }

 function cleanupPlayback(){
  clearTimeout(playTimer);playTimer=0;
  if(audio){audio.onended=null;audio.onerror=null;try{audio.pause();}catch{}audio=null;}
  if(audioUrl){try{revokeObjectURL(audioUrl);}catch{}audioUrl=null;}
 }
 function stopPlayback(){
  playGeneration++;
  try{playController?.abort();}catch{}
  playController=null;cleanupPlayback();
  const changed=speaking;speaking=false;if(changed)emitActivity();
 }

 async function postJson(path,body,attempt=null){
  const controller=new AbortController();
  if(attempt)attempt.controllers.add(controller);else playController=controller;
  const timer=setTimeout(()=>controller.abort(),requestTimeoutMs);
  try{
   const response=await fetchImpl(resolveUrl(path),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal});
   const data=await response.json().catch(()=>null);
   if(!response.ok){const message=clean(data?.error?.message).slice(0,200)||`服务暂时不可用（${response.status}）。`;throw Error(message);}
   return data;
  }catch(error){
   if(error?.name==='AbortError')throw Error('请求已取消或超时，请重试。');
   if(error instanceof TypeError)throw Error('无法连接街坊语音服务，请稍后重试。');
   throw error;
  }finally{
   clearTimeout(timer);
   if(attempt)attempt.controllers.delete(controller);
   if(playController===controller)playController=null;
  }
 }

 function abortAttempt(attempt){for(const controller of attempt?.controllers||[])try{controller.abort();}catch{}attempt?.controllers.clear();}
 function begin(kind){
  const context=readContext(),revision=readRevision();
  stopPlayback();try{recorder.cancel();}catch{}
  abortAttempt(current);
  const attempt={id:++generation,kind,context,revision,controllers:new Set(),requestId:'',playerText:''};
  current=attempt;busy=true;emitActivity();return attempt;
 }
 function failAttempt(attempt,message,code='failed'){
  if(current!==attempt)return {ok:false,error:'cancelled'};
  abortAttempt(attempt);current=null;busy=false;generation++;
  try{recorder.cancel();}catch{}
  status('error',clean(message)||'这次未能完成，请重试。');emitActivity();
  return {ok:false,error:code};
 }
 function completeAttempt(attempt){
  if(current!==attempt)return false;
  current=null;busy=false;status(speaking?'speaking':'ready',speaking?'':'准备好了。');emitActivity();return true;
 }
 function stillBound(attempt){
  if(current!==attempt)return false;
  try{return readRevision()===attempt.revision&&getContext()?.npcId===attempt.context.npcId;}catch{return false;}
 }
 function makeRequestId(attempt){
  const custom=requestIdFactory?.({generation:attempt.id,npcId:attempt.context.npcId});
  const id=custom===undefined?`nw-${Date.now().toString(36)}-${attempt.id.toString(36)}-${(++requestCounter).toString(36)}`:custom;
  if(typeof id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(id))throw Error('requestId 无效。');
  return id;
 }

 function validResponse(data,attempt,help){
  if(!data||typeof data!=='object'||Array.isArray(data))throw Error('街坊回应结构无效。');
  const allowed=new Set(['version','decision','reply','meaning','requestId','generation','revision','npcId','actionId']);
  if(Reflect.ownKeys(data).some(key=>typeof key!=='string'||!allowed.has(key)))throw Error('街坊回应包含未知字段。');
  if(data.version!==1||!DECISIONS.has(data.decision)||!clean(data.reply)||data.reply.length>240||typeof data.meaning!=='string'||!data.meaning.trim()||data.meaning.length>300)throw Error('街坊回应内容无效。');
  if(data.requestId!==attempt.requestId||data.generation!==attempt.id||data.revision!==attempt.revision||data.npcId!==attempt.context.npcId)throw Error('街坊回应绑定已失效。');
  if(!stillBound(attempt))throw Error('街坊、场景或 revision 已变化，回应已丢弃。');
  if(handledRequests.has(attempt.requestId))throw Error('重复回应已丢弃。');
  if(data.decision==='execute'){
   if(help||typeof data.actionId!=='string'||!readContext().allowedActions.some(action=>action.id===data.actionId))throw Error('动作不在当前允许范围内。');
  }else if(own(data,'actionId'))throw Error('纯文字回应不得携带动作。');
 }

 function acceptLine(attempt,data,line){
  if(!clean(line.text)||typeof line.meaning!=='string')return failAttempt(attempt,'规则未返回可用字幕，未采用模型话术。','invalid_rule_line');
  const saved={npcId:attempt.context.npcId,text:line.text,meaning:line.meaning};
  appendExchange(attempt,saved);lastLine=saved;
  // 先给 UI 字幕，再开始任何配音；execute 的字幕只能来自规则结果。
  call(onLine,{text:saved.text,meaning:saved.meaning});
  if(current!==attempt)return {ok:false,error:'cancelled'};
  completeAttempt(attempt);
  if(autoSpeak)void playLine(saved,1);
  return {ok:true,decision:data.decision,actionId:data.actionId,text:saved.text,meaning:saved.meaning};
 }

 async function interpret(attempt,text,help){
  if(!stillBound(attempt))return failAttempt(attempt,'街坊或场景已变化，请重新表达。','stale');
  attempt.playerText=text;attempt.requestId=makeRequestId(attempt);
  // Some encounters have one authored response. Recognize its spoken option
  // locally, using the same recording/ASR lifecycle as the other street NPCs.
  const fixed=matchFixedChoice?.(attempt.context,text);
  if(fixed){
   if(!fixed.actionId)return acceptLine(attempt,{decision:'clarify'},fixed);
   const rule=applyAction(fixed.actionId);
   if(!rule?.ok)return failAttempt(attempt,'当前还不能这样做。','rule_failed');
   return acceptLine(attempt,{decision:'execute',actionId:fixed.actionId},rule);
  }
  const context={...attempt.context,history:historyFor(attempt.context.npcId),allowedActions:help?[]:attempt.context.allowedActions};
  const request={version:1,text,requestId:attempt.requestId,generation:attempt.id,revision:attempt.revision,context};
  status('interpreting',help?'正在准备解释…':'正在理解…');
  let data;
  try{data=await postJson('/api/world/interpret',request,attempt);}catch(error){return failAttempt(attempt,error.message,'network');}
  if(current!==attempt)return {ok:false,error:'cancelled'};
  try{validResponse(data,attempt,help);}catch(error){return failAttempt(attempt,error.message,'invalid_response');}
  rememberHandled(attempt.requestId);
  if(data.decision!=='execute')return acceptLine(attempt,data,{text:data.reply,meaning:data.meaning});

  // 只把 actionId 交给规则；模型 reply/meaning 在 execute 路径永远不会成为成功字幕。
  let rule;
  try{rule=applyAction(data.actionId);}catch{return failAttempt(attempt,'当前规则未能执行这个动作，请换一种说法。','rule_failed');}
  if(!rule||rule.ok!==true){
   const message=clean(rule?.text)||'当前规则不允许这个动作，尚未执行。';
   return failAttempt(attempt,message,'rule_failed');
  }
  return acceptLine(attempt,data,{text:rule.text,meaning:typeof rule.meaning==='string'?rule.meaning:''});
 }

 async function submit(raw,help){
  const text=clean(raw);
  if(!text||text.length>MAX_TEXT){status('error',`请输入 1–${MAX_TEXT} 字。`);return {ok:false,error:'invalid_input'};}
  if(busy)return {ok:false,error:'busy'};
  let attempt;
  try{attempt=begin(help?'help':'text');}catch(error){status('error',error.message);return {ok:false,error:'invalid_context'};}
  return interpret(attempt,text,help);
 }

 async function transcribeRecording(attempt,blob){
  status('transcribing','正在识别粤语…');
  try{
   if(!blob||typeof blob.arrayBuffer!=='function'||blob.size>MAX_AUDIO_BYTES)throw Error('录音无效或超过大小上限。');
   const mimeType=String(blob.type||'').split(';')[0].toLowerCase();
   if(!/^audio\/(wav|x-wav|wave|mpeg|mp3|webm|ogg|mp4|m4a|flac)$/.test(mimeType))throw Error('录音格式不受支持。');
   const audioBase64=bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
   if(current!==attempt)return;
   const data=await postJson('/api/voice/transcribe',{audioBase64,mimeType},attempt);
   if(current!==attempt)return;
   const text=clean(data?.text);
   if(!text||text.length>MAX_TEXT)throw Error('没有听清楚，或识别文字超过 300 字。');
   call(onTranscript,text);
   await interpret(attempt,text,false);
  }catch(error){failAttempt(attempt,error.message,'asr_failed');}
 }

 async function startRecording(){
  if(busy)return false;
  let attempt;
  try{attempt=begin('voice');}catch(error){status('error',error.message);return false;}
  status('opening','正在准备录音…');
  try{
   await recorder.start('neighborhood',{
    score:false,
    onState:state=>{
     if(current!==attempt)return;
     if(state==='recording')status('recording','录音中，最长 15 秒。');
     else if(state==='preparing')status('preparing','正在整理录音…');
    },
    onProgress:progress=>{if(current===attempt)call(onProgress,{stage:'recording',seconds:progress?.seconds||0,level:progress?.level||0});},
    onRecorded:blob=>{if(current===attempt)void transcribeRecording(attempt,blob);},
    onError:message=>{failAttempt(attempt,typeof message==='string'?message:'录音失败，请重试。','recording_failed');},
   });
   return current===attempt;
  }catch(error){failAttempt(attempt,error?.message,'recording_failed');return false;}
 }

 function stopRecording(){
  if(!recording||typeof recorder.stop!=='function')return false;
  try{recorder.stop();status('preparing','正在整理录音…');return true;}catch{return false;}
 }

 async function playLine(line,rate){
  if(!line||busy||line.npcId!==getContext()?.npcId)return false;
  stopPlayback();const id=playGeneration;speaking=true;status('speaking',rate<1?'正在慢速播放…':'正在播放回应…');emitActivity();
  playTimer=setTimeout(()=>{if(id!==playGeneration)return;stopPlayback();status('error','配音等待超时，请重听。');},playbackTimeoutMs);
  try{
   const key=line.npcId+'|'+line.text;
   let clip=speechCache.get(key);
   if(!clip){
    const data=await postJson('/api/voice/speak',{text:line.text.slice(0,500),npcId:line.npcId});
    if(id!==playGeneration)return false;
    clip=base64ToBlob(data?.audioBase64,data?.mimeType);
    if(speechCache.size>=16)speechCache.delete(speechCache.keys().next().value);
    speechCache.set(key,clip);
   }
   audioUrl=createObjectURL(clip);audio=audioFactory(audioUrl);
   audio.preservesPitch=true;audio.playbackRate=rate;
   audio.onended=()=>{if(id!==playGeneration)return;stopPlayback();if(!busy)status('ready','播放完成。');};
   audio.onerror=()=>{if(id!==playGeneration)return;stopPlayback();status('error','配音播放失败，请重试。');};
   await audio.play();
   return id===playGeneration;
  }catch(error){
   if(id!==playGeneration)return false;
   stopPlayback();status('error',error?.name==='NotAllowedError'?'浏览器拒绝播放，请再按一次重听。':error.message||'配音失败，请重试。');return false;
  }
 }

 function setLine(line){
  const npcId=line?.npcId,text=clean(line?.text),meaning=clean(line?.meaning);
  let currentNpc;
  try{currentNpc=getContext()?.npcId;}catch{return false;}
  if(!NPC_IDS.has(npcId)||npcId!==currentNpc||!text||!meaning)return false;
  // Only replace the replay subtitle; never abort an interpretation attempt or write history.
  stopPlayback();lastLine={npcId,text,meaning};return true;
 }

 function replayLine(rate){
  if(busy||!lastLine||lastLine.npcId!==getContext()?.npcId){status('error','当前没有可重听的街坊回应。');return Promise.resolve(false);}
  return playLine(lastLine,rate);
 }

 function cancel(message='已取消当前街坊对话。'){
  generation++;abortAttempt(current);current=null;busy=false;
  try{recorder.cancel();}catch{}
  recording=false;stopPlayback();status('cancelled',message);emitActivity();return true;
 }

 return {
  submitText:text=>submit(text,false),
  help:text=>submit(text,true),
  startRecording,stopRecording,setLine,
  replay:()=>replayLine(1),
  replaySlow:()=>replayLine(SLOW_RATE),
  stopAudio(){const had=Boolean(speaking||audio||playController);stopPlayback();if(!busy)status('ready','已停止配音。');return had;},
  cancel,
  reset(){cancel('已重开街坊对话。');histories.clear();handledRequests.clear();lastLine=null;return true;},
  importHistory(value){
   cancel('已取消当前对话，准备恢复历史。');lastLine=null;
   try{
    const exactObject=(input,fields)=>{
     if(!input||typeof input!=='object'||Array.isArray(input))throw Error('invalid history object');
     const prototype=Object.getPrototypeOf(input);
     if(prototype!==Object.prototype&&prototype!==null)throw Error('invalid history prototype');
     const allowed=new Set(fields),keys=Reflect.ownKeys(input);
     if(keys.some(key=>typeof key!=='string'||!allowed.has(key)||!Object.prototype.propertyIsEnumerable.call(input,key))||fields.some(key=>!own(input,key)))throw Error('invalid history fields');
     return input;
    };
    const plainArray=(input,maxLength)=>{
     if(!Array.isArray(input)||Object.getPrototypeOf(input)!==Array.prototype||input.length>maxLength)throw Error('invalid history array');
     for(let index=0;index<input.length;index++)if(!own(input,String(index)))throw Error('sparse history array');
     const keys=Reflect.ownKeys(input);
     if(keys.some(key=>key!=='length'&&(typeof key!=='string'||!/^(0|[1-9][0-9]*)$/.test(key)||Number(key)>=input.length||!Object.prototype.propertyIsEnumerable.call(input,key))))throw Error('invalid history array fields');
     return input;
    };
    exactObject(value,['version','npcs']);
    if(value.version!==1)throw Error('invalid history version');
    const npcs=plainArray(value.npcs,NPC_IDS.size),restored=new Map();
    for(const entry of npcs){
     exactObject(entry,['npcId','history']);
     if(!NPC_IDS.has(entry.npcId)||restored.has(entry.npcId))throw Error('invalid or duplicate npc');
     const history=plainArray(entry.history,6).map(turn=>{
      exactObject(turn,['speaker','text']);
      if(!['npc','player'].includes(turn.speaker)||typeof turn.text!=='string'||!turn.text.trim()||turn.text.length>MAX_TEXT)throw Error('invalid history turn');
      return {speaker:turn.speaker,text:turn.text};
     });
     restored.set(entry.npcId,history);
    }
    histories.clear();for(const [npcId,history] of restored)histories.set(npcId,history);
    return {ok:true};
   }catch{return {ok:false,error:'invalid_history'};}
  },
  getHistory(){return historyFor(getContext()?.npcId);},
  exportHistory(){return {version:1,npcs:[...histories].map(([npcId,history])=>({npcId,history:history.map(turn=>({...turn}))}))};},
  get busy(){return busy;},get recording(){return recording;},get speaking(){return speaking;},
 };
}
