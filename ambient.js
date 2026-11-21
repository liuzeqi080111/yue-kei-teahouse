import {createSoundscape} from './sound-priority.js';

// The original teahouse score shares the single background switch with incidental sounds.
export function createAmbience({button = null, sound} = {}) {
 const ownsSound = !sound;
 const controller = sound || createSoundscape();
 let ctx = null, master = null;
 const score = new Audio('assets/hongkong-evening.wav');
 score.loop = true;
 score.preload = 'auto';
 let timer = 0, disposed = false, wakeVersion = 0;
 let snapshot = {
  location: 'outside',
  ambienceEnabled: true,
  ambientGain: 0.23,
  hidden: false,
  voice: {recording: false},
 };
 let unsubscribe = () => {};

 function label() {
  if (!button) return;
  button.textContent = `背景音效：${snapshot.ambienceEnabled ? '开' : '关'}`;
  button.setAttribute('aria-pressed', String(snapshot.ambienceEnabled));
 }

 function level() {
  if (!ctx || !master) return;
  const now = ctx.currentTime;
  const target = Math.min(1, Math.max(0, snapshot.ambientGain));
  const immediate = snapshot.hidden || snapshot.voice?.recording || !snapshot.ambienceEnabled;
  master.gain.cancelScheduledValues(now);
  if (immediate) master.gain.setValueAtTime(target, now);
  else master.gain.setTargetAtTime(target, now, 0.12);


 }

 function canSchedule() {
  return !disposed && ctx?.state === 'running' && snapshot.ambienceEnabled &&
   !snapshot.hidden && !snapshot.voice?.recording && snapshot.ambientGain > 0;
 }

 function syncTimer() {
  if (!canSchedule()) {
   clearTimeout(timer);
   timer = 0;
   return;
  }
  if (snapshot.location === 'interior' && !timer) timer = setTimeout(tick, 2500 + Math.random() * 2000);
 }

 function clink(direction=(Math.random() - .5) * 1.3) {
  if (!canSchedule() || snapshot.location !== 'interior') return;
  const start = ctx.currentTime, pan = ctx.createStereoPanner();
  pan.pan.value = direction;
  pan.connect(master);
  const base = 1500 + Math.random() * 650;
  let remaining = 3;
  for (const [ratio, volume, decay] of [[1, .045, .20], [1.48, .018, .11], [2.13, .008, .055]]) {
   const osc = ctx.createOscillator(), gain = ctx.createGain();
   osc.type = 'sine';
   osc.frequency.value = base * ratio;
   gain.gain.setValueAtTime(0, start);
   gain.gain.linearRampToValueAtTime(volume, start + .004);
   gain.gain.exponentialRampToValueAtTime(.00001, start + decay);
   osc.connect(gain);
   gain.connect(pan);
   osc.start(start);
   osc.stop(start + decay + .02);
   osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
    if (!--remaining) pan.disconnect();
   };
  }
 }

 function tick() {
  timer = 0;
  if (disposed) return;
  clink();
  syncTimer();
 }

 function build() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);
  return true;
 }

 async function wake() {
  if (disposed || !snapshot.ambienceEnabled || snapshot.hidden) return;
  if (score.paused) void score.play().catch(() => {});
  const token = ++wakeVersion;
  try {
   if (!ctx && !build()) {
    if (button) {
     button.disabled = true;
     button.textContent = '此浏览器不支持背景音效';
    }
    return;
   }
   await ctx.resume();
   if (disposed || token !== wakeVersion || snapshot.hidden || !snapshot.ambienceEnabled) return;
   level();
   syncTimer();
  } catch {
   if (!disposed && token === wakeVersion && button) button.textContent = '背景音效：点击重试';
  }
 }

 function suspend() {
  wakeVersion++;
  clearTimeout(timer);
  timer = 0;
  if (ctx && ctx.state === 'running') {
   try { ctx.suspend().catch(() => {}); } catch {}
  }
 }

 function applySound(next) {
  snapshot = next;
  score.volume = snapshot.hidden || !snapshot.ambienceEnabled || snapshot.voice?.recording ? 0 : snapshot.musicGain;
  if (snapshot.hidden || !snapshot.ambienceEnabled) score.pause();
  else if (score.paused) void score.play().catch(() => {});
  label();
  level();
  if (snapshot.hidden || !snapshot.ambienceEnabled) suspend();
  else {
   if (ctx && ctx.state !== 'running') wake();
   syncTimer();
  }
 }

 function toggle() {
  const next = controller.toggleAmbience();
  if (next.ambienceEnabled) wake();
 }

 function onGesture() {
  if (snapshot.ambienceEnabled) wake();
 }

 function destroy() {
  if (disposed) return;
  disposed = true;
  wakeVersion++;
  clearTimeout(timer);
  timer = 0;
  unsubscribe();
  if (ownsSound) controller.destroy();
  document.removeEventListener('pointerdown', onGesture);
  document.removeEventListener('keydown', onGesture);
  window.removeEventListener('pagehide', destroy);
  button?.removeEventListener('click', toggle);
  try { ctx?.close().catch(() => {}); } catch {}
  ctx = null;
  master = null;
  score.pause();
 }

 label();
 button?.addEventListener('click', toggle);
 document.addEventListener('pointerdown', onGesture);
 document.addEventListener('keydown', onGesture);
 window.addEventListener('pagehide', destroy);
 unsubscribe = controller.subscribe(applySound);

 function step(direction) {
  if(!canSchedule() || snapshot.location!=='interior')return;
  const now=ctx.currentTime,osc=ctx.createOscillator(),gain=ctx.createGain(),pan=ctx.createStereoPanner();
  osc.frequency.setValueAtTime(135,now);osc.frequency.exponentialRampToValueAtTime(54,now+.085);
  pan.pan.value=direction;
  gain.gain.setValueAtTime(.0001,now);gain.gain.linearRampToValueAtTime(.065,now+.009);
  gain.gain.exponentialRampToValueAtTime(.0001,now+.10);
  osc.connect(gain);gain.connect(pan);pan.connect(master);osc.start();osc.stop(now+.11);
  osc.onended=()=>{osc.disconnect();gain.disconnect();pan.disconnect();};
 }
 function recordPhrase(){
  if(!canSchedule())return;
  for(const [i,hz] of [293.66,349.23,392,440,392,349.23,293.66].entries()){
   const start=ctx.currentTime+.25+i*.38,osc=ctx.createOscillator(),gain=ctx.createGain();
   osc.type='triangle';osc.frequency.value=hz;gain.gain.setValueAtTime(.0001,start);
   gain.gain.exponentialRampToValueAtTime(.12,start+.04);gain.gain.exponentialRampToValueAtTime(.0001,start+.56);
   osc.connect(gain);gain.connect(master);osc.start(start);osc.stop(start+.57);osc.onended=()=>{osc.disconnect();gain.disconnect();};
  }
 }
 return {destroy,clink,step,recordPhrase};
}
