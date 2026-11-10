import {loadVoiceClip,voiceFailure} from './voice-clips.js';
// One current utterance, tied to the visible NPC. Mouth animation stays disabled.
export function createNpcSpeech({onActivity=()=>{},onState=()=>{},onSettled=()=>{},onLevel=()=>{}}={}){
 let current='',audio=null,url=null,controller=null,generation=0,muted=false,active=false,tick=0,deadline=0;
 const cache=new Map();
 function cleanup(){clearInterval(tick);clearTimeout(deadline);tick=deadline=0;if(audio){audio.onended=null;audio.onerror=null;audio.pause();audio=null;}if(url)URL.revokeObjectURL(url);url=null;onLevel(0);}
 function stop(){generation++;controller?.abort();controller=null;cleanup();current='';active=false;onActivity();}
 async function speak(text,{rate=1}={}){
  if(muted||!text||text===current)return;stop();text=String(text).slice(0,500);current=text;const id=generation;active=true;onActivity();onState('準備阿明語音…');
  let settled=false;
  const finish=(message='準備好')=>{if(id!==generation||settled)return;settled=true;cleanup();current='';controller=null;active=false;onActivity();onState(message);onSettled(text);};
  deadline=setTimeout(()=>{if(id!==generation)return;controller?.abort();finish('配音等待超时，请点“更多→重播”重试。');},44000);
  try{
   let clip=cache.get(text);
   if(!clip){controller=new AbortController();clip=await loadVoiceClip(text,{signal:controller.signal});if(id!==generation||settled)return;cache.set(text,clip);if(cache.size>32)cache.delete(cache.keys().next().value);}
   if(id!==generation||settled||muted)return;
   url=URL.createObjectURL(clip);audio=new Audio(url);
   audio.playbackRate=Number.isFinite(rate)?Math.max(.65,Math.min(1,rate)):1;audio.preservesPitch=true;
   audio.onended=()=>finish();audio.onerror=()=>{if(id!==generation)return;cache.delete(text);finish(voiceFailure({code:'VOICE_MEDIA'}));};
   await audio.play();if(id!==generation||settled)return;onState('阿明說話中');

  }catch(error){if(id!==generation)return;cache.delete(text);finish(voiceFailure(error));}
 }
 return {speak,stop,get active(){return active;},setMuted(value){muted=value;if(value)stop();}};
}
