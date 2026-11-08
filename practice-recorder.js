import { encodeVoiceWav, preparePcm, recordingMimeType } from './voice-capture.js';
import { voiceUrl } from './voice-endpoint.js';

export function createPracticeRecorder(onRecording) {
 let current;

 function release(attempt) {
  clearTimeout(attempt.timer);clearInterval(attempt.progressTimer);
  try{attempt.source?.disconnect();}catch{}
  try{attempt.analyser?.disconnect();}catch{}
  if(attempt.audioContext)try{attempt.audioContext.close().catch(()=>{});}catch{}
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

 async function assess(phraseId,blob,{onState,onResult,onError}) {
  cancel();
  const attempt={request:new AbortController()};
  current=attempt;
  await processAudio(attempt,phraseId,blob,{onState,onResult,onError,score:true});
 }

 async function processAudio(attempt,phraseId,blob,{onState,onResult,onError,onRecorded,score=true}) {
  try{
   onState('preparing');
   const Context=window.AudioContext||window.webkitAudioContext;
   const ctx=new Context();
   let decoded;
   try{decoded=await ctx.decodeAudioData(await blob.arrayBuffer());}finally{await ctx.close().catch(()=>{});}
   if(current!==attempt)return;
   const pcm=preparePcm(decoded.getChannelData(0),decoded.sampleRate);
   if(!pcm.valid)throw Error(pcm.reason==='too_short'?'录音太短，请读完再停止。':'没录到声音，请再读一次。');
   onRecorded?.(blob);
   if(current!==attempt)return;
   if(!score){onState('recorded');return;}
   onState('scoring');
   const timeout=setTimeout(()=>attempt.request.abort(),22000);
   try{
    const response=await fetch(voiceUrl('/api/practice/assess'),{
     method:'POST',headers:{'Content-Type':'application/json'},signal:attempt.request.signal,
     body:JSON.stringify({phraseId,audioBase64:encodeVoiceWav(pcm.samples.subarray(0,240000))}),
    });
    const result=await response.json().catch(()=>null);
    if(!response.ok||result?.phraseId!==phraseId||!Number.isFinite(result?.scores?.accuracy))throw Error(result?.error?.message||'这次没能评分，可以保留录音重试。');
    if(current===attempt)onResult(result,blob);
   }finally{clearTimeout(timeout);}
  }catch(error){if(current===attempt)onError(error.name==='AbortError'?'评测超时，可以保留录音重试。':error.message);}
  finally{if(current===attempt)current=null;}
 }

 async function start(phraseId,{onState,onResult,onError,onRecorded,onProgress,score=true}) {
  cancel();
  const attempt={request:new AbortController()};
  current=attempt;
  try{
   onState('opening');
   const mimeType=recordingMimeType();
   if(!mimeType||!navigator.mediaDevices?.getUserMedia)throw Error('这个浏览器无法录音。');
   // Unlock WebAudio while the user's record-button gesture is still active.
   const Context=window.AudioContext||window.webkitAudioContext;
   if(Context)try{attempt.audioContext=new Context();void attempt.audioContext.resume().catch(()=>{});}catch{}
   attempt.stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1}});
   if(current!==attempt){release(attempt);return;}
   if(attempt.audioContext)try{
    attempt.source=attempt.audioContext.createMediaStreamSource(attempt.stream);
    attempt.analyser=attempt.audioContext.createAnalyser();
    attempt.analyser.fftSize=1024;
    attempt.source.connect(attempt.analyser);
   }catch{
    try{attempt.source?.disconnect();}catch{}
    try{attempt.analyser?.disconnect();}catch{}
    if(attempt.audioContext)try{attempt.audioContext.close().catch(()=>{});}catch{}
    attempt.source=null;attempt.analyser=null;attempt.audioContext=null;
   }
   const recorder=new MediaRecorder(attempt.stream,{mimeType});
   attempt.recorder=recorder;
   const chunks=[];
   recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
   recorder.onerror=()=>{if(current===attempt){cancel();onError('录音中断，请再试一次。');}};
   recorder.onstop=async()=>{
    release(attempt);
    if(current!==attempt)return;
    await processAudio(attempt,phraseId,new Blob(chunks,{type:mimeType}),{onState,onResult,onError,onRecorded,score});
   };
   recorder.start();
   attempt.recording=true;onRecording(true);onState('recording');
   const startedAt=performance.now(),samples=attempt.analyser?new Float32Array(attempt.analyser.fftSize):null;
   const progress=()=>{
    if(current!==attempt||!attempt.recording)return;
    let level=0;
    if(attempt.analyser&&samples)try{
     attempt.analyser.getFloatTimeDomainData(samples);
     let sum=0;for(const sample of samples)sum+=sample*sample;
     level=Math.min(1,Math.sqrt(sum/samples.length)*4);
    }catch{}
    onProgress?.({seconds:Math.min(15,(performance.now()-startedAt)/1000),level});
   };
   attempt.progressTimer=setInterval(progress,100);progress();
   attempt.timer=setTimeout(()=>{if(recorder.state==='recording')recorder.stop();},15000);
  }catch(error){
   if(current!==attempt)return;
   cancel();
   onError(error.name==='NotAllowedError'?'请允许麦克风访问后重试。':error.message||'无法开始录音。');
  }
 }

 return {start,assess,cancel,stop(){const attempt=current;if(attempt?.recorder?.state==='recording'){attempt.recorder.stop();release(attempt);}}};
}
