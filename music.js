import {createSoundscape} from './sound-priority.js';

const clamp01 = value => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

// Local and built-in tracks share a Web Audio gain node; device media volume is not the limiter.
function createMusicBus() {
 let ctx = null, master = null, unavailable = false;
 const sources = new WeakMap();

 function ensure() {
  if (ctx || unavailable) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) { unavailable = true; return null; }
  try {
   ctx = new AC();
   master = ctx.createGain();
   master.gain.value = 0;
   master.connect(ctx.destination);
  } catch {
   unavailable = true;
   ctx = null;
   master = null;
  }
  return ctx;
 }

 function route(audio) {
  if (!audio || sources.has(audio)) return sources.has(audio);
  const context = ensure();
  if (!context) return false;
  try {
   const source = context.createMediaElementSource(audio);
   source.connect(master);
   sources.set(audio, source);
   audio.volume = 1;
   return true;
  } catch {
   return false;
  }
 }

 function release(audio) {
  if (!audio) return;
  try { sources.get(audio)?.disconnect(); } catch {}
  sources.delete(audio);
 }

 function gain(target, immediate) {
  if (!ctx || !master) return;
  const now = ctx.currentTime;
  master.gain.cancelScheduledValues(now);
  if (immediate) master.gain.setValueAtTime(target, now);
  else master.gain.setTargetAtTime(target, now, 0.08);
 }

 async function resume() {
  const context = ensure();
  if (context && context.state !== 'running') await context.resume();
 }

 function close() {
  try { ctx?.close().catch(() => {}); } catch {}
  ctx = null;
  master = null;
 }

 return {route, release, gain, resume, close, isRouted:audio => sources.has(audio)};
}

