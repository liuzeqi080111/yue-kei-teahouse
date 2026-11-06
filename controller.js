import {createSession, PHASES as P} from './teahouse-scene/index.js';
export const MOTION = Object.freeze({walk:3200, lead:3800, frame:220, water:4800, utensils:3200, withdraw:1200, farewell:1800});
export const LINES={
 outside:['街角旁白','午後三點，茶香啱啱好。','ng5 hau6 saam1 dim2, caa4 hoeng1 ngaam1 ngaam1 hou2.','下午三點，茶香正好。'],
 ENTER:['阿明 · 侍應','你好呀，幾位呀？','nei5 hou2 aa3, gei2 wai2 aa3?','你好，请问几位？'],
 START_SEATING:['阿明 · 侍應','呢邊吖，窗口位留咗畀你。','ni1 bin1 aa1, coeng1 hau2 wai2 lau4 zo2 bei2 nei5.','這邊，靠窗的座位給你留好了。'],
 SIT_DOWN:['阿明 · 侍應','坐吖，睇吓想食啲乜。','co5 aa1, tai2 haa5 soeng2 sik6 di1 mat1.','請坐，看看想吃些什麼。'],
 OPEN_MENU:['阿明 · 侍應','餐牌喺度，慢慢睇，睇啱話我知。','','菜單在這裡，慢慢看，選好告訴我。'],
 CONFIRM_ORDER:['阿明 · 侍應','好呀，落單喇。請稍等。','hou2 aa3, lok6 daan1 laa3. cing2 saau2 dang2.','好的，已下單，請稍等。'],
 MARK_SERVED:['阿明 · 侍應','嚟喇，小心熱呀，慢慢食！','lai4 laa3, siu2 sam1 jit6 aa3, maan6 maan6 sik6!','來了，小心燙，請慢用！'],
 REQUEST_WATER:['阿明 · 侍應','幫你加返水，慢慢飲。','bong1 nei5 gaa1 faan1 seoi2, maan6 maan6 jam2.','給你加點水，慢慢喝。'],
 REQUEST_UTENSILS:['阿明 · 侍應','筷子同匙羹，放喺呢度吖。','faai3 zi2 tung4 ci4 gang1, fong3 hai2 ni1 dou6 aa1.','筷子和勺子放在這裡。'],
 CALL_WAITER:['阿明 · 侍應','有咩可以幫到你？','jau5 me1 ho2 ji5 bong1 dou2 nei5?','有什麼可以幫你？'],
 REQUEST_BILL:['你 · 埋單','唔該，埋單。','m4 goi1, maai4 daan1.','麻煩你，結帳。'],
 PAY_BILL:['阿明 · 侍應','收妥喇，多謝晒！','sau1 to5 laa3, do1 ze6 saai3!','已收妥，非常感謝！'],
 LEAVE:['阿明 · 侍應','慢行呀，得閒再嚟！','maan6 haang4 aa3, dak1 haan4 zoi3 lai4!','慢走，有空再來！'],
};
export function diningOutcome(state,inspectDining=()=>null){
 const outcome={completed:[],leftover:[],untouched:[],packed:[]};
 for(const item of state?.items||[]){
  if(item.status!=='served')continue;
  const details=inspectDining(item.id),isDrink=typeof details?.isDrink==='boolean'?details.isDrink:item.itemId.startsWith('drink-');
  const entry={name:item.name,isDrink};
  if(details?.isPacked||item.options?.serving==='外賣')outcome.packed.push(entry);
  else if(details?.found&&details.remaining===0)outcome.completed.push(entry);
  else if(details?.found&&Number.isFinite(details.remaining)&&details.remaining<3)outcome.leftover.push(entry);
  else outcome.untouched.push(entry);
 }
 return outcome;
}
export function createGame({schedule=setTimeout,cancel=clearTimeout,changed=()=>{},inspectDining=()=>null}={}){
 const session=createSession({maxPerItem:1});let timers=new Set(),generation=0,cameraRevision=0,farewellPending=null;
 let speechPending=false;
 let view={camera:'outside',busy:false,water:false,utensils:false,line:LINES.outside,notice:'',beat:null,near:false,orderReview:false};
 const snapshot=()=>({state:session.getState(),view:{...view}});
 const emit=()=>changed(snapshot());
 function followUp(kind){
  const packed=session.getState().items.some(i=>i.status==='served'&&i.options.serving==='外賣');
  const text=kind==='REQUEST_WATER'?'水加好喇，仲有咩需要？':kind==='REQUEST_UTENSILS'?'餐具放好喇，仲有咩需要？':packed?'外賣包好喇，仲有咩需要？':'餐點上齊喇，仲有咩需要？';
  view.line=['阿明 · 侍應',text,'','已完成，還有什麼需要幫忙？'];
 }
 function afterSpeech(fn){const deadline=Date.now()+45000;function check(round){if(speechPending&&Date.now()<deadline){later(check,80);return;}fn(round);}check(session.getState().round);}
 function later(fn,ms){const round=session.getState().round,token=generation;const id=schedule(()=>{timers.delete(id);if(token!==generation||session.getState().round!==round)return;fn(round);},ms);timers.add(id);}
 function dispatch(type,extra={}){const r=session.dispatch({type,round:session.getState().round,...extra});if(!r.ok){view.notice=r.reason;emit();return r;}if(LINES[type]&&!r.events.some(e=>e.type.endsWith('_NOOP'))&&(type!=='REQUEST_BILL'||r.events.some(e=>e.type==='WAITER_APPROACH')))view.line=LINES[type];for(const e of r.events){}return r;}
 function sequence(beats,kind,complete=()=>{}){
  const tableService=['REQUEST_WATER','REQUEST_UTENSILS'].includes(kind);
  let serviceCameraRevision;
  let arrived;if(view.near&&beats[0][0]==='approach'){arrived=beats[0][2];beats=beats.slice(1);}
  view.busy=true;view.camera=kind==='greeting'?'entrance':'room';view.line=kind==='seated'?LINES.SIT_DOWN:kind==='greeting'?LINES.ENTER:kind==='dismiss'?['阿明 · 侍應','好，有事再嗌我。','','好，有事再叫我。']:['你','唔該！','','麻煩你！'];arrived?.(session.getState().round);
  function next(index){
   if(index===beats.length){view.near=beats.at(-1)?.[0]!=='depart';view.beat=null;view.busy=false;view.notice='';complete();emit();return;}
   const [pose,requestedDuration,finish,orderItemId]=beats[index];
   const duration = ['approach','depart'].includes(pose) ? MOTION.walk : requestedDuration;
   if(tableService&&pose==='place'&&view.camera==='room'){serviceCameraRevision=cameraRevision;view.camera='table';}
   if(tableService&&pose==='talk'&&serviceCameraRevision!==undefined&&view.camera==='table'&&cameraRevision===serviceCameraRevision)view.camera='room';
   view.beat={pose,kind,orderItemId,start:Date.now(),duration,round:session.getState().round};emit();
   later(()=>afterSpeech(round=>{finish?.(round);if(index===beats.length-1&&pose==='depart')session.dispatch({type:'WAITER_LEAVE',round});next(index+1);}),duration);
  }
  next(0);
 }
 function action(type,extra={}){
  if(type==='RESTART'){speechPending=false;farewellPending=null;generation++;for(const t of timers)cancel(t);timers.clear();session.dispatch({type:'RESTART'});view={camera:'outside',busy:false,water:false,utensils:false,line:LINES.outside,notice:'',beat:null,near:false,orderReview:false};emit();return {ok:true};}
  if(type==='PAY_BILL'&&view.busy&&session.getState().isPaid)return session.dispatch({type,round:session.getState().round,...extra});
  if(view.busy){view.notice='侍應正在服務，請稍等一陣。';emit();return {ok:false};}
  if(type==='CONTINUE_ORDER'){
   if(!view.orderReview)return {ok:false};
   view.orderReview=false;view.camera='menu';view.notice='可以繼續揀，阿明喺旁邊等你。';view.line=['阿明 · 侍應','好，你慢慢揀，我喺旁邊等。','','好，你慢慢選，我在旁邊等。'];emit();return {ok:true};
  }
  if(type==='CONFIRM_ORDER'&&session.getState().items.some(i=>i.status==='pending')){
   const call=dispatch('CALL_WAITER');if(!call.ok)return call;
   sequence([['approach',MOTION.walk],['talk',500]],'order-review',()=>{
    view.orderReview=true;view.line=['阿明 · 侍應','仲要唔要啲嘢？齊嘅話，我就幫你落單。','zung6 jiu3 m4 jiu3 di1 je5? cai4 ge3 waa6, ngo5 zau6 bong1 nei5 lok6 daan1.','還要些什麼嗎？選好了我就幫你下單。'];
   });return call;
  }
  if(type==='FINISH_ORDER'){
   if(!view.orderReview){view.notice='先睇吓餐牌，再確認落單。';emit();return {ok:false};}
   view.orderReview=false;type='CONFIRM_ORDER';
  }
  view.notice='';const r=dispatch(type,extra);if(!r.ok)return r;
  if(type==='ENTER')sequence([['talk',500]],'greeting');
  if(type==='WAITER_LEAVE'){view.orderReview=false;sequence([['talk',300],['depart',850]],'dismiss');}
  if(type==='START_SEATING'){
   view.line=r.state.partySize===2?['阿明 · 侍應','兩位，呢邊吖，窗口有位。','loeng5 wai2, ni1 bin1 aa1, coeng1 hau2 jau5 wai2.','两位，这边请，窗边有座位。']:LINES.START_SEATING;view.busy=true;view.camera='entrance';
   view.beat={pose:'talk',kind:'seating',start:Date.now(),duration:500,round:session.getState().round};
   later(()=>afterSpeech(()=>{view.near=false;view.camera='walk';view.beat={pose:'depart',kind:'seating',start:Date.now(),duration:MOTION.lead,round:session.getState().round};emit();
    later(round=>{dispatch('SIT_DOWN',{round});view.camera='room';view.near=true;view.line=LINES.SIT_DOWN;sequence([['talk',500],['depart',MOTION.walk]],'seated');},MOTION.lead);
   }),500);
  }
  if(type==='OPEN_MENU'){view.camera='menu';if(!r.state.waiterPresent)view.line=['餐牌','慢慢睇，揀好再嗌阿明。','','選好後再叫侍應。'];}
  if(type==='CONFIRM_ORDER'&&r.events.some(e=>e.type==='ORDER_CONFIRMED')){
   const ids=r.events.find(e=>e.type==='ORDER_CONFIRMED').orderItemIds;
   const beats=[['approach',900,()=>{view.line=LINES.CONFIRM_ORDER;}],['talk',950],['depart',700],['prepare',650],['approach',1000]];
   for(const orderItemId of ids)beats.push(['place',900,round=>{
    const served=dispatch('MARK_SERVED',{orderItemId,round});
    if(served.ok&&served.state.items.find(i=>i.id===orderItemId)?.options.serving==='外賣')view.line=['阿明 · 侍應','呢份外賣包好喇，記得拎埋呀。','','這份外賣已打包，離開時請帶好。'];
   },orderItemId]);
   beats.push(['talk',850]);sequence(beats,'food',()=>followUp('food'));
  }
  if(['CALL_WAITER','REQUEST_WATER','REQUEST_UTENSILS'].includes(type)){
   const line=LINES[type];
   sequence(type==='CALL_WAITER'?[['approach',1000,()=>{view.line=line;}],['talk',700]]:[
    ['approach',1000,()=>{view.line=line;}],['talk',1400],
    ['place',type==='REQUEST_WATER'?MOTION.water:MOTION.utensils,()=>{if(type==='REQUEST_WATER')view.water=true;if(type==='REQUEST_UTENSILS')view.utensils=true;}],
    ['withdraw',MOTION.withdraw],['talk',700]],type,()=>{if(type!=='CALL_WAITER')followUp(type);});
  }
  if(type==='REQUEST_BILL'){
   if(r.events.some(e=>e.type==='WAITER_APPROACH'))sequence([['approach',1000,()=>{view.line=['阿明 · 侍應','呢張係你張單，睇啱就可以埋單。','','這是你的帳單，核對後就可以結帳。'];}],['talk',900]],'bill',()=>{view.camera='bill';});
   else view.camera='bill';
  }
   if(type==='PAY_BILL'&&r.events.some(e=>e.type==='PAYMENT_COMPLETED')){
    view.busy=true;view.camera='room';view.near=true;
    const outcome=diningOutcome(r.state,inspectDining),notes=[],meanings=[];
    if(outcome.packed.length){notes.push('外賣記得拎埋');meanings.push('请带好外卖');}
    if(outcome.leftover.length||outcome.untouched.length){notes.push('堂食有剩都唔緊要');meanings.push('堂食没吃完或没喝完也没关系');}
    const suffix=notes.length?`${notes.join('；')}。`:'',meaningSuffix=meanings.length?`${meanings.join('；')}。`:'';
    view.line=['阿明 · 侍應',`收妥喇，多謝晒！${suffix}慢行呀。`,'',`已收妥，謝謝惠顧！${meaningSuffix}慢走！`];
   view.beat={pose:'talk',kind:'farewell',start:Date.now(),duration:MOTION.farewell,round:session.getState().round};
   const deadline=Date.now()+45000;
   function finishFarewell(round){
    if(farewellPending&&Date.now()<deadline){later(finishFarewell,200);return;}
    farewellPending=null;const ended=dispatch('LEAVE',{round});view.beat=null;view.busy=false;view.near=false;if(ended.ok)view.camera='outside';emit();
   }
   later(finishFarewell,MOTION.farewell);
  }
  if(type==='LEAVE')view.camera='outside';
  if(type==='ADD_ITEM')view.notice='已記低，確認落單之前仲可以修改。';
  if(type.startsWith('UPDATE_'))view.notice='改好喇，只更新咗呢一份。';
  if(type==='CANCEL_ITEM')view.notice='已取消呢一份。';
  emit();return r;
 }
 function camera(value){const st=session.getState();if(![P.SEATED,P.ORDERING,P.DINING,P.BILLING].includes(st.phase))return;
  if(st.isPaid)return;
  if(value==='menu'&&st.phase===P.SEATED)return action('OPEN_MENU');
  if(value==='menu'&&st.phase===P.BILLING)value='bill';
  cameraRevision++;view.camera=value;emit();
 }
 return {snapshot,action,camera,setSpeech(active,level=0){speechPending=active;view.speaking=level>0;view.speechLevel=level;},holdFarewell(round){if(round!==session.getState().round||view.beat?.kind!=='farewell')return ()=>{};const marker={round};farewellPending=marker;return ()=>{if(farewellPending===marker)farewellPending=null;};},chapter(value){action('RESTART');if(value==='full')return;for(const type of ['ENTER','START_SEATING','SIT_DOWN','OPEN_MENU'])dispatch(type);view.camera='table';if(value==='service'||value==='bill'){dispatch('ADD_ITEM',{itemId:'food-pineapple-bun'});dispatch('ADD_ITEM',{itemId:'drink-lemon-tea',options:{temperature:'凍',sweetness:'少甜'}});dispatch('CONFIRM_ORDER');dispatch('MARK_SERVED');dispatch('WAITER_LEAVE');}view.line=['章節練習',value==='order'?'由睇餐牌開始，試吓用粵語落單。':'練習情境：菠蘿油同凍檸茶已經上枱。','',''];if(value==='bill'){dispatch('REQUEST_BILL');view.near=true;view.camera='bill';view.line=['阿明 · 侍應','呢張係你張單，睇啱就可以埋單。','','這是你的帳單，核對後就可以結帳。'];}emit();},say(text,meaning=''){if(view.busy)return;if(!session.getState().waiterPresent){dispatch('CALL_WAITER');}view.near=true;view.camera='room';view.line=['阿明 · 侍應',String(text).slice(0,500),'',String(meaning).slice(0,500)];emit();},notify(message){view.notice=message;emit();}};
}
