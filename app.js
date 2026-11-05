const STATIC_PREVIEW = document.documentElement.dataset.preview === 'true';
import {MENU,PHASES as P} from './teahouse-scene/index.js';
import {createGame} from './controller.js';
import {draw,food,ready} from './scene.js';
import {mountVoice} from './voice.js';
import {createAmbience} from './ambient.js';
import {mountMusic} from './music.js';
const $=s=>document.querySelector(s),money=n=>'$'+(n/100).toFixed(2),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names={temperature:'溫度',sweetness:'甜度',serving:'享用方式',rice:'飯量',noodle:'麵條',soup:'湯量',bread:'麵包',syrup:'糖漿',spicy:'辣度'};
const roman={'food-pineapple-bun':'BO LO YAU','food-charsiu-rice':'CHAR SIU RICE','food-wonton-noodle':'WONTON NOODLES','food-egg-sandwich':'EGG SANDWICH','food-french-toast':'FRENCH TOAST','food-curry-fishball':'CURRY FISHBALLS','drink-lemon-tea':'LEMON TEA','drink-milk-tea':'SILK STOCKING MILK TEA','drink-yuanyang':'YUANYANG','drink-horlicks':'HORLICKS'};
const stageNames={[P.OUTSIDE]:'01 / 抵達',[P.GREETING]:'02 / 迎接',[P.SEATING]:'03 / 帶位',[P.SEATED]:'04 / 落座',[P.ORDERING]:'05 / 點餐',[P.DINING]:'06 / 用餐',[P.BILLING]:'07 / 埋單',[P.FINISHED]:'08 / 再會'};
const locationNames={outside:'街邊 · 粵記門外',entrance:'門口 · 侍應迎接',walk:'走道 · 跟隨帶位',room:'窗邊卡座 · 03 號枱',table:'03 號枱 · 桌面',menu:'03 號枱 · 餐牌',bill:'03 號枱 · 帳單'};
let tab='food',editing=null,showMeaning=true,lastCamera=null,tablePage=0,lastRound=null;
let lookCamera='room',panelKey='',panelMarkup='',previousPanel=false;
const panelScroll=new Map();
let frame=0;
let voice=null;
const game=createGame({changed:render});
$('#translation').setAttribute('aria-pressed','true');
createAmbience({button:$('#ambience')});
mountMusic($('#music-settings'));
if(STATIC_PREVIEW){
 $('#voice-dock').hidden=true;$('#voice-dock').removeAttribute('open');
 $('#welcome > small').textContent='公開試玩版 · 用場景內選項點餐、加水和埋單；語音稍後開放。';
 const notes=$('#settings').querySelectorAll(':scope > p, :scope > small');
 if(notes[0])notes[0].textContent='本版本可測試完整點餐流程與背景音樂，語音及文字理解尚未開放。';
 if(notes[2])notes[2].textContent='只作虛擬結帳，不會收款；無需帳號，不會錄音。';
}else voice=mountVoice({game,host:$('#voice-host')});
function feedback(s){
 if(s.includes('售罄'))return s.replace(/今日售罄.*/, '今日賣晒喇，揀過另一款吖。');
 if(s.includes('未确认的商品'))return '仲有餐點未確認，落單或取消嗰幾項之後就可以埋單。';
 if(s.includes('已经上菜'))return '呢份已經上枱，唔可以再改數量、選項或者取消。';
 if(s.includes('尚未完成虚拟结账'))return '要先完成虛擬結帳，先可以離店。';
 if(s.includes('数量必须'))return '每款餐點本局限一份。';
 if(/选项|取值/.test(s))return '呢個規格揀唔到，請用餐牌上提供嘅選項。';
 return /[订单账阶认请执数]/.test(s)?'而家做唔到呢個操作，睇吓餐牌或者帳單再試。':s;
}
function updateText(el,value){if(el.textContent!==value)el.textContent=value;}
function focusToken(el){
 const attr=['data-action','data-camera','data-tab','data-item','data-edit','data-close','data-back','data-cancel','data-table-page','name','type'].find(a=>el?.hasAttribute(a));
 return attr?[attr,el.getAttribute(attr)]:null;
}
function restoreFocus(root,token){
 const target=token&&[...root.querySelectorAll('button:not(:disabled), input, select')].find(el=>el.getAttribute(token[0])===token[1]);
 target?.focus({preventScroll:true});
 return !!target;
}
function closePanel(){
 const from=game.snapshot().view.camera;
 game.camera(game.snapshot().view.near?'room':lookCamera);
 $('#hotspots button')?.focus({preventScroll:true});
}
function button(type,label,primary=false,disabled=false){return `<button data-action="${type}" class="${primary?'primary':''}" ${disabled?'disabled':''}>${label}</button>`;}
const itemStatus=i=>i.options.serving==='外賣'?({pending:'待落單 · 外賣',confirmed:'已落單 · 待打包',served:'已打包'})[i.status]:({pending:'待落單',confirmed:'已落單 · 等上枱',served:'已上枱'})[i.status];
function actions(state,view){const busy=view.busy;if(view.orderReview)return button('CONTINUE_ORDER','仲想加啲嘢',false,busy)+button('FINISH_ORDER','夠喇，唔該落單。',true,busy);switch(state.phase){case P.OUTSIDE:return '';case P.GREETING:return button('START_SEATING','一位呀，唔該。 →',true,busy);case P.SEATING:return '<span class="note busy">跟住阿明，行去窗口位…</span>';case P.SEATED:return button('OPEN_MENU','唔該，睇吓餐牌。',true,busy)+button('REQUEST_WATER','唔該，加水。',false,busy)+button('WAITER_LEAVE','唔使住，唔該。',false,busy);case P.ORDERING:case P.DINING:return `<button data-camera="${view.camera==='table'?'room':'table'}">${view.camera==='table'?'抬頭傾偈':'睇吓枱面'}</button>`+`<button data-camera="menu">${state.phase===P.DINING?'想加啲嘢':'睇餐牌'}</button>`+button('REQUEST_WATER','唔該，加水。',false,busy)+button('REQUEST_UTENSILS','唔該，畀副餐具我。',false,busy)+(state.phase===P.DINING?button('REQUEST_BILL','唔該，埋單。',true,busy):'')+button('WAITER_LEAVE','唔使住，唔該。',false,busy);case P.BILLING:return state.isPaid?'<span>已結帳 · 正在道別…</span>':`<button data-camera="bill">查看帳單</button>`+button('PAY_BILL','虛擬結帳',true,busy);case P.FINISHED:return '';}}
function panel(state,view){const el=$('#panel');const visible=['menu','bill'].includes(view.camera);
 if(previousPanel&&panelKey)panelScroll.set(panelKey,el.querySelector('.paper-body')?.scrollTop||0);
 el.hidden=!visible;if(!visible){previousPanel=false;return;}
 const key=view.camera==='bill'?'bill':editing?`form:${editing.lineId||editing.itemId}`:tab;
 const hadFocus=el.contains(document.activeElement),token=focusToken(document.activeElement);
 let title='粵記餐牌',body='',foot='',tabs='';
 if(view.camera==='bill'){
  title='埋單 · 多謝';const bill=state.bill;
  body=bill?`<div class="receipt"><h3>粵記茶餐廳</h3><p class="note" style="text-align:center">03 號枱 · HKD · 虛擬帳單</p>${bill.lines.map(l=>`<div class="bill-line"><span>${esc(l.name)} × ${l.qty}<small>${Object.values(l.options).map(esc).join(' · ')}</small></span><span>${money(l.lineTotal)}</span></div>`).join('')}<div class="total"><span>合計</span><strong>${money(bill.totalCents)}</strong></div>${state.isPaid?'<div class="paid">已完成虛擬結帳</div>':''}<p class="note">所有金額均為演示數據，不會扣取任何款項。</p></div>`:'<p>帳單尚未準備好。</p>';
  foot=state.isPaid?'<span>已結帳 · 即將完成這一局</span>':`<span>只作練習，不會收款</span>${button('PAY_BILL',view.busy?'帳單送緊嚟…':'確認虛擬結帳',true,view.busy)}`;
 }else if(editing){
  const line=editing.lineId?state.items.find(i=>i.id===editing.lineId):null;
  const item=MENU.find(i=>i.id===(line?.itemId||editing.itemId));
  if(!item){editing=null;return panel(state,view);}
  const options=editing.values||line?.options||item.defaults;
  body=`<button class="back" data-back>← 返回餐牌</button><div class="menu-row"><canvas class="food-icon" data-food="${item.id}" width="100" height="80"></canvas><div class="menu-info"><strong>${esc(item.name)}</strong><small>${roman[item.id]}</small></div><span>${money(item.price)}</span></div><form id="item-form" novalidate><div class="options">${Object.entries(item.options).map(([key,values])=>`<label>${names[key]}<select name="${key}">${values.map(v=>`<option value="${v}" ${options[key]===v?'selected':''}>${v}</option>`).join('')}</select></label>`).join('')}<input type="hidden" name="qty" value="1"><span>數量：一份</span></div><p class="note" id="form-quantity-note">每款餐點本局限一份；已選餐點可修改規格。${item.options.serving?'外賣會用紙袋打包。':''}</p><button class="primary" type="submit" ${view.busy?'disabled':''}>${line?'保存修改':'加入訂單'}</button>${line?` <button type="button" data-cancel="${line.id}" ${view.busy?'disabled':''}>取消此項</button>`:''}</form>`;
  foot='<span>港幣標價 · 即點即製</span>';
 }else{
  tabs=`<div class="paper-tabs"><button data-tab="food" aria-pressed="${tab==='food'}">招牌美食</button><button data-tab="drink" aria-pressed="${tab==='drink'}">茶啡飲品</button><button data-tab="order" aria-pressed="${tab==='order'}">我的訂單 · ${state.items.length}</button></div>`;
  if(tab==='order')body=state.items.length?state.items.map(i=>`<div class="order-line"><div><p>${esc(i.name)} <span class="tag tag-${i.status}">${itemStatus(i)}</span></p><small>${Object.values(i.options).map(esc).join(' · ')} · 單價 ${money(i.unitPrice)}</small></div><button data-edit="${i.id}" aria-label="${i.status==='served'?'點解唔可以改':'修改'}${esc(i.name)} · ${Object.values(i.options).map(esc).join('、')}" ${view.busy&&i.status!=='served'?'disabled':''}>${i.status==='served'?'修改說明':'修改'}</button></div>`).join(''):'<p class="empty">仲未揀好？<br>去餐牌睇吓，菠蘿油配奶茶就啱晒。</p>';
  else body=MENU.filter(i=>i.category===tab).map(i=>`<div class="menu-row"><canvas class="food-icon" data-food="${i.id}" width="100" height="80"></canvas><div class="menu-info"><strong>${i.name}</strong><small>${roman[i.id]}</small></div><span class="price">${money(i.price)}</span><button data-item="${i.id}" aria-label="${i.name} ${i.available?'選擇':'今日售罄'}" ${view.busy&&i.available?'disabled':''}>${!i.available?'售罄':state.items.some(l=>l.itemId===i.id)?'已選 · 查看':'選擇 ＋'}</button></div>`).join('');
  const pending=state.items.filter(i=>i.status==='pending').length;
  foot=`<span>${view.busy?'侍應忙緊，請稍等':pending?`${pending} 項待確認`:'即點即製 · 慢慢揀'}</span>${button('CONFIRM_ORDER','確認落單 →',true,view.busy||!pending)}`;
 }
 const markup=`<div class="paper-head"><div><h2>${title}</h2><small>YUE KEI · SINCE 1986</small></div><button data-close aria-label="合上餐牌或帳單">✕</button></div>${tabs}<div class="paper-body" tabindex="0" aria-label="${title}內容">${body}</div><p class="paper-message" role="status" hidden></p><div class="paper-foot">${foot}</div>`;
 if(markup!==panelMarkup){
  const changedView=key!==panelKey;
  el.innerHTML=panelMarkup=markup;
  el.querySelector('.paper-body').scrollTop=panelScroll.get(key)||0;
  el.querySelectorAll('[data-food]').forEach(node=>food(node.getContext('2d'),node.dataset.food,50,55));
  if(hadFocus&&!restoreFocus(el,token)) (changedView&&editing?el.querySelector('select, input'):el.querySelector('[aria-pressed="true"]'))?.focus({preventScroll:true});
 }
 panelKey=key;
 const message=el.querySelector('.paper-message');
 updateText(message,feedback(view.notice));message.hidden=!view.notice;
 if(!previousPanel||(hadFocus&&!el.contains(document.activeElement)))el.focus({preventScroll:true});
 previousPanel=true;
}
function render({state,view}){
 voice?.sync({state,view});
 const currentFocus=document.activeElement,actionToken=focusToken(currentFocus);
 syncStage(state,view);
 cancelAnimationFrame(frame);frame=requestAnimationFrame(animate);
 const gameEl=$('#game'),roundChanged=lastRound!==state.round;
 if(roundChanged){
  editing=null;tab='food';tablePage=0;lookCamera='room';panelScroll.clear();panelKey='';panelMarkup='';
  gameEl.classList.remove('transitioning');
  lastRound=state.round;
 }
 if(['room','table'].includes(view.camera))lookCamera=view.camera;
 const outside=state.phase===P.OUTSIDE,finished=state.phase===P.FINISHED;
 $('#welcome').hidden=!outside;$('#shop-sign').hidden=!(outside||finished);$('#ending').hidden=!finished;
 const justFinished=finished&&!gameEl.classList.contains('is-finished');gameEl.classList.toggle('is-finished',finished);
 if(justFinished)$('#ending button').focus({preventScroll:true});
 if(finished)$('#summary').textContent=`你完成咗一餐 ${state.items.reduce((sum,i)=>sum+i.qty,0)} 份餐點，合共 ${money(state.bill.totalCents)}。${state.items.some(i=>i.options.serving==='外賣')?'外賣已打包取走，多謝惠顧！':''}`;
 $('#stage').textContent=stageNames[state.phase];$('#location').textContent=locationNames[view.camera];
 $('#cameras').hidden=![P.SEATED,P.ORDERING,P.DINING,P.BILLING].includes(state.phase);
 $('#cameras').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.camera===view.camera||(b.dataset.camera==='menu'&&view.camera==='bill'))));
 $('#scene-hint').textContent=view.busy?'阿明正在服務 · 請稍候':view.camera==='table'?`${state.items.filter(i=>i.status==='served').length} 項已上枱 · ${view.water?'水已加滿':'清水半杯'}${view.utensils?' · 餐具已送到':''}`:outside?'一段屬於你的香港日常':finished?'今日嘅練習完成 · 得閒再嚟':'視角可自由切換 · 訂單會一直保留';
 updateText($('#speaker-name'),view.line[0]);updateText($('#dialogue'),view.line[1]);updateText($('#jyutping'),view.line[2]);updateText($('#meaning'),view.line[3]);$('#meaning').hidden=!showMeaning;
 updateText($('#notice'),['menu','bill'].includes(view.camera)?'':feedback(view.notice));
 const actionMarkup=actions(state,view),actionEl=$('#actions'),hadActionFocus=actionEl.contains(currentFocus);
 if(actionEl.dataset.markup!==actionMarkup){actionEl.innerHTML=actionEl.dataset.markup=actionMarkup;}
 panel(state,view);
 const served=state.items.filter(i=>i.status==='served'),pages=Math.max(1,Math.ceil(served.length/6));tablePage=((tablePage%pages)+pages)%pages;
 paint(state,view);
 const inventory=$('#table-labels');
 const inventoryMarkup=view.camera==='table'?`<div class="table-inventory">${served.slice(tablePage*6,tablePage*6+6).map(i=>`<span>${esc(i.name)} · ${itemStatus(i)} · ${Object.values(i.options).map(esc).join(' / ')}</span>`).join('')}${pages>1?`<button data-table-page>桌面 ${tablePage+1}/${pages} · 下一組 →</button>`:''}</div>`:'';
 if(inventory.dataset.markup!==inventoryMarkup){
  const hadFocus=inventory.contains(document.activeElement);
  inventory.innerHTML=inventory.dataset.markup=inventoryMarkup;
  if(hadFocus)restoreFocus(inventory,actionToken);
 }
 $('#scene').setAttribute('aria-label',[locationNames[view.camera],state.waiterPresent?'侍應阿明在場':'',served.map(i=>`${i.name}${i.qty}份`).join('，'),view.water?'水已加滿':'',view.utensils?'餐具已送到':''].filter(Boolean).join('。'));
 if(lastCamera!==view.camera){
  gameEl.classList.remove('transitioning');
  if(!roundChanged){void gameEl.offsetWidth;gameEl.classList.add('transitioning');}
  lastCamera=view.camera;
 }
 if(document.activeElement===document.body){
  if(hadActionFocus&&!restoreFocus(actionEl,actionToken)) (actionEl.querySelector('button:not(:disabled)')||$('#location')).focus({preventScroll:true});
  if(currentFocus?.matches('#welcome button, #ending button')) ($('#actions button:not(:disabled)')||$('#welcome button')).focus({preventScroll:true});
 }
}
let lastPaint='',assetsSettled=false;
function paint(state,view){
 const canvas=$('#scene');
 const key=JSON.stringify([canvas.clientWidth,canvas.clientHeight,assetsSettled,view.beat,view.camera,view.water,view.utensils,state.waiterPresent,state.billPresented,state.phase,tablePage,state.items.filter(i=>i.status==='served')]);
 if(lastPaint===key)return;
 lastPaint=key;draw(canvas,state,{...view,tablePage});
}
document.addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b||b.disabled)return;
 if(b.dataset.action){game.action(b.dataset.action);return;}
 if(b.dataset.dialog){$('#'+b.dataset.dialog).showModal();return;}
 if(b.hasAttribute('data-dismiss')){b.closest('dialog').close();return;}
 if(b.dataset.chapter){b.closest('dialog').close();game.chapter(b.dataset.chapter);return;}
 if(b.hasAttribute('data-table-page')){tablePage++;render(game.snapshot());return;}
 if(b.dataset.camera){game.camera(b.dataset.camera);return;}
 if(b.hasAttribute('data-close')){closePanel();return;}
 if(b.dataset.tab){tab=b.dataset.tab;editing=null;game.notify('');return;}
 if(b.hasAttribute('data-back')){editing=null;game.notify('');return;}
 if(b.dataset.item){if(game.snapshot().view.busy){game.notify('侍應正在服務，請稍等一陣。');return;}const item=MENU.find(i=>i.id===b.dataset.item);if(!item.available){game.action('ADD_ITEM',{itemId:item.id});return;}const selected=game.snapshot().state.items.find(l=>l.itemId===item.id);if(selected?.status==='served'){game.notify(selected.options.serving==='外賣'?'呢份已經打包，唔可以再改或者重複落單。':'呢份已經上枱，唔可以再改或者重複落單。');return;}editing=selected?{lineId:selected.id}:{itemId:item.id};render(game.snapshot());return;}
 if(b.dataset.edit){const line=game.snapshot().state.items.find(i=>i.id===b.dataset.edit);if(line.status==='served'){game.notify(line.options.serving==='外賣'?'呢份已經打包，唔可以再改或者取消。':'呢份已經上枱，唔可以再改或者取消。');return;}editing={lineId:line.id};render(game.snapshot());return;}
 if(b.dataset.cancel){
  const draft=editing;editing=null;
  if(!game.action('CANCEL_ITEM',{orderItemId:b.dataset.cancel}).ok){editing=draft;render(game.snapshot());}
 }
});
function readDraft(form){
 const data=new FormData(form);
 return {qty:data.get('qty'),values:Object.fromEntries([...data].filter(([k])=>k!=='qty'))};
}
document.addEventListener('input',e=>{
 const form=e.target.closest('#item-form');
 if(!form||!editing)return;
 Object.assign(editing,readDraft(form));e.target.removeAttribute('aria-invalid');
});
document.addEventListener('submit',e=>{
 if(e.target.id!=='item-form')return;
 e.preventDefault();if(!editing)return;
 const draft=Object.assign(editing,readDraft(e.target)),qty=Number(draft.qty);
 if(qty!==1){
  game.notify('每款餐點本局限一份。');
  return;
 }
 const previousTab=tab;editing=null;tab='order';
 const r=draft.lineId?game.action('UPDATE_ITEM',{orderItemId:draft.lineId,qty,options:draft.values}):game.action('ADD_ITEM',{itemId:draft.itemId,qty,options:draft.values});
 if(!r.ok){editing=draft;tab=previousTab;render(game.snapshot());}
});
$('#translation').addEventListener('click',()=>{showMeaning=!showMeaning;$('#translation').setAttribute('aria-pressed',String(showMeaning));$('#meaning').hidden=!showMeaning;});
$('#restart').addEventListener('click',()=>{$('#settings').close();game.action('RESTART');});
$('#pronunciation').addEventListener('click',e=>{const on=e.target.getAttribute('aria-pressed')!=='true';e.target.setAttribute('aria-pressed',on);document.body.classList.toggle('show-jyutping',on);});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!document.querySelector('dialog[open]')&&!$('#panel').hidden){e.preventDefault();closePanel();}});
render(game.snapshot());ready.then(results=>{
 assetsSettled=true;render(game.snapshot());
 if(results.some(r=>r.status==='rejected'))$('#asset-status').hidden=false;
});

