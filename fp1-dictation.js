// FP1-DICTATION-01: single-utterance browser dictation adapter (no UI, no uploads).

const MAX_MS = 12000;

function errorMessage(code) {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return '无法使用麦克风，请检查浏览器的麦克风权限。';
    case 'audio-capture':
      return '找不到麦克风，请检查设备连接。';
    case 'no-speech':
      return '没有听到声音，请再试一次。';
    case 'network':
      return '语音识别网络连接失败，请稍后再试。';
    case 'aborted':
      return '语音识别已中断，请再试一次。';
    case 'language-not-supported':
      return '当前浏览器不支持粤语听写，请改用文字输入。';
    default:
      return '语音识别失败，请再试一次。';
  }
}

export function createFp1Dictation({
  Recognition = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition,
  onText = () => {},
  onStatus = () => {},
} = {}) {
  const supported = typeof Recognition === 'function';
  const textHandler = typeof onText === 'function' ? onText : () => {};
  const statusHandler = typeof onStatus === 'function' ? onStatus : () => {};
  let current = null;

  function detach(session) {
    const recognition = session.recognition;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
  }

  function cleanup(session) {
    if (session.finished) return false;
    session.finished = true;
    if (session.timer !== null) {
      clearTimeout(session.timer);
      session.timer = null;
    }
    detach(session);
    if (current === session) current = null;
    return true;
  }

  function handleResult(session, event) {
    if (current !== session || session.finished) return;

    let transcript = '';
    const results = event && event.results;
    if (results) {
      for (let index = 0; index < results.length; index += 1) {
        const result = results[index];
        if (!result || !result.isFinal) continue;
        const alternative = result[0];
        if (alternative && typeof alternative.transcript === 'string') {
          transcript = alternative.transcript.trim();
          break;
        }
      }
    }
    if (!transcript) return;

    cleanup(session);
    try { session.recognition.abort(); } catch {}
    textHandler(transcript);
    statusHandler({ state: 'ready', message: '听写完成。' });
  }

  function handleEnd(session) {
    if (current !== session || session.finished) return;
    cleanup(session);
    statusHandler({ state: 'ready', message: '未识别到内容，请再试一次。' });
  }

  function handleError(session, event) {
    if (current !== session || session.finished) return;
    const code = event && event.error;
    cleanup(session);
    try { session.recognition.abort(); } catch {}
    statusHandler({ state: 'error', message: errorMessage(code) });
  }

  function handleTimeout(session) {
    if (current !== session || session.finished) return;
    cleanup(session);
    try { session.recognition.abort(); } catch {}
    statusHandler({ state: 'error', message: '听写超时，请再试一次。' });
  }

  function start() {
    if (!supported) {
      statusHandler({ state: 'error', message: '当前浏览器不支持语音听写，请改用文字输入。' });
      return false;
    }
    if (current) return false;

    let recognition;
    try {
      recognition = new Recognition();
    } catch {
      statusHandler({ state: 'error', message: '无法开始听写，请检查麦克风权限后再试。' });
      return false;
    }

    const session = { recognition, finished: false, stopping: false, timer: null };
    current = session;

    try {
      recognition.lang = 'zh-HK';
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.onresult = (event) => handleResult(session, event);
      recognition.onerror = (event) => handleError(session, event);
      recognition.onend = () => handleEnd(session);
      recognition.start();
    } catch {
      cleanup(session);
      try { recognition.abort(); } catch {}
      statusHandler({ state: 'error', message: '无法开始听写，请检查麦克风权限后再试。' });
      return false;
    }

    session.timer = setTimeout(() => handleTimeout(session), MAX_MS);
    statusHandler({ state: 'listening', message: '请讲一句粤语。' });
    return true;
  }

  function stop() {
    if (!current) return false;
    const session = current;
    if (session.stopping) return true;

    session.stopping = true;
    try {
      session.recognition.stop();
    } catch {
      cleanup(session);
      try { session.recognition.abort(); } catch {}
      statusHandler({ state: 'error', message: '停止听写失败，请再试一次。' });
      return false;
    }
    return true;
  }

  function cancel() {
    if (!current) return false;
    const session = current;
    cleanup(session);
    try { session.recognition.abort(); } catch {}
    return true;
  }

  return {
    supported,
    get active() {
      return current !== null;
    },
    start,
    stop,
    cancel,
  };
}
