import {
 SIZE,PLACES,PEOPLE,STALL_OBSTACLE,INTERACT_DISTANCE,
 entryPosition,nearestPlace,findPath,moveSafely,walkable
} from './neighborhood-map.js';
import {NPCS,ITEMS,optionsFor,qingStatus,rackStatus,npcContext} from './neighborhood-state.js';
import {createNeighborhoodVoice} from './neighborhood-voice.js';

const MOVEMENT_KEYS=new Set(['w','a','s','d','arrowup','arrowleft','arrowdown','arrowright']);
const PERIOD_NAMES=['日间','黄昏','夜晚'];
const PERIOD_ASSETS=['ow-world-day.png','ow-world.png','ow-world-night.png'];
const LOCATIONS=new Set(['street','home','laundry','restaurant']);
const assetUrl=name=>new URL(`./assets/${name}`,import.meta.url).href;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const editable=target=>target?.closest?.('input, textarea, select, [contenteditable="true"]');

const NPC_LINES={
 qing:['我住喺附近，有咩街坊消息，大家會互相提點。','我住在附近，街坊有消息会互相提醒。'],
 fang:['攞衫記得帶單，有咩問題大家核對清楚。','取衣服记得带单，有什么问题大家一起核对清楚。'],
 lok:['慢慢睇，唔買都可以傾吓。','慢慢看，不买也可以聊聊。'],
 ling:['夜市人多，我行出啲都會留意有冇阻住人。','夜市人多，我也会留意有没有挡到别人。'],
 buyer:['我約咗人喺度攞嘢，所以喺附近行吓。','我约了人在这里取东西，所以在附近走走。'],
 lam:['呢度啱晒坐低，睇住條街慢慢入夜。','这里适合坐下，看着街道慢慢入夜。'],
 guest:['飲完茶出嚟坐一陣，都幾舒服。','喝完茶出来坐一会儿，挺舒服。'],
 ming:['門口要留返條路，捧住熱嘢先行得穩。','门口要留出过道，端着热东西才走得稳。']
};

function loadImage(url){
 return new Promise(resolve=>{
  const image=new Image();
  image.onload=()=>resolve(image);image.onerror=()=>resolve(null);image.src=url;
 });
}

function paragraph(className,text){
 const node=document.createElement('p');if(className)node.className=className;node.textContent=text;return node;
}

// The supplied NPC sheet has a black matte. Remove only dark pixels connected
// to the sheet edge, preserving dark hair, shoes and outlines inside each sprite.
function removeConnectedBlack(image){
 const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
 const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0);
 try{
  const data=context.getImageData(0,0,canvas.width,canvas.height),pixels=data.data;
  const total=canvas.width*canvas.height,seen=new Uint8Array(total),queue=new Int32Array(total);
  let head=0,tail=0;
  const dark=index=>{const offset=index*4;return pixels[offset+3]>0&&Math.max(pixels[offset],pixels[offset+1],pixels[offset+2])<=48;};
  const add=index=>{if(index>=0&&index<total&&!seen[index]&&dark(index)){seen[index]=1;queue[tail++]=index;}};
  for(let x=0;x<canvas.width;x++){add(x);add((canvas.height-1)*canvas.width+x);}
  for(let y=0;y<canvas.height;y++){add(y*canvas.width);add(y*canvas.width+canvas.width-1);}
  while(head<tail){
   const index=queue[head++],x=index%canvas.width;
   if(x>0)add(index-1);if(x<canvas.width-1)add(index+1);
   add(index-canvas.width);add(index+canvas.width);
  }
  for(let index=0;index<total;index++)if(seen[index])pixels[index*4+3]=0;
  context.putImageData(data,0,0);
 }catch{}
 return canvas;
}

function spriteFrames(image,columns,rows){
 if(!image)return [];
 const source=removeConnectedBlack(image),width=image.width/columns,height=image.height/rows,frames=[];
 for(let row=0;row<rows;row++)for(let column=0;column<columns;column++){
  const cell=document.createElement('canvas');cell.width=Math.ceil(width);cell.height=Math.ceil(height);
  const context=cell.getContext('2d',{willReadFrequently:true});
  context.drawImage(source,column*width,row*height,width,height,0,0,cell.width,cell.height);
  let left=cell.width,top=cell.height,right=-1,bottom=-1;
  try{
   const pixels=context.getImageData(0,0,cell.width,cell.height).data;
   for(let y=0;y<cell.height;y++)for(let x=0;x<cell.width;x++){
    if(pixels[(y*cell.width+x)*4+3]<16)continue;
    left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);
   }
  }catch{}
  if(right<0){frames.push(cell);continue;}
  const frame=document.createElement('canvas');frame.width=right-left+1;frame.height=bottom-top+1;
  frame.getContext('2d').drawImage(cell,left,top,frame.width,frame.height,0,0,frame.width,frame.height);
  frames.push(frame);
 }
 return frames;
}

