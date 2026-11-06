/**
 * 浏览器语音面板：录音→ASR→自动提交→bridge.apply→字幕→TTS。
 * 业务执行只经 voice-bridge；模型话术不作为动作成功依据。无 innerHTML 插入 API 文字。
 */
import {createVoiceBridge} from './voice-bridge.js';
import {preparePcm,encodeVoiceWav,recordingMimeType} from './voice-capture.js';
import {createNpcSpeech} from './npc-speech.js';
import {voiceUrl} from './voice-endpoint.js';

const MAX_MS = 15000, TIMEOUT = 35000;
const WAV_MIME = 'audio/wav';
const el = (tag, props, text) => { const n = document.createElement(tag); Object.assign(n, props); if (text !== undefined) n.textContent = text; return n; };

export function mountVoice({ game, host, getPracticeTarget, onPracticeAttempt } = {}) {
  if (!game || !host) throw new TypeError('mountVoice 需要 game 与 host');
  const bridge = createVoiceBridge({ game });
  const root = el('section', { className: 'voice-panel', ariaLabel: '語音對話' });
  const status = el('p', { className: 'voice-status', role: 'status', ariaLive: 'polite' }, '準備中…');
  const input = el('textarea', { maxLength: 500, rows: 2, ariaLabel: '输入文字', placeholder: '也可以在这里输入文字。' });
  const micBtn = el('button', { type: 'button', ariaLabel: '开始说话' }, '开始说话');
  const sendBtn = el('button', { type: 'button', ariaLabel: '發送文字' }, '發送');
  const cancelBtn = el('button', { type: 'button', ariaLabel: '取消本次語音', hidden: true }, '取消');
  const retryBtn=el('button',{type:'button',hidden:true},'重新連接語音');
  const replayBtn = el('button', { type: 'button', ariaLabel: '重播阿明回答', disabled: true }, '重播');
  const muteBox = el('input', { type: 'checkbox', ariaLabel: '靜音' });
  const muteLabel = el('label', {}, '靜音 '); muteLabel.append(muteBox);
  const replyEl = el('p', { className: 'voice-reply', ariaLive: 'polite' });
  const hint = el('small', {}, '停止录音后会自动发送。录音将提交至阿里云识别。');
  const row = el('div', { className: 'voice-controls' }); row.append(micBtn, sendBtn, cancelBtn, replayBtn, muteLabel,retryBtn);
  const deviceLabel=el('label',{className:'mic-device'},'咪高峰 ');
  const deviceSelect=el('select',{ariaLabel:'選擇咪高峰'});deviceSelect.append(el('option',{value:''},'系統預設咪高峰'));deviceLabel.append(deviceSelect);
  const detectBtn=el('button',{type:'button',className:'mic-detect'},'檢測咪高峰');
  const meter=el('meter',{min:0,max:1,value:0,ariaLabel:'咪高峰輸入音量'});
  const meterText=el('small',{className:'mic-level'},'錄音時會顯示收到的聲音');
  const monitor=el('div',{className:'mic-monitor'});monitor.append(meter,meterText);
  const devices=el('details',{className:'voice-devices',hidden:true});
  devices.append(el('summary',{},'检查麦克风'),deviceLabel,detectBtn);
  const transcriptToggle=el('input',{type:'checkbox'});
  const transcriptLabel=el('label',{},'显示识别文字 ');transcriptLabel.append(transcriptToggle);
  const transcriptView=el('p',{className:'voice-transcript',hidden:true});
  transcriptToggle.addEventListener('change',()=>{transcriptView.hidden=!transcriptToggle.checked||!transcriptView.textContent;});
  root.append(status,input,row,monitor,devices,transcriptLabel,transcriptView,replyEl,hint);host.append(root);

  let configured = false, runId = 0, applying = false, recorder = null, stream = null, recordTimer = 0;
  let aborter = null, lastReply = '', lastReplyRate = 1, lastKey = '';
  let working=false,destroyed=false,serviceRound=null,interpreting=false;
  const queued=[];
  let lastNpcLine='',lineTimer=0,suppressLine=false,releaseFarewell=null,farewellText='';
  const speech=createNpcSpeech({onActivity:()=>{game.setSpeech?.(speech.active);refreshButtons();},onState:t=>{if(!working)setState(t);},onSettled:text=>{if(text===farewellText){releaseFarewell?.();releaseFarewell=null;farewellText='';}}});
  const bizKey = (s) => JSON.stringify([s.state, s.view.orderReview]);
  const setState = (t) => { status.textContent = t; };
  const ready = () => { if (configured) setState('準備好'); refreshButtons(); };
  function refreshButtons() {
    const busy = game.snapshot().view.busy;
    detectBtn.disabled=working||busy;
    micBtn.disabled = working && !recorder;
    sendBtn.disabled = working || !input.value.trim();
    cancelBtn.hidden = !working && !queued.length;
    micBtn.textContent = recorder ? '停止录音' : '开始说话';
    micBtn.setAttribute('aria-label', micBtn.textContent);
    replayBtn.disabled = working || busy || !game.snapshot().state.waiterPresent || muteBox.checked || !lastReply;
    window.dispatchEvent(new CustomEvent('voice-activity',{detail:{active:working||speech.active,source:'voice',npcActive:speech.active,recording:Boolean(recorder),busy:working}}));
  }
  let monitorCtx=null,monitorTimer=0,monitorSource=null,monitorSink=null;
  async function loadDevices(){
   try{const selected=deviceSelect.value;const devices=await navigator.mediaDevices.enumerateDevices();if(destroyed)return;
    deviceSelect.replaceChildren(el('option',{value:''},'系統預設咪高峰'));
    devices.filter(d=>d.kind==='audioinput'&&d.deviceId).forEach((d,i)=>deviceSelect.append(el('option',{value:d.deviceId},d.label||`咪高峰 ${i+1}`)));
    if([...deviceSelect.options].some(o=>o.value===selected))deviceSelect.value=selected;
   }catch{}
  }
  function stopMonitor(){clearInterval(monitorTimer);monitorTimer=0;monitorSource?.disconnect();monitorSource=null;monitorSink?.disconnect();monitorSink=null;monitorCtx?.close().catch(()=>{});monitorCtx=null;meter.value=0;deviceSelect.disabled=false;}
  function watchMic(captured){
   const track=captured.getAudioTracks()[0],name=track?.label||'目前咪高峰';
   if(!monitorCtx){meterText.textContent='正在錄音：'+name;return;}
   monitorSource=monitorCtx.createMediaStreamSource(captured);const analyser=monitorCtx.createAnalyser();analyser.fftSize=2048;monitorSource.connect(analyser);monitorSink=monitorCtx.createGain();monitorSink.gain.value=0;analyser.connect(monitorSink);monitorSink.connect(monitorCtx.destination);
   const data=new Float32Array(analyser.fftSize);let peakSeen=0;
   monitorTimer=setInterval(()=>{analyser.getFloatTimeDomainData(data);let sum=0;for(const v of data)sum+=v*v;const rms=Math.sqrt(sum/data.length);peakSeen=Math.max(peakSeen,rms);meter.value=Math.min(1,Math.sqrt(rms)*4);
    meterText.textContent=track?.muted?`咪高峰暫時無訊號：${name}`:rms>1e-6?`收到聲音 · ${name}`:peakSeen>1e-6?`正在等你繼續講 · ${name}`:`未收到訊號 · 可停止後切換咪高峰`;
   },100);
  }
  // Explicit user-started local check: measure devices, never upload or save audio.
  detectBtn.addEventListener('click',async()=>{
   if(working||game.snapshot().view.busy)return;
   if(!navigator.mediaDevices?.getUserMedia){setState('此瀏覽器不支援咪高峰，請在系統瀏覽器開啟，或直接輸入文字。');return;}
   cancel();working=true;const id=runId;refreshButtons();deviceSelect.disabled=true;
   let best=null;
   try{
    const initial=await navigator.mediaDevices.getUserMedia({audio:true});
    if(id!==runId){initial.getTracks().forEach(t=>t.stop());return;}
    initial.getTracks().forEach(t=>t.stop());await loadDevices();
    const devices=[...deviceSelect.options].filter(o=>o.value&&!['default','communications'].includes(o.value)).slice(0,6);
    if(!devices.length)devices.push({value:'',textContent:'系統預設咪高峰'});
    setState('請持續講「一二三」，正在逐個檢測咪高峰（只在本機）…');
    for(const device of devices){
     if(id!==runId)return;
     try{
      const capture=await navigator.mediaDevices.getUserMedia({audio:{deviceId:device.value?{exact:device.value}:undefined,echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
      if(id!==runId){capture.getTracks().forEach(t=>t.stop());return;}
      stream=capture;monitorCtx=new (window.AudioContext||window.webkitAudioContext)();await monitorCtx.resume();
      if(id!==runId)return;
      const source=monitorCtx.createMediaStreamSource(capture),analyser=monitorCtx.createAnalyser(),sink=monitorCtx.createGain();sink.gain.value=0;
      source.connect(analyser);analyser.connect(sink);sink.connect(monitorCtx.destination);analyser.fftSize=2048;
      const data=new Float32Array(analyser.fftSize);let energy=0;
      for(let n=0;n<30;n++){
       await new Promise(r=>setTimeout(r,100));if(id!==runId)return;
       analyser.getFloatTimeDomainData(data);let sum=0;for(const v of data)sum+=v*v;const rms=Math.sqrt(sum/data.length);energy+=rms*rms;meter.value=Math.min(1,Math.sqrt(rms)*4);meterText.textContent='檢測中：'+device.textContent;
      }
      const level=Math.sqrt(energy/30);if(!best||level>best.level)best={value:device.value,name:device.textContent,level};
      source.disconnect();analyser.disconnect();sink.disconnect();stopMic();deviceSelect.disabled=true;
     }catch{if(id!==runId)return;stopMic();}
    }
    if(id!==runId)return;
    if(best?.level>1e-7){deviceSelect.value=best.value;setState('已選擇收到聲音的咪高峰。請按「開始說話」重錄。');meterText.textContent=best.name;}
    else{setState('所有咪高峰都未收到訊號。請檢查耳機／電腦的咪高峰靜音鍵，以及 Windows 聲音設定的輸入裝置。');meterText.textContent='本機檢測無訊號，尚未送出識別。';}
   }catch(e){if(id===runId)setState(e?.name==='NotAllowedError'?'瀏覽器未允許咪高峰。請先允許錄音再檢測。':'未能開啟咪高峰，請檢查連接及裝置是否被其他程式獨佔。');}
   finally{if(id===runId){stopMic();working=false;refreshButtons();}}
  });
  navigator.mediaDevices?.addEventListener?.('devicechange',loadDevices);
  function stopMic() {
    stopMonitor();
    clearTimeout(recordTimer); recordTimer = 0;
    try { if (recorder && recorder.state !== 'inactive') recorder.stop(); } catch {}
    try { stream?.getTracks().forEach((t) => t.stop()); } catch {}
    recorder = null; stream = null;
  }
  function cancel(preserveSpeech=false) { runId++;queued.length=0;interpreting=false;clearTimeout(lineTimer);if(!preserveSpeech){speech.stop();releaseFarewell?.();releaseFarewell=null;} working=false;serviceRound=null; try { aborter?.abort(); } catch {} aborter = null; stopMic(); closeCtx(); ready(); }
  let audioCtx = null;
  function closeCtx() { const c = audioCtx; audioCtx = null; if (c) c.close().catch(() => {}); }

  async function api(path, body) {
    const ctrl = new AbortController(); aborter = ctrl;
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
    try {
      const res = await fetch(voiceUrl(path), {
        method: body === undefined ? 'GET' : 'POST',
        headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body), signal: ctrl.signal,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error?.message || `服務錯誤（${res.status}），請稍後再試。`);
      configured=true;retryBtn.hidden=true;
      return data;
    } catch (e) {
      if (e?.name === 'AbortError') throw new Error('已取消或逾時，請再試一次。');
      if (e instanceof TypeError) throw new Error('未能連接語音服務，文字已保留。若在微信內，請用右上角選單在系統瀏覽器開啟後重試；亦可繼續用遊戲按鈕。');
      throw e;
    } finally { clearTimeout(timer); if (aborter === ctrl) aborter = null; }
  }

  async function playReply(reply, id, rate) {
    if(reply&&!muteBox.checked&&id===runId){const s=game.snapshot();if(!s.view.busy)speech.speak(reply,{rate});}
    return;
  }

  function sendFlow(raw,mode='text') {
    const text = String(raw || '').trim();
    if (!text || working || destroyed) return;
    const size=queued.reduce((total,message)=>total+message.text.length+1,0);
    if(size+text.length>500){setState('已接收的消息较多，请等阿明回应后再试。');return;}
    queued.push({text,mode});
    if(game.snapshot().view.busy){setState('已收到，阿明服务完就会回应。');refreshButtons();return;}
    void drainMessages();
  }

  async function drainMessages() {
    if (working || destroyed || !queued.length) return;
    const before=game.snapshot();
    if (before.view.busy) return;
    const messages=queued.splice(0);
    const text=messages.map(message=>message.text).join('\n');
    const mode=messages.every(message=>message.mode==='voice')?'voice':'text';
    const practiceTarget=typeof getPracticeTarget==='function'?getPracticeTarget():null;
    speech.stop(); working=true; interpreting=true; const id=++runId;
    try {
      setState('理解中'); refreshButtons();
      const tk = bridge.token(), context = bridge.context();
      const proposal = await api('/api/voice/interpret', { text, context });
      if (id !== runId) return; // 迟到回复不执行
      const currentTarget=typeof getPracticeTarget==='function'?getPracticeTarget():null;
      const targetCurrent=Boolean(practiceTarget&&currentTarget&&practiceTarget.round===currentTarget.round&&practiceTarget.phraseId===currentTarget.phraseId&&practiceTarget.key===currentTarget.key);
      applying = true;
      let result;
      try { result = bridge.apply({ ...proposal, playerText: text }, tk); } finally { applying = false; lastKey = bizKey(game.snapshot()); }
      if (id !== runId) return;
      try{onPracticeAttempt?.({target:practiceTarget,mode,editedTranscript:false,result,targetCurrent});}catch{}
      if(result.ok&&game.snapshot().view.busy)serviceRound=game.snapshot().state.round;
      lastReply = game.snapshot().view.beat?.kind==='farewell'?game.snapshot().view.line[1]:result.reply || '';
      lastReplyRate = result.playbackRate === 0.72 ? 0.72 : 1;
      replyEl.textContent = lastReply || '（無回覆）';
      if (result.ok && lastReply && typeof game.say === 'function' && !game.snapshot().view.busy) {
        suppressLine=true;applying=true;
        try { game.say(lastReply, result.meaning || ''); lastNpcLine=game.snapshot().state.round+':'+lastReply; } catch {} finally{suppressLine=false;applying=false;lastKey=bizKey(game.snapshot());}
      }
      const semanticSuccess=result.ok&&result.executedIntents?.length>0;
      setState(result.ok?(semanticSuccess?`意思已理解，合法操作已完成${mode==='voice'?'；未評估發音':''}。`:'已收到回覆，未執行目標操作。'):'未能執行。');
      if(game.snapshot().view.busy){working=false;lastNpcLine='';syncNpc(game.snapshot());}else await playReply(lastReply, id, lastReplyRate);
    } catch (e) { if (id === runId) setState(e.message || '發生錯誤，請再試。'); }
    if(id===runId){working=false;interpreting=false;}
    refreshButtons();
  }

  async function startRecording() {
    if (working || destroyed) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { setState('此瀏覽器不支援錄音。請用右上角選單在系統瀏覽器開啟，或直接輸入文字。'); return; }
    speech.stop(); working=true; refreshButtons(); const id = ++runId;
    try {
      // Resume under the click gesture, before the permission await.
      try{monitorCtx=new (window.AudioContext||window.webkitAudioContext)();await monitorCtx.resume();}catch{}
      if(id!==runId)return;
      deviceSelect.disabled=true;
      const captured = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression:false, autoGainControl:false, channelCount:1,...(deviceSelect.value?{deviceId:{exact:deviceSelect.value}}:{}) } });
      if (id !== runId) { captured.getTracks().forEach(t=>t.stop()); return; }
      stream=captured;watchMic(captured);loadDevices();
      const mime = recordingMimeType();
      if (!mime) { stopMic(); working=false; setState('找不到支援嘅錄音格式，請用文字輸入。'); refreshButtons(); return; }
      const chunks = [];
      recorder = new MediaRecorder(stream, { mimeType: mime });
      recorder.onerror=()=>{if(id===runId){cancel();setState('錄音失敗，請檢查咪高峰或改用文字。');}};
      recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      recorder.onstop = async () => {
        if (id !== runId) return; // 重开/取消后丢弃录音，不自动发送
        const blob = new Blob(chunks, { type: mime }); stopMic(); refreshButtons();
        try {
          setState('識別中');
          const AC = window.AudioContext || window.webkitAudioContext;
          audioCtx = new AC();
          const decoded = await audioCtx.decodeAudioData(await blob.arrayBuffer());
          if(id!==runId)return;
          const frames = Math.ceil(decoded.duration * 16000);
          const OfflineAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
          const off = new OfflineAC(1, frames, 16000);
          const src = off.createBufferSource(); src.buffer = decoded; src.connect(off.destination); src.start();
          const rendered = await off.startRendering(); if(id===runId)closeCtx();
          if (id !== runId) return;
          const pcm = rendered.getChannelData(0);
          const prepared=preparePcm(pcm);
          if(!prepared.valid){working=false;if(prepared.reason!=='too_short')devices.hidden=false;setState(prepared.reason==='too_short'?'录音太短，请说完一句再停止。':'没录到声音，可以展开「检查麦克风」后重试。');refreshButtons();return;}
          devices.hidden=true;
          const { text } = await api('/api/voice/transcribe', { audioBase64: encodeVoiceWav(prepared.samples), mimeType: WAV_MIME });
          if (id !== runId) return;
          const transcript=typeof text==='string'?text.trim():'';
          transcriptView.textContent=transcript;
          transcriptView.hidden=!transcriptToggle.checked||!transcript;
          working=false; refreshButtons();
          if(transcript)sendFlow(transcript,'voice');else setState('没听清楚，请再说一次。');
        } catch (e) { if (id === runId) { working=false;closeCtx();setState(e.message || '錄音或識別失敗，請再試或輸入文字。');refreshButtons(); } }
        finally { if(!working&&queued.length)void drainMessages(); }
      };
      recorder.start();
      setState('錄音中（最長15秒）'); refreshButtons();
      recordTimer = setTimeout(() => { try { recorder?.stop(); } catch {} }, MAX_MS);
    } catch (e) {
      if(id!==runId)return;
      working=false;
      stopMic();
      setState(e?.name === 'NotAllowedError' ? '未允許咪高峰權限，請在瀏覽器開啟或改用手輸文字。' : e?.name==='NotFoundError'||e?.name==='OverconstrainedError'?'找不到所選咪高峰，請切換到系統預設或其他裝置。':'未能開始錄音，請檢查咪高峰是否被其他程式佔用。');
      refreshButtons();
    }
  }

  micBtn.addEventListener('click', () => { if (recorder) { try { recorder.stop(); } catch {} } else startRecording(); });
  sendBtn.addEventListener('click', () => sendFlow(input.value));
  function cancelPending(clear=false){
    if(!working&&!queued.length)return;
    if(!clear&&!working)return;
    cancel(true);
    if(clear){input.value='';refreshButtons();micBtn.focus({preventScroll:true});}
    setState('已取消。可以再錄音，亦可以輸入文字。');
  }
  cancelBtn.addEventListener('click',()=>cancelPending(true));
  replayBtn.addEventListener('click', () => {
    if(lastReply&&!working){speech.stop();speech.speak(lastReply,{rate:lastReplyRate});}
    return;
  });
  muteBox.addEventListener('change', () => {
    speech.setMuted(muteBox.checked);if(muteBox.checked){releaseFarewell?.();releaseFarewell=null;}refreshButtons();return;
  });
  input.addEventListener('input', refreshButtons);
  input.addEventListener('keydown',e=>e.stopPropagation());
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); if (!sendBtn.disabled) sendFlow(input.value); } });
  const onHide = () => cancel();
  window.addEventListener('pagehide', onHide);

  let statusLoading=false;
  async function checkStatus(){
    if(statusLoading||destroyed)return;statusLoading=true;retryBtn.disabled=true;
    const statusController=new AbortController();
    const statusTimer=setTimeout(()=>statusController.abort(),10000);
    try {
      const res=await fetch(voiceUrl('/api/voice/status'),{signal:statusController.signal});
      if(!res.ok)throw Error('status');
      const s=await res.json();if(destroyed)return;
      configured = !!(s && s.configured !== false && (s.asr || s.npc));
      setState(configured ? '準備好' : '語音服務未配置，請稍後重試；可繼續用遊戲按鈕。');
      if(configured){lastNpcLine='';syncNpc(game.snapshot());}
    } catch { if(!destroyed){configured = false; setState('未能確認語音連線，可直接嘗試錄音或發送文字。若仍失敗，請在系統瀏覽器開啟此網址重試。');} }
    finally{clearTimeout(statusTimer);}
    statusLoading=false;retryBtn.disabled=false;retryBtn.hidden=configured;refreshButtons();
  }
  retryBtn.addEventListener('click',checkStatus);
  const reconnect=()=>{if(!configured)checkStatus();};
  window.addEventListener('online',reconnect);checkStatus();loadDevices();

  function syncNpc(snapshot){
    if(snapshot.view.beat?.pose==='depart'||snapshot.view.beat?.pose==='prepare'||snapshot.view.camera==='outside')return;
    const [speaker,text]=snapshot.view.line||[];
    if(!speaker?.startsWith('阿明')||!text)return;
    const key=snapshot.state.round+':'+text;
    if(key===lastNpcLine)return;

    if(configured&&!muteBox.checked&&snapshot.view.beat?.kind==='farewell'){
      speech.stop();farewellText=text;releaseFarewell=game.holdFarewell?.(snapshot.state.round)||null;
    }
    // A voice-triggered service already has a verified spoken acknowledgement.
    // Its completion/follow-up is still spoken when busy ends.

    if(text===lastReply&&speech.active)return;
    if(!configured||working||applying||suppressLine||muteBox.checked)return;
    if(snapshot.state.phase==='结束'&&lastReply.includes('慢行'))return;
    lastNpcLine=key;
    clearTimeout(lineTimer);
    (()=>{
      if(destroyed||working||muteBox.checked)return;
      lastReply=text;lastReplyRate=1;replyEl.textContent=text;speech.stop();speech.speak(text);refreshButtons();
    })();
  }
  return {
    cancelPending,
    setCompact(value){if(value)devices.open=false;},
    sync(snapshot) {
      if (!snapshot) return;
      const key = bizKey(snapshot);
      if (!lastKey) { lastKey = key; refreshButtons(); return; }
      if (key !== lastKey) {
        const roundChanged = JSON.parse(key)[0].round !== JSON.parse(lastKey)[0].round;
        lastKey = key;
        if (!applying && (roundChanged || (interpreting&&serviceRound!==snapshot.state.round))) cancel(false);
        // 本次语音触发的演出可以更新状态，不应截断它自己的播报；手动重开始终取消。
        if (roundChanged) { input.value = ''; transcriptView.textContent='';transcriptView.hidden=true;replyEl.textContent = ''; lastReply = ''; lastReplyRate = 1; }
      }
      if(!snapshot.view.busy)serviceRound=null;
      refreshButtons();
      syncNpc(snapshot);
      if(!snapshot.view.busy&&queued.length)queueMicrotask(drainMessages);
    },
    destroy() { destroyed=true;cancel();navigator.mediaDevices?.removeEventListener?.('devicechange',loadDevices); window.removeEventListener('online',reconnect);window.removeEventListener('pagehide', onHide); root.remove(); },
  };
}
