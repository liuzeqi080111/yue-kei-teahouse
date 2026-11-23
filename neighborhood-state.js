import {chapterSaveKey} from './story-chapters.js';
// Versioned local world state. Dialogue never writes this state directly.
export const SAVE_KEY='mgoi-neighborhood-v1';
export const NPCS={
 qing:{name:'阿晴',role:'住在隔壁的街坊，这次面试对她很重要',sprite:1},
 fang:{name:'芳姐',role:'洗衣店老板娘，做事细致，说话直接',sprite:0},
 lok:{name:'阿乐',role:'唱片店主，热爱音乐，重视答应买家的事',sprite:2},
 ling:{name:'玲姐',role:'衣铺老板，爽快，擅长帮街坊挑衣服',sprite:3},
 lam:{name:'林伯',role:'常在榕树下摆棋的老街坊',sprite:4},
 ming:{name:'阿明',role:'茶餐厅侍应，嘴快热心，门口被挡时容易着急',sprite:5},
 guest:{name:'周叔',role:'常到粤记喝茶，也是芳姐洗衣店的熟客',sprite:6},
 buyer:{name:'小文',role:'已经约好来买唱片的客人',sprite:7}
};
export const ITEMS={ticket:'洗衣取件单',wrongCoat:'拿错的外套',coat:'阿晴的外套',loanCoat:'玲姐借出的外套',newCoat:'新外套',record:'旧唱片',contact:'旧友联系线索'};

