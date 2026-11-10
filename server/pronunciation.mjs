import { Buffer } from 'node:buffer';

const LOCALE = 'zh-HK';
const MAX_WAV_BYTES = 44 + 15 * 32000;
const WORD_ERRORS = new Set(['None', 'Omission', 'Insertion', 'Mispronunciation']);

export class PronunciationError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function decodePracticeWav(audioBase64) {
  if (typeof audioBase64 !== 'string' || !audioBase64 ||
      audioBase64.length > Math.ceil(MAX_WAV_BYTES / 3) * 4 ||
      !/^(?:[A-Za-z0-9+/]{4})+(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(audioBase64)) {
    throw new PronunciationError('INVALID_INPUT', '录音格式无效，请重新录音。');
  }
  const audio = Buffer.from(audioBase64, 'base64');
  // The browser's recorder generates a 44-byte PCM header without extra chunks.
  if (audio.length < 44 || audio.length > MAX_WAV_BYTES ||
      audio.toString('ascii', 0, 4) !== 'RIFF' || audio.toString('ascii', 8, 16) !== 'WAVEfmt ' ||
      audio.readUInt32LE(4) !== audio.length - 8 || audio.readUInt32LE(16) !== 16 ||
      audio.readUInt16LE(20) !== 1 || audio.readUInt16LE(22) !== 1 ||
      audio.readUInt32LE(24) !== 16000 || audio.readUInt32LE(28) !== 32000 ||
      audio.readUInt16LE(32) !== 2 || audio.readUInt16LE(34) !== 16 ||
      audio.toString('ascii', 36, 40) !== 'data' || audio.readUInt32LE(40) !== audio.length - 44 || audio.length % 2) {
    throw new PronunciationError('INVALID_INPUT', '录音格式无效，请重新录音。');
  }
  if (audio.length < 44 + 8000) throw new PronunciationError('PRACTICE_NO_SPEECH', '录音太短，请读完句子后再停止。');
  let hasSignal = false;
  for (let offset = 44; offset < audio.length; offset += 2) {
    if (audio.readInt16LE(offset) !== 0) {
      hasSignal = true;
      break;
    }
  }
  if (!hasSignal) throw new PronunciationError('PRACTICE_NO_SPEECH', '没录到声音，请再读一次。');
  return audio;
}

const score = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;

function normalizeResult(payload) {
  if (['NoMatch', 'InitialSilenceTimeout', 'BabbleTimeout'].includes(payload?.RecognitionStatus)) {
    throw new PronunciationError('PRACTICE_NO_SPEECH', '没听清这句话，请靠近麦克风再试。');
  }
  const best = payload?.NBest?.[0];
  const assessment = best?.PronunciationAssessment ?? best;
  const scores = {
    accuracy: score(assessment?.AccuracyScore),
    fluency: score(assessment?.FluencyScore),
    completeness: score(assessment?.CompletenessScore),
    overall: score(assessment?.PronScore),
  };
  if (payload?.RecognitionStatus !== 'Success' || scores.accuracy === null) {
    throw new PronunciationError('PRACTICE_UPSTREAM_ERROR', '评测服务没有返回有效分数，请稍后再试。');
  }
  const words = Array.isArray(best.Words) ? best.Words.slice(0, 120).flatMap(word => {
    if (typeof word?.Word !== 'string' || !word.Word.trim()) return [];
    const detail = word.PronunciationAssessment ?? word;
    const error = WORD_ERRORS.has(detail.ErrorType) ? detail.ErrorType : null;
    return [{ text: word.Word.slice(0, 80), accuracy: error === 'Omission' ? null : score(detail.AccuracyScore), error }];
  }) : [];
  return { provider: 'azure-speech', locale: LOCALE, scores, words, unsupportedDimensions: ['tone', 'spokenJyutping', 'prosody'] };
}

export function createPronunciationProvider({ env = process.env, fetchImpl = fetch } = {}) {
  const key = env.AZURE_SPEECH_KEY?.trim();
  const region = env.AZURE_SPEECH_REGION?.trim().toLowerCase();
  const configured = Boolean(key && region && /^[a-z][a-z0-9]{1,29}$/.test(region));

  async function assess({ audioBase64, referenceText }) {
    if (!configured) throw new PronunciationError('PRACTICE_UNCONFIGURED', '发音评测暂未配置。');
    if (typeof referenceText !== 'string' || !referenceText.trim() || referenceText.length > 120) {
      throw new PronunciationError('INVALID_INPUT', '练习题目无效。');
    }
    const audio = decodePracticeWav(audioBase64);
    const config = {
      ReferenceText: referenceText,
      GradingSystem: 'HundredMark',
      Granularity: 'Word',
      Dimension: 'Comprehensive',
      EnableMiscue: true,
    };
    const url = `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${LOCALE}&format=detailed`;
    let response;
    let payload;
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': key,
          'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000',
          'Pronunciation-Assessment': Buffer.from(JSON.stringify(config), 'utf8').toString('base64'),
          Accept: 'application/json',
        },
        body: audio,
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      });
      if (response.ok) payload = await response.json();
    } catch (error) {
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
        throw new PronunciationError('PRACTICE_TIMEOUT', '评测超时，请再试一次。');
      }
      throw new PronunciationError('PRACTICE_UPSTREAM_ERROR', '暂时无法连接发音评测，请再试一次。');
    }
    if (response.status === 429) throw new PronunciationError('PRACTICE_RATE_LIMITED', '评测请求太多，请稍等再试。');
    return normalizeResult(payload);
  }

  return { configured, assess };
}
