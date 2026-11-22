// Du Huan, Wu Song Kills the Tiger, recorded by Bell Yung in 1975.
// One continuous excerpt, 32.5–62.5 seconds. Cues and mouth samples use its audio clock.
const duration=30,marks=[2.841,6.586,10.459,14.946,17.961,21.596,25.281,28.841];
const mouth='254ecdf4cb5a355797510000011010d489a23352312011522335416b75effffcdf012001052bdfbcbbb9eefdfecfcbcbaaaebbfdd55245138fabffffd54784d203121344320111022100102564fcaa093f9bf2100021111007321044611623825560c52354700000022113102130a40d43332100102092d52f33fadbca3fa5678ed29733576566646755443201221211222e25027ad3';
export const songHitMask=(1<<marks.length)-1;
// Plucking attacks in the recording; the learner only plays the marked board accents.
const attacks=[2.15, 2.82, 3.5, 4.18, 5.12, 5.85, 6.58, 7.34, 8.24, 9.7, 10.45, 11.16, 13.08, 14.24, 14.94, 16.57, 17.28, 17.96, 18.63, 19.58, 20.24, 20.92, 21.6, 22.28, 23.14, 24.08, 25.28, 25.94, 27.52, 28.16, 28.84, 29.56];
const early=.16,late=.23;

