import {NPC_VOICE_CLIPS} from './npc-voice-manifest.js';
import {voiceUrl} from './voice-endpoint.js';

export const hasLocalVoice=text=>Object.hasOwn(NPC_VOICE_CLIPS,String(text||'').trim());
export async function loadVoiceClip(text,{signal}={}){
 const file=NPC_VOICE_CLIPS[String(text).trim()];
 if(file){
  try{
   const res=await fetch(new URL(file,import.meta.url),{signal});
   if(!res.ok)throw Error('local');
   const blob=await res.blob();if(blob.size<44)throw Error('local');
   return blob;
  }catch(e){if(signal?.aborted)throw e; /* Missing assets may use online TTS. */}
 }
 const res=await fetch(voiceUrl('/api/voice/speak'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text}),signal});
 if(!res.ok){const error=Error('generation');error.code='VOICE_GENERATION';throw error;}
 const data=await res.json();
 if(typeof data.audioBase64!=='string'||!data.audioBase64)throw Error('audio');
 const bytes=Uint8Array.from(atob(data.audioBase64),c=>c.charCodeAt(0));
 return new Blob([bytes],{type:data.mimeType||'audio/wav'});
}
export function voiceFailure(error){
 if(error?.name==='NotAllowedError')return '浏览器暂未允许播放，请点“更多→重播”再试。';
 if(error?.name==='NotSupportedError'||error?.code==='VOICE_MEDIA')return '音频无法播放，请点“更多→重播”重新加载。字幕仍保留。';
 return '在线配音暂时失败，请点“更多→重播”重试。字幕仍保留。';
}
