import {MENU,PHASES as P} from './teahouse-scene/index.js';
import {getPhrase,buildOrderPhrase} from './learning-phrases.js';

const STORAGE_KEY='yuekei-learning-guide-v1';
const MODES=new Set(['beginner','experienced']);
const setText=(el,value)=>{if(el&&el.textContent!==value)el.textContent=value;};

function loadPreferences(){
 let saved={};
 try{
  const parsed=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');
  if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))saved=parsed;
 }catch{/* 存储不可用或内容损坏时仍可直接玩。 */}
 const hasMeaning=typeof saved.showMeaning==='boolean';
 return {
  mode:MODES.has(saved.mode)?saved.mode:null,
  showMeaning:hasMeaning?saved.showMeaning:true,
  meaningExplicit:typeof saved.meaningExplicit==='boolean'?saved.meaningExplicit:hasMeaning
 };
}

function goalFor({state,view},menuContext={}){
 const phrase=id=>getPhrase(id)||getPhrase('read-menu');
 const target=(goal,currentPhrase,intents=[])=>({goal,phrase:currentPhrase,intents});
 if(view.busy)return target('等阿明忙完，再继续。',phrase('speak-slower'));
 if(view.orderReview)return target('核对点好的餐点，确认无误再正式下单。',phrase('confirm-order'),[{type:'FINISH_ORDER'}]);

 if(view.camera==='menu'){
  const line=menuContext.editing?.lineId?state.items.find(i=>i.id===menuContext.editing.lineId):null;
  const item=MENU.find(i=>i.id===(line?.itemId||menuContext.editing?.itemId));
  if(item){
   const options=menuContext.editing?.values||line?.options||item.defaults;
   const orderPhrase=buildOrderPhrase(item,options);
   const intent=line?{type:'UPDATE_ITEM',orderItemId:line.id,options:{...options}}:{type:'ADD_ITEM',itemId:item.id,options:{...options}};
   return target(`选好${item.name}的规格，再${line?'保存修改':'加入订单'}。`,orderPhrase||phrase('read-menu'),[intent]);
  }
  if(menuContext.tab==='order'){
   const pending=state.items.filter(i=>i.status==='pending').length;
   return pending
    ? target(`核对 ${pending} 项待确认餐点，按「確認落單」，再回答阿明的确认问题。`,phrase('confirm-order'),[{type:'CONFIRM_ORDER'}])
    : target('目前没有待确认的餐点。可以返回菜单继续选。',phrase('read-menu'));
  }
  if(menuContext.tab==='drink'){
   const milkTea=MENU.find(i=>i.id==='drink-milk-tea');
   const options={...milkTea.defaults,temperature:'凍',sweetness:'少甜'};
   return target('选一款饮品；点单时可以说想要冰的还是热的，以及菜单提供的甜度。',buildOrderPhrase(milkTea,options)||phrase('read-menu'),[{type:'ADD_ITEM',itemId:milkTea.id,options}]);
  }
  const pineappleBun=MENU.find(i=>i.id==='food-pineapple-bun');
  return target(`选一种招牌美食${state.phase===P.DINING?'加点':'加入订单'}，每款限一份。`,buildOrderPhrase(pineappleBun)||phrase('order-pineapple-bun'),[{type:'ADD_ITEM',itemId:pineappleBun.id,options:{...pineappleBun.defaults}}]);
 }

 if(state.phase===P.DINING&&menuContext.dining?.found){
  const details=menuContext.dining;
  if(details.remaining===0)return target('这一份已经用完，可以告诉阿明你吃完或喝完了。',phrase(details.isDrink?'finished-drinking':'finished-eating'));
  if(details.remaining<3)return target('尝过以后，可以用粤语说说味道。',phrase(details.isDrink?'delicious-drink':'delicious'));
 }
 const goals={
  [P.GREETING]:target('告诉阿明，你是一个人来吃饭的。',phrase('one-person'),[{type:'START_SEATING'}]),
  [P.SEATING]:target('跟阿明到窗边，等他带你入座。',phrase('follow-seat')),
  [P.SEATED]:target('请阿明给你菜单，再决定吃什么。',phrase('read-menu'),[{type:'OPEN_MENU'}]),
  [P.ORDERING]:target('打开菜单选餐。阿明会再问一次，确认后才会下单。',phrase('read-menu'),[{type:'OPEN_MENU'}]),
  [P.DINING]:target('用餐时可以请阿明加水或拿餐具，也可以请他结账。',phrase('request-water'),[{type:'REQUEST_WATER'}]),
  [P.BILLING]:state.isPaid
   ? target('虚拟结账已完成，等阿明和你道别。',phrase('thanks'))
   : target('核对账单后确认虚拟结账，不会实际付款。',phrase('check-bill'),[{type:state.billPresented?'PAY_BILL':'REQUEST_BILL'}])
 };
 return goals[state.phase]||target('按场景提示继续对话。',phrase('read-menu'));
}