export function accompanySinger({audio,panel,tap,next,hits,onHit,strike,advance}){
 const track=panel.querySelector('.song-track'),holder=panel.querySelector('.song-marks');
 const cue=panel.querySelector('#board-cue'),feedback=panel.querySelector('#board-feedback');
 const events=new AbortController(),options={signal:events.signal};
 let mode='loading',frame=0,generation=0,lastTap=-Infinity,lastTime=0,lastMove=0;
 let sound,clipUrl,fetching;
 const markers=marks.map(at=>{
  const mark=document.createElement('i');mark.className='song-mark';
  mark.style.left=100*at/duration+'%';return mark;
 });
 holder.replaceChildren(...markers);
 function text(el,value){if(el.textContent!==value)el.textContent=value;}
 function position(t){
  const percentage=Math.max(0,Math.min(100,100*t/duration));
  track.style.setProperty('--position',percentage+'%');
  track.setAttribute('aria-valuenow',String(Math.round(percentage)));
 }
 function isPlaying(){
  return mode==='playing'&&!audio.paused&&!audio.seeking&&audio.readyState>=2;
 }
 function activeMark(t){return marks.findIndex(at=>t>=at-early&&t<=at+late);}
 function paint(t,active){
  panel.dataset.window=active>=0&&!(hits&(1<<active))?'hit':'closed';
  markers.forEach((mark,i)=>{
   mark.dataset.state=hits&(1<<i)?'hit':i===active?'now':t>marks[i]+late?'missed':'ahead';
  });
  position(t);
 }
 function setMode(value){
  mode=value;panel.dataset.phase=value;panel.dataset.window='closed';
  tap.disabled=value==='loading';
  if(value==='playing'){tap.textContent='敲板';next.hidden=true;}
 }
 function finish(){
  if(mode!=='playing')return;
  audio.pause();setMode('ended');paint(duration,-1);
  if(hits){advance();return;}
  text(cue,'师傅收住了最后一个音。');text(feedback,'这次没接上板。');
  tap.textContent='请师傅再唱一遍';next.hidden=false;
 }
 function unavailable(){
  if(mode==='destroyed')return;
  generation++;fetching?.abort();audio.pause();setMode('error');next.hidden=false;
  text(cue,'唱段暂时没载入。');text(feedback,'');tap.textContent='重新载入唱段';
 }
 function draw(){
  if(mode==='destroyed')return;
  if(mode==='playing'||mode==='loading'){
   const t=audio.currentTime;
   if(t!==lastTime){lastMove=performance.now();lastTime=t;}
   if(audio.ended||t>=duration){finish();}
   else if(performance.now()-lastMove>5000){unavailable();}
   else if(isPlaying()){
    audio.volume=Math.max(.04,Math.min(1,t/.12,(duration-t)/.28));
    const active=activeMark(t),upcoming=marks.find(at=>at>t);
    paint(t,active);
    if(active>=0)text(cue,hits&(1<<active)?'听师傅唱':'敲！');
    else text(cue,upcoming&&upcoming-t<=.95?'准备敲板':'听师傅唱');
   }else{
    panel.dataset.window='closed';text(cue,'正在等唱声…');
   }
  }
  if(mode!=='destroyed')frame=requestAnimationFrame(draw);
 }
 async function startSinging(resume=false){
  const previous=mode,turn=++generation;
  setMode('loading');tap.textContent='等师傅开腔';next.hidden=true;lastMove=performance.now();
  text(cue,'正在等唱声…');text(feedback,'');
  try{
   if(!clipUrl||previous==='error'){
    // A complete local Blob has a known duration even on static hosts without byte ranges.
    fetching=new AbortController();
    const response=await fetch('assets/nanyin-wusong-gather.wav',{signal:fetching.signal});
    if(!response.ok)throw Error('clip');
    const blob=await response.blob();
    if(turn!==generation)return;
    if(clipUrl)URL.revokeObjectURL(clipUrl);
    clipUrl=URL.createObjectURL(blob);audio.src=clipUrl;
   }
   if(!resume){audio.currentTime=0;audio.volume=.04;lastTap=-Infinity;paint(0,-1);}
   await audio.play();
   if(turn!==generation)return;
   setMode('playing');
  }catch(error){
   if(turn!==generation)return;
   if(error.name==='NotAllowedError'){
    setMode('paused');tap.textContent='听师傅唱';text(cue,'师傅等你拿好拍板。');
   }else unavailable();
  }
 }
 function pause(){
  if(mode!=='playing'&&mode!=='loading')return;
  generation++;fetching?.abort();audio.pause();setMode('paused');text(cue,'唱段已暂停');tap.textContent='接着听师傅唱';
 }
 function knock(){
  strike();
  try{
   sound??=new AudioContext();
   if(sound.state!=='running')void sound.resume().catch(()=>{});
   const at=sound.currentTime;
   for(const [hz,volume] of [[870,.24],[1760,.11]]){
    const tone=sound.createOscillator(),gain=sound.createGain();
    tone.frequency.value=hz;gain.gain.setValueAtTime(volume,at);gain.gain.exponentialRampToValueAtTime(.0001,at+.075);
    tone.connect(gain);gain.connect(sound.destination);tone.onended=()=>{tone.disconnect();gain.disconnect();};
    tone.start(at);tone.stop(at+.08);
   }
  }catch{}
 }
 function action(){
  if(mode==='paused'){startSinging(true);return;}
  if(mode==='error'||mode==='ended'){startSinging();return;}
  if(!isPlaying())return;
  const t=audio.currentTime;if(t>=duration)return;
  const rapid=t-lastTap<.29;lastTap=t;
  if(rapid){text(feedback,'等下一处板位');return;}
  knock();const i=activeMark(t);
  if(i<0){
   const nearest=marks.reduce((a,b)=>Math.abs(t-a)<Math.abs(t-b)?a:b);
   text(feedback,t<nearest?'早了一点':'迟了一点');return;
  }
  if(hits&(1<<i)){text(feedback,'这一板接上了');return;}
  hits|=1<<i;onHit(hits);paint(t,i);text(feedback,'合上了！');
 }
 function pose(){
  if(!isPlaying())return null;
  const t=audio.currentTime;
  if(t>=duration)return null;
  const sample=t*10,index=Math.floor(sample);
  const a=parseInt(mouth[index]??'0',16),b=parseInt(mouth[index+1]??'0',16);
  const at=marks.find(mark=>mark>t-.18);
  const lift=at===undefined?0:Math.max(0,1-Math.abs(t-at)/(t<at?.6:.18));
  const stroke=attacks.find(a=>a>=t-.30);
  const elapsed=stroke===undefined?1:t-stroke;
  const pluck=elapsed<0?Math.max(0,1+elapsed/.12):Math.exp(-elapsed*14);
  const press=elapsed<0?0:Math.sin(Math.PI*Math.min(1,elapsed/.30));
  return {time:t,pluck,press,voice:(a+(b-a)*(sample-index))/15,lift};
 }
 tap.onpointerdown=event=>{
  if(event.isPrimary&&event.button===0&&!tap.disabled){event.preventDefault();tap.focus();action();}
 };
 tap.onclick=event=>{if(event.detail===0)action();};
 document.addEventListener('keydown',event=>{
  if(event.code!=='Space'||event.altKey||event.ctrlKey||event.metaKey)return;
  if(event.target.closest('button,a,input,select')&&event.target!==tap)return;
  event.preventDefault();if(!event.repeat&&!tap.disabled)action();
 },options);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();},options);
 audio.addEventListener('timeupdate',()=>{if(audio.currentTime>=duration)finish();},options);
 audio.addEventListener('error',unavailable,options);
 audio.addEventListener('ended',finish,options);
 startSinging();draw();
 return {pose,pause,destroy(){
  generation++;setMode('destroyed');cancelAnimationFrame(frame);events.abort();fetching?.abort();
  audio.pause();audio.removeAttribute('src');audio.load();tap.onpointerdown=null;tap.onclick=null;
  if(clipUrl)URL.revokeObjectURL(clipUrl);
  if(sound)void sound.close().catch(()=>{});
 }};
}