new ResizeObserver(()=>{const {state,view}=game.snapshot();paint(state,view);}).observe($('#game'));

function syncStage(state,view){
 const seated=[P.SEATED,P.ORDERING,P.DINING,P.BILLING].includes(state.phase);
 const down=view.camera==='table',open=['menu','bill'].includes(view.camera);
 document.body.dataset.camera=view.camera;
 document.body.classList.toggle('at-title',state.phase===P.OUTSIDE);
 const talk=view.beat?.pose==='talk'||state.phase===P.GREETING||(state.waiterPresent&&(!view.beat||view.beat.pose==='talk'||(view.beat.pose==='place'&&!['REQUEST_WATER','REQUEST_UTENSILS'].includes(view.beat.kind))));
 document.querySelector('.conversation').hidden=open||(!talk&&!view.notice);
 const hot=$('#hotspots');
 let html='';
 if(seated&&!open&&!view.busy){
  html=down?'<button class="spot menu-spot" data-camera="menu">拿起餐牌</button><button class="spot water-spot" data-action="REQUEST_WATER">唔該，加水</button><button class="look" data-camera="room">↑ 抬頭望吓</button>':'<button class="spot waiter-spot" data-action="CALL_WAITER">招呼阿明 · 唔該！</button><button class="look" data-camera="table">↓ 低頭睇枱面</button>';
  if(state.phase===P.BILLING)html=down?'<button class="spot menu-spot" data-camera="bill">拿起帳單</button><button class="look" data-camera="room">↑ 抬頭望吓</button>':'<button class="look" data-camera="bill">查看帳單</button>';
 }
 if(state.waiterPresent&&!open)html='';
 if(hot.innerHTML!==html)hot.innerHTML=html;
}
// A single render loop only while a beat is active. No business actions in frames.
function animate(){
 const {state,view}=game.snapshot();
 draw($('#scene'),state,{...view,tablePage});
 frame=requestAnimationFrame(animate);
}
window.addEventListener('pagehide',()=>cancelAnimationFrame(frame));