// Original and loaned garments can be in different hands, or both in the bag.
export function coatOwners(s){
 const f=id=>s.flags.includes(id),has=id=>s.items.includes(id);
 let original=null,loan=null;
 if(has('coat'))original='player';
 else if(['returned','cooperate'].includes(s.coatOutcome)||f('original-returned'))original='aqing';
 else if(f('guest-found')&&!f('coat-swapped'))original='regular';
 if(has('loanCoat'))loan='player';
 else if(f('qing-wore-loan')&&!f('qing-loan-back')&&!f('loan-returned'))loan='aqing';
 else if(f('coat-route-borrow')||f('loan-returned'))loan='ling';
 return {original,loan};
}
export const COUNTER_GUESTS={
 southRice:{
  name:'祥伯',role:'林伯的旧友，正在东街南洋饼家买菠萝包',
  greeting:['啱啱出爐喎！我等緊榮叔幫我執兩個菠蘿包。','刚出炉呢！我在等荣叔帮我装两个菠萝包。'],
  question:'買畀邊個食呀？',reply:['一個留畀自己，一個留畀我個孫。','一个留给自己，一个留给孙子。'],
 },
 marketBack:{
  name:'芳嫂',role:'正在西街街角生果店挑橙的街坊',
  greeting:['我嚟揀幾個橙。你都嚟買生果呀？','我来挑几个橙子。你也来买水果吗？'],
  question:'你點揀橙㗎？',reply:['我鍾意揀墜手嗰啲，拎返去同屋企人分嚟食。','我喜欢挑拿着沉手的，带回家和家里人分着吃。'],
 },
};
export function freshWorld(){return {version:1,revision:0,position:{x:1110,y:1220},location:'home',day:1,period:1,money:30000,items:[],flags:[],notes:[],met:[],history:{},restaurant:null,dining:null,paidMeals:[],coatOutcome:null,recordOutcome:null,stallOutcome:null};}
const copy=x=>JSON.parse(JSON.stringify(x));
const FORBIDDEN_KEYS=new Set(['__proto__','constructor','prototype']);
const WORLD_KEYS=['version','revision','position','location','day','period','money','items','flags','notes','met','history','restaurant','dining','paidMeals','coatOutcome','recordOutcome','stallOutcome','streetView','trackedQuest'];
const LOCATIONS=new Set(['street','home','laundry','restaurant']);
function isPlainObject(value){return value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));}
// 递归校验 JSON 值：每层对象必须是普通对象；拒绝禁用键、非有限数字、
// undefined/function/symbol/bigint 与循环引用。任何一步失败都抛错。
function assertJsonValue(value,seen=new Set()){
 if(value===null)return;
 const type=typeof value;
 if(type==='string'||type==='boolean')return;
 if(type==='number'){if(!Number.isFinite(value))throw Error('存档包含非有限数字');return;}
 if(type!=='object')throw Error('存档包含不允许的值类型');
 if(seen.has(value))throw Error('存档包含循环引用');
 seen.add(value);
 if(Array.isArray(value)){for(const item of value)assertJsonValue(item,seen);}
 else{
  if(!isPlainObject(value))throw Error('存档包含非普通对象');
  for(const key of Object.keys(value)){
   if(FORBIDDEN_KEYS.has(key))throw Error('存档包含不允许的键：'+key);
   assertJsonValue(value[key],seen);
  }
 }
 seen.delete(value);
}
// 严格校验整份世界存档：版本、数组、有限整数、位置与嵌套普通对象。
// 绝不静默修补：越界与失真一律拒绝，由调用方诚实提示。
function validateWorld(s){
 if(!isPlainObject(s))throw Error('存档格式不完整');
 assertJsonValue(s);
 if(s.version!==1)throw Error(Number.isFinite(s.version)&&s.version>1?'存档来自更新版本，请更新后再读取。':'存档格式不完整');
 if(!Number.isSafeInteger(s.money)||s.money<0||s.money>10000000)throw Error('存档金额无效');
 if(!Number.isInteger(s.period)||s.period<0||s.period>2)throw Error('存档时段无效');
 if(!Number.isInteger(s.day)||s.day<1||s.day>100000)throw Error('存档日期无效');
 if(!Number.isSafeInteger(s.revision)||s.revision<0)throw Error('存档修订号无效');
 if(typeof s.location!=='string'||!LOCATIONS.has(s.location))throw Error('存档地点无效');
 if(s.trackedQuest!==undefined&&!['coat','table','reunion','record','stall'].includes(s.trackedQuest))throw Error('追踪任务无效');
 for(const key of ['items','flags','notes','met','paidMeals'])if(!Array.isArray(s[key])||s[key].length>1000||s[key].some(v=>typeof v!=='string'))throw Error('存档内容无效');
 if(s.items.some(i=>!Object.prototype.hasOwnProperty.call(ITEMS,i)))throw Error('存档物品无效');
 if(!isPlainObject(s.position)||!Number.isFinite(s.position.x)||!Number.isFinite(s.position.y))throw Error('存档位置无效');
 if(s.position.x<0||s.position.x>1536||s.position.y<0||s.position.y>1536)throw Error('存档位置越界');
 if(s.streetView!==undefined){
  const v=s.streetView;
  if(!isPlainObject(v)||!['x','z','heading','pitch'].every(key=>Number.isFinite(v[key]))||
     Math.abs(v.x)>60||Math.abs(v.z)>60||v.pitch< -1.05||v.pitch>1.14)throw Error('第一人称游玩位置无效');
 }
 if(!isPlainObject(s.history))throw Error('历史记录必须是普通对象');
 if(s.restaurant!==null&&s.restaurant!==undefined&&!isPlainObject(s.restaurant))throw Error('餐厅进度必须是普通对象或空');
 if(s.dining!==null&&s.dining!==undefined&&!isPlainObject(s.dining))throw Error('用餐进度必须是普通对象或空');
 for(const key of ['coatOutcome','recordOutcome','stallOutcome'])if(s[key]!==null&&s[key]!==undefined&&typeof s[key]!=='string')throw Error('存档结局标记无效');
}
export function parseSave(raw){
 const s=JSON.parse(raw);validateWorld(s);
 const out=freshWorld();
 for(const key of WORLD_KEYS)if(s[key]!==undefined)out[key]=s[key];
 if(['record','stall'].includes(out.trackedQuest))out.trackedQuest=out.flags.includes('coat-epilogue')?'table':'coat';
 out.history=s.history;
 out.position={x:s.position.x,y:s.position.y};
 return out;
}
export function loadWorld(storage){
 let raw=null;
 try{raw=storage.getItem(SAVE_KEY);}catch{return {state:freshWorld(),exists:false,error:'无法访问浏览器存储，已保留原数据。可以重新开始，或稍后重试。'};}
 if(raw===null||raw===undefined)return {state:freshWorld(),exists:false,error:''};
 try{return {state:parseSave(raw),exists:true,error:''};}
 // 坏存档（含空字符串）保留具体错误原因，只提示、不写入、不覆盖原损坏数据。
 catch(err){const reason=err&&err.message?err.message:'原存档无法读取';return {state:freshWorld(),exists:false,error:reason+' 原数据已保留未被覆盖，可以重新开始，或稍后重试。'};}
}
export function saveWorld(storage,state){
 let raw='';
 try{validateWorld(state);raw=JSON.stringify(state);}catch{return {ok:false,error:'进度状态无效，本次未保存。'};}
 try{storage.setItem(SAVE_KEY,raw);return {ok:true};}
 catch{return {ok:false,error:'进度未保存：浏览器存储不可用，请暂时不要关闭页面。'};}
}
// 街区和从任务菜单进入的两个故事共用一次重新开始。
export function resetWorld(storage){
 try{
  for(const key of [chapterSaveKey('table'),chapterSaveKey('reunion'),SAVE_KEY])storage.removeItem(key);
  return {ok:true};
 }
 catch{return {ok:false,error:'无法清除本游戏存档：浏览器存储不可用。'};}
}
export function optionsFor(s,npc){
 // 阿晴赴面试离场期间不能对话：没有任何选项。
 if(npc==='qing'&&s.coatOutcome&&!s.flags.includes('qing-returned'))return [];
 const firstPerson=Boolean(s.streetView);
 const f=k=>s.flags.includes(k),has=k=>s.items.includes(k),out=[];
 const add=(id,label,text,meaning,effect=()=>{})=>out.push({id,label,text,meaning,effect});
 const flag=(d,k)=>{if(!d.flags.includes(k))d.flags.push(k);};
 const note=(d,k)=>{if(!d.notes.includes(k))d.notes.push(k);};
 const give=(d,k)=>{if(!d.items.includes(k))d.items.push(k);};
 const take=(d,k)=>{d.items=d.items.filter(v=>v!==k);};
 const coatEnd=(d,kind)=>{d.coatOutcome=kind;flag(d,'interview-left');d.period=(d.period+1)%3;if(d.period===0)d.day++;note(d,'阿晴已穿着外套去面试。回住处时可以再问问她。');};
  if(npc==='qing'){
   if(!f('coat-start'))add('coat-start','发生什么事了？',firstPerson?'我聽日見工，陪我去芳姐度攞件褸，好唔好？':'我一陣要去見工，攞返嚟件褸唔係我嗰件。',firstPerson?'我明天面试，陪我去芳姐那里取外套好吗？':'我一会儿要去面试，拿回来的外套不是我的。',d=>{flag(d,'coat-start');give(d,'ticket');if(firstPerson){flag(d,'coat-pickup-visit');note(d,'阿晴把取件单交给你，请你陪她取面试外套。');}else{give(d,'wrongCoat');note(d,'阿晴把取件单和拿错的外套交给了你。');}});
   else{
    // 特征线索：只要还没问过就可以问；离场期间由外层提前返回屏蔽。
    if(f('coat-pickup-visit')&&f('shop-check')&&!f('coat-inspected'))add('coat-inspect','让阿晴看看刚取的外套','咦？我件褸右邊袖口補過㗎，呢件冇。芳姐，呢件唔係我嘅喎。','咦？我的右袖口补过，这件没有。芳姐，这件不是我的。',d=>{flag(d,'coat-inspected');flag(d,'coat-detail');note(d,'阿晴检查刚取的外套，发现右袖口没有她的补痕。');});
    if(!f('coat-pickup-visit')&&!f('coat-detail'))add('coat-detail','你的外套有什么特征？','右邊袖口補過一小塊，內袋有我個名。','右边袖口补过一小块，内袋有我的名字。',d=>{flag(d,'coat-detail');note(d,'外套特征：右袖补痕、内袋名字。');});
    if(!s.coatOutcome){
     if(firstPerson&&f('coat-quoted')&&f('coat-route-buy')&&!f('qing-paid-coat')&&!has('loanCoat')&&!has('newCoat')){
      add('coat-buy','听阿晴确认价格并付款 · 她付 HK$80',
       '八十蚊啱啦，我自己畀。唔該晒你陪我嚟試。','八十元可以，我自己付。谢谢你陪我来试衣。',
       d=>{flag(d,'qing-paid-coat');note(d,'阿晴试穿后自己支付了 HK$80，新外套由她自己拿着。原衣仍待找回。');});
     }
     if(has('coat'))add('coat-return','把外套亲手交给阿晴（推进一个时段）','就係呢件！多謝你，我而家出發喇。','就是这件！谢谢你，我现在出发了。',d=>{take(d,'coat');note(d,'阿晴接过你递来的外套，认出了右袖口的补痕。');coatEnd(d,'returned');});
     if(has('loanCoat')||has('newCoat')||firstPerson&&f('qing-paid-coat'))add('coat-emergency',firstPerson&&f('qing-paid-coat')?'阿晴穿新衣去面试（推进一个时段）':'先穿这件去面试，原衣服稍后找（推进一个时段）','啱身呀，咁我先去見工，返嚟再處理。','合身，那我先去面试，回来再处理。原衣服仍可继续找。此选择推进一个时段。',d=>{if(d.items.includes('loanCoat')){take(d,'loanCoat');flag(d,'qing-wore-loan');}else take(d,'newCoat');if(firstPerson)flag(d,'coat-misunderstanding');coatEnd(d,'emergency');});
     if(f('shop-contact')&&has('wrongCoat'))add('coat-cooperate','芳姐会换回衣服，你过去核对后出发（推进一个时段）','好，我同芳姐一齊核對，唔再鬧交喇。','好，我和芳姐一起核对，不再争吵了。此选择推进一个时段。',d=>{take(d,'wrongCoat');coatEnd(d,'cooperate');});
    }else{
     if(has('coat')&&f('qing-returned')&&!f('original-returned'))add('coat-return-original','把找回的原衣交给阿晴','原來搵返咗，真係唔該晒你。','原来找回来了，真的太谢谢你了。',d=>{take(d,'coat');flag(d,'original-returned');note(d,'阿晴收回了原衣，应急经历已记下。');});
     if(f('qing-wore-loan')&&f('qing-returned')&&!has('loanCoat')&&!f('qing-loan-back'))add('coat-collect-loan','取回阿晴借用的外套','件褸還返畀你，唔該你幫手借。','外套还给你，谢谢你帮忙借。',d=>{give(d,'loanCoat');flag(d,'qing-loan-back');note(d,'阿晴把借来的外套还给了你。');});
     if(f('qing-returned')){
      const stillUpset=firstPerson&&f('coat-misunderstanding');
      add('coat-followup','面试怎么样？',
       stillUpset?'見完喇，仲等緊消息。洗衣嗰件事未傾清楚，我呢排唔想去嗰間舖。':'見咗面喇，結果仲要等。嗰日真係多謝你幫手。',
       stillUpset?'面试完了，还在等消息。洗衣的事还没说清，我最近不想去那家店。':'见过面了，结果还要等。那天谢谢你帮忙。',
       d=>{flag(d,'coat-epilogue');note(d,'阿晴感谢你帮她处理外套，面试结果仍在等待。');});
     }
    }
   }
  }
 if(npc==='fang'){
  add('laundry-chat','这里平时忙吗？','放工前最多人攞衫，記得帶單呀。','下班前取衣的人最多，记得带单。');
  if(has('ticket')&&!f('shop-check'))add('shop-check',firstPerson?'凭单取外套':'出示取件单，核对外套',f('coat-pickup-visit')?'張單啱喇。阿晴，你件褸，睇吓先。':'兩件深色褸好似。周生啱啱攞走一件，佢成日去粵記。',f('coat-pickup-visit')?'单号对了。阿晴，你的外套，看看吧。':'两件深色外套很像。周先生刚拿走一件，他常去粤记。',d=>{flag(d,'shop-check');if(firstPerson){take(d,'ticket');flag(d,'ticket-filed');give(d,'wrongCoat');}note(d,f('coat-pickup-visit')?'芳姐凭单交出一件深色外套。':'芳姐核对记录：另一位取衣客人是常去粤记的周叔。');});
  if(firstPerson&&f('shop-check')&&(!f('coat-pickup-visit')||f('coat-inspected'))&&!s.coatOutcome&&!s.flags.some(k=>k.startsWith('coat-route-'))){
   const plans=[
    ['recover','去粤记找周先生','周生頭先都攞咗件深色褸。去粵記問阿明，佢認得周生。','去粤记问阿明，他认得周叔。'],
    ['borrow','先向玲姐借一件','可以去衫舖問玲姐借件褸，記住要還。','可以去衣铺问玲姐借件外套，记得归还。'],
    ['buy','先陪阿晴去买一件','可以陪阿晴去問價。件舊褸仲要查清楚。','可以陪阿晴去问价。原衣的误会还有待解决。'],
   ];
   for(const [id,label,text,meaning] of plans)add('coat-route-'+id,label,text,meaning,d=>{flag(d,'coat-route-'+id);note(d,label+'。');});
  }
  if(f('shop-check')&&(!f('coat-pickup-visit')||f('coat-inspected'))&&!f('shop-contact')&&!s.coatOutcome)add('shop-contact','请联系周叔，一起核对解决','我打畀佢，請佢帶件褸返嚟，大家核對清楚。','我联系他，请他带外套回来，大家核对。',d=>{flag(d,'shop-contact');note(d,'芳姐已联系周叔，可以请阿晴来共同核对。');});
  if(s.coatOutcome){
   if(firstPerson&&f('coat-misunderstanding')){
    add('laundry-after','问起那件拿错的外套','你哋搵到見工衫就好。我呢邊，仲未知道件原本嘅褸去咗邊。','你们有面试用的外套就好。我这边还不知道原衣去了哪里。');
    if(f('original-returned'))add('laundry-reconcile','向芳姐说明交换经过，转达歉意',
     '原來係調轉咗。多謝你返嚟講清楚，下次我哋一齊對名。','原来是拿反了。谢谢你回来说明，下次我们一起核对名字。',
     d=>{d.flags=d.flags.filter(k=>k!=='coat-misunderstanding');flag(d,'laundry-reconciled');note(d,'芳姐知道了经过，原衣已归还，双方的误会说清了。');});
   }else add('laundry-after','外套的事处理好了','下次我會再核對清楚。多謝你肯聽兩邊講。','下次我会再核对清楚，谢谢你肯听双方说。');
  }
 }
  if(npc==='ming'){
   if(f('coat-start')&&(!f('coat-pickup-visit')||f('coat-inspected'))&&!f('guest-found'))add('guest-found','有没有客人说衣服不合身？',
    firstPerson?'周叔話件褸有啲窄。佢就喺門口左手邊，行過去問吓佢。':'周叔話件褸有啲窄，佢出去坐陣，你去長櫈嗰邊睇吓。',
    firstPerson?'周叔说外套偏紧。他就在粤记门口另一侧，可以当面问。':'周叔说外套有点紧，出去坐了，你到长椅那边看看。',
    d=>{flag(d,'guest-found');note(d,firstPerson?'阿明说周叔就在粤记门口另一侧。':'阿明说周叔在街边长椅附近。');});
   add('ming-chat','今天店里忙吗？','晏晝過咗最忙嗰陣，依家有位坐。','午市最忙的时候过了，现在有位子。');
  }
 if(npc==='guest'){
  if((has('ticket')||f('ticket-filed'))&&f('shop-check')&&f('coat-detail')&&has('wrongCoat')&&!has('coat')&&(!firstPerson||f('guest-found'))){
   add('coat-swap',firstPerson?'核对袖口，把拿错的外套递给周叔，接回阿晴那件':'出示取件单和特征，当面交换外套','個名對得上，袖口都係。原來真係攞錯咗。','名字和袖口都对得上，原来真的拿错了。',d=>{take(d,'wrongCoat');give(d,'coat');flag(d,'coat-swapped');note(d,'周叔收回了自己的外套，把阿晴的外套交到你手上。');});
  }else if(!f('coat-swapped'))add('guest-chat','你也拿错了外套吗？','件褸有啲窄，但我唔可以隨便交畀陌生人。','外套有点紧，但我不能随便交给陌生人。');
 }
 if(npc==='ling'){
   const canBorrowAgain=!f('loan-returned')||!f('qing-wore-loan')&&!f('coat-swapped');
   if(f('coat-start')&&!s.coatOutcome&&!has('loanCoat')&&!has('newCoat')&&canBorrowAgain&&!f('qing-paid-coat')){
   add('coat-loan','邻居急着面试，可以借件外套吗？','借畀佢應急先，見完工記得帶返嚟。','先借给她应急，面试后记得还。',d=>{d.flags=d.flags.filter(x=>x!=='loan-returned');give(d,'loanCoat');flag(d,'loan-due');note(d,'向玲姐借了外套，答应面试后归还。');});
   if(firstPerson&&f('shop-check')&&f('coat-route-buy')&&!f('coat-quoted')){
    add('coat-quote','替阿晴问这件外套的价格','呢件八十蚊，阿晴你試吓先。','这件八十元。阿晴，你先试一下。',d=>{flag(d,'coat-quoted');note(d,'玲姐报价 HK$80，由阿晴试穿后决定是否自己付款。');});
   }
   if(!firstPerson&&s.money>=8000)add('coat-buy','买一件应急外套 · HK$80','呢件八十蚊，試啱就攞去啦。','这件八十元，合适就拿去。',d=>{d.money-=8000;give(d,'newCoat');});
  }
    if(has('loanCoat')&&!f('loan-returned')&&(f('coat-swapped')&&!f('qing-wore-loan')||f('qing-loan-back')))add('loan-returned','归还玲姐借出的外套','有借有還，下次有事再搵我。','有借有还，下次有事再找我。',d=>{take(d,'loanCoat');flag(d,'loan-returned');note(d,'已把借用的外套还给玲姐。');});
  add('ling-chat','最近店里什么衣服好卖？','呢排朝早有啲涼，薄外套最好賣。','这阵子早上凉，薄外套最好卖。');
 }
 if(npc==='lam')add('lam-chat','林伯，平时几时来下棋？','我食完晏就落嚟，呢度有樹蔭，坐得舒服。','我吃过午饭就下来，这儿有树荫，坐得舒服。');
 if(npc==='lok')add('lok-chat','今天在放哪种音乐？','今日開咗隻粵曲碟，你聽吓段過門。','今天放的是粤曲，你听听这段过门。');
 if(npc==='buyer')add('buyer-chat','你喜欢这张唱片吗？','係呀，我約咗阿樂留畀我。','对，我约了阿乐留给我。');
 return out;
}
export function applyWorldAction(state,npc,id){
 // 离场的阿晴不能对话：诚实拒绝且不改变状态。
 if(npc==='qing'&&state.coatOutcome&&!state.flags.includes('qing-returned'))return {ok:false,state,message:'阿晴已经去面试了，等她回来再说。'};
 const option=optionsFor(state,npc).find(o=>o.id===id);if(!option)return {ok:false,state,message:'情况已经变化，请重新确认。'};const next=copy(state);option.effect(next);if(!next.met.includes(npc))next.met.push(npc);next.revision++;return {ok:true,state:next,text:option.text,meaning:option.meaning};}
