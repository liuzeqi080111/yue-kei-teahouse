// A slow, even teaching pulse for 一板三叮. Live singers may stretch the phrase.
// The score, animation and click track use the same audio timeline.
const beatSeconds=.72;
export const barSeconds=4*beatSeconds;
const early=.17, late=.23;

function clickTrack(context){
 const rate=context.sampleRate;
 const buffer=context.createBuffer(1,Math.round(2*barSeconds*rate),rate);
 const samples=buffer.getChannelData(0);
 for(let i=0;i<8;i++){
  const board=i===0;
  const attack=Math.round(i*beatSeconds*rate);
  for(let j=0;j<rate*.11;j++){
   const t=j/rate,phase=2*Math.PI*t;
   const wood=Math.sin(phase*875)+.62*Math.sin(phase*1780)+.3*Math.sin(phase*2670);
   const tick=Math.sin(phase*(i===4?520:1140));
   samples[attack+j]=(board?.32*wood:.11*tick)*Math.min(1,j/24)*Math.exp(-t*(board?45:63));
  }
 }
 return buffer;
}

export function createBoardLesson({panel,beatButton,nextButton,points,onPoint,onStrike}){
 const phase=panel.querySelector('.board-phase'),cue=panel.querySelector('.board-cue');
 const markers=[...panel.querySelectorAll('.board-pulse span')];
 const sweep=panel.querySelector('.board-sweep i');
 const feedback=panel.querySelector('.board-feedback'),progress=panel.querySelector('.board-score');
 let context,buffer,source,origin=0,epoch=0,running=false,finished=points===2;
 let lastPulse=-1,lastAttempt=-Infinity,lastScored=-1,frame=0,silent=false;

 function score(){progress.textContent='合拍 '+points+' / 2';nextButton.disabled=points!==2;}
 function clock(){
  if(silent)return performance.now()/1000;
  const stamp=context.getOutputTimestamp?.();
  if(stamp?.performanceTime>0)return Math.min(context.currentTime,stamp.contextTime+(performance.now()-stamp.performanceTime)/1000);
  return context.currentTime;
 }
 function elapsed(){return running?clock()-origin:-1;}
 function light(index){
  markers.forEach((item,i)=>item.classList.toggle('current',i===index));
  panel.dataset.pulse=index;
 }
 function stop(){
  epoch++;running=false;cancelAnimationFrame(frame);
  if(source){source.stop();source.disconnect();source=null;}
  light(-1);panel.dataset.phase='idle';panel.dataset.window='closed';sweep.style.transform='scaleX(0)';
 }
 function idle(){
  phase.textContent=finished?'合上板了':'慢板 · 一板三叮';
  cue.textContent=finished?'可以接着听街坊说话了。':'听一轮示范，再在每轮的第一拍敲一下。';
  beatButton.textContent=finished?'再练一轮':'听示范，跟着敲';
  beatButton.disabled=false;
 }
 function draw(){
  if(!running)return;
  const time=elapsed(),n=Math.floor(time/beatSeconds);
  if(n>=0 && n!==lastPulse){
   lastPulse=n;const index=n%4,demo=n<4;
   panel.dataset.phase=demo?'demo':'play';light(index);
   phase.textContent=demo?'师傅示范 · 先听一轮':'轮到你 · 跟拍';
   if(demo)cue.textContent=index===0?'听这一声木板。':index===3?'准备，下一拍轮到你。':'轻数余下的拍子。';
   if(!demo && index===1 && lastScored!==Math.floor(n/4))feedback.textContent='这板过去了。数到四，接下一轮。';
  }
  const bar=Math.round(time/barSeconds),offset=time-bar*barSeconds;
  const open=bar>=1&&offset>=-early&&offset<=late;
  panel.dataset.window=open?'hit':'closed';
  sweep.style.transform='scaleX('+Math.max(0,time%barSeconds/barSeconds)+')';
  if(open||n>=4){
   const message=open?'现在敲！':n%4===3?'准备，下一拍敲。':'等下一板。';
   if(cue.textContent!==message)cue.textContent=message;
  }
  frame=requestAnimationFrame(draw);
 }
 async function start(){
  stop();const turn=epoch;
  beatButton.disabled=true;
  try{
   context??=new AudioContext();
   if(context.state!=='running')await context.resume();
   if(turn!==epoch)return;
   source=context.createBufferSource();buffer??=clickTrack(context);source.buffer=buffer;
   source.loop=true;source.loopStart=barSeconds;source.loopEnd=2*barSeconds;
   source.connect(context.destination);origin=context.currentTime+.18;source.start(origin);silent=false;
  }catch{
   if(turn!==epoch)return;
   silent=true;origin=performance.now()/1000+.18;
  }
  if(finished){points=0;finished=false;onPoint(points);}
  running=true;lastPulse=-1;lastScored=-1;lastAttempt=-Infinity;
  beatButton.disabled=false;beatButton.textContent='敲拍板';
  feedback.textContent=silent?'按画面提示跟拍。':'先听一声重板，再听三声轻拍。';
  score();draw();
 }
 function knock(){
  onStrike();
  try{
   context??=new AudioContext();
   if(context.state!=='running')void context.resume().catch(()=>{});
   buffer??=clickTrack(context);
   const hit=context.createBufferSource();hit.buffer=buffer;hit.connect(context.destination);
   hit.onended=()=>hit.disconnect();hit.start(context.currentTime,0,.12);
  }catch{}
 }
 function tap(){
  if(!running){void start();return;}
  const time=elapsed(),bar=Math.round(time/barSeconds),offset=time-bar*barSeconds;
  const rapid=time-lastAttempt<.31;
  lastAttempt=time;
  if(bar<1||time<barSeconds-early){feedback.textContent='这一轮师傅示范，数到四再接。';return;}
  knock();
  if(rapid||bar===lastScored){feedback.textContent='一轮只敲一下，等下一板。';return;}
  if(offset < -early){feedback.textContent='早了，等「板」亮起来再敲。';return;}
  if(offset > late){feedback.textContent='迟了，数过三声轻拍再接。';return;}
  lastScored=bar;points++;onPoint(points);score();feedback.textContent='合上了。';
  if(points===2){finished=true;stop();idle();}
 }
 function interrupt(){
  stop();idle();feedback.textContent=finished?'':'准备好可以从示范重新接入。';
 }
 function keydown(event){
  if(event.code!=='Space'||event.altKey||event.ctrlKey||event.metaKey||document.querySelector('dialog[open]'))return;
  if(event.target.closest('button,a,input,select') && event.target!==beatButton)return;
  event.preventDefault();if(!event.repeat&&!beatButton.disabled)tap();
 }
 function visibility(){if(document.hidden)interrupt();}
 document.addEventListener('keydown',keydown);document.addEventListener('visibilitychange',visibility);
 // Judge touch on contact. The synthesized click after pointerup must not count again.
 beatButton.onpointerdown=event=>{
  if(event.isPrimary&&event.button===0&&!beatButton.disabled){event.preventDefault();beatButton.focus();tap();}
 };
 beatButton.onclick=event=>{if(event.detail===0)tap();};
 score();idle();light(-1);
 return {
  elapsed,interrupt,knock,
  completeFromRecording(){points=2;finished=true;onPoint(points);stop();score();idle();feedback.textContent='原声里的两处重音都接上了。';},
  destroy(){stop();document.removeEventListener('keydown',keydown);document.removeEventListener('visibilitychange',visibility);
   if(context && context.state!=='closed')void context.close().catch(()=>{});}
 };
}

