const DEFAULT_VOLUME = 0.5;
const MUSIC_BASE_GAIN = 0.44;
const AMBIENT_BASE_GAIN = 0.23;
const SCENE_MIX = Object.freeze({
 outside: 1,
 interior: 0.55,
});
const MUSIC_KEY = 'yue-kei-music';
const AMBIENCE_KEY = 'yue-kei-ambience';
const VOLUME_KEY = 'yue-kei-music-volume';

function clamp01(value) {
 return Math.min(1, Math.max(0, value));
}

function normalizeVolume(volume) {
 if (typeof volume !== 'number' || !Number.isFinite(volume)) return DEFAULT_VOLUME;
 return clamp01(volume);
}

function normalizeVoice(voice) {
 const safe = voice && typeof voice === 'object' ? voice : {};
 return {
  npcActive: Boolean(safe.npcActive),
  recording: Boolean(safe.recording),
  busy: Boolean(safe.busy),
  active: Boolean(safe.active),
 };
}

/**
 * 只计算目标增益，不保存状态，也不触发播放、定时器或界面操作。
 * active 在没有独立 NPC 字段的旧事件中回退为处理中；新事件不会把 NPC 再算一次 busy。
 */
export function soundTargets({
 voice = {},
 practiceActive = false,
 hidden = false,
 musicEnabled = true,
 ambienceEnabled = true,
 volume = DEFAULT_VOLUME,
 location = 'outside',
} = {}) {
 const safeVoice = voice && typeof voice === 'object' ? voice : {};

 // 后台和录音是全局最高优先级，包括 sceneMix 在内全部归零。
 if (hidden || safeVoice.recording) {
  return { musicGain: 0, ambientGain: 0, sceneMix: 0 };
 }

 const safeLocation = location === 'interior' ? 'interior' : 'outside';
 const sceneMix = SCENE_MIX[safeLocation];
 const safeVolume = normalizeVolume(volume);
 const npcActive = Boolean(safeVoice.npcActive);
 const processing = Boolean(safeVoice.busy || (safeVoice.active && !npcActive));

 // 每路状态独立衰减；叠加时相乘，一路结束不会清除其他衰减。
 let musicDuck = 1;
 let ambientDuck = 1;

 if (practiceActive) {
  musicDuck *= 0.2;
  ambientDuck *= 0.08;
 }

 if (npcActive) {
  musicDuck *= 0.25;
  ambientDuck *= 0.1;
 }

 if (processing) {
  musicDuck *= 0.65;
  ambientDuck *= 0.55;
 }

 const musicGain = musicEnabled === false
  ? 0
  : clamp01(safeVolume * MUSIC_BASE_GAIN * musicDuck);
 const ambientGain = ambienceEnabled === false
  ? 0
  : clamp01(AMBIENT_BASE_GAIN * sceneMix * ambientDuck);

 return { musicGain, ambientGain, sceneMix };
}

function readStored(key, fallback) {
 try {
  const value = window.localStorage.getItem(key);
  return value === null ? fallback : value;
 } catch {
  return fallback;
 }
}

function writeStored(key, value) {
 try { window.localStorage.setItem(key, value); } catch {}
}

/**
 * 统一声音状态。musicButton 是所有背景音乐来源的总开关，volumeControl 是音乐音量滑杆。
 * subscribe(listener) 会立即发送当前快照，并返回可重复调用的解除订阅函数。
 */