export function createLearningGuide({getSnapshot,getMenuContext,onMeaningChange,onHint}){
 let preferences=loadPreferences(),pendingAction=null,returnDialog=null,returnFocus=null;
 let guideKey='',helpText='',hintKey='';
 const hintLevels=new Map();
 let practiceData={key:'',phraseId:'',example:'',parts:[],npcText:'',intents:[],hintLevel:'goal'};
 const dialog=document.querySelector('#learning-mode');

 function savePreferences(){
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(preferences));}catch{/* 保存失败只影响记忆，不影响本局。 */}
 }
 function syncMode(){
  const label=preferences.mode==='beginner'?'零基礎':preferences.mode==='experienced'?'已有基礎':'首次選擇';
  document.querySelectorAll('[data-learning-mode-label]').forEach(el=>setText(el,label));
  document.querySelectorAll('[data-learning-mode]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.learningMode===preferences.mode)));
 }
 function applyMeaning(value,{explicit=true,save=true}={}){
  preferences.showMeaning=Boolean(value);
  if(explicit)preferences.meaningExplicit=true;
  onMeaningChange(preferences.showMeaning);
  if(save)savePreferences();
 }
 function openMode(action=null,origin=null,force=false){
  if(preferences.mode&&!force){
   if(origin?.open)origin.close();
   action?.();
   return true;
  }
  if(!dialog){if(origin?.open)origin.close();action?.();return true;}
  pendingAction=action;returnDialog=origin;returnFocus=document.activeElement;
  if(origin?.open)origin.close();
  syncMode();
  if(!dialog.open)dialog.showModal();
  dialog.querySelector(`[data-learning-mode="${preferences.mode||'beginner'}"]`)?.focus({preventScroll:true});
  return false;
 }
 function cancel(){
  const origin=returnDialog,focus=returnFocus;
  pendingAction=null;returnDialog=null;returnFocus=null;
  if(dialog?.open)dialog.close();
  if(origin&&!origin.open)origin.showModal();
  focus?.focus({preventScroll:true});
 }
 function choose(mode){
  if(!MODES.has(mode))return;
  preferences.mode=mode;
  if(mode==='beginner'&&!preferences.meaningExplicit)applyMeaning(true,{explicit:false,save:false});
  savePreferences();syncMode();render(getSnapshot());
  const action=pendingAction,origin=returnDialog,focus=returnFocus;
  pendingAction=null;returnDialog=null;returnFocus=null;
  if(dialog?.open)dialog.close();
  if(action)action();
  else if(origin){if(!origin.open)origin.showModal();focus?.focus({preventScroll:true});}
 }
 function updateHelp(){
  document.querySelectorAll('[data-learning-result]').forEach(el=>{
   setText(el,helpText);el.hidden=!helpText;
  });
 }
 function copyIntents(intents){return intents.map(intent=>({...intent,...(intent.options?{options:{...intent.options}}:{})}));}
 function noteHint(kind){
  if(!['full','frame','audio'].includes(kind)||!practiceData.phraseId)return false;
  onHint?.(kind,practiceData.phraseId);return true;
 }
 function setHint(level){
  if(!['goal','frame','full'].includes(level)||!hintKey)return;
  hintLevels.set(hintKey,level);render(getSnapshot());
 }
  function reset(){
   guideKey='';helpText='';hintKey='';hintLevels.clear();
   document.querySelectorAll('[data-click-fallback]').forEach(el=>{el.open=false;});
   practiceData={key:'',phraseId:'',example:'',parts:[],npcText:'',intents:[],hintLevel:'goal'};updateHelp();
  }
 function render(snapshot){
  const {state,view}=snapshot,open=['menu','bill'].includes(view.camera);
  const visible=![P.OUTSIDE,P.FINISHED].includes(state.phase);
  const goal=goalFor(snapshot,getMenuContext()),currentPhrase=goal.phrase||getPhrase('read-menu');
  const phraseKey=JSON.stringify([currentPhrase.id,currentPhrase.cantonese,currentPhrase.jyutping,currentPhrase.meaning,currentPhrase.parts,currentPhrase.words]);
  const key=JSON.stringify([goal.goal,phraseKey,view.line?.[1],view.line?.[3]]);
  hintKey=JSON.stringify([goal.goal,phraseKey]);
  const savedLevel=hintLevels.get(hintKey),hintLevel=['frame','full','goal'].includes(savedLevel)?savedLevel:preferences.mode==='beginner'?'full':'goal';
  document.body.dataset.learningHint=hintLevel;
  practiceData={key,phraseId:currentPhrase.id,example:currentPhrase.cantonese,parts:[...currentPhrase.parts],npcText:view.line?.[0]?.startsWith('阿明')?view.line[1]:'',intents:copyIntents(goal.intents||[]),hintLevel};
  if(key!==guideKey){guideKey=key;helpText='';}
  document.querySelectorAll('[data-learning-guide]').forEach(el=>{
   const inPanel=el.classList.contains('learning-guide-panel'),shown=visible&&(inPanel?open:!open);
   el.hidden=!shown;
   setText(el.querySelector('[data-learning-goal]'),goal.goal);
   setText(el.querySelector('[data-learning-example]'),currentPhrase.cantonese);
   setText(el.querySelector('[data-learning-jyutping]'),currentPhrase.jyutping);
   setText(el.querySelector('[data-learning-parts]'),currentPhrase.parts.join(' ／ '));
   setText(el.querySelector('[data-learning-frame]'),currentPhrase.cantonese.startsWith('唔該，我要一杯')?'唔該，我要一杯＿＿＿。':currentPhrase.parts.map(part=>part==='唔該'?part:'＿＿＿').join('，')+'。');
   const translation=el.querySelector('[data-learning-translation]');
   setText(translation,`普通话：${currentPhrase.meaning}`);if(translation)translation.hidden=!preferences.showMeaning;
   const words=el.querySelector('[data-learning-words]');
   if(words){
    words.hidden=!preferences.showMeaning;
    const wordDetails=words.closest('details');if(wordDetails)wordDetails.hidden=!preferences.showMeaning;
    if(words.dataset.phraseKey!==phraseKey){
     if(wordDetails)wordDetails.open=false;
     words.replaceChildren(...currentPhrase.words.map(entry=>{
      const row=document.createElement('span'),word=document.createElement('b');
      word.textContent=entry.word;row.append(word,document.createTextNode(` ${entry.meaning}`));return row;
     }));
     words.dataset.phraseKey=phraseKey;
    }
   }
   const example=el.querySelector('.learning-example');if(example)example.hidden=hintLevel!=='full';
   const frame=el.querySelector('.learning-frame');if(frame)frame.hidden=hintLevel!=='frame';
   el.querySelectorAll('[data-guide-hint]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.guideHint===hintLevel)));
   const result=el.querySelector('[data-learning-result]');
   setText(result,helpText);if(result)result.hidden=!helpText;
   if(shown&&(hintLevel==='full'||hintLevel==='frame'))noteHint(hintLevel);
  });
 }
 function help(kind){
  const snapshot=getSnapshot(),{state,view}=snapshot;
  if([P.OUTSIDE,P.FINISHED].includes(state.phase))return;
  if(kind==='meaning')helpText=view.line?.[3]?`「${view.line[1]}」\n普通话：${view.line[3]}`:'这句暂时没有普通话释义。';
   else if(kind==='answer'){
    const currentPhrase=goalFor(snapshot,getMenuContext()).phrase;
    helpText=`可以这样回答：「${currentPhrase.cantonese}」\n粤拼：${currentPhrase.jyutping}\n普通话：${currentPhrase.meaning}`;
    onHint?.('full',currentPhrase.id);
   }else if(kind==='slower'){
   const currentPhrase=getPhrase('speak-slower');
   helpText=`${currentPhrase.cantonese}\n粤拼：${currentPhrase.jyutping}\n普通话：${currentPhrase.meaning}`;
  }else return;
  updateHelp();
 }

 dialog?.addEventListener('cancel',event=>{event.preventDefault();cancel();});
 syncMode();
  return {
    openMode,cancel,choose,render,help,reset,setHint,noteHint,
    getPractice(){return {...practiceData,parts:[...practiceData.parts],intents:copyIntents(practiceData.intents)};},
    get showMeaning(){return preferences.showMeaning;},
    get experienced(){return preferences.mode==='experienced';},
    setMeaning:value=>{applyMeaning(value);render(getSnapshot());}
  };
}
