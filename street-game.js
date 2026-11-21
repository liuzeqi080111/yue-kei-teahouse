import {streetQuests,questPoint} from './street-quests.js';
import { atShopCounter, shopBlocks, SHOPS, ACTORS, HOME, COUNTER, LAUNDRY_DOOR, REST, RESTAURANT, createStreetNav, distance, within, rackLayout, rackBlocks } from './street-space.js';
import { atFangCounter, createFangCounter } from './street-fang.js';
import { createFp1Travel } from './fp1-travel.js';
import { createNeighborhoodVoice } from './neighborhood-voice.js';
import { FP1_CLIPS, ROLE_CLIPS } from './fp1-clips.js';
import { prepareVoiceRecording,followSpeech } from './voice-clips.js';
import { entryPosition } from './neighborhood-map.js';
import { ITEMS, NPCS, npcContext, optionsFor, qingStatus, rackStatus } from './neighborhood-state.js';

const MEETING='我聽日見工，件褸仲喺洗衣舖。陪我行一轉，好唔好？';
const WELCOME='走吧，陪你下楼转转。';
const GREETINGS={
 qing:[MEETING,'我明天要面试，外套还在洗衣店。能陪我去取吗？'],
 fang:['你有冇带张取件单嚟呀？','你带取件单了吗？'],
 ming:['你好呀，想問啲乜？','你好，想问什么？'],
 guest:['做咩事呀？我啱啱先坐低。','怎么了？我刚坐下。'],
 lam:['嚟，坐低捉盤五子棋。你揸黑，畀你行先。','来，坐下陪我下一盘五子棋。你执黑，先走。'],
 lok:['嚟睇碟呀？慢慢揀。','来看唱片吗？慢慢选。'],
 buyer:['我等緊阿樂留畀我嗰隻碟。','我在等阿乐给我留的唱片。'],
 ling:['揀件褸？啱身先好攞呀。','挑外套？合身再拿。'],
};
const LABELS=['上午','午后','入夜'];
const POINTS=['北','东北','东','东南','南','西南','西','西北'];
const pointOf=model=>({x:model.position.x,z:model.position.z});
const angle=(from,to)=>Math.atan2(to.x-from.x,from.z-to.z);
const deltaAngle=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
const canon=entryPosition('home');
const QING_AT_MARKET={x:-14.57,z:-9.42};
const QING_MARKET_ZONE=[-14.42,-12.98,-9.88,-8.18];
const keymap={KeyW:[1,0],KeyS:[-1,0],KeyA:[0,-1],KeyD:[0,1],ArrowUp:[1,0],ArrowDown:[-1,0],ArrowLeft:[0,0,-1],ArrowRight:[0,0,1]};

