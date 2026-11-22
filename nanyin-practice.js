// Du Huan singing Wu Song Kills the Tiger, part 1, Fu Long Teahouse, 1975.
// The three player cues in each excerpt are selected accents on the original recording.
// Each 100 ms mouth sample measures energy in the voice band of that same excerpt.
const recording='https://chinoperl.org/audio/1-01WuSongKillsTheTiger.mp3';
const passages={
 riddle:{start:32.5,end:45.5,marks:[35.341,39.086,42.959],
  mouth:'255dbcd5bb5a355797510000011010c589a23353412012533436516a76cefffbce012001052acdababa9ddfcfdbebbba9aacabfcc55246138faaefffc54785c203'},
 gather:{start:45.5,end:59.5,marks:[47.446,54.096,57.781],
  mouth:'233566641332143311213897fedc0b5fcdf330004222211a543166823945b47780e73687a00002143235204351c71f655642002040b4f74f56fdfded5fc899bff3c955899789'}
};
const early=.16,late=.23;

export function accompanySinger({node,audio,panel,tap,next,hits,onHit,strike,advance}){
 const {start,end,marks,mouth}=passages[node];
 const track=panel.querySelector('.song-track'),holder=panel.querySelector('.song-marks');
 const cue=panel.querySelector('#board-cue'),feedback=panel.querySelector('#board-feedback');
 const events=new AbortController(),options={signal:events.signal};
 let mode='loading',frame=0,generation=0,lastTap=-Infinity,waitingSince=0;
 let sound;
 const markers=marks.map(at=>{
  const mark=document.createElement('i');mark.className='song-mark';
  mark.style.left=100*(at-start)/(end-start)+'%';return mark;
 });
 holder.replaceChildren(...markers);
 function text(el,value){if(el.textContent!==value)el.textContent=value;}
 function position(t){
  const percentage=Math.max(0,Math.min(100,100*(t-start)/(end-start)));
  track.style.setProperty('--position',percentage+'%');
  track.setAttribute('aria-valuenow',String(Math.round(percentage)));
 }
 function isPlaying(){
  return mode==='playing'&&!audio.paused&&!audio.seeking&&audio.readyState>=3;
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
  audio.pause();setMode('ended');paint(end,-1);
  if(hits){advance();return;}
  text(cue,'师傅收住了最后一个音。');text(feedback,'这次没接上板。');
  tap.textContent='请师傅再唱一遍';next.hidden=false;
 }
 function unavailable(){
  if(mode==='destroyed')return;
  generation++;audio.pause();setMode('error');next.hidden=false;
  text(cue,'唱段暂时没载入。');text(feedback,'');tap.textContent='重新载入唱段';
 }
 function draw(){
  if(mode==='destroyed')return;
  if(mode==='playing'||mode==='loading'){
   const t=audio.currentTime;
   if(isPlaying()&&t>=end){finish();}
   else if(isPlaying()){
    waitingSince=0;
    audio.volume=Math.max(.04,Math.min(1,(t-start)/.12,(end-t)/.28));
    const active=activeMark(t),upcoming=marks.find(at=>at>t);
    paint(t,active);
    if(active>=0)text(cue,hits&(1<<active)?'听师傅唱':'敲！');
    else text(cue,upcoming&&upcoming-t<=.95?'准备敲板':'听师傅唱');
   }else{
    panel.dataset.window='closed';text(cue,'正在等唱声…');
    waitingSince||=performance.now();
    if(performance.now()-waitingSince>15000)unavailable();
   }
  }
  if(mode!=='destroyed')frame=requestAnimationFrame(draw);
 }
 function startSinging(resume=false){
  const previous=mode,turn=++generation;
  setMode('loading');tap.textContent='等师傅开腔';next.hidden=true;waitingSince=0;
  text(cue,'正在等唱声…');text(feedback,'');
  if(!resume){
   if(previous==='error'||!audio.hasAttribute('src')){
    audio.src=recording;audio.load();
   }
   audio.volume=.04;audio.currentTime=start;lastTap=-Infinity;paint(start,-1);
  }
  audio.play().then(()=>{
   if(turn!==generation)return;
   setMode('playing');
  }).catch(error=>{
   if(turn!==generation)return;
   if(error.name==='NotAllowedError'){
    setMode('paused');tap.textContent='听师傅唱';text(cue,'师傅等你入座。');
   }else unavailable();
  });
 }
 function pause(){
  if(mode!=='playing'&&mode!=='loading')return;
  generation++;audio.pause();setMode('paused');text(cue,'唱段已暂停');tap.textContent='接着听师傅唱';
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
  const t=audio.currentTime;if(t<start||t>=end)return;
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
  if(t<start||t>=end)return null;
  const sample=(t-start)*10,index=Math.floor(sample);
  const a=parseInt(mouth[index]??'0',16),b=parseInt(mouth[index+1]??'0',16);
  const at=marks.find(mark=>mark>t-.18);
  const lift=at===undefined?0:Math.max(0,1-Math.abs(t-at)/(t<at?.6:.18));
  return {voice:(a+(b-a)*(sample-index))/15,lift};
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
 audio.addEventListener('timeupdate',()=>{if(audio.currentTime>=end)finish();},options);
 audio.addEventListener('error',unavailable,options);
 audio.addEventListener('ended',finish,options);
 startSinging();draw();
 return {pose,pause,destroy(){
  generation++;setMode('destroyed');cancelAnimationFrame(frame);events.abort();
  audio.pause();audio.removeAttribute('src');audio.load();tap.onpointerdown=null;tap.onclick=null;
  if(sound)void sound.close().catch(()=>{});
 }};
}