export function advanceTime(s){const n=copy(s);n.period=(n.period+1)%3;if(n.period===0)n.day++;n.revision++;return n;}
// 明确的休息/等待事件：推进一个时段，并让赴面试的阿晴返回。纯状态推导，不依赖墙钟或计时器。
export function restEvent(s){
 const n=advanceTime(s);
 if(n.coatOutcome&&!n.flags.includes('qing-returned')){
  n.flags.push('qing-returned');
  if(!n.notes.includes('阿晴面试回来了。'))n.notes.push('阿晴面试回来了。');
 }
 return n;
}
// 供 UI 查询的阿晴状态：在场 / 赴面试 / 已返回，以及她身上的穿着。穿着以实际持有推导：借衣取回、原衣归还后不再显示。
export function qingStatus(s){
 if(!s.coatOutcome)return {presence:'home',wearing:null};
 let wearing=null;
 if(s.coatOutcome==='returned')wearing='原衣';
 else if(s.coatOutcome==='emergency'){
  if(s.flags.includes('original-returned'))wearing='原衣';
  else if(s.flags.includes('qing-wore-loan'))wearing=s.flags.includes('qing-loan-back')?null:'借来的外套';
  else wearing='新外套';
 }else if(s.coatOutcome==='cooperate')wearing='核对换回的外套';
 if(!s.flags.includes('qing-returned'))return {presence:'interview',wearing};
 return {presence:'returned',wearing};
}
// 衣架作为店面陈列，门口留给行人通行。
export function rackStatus(){
 return {placement:'compact',blocked:false,description:'衣架收在店边，门口通道畅通。'};
}
const NPC_PROFILES={
 qing:{background:'住在安和楼，平时把面试穿的外套送去芳姐的洗衣店。'},
 lam:{background:'街坊，午饭后爱在榕树下捉棋。'},
 lok:{background:'唱片店主，受托出售朋友的旧唱片。'},
 buyer:{background:'唱片店熟客，阿乐答应把旧唱片留给他。'},
 ming:{background:'茶餐厅伙计，在意门口通道安全。'},
  ling:{background:'衣铺老板，熟悉街坊的穿衣习惯。'},
 guest:{background:'洗衣店客人，常去粤记。'},
 fang:{background:'洗衣店店主，正在核对取件记录。'}
};
// 有限人物知识：只含本人背景、本人已知线索、当前关系/约定与此刻合法动作。
// 不返回整份世界、完整历史或他人秘密；玩家知道的不等于该 NPC 知道；仅在真实交谈/转告后更新。
export function npcContext(s,npc){
 if(!Object.prototype.hasOwnProperty.call(NPC_PROFILES,npc))return null;
 const f=k=>s.flags.includes(k),has=k=>s.items.includes(k);
 const known=[],relations=[];
 if(npc==='qing'){
  known.push('自己的外套右袖口补过一小块、内袋有自己的名字。');
  if(!s.coatOutcome&&s.streetView){
   if(!f('coat-start'))known.push('她明天面试，想请玩家陪她去洗衣店取外套。');
   else if(!f('shop-check'))relations.push('玩家已答应陪她取面试外套，取件单已交给玩家。');
   else if(f('coat-inspected'))relations.push('她在柜台看过刚取的外套，认出那件没有自己的右袖补痕，仍等着拿回原衣。');
  }
  if(s.coatOutcome==='returned')relations.push('玩家找回了原衣，她已穿着去面试。');
  else if(s.coatOutcome==='cooperate')relations.push('她按芳姐联系的方案去核对换衣并赴面试。');
  else if(s.coatOutcome==='emergency'){
   if(s.flags.includes('original-returned'))relations.push('她穿着应急安排的外套去面试；玩家后来把原衣交给了她。');
   else if(f('qing-wore-loan'))relations.push(f('qing-loan-back')?'她曾借穿玲姐的外套去面试，已经把借衣交回玩家手中，还没收到自己的原衣。':'她穿着玲姐借出的外套去面试，还没收到自己的原衣。');
   else relations.push('她穿着新买的外套去面试，还没收到自己的原衣。');
  }
  if(f('qing-loan-back'))relations.push('借来的外套已还给玩家。');
  if(f('original-returned')&&s.coatOutcome!=='emergency')relations.push('玩家后来把原衣交给了她。');
 }else if(npc==='lok'||npc==='buyer'){
  known.push('阿乐答应把一张唱片留给小文。');
 }else if(npc==='ling'){
  if(f('loan-due')&&!f('loan-returned'))relations.push('她借出了外套，约定面试后归还。');
  if(f('loan-returned'))relations.push('借出的外套已收回。');
 }else if(npc==='guest'){
  if(f('coat-swapped'))relations.push('他与玩家核对过内袋的名字和右袖口补痕，已换回自己的衣服，并亲手把阿晴的原外套交给玩家。');
  else known.push('从芳姐的洗衣店取回的外套穿着有点紧，他怀疑拿错了。');
 }else if(npc==='fang'){
  if(f('shop-check'))known.push('她核对过取件单：周先生刚拿走一件相似外套。');
  if(f('shop-contact'))relations.push('她已联系周叔共同核对。');
  if(f('coat-misunderstanding'))relations.push('阿晴另找了面试用衣，芳姐仍未听到完整经过。');
  if(f('laundry-reconciled'))relations.push('玩家说明了经过并转达歉意，误会说清了。');
 }
 return {npc,background:NPC_PROFILES[npc].background,knownClues:known,relations,legalActions:optionsFor(s,npc).map(o=>({id:o.id,label:o.label}))};
}
