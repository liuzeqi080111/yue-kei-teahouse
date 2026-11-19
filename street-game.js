import { atShopCounter, shopBlocks, SHOPS, ACTORS, HOME, COUNTER, LAUNDRY_DOOR, REST, RESTAURANT, createStreetNav, distance, within, rackLayout, rackBlocks } from './street-space.js';
import { atFangCounter, createFangCounter } from './street-fang.js';
import { FP1_TRAVEL_SPEED, createFp1Travel } from './fp1-travel.js';
import { createNeighborhoodVoice } from './neighborhood-voice.js';
import { FP1_CLIPS, STREET_CLIPS, ROLE_CLIPS } from './fp1-clips.js';
import { entryPosition } from './neighborhood-map.js';
import { ITEMS, NPCS, npcContext, optionsFor, qingStatus, rackStatus } from './neighborhood-state.js';

const MEETING='我听日要见工，洗衣店俾错咗件褸我。你哋可唔可以陪我去问吓？';
const WELCOME='走吧，陪你下楼转转。';
const GREETINGS={
 qing:[MEETING,'我明天要面试，洗衣店给错了外套。你们能陪我去问问吗？'],
 fang:['你有冇带张取件单嚟呀？','你带取件单了吗？'],
 ming:['你好呀，想問啲乜？','你好，想问什么？'],
 guest:['做咩事呀？我啱啱先坐低。','怎么了？我刚坐下。'],
 lam:['坐低唞吓先。嗰隻碟，好似見過。','坐下来歇一会儿。那张唱片，我好像见过。'],
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

export function createStreetGame({getState,onAction,onRest,onLocation,onView,onHome,onHistoryChange,getStorageStatus,onTransition,onEnterRestaurant}){
 const host=document.createElement('section');
 host.className='street-game';host.hidden=true;host.setAttribute('aria-label','第一人称街区');
 host.innerHTML=`
  <canvas id="street-view" tabindex="0" aria-label="第一人称街区，拖动转头，WASD 或方向键行走"></canvas>
  <div class="street-top">
   <div class="street-goals"><strong id="street-goal"></strong><small id="street-clock"></small></div>
   <div class="street-menu"><button data-tray="bag">物品</button><button data-tray="notes">记事</button><button data-tray="guide">地图与操作</button><button id="street-home">首页</button></div>
  </div>
  <aside class="street-tray" hidden></aside>
  <p class="street-status" role="status"></p>
  <div class="street-pad" aria-label="移动方向">
   <button data-move="KeyW" aria-label="向前走">▲</button><button data-move="KeyA" aria-label="向左平移">◀</button>
   <button data-move="KeyS" aria-label="向后走">▼</button><button data-move="KeyD" aria-label="向右平移">▶</button>
  </div>
  <div class="street-prompt"><button id="street-follow" hidden></button><button id="street-interact" class="street-primary" hidden></button></div>
  <section class="street-dialogue" aria-label="街坊对话" hidden>
   <strong class="street-speaker"></strong>
   <p class="street-line" aria-live="polite"></p><p class="street-meaning"></p>
   <div class="street-actions"></div>
   <div class="street-tools">
    <button id="street-mic">讲粤语</button>
    <details id="street-write"><summary>打字</summary><form class="street-form"><input maxlength="300" aria-label="想说的话" required><button>发送</button></form></details>
    <details id="street-listen"><summary>听这句</summary><button id="street-replay">重听</button> <button id="street-slow">慢速</button></details>
    <details id="street-help"><summary>问朋友</summary><button data-help="meaning">什么意思？</button> <button data-help="example">怎么说？</button> <button data-help="assist">帮我说。</button></details>
    <button id="street-close">结束交谈</button>
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
 let current={...HOME,pitch:.02},travelFriend=null,pendingLook=null,drag=null,nextTarget=null;
 let lastView=0,showedIntroduction=false,clip=null,lastSpeech=null,styleKey='',dirty=true,restoreId=0,noticeTimer=0,voiceRecording=false;
 let pendingVoiceFollow=false,guideTravel=null,guideHeadStart=0;
 const voiceRates={fang:.88,lam:.84,guest:.94,ling:1.04,lok:1.09,westBread:.93,arcade:.9,marketBack:1.07};
 function publish(message){
  clearTimeout(noticeTimer);status.textContent=message;
  if(message)noticeTimer=setTimeout(()=>{status.textContent='';},5600);
 }
 function setText(selector,text){$(selector).textContent=text;}
 const isAt=(target,radius)=>distance(current,target)<=radius;
 const worldFlag=id=>getState().flags.includes(id);
 const route=()=>getState().flags.find(id=>id.startsWith('coat-route-'))?.slice(11);
 const has=item=>getState().items.includes(item);
 const currentPhase=()=>getState().period;
 const body=id=>scene?.actors.get(ACTORS[id]?.model||id)?.model;
 function actionList(npc){
  if(npc==='intro')return [{id:'go-out',label:'出门'}];
  if(SHOPS[npc])return [{id:'ask-shop',label:SHOPS[npc].question}];
  const legal=optionsFor(getState(),npc);
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
   if(!NPCS[talking])return null;
   const context=npcContext(getState(),talking);
   return {npcId:talking,name:NPCS[talking].name,role:NPCS[talking].role,
    facts:[context.background,...context.knownClues,...context.relations].slice(0,12),
    allowedActions:actionList(talking).filter(o=>o.effect).map(({id,label})=>({id,label}))};
  },
  getRevision:()=>getState().revision,
  applyAction:id=>act(id,true),
  onLine:({text,meaning})=>{
   if(!talking)return;
   const start=pendingVoiceFollow;
   pendingVoiceFollow=false;
   setLine(text,meaning,false);
   if(start)queueMicrotask(beginFollow);
   else queueMicrotask(()=>{if(talking)play();});
   onHistoryChange(voice.exportHistory());
  },
  onStatus:({message})=>setText('#street-voice-state',message),
  onTranscript:text=>setText('#street-voice-state','听到：'+text),
  onRecording:recording=>{
   voiceRecording=recording;
   setText('#street-mic',recording?'停止并发送':'讲粤语');
  },
  autoSpeak:false,
 });
 function stopSpeech(){
  if(clip){clip.pause();clip=null;}
 }
 function playFile(file,rate=1,profile=1){
  stopSpeech();
  clip=new Audio(file);
  clip.preservesPitch=rate<1;
  clip.playbackRate=rate*profile;
  clip.play().catch(error=>{
   if(error.name==='NotAllowedError'&&talking)setText('#street-voice-state','点「听这句」即可播放。');
  });
 }
 function friendLine(text,instruction=''){
  publish('老朋友：'+text+(instruction?' '+instruction:''));
  if(FP1_CLIPS[text])playFile(FP1_CLIPS[text]);
 }
 function play(rate=1){
  stopSpeech();
  if(!lastSpeech)return;
  const file=ROLE_CLIPS[talking+'|'+lastSpeech.text]||STREET_CLIPS[lastSpeech.text]||FP1_CLIPS[lastSpeech.text];
  if(file){
   voice.cancel('');
   playFile(file,rate,voiceRates[talking]||1);
  }else if(NPCS[talking]){
   voice.setLine({npcId:talking,...lastSpeech});
   void (rate<1?voice.replaySlow():voice.replay());
  }
 }
 function setLine(text,meaning,speak=false){
  lastSpeech={text,meaning};
  setText('.street-line',text);setText('.street-meaning',text===meaning?'':meaning);
  if(speak)play();
 }
 function goal(){
  const world=getState();
  const localGoal=()=>{
   if(worldFlag('record-start')&&!world.recordOutcome){
    if(has('contact'))return '回榕荫小坐，告诉林伯旧友的消息';
    return '去夜市唱片摊问阿乐旧唱片的来历';
   }
   if(worldFlag('stall-ming')&&!world.stallOutcome){
    if(worldFlag('stall-ming-agreed'))return '去衣摊把阿明的答复转告玲姐';
    if(world.flags.some(flag=>flag.startsWith('stall-propose-')))return '回粤记门口问阿明愿不愿意按方案调整';
    if(worldFlag('stall-observed'))return '去夜市衣摊，听听玲姐怎么说';
   }
   return null;
  };
  if(!worldFlag('coat-start'))return localGoal()||'在安和楼梯口听阿晴说外套的事';
  if(!worldFlag('shop-check'))return atFangCounter(current)?'与芳姐交谈，亲手递上取件单':'去芳姐洗衣店，从侧门走到柜台';
  if(!route()&&!world.coatOutcome)return '向芳姐选定处理外套的下一步';
  if(has('coat'))return '把找回的原衣交给阿晴';
  if(worldFlag('qing-wore-loan')&&!worldFlag('loan-returned'))return worldFlag('qing-returned')?'取回借衣，还给夜市衣摊的玲姐':'阿晴在面试。可到树下等她回来';
  if(world.coatOutcome){return worldFlag('coat-misunderstanding')?'阿晴解决了面试用衣，洗衣店的误会还没说清':localGoal()||'自由逛街，看看街坊还有什么事';}
  if(worldFlag('qing-paid-coat'))return '在衣摊确认阿晴穿新衣去面试';
  if(has('loanCoat')||has('newCoat'))return route()==='buy'?'把应急外套交给衣摊旁的阿晴':'把应急外套带给安和楼旁的阿晴';
  if(route()==='borrow')return '到夜市衣摊找玲姐借外套';
  if(route()==='buy'&&!worldFlag('guest-found'))return worldFlag('coat-quoted')?'在夜市衣摊听阿晴试穿后决定':'到夜市衣摊陪阿晴问价';
  if(worldFlag('guest-found'))return worldFlag('coat-detail')?'与粤记门旁的周叔核对袖口与姓名':'先向阿晴问清外套袖口特征';
  return '到粤记门口向阿明打听周叔';
 }
 function drawHud(){
  setText('#street-goal',goal());
  const w=getState();
  const direction=POINTS[(Math.round(current.heading/(Math.PI/4))%8+8)%8];
  setText('#street-clock','第 '+w.day+' 天 · '+LABELS[w.period]+' · HK$'+(w.money/100).toFixed(2)+' · 朝'+direction);
  const key=JSON.stringify([w.period,rackStatus(w).placement,rackStatus(w).blocked,qingStatus(w).presence,route()]);
  if(scene&&key!==styleKey){
   styleKey=key;scene.illuminate(w.period===2);scene.placeRack(rackLayout(w));
   const qing=scene.actors.get('aqing');
   qing.model.visible=qingStatus(w).presence!=='interview';
   if(route()==='buy'&&!w.coatOutcome){
    qing.model.position.set(QING_AT_MARKET.x,.111,QING_AT_MARKET.z);
    qing.model.rotation.y=1.18;
   }else qing.model.position.fromArray(qing.spec.position);
   dirty=true;
  }
 }
 function openTray(kind){
  const content={
   bag:getState().items.map(id=>ITEMS[id]).concat(worldFlag('ticket-filed')?['取件单已由芳姐存档']:[]),
   notes:getState().notes,
   guide:['东侧生活巷，自南向北：安和楼 → 洗衣店 → 榕荫小坐。','西侧主街，自南向北：粤记 → 唱片摊 → 衣摊。南北两头都能绕过去。','WASD / ↑↓ 行走 · 拖动画面或用 ← → 转头 · 靠近后按 E 交谈。','随时可以环顾或脱离跟随。到树下才可明确等待，推进时段。'],
  }[kind];
  const same=!tray.hidden&&tray.dataset.kind===kind;
  tray.dataset.kind=kind;tray.hidden=same;tray.replaceChildren();
  if(same)return;
  const list=document.createElement('ul');
  for(const value of (content.length?content:['暂时没有'])){const li=document.createElement('li');li.textContent=value;list.append(li);}
  tray.append(list);
  if(getStorageStatus()?.includes('未保存')){const p=document.createElement('p');p.textContent=getStorageStatus();tray.append(p);}
 }
 function dropDialogue(keepClip=false){
  if(talking==='fang')counter.close();
  talking=null;pendingVoiceFollow=false;lastSpeech=null;pendingLook=null;
  if(keepClip!==true)stopSpeech();voice.cancel('');dialogue.hidden=true;host.dataset.conversation='false';
  if(visible)canvas.focus({preventScroll:true});
  dirty=true;
 }
 function showChoices(){
  const controls=$('.street-actions');
  controls.replaceChildren();
  for(const action of actionList(talking)){
   const button=document.createElement('button');
   button.type='button';button.dataset.streetAction=action.id;button.textContent=action.label;
   if(['go-out','coat-start','shop-check','coat-route-recover','coat-route-borrow','coat-route-buy'].includes(action.id))button.className='street-primary';
   button.onclick=event=>{if(event.detail<=1)act(action.id);};
   controls.append(button);
  }
 }
 function greeting(npc){
  const world=getState();
  if(npc==='intro')return [WELCOME,WELCOME];
  if(npc==='qing'&&worldFlag('coat-start')){
   if(worldFlag('qing-returned'))return ['我見完工返嚟喇。','我面试回来了。'];
   if(route()==='buy')return ['件褸我想試多次，睇吓啱唔啱身。','这件外套我想再试一下，看看合不合身。'];
   return ['多謝你肯幫手。你問到啲咩呀？','谢谢你愿意帮忙。你问到什么了？'];
  }
  if(npc==='fang'&&worldFlag('shop-check')){
   if(worldFlag('coat-misunderstanding'))return ['有事嘅話，你慢慢講。','有事的话，你慢慢说。'];
   return ['張單已經入咗簿。','单据已经登记好了。'];
  }
  if(npc==='lam'&&world.recordOutcome==='gift')return ['隻碟我收好咗。唔該晒你。','唱片我收好了。谢谢你。'];
  if(npc==='lam'&&world.recordOutcome==='contact')return ['我已經留咗口訊畀老朋友。','我已经给老朋友留了口信。'];
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
  for(const selector of ['#street-mic','#street-write','#street-help'])$(selector).hidden=npc==='intro'||(SHOPS[npc]&&selector!=='#street-help');
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
  if(npc==='intro'&&id==='go-out'){
   onLocation('street',canon);dropDialogue();openDialogue('qing');return {ok:true};
  }
  if(npc==='qing'&&id==='defer'&&!worldFlag('coat-start')){
   dropDialogue();friendLine('行，你慢慢看。准备好了我们再出发。','再来找阿晴就行。');persist(true);return {ok:true};
  }
  if(!canTalk(npc,current))return {ok:false,message:'请走近后再开口。'};
  if(!actionList(npc).some(o=>o.id===id))return {ok:false,message:'现在还不能这样做。'};
  if(SHOPS[npc]){setLine(SHOPS[npc].reply,SHOPS[npc].translation,true);return {ok:true};}
  const result=id==='shop-check'&&npc==='fang'?counter.handTicket():onAction(npc,id);
  if(result.ok){
   if(!fromVoice){setText('#street-voice-state','');setLine(result.text,result.meaning,true);}
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
  if(to!==COUNTER){
   const besideDoor={x:to.x-.43,z:to.z-1.05};
   const start=pointOf(scene.actors.get('friend').model);
   let remaining=1.15,lead=current,index=0;
   for(;index<steps.length;index++){
    const length=distance(lead,steps[index]);
    if(length>remaining){
     const t=remaining/length;lead={x:lead.x+t*(steps[index].x-lead.x),z:lead.z+t*(steps[index].z-lead.z)};break;
    }
    remaining-=length;lead=steps[index];
   }
   const approach=nav.path(start,lead);
   if(approach.length){
    guideTravel=createFp1Travel({initial:start,canMove:nav.line});
    guideTravel.start([...approach,...steps.slice(index),...nav.path(to,besideDoor)]);
    guideHeadStart=approach.reduce((sum,p,i)=>sum+distance(i?approach[i-1]:start,p),0)/FP1_TRAVEL_SPEED;
   }
  }
  const first=steps.find(point=>distance(current,point)>.20);
  if(first)pendingLook={heading:angle(current,first),pitch:.02};
  travelFriend=guideTravel?.snapshot().position||null;scene.actors.get('friend').model.visible=true;
  publish(to===COUNTER?'走进侧门，前往芳姐的柜台。':'老朋友：我陪你去芳姐那儿。可以边走边看。');
  dirty=true;
 }
 function beginFollow(){
  dropDialogue(true);
  if(!worldFlag('shop-check'))startRoute(LAUNDRY_DOOR);
 }
 function canTalk(id,position){
  if(SHOPS[id])return atShopCounter(SHOPS[id],position);
  if(!id||!ACTORS[id])return false;
  if(id==='fang')return atFangCounter(position);
  const model=body(id);
  const zone=id==='qing'&&route()==='buy'&&!getState().coatOutcome?QING_MARKET_ZONE:ACTORS[id].zone;
  return model.visible&&within(position,zone)&&distance(position,pointOf(model))<=2.3;
 }
 function updateTarget(){
  if(!scene||talking){
   interact.hidden=true;follow.hidden=true;return;
  }
  const candidates=[...Object.keys(ACTORS),...Object.keys(SHOPS)].filter(id=>canTalk(id,current));
  candidates.sort((a,b)=>distance(current,pointOf(body(a)))-distance(current,pointOf(body(b))));
  nextTarget=candidates[0]||null;
  if(isAt(RESTAURANT,.67))nextTarget='restaurant';
  if(!nextTarget&&isAt(REST,2.05))nextTarget='rest';
  if(!nextTarget&&(within(current,[14.24,17.2,-.60,-.29])||isAt(LAUNDRY_DOOR,1.75)))nextTarget='door';
  const mode=travel.snapshot().mode;
  follow.hidden=!(mode==='following'||(worldFlag('coat-start')&&!worldFlag('shop-check')&&!isAt(LAUNDRY_DOOR,2.2)&&!atFangCounter(current)));
  follow.textContent=mode==='following'?'自己走':'跟上老朋友';
  interact.hidden=!nextTarget||mode==='following'&&nextTarget==='door';
  const labels={restaurant:'进入粤记',rest:'坐坐，等一个时段',door:'进洗衣店，走到芳姐柜前',fang:'跟芳姐交谈'};
  if(nextTarget)interact.textContent=(labels[nextTarget]||'跟'+(SHOPS[nextTarget]||NPCS[nextTarget]).name+'交谈')+' [E]';
 }
 function doInteract(){
  if(!visible||!nextTarget||talking)return;
  if(nextTarget==='door'){if(travel.snapshot().mode!=='following')startRoute(COUNTER);return;}
  if(nextTarget==='rest'){
   const result=onRest();
   publish(result.ok?'你在榕树下歇了一阵。现在是'+LABELS[currentPhase()]+'。':result.message);
   drawHud();return;
  }
  if(nextTarget==='restaurant'){
   persist(true);onLocation('restaurant',entryPosition('restaurant'));hide({flush:false});onEnterRestaurant();return;
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
    dirty=true;
   }
  }
  if(guideTravel&&['following','arrived'].includes(travel.snapshot().mode)){
     const actor=scene.actors.get('friend'),model=actor.model,previous=travelFriend;
     travelFriend=guideTravel.tick(dt).position;
     const stride=distance(previous,travelFriend);
     model.position.set(travelFriend.x,(nav.cell(travelFriend.x,travelFriend.z)-11)/100,travelFriend.z);
     if(stride>.0001){
      const yaw=Math.atan2(travelFriend.x-previous.x,travelFriend.z-previous.z);
      model.rotation.y+=deltaAngle(model.rotation.y,yaw)*Math.min(1,dt*12);
      actor.mixer?.update(stride/1.12);
     }
     if(stride>.0001)dirty=true;
     if(guideTravel.snapshot().mode==='arrived'){guideTravel=null;actor.mixer?.setTime(0);dirty=true;}
  }
  if(pendingLook){
   const diff=deltaAngle(current.heading,pendingLook.heading);
   const pitchDelta=pendingLook.pitch-current.pitch;
   const ease=Math.min(1,dt*5.5);
   current.heading+=diff*ease;current.pitch+=pitchDelta*ease;dirty=true;
   if(Math.abs(diff)+Math.abs(pitchDelta)<.01)pendingLook=null;
  }
  if(talking==='intro'&&scene.face('friend',current,dt))dirty=true;
  if((NPCS[talking]||SHOPS[talking])&&scene.face(ACTORS[talking]?.model||talking,current,dt))dirty=true;
 }
 let cameraY=1.64;
 function frame(now){
  if(!visible)return;
  const dt=Math.min(.045,Math.max(0,(now-previousTime)/1000));
  previousTime=now;
  advance(dt);
  const targetY=1.64+(nav.cell(current.x,current.z)-11)/100;
  if(Math.abs(targetY-cameraY)>.001){cameraY+=(targetY-cameraY)*Math.min(1,dt*13);dirty=true;}
  if(dirty){
   updateTarget();drawHud();scene.render({...current,y:cameraY});
   if(now-lastView>850)persist();
   dirty=false;
  }
  frameId=requestAnimationFrame(frame);
 }
 function reveal(initial){
  const saved=getState().streetView;
  const from=getState().location==='restaurant'?RESTAURANT:HOME;
  current={...from,pitch:.02,...(saved&&nav.walkable(saved.x,saved.z)?saved:null)};
  travel=createFp1Travel({
   initial:current,canMove:nav.line,
   onArrive:tag=>{if(tag==='counter'){pendingLook={heading:angle(COUNTER,pointOf(body('fang'))),pitch:-.09};publish('芳姐在柜台后。按 E 跟她交谈。');}else friendLine('到啦。你拿着取件单，我们进去。','按 E 进店到柜前。');},
  });
  counter=createFangCounter({getPosition:()=>current,getWorld:getState,onAction,onOpen:openDialogue});
  const friend=scene.actors.get('friend');
  guideTravel=null;guideHeadStart=0;
  const anchor=saved&&worldFlag('coat-start')?current:{x:friend.spec.position[0],z:friend.spec.position[2]};
  let standing=null;
  for(let radius=0;standing===null&&radius<=2;radius+=.12){
   for(let i=0;i<16;i++){
    const p={x:anchor.x+radius*Math.cos(i*Math.PI/8),z:anchor.z+radius*Math.sin(i*Math.PI/8)};
    if(distance(p,current)>.65&&nav.walkable(p.x,p.z)){standing=p;break;}
   }
  }
  standing??=current;
  friend.model.position.set(standing.x,(nav.cell(standing.x,standing.z)-11)/100,standing.z);
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
  if(!visible||event.altKey||event.metaKey||event.ctrlKey||event.target.closest?.('input,textarea,summary'))return;
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
 $('#street-home').onclick=()=>{if(visible)persist(true);onHome();};
 $('#street-close').onclick=dropDialogue;
 interact.onclick=doInteract;
 follow.onclick=()=>{if(travel.snapshot().mode==='following'){travel.pause();dirty=true;}else startRoute(LAUNDRY_DOOR);};
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