export function createStreetGame({getState,onAction,onRest,onLocation,onView,onHome,onHistoryChange,getStorageStatus,onTransition,prepareRestaurant,onEnterRestaurant,onRecordPlay,onTrackQuest}){
 const host=document.createElement('section');
 host.className='street-game';host.hidden=true;host.setAttribute('aria-label','第一人称街区');
 host.innerHTML=`
  <canvas id="street-view" tabindex="0" aria-label="第一人称街区，拖动转头，WASD 或方向键行走"></canvas>
  <div class="street-top">
   <div class="street-goals"><strong id="street-goal"></strong><small id="street-clock"></small></div>
   <div class="street-navigation"><canvas id="street-map" width="218" height="142" role="img" aria-label="街区地图，白色箭头是你，红点是任务目的地"></canvas><div class="street-menu"><button data-tray="tasks">任务</button><button data-tray="bag">物品</button><button data-tray="notes">记事</button><button data-dialog="settings">设置</button></div><aside class="street-tray" hidden></aside></div>
  </div>
  <p class="street-status" role="status"></p>
  <div class="street-pad" aria-label="移动方向">
   <button data-move="KeyW" aria-label="向前走">▲</button><button data-move="KeyA" aria-label="向左平移">◀</button>
   <button data-move="KeyS" aria-label="向后走">▼</button><button data-move="KeyD" aria-label="向右平移">▶</button>
  </div>
  <div class="street-prompt"><button id="street-follow" hidden></button><button id="street-interact" class="street-primary" hidden></button><button id="street-dine" hidden>进店用餐</button></div>
  <section class="street-dialogue" aria-label="街坊对话" hidden>
   <div class="street-caption"><strong class="street-speaker"></strong>
   <p class="street-line" aria-live="polite"></p><p class="street-meaning"></p></div>

   <div class="street-gomoku" hidden aria-label="九路五子棋盘"></div>
   <div class="street-tools">
    <button id="street-mic" aria-label="讲粤语" aria-pressed="false" title="讲粤语"><svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 11h2a5 5 0 0010 0h2a7 7 0 01-6 6.93V21h3v2H8v-2h3v-3.07A7 7 0 015 11z"/></svg></button>
    <button id="street-close">结束交谈</button>
    <div class="street-actions"></div>
    <details class="street-more"><summary>更多</summary><div class="street-more-panel">
    <details id="street-write"><summary>打字</summary><form class="street-form"><input maxlength="300" aria-label="想说的话" required><button>发送</button></form></details>
    <details id="street-listen"><summary>听这句</summary><button id="street-replay">重听</button> <button id="street-slow">慢速</button></details>
    <details id="street-help"><summary>问朋友</summary><button data-help="meaning">什么意思？</button> <button data-help="example">怎么说？</button> <button data-help="assist">帮我说。</button></details>
    </div></details>
   </div>
   <small id="street-voice-state" aria-live="polite"></small>
  </section>`;
 const stylesheet=document.createElement('link');
 stylesheet.rel='stylesheet';stylesheet.href='./street-game.css';document.head.append(stylesheet);
 document.body.append(host);
 const $=selector=>host.querySelector(selector);
 const canvas=$('canvas'),dialogue=$('.street-dialogue'),status=$('.street-status'),interact=$('#street-interact'),follow=$('#street-follow'),tray=$('.street-tray');
 const shopList=Object.values(SHOPS);
 const keys=new Set();
 let scene,loading,nav,travel,counter,active=false,visible=false,talking=null,previousTime=0,frameId=0;
 let current={...HOME,pitch:.02},pendingLook=null,drag=null,nextTarget=null;
 let lastView=0,showedIntroduction=false,clip=null,lastSpeech=null,styleKey='',dirty=true,restoreId=0,noticeTimer=0,voiceRecording=false;
 let chess=null,chessFinished=null,chessBusy=false,chessTurns=0,playTurn;
 let pendingVoiceFollow=false,guideTravel=null,guideHeadStart=0;
 let clipRequest=null,clipUrl=null,stopLip=null;
 function speechLevel(id,level,shape){
  scene?.speak(id==='intro'?'friend':ACTORS[id]?.model||id,level,shape);dirty=true;
 }
 function publish(message){
  clearTimeout(noticeTimer);status.textContent=message;
  if(message)noticeTimer=setTimeout(()=>{status.textContent='';},5600);
 }
 function setText(selector,text){const element=$(selector);if(element.textContent!==text)element.textContent=text;}
 const isAt=(target,radius)=>distance(current,target)<=radius;
 const worldFlag=id=>getState().flags.includes(id);
 const route=()=>getState().flags.find(id=>id.startsWith('coat-route-'))?.slice(11);
 const has=item=>getState().items.includes(item);
 let tracked='coat',mapBase=null,mapKey='',taskRevision='';
 function track(id){tracked=id;onTrackQuest?.(id);dirty=true;}
 function tasks(){return streetQuests(getState());}
 function activeQuest(){const all=tasks();return all.find(q=>q.id===tracked&&!q.done)||all.find(q=>!q.done)||all[0];}
 function drawMap(quest){
  if(!scene)return;
  const map=$('#street-map'),ctx=map.getContext('2d'),{w,h,step,x0,z0,rows}=scene.layout;
  const px=x=>(x-x0)/step/w*map.width,pz=z=>(z-z0)/step/h*map.height;
  if(!mapBase){
   mapBase=document.createElement('canvas');mapBase.width=w;mapBase.height=h;
   const bg=mapBase.getContext('2d');bg.fillStyle='#372e27';bg.fillRect(0,0,w,h);bg.fillStyle='#94836b';
   rows.forEach((row,y)=>{for(let i=0;i<row.length;i+=3)bg.fillRect(row[i],y,row[i+1],1);});
  }
  const target=questPoint(quest,getState()),key=[Math.round(px(current.x)),Math.round(pz(current.z)),Math.round(current.heading*35),quest.npc].join('/');
  if(key===mapKey)return;mapKey=key;ctx.drawImage(mapBase,0,0,map.width,map.height);
  ctx.font='bold 12px sans-serif';ctx.lineWidth=2;ctx.strokeStyle='#211912';ctx.fillStyle='#f4e8ca';
  for(const [label,x,z] of [['粤记',-19,10],['洗衣',14,2],['榕树',12,-14],['夜市',-22,-8]]){ctx.strokeText(label,px(x),pz(z));ctx.fillText(label,px(x),pz(z));}
  if(target){ctx.fillStyle='#e36f53';ctx.beginPath();ctx.arc(px(target.x),pz(target.z),5,0,2*Math.PI);ctx.fill();ctx.strokeStyle='#fff0d2';ctx.stroke();}
  ctx.save();ctx.translate(px(current.x),pz(current.z));ctx.rotate(current.heading);ctx.fillStyle='white';ctx.beginPath();ctx.moveTo(0,-7);ctx.lineTo(5,5);ctx.lineTo(0,3);ctx.lineTo(-5,5);ctx.closePath();ctx.strokeStyle='#2b211c';ctx.stroke();ctx.fill();ctx.restore();
 }
 const currentPhase=()=>getState().period;
 const body=id=>scene?.actors.get(ACTORS[id]?.model||id)?.model;
 const qingCounterPoint=()=>current.x>16?{x:15.25,z:-.47}:{x:14.59,z:-.21};
 const qingAtCounter=()=>distance(pointOf(body('qing')),qingCounterPoint())<.28;
 function actionList(npc){
  if(npc==='intro')return [{id:'go-out',label:'出门'}];
  if(SHOPS[npc])return [...optionsFor(getState(),npc),{id:'ask-shop',label:SHOPS[npc].question}];
  if(npc==='fang'&&worldFlag('coat-pickup-visit')&&worldFlag('shop-check')&&!worldFlag('coat-inspected'))return [{id:'show-coat',label:'把刚取的外套交给身旁的阿晴'}];
  const legal=optionsFor(getState(),npc);
  if(npc==='ming')return [{id:'enter-restaurant',label:'进店用餐'},...legal];
  if(npc==='lam'){
   const choices=legal.filter(o=>o.id!=='record-start'||(chess&&chessTurns>=2)).map(o=>o.id==='record-start'?{...o,label:'你哋以前听边只碟？'}:o);
   if(!chess||chessFinished)choices.unshift({id:'sit-chess',label:chess?'再下一盘':'坐下，陪林伯下五子棋'});
   return choices;
  }
  if(npc==='fang'){
   const check=legal.find(option=>option.id==='shop-check');
   if(check)return [check];
   const plans=legal.filter(option=>option.id.startsWith('coat-route-'));
   if(plans.length)return plans;
  }
  if(npc==='qing'&&!worldFlag('coat-start'))return [
   {...legal.find(o=>o.id==='coat-start'),label:'答应，陪她去洗衣店'},
   {id:'defer',label:'稍后再来'},
  ];
  return legal;
 }
 const historyProbe=createNeighborhoodVoice({getContext:()=>null,getRevision:()=>0,applyAction:()=>{},eventTarget:null});
 const historyValue=value=>value&&Object.keys(value).length===0?{version:1,npcs:[]}:value;
 const voice=createNeighborhoodVoice({
  getContext:()=>{
   if(talking==='intro')return {npcId:'intro',name:'老朋友',role:'陪你熟悉街区的老朋友',facts:[WELCOME],allowedActions:actionList(talking)};
   const shop=SHOPS[talking];
   if(shop)return {npcId:talking,name:shop.name,role:'街坊店主',facts:[shop.meaning,shop.translation],allowedActions:actionList(talking)};
   if(!NPCS[talking])return null;
   const context=npcContext(getState(),talking);
   return {npcId:talking,name:NPCS[talking].name,role:NPCS[talking].role,
    facts:[context.background,...context.knownClues,...context.relations].slice(0,12),
    allowedActions:actionList(talking).filter(o=>o.effect||o.id==='enter-restaurant'||(o.id==='show-coat'&&qingAtCounter())).map(({id,label})=>({id,label}))};
  },
  matchFixedChoice:(context,text)=>{
   const shop=SHOPS[context.npcId];
   if(!shop&&context.npcId!=='intro')return null;
   const normalize=value=>value.replace(/[\s？?！!。，、]/g,'');
   const answer=normalize(text);
   const choice=context.allowedActions.find(option=>normalize(option.label)===answer);
   if(choice)return {actionId:choice.id};
   if(!shop&&/^(好[啊呀啦的]?|好啊出[门門]|我[哋们們]出[门門]|落[楼樓]|行啦|出[门門]啦?|走吧)$/.test(answer))return {actionId:'go-out'};
   if(shop)return {text:shop.reply,meaning:shop.translation};
   return {text:'准备好了就说「出门」，我陪你下楼。',meaning:'准备好了就说「出门」，我陪你下楼。'};
  },
  getRevision:()=>getState().revision,
  applyAction:id=>act(id,true),
  onLine:({text,meaning})=>{
   if(!talking)return;
   const start=pendingVoiceFollow;
   pendingVoiceFollow=false;
   const speaker=lastSpeech?.text===text?lastSpeech.speaker:talking;
   setLine(text,meaning,false,speaker);
   if(start)queueMicrotask(beginFollow);
   else queueMicrotask(()=>{if(talking)play();});
   onHistoryChange(voice.exportHistory());
  },
  onStatus:({message})=>setText('#street-voice-state',message),
  onTranscript:text=>setText('#street-voice-state','听到：'+text),
  onRecording:recording=>{
   voiceRecording=recording;
   const microphone=$('#street-mic');
   microphone.title=recording?'停止并发送':'讲粤语';
   microphone.setAttribute('aria-label',microphone.title);
   microphone.setAttribute('aria-pressed',String(recording));
  },
  onSpeechLevel:speechLevel,autoSpeak:false,
 });
 function stopSpeech(){
  stopLip?.();stopLip=null;clipRequest?.abort();clipRequest=null;
  if(clip){clip.pause();clip=null;}
  if(clipUrl){URL.revokeObjectURL(clipUrl);clipUrl=null;}
 }
 async function playFile(file,speaker,rate=1){
  stopSpeech();
  const request=new AbortController();clipRequest=request;
  try{
   const res=await fetch(file,{signal:request.signal});
   if(!res.ok)throw Error('clip');
   const recording=await prepareVoiceRecording(await res.blob(),speaker);
   if(request.signal.aborted)return;
   clipUrl=URL.createObjectURL(recording.blob);clip=new Audio(clipUrl);
   clip.preservesPitch=true;clip.playbackRate=rate*recording.rate;
   clip.onended=()=>{if(clipRequest===request)stopSpeech();};
   await clip.play();
   if(!request.signal.aborted)stopLip=followSpeech(clip,recording.blob,(level,shape)=>speechLevel(speaker,level,shape),file);
  }catch(error){
   if(request.signal.aborted)return;
   stopSpeech();
   if(talking)setText('#street-voice-state',error.name==='NotAllowedError'?'点「听这句」即可播放。':'配音未能播放，请点「听这句」重试。');
  }
 }
 function friendLine(text,instruction=''){
  publish('老朋友：'+text+(instruction?' '+instruction:''));
  if(FP1_CLIPS[text])void playFile(FP1_CLIPS[text],'intro');
 }
 function play(rate=1){
  stopSpeech();
  if(!lastSpeech)return;
  const speaker=lastSpeech.speaker||talking;
  const file=ROLE_CLIPS[speaker+'|'+lastSpeech.text]||(speaker==='intro'&&FP1_CLIPS[lastSpeech.text]);
  if(file){
   voice.cancel('');
   void playFile(file,speaker,rate);
  }else if(talking){
   voice.setLine({npcId:talking,...lastSpeech});
   void (rate<1?voice.replaySlow():voice.replay());
  }
 }
 function setLine(text,meaning,speak=false,speaker=talking){
  lastSpeech={text,meaning,speaker};
  setText('.street-line',text);setText('.street-meaning',text===meaning?'':meaning);
  if(speak)play();
 }
 function drawHud(){
  const w=getState(),quest=activeQuest();
  setText('#street-goal',(quest.done?'✓ ':quest.id==='coat'?'主线 · ':'支线 · ')+quest.text);
  drawMap(quest);
  setText('[data-tray=tasks]','任务 '+tasks().filter(q=>q.done).length+'/3');
  if(!tray.hidden&&tray.dataset.kind==='tasks'&&taskRevision!==w.revision+tracked)renderTasks();
  const direction=POINTS[(Math.round(current.heading/(Math.PI/4))%8+8)%8];
  setText('#street-clock','第 '+w.day+' 天 · '+LABELS[w.period]+' · HK$'+(w.money/100).toFixed(2)+' · 朝'+direction);
  const key=JSON.stringify([w.period,rackStatus(w).placement,rackStatus(w).blocked,qingStatus(w).presence,route()]);
  if(scene)scene.reunion(worldFlag('reunion-arrived'));
  if(scene)scene.showCoat(worldFlag('shop-check')&&worldFlag('coat-pickup-visit')&&!route());
  if(scene&&key!==styleKey){
   styleKey=key;scene.illuminate(w.period===2);scene.placeRack(rackLayout(w));
   const qing=scene.actors.get('aqing');
   qing.model.visible=qingStatus(w).presence!=='interview';
   if(route()==='buy'&&!w.coatOutcome){
    qing.model.position.set(QING_AT_MARKET.x,.111,QING_AT_MARKET.z);
    qing.model.rotation.y=1.18;
   }else if(!worldFlag('coat-pickup-visit')||route())qing.model.position.fromArray(qing.spec.position);
   dirty=true;
  }
 }
 function renderTasks(){
  tray.replaceChildren();taskRevision=getState().revision+tracked;
  for(const q of tasks()){
   const row=document.createElement('button');row.className='quest-row';row.disabled=q.done;
   row.setAttribute('aria-pressed',String(q.id===activeQuest().id));row.textContent=(q.done?'✓ 已完成':q.id===activeQuest().id?'◎ 追踪中':'○ 待完成')+' · '+q.name;
   row.onclick=()=>{track(q.id);renderTasks();};tray.append(row);
  }
  const hint=document.createElement('p');hint.textContent=activeQuest().text;tray.append(hint);
  for(const [story,label] of [['photo','试玩 B · 街口最后一张合照'],['table','试玩 A · 今晚搭张台']]){
   const link=document.createElement('a');link.className='quest-row';link.href='./story-preview.html?story='+story;link.textContent=label;tray.append(link);
  }
 }
 function openTray(kind){
  const content={
   bag:getState().items.map(id=>id==='wrongCoat'&&worldFlag('coat-pickup-visit')&&!worldFlag('coat-inspected')?'刚取的深色外套':ITEMS[id]).concat(worldFlag('ticket-filed')?['取件单已由芳姐存档']:[]),
   notes:getState().notes,
   guide:['东侧生活巷，自南向北：安和楼 → 洗衣店 → 榕荫小坐。','西侧主街，自南向北：粤记 → 唱片摊 → 衣摊。南北两头都能绕过去。','WASD / ↑↓ 行走 · 拖动画面或用 ← → 转头 · 靠近后按 E 交谈。','随时可以环顾或脱离跟随。到树下才可明确等待，推进时段。'],
  }[kind];
  const same=!tray.hidden&&tray.dataset.kind===kind;
  tray.dataset.kind=kind;tray.hidden=same;tray.replaceChildren();
  if(same)return;
  if(kind==='tasks'){renderTasks();return;}
  const list=document.createElement('ul');
  for(const value of (content.length?content:['暂时没有'])){const li=document.createElement('li');li.textContent=value;list.append(li);}
  tray.append(list);
  if(getStorageStatus()?.includes('未保存')){const p=document.createElement('p');p.textContent=getStorageStatus();tray.append(p);}
 }
 function dropDialogue(keepClip=false){
  if(talking==='fang')counter.close();
  chess=null;chessFinished=null;chessTurns=0;$('.street-gomoku').hidden=true;delete host.dataset.chess;
  talking=null;pendingVoiceFollow=false;lastSpeech=null;pendingLook=null;
  if(keepClip!==true)stopSpeech();voice.cancel('');dialogue.hidden=true;host.dataset.conversation='false';
  if(visible){canvas.focus({preventScroll:true});updateTarget();}
  dirty=true;
 }
 function showBoard(){
  const panel=$('.street-gomoku');panel.hidden=false;panel.replaceChildren();
  for(let i=0;i<81;i++){
   const cell=document.createElement('button'),color=chess[i];
   cell.type='button';cell.dataset.cell=i;cell.dataset.stone=color;
   cell.setAttribute('aria-label',(Math.floor(i/9)+1)+'行'+(i%9+1)+'列'+(['空位','黑棋','白棋'][color]));
   cell.disabled=Boolean(color||chessFinished);
   cell.onclick=()=>{
    if(talking!=='lam'||!chess||chessFinished)return;
    const turn=playTurn(chess,i);if(!turn.ok)return;
    chess=turn.board;chessTurns++;chessFinished=turn.outcome;
    scene.placeStones(chess);dirty=true;
    if(chessFinished){const line=chessFinished==='black'?['好棋！五粒連埋一行，你贏喇。','好棋！五子相连，你赢了。']:chessFinished==='white'?['睇吓呢邊，連成五粒喇。再嚟一盤？','看这边，五个连起来了。再来一盘？']:['滿晒喇，和棋。','落满了，和棋。'];setLine(...line,true);}
    else if(chessTurns===2&&!worldFlag('record-start'))setLine('以前我同個老友都係咁，一邊捉棋，一邊聽唱片。','以前我和一个老朋友也是这样，一边下棋，一边听唱片。',true);
    else if(chessTurns===1)setLine('唔使急，望清楚啲先落。','慢慢来，看清楚再落子。',true);
    showBoard();showChoices();
   };panel.append(cell);
  }
 }
 function showChoices(){
  const controls=$('.street-actions');
  controls.replaceChildren();
  const recommended=activeQuest().action;
  const actions=actionList(talking).sort((a,b)=>Number(b.id===recommended)-Number(a.id===recommended));
  for(const action of actions){
   const button=document.createElement('button');
   button.type='button';button.dataset.streetAction=action.id;button.textContent=action.label;
   if(action.id===recommended||['go-out','coat-start','shop-check','coat-route-recover','coat-route-borrow','coat-route-buy'].includes(action.id))button.className='street-primary';
   if(action.id==='show-coat'&&!qingAtCounter()){button.disabled=true;button.textContent='等阿晴行到柜台前…';}
   button.onclick=event=>{if(event.detail<=1)act(action.id);};
   controls.append(button);
  }
 }
 function greeting(npc){
  const world=getState();
  if(npc==='southRice'&&worldFlag('reunion-invite')&&!worldFlag('reunion-date'))return ['你識阿林？我同佢以前晚晚收工都捉棋㗎。','你认识阿林？我们以前收铺后天天下棋。'];
  if(npc==='intro')return [WELCOME,WELCOME];
  if(npc==='qing'&&worldFlag('coat-start')){
   if(worldFlag('qing-returned'))return ['我見完工返嚟喇。','我面试回来了。'];
   if(route()==='buy')return ['件褸我想試多次，睇吓啱唔啱身。','这件外套我想再试一下，看看合不合身。'];
   return ['多謝你肯幫手。你問到啲咩呀？','谢谢你愿意帮忙。你问到什么了？'];
  }
  if(npc==='guest'&&has('coat'))return ['件褸換返喇，快啲拎返安和樓畀阿晴啦。','衣服已经换回来了。把它带回安和楼交给阿晴。'];
  if(npc==='guest'&&worldFlag('guest-found')&&!worldFlag('coat-swapped'))return ['芳姐叫你嚟㗎？張單同袖口都要對一對先。','是芳姐让你来的？选「核对袖口」看看是不是同一件。'];
  if(npc==='fang'&&route()==='recover'&&!getState().coatOutcome){
   if(has('coat'))return ['原來真係調轉咗，快啲拎返畀阿晴啦。','原来真拿反了，快把衣服带回安和楼交给阿晴。'];
   if(worldFlag('guest-found'))return ['周生喺粵記門邊。你同佢對吓袖口同內袋個名。','周叔在粤记门口。找他核对右袖补痕和内袋姓名。'];
   return ['你去粵記門口搵阿明，問吓周生坐喺邊。','先去粤记门口，问阿明周叔在哪里。结束交谈后可以点「带我去任务地点」。'];
  }
  if(npc==='fang'&&worldFlag('shop-check')){
   if(worldFlag('coat-misunderstanding'))return ['有事嘅話，你慢慢講。','有事的话，你慢慢说。'];
   return ['張單已經入咗簿。','单据已经登记好了。'];
  }
  if(npc==='lam'&&worldFlag('record-reunited'))return ['阿祥話下個禮拜再嚟捉棋。','阿祥约了我，下个星期再来下棋。'];
  if(npc==='lam'&&worldFlag('reunion-arrived'))return ['阿祥，呢邊！位都幫你留咗。','阿祥，这边！你的位子给你留着呢。'];
  if(npc==='lam'&&world.recordOutcome==='gift')return ['隻碟我收好咗。唔該晒你。','唱片我收好了。谢谢你。'];
  if(npc==='lam'&&world.recordOutcome==='contact')return ['我已經留咗口訊畀老朋友。','我已经给老朋友留了口信。'];
  if(npc==='lam'&&worldFlag('record-start'))return ['阿樂嗰邊，有冇我老友嘅消息呀？','阿乐那边，有我老朋友的消息吗？'];
  if((npc==='ming'||npc==='ling')&&world.stallOutcome){
   const rack=rackStatus(world);
   return rack.blocked?['未到飯點，衫架照擺出嚟。',rack.description]:
    ['你睇，而家條路闊咗。',rack.description];
  }
  if(SHOPS[npc])return [SHOPS[npc].line,SHOPS[npc].meaning];
  return GREETINGS[npc];
 }
 function openDialogue(npc){
  if(talking)return false;
  keys.clear();travel.pause();talking=npc;dirty=true;tray.hidden=true;publish('');
  host.dataset.conversation='true';dialogue.hidden=false;
  for(const detail of dialogue.querySelectorAll('details'))detail.open=false;
  $('#street-help').hidden=npc==='intro';
  setText('#street-voice-state','');setText('.street-speaker',SHOPS[npc]?.name||NPCS[npc]?.name||'老朋友');
  const [text,meaning]=greeting(npc);
  setLine(text,meaning,true);
  const actor=body(npc==='intro'?'qing':npc);
  const focusPoint=npc==='intro'&&scene.actors.get('friend')?pointOf(scene.actors.get('friend').model):actor&&pointOf(actor);
  if(focusPoint)pendingLook={heading:angle(current,focusPoint),pitch:-.115};
  showChoices();drawHud();updateTarget();
  return true;
 }
 function act(id,fromVoice=false){
  if(!talking)return {ok:false,message:'请先开始交谈。'};
  const npc=talking;
  const previousTasks=tasks();
  if(npc==='intro'&&id==='go-out'){
   const leave=()=>{if(talking==='intro'){onLocation('street',canon);dropDialogue();openDialogue('qing');}};
   if(fromVoice)queueMicrotask(leave);else leave();
   return {ok:true,text:'好，出門啦。',meaning:'好，我们出门。'};
  }
  if(npc==='qing'&&id==='defer'&&!worldFlag('coat-start')){
   dropDialogue();friendLine('行，你慢慢看。准备好了我们再出发。','再来找阿晴就行。');persist(true);return {ok:true};
  }
  if(!canTalk(npc,current))return {ok:false,message:'请走近后再开口。'};
  if(!actionList(npc).some(o=>o.id===id))return {ok:false,message:'现在还不能这样做。'};
  if(npc==='ming'&&id==='enter-restaurant'){
   if(fromVoice)queueMicrotask(()=>{if(talking==='ming')enterRestaurant();});
   else enterRestaurant();
   return {ok:true,text:'入嚟坐。',meaning:'进来坐。'};
  }
  if(SHOPS[npc]&&id==='ask-shop'){const {reply:text,translation:meaning}=SHOPS[npc];if(!fromVoice)setLine(text,meaning,true);return {ok:true,text,meaning};}
  if(id==='sit-chess'&&npc==='lam'){
   if(chessBusy)return {ok:false};
   chessBusy=true;
   import('./street-gomoku.js').then(r=>{
    playTurn=r.playTurn;if(talking!=='lam')return;
    chess=Array(81).fill(0);chessFinished=null;chessTurns=0;host.dataset.chess='true';
    scene.placeStones(chess);dirty=true;showBoard();showChoices();
    setLine('你揸黑，揀個交叉位落子啦。','你执黑，选一个交叉点落子。',true);
   }).catch(()=>setText('#street-voice-state','棋盘未能打开，请再试一次。')).finally(()=>{chessBusy=false;});
   return {ok:true};
  }
  if(id==='show-coat'){
   if(!qingAtCounter())return {ok:false,message:'阿晴正行过来。'};
   const reply=onAction('qing','coat-inspect');if(reply.ok){
    setText('.street-speaker','阿晴');setLine(reply.text,reply.meaning,!fromVoice,'qing');
    pendingLook={heading:angle(current,pointOf(body('qing'))),pitch:-.07};showChoices();drawHud();
   }return reply;
  }
  const result=id==='shop-check'&&npc==='fang'?counter.handTicket():onAction(npc,id);
  if(result.ok){
   if(id.startsWith('record-')||['sleeve-read','consent-relay','buyer-consent'].includes(id))track('record');
   if(id.startsWith('stall-'))track('stall');
   if(id.startsWith('coat-')||['guest-found','shop-check','laundry-reconcile'].includes(id))track('coat');
   const completed=tasks().find(q=>q.done&&!previousTasks.find(old=>old.id===q.id).done);
   if(completed)publish('✓ '+completed.name+' · 已完成');
   if(id==='record-reunion'){onRecordPlay?.();chess=null;delete host.dataset.chess;$('.street-gomoku').hidden=true;pendingLook={heading:angle(current,{x:16.05,z:-12.71}),pitch:-.04};}
   if(id.startsWith('coat-route-'))pendingLook={heading:angle(current,pointOf(body('fang'))),pitch:-.09};
   if(!fromVoice){setText('.street-speaker',(NPCS[npc]||SHOPS[npc])?.name||'街坊');setText('#street-voice-state','');setLine(result.text,result.meaning,true);}
   if(id==='stall-observe')pendingLook={heading:angle(current,rackLayout(getState())),pitch:-.19};
   if(id==='shop-check'){
    const paper=document.createElement('span');paper.className='street-ticket';
    paper.textContent='洗衣取件單';paper.setAttribute('aria-hidden','true');host.append(paper);
    paper.addEventListener('animationend',()=>paper.remove(),{once:true});
   }
   showChoices();drawHud();
   if(npc==='qing'&&id==='coat-start'){
    if(fromVoice)pendingVoiceFollow=true;
    else beginFollow();
   }
   if(qingStatus(getState()).presence==='interview'&&npc==='qing'){
    const leave=()=>{publish(result.text+' '+result.meaning);dropDialogue(true);drawHud();};
    if(fromVoice)queueMicrotask(leave);else leave();
   }
  }else if(!fromVoice)setText('#street-voice-state',result.message||'现在不能这样做。');
  return result;
 }
 function startRoute(to){
  const steps=nav.path(current,to);
  if(!steps.length){publish('老朋友：这里过不去，先走回路面吧。');return;}
  travel.reset(current);travel.start(steps,to===COUNTER?'counter':'door');
  guideTravel=null;guideHeadStart=0;
  if(worldFlag('coat-start')&&!worldFlag('shop-check')){
   guideTravel={dest:to===COUNTER?{x:13.52,z:1.16}:to};
   scene.actors.get('friend').path=null;guideHeadStart=.8;
  }
  const first=steps.find(point=>distance(current,point)>.20);
  pendingLook=null;
  scene.actors.get('friend').model.visible=true;
  publish(to===COUNTER?'走进侧门，前往芳姐的柜台。':'老朋友：我陪你去芳姐那儿。可以边走边看。');
  dirty=true;
 }
 function beginFollow(){
  dropDialogue(true);
  if(!worldFlag('shop-check'))startRoute(COUNTER);
 }
 function canTalk(id,position){
  if(id==='southRice'&&worldFlag('reunion-arrived'))return false;
  if(SHOPS[id])return atShopCounter(SHOPS[id],position);
  if(!id||!ACTORS[id])return false;
  if(id==='qing'&&worldFlag('coat-pickup-visit')&&!route())return false;
  if(id==='fang')return atFangCounter(position);
  const model=body(id);
  if(id==='lam')return model.visible&&within(position,ACTORS.lam.zone)&&distance(position,pointOf(model))<=2.55;
  const zone=id==='qing'&&route()==='buy'&&!getState().coatOutcome?QING_MARKET_ZONE:ACTORS[id].zone;
  return model.visible&&within(position,zone)&&distance(position,pointOf(model))<=2.3;
 }
 function updateTarget(){
  const dine=$('#street-dine');
  dine.hidden=true;
  if(!scene||talking){
   interact.hidden=true;follow.hidden=true;return;
  }
  const candidates=[...Object.keys(ACTORS),...Object.keys(SHOPS)].filter(id=>canTalk(id,current));
  candidates.sort((a,b)=>distance(current,pointOf(body(a)))-distance(current,pointOf(body(b))));
  const quest=activeQuest();
  nextTarget=atFangCounter(current)?'fang':candidates.includes(quest.npc)?quest.npc:candidates[0]||null;
  const byEntrance=within(current,[-15.3,-11.8,7.6,11.3]);
  if(byEntrance){
   if(isAt(RESTAURANT,.67)||!nextTarget)nextTarget='restaurant';
   else dine.hidden=false;
  }
  if((!nextTarget||quest.npc==='rest')&&isAt(REST,2.05))nextTarget='rest';
  if(!nextTarget&&(within(current,[14.24,17.2,-.60,-.29])||isAt(LAUNDRY_DOOR,1.75)))nextTarget='door';
  const mode=travel.snapshot().mode;
  follow.hidden=mode!=='following'&&(quest.done||nextTarget===quest.npc);
  follow.textContent=mode==='following'?'自己走':'带我去任务地点';
  interact.hidden=!nextTarget||mode==='following'&&nextTarget==='door';
  const labels={restaurant:'进店用餐',rest:'坐坐，等一个时段',door:'进洗衣店，走到芳姐柜前',fang:'跟芳姐交谈'};
  if(nextTarget)interact.textContent=(labels[nextTarget]||'跟'+(SHOPS[nextTarget]||NPCS[nextTarget]).name+'交谈')+' [E]';
 }
 async function enterRestaurant(){
  if(!visible||!active||host.inert)return;
  const entry=restoreId;
  keys.clear();travel.pause();host.inert=true;publish('正在进店…');
  try{await prepareRestaurant();}
  catch{if(entry===restoreId)publish('茶餐厅暂时未能载入，点「进店用餐」重试。');return;}
  finally{host.inert=false;}
  if(entry!==restoreId||!visible||!active)return;
  persist(true);onLocation('restaurant',entryPosition('restaurant'));hide({flush:false});onEnterRestaurant();
 }
 function doInteract(){
  if(!visible||!nextTarget||talking)return;
  if(nextTarget==='door'){if(travel.snapshot().mode!=='following')startRoute(COUNTER);return;}
  if(nextTarget==='rest'){
   const result=onRest();
   publish(result.ok?'你在榕树下歇了一阵。现在是'+LABELS[currentPhase()]+'。':result.message);
   dirty=true;drawHud();updateTarget();return;
  }
  if(nextTarget==='restaurant'){
   enterRestaurant();return;
  }
  if(nextTarget==='fang')counter.open();
  else if(canTalk(nextTarget,current))openDialogue(nextTarget);
 }
 function persist(final=false){
  if(!active||!scene)return;
  onView({x:current.x,z:current.z,heading:current.heading,pitch:current.pitch},{final});
  lastView=performance.now();
 }
 function move(dx,dz){
  if(travel.snapshot().mode==='following')travel.pause();
  const from=travel.snapshot().position;
  travel.move(dx,0);travel.move(0,dz);
  const next=travel.snapshot().position;
  if(distance(from,next)>.0001){current.x=next.x;current.z=next.z;dirty=true;}
 }
 function walkBeside(actor,dest,gap,dt){
  let p=pointOf(actor.model);
  if(!nav.walkable(p.x,p.z)){
   const near=[.45,.8,1.2].flatMap(d=>Array.from({length:8},(_,k)=>({x:p.x+d*Math.sin(k*Math.PI/4),z:p.z+d*Math.cos(k*Math.PI/4)}))).find(q=>nav.walkable(q.x,q.z));
   if(!near)return;p=near;actor.model.position.set(p.x,.11,p.z);
  }
  if(distance(p,dest)<=gap)return;
  if(!actor.path?.length||distance(actor.dest,dest)>.55){actor.path=nav.path(p,dest);actor.dest={...dest};}
  const next=actor.path[0];if(!next)return;
  const len=distance(p,next);if(len<.03){actor.path.shift();return;}
  const step=Math.min(len,2.6*dt,Math.max(.001,distance(p,dest)-gap)),x=p.x+(next.x-p.x)*step/len,z=p.z+(next.z-p.z)*step/len;
  if(!nav.line(p,{x,z})){actor.path=[];return;}
  actor.model.position.set(x,(nav.cell(x,z)-11)/100,z);
  actor.model.rotation.y+=deltaAngle(actor.model.rotation.y,Math.atan2(next.x-p.x,next.z-p.z))*Math.min(1,11*dt);
  actor.strideDistance=step;dirty=true;
 }
 function advance(dt){
  let forward=0,strafe=0,turn=0;
  for(const code of keys){
   const [f,s,t=0]=keymap[code];
   forward+=f;strafe+=s;turn+=t;
  }
  if(turn){current.heading+=turn*1.78*dt;pendingLook=null;dirty=true;}
  if(forward||strafe){
   const speed=2.45*dt/Math.hypot(forward,strafe),a=current.heading;
   move((Math.sin(a)*forward+Math.cos(a)*strafe)*speed,(-Math.cos(a)*forward+Math.sin(a)*strafe)*speed);
  }
  if(travel.snapshot().mode==='following'&&guideHeadStart>0)guideHeadStart=Math.max(0,guideHeadStart-dt);
  else if(travel.snapshot().mode==='following'){
   const old={...current},next=travel.tick(dt).position;
   Object.assign(current,next);
   if(distance(old,next)>.0001){
    // Following changes position while the player keeps control of the view.
    dirty=true;
   }
  }
  if(guideTravel&&['following','arrived'].includes(travel.snapshot().mode)){
   const guide=scene.actors.get('friend'),dest=guideTravel.dest;
   if(distance(pointOf(guide.model),current)<2.9||travel.snapshot().mode==='arrived')walkBeside(guide,dest,.08,dt);
   if(distance(pointOf(guide.model),dest)<.11)guideTravel=null;
  }
  if(worldFlag('coat-pickup-visit')&&!route()){
   const atCounter=atFangCounter(current);
   walkBeside(scene.actors.get('aqing'),atCounter?qingCounterPoint():current,atCounter?.09:1.35,dt);
   if(talking==='fang'&&qingAtCounter()&&host.querySelector('[data-street-action="show-coat"]:disabled'))showChoices();
   if(!guideTravel)walkBeside(scene.actors.get('friend'),atCounter?{x:13.52,z:1.16}:current,atCounter?.1:1.9,dt);
  }
  for(const id of ['friend','aqing']){
   const actor=scene.actors.get(id);
   if(actor.step?.(actor.strideDistance||0,dt))dirty=true;
   actor.strideDistance=0;
  }
  if(pendingLook){
   const diff=deltaAngle(current.heading,pendingLook.heading);
   const pitchDelta=pendingLook.pitch-current.pitch;
   const ease=Math.min(1,dt*5.5);
   current.heading+=diff*ease;current.pitch+=pitchDelta*ease;dirty=true;
   if(Math.abs(diff)+Math.abs(pitchDelta)<.01)pendingLook=null;
  }
  if(talking==='fang'&&lastSpeech?.speaker==='qing'&&!route())pendingLook={heading:angle(current,pointOf(body('qing'))),pitch:-.23};
  if(talking==='fang'&&worldFlag('coat-inspected')&&!route()&&scene.face('aqing',current,dt))dirty=true;
  if(talking==='intro'&&scene.face('friend',current,dt))dirty=true;
  if(talking!=='lam'&&(NPCS[talking]||SHOPS[talking])&&scene.face(ACTORS[talking]?.model||talking,current,dt))dirty=true;
 }
 let cameraY=1.64,lastWorkFrame=0;
 function frame(now){
  if(!visible)return;
  const dt=Math.min(.045,Math.max(0,(now-previousTime)/1000));
  previousTime=now;
  advance(dt);
  const targetY=1.64;
  if(Math.abs(targetY-cameraY)>.001){cameraY+=(targetY-cameraY)*Math.min(1,dt*2);dirty=true;}
  const workDue=true;
  const working=workDue&&scene.animateWork(current,ACTORS[talking]?.model||talking,now);
  if(workDue)lastWorkFrame=now;
  if(dirty||working)scene.render(chess?{x:15.68,y:1.32,z:-11.02,heading:0,pitch:-.105}:{...current,y:cameraY});
  if(dirty){
   updateTarget();drawHud();
   if(now-lastView>850)persist();
   dirty=false;
  }
  frameId=requestAnimationFrame(frame);
 }
 function reveal(initial){
  tracked=getState().trackedQuest||'coat';
  const saved=getState().streetView;
  const from=getState().location==='restaurant'?RESTAURANT:HOME;
  current={...from,pitch:.02,...(saved&&nav.walkable(saved.x,saved.z)?saved:null)};
  travel=createFp1Travel({
   initial:current,canMove:nav.line,
   onArrive:tag=>{if(tag==='quest'){const q=activeQuest(),person=body(q.npc);if(person)pendingLook={heading:angle(current,pointOf(person)),pitch:-.06};publish(q.npc==='rest'?'到了，点「坐坐，等一个时段」。':'到了，点交谈后选择第一项。');return;}if(tag==='counter'){pendingLook={heading:angle(COUNTER,pointOf(body('fang'))),pitch:-.09};publish('芳姐在柜台后。按 E 跟她交谈。');}else friendLine('到啦。你拿着取件单，我们进去。','按 E 进店到柜前。');},
  });
  counter=createFangCounter({getPosition:()=>current,getWorld:getState,onAction,onOpen:openDialogue});
  const friend=scene.actors.get('friend');
  guideTravel=null;guideHeadStart=0;
  const anchor=worldFlag('shop-check')?{x:LAUNDRY_DOOR.x-.43,z:LAUNDRY_DOOR.z-1.05}:
   saved&&worldFlag('coat-start')?{x:current.x+1.15*Math.cos(current.heading),z:current.z+1.15*Math.sin(current.heading)}:
   {x:12.83,z:8.18};
  let standing=null;
  for(let radius=0;standing===null&&radius<=2;radius+=.12){
   for(let i=0;i<16;i++){
    const p={x:anchor.x+radius*Math.cos(i*Math.PI/8),z:anchor.z+radius*Math.sin(i*Math.PI/8)};
    if(distance(p,current)>.65&&nav.walkable(p.x,p.z)&&nav.path(p,current).length){standing=p;break;}
   }
  }
  standing??=current;
  friend.model.position.set(standing.x,(nav.cell(standing.x,standing.z)-11)/100,standing.z);
  const qing=scene.actors.get('aqing');
  if(saved&&worldFlag('coat-pickup-visit')&&!route()){
   const nearby=atFangCounter(current)?qingCounterPoint():standing;
   qing.model.position.set(nearby.x,(nav.cell(nearby.x,nearby.z)-11)/100,nearby.z);
   qing.path=null;
  }
  friend.model.rotation.y=friend.spec.rotationY;friend.mixer?.setTime(0);
  visible=true;host.hidden=false;dirty=true;styleKey='';
  cameraY=1.64+(nav.cell(current.x,current.z)-11)/100;
  onTransition(getState().location==='home'?'home':'street');
  drawHud();persist(true);
  previousTime=performance.now();frameId=requestAnimationFrame(frame);canvas.focus({preventScroll:true});
  if(initial&&!showedIntroduction){showedIntroduction=true;openDialogue('intro');}
 }
 function load(initial){
  active=true;host.hidden=false;status.textContent='正在打开街区…';
  const run=++restoreId;
  loading??=import('./street-render.js').then(({loadStreet})=>loadStreet(canvas)).then(value=>{
   scene=value;
   nav=createStreetNav(scene.layout,point=>{
    const rack=rackLayout(getState());
    return shopList.some(s=>shopBlocks(s,point))||rackBlocks(rack,point)||route()==='buy'&&!getState().coatOutcome&&distance(point,QING_AT_MARKET)<.36;
   });
   return value;
  }).catch(error=>{loading=null;throw error;});
  void loading.then(()=>{
   if(!active||run!==restoreId)return;
   status.textContent='';reveal(initial);
  }).catch(error=>{
   if(run!==restoreId)return;
   publish('街区载入失败。刷新重试，或检查浏览器是否支持 WebGL。');
   console.error(error);
  });
  return {ok:true};
 }
 function hide({flush=true}={}){
  if(flush&&visible)persist(true);
  restoreId++;cancelAnimationFrame(frameId);dropDialogue();
  visible=false;active=false;keys.clear();host.hidden=true;tray.hidden=true;drag=null;
 }
 addEventListener('keydown',event=>{
  if(!visible||document.querySelector('dialog[open]')||event.altKey||event.metaKey||event.ctrlKey||event.target.closest?.('input,textarea,summary'))return;
  if(event.code==='Escape'){if(talking)dropDialogue();else tray.hidden=true;return;}
  if(event.code==='KeyE'&&!event.repeat&&!talking){event.preventDefault();doInteract();return;}
  if(!talking&&keymap[event.code]){event.preventDefault();keys.add(event.code);}
 });
 addEventListener('keyup',event=>{if(keys.delete(event.code)&&visible)persist(true);});
 function release(){keys.clear();drag=null;if(visible)persist(true);}
 addEventListener('blur',release);document.addEventListener('visibilitychange',()=>{if(document.hidden)release();});
 addEventListener('resize',()=>{dirty=true;});
 canvas.onpointerdown=event=>{
  if(!visible||event.button!==0||drag)return;
  canvas.setPointerCapture(event.pointerId);
  drag={id:event.pointerId,x:event.clientX,y:event.clientY};
 };
 canvas.onpointermove=event=>{
  if(drag?.id!==event.pointerId)return;
  pendingLook=null;current.heading+=(event.clientX-drag.x)*.0042;
  current.pitch=Math.max(-1.05,Math.min(1.14,current.pitch-(event.clientY-drag.y)*.0035));
  drag.x=event.clientX;drag.y=event.clientY;dirty=true;
 };
 for(const ev of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(ev,event=>{if(drag?.id===event.pointerId)drag=null;});
 for(const button of host.querySelectorAll('[data-move]')){
  button.onpointerdown=event=>{if(!visible||talking)return;event.preventDefault();button.setPointerCapture(event.pointerId);keys.add(button.dataset.move);};
  for(const ev of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(ev,()=>keys.delete(button.dataset.move));
 }
 for(const button of host.querySelectorAll('[data-tray]'))button.onclick=()=>openTray(button.dataset.tray);

 $('#street-close').onclick=dropDialogue;
 interact.onclick=doInteract;
 $('#street-dine').onclick=enterRestaurant;
 follow.onclick=()=>{
  if(travel.snapshot().mode==='following'){travel.pause();dirty=true;updateTarget();return;}
  const quest=activeQuest(),point=questPoint(quest,getState());if(!point)return;
  if(quest.npc==='fang'&&!worldFlag('shop-check')){startRoute(COUNTER);return;}
  const steps=nav.path(current,point);
  if(!steps.length){publish('先走回街道，再跟随地图上的红点。');return;}
  guideTravel=null;travel.reset(current);travel.start(steps,'quest');dirty=true;updateTarget();
 };
 $('#street-mic').onclick=()=>{stopSpeech();if(voiceRecording)voice.stopRecording();else void voice.startRecording();};
 $('.street-form').onsubmit=event=>{event.preventDefault();stopSpeech();const input=$('.street-form input');void voice.submitText(input.value);input.value='';};
 $('#street-replay').onclick=()=>play();
 $('#street-slow').onclick=()=>play(.72);
 for(const button of host.querySelectorAll('[data-help]'))button.onclick=()=>{
  $('#street-help').open=false;
  const hint=lastSpeech?.meaning||'靠近之后可以跟街坊打招呼。';
  if(button.dataset.help==='meaning'){setText('#street-voice-state','老朋友：'+hint);return;}
  const phrase=talking==='fang'&&actionList(talking).some(o=>o.id==='shop-check')?'唔該，我想畀張取件單你睇吓。':'唔該，我想問吓。';
  if(button.dataset.help==='assist')setText('#street-voice-state','老朋友：'+phrase+' 你準備好先揀接下來要做嘅事。');
  else setText('#street-voice-state','可以这样说：'+phrase);
 };
 return {
  get active(){return active;},
  get soundLocation(){return atFangCounter(current)?'interior':'outside';},
  start:()=>load(true),
  restore:()=>{
   voice.importHistory(historyValue(getState().history));
   return getState().location==='restaurant'?{ok:true}:load(false);
  },
  showStreet(place){
   const view=place==='restaurant'?(getState().streetView||{...RESTAURANT,pitch:.02}):current;
   onView(view,{final:false});
   onLocation('street',place==='restaurant'?entryPosition('restaurant'):canon);
   load(false);
  },
  hide,flush:()=>{if(visible)persist(true);},
  reset(){hide({flush:false});pendingVoiceFollow=false;voice.reset();showedIntroduction=false;},
  validateHistory:value=>historyProbe.importHistory(historyValue(value)),
 };
}
