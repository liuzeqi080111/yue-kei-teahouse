import {NPC_VOICE_CLIPS} from './npc-voice-manifest.js';
import {voiceUrl} from './voice-endpoint.js';

// Base voice, vocal register and speaking tempo for the displayed cast.
// The guide speaks Mandarin. The neighbours and shopkeepers speak Cantonese.
const cast={
 intro:['Ethan',1,1], qing:['Kiki',1.03,1.02], fang:['Kiki',.92,.96],
 ming:['Rocky',.84,.97], guest:['Rocky',.93,.96], lam:['Rocky',.86,.87],
 lok:['Rocky',1.05,1.04], buyer:['Kiki',1,1], ling:['Kiki',.96,1.03],
 juiceCart:['Rocky',.95,1.02], westBread:['Kiki',.95,.98], eastBread:['Rocky',.88,.91],
 radio:['Rocky',.96,.97], herbs:['Kiki',.87,.89], arcade:['Rocky',.86,.93],
 marketBack:['Kiki',.94,.98], riceCorner:['Rocky',.90,.98], banyanCloth:['Kiki',.91,.92],
 lanePrint:['Rocky',.91,.94], southPrint:['Rocky',1.03,1.02], southRice:['Rocky',.85,.89],
 southCloth:['Kiki',.98,.98], eastPrint:['Rocky',.90,.95], eastRice:['Kiki',.95,1.01],
 westCorner:['Kiki',.88,.94], workshop:['Rocky',.98,1.01], gardenHomes:['Kiki',.86,.90],
 northTurn:['Rocky',.96,1.04], eastTurn:['Kiki',.93,.96],
};
export function characterVoice(id){
 if(!Object.hasOwn(cast,id))return null;
 const [voice,register,tempo]=cast[id];
 return {voice,register,tempo};
}

// Shift the source register once, then let the audio element preserve that
// register at both normal and teaching speeds. Only the WAV header is copied.
export async function prepareVoiceRecording(blob,id){
 const profile=characterVoice(id);
 if(!profile||profile.register===1)return {blob,rate:profile?.tempo??1};
 const header=await blob.slice(0,4096).arrayBuffer();
 const view=new DataView(header);
 if(view.byteLength<44||view.getUint32(0)!==0x52494646||view.getUint32(8)!==0x57415645)return {blob,rate:profile.tempo};
 for(let offset=12;offset+24<=view.byteLength;){
  const size=view.getUint32(offset+4,true);
  if(view.getUint32(offset)===0x666d7420&&size>=16){
   const hz=Math.round(view.getUint32(offset+12,true)*profile.register);
   view.setUint32(offset+12,hz,true);
   view.setUint32(offset+16,hz*view.getUint16(offset+20,true),true);
   return {blob:new Blob([header,blob.slice(header.byteLength)],{type:'audio/wav'}),rate:profile.tempo/profile.register};
  }
  offset+=8+size+(size%2);
 }
 return {blob,rate:profile.tempo};
}

// Published previews can use an earlier voice backend. Give it the role of
// a matching base voice while identifying the actual character to current servers.
export function speechRequest(text,speakerId){
 if(!speakerId)return {text};
 const baseRole={Rocky:'guest',Kiki:'fang',Ethan:'lok'};
 const previous={qing:'Kiki',fang:'Kiki',ling:'Kiki',buyer:'Kiki',guest:'Rocky',lam:'Rocky'};
 const voice=characterVoice(speakerId)?.voice;
 return {text,speakerId,npcId:previous[speakerId]===voice?speakerId:baseRole[voice]};
}

export const hasLocalVoice=text=>Object.hasOwn(NPC_VOICE_CLIPS,String(text||'').trim());
export async function loadVoiceClip(text,{signal,npcId}={}){
 const file=NPC_VOICE_CLIPS[String(text).trim()];
 if(file){
  try{
   const res=await fetch(new URL(file,import.meta.url),{signal});
   if(!res.ok)throw Error('local');
   const blob=await res.blob();if(blob.size<44)throw Error('local');
   return blob;
  }catch(e){if(signal?.aborted)throw e; /* Missing assets may use online TTS. */}
 }
 const res=await fetch(voiceUrl('/api/voice/speak'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(speechRequest(text,npcId)),signal});
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
