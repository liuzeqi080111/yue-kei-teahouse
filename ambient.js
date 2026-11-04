// Local tea-house ambience: filtered room tone and quiet, irregular porcelain clinks.
// Created only after a user gesture; no network, microphone or audio files required.
export function createAmbience({button}) {
 const storageKey='yue-kei-ambience';
 let enabled=true,ctx=null,master=null,timer=0,ducked=false,disposed=false,musicPlaying=false;
 try{enabled=localStorage.getItem(storageKey)!=='off';}catch{}
 const label=()=>{button.textContent=`背景音效：${enabled?'開':'關'}`;button.setAttribute('aria-pressed',String(enabled));};
 function level(){
  if(!master)return;
  const target=enabled&&!document.hidden?(ducked||musicPlaying?0:0.22):0;
  master.gain.setTargetAtTime(target,ctx.currentTime,ducked?0.025:0.35);
 }
 function clink(){
  if(!ctx||ctx.state!=='running'||!enabled||ducked||musicPlaying||document.hidden)return;
  const start=ctx.currentTime,pan=ctx.createStereoPanner();
  pan.pan.value=(Math.random()-.5)*1.3;pan.connect(master);
  const base=1500+Math.random()*650;
  let remaining=3;
  for(const [ratio,volume,decay] of [[1,.045,.20],[1.48,.018,.11],[2.13,.008,.055]]){
   const osc=ctx.createOscillator(),gain=ctx.createGain();
   osc.type='sine';osc.frequency.value=base*ratio;
   gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(volume,start+.004);
   gain.gain.exponentialRampToValueAtTime(.00001,start+decay);
   osc.connect(gain);gain.connect(pan);osc.start(start);osc.stop(start+decay+.02);
   osc.onended=()=>{osc.disconnect();gain.disconnect();if(!--remaining)pan.disconnect();};
  }
 }
 function tick(){
  clearTimeout(timer);if(disposed)return;
  clink();timer=setTimeout(tick,4500+Math.random()*6500);
 }
 function build(){
  const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return false;
  ctx=new AC();master=ctx.createGain();master.gain.value=0;master.connect(ctx.destination);
  const source=ctx.createBufferSource();
  // A long, seamless noise bed filtered into a distant, warm room texture.
  const buffer=ctx.createBuffer(2,ctx.sampleRate*8,ctx.sampleRate);
  for(let channel=0;channel<2;channel++){
   const data=buffer.getChannelData(channel);let brown=0;
   for(let i=0;i<data.length;i++){brown=(brown+.025*(Math.random()*2-1))/1.025;data[i]=brown*.7;}
   const seam=Math.floor(ctx.sampleRate*.06);
   for(let i=0;i<seam;i++){const t=i/seam;data[data.length-seam+i]=data[data.length-seam+i]*(1-t)+data[i]*t;}
  }
  source.buffer=buffer;source.loop=true;
  const low=ctx.createBiquadFilter();low.type='lowpass';low.frequency.value=1100;
  const high=ctx.createBiquadFilter();high.type='highpass';high.frequency.value=150;
  source.connect(low);low.connect(high);high.connect(master);source.start();
  return true;
 }
 async function wake(){
  if(disposed||!enabled||document.hidden)return;
  try{
   if(!ctx&&!build()){button.disabled=true;button.textContent='此瀏覽器未支援背景音效';return;}
   await ctx.resume();if(disposed)return;level();
   if(!timer)timer=setTimeout(tick,2500+Math.random()*2000);
  }catch{button.textContent='背景音效：點此重試';}
 }
 function toggle(){
  enabled=!enabled;try{localStorage.setItem(storageKey,enabled?'on':'off');}catch{}
  label();level();if(enabled)wake();
 }
 function voiceActivity(e){ducked=!!e.detail?.active;level();}
 function musicActivity(e){musicPlaying=!!e.detail?.active;level();}
 function visibility(){
  clearTimeout(timer);timer=0;
  if(document.hidden){level();ctx?.suspend().catch(()=>{});}else if(ctx)wake();
 }
 function destroy(){
  disposed=true;clearTimeout(timer);ctx?.close().catch(()=>{});
  document.removeEventListener('pointerdown',wake);document.removeEventListener('keydown',wake);
  document.removeEventListener('visibilitychange',visibility);window.removeEventListener('voice-activity',voiceActivity);
  window.removeEventListener('background-music',musicActivity);
  window.removeEventListener('pagehide',destroy);button.removeEventListener('click',toggle);
 }
 label();button.addEventListener('click',toggle);
 document.addEventListener('pointerdown',wake);document.addEventListener('keydown',wake);
 document.addEventListener('visibilitychange',visibility);window.addEventListener('voice-activity',voiceActivity);
 window.addEventListener('background-music',musicActivity);
 window.addEventListener('pagehide',destroy);
 return {destroy};
}
