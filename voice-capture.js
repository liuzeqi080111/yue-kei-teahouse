/** Preserve quiet speech. Local amplitude cannot reliably distinguish speech from noise.
 * Only empty/too-short/digitally silent recordings are rejected; ASR judges content.
 */
export function preparePcm(samples,sampleRate=16000){
 const result=(data,valid,reason,gain=1)=>{let peak=0,sum=0;for(const x of data){peak=Math.max(peak,Math.abs(x));sum+=x*x;}return {samples:data,peak,rms:Math.sqrt(sum/Math.max(1,data.length)),duration:data.length/16000,valid,reason,gain};};
 if(!(samples instanceof Float32Array)||!Number.isFinite(sampleRate)||sampleRate<=0)return result(new Float32Array(),false,'invalid_input');
 if(!samples.length)return result(samples.slice(),false,'empty');
 const data=new Float32Array(Math.round(samples.length*16000/sampleRate));
 let mean=0;for(const x of samples)mean+=Number.isFinite(x)?x:0;mean/=samples.length;
 let peak=0,sum=0;
 for(let i=0;i<data.length;i++){const pos=Math.min(samples.length-1,i*sampleRate/16000),a=Math.floor(pos),b=Math.min(samples.length-1,a+1);const v=((Number.isFinite(samples[a])?samples[a]:0)*(1-pos+a)+(Number.isFinite(samples[b])?samples[b]:0)*(pos-a))-mean;data[i]=v;peak=Math.max(peak,Math.abs(v));sum+=v*v;}
 if(data.length<4000)return result(data,false,'too_short');
 if(peak<1e-7)return result(data,false,'no_signal');
 // Avoid trimming away consonants or short answers. Keep the complete utterance.
 const rms=Math.sqrt(sum/data.length),gain=Math.min(20,.8/peak,Math.max(1,.045/Math.max(rms,1e-7)));
 for(let i=0;i<data.length;i++)data[i]*=gain;
 return result(data,true,'',gain);
}

export function encodeVoiceWav(samples) {
 const n=samples.length,buffer=new ArrayBuffer(44+n*2),view=new DataView(buffer);
 const label=(offset,text)=>{for(let i=0;i<text.length;i++)view.setUint8(offset+i,text.charCodeAt(i));};
 label(0,'RIFF');view.setUint32(4,36+n*2,true);label(8,'WAVE');label(12,'fmt ');
 view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);
 view.setUint32(24,16000,true);view.setUint32(28,32000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);
 label(36,'data');view.setUint32(40,n*2,true);
 for(let i=0;i<n;i++){
  const sample=Math.max(-1,Math.min(1,samples[i]));
  view.setInt16(44+i*2,sample<0?sample*32768:sample*32767,true);
 }
 const bytes=new Uint8Array(buffer);
 let binary='';
 for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
 return btoa(binary);
}

export function recordingMimeType() {
 if(typeof MediaRecorder==='undefined')return '';
 return ['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/ogg;codecs=opus']
  .find(type=>MediaRecorder.isTypeSupported(type))||'';
}
