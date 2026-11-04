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
