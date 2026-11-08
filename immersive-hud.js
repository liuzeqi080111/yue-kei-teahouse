import {PHASES as P} from './teahouse-scene/index.js';
import {systemText} from './ui-language.js';

const AUTO_HINT_DELAY=14000;
const FONT_SIZES=new Set(['standard','large','xlarge']);
const IDLE_TEXT='不知道怎么说？';

// A single gameplay microphone, with assistance and secondary inputs on demand.
export function createImmersiveHud({game,guide,voice,preview}){
 const root=document.createElement('section');root.id='immersive-hud';root.hidden=true;
 root.setAttribute('aria-label','对话与求助');
 root.innerHTML=`<div class="hud-caption" aria-live="polite"><span class="hud-speaker"></span><p class="hud-subtitle"></p><p class="hud-notice" role="status"></p><button type="button" class="hud-subtitle-toggle" data-hud="subtitle" hidden>展开字幕</button></div>
 <section class="hud-card" id="hud-help" aria-label="对话帮助" hidden>
  <header><strong>需要一点提示？</strong><button type="button" data-hud="pin" aria-pressed="false">固定</button><button type="button" data-hud="close" aria-label="关闭帮助">×</button></header>
  <nav class="hud-help-tabs" aria-label="帮助方向"><button type="button" data-help="goal" aria-pressed="true">我能做什么</button><button type="button" data-help="expression" aria-pressed="false">教我怎么说</button><button type="button" data-help="meaning" aria-pressed="false">解释上一句</button></nav>
  <div class="hud-help-content"></div><div class="hud-help-controls"></div>
  <details class="hud-fallback"><summary>用情境选项继续</summary><div id="hud-actions"></div></details>
 </section>
 <section class="hud-card hud-more" id="hud-more" aria-label="更多对话方式" hidden>
  <header><strong>更多对话方式</strong><button type="button" data-hud="close-more" aria-label="关闭更多选项">×</button></header>
  <div class="hud-more-grid"><button type="button" data-hud="type">文字输入</button><button type="button" data-hud="transcript" aria-pressed="false">识别文字</button><button type="button" data-hud="original" aria-pressed="false">粤语原句与粤拼</button><button type="button" data-hud="previous" aria-pressed="false">查看上一句</button><button type="button" data-hud="replay">重播</button><button type="button" data-hud="slow">慢速重听</button><button type="button" data-hud="mute" aria-pressed="false">静音</button><button type="button" data-hud="devices">检查麦克风</button><button type="button" data-hud="history" aria-expanded="false">对话记录</button></div>
  <div class="hud-original" hidden></div><div class="hud-history" aria-label="本局对话记录" hidden></div>
  <div class="hud-font-setting" role="group" aria-label="字幕和界面字号"><span>字号</span><button type="button" data-font-size="standard" aria-pressed="true">标准</button><button type="button" data-font-size="large" aria-pressed="false">大号</button><button type="button" data-font-size="xlarge" aria-pressed="false">特大</button></div>
  <label class="hud-auto-setting"><input type="checkbox" id="hud-auto-hint" checked> 等待回应时提醒我求助</label><p class="hud-static-note" hidden>当前版本未开放在线语音，可以使用帮助里的情境选项继续。</p>
 </section>
 <button type="button" id="hud-intro" hidden>点麦克风说话；需要帮助点这里或按 H</button>
 <button type="button" id="hud-idle-hint" hidden>不知道怎么说？</button>
 <div class="hud-bottom"><button type="button" class="hud-quiet" data-hud="help" aria-controls="hud-help" aria-expanded="false" aria-label="打开帮助（H）" title="帮助（H）">帮助</button><div id="hud-voice"></div><div class="hud-view-controls" role="group" aria-label="视角与菜单" hidden><button type="button" data-camera="table" data-hud-camera="table" aria-pressed="false">看看桌面</button><button type="button" data-camera="room" data-hud-camera="room" aria-pressed="false">看看店里</button><button type="button" data-camera="menu" data-hud-camera="menu" aria-pressed="false">看看菜单</button></div><button type="button" class="hud-quiet" data-hud="more" aria-controls="hud-more" aria-expanded="false" aria-label="更多对话方式">更多</button></div>
 <button type="button" class="hud-return" data-camera="room" hidden>← 回到座位</button>`;
 document.querySelector('#game').append(root);
 const $=selector=>root.querySelector(selector),card=$('#hud-help'),more=$('#hud-more'),idle=$('#hud-idle-hint'),intro=$('#hud-intro');
 const voiceDock=document.querySelector('#voice-dock');if(voiceDock){$('#hud-voice').append(voiceDock);voiceDock.open=true;}
 const actions=document.querySelector('#actions');if(actions)$('#hud-actions').append(actions);
 const dockObserver=new ResizeObserver(([entry])=>document.querySelector('#game').style.setProperty('--hud-dock-height',Math.ceil(entry.contentRect.height)+'px'));
 dockObserver.observe($('.hud-bottom'));
 let snapshot=game.snapshot(),kind='goal',pinned=false,turnKey='',offered=false,lastActivity=performance.now();
 let auto=true,fontSize='standard',introSeen=true,destroyed=false,voiceError=false,errorTurn='',hintTimer=0,introTimer=0;
 let currentNpc=null,previousNpc=null,viewingPrevious=false,subtitleExpanded=false,history=[];
 const activity=new Map();
 try{auto=localStorage.getItem('yuekei-auto-hint')!=='off';fontSize=localStorage.getItem('yuekei-font-size')||'standard';introSeen=localStorage.getItem('yuekei-hud-intro-seen')==='1';}catch{}
 $('#hud-auto-hint').checked=auto;
 const write=(el,text)=>{if(el.textContent!==text)el.textContent=text;};
 const activeAudio=()=>[...activity.values()].some(Boolean);
 const isNpcLine=line=>Boolean(line?.[0]?.startsWith('阿明')&&line?.[1]);
 const exploring=()=>['window','cashier'].includes(snapshot.view.camera);
 const readingPanel=()=>['menu','bill'].includes(snapshot.view.camera);
 const pageActive=()=>![P.OUTSIDE,P.FINISHED].includes(snapshot.state.phase);
 function waitingForReply(){
  const {state,view}=snapshot;
  return pageActive()&&!view.busy&&state.waiterPresent&&!state.isPaid&&view.beat?.kind!=='farewell'&&isNpcLine(view.line);
 }
 function setFontSize(value){
  if(!FONT_SIZES.has(value))return;fontSize=value;document.body.dataset.fontSize=value;
  document.querySelectorAll('[data-font-size]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.fontSize===value)));
  try{localStorage.setItem('yuekei-font-size',value);}catch{}
 }
 setFontSize(FONT_SIZES.has(fontSize)?fontSize:'standard');
 function clearHint(){clearTimeout(hintTimer);hintTimer=0;}
 function hideIdle(){idle.hidden=true;write(idle,IDLE_TEXT);}
 function hideIntro(){clearTimeout(introTimer);introTimer=0;intro.hidden=true;}
 function closeHelp(unpin=false){
  card.hidden=true;$('[data-hud="help"]').setAttribute('aria-expanded','false');document.body.dataset.helpGoal='false';
  if(unpin){pinned=false;const button=$('[data-hud="pin"]');button.setAttribute('aria-pressed','false');button.textContent='固定';}
 }
 function showHelp(value,focus=false){
  if(value){
   offered=true;clearHint();hideIdle();hideIntro();more.hidden=true;$('[data-hud="more"]').setAttribute('aria-expanded','false');
   card.hidden=false;renderHelp();if(focus)card.querySelector('[data-help]')?.focus({preventScroll:true});
  }else closeHelp(false);
  $('[data-hud="help"]').setAttribute('aria-expanded',String(value));
 }
 function showMore(value){
  if(value){closeHelp(true);hideIdle();hideIntro();more.hidden=false;renderMore();}
  else more.hidden=true;
  $('[data-hud="more"]').setAttribute('aria-expanded',String(value));
 }
 function makeButton(label,dataset,{disabled=false,pressed}={}){
  const button=document.createElement('button');button.type='button';button.textContent=label;button.disabled=disabled;
  Object.assign(button.dataset,dataset);if(pressed!==undefined)button.setAttribute('aria-pressed',String(pressed));return button;
 }
 function renderHelp(){
  const practice=guide.getPractice(),content=$('.hud-help-content'),controls=$('.hud-help-controls');
  content.replaceChildren();controls.replaceChildren();document.body.dataset.helpGoal=String(!card.hidden&&kind==='goal');
  const line=(text,cls,lang)=>{if(!text)return null;const p=document.createElement('p');p.textContent=text;if(cls)p.className=cls;if(lang)p.lang=lang;content.append(p);return p;};
  if(kind==='meaning'){
   const npc=currentNpc||previousNpc;
   if(npc){line(npc.text,'hud-example','yue');line(npc.jyutping?'粤拼：'+npc.jyutping:'','hud-jyutping');line('普通话：'+systemText(npc.meaning||'这句话暂时没有释义。'));}
   else line('阿明还没有说话。等他先说一句，再来查看解释。');
   controls.append(makeButton('重播阿明原句',{hud:'npc-replay'},{disabled:!npc||(!voice&&!preview)}),makeButton('让阿明慢点说',{hud:'npc-slow'},{disabled:!npc||!voice}));
  }else if(kind==='goal'){
   line(practice.goal||'可以看看场景里的物品，或向阿明提出需要。');
   line('可以点场景中的物品，也可以展开下方“用情境选项继续”。','hud-help-note');
  }else{
   line(practice.example,'hud-example','yue');line(practice.jyutping?'粤拼：'+practice.jyutping:'','hud-jyutping');line('普通话：'+(practice.meaning||''));
   controls.append(makeButton('试听示范',{hud:'listen'},{disabled:!voice&&!preview}),makeButton('慢速试听',{hud:'listen-slow'},{disabled:!voice}));
  }
  root.querySelectorAll('[data-help]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.help===kind)));
 }
 function shownLine(){
  if(viewingPrevious&&previousNpc)return previousNpc;
  const line=snapshot.view.line||[];
  return {speaker:line[0]||'',text:line[1]||'',jyutping:line[2]||'',meaning:line[3]||''};
 }
 function renderCaption(){
  const line=shownLine(),explore=exploring(),panel=readingPanel();
  let caption=line.meaning?systemText(line.meaning):line.speaker?.startsWith('阿明')?'这句话暂时没有普通话释义，可在“更多”中查看粤语原句。':systemText(line.text||'');
  if(!caption&&waitingForReply())caption='阿明正在等你回应。';
  write($('.hud-speaker'),viewingPrevious?'阿明 · 上一句':line.speaker?.startsWith('阿明')?'阿明 · 服务员':'');
  write($('.hud-subtitle'),caption);write($('.hud-notice'),document.querySelector('#notice')?.textContent||'');
  $('.hud-caption').hidden=explore||panel||!caption;
  const long=caption.length>64,toggle=$('[data-hud="subtitle"]');toggle.hidden=!long;toggle.textContent=subtitleExpanded?'收起字幕':'展开完整字幕';
  toggle.setAttribute('aria-expanded',String(subtitleExpanded));$('.hud-caption').dataset.long=String(long);$('.hud-caption').classList.toggle('expanded',subtitleExpanded);
  $('.hud-subtitle').tabIndex=long&&subtitleExpanded?0:-1;
  write($('.hud-original'),[line.text,line.jyutping].filter(Boolean).join('\n'));
  const previous=$('[data-hud="previous"]');previous.disabled=!previousNpc;previous.textContent=viewingPrevious?'返回当前句':'查看上一句';previous.setAttribute('aria-pressed',String(viewingPrevious));
  const audio=viewingPrevious?previousNpc:currentNpc;
  $('[data-hud="replay"]').disabled=!audio||(!voice&&!preview);$('[data-hud="slow"]').disabled=!audio||!voice;
 }
 function renderHistory(){
  const box=$('.hud-history');box.replaceChildren();
  if(!history.length){const empty=document.createElement('p');empty.textContent='本局还没有对话。';box.append(empty);return;}
  for(const item of history){const p=document.createElement('p'),strong=document.createElement('strong');strong.textContent=item.speaker+'：';p.append(strong,document.createTextNode(item.text));box.append(p);}
  box.scrollTop=box.scrollHeight;
 }
 function renderMore(){
  const type=$('[data-hud="type"]'),transcript=$('[data-hud="transcript"]'),mute=$('[data-hud="mute"]'),devices=$('[data-hud="devices"]');
  type.disabled=!voice;transcript.disabled=!voice;mute.disabled=!voice;devices.disabled=!voice;$('.hud-static-note').hidden=Boolean(voice);
  transcript.setAttribute('aria-pressed',String(Boolean(voice?.transcriptEnabled)));mute.setAttribute('aria-pressed',String(Boolean(voice?.muted)));mute.textContent=voice?.muted?'取消静音':'静音';
  renderCaption();if(!$('.hud-history').hidden)renderHistory();
 }
 function hintBlocked(){
  return destroyed||document.hidden||root.hidden||!waitingForReply()||snapshot.view.busy||activeAudio()||!card.hidden||!more.hidden||document.querySelector('dialog[open]')||exploring()||readingPanel()||voice?.textMode||voiceError||(errorTurn&&errorTurn===turnKey);
 }
 function scheduleHint(){
  clearHint();
  if(!auto||offered||hintBlocked()){hideIdle();return;}
  const delay=Math.max(0,AUTO_HINT_DELAY-(performance.now()-lastActivity));
  hintTimer=setTimeout(()=>{
   hintTimer=0;
   if(!auto||offered||hintBlocked()){lastActivity=performance.now();hideIdle();return;}
   write(idle,IDLE_TEXT);idle.hidden=false;offered=true;
  },delay);
 }
 function maybeShowIntro(){
  if(introSeen||root.hidden||!waitingForReply()||activeAudio()||!card.hidden||!more.hidden)return;
  introSeen=true;try{localStorage.setItem('yuekei-hud-intro-seen','1');}catch{}
  intro.hidden=false;introTimer=setTimeout(()=>{hideIntro();lastActivity=performance.now();scheduleHint();},7000);
 }
 function sync(next){
  if(destroyed||!next)return;
  const previousRound=snapshot?.state?.round;snapshot=next;const {state,view}=next,active=pageActive();
  root.hidden=!active;$('.hud-return').hidden=!exploring();root.dataset.exploring=String(exploring());root.dataset.panel=String(readingPanel());root.dataset.voiceError=String(voiceError);document.body.dataset.immersive='true';
  const viewControls=$('.hud-view-controls'),canLook=[P.SEATED,P.ORDERING,P.DINING,P.BILLING].includes(state.phase);
  viewControls.hidden=!canLook||exploring();
  root.querySelectorAll('[data-hud-camera]').forEach(button=>{
   const camera=button.dataset.hudCamera;
   button.hidden=camera===view.camera||(camera==='menu'&&![P.SEATED,P.ORDERING,P.DINING].includes(state.phase));
   button.disabled=camera==='menu'&&view.busy;
   button.setAttribute('aria-pressed',String(view.camera===camera));
  });
  if(previousRound!==state.round){
   turnKey='';offered=false;errorTurn='';voiceError=false;currentNpc=null;previousNpc=null;history=[];viewingPrevious=false;subtitleExpanded=false;pinned=false;
   clearHint();hideIdle();hideIntro();closeHelp(true);showMore(false);voice?.setTextMode(false);
  }
  if(!active){turnKey='';offered=false;clearHint();hideIdle();hideIntro();closeHelp(true);showMore(false);return;}
  const line=view.line||[];
  if(isNpcLine(line)){
   const key=JSON.stringify([state.round,line[0],line[1]]);
   if(currentNpc?.key!==key){
    if(currentNpc&&currentNpc.round===state.round)previousNpc=currentNpc;
    currentNpc={key,round:state.round,speaker:line[0],text:line[1],jyutping:line[2]||'',meaning:line[3]||''};
    history.push({speaker:'阿明',text:line[3]?systemText(line[3]):line[1]});if(history.length>30)history=history.slice(-30);viewingPrevious=false;subtitleExpanded=false;
   }
   const nextTurn=JSON.stringify([state.round,state.phase,line[1]]);
   if(nextTurn!==turnKey){
    turnKey=nextTurn;offered=false;errorTurn='';lastActivity=performance.now();clearHint();hideIdle();
    if(!pinned)closeHelp(false);else renderHelp();showMore(false);
   }
  }
  if(exploring()||readingPanel()){clearHint();hideIdle();closeHelp(true);showMore(false);}
  renderCaption();if(!card.hidden)renderHelp();scheduleHint();maybeShowIntro();
 }
 function playLine(line,rate=1){
  if(!line)return;
  if(voice){voice.replay(line,rate);return;}
  if(rate===1)preview?.(line);
 }
 function onRootClick(event){
  const button=event.target.closest('button');if(!button||button.disabled)return;
  if(button.dataset.fontSize){setFontSize(button.dataset.fontSize);return;}
  if(button===idle||button===intro){kind='expression';guide.noteHint('full');showHelp(true,true);return;}
  if(button.dataset.help){kind=button.dataset.help;if(kind==='expression')guide.noteHint('full');renderHelp();return;}
  switch(button.dataset.hud){
   case 'help':kind='goal';showHelp(card.hidden,true);break;
   case 'close':closeHelp(true);$('[data-hud="help"]').focus({preventScroll:true});scheduleHint();break;
   case 'pin':pinned=!pinned;button.setAttribute('aria-pressed',String(pinned));button.textContent=pinned?'已固定':'固定';break;
   case 'more':showMore(more.hidden);break;
   case 'close-more':showMore(false);$('[data-hud="more"]').focus({preventScroll:true});scheduleHint();break;
   case 'type':voice?.setTextMode(true);showMore(false);scheduleHint();break;
   case 'transcript':voice?.toggleTranscript();renderMore();break;
   case 'original':{const original=$('.hud-original');original.hidden=!original.hidden;button.setAttribute('aria-pressed',String(!original.hidden));break;}
   case 'previous':viewingPrevious=!viewingPrevious&&Boolean(previousNpc);subtitleExpanded=false;renderCaption();break;
   case 'replay':playLine(shownLine().text,1);break;
   case 'slow':playLine(shownLine().text,.72);break;
   case 'mute':voice?.toggleMute();renderMore();break;
   case 'devices':voice?.showDevices();showMore(false);break;
   case 'history':{const box=$('.hud-history');box.hidden=!box.hidden;button.setAttribute('aria-expanded',String(!box.hidden));if(!box.hidden)renderHistory();break;}
   case 'subtitle':subtitleExpanded=!subtitleExpanded;renderCaption();break;
   case 'listen':guide.noteHint('audio');playLine(guide.getPractice().example,1);break;
   case 'listen-slow':guide.noteHint('audio');playLine(guide.getPractice().example,.72);break;
   case 'npc-replay':playLine((currentNpc||previousNpc)?.text,1);break;
   case 'npc-slow':playLine((currentNpc||previousNpc)?.text,.72);break;
  }
 }
 function onKeydown(event){
  const target=event.target;
  if(event.isComposing||event.keyCode===229||event.ctrlKey||event.metaKey||event.altKey||target?.closest?.('input,textarea,select,[contenteditable="true"]')||document.querySelector('dialog[open]'))return;
  if(event.key.toLowerCase()==='h'&&!root.hidden){event.preventDefault();kind='goal';showHelp(card.hidden,true);}
  if(event.key==='Escape'&&(!card.hidden||!more.hidden)){event.preventDefault();closeHelp(true);showMore(false);voice?.setTextMode(false);$('[data-hud="help"]').focus({preventScroll:true});scheduleHint();}
 }
 function interacted(event){lastActivity=performance.now();if(event?.target?.closest?.('#hud-idle-hint,#hud-intro'))return;hideIdle();hideIntro();scheduleHint();}
 function onVoiceActivity(event){
  const detail=event.detail||{};activity.set(detail.source||'voice',Boolean(detail.active||detail.recording||detail.busy||detail.npcActive));
  lastActivity=performance.now();hideIdle();hideIntro();
  if(detail.recording){
   showMore(false);kind='expression';guide.noteHint('full');
   if(card.hidden)showHelp(true);else renderHelp();
  }
  scheduleHint();maybeShowIntro();
 }
 function onVoiceStatus(event){
  voiceError=Boolean(event.detail?.error);root.dataset.voiceError=String(voiceError);
  if(voiceError){errorTurn=turnKey;hideIdle();hideIntro();clearHint();}
  scheduleHint();
 }
 function onPlayerMessage(event){
  const text=String(event.detail?.text||'').trim();if(!text)return;history.push({speaker:'你',text});if(history.length>30)history=history.slice(-30);if(!$('.hud-history').hidden)renderHistory();
 }
 function onVisibility(){lastActivity=performance.now();if(document.hidden){clearHint();hideIdle();hideIntro();}else scheduleHint();}
 function onAutoChange(event){auto=event.target.checked;hideIdle();lastActivity=performance.now();try{localStorage.setItem('yuekei-auto-hint',auto?'on':'off');}catch{}scheduleHint();}
 function destroy(){
  if(destroyed)return;destroyed=true;clearHint();hideIntro();
  root.removeEventListener('click',onRootClick);document.removeEventListener('keydown',onKeydown);document.removeEventListener('pointerdown',interacted);document.removeEventListener('keydown',interacted);
  dockObserver.disconnect();document.removeEventListener('visibilitychange',onVisibility);window.removeEventListener('voice-activity',onVoiceActivity);window.removeEventListener('voice-status',onVoiceStatus);window.removeEventListener('voice-player-message',onPlayerMessage);
  $('#hud-auto-hint').removeEventListener('change',onAutoChange);window.removeEventListener('pagehide',destroy);
 }
 root.addEventListener('click',onRootClick);document.addEventListener('keydown',onKeydown);document.addEventListener('pointerdown',interacted,{passive:true});document.addEventListener('keydown',interacted);
 document.addEventListener('visibilitychange',onVisibility);window.addEventListener('voice-activity',onVoiceActivity);window.addEventListener('voice-status',onVoiceStatus);window.addEventListener('voice-player-message',onPlayerMessage);
 $('#hud-auto-hint').addEventListener('change',onAutoChange);window.addEventListener('pagehide',destroy,{once:true});
 return {sync,setFontSize,openHelp(){showHelp(true,true);},destroy};
}
