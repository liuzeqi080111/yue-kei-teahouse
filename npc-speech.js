import {voiceUrl} from './voice-endpoint.js';
// One current utterance, tied to the visible NPC. Mouth animation stays disabled.
export function createNpcSpeech({onActivity=()=>{},onState=()=>{},onSettled=()=>{},onLevel=()=>{}}={}){
 let current='',audio=null,url=null,controller=null,generation=0,muted=false,active=false,tick=0,deadline=0;
 const cache=new Map();
 function cleanup(){clearInterval(tick);clearTimeout(deadline);tick=deadline=0;if(audio){audio.onended=null;audio.onerror=null;audio.pause();audio=null;}if(url)URL.revokeObjectURL(url);url=null;onLevel(0);}
 function stop(){generation++;controller?.abort();controller=null;cleanup();current='';active=false;onActivity();}
 async function speak(text,{rate=1}={}){
  if(muted||!text||text===current)return;stop();text=String(text).slice(0,500);current=text;const id=generation;active=true;onActivity();onState('準備阿明語音…');
  const finish=()=>{if(id!==generation)return;cleanup();current='';controller=null;active=false;onActivity();onSettled(text);onState('準備好');};
  deadline=setTimeout(()=>{controller?.abort();finish();onState('語音逾時，請按重播。');},44000);
  try{
   let data=cache.get(text);
   if(!data){controller=new AbortController();const res=await fetch(voiceUrl('/api/voice/speak'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text}),signal:controller.signal});if(!res.ok)throw Error('tts');data=await res.json();if(id!==generation)return;cache.set(text,data);if(cache.size>24)cache.delete(cache.keys().next().value);}
   const bytes=Uint8Array.from(atob(data.audioBase64),c=>c.charCodeAt(0));
   if(id!==generation||muted)return;
   url=URL.createObjectURL(new Blob([bytes],{type:data.mimeType||'audio/wav'}));audio=new Audio(url);
   audio.playbackRate=Number.isFinite(rate)?Math.max(.65,Math.min(1,rate)):1;audio.preservesPitch=true;
   audio.onended=finish;audio.onerror=()=>{finish();onState('聲音播放失敗，字幕保留，可按重播再試。');};
   await audio.play();if(id!==generation)return;onState('阿明說話中');

  }catch{if(id!==generation)return;finish();onState('聲音播放失敗，字幕保留，可按重播再試。');}
 }
 return {speak,stop,get active(){return active;},setMuted(value){muted=value;if(value)stop();}};
}