// Listening marks in part 1 of Dou Wun's Wu Song Kills the Tiger (CHINOPERL).
// These are individual attacks measured against the original MP3 media time.
// Do not extend an even-tempo click track over this live performance.
const passages={
 riddle:{start:5.25,marks:[7.774,8.674],end:9.03},
 gather:{start:40.45,marks:[42.959,43.659],end:44.08}
};
export function rehearseRecording(audio,node,{button,cue,progress,knock,done}){
 const passage=passages[node];
 let phase='demo',seen=new Set(),raf=0,closed=false,lastTap=-Infinity,commentUntil=0;
 audio.controls=false;
 function message(text){if(cue.textContent!==text)cue.textContent=text;}
 function stop(){
  closed=true;cancelAnimationFrame(raf);audio.pause();audio.controls=true;button.dataset.window='closed';
  button.onclick=null;button.onpointerdown=null;
 }
 async function rewind(){
  if(closed)return;
  try{audio.currentTime=passage.start;await audio.play();}
  catch{if(!closed){message('录音加载失败，可以回到本地跟板。');stop();}}
 }
 function frame(){
  if(closed)return;
  const t=audio.currentTime;
  if(audio.error){message('录音未能载入，可以回到本地跟板。');stop();return;}
  if(audio.seeking||audio.readyState<3||audio.paused){
   message('正在等原声…');
  }else if(t>=passage.end){
   phase='play';lastTap=-Infinity;commentUntil=0;void rewind();
  }else{
   const active=passage.marks.findIndex(at=>t>=at-early && t<=at+late);
   const upcoming=passage.marks.findIndex(at=>at>t);
   button.disabled=phase==='demo';
   button.dataset.window=phase==='play' && active>=0?'hit':'closed';
   if(t>=commentUntil){
    if(phase==='demo')message(active>=0?'听，这里有一下重音。':'先听这句，留意两次重音。');
    else if(active>=0)message(seen.has(active)?'这一下接上了。':'落板！');
    else if(upcoming>=0)message(passage.marks[upcoming]-t<.68?'准备，重音就来了。':'同一句再来，轮到你接。');
    else message('等同一句再来。');
   }
  }
  raf=requestAnimationFrame(frame);
 }
 function tap(){
  if(closed||phase!=='play'||audio.paused||audio.seeking||audio.readyState<3)return;
  const t=audio.currentTime,rapid=t-lastTap<.30;
  lastTap=t;commentUntil=t+.40;knock();
  const i=passage.marks.findIndex(at=>t>=at-early&&t<=at+late);
  if(rapid||seen.has(i)){message('这一处只敲一下。');return;}
  if(i<0){
   const near=passage.marks.reduce((a,b)=>Math.abs(t-a)<Math.abs(t-b)?a:b);
   message(t<near?'早了，等重音。':'迟了，下一次再接。');return;
  }
  seen.add(i);progress.textContent='合拍 '+seen.size+' / 2';message('合上了。');
  if(seen.size===2){stop();button.disabled=true;message('两处都接上了，可以回到饭桌。');done();}
 }
 button.onpointerdown=event=>{if(event.isPrimary&&event.button===0){event.preventDefault();tap();}};
 button.onclick=event=>{if(!event.detail)tap();};
 button.disabled=true;progress.textContent='合拍 0 / 2';message('先听原声。');
 void rewind();frame();
 return stop;
}
