import {PHASES as P} from './teahouse-scene/index.js';
import {systemText} from './ui-language.js';

const AUTO_HINT_DELAY=14000;
const FONT_SIZES=new Set(['standard','large','xlarge']);
const IDLE_TEXT='不知道怎么说？';

// A single gameplay microphone, with assistance and secondary inputs on demand.
export function createImmersiveHud({game,guide,voice,preview}){
 const root=document.createElement('section');root.id='immersive-hud';root.hidden=true;
 root.setAttribute('aria-label','对话与求助');
 root.innerHTML=`<div class="hud-caption" aria-live="polite"><span class="hud-speaker"></span><p class="hud-cantonese" lang="yue-Hant"></p><p class="hud-subtitle"></p><p class="hud-notice" role="status"></p><button type="button" class="hud-subtitle-toggle" data-hud="subtitle" hidden>展开字幕</button></div>

 <section class="hud-card" id="hud-help" aria-label="对话帮助" hidden>
  <header><strong>需要一点提示？</strong><button type="button" data-hud="pin" aria-pressed="false">固定</button><button type="button" data-hud="close" aria-label="关闭帮助">×</button></header>
  <nav class="hud-help-tabs" aria-label="帮助方向"><button type="button" data-help="goal" aria-pressed="true">我能做什么</button><button type="button" data-help="expression" aria-pressed="false">教我怎么说</button><button type="button" data-help="meaning" aria-pressed="false">解释上一句</button></nav>
  <div class="hud-help-content"></div><div class="hud-help-controls"></div>
  <details class="hud-fallback"><summary>用情境选项继续</summary><div id="hud-actions"></div></details>
 </section>
 <section class="hud-card hud-more" id="hud-more" aria-label="更多对话方式" hidden>
  <header><strong>更多对话方式</strong><button type="button" data-hud="close-more" aria-label="关闭更多选项">×</button></header>
  <div class="hud-more-grid"><button type="button" data-hud="teach">教我怎么说</button><button type="button" data-hud="original" aria-pressed="false">粤语拼音</button><button type="button" data-hud="replay">重放</button></div>
  <div class="hud-original" aria-live="polite" hidden></div>
 </section>
 <button type="button" id="hud-intro" hidden>点麦克风说话；需要帮助点这里或按 H</button>
 <button type="button" id="hud-idle-hint" hidden>不知道怎么说？</button>
 <div class="hud-bottom"><output class="hud-score" aria-live="polite" hidden></output><button type="button" class="hud-quiet" data-hud="help" aria-controls="hud-help" aria-expanded="false" aria-label="打开帮助（H）" title="帮助（H）">帮助</button><div id="hud-voice"></div> <section class="hud-direct" aria-label="当前回应" hidden><div class="hud-direct-actions"></div></section><button class="hud-quiet" data-action="CALL_WAITER" hidden>招呼阿明</button><div class="hud-view-controls" role="group" aria-label="视角与菜单" hidden><button type="button" data-camera="table" data-hud-camera="table" aria-pressed="false">看看桌面</button><button type="button" data-camera="room" data-hud-camera="room" aria-pressed="false">看看店里</button><button type="button" data-camera="menu" data-hud-camera="menu" aria-pressed="false">看看菜单</button></div><button type="button" class="hud-quiet" data-hud="more" aria-controls="hud-more" aria-expanded="false" aria-label="更多对话方式">更多</button></div>
 <button type="button" class="hud-return" data-camera="room" hidden>← 回到座位</button>`;
 document.querySelector('#game').append(root);
 const $=selector=>root.querySelector(selector),card=$('#hud-help'),more=$('#hud-more'),idle=$('#hud-idle-hint'),intro=$('#hud-intro');
 const voiceDock=document.querySelector('#voice-dock');if(voiceDock){$('#hud-voice').append(voiceDock);voiceDock.open=true;}
 const actions=document.querySelector('#actions');if(actions)$('#hud-actions').append(actions);
 const dockObserver=new ResizeObserver(([entry])=>document.querySelector('#game').style.setProperty('--hud-dock-height',Math.ceil(entry.contentRect.height)+'px'));
 dockObserver.observe($('.hud-bottom'));
 let snapshot=game.snapshot(),kind='goal',pinned=false,turnKey='',offered=false,lastActivity=performance.now();
 let auto=true,fontSize='standard',introSeen=true,destroyed=false,voiceError=false,errorTurn='',hintTimer=0,introTimer=0;
 let currentNpc=null,subtitleExpanded=false,moreDetail=null;
 const activity=new Map();
 try{auto=localStorage.getItem('yuekei-auto-hint')!=='off';fontSize=localStorage.getItem('yuekei-font-size')||'standard';introSeen=localStorage.getItem('yuekei-hud-intro-seen')==='1';}catch{}

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
  if(value){closeHelp(true);hideIdle();hideIntro();more.hidden=false;moreDetail=null;renderCaption();}
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
   const npc=currentNpc;
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
  const line=snapshot.view.line||[];
  return {speaker:line[0]||'',text:line[1]||'',jyutping:line[2]||'',meaning:line[3]||''};
 }
 function renderCaption(){
  const line=shownLine(),explore=exploring(),panel=readingPanel();
  let caption=line.meaning?systemText(line.meaning):line.speaker?.startsWith('阿明')?'这句话暂时没有普通话释义，可在“更多”中查看粤语原句。':systemText(line.text||'');
  if(!caption&&waitingForReply())caption='阿明正在等你回应。';
  write($('.hud-speaker'),line.speaker?.startsWith('阿明')?'阿明 · 服务员':'');
  const spoken=line.speaker?.startsWith('阿明')?line.text:'';
  write($('.hud-cantonese'),spoken);$('.hud-cantonese').hidden=!spoken;
  write($('.hud-subtitle'),caption);write($('.hud-notice'),document.querySelector('#notice')?.textContent||'');
  $('.hud-caption').hidden=explore||panel||!caption;
  const long=caption.length>64,toggle=$('[data-hud="subtitle"]');toggle.hidden=!long;toggle.textContent=subtitleExpanded?'收起字幕':'展开完整字幕';
  toggle.setAttribute('aria-expanded',String(subtitleExpanded));$('.hud-caption').dataset.long=String(long);$('.hud-caption').classList.toggle('expanded',subtitleExpanded);
  $('.hud-subtitle').tabIndex=long&&subtitleExpanded?0:-1;
  const practice=guide.getPractice();
  const detail=$('.hud-original');
  detail.hidden=!moreDetail;
  if(moreDetail==='teach')write(detail,[practice.example,practice.meaning,voice&&practice.phraseId?'关掉此面板后，按说话键跟读可查看发音准确度。':''].filter(Boolean).join('\n'));
  if(moreDetail==='original')write(detail,line.jyutping?[line.text,line.jyutping].join('\n'):['本步示范',practice.example,practice.jyutping].filter(Boolean).join('\n'));
  for(const key of ['teach','original'])root.querySelector('[data-hud="'+key+'"]').setAttribute('aria-pressed',String(moreDetail===key));
  $('[data-hud="replay"]').disabled=!currentNpc||(!voice&&!preview);
 }
 function renderDirect(){
  const {state,view}=snapshot,box=$('.hud-direct'),buttons=$('.hud-direct-actions');
  const review=view.orderReview&&!readingPanel(),greeting=state.phase===P.GREETING;
  box.hidden=!(review||greeting)||view.busy||!card.hidden||!more.hidden;
  const key=review?'review':greeting?'greeting':'';
  if(box.dataset.kind===key)return;box.dataset.kind=key;buttons.replaceChildren();

  if(review)buttons.append(makeButton('继续选餐',{action:'CONTINUE_ORDER'}),makeButton('就这些，下单',{action:'FINISH_ORDER'}));
  if(greeting)buttons.append(makeButton('教我回答',{hud:'first-answer'}),makeButton('一位',{action:'START_SEATING'}),makeButton('两位',{action:'START_SEATING',partySize:'2'}));
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
  const previousRound=snapshot?.state?.round,wasPanel=readingPanel();snapshot=next;const {state,view}=next,active=pageActive();
  if(readingPanel()&&!wasPanel)voice?.setTextMode(false);
  root.hidden=!active;$('.hud-return').hidden=!exploring();root.dataset.exploring=String(exploring());root.dataset.panel=String(readingPanel());root.dataset.voiceError=String(voiceError);document.body.dataset.immersive='true';
  const viewControls=$('.hud-view-controls'),canLook=[P.SEATED,P.ORDERING,P.DINING,P.BILLING].includes(state.phase);
  $('[data-action="CALL_WAITER"]').hidden=!canLook||state.waiterPresent||view.busy||readingPanel()||exploring()||state.isPaid;
  viewControls.hidden=!canLook||exploring();
  root.querySelectorAll('[data-hud-camera]').forEach(button=>{
   const camera=button.dataset.hudCamera;
   button.hidden=camera===view.camera||(camera==='menu'&&![P.SEATED,P.ORDERING,P.DINING].includes(state.phase));
   button.disabled=camera==='menu'&&view.busy;
   button.setAttribute('aria-pressed',String(view.camera===camera));
  });
  if(previousRound!==state.round){
   turnKey='';offered=false;errorTurn='';voiceError=false;currentNpc=null;moreDetail=null;subtitleExpanded=false;pinned=false;
   clearHint();hideIdle();hideIntro();closeHelp(true);showMore(false);voice?.setTextMode(false);
  }
  if(exploring())showMore(false);
  if(!active){turnKey='';offered=false;clearHint();hideIdle();hideIntro();closeHelp(true);showMore(false);return;}
  const line=view.line||[];
  if(isNpcLine(line)){
   const key=JSON.stringify([state.round,line[0],line[1]]);
   if(currentNpc?.key!==key){
    currentNpc={key,round:state.round,speaker:line[0],text:line[1],jyutping:line[2]||'',meaning:line[3]||''};
   }
   const nextTurn=JSON.stringify([state.round,state.phase,line[1]]);
   if(nextTurn!==turnKey){
    turnKey=nextTurn;offered=false;errorTurn='';lastActivity=performance.now();clearHint();hideIdle();
    if(!pinned)closeHelp(false);else renderHelp();showMore(false);
   }
  }
  if(exploring()||readingPanel()){clearHint();hideIdle();closeHelp(true);showMore(false);}
  renderCaption();if(!card.hidden)renderHelp();renderDirect();scheduleHint();maybeShowIntro();
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
  if(button.dataset.help){kind=button.dataset.help;if(kind==='expression'){guide.noteHint('full');voice?.followExample?.();}renderHelp();return;}
  switch(button.dataset.hud){
   case 'help':kind='goal';showHelp(card.hidden,true);break;
   case 'close':closeHelp(true);$('[data-hud="help"]').focus({preventScroll:true});scheduleHint();break;
   case 'pin':pinned=!pinned;button.setAttribute('aria-pressed',String(pinned));button.textContent=pinned?'已固定':'固定';break;
   case 'more':showMore(more.hidden);break;
   case 'close-more':showMore(false);$('[data-hud="more"]').focus({preventScroll:true});scheduleHint();break;
   case 'first-answer':kind='expression';guide.noteHint('full');voice?.followExample?.();showHelp(true,true);renderDirect();break;
   case 'teach':
   case 'original':moreDetail=moreDetail===button.dataset.hud?null:button.dataset.hud;if(moreDetail==='teach'){guide.noteHint('full');voice?.followExample?.();}renderCaption();break;
   case 'replay':playLine(currentNpc?.text,1);break;
   case 'subtitle':subtitleExpanded=!subtitleExpanded;renderCaption();break;
   case 'listen':guide.noteHint('audio');playLine(guide.getPractice().example,1);break;
   case 'listen-slow':guide.noteHint('audio');playLine(guide.getPractice().example,.72);break;
   case 'npc-replay':playLine((currentNpc)?.text,1);break;
   case 'npc-slow':playLine((currentNpc)?.text,.72);break;
  }
  renderDirect();
 }
 function onKeydown(event){
  const target=event.target;
  if(event.isComposing||event.keyCode===229||event.ctrlKey||event.metaKey||event.altKey||target?.closest?.('input,textarea,select,[contenteditable="true"]')||document.querySelector('dialog[open]'))return;
  if(event.key.toLowerCase()==='h'&&!root.hidden){event.preventDefault();kind='goal';showHelp(card.hidden,true);}
  if(event.key==='Escape'&&(!card.hidden||!more.hidden)){event.preventDefault();closeHelp(true);showMore(false);voice?.setTextMode(false);$('[data-hud="help"]').focus({preventScroll:true});renderDirect();scheduleHint();}
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
 function onScore(event){const score=$('.hud-score');write(score,event.detail||'');score.hidden=!event.detail;}
 function onVisibility(){lastActivity=performance.now();if(document.hidden){clearHint();hideIdle();hideIntro();}else scheduleHint();}
 function destroy(){
  if(destroyed)return;destroyed=true;clearHint();hideIntro();
  root.removeEventListener('click',onRootClick);document.removeEventListener('keydown',onKeydown);document.removeEventListener('pointerdown',interacted);document.removeEventListener('keydown',interacted);
  dockObserver.disconnect();document.removeEventListener('visibilitychange',onVisibility);window.removeEventListener('voice-activity',onVoiceActivity);window.removeEventListener('voice-status',onVoiceStatus);
  window.removeEventListener('voice-practice-score',onScore);window.removeEventListener('pagehide',destroy);
 }
 root.addEventListener('click',onRootClick);document.addEventListener('keydown',onKeydown);document.addEventListener('pointerdown',interacted,{passive:true});document.addEventListener('keydown',interacted);
 document.addEventListener('visibilitychange',onVisibility);window.addEventListener('voice-activity',onVoiceActivity);window.addEventListener('voice-status',onVoiceStatus);
 window.addEventListener('voice-practice-score',onScore);window.addEventListener('pagehide',destroy,{once:true});
 return {sync,setFontSize,openHelp(){showHelp(true,true);},destroy};
}
