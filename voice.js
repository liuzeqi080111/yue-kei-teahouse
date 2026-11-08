/**
 * 浏览器语音面板：录音→ASR→自动提交→bridge.apply→字幕→TTS。
 * 业务执行只经 voice-bridge；模型话术不作为动作成功依据。无 innerHTML 插入 API 文字。
 */
import {createVoiceBridge} from './voice-bridge.js';
import {preparePcm,encodeVoiceWav,recordingMimeType} from './voice-capture.js';
import {createNpcSpeech} from './npc-speech.js';
import {voiceUrl} from './voice-endpoint.js';
import {localizeUi,systemText} from './ui-language.js';

const MAX_MS = 15000, TIMEOUT = 35000;
const WAV_MIME = 'audio/wav';
const el = (tag, props, text) => { const n = document.createElement(tag); Object.assign(n, props); if (text !== undefined) n.textContent = text; return n; };

export function mountVoice({ game, host, getPracticeTarget, onPracticeAttempt } = {}) {
  if (!game || !host) throw new TypeError('mountVoice 需要 game 与 host');
  const bridge = createVoiceBridge({ game });
  const root = el('section', { className: 'voice-panel', ariaLabel: '语音对话' });
  const status = el('p', { className: 'voice-status', role: 'status', ariaLive: 'polite' }, '准备中…');
  const input = el('textarea', { className:'voice-text', maxLength: 500, rows: 1, ariaLabel: '输入文字', placeholder: '也可以在这里输入文字。' });
  const micBtn = el('button', { className:'voice-mic', type: 'button', ariaLabel: '开始说话' }, '开始说话');
  const sendBtn = el('button', { className:'voice-send voice-secondary', type: 'button', ariaLabel: '发送文字' }, '发送');
  const cancelBtn = el('button', { className:'voice-cancel', type: 'button', ariaLabel: '取消本次语音', hidden: true }, '取消');
  const retryBtn=el('button',{className:'voice-retry',type:'button',hidden:true},'重新连接语音');
  const retryMessageBtn=el('button',{className:'voice-retry voice-retry-message',type:'button',hidden:true},'重试这句话');
  const replayBtn = el('button', { className:'voice-secondary', type: 'button', ariaLabel: '重听阿明回答', disabled: true }, '重听');
  const muteBox = el('input', { type: 'checkbox', ariaLabel: '靜音' });
  const muteLabel = el('label', {className:'voice-secondary'}, '靜音 '); muteLabel.append(muteBox);
  const replyEl = el('p', { className: 'voice-reply', ariaLive: 'polite' });
  const hint = el('small', {className:'voice-note'}, '停止录音后会自动发送。录音将提交至阿里云识别。');
  const row = el('div', { className: 'voice-controls' }); row.append(micBtn,replayBtn,muteLabel);
  const deviceLabel=el('label',{className:'mic-device'},'麦克风 ');
  const deviceSelect=el('select',{ariaLabel:'选择麦克风'});deviceSelect.append(el('option',{value:''},'系统默认麦克风'));deviceLabel.append(deviceSelect);
  const detectBtn=el('button',{type:'button',className:'mic-detect'},'检测麦克风');
  const meter=el('meter',{min:0,max:1,value:0,ariaLabel:'麦克风输入音量'});
  const meterText=el('small',{className:'mic-level'},'录音时会显示收到的声音');
  const monitor=el('div',{className:'mic-monitor'});monitor.append(meter,meterText);
  const devices=el('details',{className:'voice-devices',hidden:true});
  devices.append(el('summary',{},'检查麦克风'),deviceLabel,detectBtn);
  const transcriptToggle=el('input',{type:'checkbox'});
  const transcriptLabel=el('label',{className:'voice-secondary'},'显示识别文字 ');transcriptLabel.append(transcriptToggle);
  const transcriptView=el('p',{className:'voice-transcript',hidden:true});
  transcriptToggle.addEventListener('change',()=>{transcriptView.hidden=!transcriptToggle.checked||!transcriptView.textContent;});
  const textClose=el('button',{type:'button',className:'voice-text-close voice-secondary'},'收起文字');
  const textActions=el('div',{className:'voice-text-actions'});textActions.append(sendBtn,textClose);
  textClose.addEventListener('click',()=>setTextMode(false));
  root.append(status,retryBtn,retryMessageBtn,input,textActions,monitor,devices,cancelBtn,row,transcriptLabel,transcriptView,replyEl,hint);host.append(root);

  let configured = false, runId = 0, applying = false, recorder = null, stream = null, recordTimer = 0;
  let aborter = null, lastReply = '', lastReplyRate = 1, lastKey = '';
  let failedMessage=null,suspended=false,working=false,destroyed=false,serviceRound=null,interpreting=false;
  const queued=[];
  let lastNpcLine='',lineTimer=0,suppressLine=false,releaseFarewell=null,farewellText='';
  const speech=createNpcSpeech({onActivity:()=>{game.setSpeech?.(speech.active);refreshButtons();},onState:t=>{if(!working)setState(t);},onSettled:text=>{if(text===farewellText){releaseFarewell?.();releaseFarewell=null;farewellText='';}}});
  const bizKey = (s) => JSON.stringify([s.state, s.view.orderReview]);
  const setState = (t) => {
    const text=systemText(t),error=/无法|失败|错误|未配置|不可用|没录到|没听清|权限|超时|逾时|失敗|未允许|找不到|未收到|无讯号/.test(text);
    status.textContent=text;status.dataset.idle=String(['准备好','已停止'].includes(text));status.dataset.error=String(error);
    window.dispatchEvent(new CustomEvent('voice-status',{detail:{text,error}}));
  };
  const ready = () => { if (configured) setState('准备好'); refreshButtons(); };
  function refreshButtons() {
    const busy = game.snapshot().view.busy;
    detectBtn.disabled=working||busy;
    micBtn.disabled = working && !recorder;
    sendBtn.disabled = working || !input.value.trim();
    cancelBtn.hidden = !working && !queued.length;
    micBtn.innerHTML=recorder?'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/></svg>':'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="2" width="8" height="13" rx="4"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/></svg>';
    micBtn.dataset.recording=String(Boolean(recorder));
    micBtn.setAttribute('aria-label',recorder?'停止录音并发送':'开始说话');
    micBtn.title=recorder?'停止录音并发送':'开始说话';
    monitor.classList.toggle('voice-monitor-idle',!recorder);
    localizeUi(row);localizeUi(devices);localizeUi(monitor);
    replayBtn.disabled = working || busy || !game.snapshot().state.waiterPresent || muteBox.checked || !lastReply;
    window.dispatchEvent(new CustomEvent('voice-activity',{detail:{active:working||speech.active,source:'voice',npcActive:speech.active,recording:Boolean(recorder),busy:working}}));
  }
  let monitorCtx=null,monitorTimer=0,monitorSource=null,monitorSink=null;
  async function loadDevices(){
   try{const selected=deviceSelect.value;const devices=await navigator.mediaDevices.enumerateDevices();if(destroyed)return;
    deviceSelect.replaceChildren(el('option',{value:''},'系统默认麦克风'));
    devices.filter(d=>d.kind==='audioinput'&&d.deviceId).forEach((d,i)=>deviceSelect.append(el('option',{value:d.deviceId},d.label||`麦克风 ${i+1}`)));
    if([...deviceSelect.options].some(o=>o.value===selected))deviceSelect.value=selected;
   }catch{}
  }
  function stopMonitor(){clearInterval(monitorTimer);monitorTimer=0;monitorSource?.disconnect();monitorSource=null;monitorSink?.disconnect();monitorSink=null;monitorCtx?.close().catch(()=>{});monitorCtx=null;meter.value=0;deviceSelect.disabled=false;}
  function watchMic(captured){
   const track=captured.getAudioTracks()[0],name=track?.label||'目前麦克风';
   if(!monitorCtx){meterText.textContent='正在录音：'+name;return;}
   monitorSource=monitorCtx.createMediaStreamSource(captured);const analyser=monitorCtx.createAnalyser();analyser.fftSize=2048;monitorSource.connect(analyser);monitorSink=monitorCtx.createGain();monitorSink.gain.value=0;analyser.connect(monitorSink);monitorSink.connect(monitorCtx.destination);
   const data=new Float32Array(analyser.fftSize);let peakSeen=0;
   monitorTimer=setInterval(()=>{analyser.getFloatTimeDomainData(data);let sum=0;for(const v of data)sum+=v*v;const rms=Math.sqrt(sum/data.length);peakSeen=Math.max(peakSeen,rms);meter.value=Math.min(1,Math.sqrt(rms)*4);
    meterText.textContent=track?.muted?`麦克风暂时无讯号：${name}`:rms>1e-6?`收到声音 · ${name}`:peakSeen>1e-6?`等待继续说话 · ${name}`:`未收到讯号 · 可停止后切换麦克风`;
   },100);
  }
  // Explicit user-started local check: measure devices, never upload or save audio.
  detectBtn.addEventListener('click',async()=>{
   if(working||game.snapshot().view.busy)return;
   if(!navigator.mediaDevices?.getUserMedia){setState('此浏览器不支持麦克风，请在系統浏览器开启，或直接输入文字。');return;}
   cancel();working=true;const id=runId;refreshButtons();deviceSelect.disabled=true;
   let best=null;
   try{
    const initial=await navigator.mediaDevices.getUserMedia({audio:true});
    if(id!==runId){initial.getTracks().forEach(t=>t.stop());return;}
    initial.getTracks().forEach(t=>t.stop());await loadDevices();
    const devices=[...deviceSelect.options].filter(o=>o.value&&!['default','communications'].includes(o.value)).slice(0,6);
    if(!devices.length)devices.push({value:'',textContent:'系统默认麦克风'});
    setState('请持续说「一二三」，正在逐个检测麦克风（只在本机）…');
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
       analyser.getFloatTimeDomainData(data);let sum=0;for(const v of data)sum+=v*v;const rms=Math.sqrt(sum/data.length);energy+=rms*rms;meter.value=Math.min(1,Math.sqrt(rms)*4);meterText.textContent='检测中：'+device.textContent;
      }
      const level=Math.sqrt(energy/30);if(!best||level>best.level)best={value:device.value,name:device.textContent,level};
      source.disconnect();analyser.disconnect();sink.disconnect();stopMic();deviceSelect.disabled=true;
     }catch{if(id!==runId)return;stopMic();}
    }
    if(id!==runId)return;
    if(best?.level>1e-7){deviceSelect.value=best.value;setState('已选择收到声音的麦克风。请按「开始说话」重录。');meterText.textContent=best.name;}
    else{setState('所有麦克风都未收到讯号。请检查耳机／電腦的麦克风靜音鍵，以及 Windows 声音设置的输入装置。');meterText.textContent='本机检测无讯号，尚未送出识别。';}
   }catch(e){if(id===runId)setState(e?.name==='NotAllowedError'?'浏览器未允许麦克风。请先允许录音再检测。':'无法开启麦克风，请检查连接及装置是否被其他程式独占。');}
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
  function cancel(preserveSpeech=false) { runId++;queued.length=0;failedMessage=null;retryMessageBtn.hidden=true;interpreting=false;clearTimeout(lineTimer);if(!preserveSpeech){speech.stop();releaseFarewell?.();releaseFarewell=null;} working=false;serviceRound=null; try { aborter?.abort(); } catch {} aborter = null; stopMic(); closeCtx(); ready(); }
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
      if (!res.ok) throw new Error(data?.error?.message || `服务错误（${res.status}），请稍后再试。`);
      configured=true;retryBtn.hidden=true;
      return data;
    } catch (e) {
      if (e?.name === 'AbortError') throw new Error('已取消或逾时，请再试一次。');
      if (e instanceof TypeError) throw new Error('无法连接语音服务，文字已保留。可以重试，或打开帮助使用情境选项。');
      throw e;
    } finally { clearTimeout(timer); if (aborter === ctrl) aborter = null; }
  }

  async function playReply(reply, id, rate) {
    if(reply&&!muteBox.checked&&id===runId){const s=game.snapshot();if(!s.view.busy)speech.speak(reply,{rate});}
    return;
  }

  function sendFlow(raw,mode='text') {
    const text = String(raw || '').trim();
    if (!text || working || destroyed || suspended) return;
    failedMessage=null;retryMessageBtn.hidden=true;
    const size=queued.reduce((total,message)=>total+message.text.length+1,0);
    if(size+text.length>500){setState('已接收的消息较多，请等阿明回应后再试。');return;}
    queued.push({text,mode});
    if(game.snapshot().view.busy){setState('已收到，阿明服务完就会回应。');refreshButtons();return;}
    void drainMessages();
  }

  async function drainMessages() {
    if (working || destroyed || suspended || !queued.length) return;
    const before=game.snapshot();
    if (before.view.busy) return;
    const messages=queued.splice(0);
    const text=messages.map(message=>message.text).join('\n');
    const mode=messages.every(message=>message.mode==='voice')?'voice':'text';
    const practiceTarget=typeof getPracticeTarget==='function'?getPracticeTarget():null;
    speech.stop(); working=true; interpreting=true; const id=++runId;
    try {
      setState('理解中'); refreshButtons();
      window.dispatchEvent(new CustomEvent('voice-player-message',{detail:{text,mode}}));
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
      replyEl.textContent = lastReply || '（无回覆）';
      if (result.ok && lastReply && typeof game.say === 'function' && !game.snapshot().view.busy) {
        suppressLine=true;applying=true;
        try { game.say(lastReply, result.meaning || ''); lastNpcLine=game.snapshot().state.round+':'+lastReply; } catch {} finally{suppressLine=false;applying=false;lastKey=bizKey(game.snapshot());}
      }
      const semanticSuccess=result.ok&&result.executedIntents?.length>0;
      if(result.helpRequested)window.dispatchEvent(new CustomEvent('learning-help'));
      setState(result.ok?(semanticSuccess?'已听懂。':'阿明正在回应。'):(result.meaning||result.reply||'这次没能完成，请再试一次。'));
      if(result.ok)setTimeout(()=>{if(id===runId&&!working&&!speech.active)setState('准备好');},3500);
      if(game.snapshot().view.busy){working=false;lastNpcLine='';syncNpc(game.snapshot());}else await playReply(lastReply, id, lastReplyRate);
    } catch (e) { if (id === runId) {failedMessage={text,mode,token:bridge.token()};retryMessageBtn.hidden=false;input.value=text;setState(e.message || '发生错误，请再试。');} }
    if(id===runId){working=false;interpreting=false;}
    refreshButtons();
  }

  async function startRecording() {
    if (working || destroyed || suspended) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { setState('此浏览器不支持录音，请使用系统浏览器或输入文字。'); return; }
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
      if (!mime) { stopMic(); working=false; setState('找不到支持的录音格式，请用文字输入。'); refreshButtons(); return; }
      const chunks = [];
      recorder = new MediaRecorder(stream, { mimeType: mime });
      recorder.onerror=()=>{if(id===runId){cancel();setState('录音失敗，请检查麦克风或改用文字。');}};
      recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      recorder.onstop = async () => {
        if (id !== runId) return; // 重开/取消后丢弃录音，不自动发送
        const blob = new Blob(chunks, { type: mime }); stopMic(); refreshButtons();
        try {
          setState('识别中');
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
        } catch (e) { if (id === runId) { working=false;closeCtx();setState(e.message || '录音或识别失敗，请再试或输入文字。');refreshButtons(); } }
        finally { if(!working&&queued.length)void drainMessages(); }
      };
      recorder.start();
      setState('录音中（最长15秒）'); refreshButtons();
      recordTimer = setTimeout(() => { try { recorder?.stop(); } catch {} }, MAX_MS);
    } catch (e) {
      if(id!==runId)return;
      working=false;
      stopMic();
      setState(e?.name === 'NotAllowedError' ? '未允许麦克风权限，请在浏览器开启或改用文字输入。' : e?.name==='NotFoundError'||e?.name==='OverconstrainedError'?'找不到所选麦克风，请切换到系统默认或其他装置。':'无法开始录音，请检查麦克风是否被其他程式占用。');
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
    setState('已取消。可以再录音，也可以以输入文字。');
  }
  cancelBtn.addEventListener('click',()=>cancelPending(true));
  function replay(text=lastReply,rate=1){
    const line=typeof text==='string'?text.trim():lastReply;
    if(!line||working||destroyed||suspended||muteBox.checked||game.snapshot().view.busy)return false;
    speech.stop();speech.speak(line,{rate:Number(rate)===0.72?0.72:1});refreshButtons();
    return true;
  }
  replayBtn.addEventListener('click',()=>replay(lastReply,lastReplyRate));
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
      setState(configured ? '准备好' : '语音服务暂不可用，可从帮助里的情境选项继续。');
      if(configured){lastNpcLine='';syncNpc(game.snapshot());}
    } catch { if(!destroyed){configured = false; setState('暂时无法连接语音服务。可以重试，或打开帮助使用情境选项。');} }
    finally{clearTimeout(statusTimer);}
    statusLoading=false;retryBtn.disabled=false;retryBtn.hidden=configured;refreshButtons();
  }
  retryBtn.addEventListener('click',checkStatus);
  retryMessageBtn.addEventListener('click',()=>{
    const previous=failedMessage;if(!previous)return;
    if(previous.token!==bridge.token()){failedMessage=null;retryMessageBtn.hidden=true;setState('场景已经变化，请重新表达当前的需要。');return;}
    sendFlow(previous.text,previous.mode);
  });
  const reconnect=()=>{if(!configured)checkStatus();};
  window.addEventListener('online',reconnect);checkStatus();loadDevices();

  function syncNpc(snapshot){
    if(suspended)return;
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
  function setTextMode(value){root.dataset.text=String(Boolean(value));if(value)input.focus();}
  return {
    cancelPending,setTextMode,
    get textMode(){return root.dataset.text==='true';},
    get hasError(){return status.dataset.error==='true';},
    replay,
    get transcriptEnabled(){return transcriptToggle.checked;},
    get muted(){return muteBox.checked;},
    toggleTranscript(){if(destroyed)return false;transcriptToggle.click();return transcriptToggle.checked;},
    showDevices(){if(destroyed)return false;devices.hidden=false;devices.open=true;void loadDevices();devices.querySelector('summary')?.focus({preventScroll:true});return true;},
    toggleMute(){muteBox.click();return muteBox.checked;},
    suspend(value){suspended=value;if(value){cancel();input.value='';}},
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
