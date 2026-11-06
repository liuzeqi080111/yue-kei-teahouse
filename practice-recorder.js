import { encodeVoiceWav, preparePcm, recordingMimeType } from './voice-capture.js';
import { voiceUrl } from './voice-endpoint.js';

export function createPracticeRecorder(onRecording) {
 let current;

 function release(attempt) {
  clearTimeout(attempt.timer);
  attempt.stream?.getTracks().forEach(track=>track.stop());
  if(attempt.recording){attempt.recording=false;onRecording(false);}
 }

 function cancel() {
  const attempt=current;
  if(!attempt)return;
  current=null;
  attempt.request.abort();
  if(attempt.recorder?.state==='recording')attempt.recorder.stop();
  release(attempt);
 }

 async function start(phraseId,{onState,onResult,onError}) {
  cancel();
  const attempt={request:new AbortController()};
  current=attempt;
  try{
   onState('opening');
   const mimeType=recordingMimeType();
   if(!mimeType||!navigator.mediaDevices?.getUserMedia)throw Error('这个浏览器无法录音。');
   attempt.stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1}});
   if(current!==attempt){release(attempt);return;}
   const recorder=new MediaRecorder(attempt.stream,{mimeType});
   attempt.recorder=recorder;
   const chunks=[];
   recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
   recorder.onerror=()=>{if(current===attempt){cancel();onError('录音中断，请再试一次。');}};
   recorder.onstop=async()=>{
    release(attempt);
    if(current!==attempt)return;
    try{
     onState('scoring');
     const blob=new Blob(chunks,{type:mimeType});
     const Context=window.AudioContext||window.webkitAudioContext;
     const ctx=new Context();
     let decoded;
     try{decoded=await ctx.decodeAudioData(await blob.arrayBuffer());}finally{await ctx.close().catch(()=>{});}
     if(current!==attempt)return;
     const pcm=preparePcm(decoded.getChannelData(0),decoded.sampleRate);
     if(!pcm.valid)throw Error(pcm.reason==='too_short'?'录音太短，请读完再停止。':'没录到声音，请再读一次。');
     const timeout=setTimeout(()=>attempt.request.abort(),22000);
     try{
      const response=await fetch(voiceUrl('/api/practice/assess'),{
       method:'POST',headers:{'Content-Type':'application/json'},signal:attempt.request.signal,
       body:JSON.stringify({phraseId,audioBase64:encodeVoiceWav(pcm.samples.subarray(0,240000))}),
      });
      const result=await response.json().catch(()=>null);
      if(!response.ok||result?.phraseId!==phraseId||!Number.isFinite(result?.scores?.accuracy)){
       throw Error(result?.error?.message||'这次没能评分，请再试一次。');
      }
      if(current===attempt)onResult(result,blob);
     }finally{clearTimeout(timeout);}
    }catch(error){
     if(current===attempt)onError(error.name==='AbortError'?'评测超时，请再试一次。':error.message);
    }finally{if(current===attempt)current=null;}
   };
   recorder.start();
   attempt.recording=true;onRecording(true);onState('recording');
   attempt.timer=setTimeout(()=>{if(recorder.state==='recording')recorder.stop();},15000);
  }catch(error){
   if(current!==attempt)return;
   cancel();
   onError(error.name==='NotAllowedError'?'请允许麦克风访问后重试。':error.message||'无法开始录音。');
  }
 }

 return {start,cancel,stop(){if(current?.recorder?.state==='recording')current.recorder.stop();}};
}