/**
 * The app owns the only world object. This module keeps an ephemeral canvas
 * position while moving, but never creates, clones, saves or mutates a world.
 *
 * Required callbacks:
 * - getState(): return the app's current world state synchronously.
 * - onAction(npcId, optionId): synchronously revalidate/commit through the
 *   state rules and return {ok, text?, meaning?, message?}.
 * - onRest(): synchronously apply/commit exactly one restEvent and return
 *   {ok, text?, meaning?, message?}.
 * - onMove(position, {final}): commit the latest valid street position; the
 *   app throttles ordinary saves and flushes when final is true.
 * - onLocation(location, position): synchronously commit/save a location change.
 * - onHome(): return to the title after this module has flushed and hidden.
 *
 * Optional callbacks preserve the existing app integration and future audio:
 * onEnterRestaurant(), onTransition(destination), onPersonChange(npcId|null),
 * getStorageStatus(), and onHistoryChange(snapshot). getStorageStatus is display-only.
 * onHistoryChange receives client.exportHistory() only after accepted exchanges.
 */
export function createNeighborhood({
 root,getState,onAction,onRest,onMove,onLocation,onHome,
 onEnterRestaurant=()=>{},onTransition=()=>{},onPersonChange=()=>{},getStorageStatus=()=>'',onHistoryChange=()=>{}
}={}){
 if(!root)throw new TypeError('createNeighborhood 需要 root');
 for(const [name,callback] of Object.entries({getState,onAction,onRest,onMove,onLocation,onHome})){
  if(typeof callback!=='function')throw new TypeError(`createNeighborhood 需要 ${name} 回调，不能以假状态代替`);
 }
 const canvas=root.querySelector('#world-canvas'),context=canvas.getContext('2d');
 const room=root.querySelector('#world-room'),roomPerson=root.querySelector('#world-room-person');
 const roomTalk=root.querySelector('#world-room-talk'),restButton=root.querySelector('#world-rest');
 const interactButton=root.querySelector('#world-interact'),hint=root.querySelector('#world-hint');
 const placeName=root.querySelector('#world-place-name'),placeNote=root.querySelector('#world-place-note');
 const stick=root.querySelector('#world-stick'),sheet=root.querySelector('#world-sheet');
 const sheetTitle=root.querySelector('#world-sheet-title'),sheetBody=root.querySelector('#world-sheet-body');
 const status=root.querySelector('#world-status');
 const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');

 let active=false,mode='street',destroyed=false,currentPlace=null,interaction=null;
 let position=entryPosition('home'),path=[],keys=new Set(),direction=0,moving=false;
 let frame=0,lastTime=0,camera={x:0,y:0},view={width:1,height:1,dpr:1,zoom:1};
 let stickPointer=null,stickVector={x:0,y:0};
 let worldImages=[null,null,null],worldImage=null,playerFrames=[],npcFrames=[],qingCoatFrames=[];
 let assetsSettled=false,assetStatus='正在载入街区素材…',transientStatus='',lastSceneProtocol='';
 let voiceStatusNode=null,voiceInput=null,voiceStopButton=null,voicePerson=null,voiceLine=null,voiceMessage='';

 function state(){return getState();}
 const voice=createNeighborhoodVoice({
  getContext:voiceContext,
  getRevision:()=>state().revision,
  applyAction:executeVoiceAction,
  onLine:line=>{
   const personId=voicePerson;
   if(!personId||sheet.hidden)return;
   onHistoryChange(voice.exportHistory());
   if(personId!==voicePerson||sheet.hidden)return;
   // onLine precedes completeAttempt: same-person redraw must not cancel this attempt.
   renderPerson(personId,{text:line.text,meaning:line.meaning},{fromVoice:true});
  },
  onStatus:info=>{
   voiceMessage=info?.message||'';
   const away=voicePerson==='qing'&&qingStatus(state()).presence==='interview';
   const text=away?'阿晴已经去面试，不能继续对话。':voiceMessage;
   if(voiceStatusNode)voiceStatusNode.textContent=text;
   if(text)setStatus(text);
   if(voiceStopButton)voiceStopButton.disabled=!info?.recording;
  },
  onTranscript:text=>{if(voiceInput)voiceInput.value=text;},
  onRecording:recording=>{if(voiceStopButton)voiceStopButton.disabled=!recording;}
 });
 // Validate with the tested strict importer without touching the live conversation.
 const historyProbe=createNeighborhoodVoice({
  getContext:()=>null,getRevision:()=>0,applyAction:()=>({ok:false}),
  recorder:{start:()=>false,cancel:()=>{}},fetchImpl:()=>Promise.reject(new Error('history probe')),
  eventTarget:null,autoSpeak:false
 });
 function renderStatus(){
  const text=getStorageStatus()||transientStatus||assetStatus;
  if(status.textContent!==text)status.textContent=text;
 }
 function setStatus(text){transientStatus=text;renderStatus();}
 function rackGeometry(s){
  const rack=rackStatus(s),base=STALL_OBSTACLE;
  if(rack.placement==='compact')return {x:base.x+base.w/4,y:base.y,w:base.w/2,h:base.h};
  if(rack.placement==='move'||(rack.placement==='hours'&&!rack.blocked))return {x:base.x-100,y:base.y,w:base.w,h:base.h};
  return {x:base.x,y:base.y,w:base.w,h:base.h};
 }
 function availablePeople(s=state()){
  return PEOPLE.filter(person=>person.id!=='qing'||qingStatus(s).presence!=='interview');
 }
 function updateAssetStatus(){
  if(!assetsSettled){assetStatus='正在载入街区素材…';return;}
  const s=state(),qing=qingStatus(s);
  if(!worldImages[s.period]&&s.period!==1)assetStatus='当前时段素材未能载入，已回退原街区图。';
  else if(!worldImages[1])assetStatus='原街区素材未能载入，仍可使用道路与出入口。';
  else if(qing.wearing&&qingCoatFrames.length!==3)assetStatus='外套素材未能载入，已回退原人物图。';
  else if(!playerFrames.length||!npcFrames.length)assetStatus='部分人物素材未能载入，仍可使用道路与出入口。';
  else assetStatus='';
 }
 function updateRoom(){
  if(mode!=='room'||!currentPlace)return;
  const home=currentPlace.id==='home',away=home&&qingStatus(state()).presence==='interview';
  roomTalk.hidden=away;roomTalk.textContent=home?'和阿晴倾偈':'和芳姐倾偈';
  restButton.hidden=!home;
  root.querySelector('#world-room-line').textContent=away
   ?'阿晴已经去面试，暂时不在住处。可以休息一个时段，等她回来。'
   :home?'窗外就是刚才走过的街。可以和阿晴倾偈，或休息一个时段。'
   :'洗衣店灯还亮着，芳姐在柜台后整理衣物。可以和她核对话衣记录。';
  drawRoomPerson(away?null:home?'qing':'fang');
 }
 function refresh(){
  const s=state(),qing=qingStatus(s),rack=rackStatus(s),protocol=`${s.period}:${s.stallOutcome||''}:${rack.placement}:${rack.blocked}`;
  if(lastSceneProtocol&&lastSceneProtocol!==protocol)path=[];
  lastSceneProtocol=protocol;
  worldImage=worldImages[s.period]||worldImages[1]||null;
  placeNote.textContent=`${PERIOD_NAMES[s.period]} · 第${s.day}天 · HK$${(s.money/100).toFixed(2)} · ${mode==='room'?'第一人称室内':'开放街区'}`;
  placeNote.dataset.worldDay=String(s.day);placeNote.dataset.worldPeriod=String(s.period);placeNote.dataset.worldMoney=String(s.money);
  root.dataset.worldDay=String(s.day);root.dataset.worldPeriod=String(s.period);root.dataset.worldMoney=String(s.money);
  root.dataset.worldLocation=s.location;root.dataset.worldQingPresence=qing.presence;
  root.dataset.worldRackPlacement=rack.placement;root.dataset.worldRackBlocked=String(rack.blocked);
  updateAssetStatus();updateRoom();renderStatus();
  if(active&&mode==='street'){updateInteraction();draw(performance.now());}
 }
 function resize(){
  const width=Math.max(1,root.clientWidth||innerWidth),height=Math.max(1,root.clientHeight||innerHeight);
  const dpr=Math.min(2,devicePixelRatio||1),zoom=clamp(width/1050,.78,1.12);
  view={width,height,dpr,zoom};canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
  context.setTransform(dpr,0,0,dpr,0,0);
 }
 const observer=new ResizeObserver(()=>{if(active){resize();draw(performance.now());}});observer.observe(root);

 function clearMovement(){
  keys.clear();path=[];stickVector={x:0,y:0};stickPointer=null;moving=false;
  stick.style.setProperty('--stick-x','0px');stick.style.setProperty('--stick-y','0px');
 }
 function cameraTarget(){
  const width=view.width/view.zoom,height=view.height/view.zoom;
  return {
   x:width>=SIZE?(SIZE-width)/2:clamp(position.x-width/2,0,SIZE-width),
   y:height>=SIZE?(SIZE-height)/2:clamp(position.y-height*.58,0,SIZE-height)
  };
 }
 function snapCamera(){camera=cameraTarget();}
 function flush(){
  if(active&&mode==='street')onMove({...position},{final:true});
 }
 function validateRestore(){
  const s=state();
  if(!s||!LOCATIONS.has(s.location))return {ok:false,error:'无法继续：存档地点无效。原进度未被修改。'};
  if(!s.position||!walkable(s.position.x,s.position.y,rackStatus(s).blocked)){
   return {ok:false,error:'无法继续：存档位置不在实际可通行道路上。原进度未被修改。'};
  }
  if(!validateHistory(s.history).ok)return {ok:false,error:'无法继续：对话历史无效。原进度未被修改。'};
  return {ok:true};
 }
 function showStreetAt(placeId,point,{restore=false}={}){
  const entrance=entryPosition(placeId);
  if(!entrance)return {ok:false,error:'无法前往未知地点。'};
  const next=restore?point:entrance;
  if(!next||!walkable(next.x,next.y,rackStatus(state()).blocked))return {ok:false,error:'无法继续：目标位置不在可通行道路上。'};
  cancelVoice();onTransition('street');clearMovement();active=true;mode='street';
  position={x:next.x,y:next.y};currentPlace=nearestPlace(position)||PLACES.find(place=>place.id===placeId)||null;
  interaction=null;root.hidden=false;root.dataset.mode='street';document.body.classList.add('world-open');
  room.hidden=true;canvas.hidden=false;sheet.hidden=true;interactButton.hidden=true;
  placeName.textContent=currentPlace?`${currentPlace.name}门口`:'开放街区';
  if(!restore)onLocation('street',{...position});
  resize();snapCamera();refresh();lastTime=0;cancelAnimationFrame(frame);frame=requestAnimationFrame(tick);
  canvas.focus({preventScroll:true});
  return {ok:true,destination:'street'};
 }
 function showStreet(placeId='home'){return showStreetAt(placeId,entryPosition(placeId));}
 function enterRoom(place,{restore=false}={}){
  if(!place||place.kind!=='room')return {ok:false,error:'无法进入未知室内。'};
  const next=restore?state().position:entryPosition(place.id);
  if(!next||!walkable(next.x,next.y,rackStatus(state()).blocked))return {ok:false,error:'无法继续：室内入口位置无效。'};
  cancelVoice();onTransition(place.id);clearMovement();cancelAnimationFrame(frame);frame=0;active=true;mode='room';currentPlace=place;
  position={x:next.x,y:next.y};root.hidden=false;root.dataset.mode='room';document.body.classList.add('world-open');canvas.hidden=true;room.hidden=false;room.dataset.room=place.id;
  sheet.hidden=true;interactButton.hidden=true;placeName.textContent=place.name;
  if(!restore)onLocation(place.id,{...position});
  refresh();(roomTalk.hidden?root.querySelector('#world-leave-room'):roomTalk).focus({preventScroll:true});
  return {ok:true,destination:place.id};
 }
 function restore(){
  const valid=validateRestore();if(!valid.ok)return valid;
  const s=state(),history=restoreVoiceHistory(s.history);if(!history.ok)return history;
  if(s.location==='restaurant')return {ok:true,destination:'restaurant'};
  if(s.location==='home'||s.location==='laundry')return enterRoom(PLACES.find(place=>place.id===s.location),{restore:true});
  return showStreetAt(nearestPlace(s.position)?.id||'home',s.position,{restore:true});
 }
 function hide({flush:shouldFlush=true}={}){
  cancelVoice();if(shouldFlush)flush();clearMovement();active=false;mode='hidden';cancelAnimationFrame(frame);frame=0;root.hidden=true;sheet.hidden=true;
  onPersonChange(null);document.body.classList.remove('world-open');
 }
 function returnHome(){flush();hide({flush:false});onHome();}
 function openSheet(title,staticMarkup='',preserveVoice=false){
  clearMovement();interaction=null;interactButton.hidden=true;
  if(!preserveVoice){cancelVoice();onPersonChange(null);}
  sheetTitle.textContent=title;sheetBody.innerHTML=staticMarkup;sheet.hidden=false;
  if(!preserveVoice)root.querySelector('#world-sheet-close').focus({preventScroll:true});
 }
 function closeSheet(){
  if(sheet.hidden)return;cancelVoice();sheet.hidden=true;onPersonChange(null);updateInteraction();
  if(mode==='street')canvas.focus({preventScroll:true});
  else if(mode==='room')(roomTalk.hidden?(restButton.hidden?root.querySelector('#world-leave-room'):restButton):roomTalk).focus({preventScroll:true});
 }
 function appendResponse(text,meaning,cantonese=true){
  if(text)sheetBody.append(paragraph(cantonese?'world-cantonese':'world-meaning',text));
  if(meaning)sheetBody.append(paragraph('world-meaning',meaning));
 }
 function emptyHistory(snapshot){
  return Boolean(snapshot&&typeof snapshot==='object'&&!Array.isArray(snapshot)&&Reflect.ownKeys(snapshot).length===0);
 }
 function validateHistory(snapshot){
  if(emptyHistory(snapshot))return {ok:true};
  return historyProbe.importHistory(snapshot);
 }
 function restoreVoiceHistory(snapshot){
  const result=voice.importHistory(emptyHistory(snapshot)?{version:1,npcs:[]}:snapshot);
  return result.ok?result:{ok:false,error:'无法继续：对话历史无效。原进度未被修改。'};
 }
 function cancelVoice(message='已取消当前街坊对话。',clearPerson=true){
  voice.cancel(message);
  if(clearPerson){
   voicePerson=null;voiceLine=null;voiceStatusNode=null;voiceInput=null;voiceStopButton=null;
  }
 }
 function resetVoice(){
  voice.reset();voicePerson=null;voiceLine=null;voiceMessage='';
  voiceStatusNode=null;voiceInput=null;voiceStopButton=null;
 }
 function voiceContext(){
  const personId=voicePerson;
  if(!personId||sheet.hidden||!Object.prototype.hasOwnProperty.call(NPCS,personId))return null;
  if(personId==='qing'&&qingStatus(state()).presence==='interview')return null;
  const context=npcContext(state(),personId);if(!context)return null;
  const facts=[];
  for(const raw of [context.background,...context.knownClues,...context.relations]){
   const text=String(raw).trim();if(!text)continue;
   for(let offset=0;offset<text.length;offset+=160){
    const part=text.slice(offset,offset+160),last=facts.length-1;
    if(last>=0&&facts[last].length+part.length+1<=160)facts[last]+=`；${part}`;
    else facts.push(part);
   }
  }
  if(facts.length>12)throw Error('当前街坊资料过多，暂时无法使用语音。');
  return {
   npcId:personId,name:NPCS[personId].name,role:NPCS[personId].role,facts,
   allowedActions:context.legalActions.map(action=>({id:action.id,label:action.label}))
  };
 }
 function executeVoiceAction(actionId){
  const personId=voicePerson;
  if(!personId||sheet.hidden)return {ok:false,message:'当前没有可交谈的街坊。'};
  if(personId==='qing'&&qingStatus(state()).presence==='interview')return {ok:false,message:'阿晴已经去面试了。'};
  const result=onAction(personId,actionId);refresh();return result;
 }
 function voiceHelp(personId,prompt){
  const current=voiceLine?.npcId===personId?voiceLine.text:NPC_LINES[personId][0];
  const legal=optionsFor(state(),personId).map(option=>option.label).join('、');
  const request=`${prompt}只解释或示范，不要替我执行。当前句：“${current}”${legal?`；合法选项：${legal}`:''}`;
  return voice.help(request.slice(0,300));
 }
 function renderPerson(personId,response=null,{fromVoice=false,autoplay=false}={}){
  const s=state();
  if(personId==='qing'&&qingStatus(s).presence==='interview'&&!response){setStatus('阿晴已经去面试了，等她回来再说。');return;}
  const line=NPC_LINES[personId];if(!line||!NPCS[personId]){setStatus('这位街坊暂时无法交谈。');return;}
  const continuing=voicePerson===personId&&!sheet.hidden;
  openSheet(NPCS[personId].name,'',continuing);voicePerson=personId;
  if(!continuing){voiceMessage='';onPersonChange(personId);}
  const text=response?.text||line[0],meaning=response?.meaning??line[1];
  const spoken=!response||response.cantonese!==false;
  voiceLine=spoken?{npcId:personId,text,meaning:meaning||''}:null;
  const replayable=spoken&&voice.setLine({npcId:personId,text,meaning:meaning||''});
  appendResponse(text,meaning,spoken);
  const choices=document.createElement('div');choices.className='world-choices';
  const options=optionsFor(state(),personId);
  for(const option of options){
   const button=document.createElement('button');button.type='button';button.textContent=option.label;button.dataset.worldAction=option.id;
   button.addEventListener('click',()=>{
    cancelVoice('剧情动作已取消旧的街坊对话。',false);voiceMessage='';
    const result=onAction(personId,option.id);
    refresh();
    if(result?.ok)renderPerson(personId,{text:result.text||option.text,meaning:result.meaning??option.meaning},{autoplay:true});
    else renderPerson(personId,{text:result?.message||'情况已经变化，请重新确认。',meaning:'',cantonese:false});
   });
   choices.append(button);
  }
  if(!options.length)choices.append(paragraph('world-meaning',personId==='qing'&&qingStatus(state()).presence==='interview'?'阿晴已经去面试了；请等待或休息一个时段。':'现在没有新的合法行动，可以稍后再来。'));
  sheetBody.append(choices);

  const compose=document.createElement('div');compose.className='world-choices world-compose';
  const input=document.createElement('input');input.type='text';input.maxLength=300;input.setAttribute('aria-label','想对街坊说的话');
  const unavailable=personId==='qing'&&qingStatus(state()).presence==='interview';
  input.disabled=unavailable;voiceInput=input;compose.append(input);
  const addVoiceButton=(label,handler)=>{
   const button=document.createElement('button');button.type='button';button.textContent=label;button.disabled=unavailable;
   button.addEventListener('click',()=>{void handler();});compose.append(button);return button;
  };
  addVoiceButton('发送',()=>voice.submitText(input.value));
  addVoiceButton('录音',()=>voice.startRecording());
  voiceStopButton=addVoiceButton('停止录音',()=>voice.stopRecording());
  voiceStopButton.disabled=unavailable||!voice.recording;
  const replayButton=addVoiceButton('重听',()=>voice.replay());replayButton.disabled=unavailable||!replayable;
  const slowButton=addVoiceButton('慢速',()=>voice.replaySlow());slowButton.disabled=unavailable||!replayable;
  addVoiceButton('这句什么意思',()=>voiceHelp(personId,'请解释这句粤语的意思。'));
  addVoiceButton('教我怎么答',()=>voiceHelp(personId,'请教我怎么用粤语回应。'));
  voiceStatusNode=paragraph('world-status',unavailable?'阿晴已经去面试，不能继续对话。':voiceMessage||'可输入文字；只有点击录音后才会请求麦克风。');
  voiceStatusNode.setAttribute('role','status');voiceStatusNode.setAttribute('aria-live','polite');voiceStatusNode.setAttribute('aria-atomic','true');
  compose.append(voiceStatusNode);sheetBody.append(compose);
  // Button lines may speak once; client onLine already owns its subsequent autoSpeak.
  if(replayable&&autoplay&&!fromVoice)void voice.replay();
 }
 function openPerson(person){renderPerson(person.id);}
 function openInventory(){
  const s=state();openSheet('随身物品');const list=document.createElement('div');list.className='world-inventory';
  if(!s.items.length)list.append(paragraph('world-meaning','暂时没有随身物品。'));
  for(const id of s.items){const row=paragraph('world-inventory-item',ITEMS[id]||id);row.dataset.worldItem=id;list.append(row);}
  sheetBody.append(list);
 }
 function openNotes(){
  const s=state();openSheet('记事本');const list=document.createElement('div');list.className='world-notes';
  if(!s.notes.length)list.append(paragraph('world-meaning','还没有记下街坊线索。'));
  for(const [index,note] of s.notes.entries()){const row=paragraph('world-note',note);row.dataset.worldNote=String(index);list.append(row);}
  sheetBody.append(list);
 }
 function performRest(origin){
  cancelVoice();const result=onRest();refresh();
  openSheet(origin==='home'?'休息':'等待');
  if(!result?.ok){appendResponse(result?.message||'现在无法推进时间。','',false);return;}
  const returned=qingStatus(state()).presence==='returned';
  appendResponse(result?.text||(origin==='home'?'休息了一個時段。':'坐低等了一個時段。'),result?.meaning||`${returned?'阿晴已经回到街坊中。':''}现在是${PERIOD_NAMES[state().period]}，第${state().day}天。`);
 }
 function openOutdoor(place){
  const market=place.id==='market';
  openSheet(place.name,market
   ?'<p class="world-cantonese" lang="yue">夜市啱啱開始熱鬧。</p><p class="world-meaning">夜市刚开始热闹起来。摊位沿左侧主街排开；你仍在户外，可以继续沿环路走去其他地点。</p>'
   :'<p class="world-cantonese" lang="yue">坐低唞一陣，睇吓街坊嚟往。</p><p class="world-meaning">坐下歇一会儿，看看街坊来往。普通交谈不会推进时间。</p>');
  if(place.id==='rest'){
   const choices=document.createElement('div');choices.className='world-choices';
   const wait=document.createElement('button');wait.type='button';wait.textContent='等待，推进一个时段';wait.addEventListener('click',()=>performRest('rest'));
   choices.append(wait);sheetBody.append(choices);
  }
 }
 function openMap(){
  openSheet('街区地图');
  const image=document.createElement('img');image.className='world-map-image';image.alt='当前时段的街区环路地图';
  const selected=PERIOD_ASSETS[state().period];let fallbackUsed=false;image.src=assetUrl(selected);
  image.addEventListener('error',()=>{if(!fallbackUsed){fallbackUsed=true;image.src=assetUrl('ow-world.png');setStatus('当前时段地图未能载入，已回退原街区图。');}else setStatus('地图素材未能载入，仍可按道路移动。');});
  sheetBody.append(image,paragraph('world-meaning','左右主街由上下横街相连，右上支路通往休憩处。先合上地图，再点击街道可自动寻路。'));
 }
 function activateInteraction(){
  if(!active||mode!=='street'||!sheet.hidden||!interaction)return;
  if(interaction.type==='person'){
   const person=availablePeople().find(entry=>entry.id===interaction.id);if(person)openPerson(person);return;
  }
  const place=PLACES.find(entry=>entry.id===interaction.id);if(!place)return;
  if(place.kind==='restaurant'){
   onLocation('restaurant',{...position});onTransition('restaurant');hide();onEnterRestaurant();
  }else if(place.kind==='room')enterRoom(place);else openOutdoor(place);
 }

 function personPosition(person,now){
  if(reducedMotion.matches)return {x:person.x,y:person.y};
  if(person.id==='buyer')return {x:person.x,y:person.y+Math.sin(now/1700)*34};
  return {x:person.x,y:person.y};
 }
 function updateInteraction(now=performance.now()){
  if(mode!=='street'||!sheet.hidden){interaction=null;interactButton.hidden=true;return;}
  const place=nearestPlace(position);
  let person=null,personDistance=74;
  for(const candidate of availablePeople()){
   const point=personPosition(candidate,now),distance=Math.hypot(point.x-position.x,point.y-position.y);
   if(distance<personDistance){person=candidate;personDistance=distance;}
  }
  interaction=place?{type:'place',id:place.id}:person?{type:'person',id:person.id}:null;
  interactButton.hidden=!interaction;
  if(interaction){
   interactButton.textContent=interaction.type==='person'?`和${NPCS[interaction.id].name}说话`:PLACES.find(place=>place.id===interaction.id).action;
   hint.textContent='按 E 或点击按钮互动；普通交谈不会推进时间。';
  }else hint.textContent='WASD / 方向键移动 · 点击街道寻路 · 靠近门口或街坊后互动';
 }
 interactButton.addEventListener('click',activateInteraction);
 root.querySelector('#world-leave-room').addEventListener('click',()=>showStreet(currentPlace?.id||'home'));
 roomTalk.addEventListener('click',()=>{if(currentPlace)renderPerson(currentPlace.id==='home'?'qing':'fang');});
 restButton.addEventListener('click',()=>{if(currentPlace?.id==='home')performRest('home');});
 root.querySelector('#world-sheet-close').addEventListener('click',closeSheet);
 root.querySelector('#world-inventory-button').addEventListener('click',openInventory);
 root.querySelector('#world-notes-button').addEventListener('click',openNotes);
 root.querySelector('#world-home-button').addEventListener('click',returnHome);
 root.querySelector('#world-map-button').addEventListener('click',openMap);
 root.querySelector('#world-help-button').addEventListener('click',()=>openSheet('街区操作','<p>WASD 或方向键：移动。点击街道：自动寻路。E：与附近街坊交谈或进入地点。</p><p>触屏可使用左下摇杆。输入框、文字区或下拉框聚焦时，移动按键不会驱动角色。</p><p>普通交谈不会推进时间；住处休息和休憩处等待会明确推进一个时段。茶餐厅会保留本次餐局。</p>'));

 function keyDown(event){
  if(!active||destroyed)return;
  if(event.key==='Escape'&&!sheet.hidden){event.preventDefault();closeSheet();return;}
  if(editable(event.target)||document.querySelector('dialog[open]')){keys.clear();return;}
  if(mode!=='street'||!sheet.hidden)return;
  const key=event.key.toLowerCase();
  if(MOVEMENT_KEYS.has(key)){event.preventDefault();path=[];keys.add(key);return;}
  if(key==='e'&&!event.repeat){event.preventDefault();activateInteraction();}
 }
 function keyUp(event){keys.delete(event.key.toLowerCase());}
 function focusIn(event){if(editable(event.target))clearMovement();}
 function blur(){clearMovement();}
 function visibilityChange(){if(document.hidden){flush();clearMovement();}}
 window.addEventListener('keydown',keyDown);window.addEventListener('keyup',keyUp);
 window.addEventListener('blur',blur);document.addEventListener('focusin',focusIn);
 document.addEventListener('visibilitychange',visibilityChange);

 function updateStick(event){
  const rect=stick.getBoundingClientRect(),radius=rect.width*.34;
  let x=event.clientX-(rect.left+rect.width/2),y=event.clientY-(rect.top+rect.height/2);
  const length=Math.hypot(x,y);if(length>radius){x=x/length*radius;y=y/length*radius;}
  stickVector={x:x/radius,y:y/radius};stick.style.setProperty('--stick-x',`${x}px`);stick.style.setProperty('--stick-y',`${y}px`);
 }
 stick.addEventListener('pointerdown',event=>{
  if(!active||mode!=='street')return;event.preventDefault();stickPointer=event.pointerId;stick.setPointerCapture(event.pointerId);path=[];updateStick(event);
 });
 stick.addEventListener('pointermove',event=>{if(event.pointerId===stickPointer)updateStick(event);});
 const releaseStick=event=>{if(event.pointerId!==stickPointer)return;stickPointer=null;stickVector={x:0,y:0};stick.style.setProperty('--stick-x','0px');stick.style.setProperty('--stick-y','0px');};
 stick.addEventListener('pointerup',releaseStick);stick.addEventListener('pointercancel',releaseStick);
 canvas.addEventListener('pointerdown',event=>{
  if(!active||mode!=='street'||!sheet.hidden||event.button!==0||editable(event.target))return;
  const rect=canvas.getBoundingClientRect(),target={x:(event.clientX-rect.left)/view.zoom+camera.x,y:(event.clientY-rect.top)/view.zoom+camera.y};
  const route=findPath(position,target,rackStatus(state()).blocked);if(!route.length){setStatus('那里不是可通行的街道，请点击路面。');return;}
  path=route;keys.clear();setStatus('');
 });

 function tick(now){
  if(!active||mode!=='street'||destroyed)return;
  const delta=lastTime?Math.min(.05,(now-lastTime)/1000):0;lastTime=now;
  let dx=0,dy=0;
  if(sheet.hidden&&!document.hidden&&!document.querySelector('dialog[open]')){
   if(keys.has('a')||keys.has('arrowleft'))dx--;if(keys.has('d')||keys.has('arrowright'))dx++;
   if(keys.has('w')||keys.has('arrowup'))dy--;if(keys.has('s')||keys.has('arrowdown'))dy++;
   dx+=stickVector.x;dy+=stickVector.y;
   if(Math.hypot(dx,dy)<.08&&path.length){
    const target=path[0],distance=Math.hypot(target.x-position.x,target.y-position.y);
    if(distance<4)path.shift();else{dx=(target.x-position.x)/distance;dy=(target.y-position.y)/distance;}
   }
  }
  const length=Math.hypot(dx,dy);moving=false;
  if(length>.08){
   dx/=Math.max(1,length);dy/=Math.max(1,length);
   const before={...position},next=moveSafely(position,dx*190*delta,dy*190*delta,rackStatus(state()).blocked);position=next;
   moving=Math.hypot(position.x-before.x,position.y-before.y)>.01;
   if(moving)onMove({...position},{final:false});
   if(Math.abs(dx)>Math.abs(dy))direction=dx<0?1:2;else direction=dy<0?3:0;
  }else if(!path.length)moving=false;
  const target=cameraTarget(),follow=reducedMotion.matches?1:1-Math.exp(-delta*9);
  camera.x+=(target.x-camera.x)*follow;camera.y+=(target.y-camera.y)*follow;
  updateInteraction(now);draw(now);frame=requestAnimationFrame(tick);
 }

 function drawSprite(sprite,x,y,height){
  if(!sprite)return;
  const width=height*sprite.width/sprite.height;
  context.drawImage(sprite,x-width/2,y-height,width,height);
 }
 function drawMarker(place,now){
  const near=interaction?.type==='place'&&interaction.id===place.id;
  context.fillStyle=near?'#fff0b8':'#f3d58b';context.beginPath();context.arc(place.x,place.y-8,near?10:7,0,Math.PI*2);context.fill();
  context.strokeStyle='#17372e';context.lineWidth=3;context.stroke();
  context.font='600 17px system-ui, sans-serif';const width=context.measureText(place.name).width+18;
  context.fillStyle='#152e28dd';context.fillRect(place.x-width/2,place.y-48,width,27);
  context.fillStyle='#fff1c9';context.textAlign='center';context.textBaseline='middle';context.fillText(place.name,place.x,place.y-34);
  if(near){context.fillStyle='#fff1c9';context.fillText('E',place.x,place.y+18+Math.sin(now/220)*2);}
 }
 function spriteForPerson(personId){
  const original=npcFrames[NPCS[personId]?.sprite??0];
  if(personId!=='qing')return original;
  const wearing=qingStatus(state()).wearing;if(!wearing)return original;
  const index=wearing==='借来的外套'?1:wearing==='新外套'?2:0;
  return qingCoatFrames[index]||original;
 }
 function draw(now){
  if(mode!=='street')return;
  context.setTransform(view.dpr,0,0,view.dpr,0,0);context.clearRect(0,0,view.width,view.height);
  context.fillStyle='#172e29';context.fillRect(0,0,view.width,view.height);
  context.save();context.scale(view.zoom,view.zoom);context.translate(-camera.x,-camera.y);
  if(worldImage)context.drawImage(worldImage,0,0,SIZE,SIZE);
  else{
   context.fillStyle='#9c8569';context.fillRect(0,0,SIZE,SIZE);context.fillStyle='#bca78c';
   for(const road of [{x:380,y:220,w:180,h:1080},{x:1000,y:220,w:175,h:1080},{x:380,y:220,w:795,h:120},{x:380,y:1080,w:795,h:220},{x:1100,y:180,w:300,h:170}])context.fillRect(road.x,road.y,road.w,road.h);
  }
  const rack=rackGeometry(state());
  context.fillStyle='#6c4435';context.fillRect(rack.x,rack.y,rack.w,12);
  context.fillStyle='#dbc29a';for(let x=rack.x+8;x<rack.x+rack.w-5;x+=20)context.fillRect(x,rack.y+12,13,32);
  if(path.length){const target=path[path.length-1];context.strokeStyle='#fff0b8aa';context.lineWidth=3;context.beginPath();context.arc(target.x,target.y,10,0,Math.PI*2);context.stroke();}
  for(const place of PLACES)drawMarker(place,now);
  const actors=availablePeople().map(person=>({point:personPosition(person,now),person}));
  actors.sort((a,b)=>a.point.y-b.point.y);
  let playerDrawn=false;
  for(const actor of actors){
   if(!playerDrawn&&position.y<actor.point.y){drawPlayer(now);playerDrawn=true;}
   const data=NPCS[actor.person.id],sprite=spriteForPerson(actor.person.id),walking=['buyer','qing'].includes(actor.person.id)&&!reducedMotion.matches;
   drawSprite(sprite,actor.point.x,actor.point.y+(walking?Math.sin(now/100)*1.5:0),walking?99:96);
   context.font='13px system-ui, sans-serif';context.textAlign='center';context.textBaseline='middle';
   const name=data?.name||actor.person.id,width=context.measureText(name).width+12;
   context.fillStyle='#17352dcc';context.fillRect(actor.point.x-width/2,actor.point.y-116,width,21);
   context.fillStyle='#fff0c7';context.fillText(name,actor.point.x,actor.point.y-105);
  }
  if(!playerDrawn)drawPlayer(now);
  context.restore();
 }
 function drawPlayer(now){
  const row=moving&&!reducedMotion.matches?Math.floor(now/180)%2:0,index=row*4+direction,sprite=playerFrames[index]||playerFrames[direction];
  if(sprite)drawSprite(sprite,position.x,position.y+(moving&&!reducedMotion.matches?Math.sin(now/85)*1.5:0),122);
  else{context.fillStyle='#f0d3a0';context.beginPath();context.arc(position.x,position.y-34,13,0,Math.PI*2);context.fill();context.fillStyle='#465743';context.fillRect(position.x-13,position.y-24,26,27);}
 }
 function drawRoomPerson(personId){
  const ctx=roomPerson.getContext('2d');ctx.clearRect(0,0,roomPerson.width,roomPerson.height);
  if(!personId){roomPerson.setAttribute('aria-label','阿晴已去面试，当前不在住处');return;}
  const sprite=spriteForPerson(personId);roomPerson.setAttribute('aria-label',NPCS[personId].name);
  if(!sprite)return;
  const scale=Math.min(roomPerson.width/sprite.width,(roomPerson.height-12)/sprite.height),width=sprite.width*scale,height=sprite.height*scale;
  ctx.drawImage(sprite,(roomPerson.width-width)/2,roomPerson.height-height,width,height);
 }

 Promise.all(['ow-world-day.png','ow-world.png','ow-world-night.png','ow-player.png','ow-npcs.png','ow-qing-coats.png'].map(name=>loadImage(assetUrl(name)))).then(([day,world,night,player,npcs,coats])=>{
  if(destroyed)return;worldImages=[day,world,night];playerFrames=spriteFrames(player,4,2);npcFrames=spriteFrames(npcs,4,2);qingCoatFrames=spriteFrames(coats,3,1);assetsSettled=true;
  refresh();
 });

 return {
  start(){resetVoice();return showStreet('home');},showStreet,hide,restore,validateRestore,validateHistory,refresh,flush,
  reset(){resetVoice();return true;},
  get active(){return active;},
  get soundLocation(){return active&&mode==='room'?'interior':'outside';},
  destroy(){destroyed=true;hide();resetVoice();observer.disconnect();window.removeEventListener('keydown',keyDown);window.removeEventListener('keyup',keyUp);window.removeEventListener('blur',blur);document.removeEventListener('focusin',focusIn);document.removeEventListener('visibilitychange',visibilityChange);}
 };
}