export function createSoundscape({ musicButton = null, volumeControl = null } = {}) {
 const win = typeof window === 'undefined' ? null : window;
 const doc = typeof document === 'undefined' ? null : document;
 const listeners = new Set();
 const state = {
  location: 'outside',
  voice: normalizeVoice(),
  practiceActive: false,
  hidden: Boolean(doc?.hidden),
  musicEnabled: readStored(MUSIC_KEY, 'on') !== 'off',
  ambienceEnabled: readStored(AMBIENCE_KEY, 'on') !== 'off',
  volume: normalizeVolume(Number(readStored(VOLUME_KEY, DEFAULT_VOLUME))),
 };
 let disposed = false;

 function getSnapshot() {
  const targets = soundTargets(state);
  return Object.freeze({
   location: state.location,
   voice: Object.freeze({ ...state.voice }),
   practiceActive: state.practiceActive,
   hidden: state.hidden,
   musicEnabled: state.musicEnabled,
   ambienceEnabled: state.ambienceEnabled,
   volume: state.volume,
   ...targets,
  });
 }

 function syncControls() {
  if (musicButton) {
   musicButton.textContent = `背景音樂：${state.musicEnabled ? '開' : '關'}`;
   musicButton.setAttribute('aria-pressed', String(state.musicEnabled));
  }
  if (volumeControl) {
   volumeControl.min = '0';
   volumeControl.max = '1';
   volumeControl.step = '0.01';
   volumeControl.value = String(state.volume);
   volumeControl.setAttribute('aria-label', '音樂音量');
  }
 }

 function emit() {
  if (disposed) return;
  syncControls();
  const snapshot = getSnapshot();
  for (const listener of [...listeners]) listener(snapshot);
 }

 function setLocation(location) {
  const next = location === 'interior' ? 'interior' : 'outside';
  if (state.location === next) return getSnapshot();
  state.location = next;
  emit();
  return getSnapshot();
 }

 function setMusicEnabled(enabled) {
  const next = Boolean(enabled);
  if (state.musicEnabled !== next) {
   state.musicEnabled = next;
   writeStored(MUSIC_KEY, next ? 'on' : 'off');
   emit();
  }
  return getSnapshot();
 }

 function toggleMusic() {
  return setMusicEnabled(!state.musicEnabled);
 }

 function setAmbienceEnabled(enabled) {
  const next = Boolean(enabled);
  if (state.ambienceEnabled !== next) {
   state.ambienceEnabled = next;
   writeStored(AMBIENCE_KEY, next ? 'on' : 'off');
   emit();
  }
  return getSnapshot();
 }

 function toggleAmbience() {
  return setAmbienceEnabled(!state.ambienceEnabled);
 }

 function setVolume(volume) {
  const next = normalizeVolume(typeof volume === 'number' ? volume : Number(volume));
  if (state.volume !== next) {
   state.volume = next;
   writeStored(VOLUME_KEY, String(next));
   emit();
  }
  return getSnapshot();
 }

 function subscribe(listener) {
  if (typeof listener !== 'function') throw new TypeError('subscribe 需要 listener 函数');
  if (disposed) {
   listener(getSnapshot());
   return () => {};
  }
  listeners.add(listener);
  listener(getSnapshot());
  let subscribed = true;
  return () => {
   if (!subscribed) return;
   subscribed = false;
   listeners.delete(listener);
  };
 }

 function onVoice(event) {
  const detail = event?.detail || {};
  if (detail.source === 'practice') return;
  const next = normalizeVoice(detail);
  if (Object.keys(next).every(key => next[key] === state.voice[key])) return;
  state.voice = next;
  emit();
 }

 function onPractice(event) {
  const next = Boolean(event?.detail?.active);
  if (state.practiceActive === next) return;
  state.practiceActive = next;
  emit();
 }

 function onVisibility() {
  state.hidden = Boolean(doc?.hidden);
  emit();
 }

 function onMusicButton() { toggleMusic(); }
 function onVolume() { setVolume(volumeControl.value); }

 win?.addEventListener('voice-activity', onVoice);
 win?.addEventListener('practice-activity', onPractice);
 doc?.addEventListener('visibilitychange', onVisibility);
 musicButton?.addEventListener('click', onMusicButton);
 volumeControl?.addEventListener('input', onVolume);
 syncControls();

 function destroy() {
  if (disposed) return;
  disposed = true;
  listeners.clear();
  win?.removeEventListener('voice-activity', onVoice);
  win?.removeEventListener('practice-activity', onPractice);
  win?.removeEventListener('pagehide', destroy);
  doc?.removeEventListener('visibilitychange', onVisibility);
  musicButton?.removeEventListener('click', onMusicButton);
  volumeControl?.removeEventListener('input', onVolume);
 }

 win?.addEventListener('pagehide', destroy);

 return {
  setLocation,
  subscribe,
  getSnapshot,
  toggleMusic,
  setMusicEnabled,
  toggleAmbience,
  setAmbienceEnabled,
  setVolume,
  destroy,
 };
}

export default soundTargets;