// Official artist upload, played through the supported YouTube player (no copied MP3).
export function mountMusic(host, {sound} = {}) {
 const title = document.createElement('p');
 title.textContent = '陈慧娴 · 千千阙歌';
 const button = document.createElement('button');
 button.type = 'button';
 button.textContent = '播放香港老歌';
 const status = document.createElement('small');
 status.textContent = '官方在线音源，需要联网。';
 status.setAttribute('role', 'status');
 let frame = document.createElement('div');
 frame.id = 'old-song-player';
 const link = document.createElement('a');
 link.href = 'https://www.youtube.com/watch?v=d44u2W-votY';
 link.target = '_blank';
 link.rel = 'noopener noreferrer';
 link.textContent = '打开官方音源';
 const domestic = document.createElement('a');
 domestic.href = 'https://www.kugou.com/mixsong/zp4aa2a.html';
 domestic.target = '_blank';
 domestic.rel = 'noopener noreferrer';
 domestic.textContent = '国内平台试听（酷狗）';

 const fileLabel = document.createElement('label');
 fileLabel.textContent = '或选择本机歌曲：';
 const file = document.createElement('input');
 file.type = 'file';
 file.accept = 'audio/*';
 file.setAttribute('aria-label', '选择本机背景歌曲');
 fileLabel.append(file);
 host.append(title, button, status, frame, link, domestic, fileLabel);

 // Without an external source, the original instrumental remains available after a user gesture.
 const bedButton = document.createElement('button');
 bedButton.type = 'button';
 const bedNote = document.createElement('small');
 bedNote.textContent = '内置原创港风器乐 · 电钢琴与贝斯；未播放在线或本机歌曲时自动使用。此按钮控制所有背景音乐。';
 host.prepend(bedButton, bedNote);

 const ownsSound = !sound;
 const controller = sound || createSoundscape();
 const bus = createMusicBus();
 const offline = new Audio('assets/hongkong-evening.wav');
 offline.loop = true;
 offline.preload = 'auto';

 let local = null, blobUrl = null, localAttempt = 0, localPlaying = false;
 let player = null, ready = false, youtubePlaying = false, loading = false;
 let disposed = false, unlocked = false, readyTimer = 0, attempt = 0;
 let wakeVersion = 0, volumeVersion = 0, volumeFrame = 0, currentYoutubeVolume = 0;
 let source = 'builtin', externalDesired = false, triedYouTube = false;
 let soundSnapshot = {
  musicEnabled: true,
  musicGain: 0.425,
  hidden: false,
  voice: {recording: false},
 };
 let unsubscribe = () => {};

 function updateLabels() {
  bedButton.textContent = `背景音乐：${soundSnapshot.musicEnabled ? '开' : '关'}`;
  bedButton.setAttribute('aria-pressed', String(soundSnapshot.musicEnabled));
  button.textContent = source === 'youtube' && externalDesired
   ? loading ? '正在连接香港老歌' : '暂停香港老歌'
   : triedYouTube ? '重试香港老歌' : '播放香港老歌';
  button.disabled = loading || disposed;
 }

 function cancelVolumeRamp() {
  volumeVersion++;
  if (volumeFrame && window.cancelAnimationFrame) window.cancelAnimationFrame(volumeFrame);
  volumeFrame = 0;
 }

 function setYoutubeVolume(value) {
  currentYoutubeVolume = value;
  try { player?.setVolume(Math.round(value)); } catch {}
 }

 function volume() {
  const target = clamp01(soundSnapshot.musicGain);
  const immediate = soundSnapshot.hidden || soundSnapshot.voice?.recording;
  bus.gain(target, immediate);
  for (const audio of [offline, local]) {
   if (!audio) continue;
   if (bus.isRouted(audio)) audio.volume = 1;
   else audio.volume = target;
  }
  if (!ready || !player) return;

  const youtubeTarget = target * 100;
  cancelVolumeRamp();
  if (immediate || !window.requestAnimationFrame) {
   setYoutubeVolume(youtubeTarget);
   return;
  }
  if (Math.abs(currentYoutubeVolume - youtubeTarget) < 0.5) {
   setYoutubeVolume(youtubeTarget);
   return;
  }
  const from = currentYoutubeVolume;
  const token = volumeVersion;
  const started = performance.now();
  const step = now => {
   if (disposed || token !== volumeVersion || !ready || !player) return;
   if (soundSnapshot.hidden || soundSnapshot.voice?.recording) {
    setYoutubeVolume(0);
    volumeFrame = 0;
    return;
   }
   const progress = Math.min(1, (now - started) / 180);
   setYoutubeVolume(from + (youtubeTarget - from) * progress);
   if (progress < 1) volumeFrame = window.requestAnimationFrame(step);
   else volumeFrame = 0;
  };
  volumeFrame = window.requestAnimationFrame(step);
 }

 function ensureFrame() {
  if (frame?.isConnected) return;
  frame = document.createElement('div');
  frame.id = 'old-song-player';
  host.insertBefore(frame, link);
 }

 function cancelYouTube() {
  attempt++;
  clearTimeout(readyTimer);
  readyTimer = 0;
  loading = false;
  ready = false;
  youtubePlaying = false;
  cancelVolumeRamp();
  const old = player;
  player = null;
  try { old?.destroy(); } catch {}
  ensureFrame();
  updateLabels();
 }

 function externalPlaying() {
  return source === 'youtube' && youtubePlaying || source === 'local' && localPlaying;
 }

 function youtubeFailure() {
  if (disposed) return;
  cancelYouTube();
  source = 'builtin';
  externalDesired = false;
  triedYouTube = true;
  status.textContent = '音源加载失败，已恢复内置港风音乐；可以打开官方链接或选择本机音频。';
  updateLabels();
  syncPlayback();
 }

 async function load() {
  if (disposed || source !== 'youtube' || !externalDesired || !soundSnapshot.musicEnabled) return;
  if (ready) {
   if (!youtubePlaying) {
    try { player.playVideo(); } catch { youtubeFailure(); }
   }
   return;
  }
  if (loading) return;
  loading = true;
  triedYouTube = true;
  const token = ++attempt;
  status.textContent = '正在连接官方音源…';
  updateLabels();
  try {
   if (!window.YT?.Player) await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(Error('timeout')), 15000);
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
     clearTimeout(timeout);
     if (typeof previous === 'function') try { previous(); } catch {}
     resolve();
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.onerror = () => {clearTimeout(timeout); reject(Error('network'));};
    document.head.append(script);
   });
   if (disposed || token !== attempt || source !== 'youtube') return;
   readyTimer = setTimeout(() => {if (token === attempt) youtubeFailure();}, 15000);
   player = new window.YT.Player('old-song-player', {
    width: '100%',
    height: 220,
    videoId: 'd44u2W-votY',
    playerVars: {playsinline: 1, loop: 1, playlist: 'd44u2W-votY', origin: location.origin},
    events: {
     onReady: () => {
      if (disposed || token !== attempt) return;
      clearTimeout(readyTimer);
      readyTimer = 0;
      ready = true;
      loading = false;
      currentYoutubeVolume = 0;
      updateLabels();
      if (source !== 'youtube' || !externalDesired || !soundSnapshot.musicEnabled) {
       try { player.pauseVideo(); } catch {}
       syncPlayback();
       return;
      }
      volume();
      try { player.playVideo(); } catch { youtubeFailure(); }
      status.textContent = '若没有自动播放，请点击播放器的播放按钮。';
     },
     onStateChange: event => {
      if (disposed || token !== attempt) return;
      if (event.data === 1 && (source !== 'youtube' || !externalDesired || !soundSnapshot.musicEnabled)) {
       try { player.pauseVideo(); } catch {}
       return;
      }
      youtubePlaying = event.data === 1;
      if (source === 'youtube' && youtubePlaying) {
       status.textContent = '播放中 · 阿明说话和录音时自动调整音量';
      }
      updateLabels();
      syncPlayback();
     },
     onError: () => {if (token === attempt && source === 'youtube') youtubeFailure();},
    },
   });
  } catch {
   if (token === attempt && source === 'youtube') youtubeFailure();
  }
 }

 function stopLocal() {
  localAttempt++;
  const old = local;
  local = null;
  localPlaying = false;
  if (old) {
   old.onplay = null;
   old.onpause = null;
   try { old.pause(); } catch {}
   bus.release(old);
  }
  if (blobUrl) URL.revokeObjectURL(blobUrl);
  blobUrl = null;
 }

 function localFailure(audio, token) {
  if (disposed || token !== localAttempt || audio !== local) return;
  source = 'builtin';
  externalDesired = false;
  stopLocal();
  status.textContent = '本机音频播放失败，已恢复内置港风音乐。';
  updateLabels();
  syncPlayback();
 }

 function playLocal() {
  const audio = local;
  if (!audio || disposed || !audio.paused || source !== 'local' || !externalDesired) return;
  const token = localAttempt;
  bus.route(audio);
  bus.resume().catch(() => {});
  try {
   const pending = audio.play();
   if (pending?.catch) pending.catch(() => {
    if (soundSnapshot.musicEnabled) localFailure(audio, token);
   });
  } catch {
   if (soundSnapshot.musicEnabled) localFailure(audio, token);
  }
 }

 function syncPlayback() {
  if (disposed) return;
  if (!soundSnapshot.musicEnabled) {
   if (loading) cancelYouTube();
   offline.pause();
   if (local && !local.paused) local.pause();
   if (ready && youtubePlaying) try { player.pauseVideo(); } catch {}
   return;
  }

  if (source === 'local' && externalDesired && local?.paused) playLocal();
  if (source === 'youtube' && externalDesired) {
   if (ready) {
    if (!youtubePlaying) try { player.playVideo(); } catch { youtubeFailure(); return; }
   } else if (!loading) load();
  }

  if (unlocked && !externalPlaying()) {
   if (offline.paused) {
    try {
     const pending = offline.play();
     if (pending?.catch) pending.catch(() => {
      bedNote.textContent = '点击“背景音乐”重试内置音乐；仍可选择在线或本机歌曲。';
     });
    } catch {}
   }
  } else if (externalPlaying()) offline.pause();
 }

 function applySound(snapshot) {
  soundSnapshot = snapshot;
  updateLabels();
  volume();
  syncPlayback();
 }

 async function unlock() {
  if (disposed) return;
  unlocked = true;
  const token = ++wakeVersion;
  try { await bus.resume(); } catch {}
  if (disposed || token !== wakeVersion) return;
  bus.route(offline);
  if (local) bus.route(local);
  volume();
  syncPlayback();
 }

 function onOfficial() {
  unlock();
  if (source === 'youtube' && externalDesired) {
   source = 'builtin';
   externalDesired = false;
   youtubePlaying = false;
   if (loading) cancelYouTube();
   else if (ready) try { player.pauseVideo(); } catch {}
   status.textContent = '已停用在线音源，正在播放内置港风音乐。';
   updateLabels();
   syncPlayback();
   return;
  }
  source = 'youtube';
  externalDesired = true;
  triedYouTube = true;
  stopLocal();
  controller.setMusicEnabled(true);
  updateLabels();
  load();
  syncPlayback();
 }

 function onFile() {
  const selected = file.files?.[0];
  if (!selected) return;
  source = 'local';
  externalDesired = true;
  youtubePlaying = false;
  if (loading) cancelYouTube();
  else if (ready) try { player.pauseVideo(); } catch {}
  stopLocal();
  blobUrl = URL.createObjectURL(selected);
  const audio = new Audio(blobUrl);
  local = audio;
  audio.loop = true;
  audio.preload = 'auto';
  const token = localAttempt;
  audio.onplay = () => {
   if (disposed || token !== localAttempt || audio !== local || source !== 'local') {
    try { audio.pause(); } catch {}
    return;
   }
   localPlaying = true;
   status.textContent = `本机播放：${selected.name}`;
   syncPlayback();
  };
  audio.onpause = () => {
   if (token !== localAttempt || audio !== local) return;
   localPlaying = false;
   syncPlayback();
  };
  controller.setMusicEnabled(true);
  unlock();
  volume();
  updateLabels();
  syncPlayback();
 }

 function onBed() {
  unlock();
  controller.toggleMusic();
 }

 function destroy() {
  if (disposed) return;
  disposed = true;
  wakeVersion++;
  unsubscribe();
  if (ownsSound) controller.destroy();
  document.removeEventListener('pointerdown', unlock);
  document.removeEventListener('keydown', unlock);
  window.removeEventListener('pagehide', destroy);
  button.removeEventListener('click', onOfficial);
  file.removeEventListener('change', onFile);
  bedButton.removeEventListener('click', onBed);
  cancelYouTube();
  stopLocal();
  offline.pause();
  bus.release(offline);
  bus.close();
 }

 button.addEventListener('click', onOfficial);
 file.addEventListener('change', onFile);
 bedButton.addEventListener('click', onBed);
 document.addEventListener('pointerdown', unlock);
 document.addEventListener('keydown', unlock);
 window.addEventListener('pagehide', destroy);
 unsubscribe = controller.subscribe(applySound);

 return {destroy};
}
