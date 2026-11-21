import {NPC_VOICE_CLIPS,NPC_SPEECH_CUES} from './npc-voice-manifest.js';
import {voiceUrl} from './voice-endpoint.js';

const localFile=new WeakMap(),clockScale=new WeakMap();

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
   const tuned=new Blob([header,blob.slice(header.byteLength)],{type:'audio/wav'});
   // The modified WAV's media seconds are longer or shorter than the source.
   clockScale.set(tuned,profile.register);
   if(localFile.has(blob))localFile.set(tuned,localFile.get(blob));
   return {blob:tuned,rate:profile.tempo/profile.register};
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

// Jaw, rounding, spread and upper tooth exposure. Rhubarb's A and X are
// bilabial closure and silence respectively. Keep both completely closed.
export const mouthShapes={
 A:[0,0,0,0],B:[.30,0,.7,.90],C:[.66,.05,.36,.75],D:[1,0,.04,.52],
 E:[.62,.57,0,.43],F:[.43,1,0,.12],G:[.31,.04,.15,1],H:[.57,0,.18,.66],X:[0,0,0,0],
};
function cuePose(timing,time){
 const [starts,shapes]=timing;
 let low=0,high=shapes.length;
 while(low+1<high){
  const middle=(low+high)>>>1;
  if(starts[middle]<=time)low=middle;else high=middle;
 }
 const current=mouthShapes[shapes[low]];
 if(!current||time>=starts[shapes.length])return mouthShapes.X;
 const next=mouthShapes[shapes[low+1]];
 if(!next)return current;
 // Preserve closure at its first frame, and ease into the next gesture near
 // the boundary. A short closure still gets time at its full shape.
 const ramp=Math.min(3,(starts[low+1]-starts[low])*.4);
 const blend=ramp>0?Math.max(0,1-(starts[low+1]-time)/ramp):0;
 return blend?current.map((value,index)=>value+(next[index]-value)*blend):current;
}

// Sample the same media clock at normal speed and during slow replay.
export function followSpeech(audio,blob,onLevel,file=localFile.get(blob)){
 let closed=false,frame=0,signal,level=0,previousTime=-1;
 const timing=file?NPC_SPEECH_CUES[file.split("/").pop()]:undefined;
 const scale=clockScale.get(blob)??1;
 const decode=async()=>{
  const bytes=await blob.arrayBuffer();
  const v=new DataView(bytes);
  if(bytes.byteLength>=44&&v.getUint32(0)===0x52494646&&v.getUint32(8)===0x57415645){
   let hz=0,channels=0;
   for(let i=12;i+8<=bytes.byteLength;){
    const type=v.getUint32(i),size=v.getUint32(i+4,true);
    if(type===0x666d7420&&i+24<=bytes.byteLength&&v.getUint16(i+8,true)===1&&v.getUint16(i+22,true)===16){
     hz=v.getUint32(i+12,true);channels=v.getUint16(i+10,true);
    }
    if(type===0x64617461&&hz&&channels){
     const length=Math.floor(Math.min(size,bytes.byteLength-i-8)/(2*channels));
     return {hz,length,at:index=>v.getInt16(i+8+index*channels*2,true)/32768};
    }
    i+=8+size+(size%2);
   }
  }
  const Decoder=globalThis.OfflineAudioContext||globalThis.webkitOfflineAudioContext;
  if(!Decoder)return null;
  const decoded=await new Decoder(1,1,22050).decodeAudioData(bytes);
  const values=decoded.getChannelData(0);
  return {hz:decoded.sampleRate,length:values.length,at:index=>values[index]};
 };
 void decode().then(value=>{signal=value;}).catch(()=>{});
 function sample(){
  if(closed)return;
  frame=requestAnimationFrame(sample);
  const time=audio.currentTime||0;
  if(audio.paused||audio.ended){
   if(previousTime!==-1){level=0;previousTime=-1;onLevel(0,mouthShapes.X);}
   return;
  }
  if(time===previousTime)return;
  previousTime=time;
  let raw=timing?1:0,shape=mouthShapes.C;
  if(signal){
   const {hz,length,at}=signal;
   const start=Math.max(0,Math.floor((time-.009)*hz));
   const end=Math.min(length,start+Math.floor(hz*.027));
   let total=0,edges=0,last=0;
   for(let i=start;i<end;i+=2){
    const x=at(i);
    total+=x*x;
    edges+=(x-last)**2;
    last=x;
   }
   const power=Math.sqrt(total/Math.max(1,Math.ceil((end-start)/2)));
   raw=Math.max(0,Math.min(1,(power-.009)*8));
   const brightness=Math.sqrt(edges/Math.max(.00001,total));
   // For streamed lines without cue metadata, frication, voiced energy
   // and silence supply an approximate articulation synchronized to PCM.
   shape=brightness>.40&&raw<.64?mouthShapes.B:brightness<.17?mouthShapes.E:raw>.55?mouthShapes.D:mouthShapes.C;
  }
  level=raw===0?0:level+(raw-level)*(raw>level?.64:.42);
  if(timing)shape=cuePose(timing,time*scale*100);
  onLevel(level,shape);
 }
 frame=requestAnimationFrame(sample);
 return ()=>{closed=true;cancelAnimationFrame(frame);onLevel(0,mouthShapes.X);};
};
