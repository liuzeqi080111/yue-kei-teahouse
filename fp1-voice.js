// FP1-VOICE-01: story-driven voice adapter over the existing neighborhood client.
import { createNeighborhoodVoice } from './neighborhood-voice.js';

const NPC = Object.freeze({ npcId: 'fang', name: '芳姐', role: '洗衣店老板娘' });
const VOICE_PHASES = new Set(['counter', 'choice']);
const FACTS = Object.freeze({
  counter: Object.freeze([
    '阿晴听日要见工，洗衣店俾错咗件褛。',
    '你手上有取件单，芳姐要核对。',
  ]),
  choice: Object.freeze([
    '阿晴听日要见工，洗衣店俾错咗件褛。',
    '芳姐话可能两位客人攞反咗件褛。',
  ]),
});

export function createFp1Voice({
  getStory,
  applyChoice,
  onLine,
  onStatus,
  onRecording,
  onActivity,
  onTranscript,
  ...options
} = {}) {
  if (typeof getStory !== 'function') throw new TypeError('createFp1Voice 需要 getStory');
  if (typeof applyChoice !== 'function') throw new TypeError('createFp1Voice 需要 applyChoice');

  const readStory = () => {
    const story = getStory();
    if (!story || typeof story !== 'object' || Array.isArray(story)) {
      throw new TypeError('getStory 必须返回对象');
    }
    return story;
  };

  function getContext() {
    let story;
    try {
      story = readStory();
    } catch {
      return null;
    }
    if (!VOICE_PHASES.has(story.phase)) return null;

    const choices = Array.isArray(story.choices) ? story.choices : [];
    return {
      npcId: NPC.npcId,
      name: NPC.name,
      role: NPC.role,
      facts: [...FACTS[story.phase]],
      allowedActions: choices.map((choice) => ({ id: choice.id, label: choice.label })),
    };
  }

  function getRevision() {
    return readStory().revision;
  }

  function applyAction(id) {
    let story;
    try {
      story = readStory();
    } catch {
      return { ok: false, text: '当前对话状态无效。' };
    }

    if (!VOICE_PHASES.has(story.phase)) {
      return { ok: false, text: '当前阶段唔可以执行呢个动作。' };
    }

    const choices = Array.isArray(story.choices) ? story.choices : [];
    if (typeof id !== 'string' || !choices.some((choice) => choice.id === id)) {
      return { ok: false, text: '呢个动作唔喺当前可选范围。' };
    }

    let accepted = false;
    try {
      accepted = applyChoice(id) === true;
    } catch {
      return { ok: false, text: '呢个动作未能执行。' };
    }
    if (!accepted) return { ok: false, text: '呢个动作未被接受。' };

    return { ok: true, text: readStory().text, meaning: '' };
  }

  return createNeighborhoodVoice({
    ...options,
    onLine,
    onStatus,
    onRecording,
    onActivity,
    onTranscript,
    getContext,
    getRevision,
    applyAction,
    autoSpeak: false,
  });
}
