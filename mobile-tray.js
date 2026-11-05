// Use the existing voice and learning panels in a single mobile interaction area.
export function createMobileTray({ conversation, guide, voiceDock, staticPreview, onLayout, onCloseVoice, onCompact }) {
 const media = matchMedia('(max-width: 650px), (max-width: 950px) and (max-height: 520px) and (orientation: landscape)');
 const body = document.body;
 const place = (node) => { const marker = document.createComment(node.id); node.before(marker); return marker; };
 const voiceMarker = place(voiceDock), guideMarker = place(guide);
 const nav = document.createElement('div'), panels = document.createElement('div'), goal = document.createElement('p');
 nav.className = 'mobile-tray-nav'; panels.className = 'mobile-tray-panels'; goal.className = 'mobile-tray-goal';
 panels.hidden = nav.hidden = goal.hidden = true;
 const buttons = {};
 for(const [id,label,panel] of [['voice','说话 / 打字',voiceDock],['learn','练习与求助',guide]]) {
  const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
  button.setAttribute('aria-controls',panel.id); button.setAttribute('aria-expanded','false'); button.dataset.trayPanel=id;
  nav.append(button); buttons[id]=button;
  button.addEventListener('click',()=>select(current===id?'':id,true));
 }
 conversation.append(goal,nav,panels);
 let current='', mounted=false, active=false, desktopVoiceOpen=voiceDock.open, lastRound;
 function viewport() {
  if (!mounted) return;
  const vv=window.visualViewport, usable=vv&&Math.abs(vv.scale-1)<.025;
  const height=usable?vv.height:window.innerHeight;
  const typing=current==='voice'&&voiceDock.contains(document.activeElement)&&document.activeElement.matches('textarea,input:not([type=checkbox])');
  const bottom=typing&&usable?Math.max(0,window.innerHeight-vv.height-vv.offsetTop):0;
  body.style.setProperty('--mobile-available-height', Math.round(height)+'px');
  body.style.setProperty('--mobile-bottom-inset', Math.round(bottom)+'px');
  body.toggleAttribute('data-mobile-keyboard',bottom>16);
 }
 function select(next,focus=false) {
  if(next&&(!mounted||!active||buttons[next].hidden))return;
  const previous=current;
  current=next;
  if(previous==='voice'&&next!=='voice')onCloseVoice?.();
  if(current)body.dataset.mobileTray=current;else delete body.dataset.mobileTray;
  panels.hidden=!current;
  if(mounted)voiceDock.open=current==='voice';
  for(const [id,button] of Object.entries(buttons))button.setAttribute('aria-expanded',String(id===current));
  if(focus&&previous&&!next)buttons[previous].focus({preventScroll:true});
  viewport();
 }
 function setMounted() {
  if(mounted===media.matches)return;
  mounted=media.matches;
  body.toggleAttribute('data-mobile-layout',mounted);
  onCompact?.(mounted);
  if(mounted){
   desktopVoiceOpen=voiceDock.open;
   panels.append(voiceDock,guide);
   voiceDock.open=false;
  }else{
   if(current==='voice')onCloseVoice?.();
   voiceMarker.after(voiceDock);guideMarker.after(guide);
   voiceDock.open=desktopVoiceOpen;
   current='';delete body.dataset.mobileTray;
   delete body.dataset.mobileKeyboard;
   body.style.removeProperty('--mobile-available-height');
   body.style.removeProperty('--mobile-bottom-inset');
   nav.hidden=goal.hidden=panels.hidden=true;
  }
  viewport();
 }
 function sync({active:canInteract,round}){
  setMounted();
  active=canInteract;
  if(!mounted)return;
  buttons.voice.hidden=staticPreview;
  buttons.learn.hidden=guide.hidden;
  if(lastRound!==round||!active||(current&&buttons[current].hidden))select('');
  lastRound=round;
  nav.hidden=!active||(buttons.voice.hidden&&buttons.learn.hidden);
  const goalText=guide.hidden?'':guide.querySelector('[data-learning-goal]')?.textContent||'';
  if(goal.textContent!==goalText)goal.textContent=goalText;
  goal.hidden=!active||!goalText;
 }
 const change=()=>{setMounted();onLayout?.();};
 if(media.addEventListener)media.addEventListener('change',change);else media.addListener(change);
 window.visualViewport?.addEventListener('resize',viewport);
 window.visualViewport?.addEventListener('scroll',viewport);
 voiceDock.addEventListener('focusin',viewport);
 voiceDock.addEventListener('focusout',()=>requestAnimationFrame(viewport));
 document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&current&&!document.querySelector('dialog[open]')){
   event.preventDefault();select('',true);
  }
 },true);
 setMounted();
 return {sync,get mobile(){return mounted;}};
}

// Keep one primary action and one scene navigation control in view.
export function compactMobileActions(actions, expanded=false) {
 if(actions.querySelector('[data-click-fallback]'))return;
 const children=[...actions.children];
 const primary=children.find(el=>el.matches('.primary')||el.querySelector('.primary'))
  ||children.find(el=>el.matches('[data-camera="menu"],[data-camera="bill"]'));
 const navigation=children.find(el=>el.matches('[data-camera="table"],[data-camera="room"]'));
 const secondary=children.filter(el=>el!==primary&&el!==navigation&&el.matches('button,.reply-choice'));
 if(!primary||!secondary.length)return;
 const more=document.createElement('details'),summary=document.createElement('summary'),choices=document.createElement('div');
 more.className='mobile-secondary-actions';summary.textContent='更多操作';
 choices.className='mobile-secondary-options';choices.append(...secondary);more.append(summary,choices);more.open=expanded;
 if(primary!==actions.firstElementChild)actions.prepend(primary);
 actions.append(more);
}
