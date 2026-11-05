import {createSoundscape} from './sound-priority.js';

// Local tea-house ambience: filtered room tone and quiet, irregular porcelain clinks.
// Created only after a user gesture; no network, microphone or audio files required.
export function createAmbience({button = null, sound} = {}) {
 const ownsSound = !sound;
 const controller = sound || createSoundscape();
 let ctx = null, master = null, low = null, high = null;
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
  button.textContent = `背景音效：${snapshot.ambienceEnabled ? '開' : '關'}`;
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

  // Interior is warmer and more muffled; outside opens the noise filter gradually.
  const interior = snapshot.location === 'interior';
  for (const [parameter, value] of [
   [low?.frequency, interior ? 1050 : 2300],
   [high?.frequency, interior ? 160 : 90],
  ]) {
   if (!parameter) continue;
   parameter.cancelScheduledValues(now);
   parameter.setTargetAtTime(value, now, 0.45);
  }
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

 function clink() {
  if (!canSchedule() || snapshot.location !== 'interior') return;
  const start = ctx.currentTime, pan = ctx.createStereoPanner();
  pan.pan.value = (Math.random() - .5) * 1.3;
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
  const source = ctx.createBufferSource();
  // A long, seamless noise bed filtered into a distant, warm room texture.
  const buffer = ctx.createBuffer(2, ctx.sampleRate * 8, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
   const data = buffer.getChannelData(channel);
   let brown = 0;
   for (let i = 0; i < data.length; i++) {
    brown = (brown + .025 * (Math.random() * 2 - 1)) / 1.025;
    data[i] = brown * .7;
   }
   const seam = Math.floor(ctx.sampleRate * .06);
   for (let i = 0; i < seam; i++) {
    const t = i / seam;
    data[data.length - seam + i] = data[data.length - seam + i] * (1 - t) + data[i] * t;
   }
  }
  source.buffer = buffer;
  source.loop = true;
  low = ctx.createBiquadFilter();
  low.type = 'lowpass';
  low.frequency.value = snapshot.location === 'interior' ? 1050 : 2300;
  high = ctx.createBiquadFilter();
  high.type = 'highpass';
  high.frequency.value = snapshot.location === 'interior' ? 160 : 90;
  source.connect(low);
  low.connect(high);
  high.connect(master);
  source.start();
  return true;
 }

 async function wake() {
  if (disposed || !snapshot.ambienceEnabled || snapshot.hidden) return;
  const token = ++wakeVersion;
  try {
   if (!ctx && !build()) {
    if (button) {
     button.disabled = true;
     button.textContent = '此瀏覽器未支援背景音效';
    }
    return;
   }
   await ctx.resume();
   if (disposed || token !== wakeVersion || snapshot.hidden || !snapshot.ambienceEnabled) return;
   level();
   syncTimer();
  } catch {
   if (!disposed && token === wakeVersion && button) button.textContent = '背景音效：點此重試';
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
  low = null;
  high = null;
 }

 label();
 button?.addEventListener('click', toggle);
 document.addEventListener('pointerdown', onGesture);
 document.addEventListener('keydown', onGesture);
 window.addEventListener('pagehide', destroy);
 unsubscribe = controller.subscribe(applySound);

 return {destroy};
}
