// Versioned local world state. Dialogue never writes this state directly.
export const SAVE_KEY='mgoi-neighborhood-v1';
export const NPCS={
 qing:{name:'阿晴',role:'住在隔壁，今天准备去面试',sprite:1},
 fang:{name:'芳姐',role:'洗衣店老板娘，做事细致，说话直接',sprite:0},
 lok:{name:'阿乐',role:'唱片摊主，热爱音乐，重视答应买家的事',sprite:2},
 ling:{name:'玲姐',role:'衣物摊主，爽快，但担心挪摊后没生意',sprite:3},
 lam:{name:'林伯',role:'常来坐坐的老街坊，想联系失联的老朋友',sprite:4},
 ming:{name:'阿明',role:'茶餐厅侍应，嘴快热心，门口被挡时容易着急',sprite:5},
 guest:{name:'周叔',role:'茶餐厅熟客，刚取了件穿着偏紧的外套',sprite:6},
 buyer:{name:'小文',role:'已经约好来买唱片的客人',sprite:7}
};
export const ITEMS={ticket:'洗衣取件单',wrongCoat:'拿错的外套',coat:'阿晴的外套',loanCoat:'借来的外套',newCoat:'新外套',record:'旧唱片',contact:'旧友联系线索'};
export function freshWorld(){return {version:1,revision:0,position:{x:1110,y:1220},location:'home',day:1,period:1,money:30000,items:[],flags:[],notes:[],met:[],history:{},restaurant:null,dining:null,paidMeals:[],coatOutcome:null,recordOutcome:null,stallOutcome:null};}
const copy=x=>JSON.parse(JSON.stringify(x));
const FORBIDDEN_KEYS=new Set(['__proto__','constructor','prototype']);
const WORLD_KEYS=['version','revision','position','location','day','period','money','items','flags','notes','met','history','restaurant','dining','paidMeals','coatOutcome','recordOutcome','stallOutcome','streetView'];
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
// 只清除本游戏的世界存档键；设置与学习记录等其他键保持不动。
export function resetWorld(storage){
 try{storage.removeItem(SAVE_KEY);return {ok:true};}
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
   if(!f('coat-start'))add('coat-start','发生什么事了？','我一陣要去見工，攞返嚟件褸唔係我嗰件。','我一会儿要去面试，拿回来的外套不是我的。',d=>{flag(d,'coat-start');give(d,'ticket');give(d,'wrongCoat');note(d,'阿晴把取件单和拿错的外套交给了你。');});
   else{
    // 特征线索：只要还没问过就可以问；离场期间由外层提前返回屏蔽。
    if(!f('coat-detail'))add('coat-detail','你的外套有什么特征？','右邊袖口補過一小塊，內袋有我個名。','右边袖口补过一小块，内袋有我的名字。',d=>{flag(d,'coat-detail');note(d,'外套特征：右袖补痕、内袋名字。');});
    if(!s.coatOutcome){
     if(has('coat'))add('coat-return','把找回的外套交给阿晴，让她去面试（推进一个时段）','就係呢件！多謝你，我而家出發喇。','就是这件！谢谢你，我现在出发了。此选择推进一个时段。',d=>{take(d,'coat');coatEnd(d,'returned');});
     if(has('loanCoat')||has('newCoat'))add('coat-emergency','先穿这件去面试，原衣服稍后找（推进一个时段）','啱身呀，咁我先去見工，返嚟再處理。','合身，那我先去面试，回来再处理。原衣服仍可继续找。此选择推进一个时段。',d=>{if(d.items.includes('loanCoat')){take(d,'loanCoat');flag(d,'qing-wore-loan');}else take(d,'newCoat');coatEnd(d,'emergency');});
     if(f('shop-contact')&&has('wrongCoat'))add('coat-cooperate','芳姐会换回衣服，你过去核对后出发（推进一个时段）','好，我同芳姐一齊核對，唔再鬧交喇。','好，我和芳姐一起核对，不再争吵了。此选择推进一个时段。',d=>{take(d,'wrongCoat');coatEnd(d,'cooperate');});
    }else{
     if(has('coat')&&f('qing-returned')&&!f('original-returned'))add('coat-return-original','把找回的原衣交给阿晴','原來搵返咗，真係唔該晒你。','原来找回来了，真的太谢谢你了。',d=>{take(d,'coat');flag(d,'original-returned');note(d,'阿晴收回了原衣，应急经历已记下。');});
     if(f('qing-wore-loan')&&f('qing-returned')&&!has('loanCoat')&&!f('qing-loan-back'))add('coat-collect-loan','取回阿晴借用的外套','件褸還返畀你，唔該你幫手借。','外套还给你，谢谢你帮忙借。',d=>{give(d,'loanCoat');flag(d,'qing-loan-back');note(d,'阿晴把借来的外套还给了你。');});
     if(f('qing-returned'))add('coat-followup','面试怎么样？','見咗面喇，結果仲要等。嗰日真係多謝你幫手。','见过面了，结果还要等。那天谢谢你帮忙。',d=>note(d,'阿晴感谢你帮她处理外套，面试结果仍在等待。'));
    }
   }
  }
 if(npc==='fang'){
  add('laundry-chat','这里平时忙吗？','放工前最多人攞衫，記得帶單呀。','下班前取衣的人最多，记得带单。');
  if(has('ticket')&&!f('shop-check'))add('shop-check',firstPerson?'亲手递上取件单':'出示取件单，核对外套','兩件深色褸好似。周生啱啱攞走一件，佢成日去粵記。','两件深色外套很像。周先生刚拿走一件，他常去粤记。',d=>{flag(d,'shop-check');if(firstPerson){take(d,'ticket');flag(d,'ticket-filed');}note(d,'芳姐核对记录：另一位取衣客人是常去粤记的周叔。');});
  if(firstPerson&&f('shop-check')&&!s.coatOutcome&&!s.flags.some(k=>k.startsWith('coat-route-'))){
   const plans=[
    ['recover','先找回原来的外套','去粵記問阿明，佢認得周生。','去粤记问阿明，他认得周叔。'],
    ['borrow','先向玲姐借一件','可以去衣檔問玲姐借件褸，記住要還。','可以去衣摊问玲姐借件外套，记得归还。'],
    ['buy','先陪阿晴去买一件','可以陪阿晴去問價。件舊褸仲要查清楚。','可以陪阿晴去问价。原衣的误会还有待解决。'],
   ];
   for(const [id,label,text,meaning] of plans)add('coat-route-'+id,label,text,meaning,d=>{flag(d,'coat-route-'+id);note(d,label+'。');});
  }
  if(f('shop-check')&&!f('shop-contact')&&!s.coatOutcome)add('shop-contact','请联系周叔，一起核对解决','我打畀佢，請佢帶件褸返嚟，大家核對清楚。','我联系他，请他带外套回来，大家核对。',d=>{flag(d,'shop-contact');note(d,'芳姐已联系周叔，可以请阿晴来共同核对。');});
  if(s.coatOutcome)add('laundry-after','外套的事处理好了','下次我會再核對清楚。多謝你肯聽兩邊講。','下次我会再核对清楚，谢谢你肯听双方说。');
 }
  if(npc==='ming'){
   if(f('coat-start')&&!f('guest-found'))add('guest-found','有没有客人说衣服不合身？','周叔話件褸有啲窄，佢出去坐陣，你去長櫈嗰邊睇吓。','周叔说外套有点紧，出去坐了，你到长椅那边看看。',d=>{flag(d,'guest-found');note(d,'阿明说周叔在街边长椅附近。');});
   if(!f('stall-ming'))add('stall-ming','门口怎么回事？','個衫架擋住出入，捧住熱嘢都唔知點行。','衣架挡住出入，端着热东西都不知道怎么走。',d=>{flag(d,'stall-ming');note(d,'阿明在意通道安全，希望门口留出空间。');});
   if(!s.stallOutcome)add('stall-observe','观察一下门口通道','衫架佔咗大半條路，捧住熱嘢真係難行。','衣架占了大半条路，端着热食确实难走。',d=>{flag(d,'stall-observed');note(d,'通道被衣架占去大半，端热食经过危险。');});
   const proposal=f('stall-propose-compact')?'compact':f('stall-propose-move')?'move':f('stall-propose-hours')?'hours':null;
    if(proposal&&!s.stallOutcome)add('stall-agree','向阿明转达玲姐的方案，请他同意','得，咁樣行得通，通道留返出嚟。','行，这样行得通，通道留出来了。我已向阿明转达方案，他同意了。',d=>{flag(d,'stall-ming-agreed');note(d,'已向阿明转达玲姐的方案，他同意了；还要回玲姐那边落实。');});
   else if(f('stall-ming'))add('ming-after','最近门口好走吗？',s.stallOutcome?'依家行得順好多，唔使再嗌交。':'你都見到，捧住嘢真係難行。',s.stallOutcome?'现在好走多了，不必再争吵。':'你也看到了，端着东西确实难走。');
  }
 if(npc==='guest'){
  add('guest-chat','你也拿错了外套吗？','件褸有啲窄，但我唔可以隨便交畀陌生人。','外套有点紧，但我不能随便交给陌生人。');
    if((has('ticket')||f('ticket-filed'))&&f('shop-check')&&f('coat-detail')&&has('wrongCoat')&&!has('coat'))add('coat-swap','出示取件单和特征，当面交换外套','個名對得上，袖口都係。原來真係攞錯咗。','名字和袖口都对得上，原来真的拿错了。',d=>{take(d,'wrongCoat');give(d,'coat');flag(d,'coat-swapped');note(d,'已与周叔核对并换回阿晴的外套。');});
 }
 if(npc==='ling'){
   if(f('coat-start')&&!s.coatOutcome&&!has('loanCoat')&&!has('newCoat')&&!f('loan-returned')){
   add('coat-loan','邻居急着面试，可以借件外套吗？','借畀佢應急先，見完工記得帶返嚟。','先借给她应急，面试后记得还。',d=>{give(d,'loanCoat');flag(d,'loan-due');note(d,'向玲姐借了外套，答应面试后归还。');});
   if(s.money>=8000)add('coat-buy','买一件应急外套 · HK$80','呢件八十蚊，試啱就攞去啦。','这件八十元，合适就拿去。',d=>{d.money-=8000;give(d,'newCoat');});
  }
    if(has('loanCoat')&&!f('loan-returned'))add('loan-returned','归还玲姐借出的外套','有借有還，下次有事再搵我。','有借有还，下次有事再找我。',d=>{take(d,'loanCoat');flag(d,'loan-returned');note(d,'已把借用的外套还给玲姐。');});
  if(!f('stall-ling'))add('stall-ling','为什么把衣架放这里？','縮入去冇人睇到，但我都唔想阻住人。','缩进去没人看见，但我也不想挡路。',d=>{flag(d,'stall-ling');note(d,'玲姐担心挪摊后没人看见，也愿意讨论办法。');});
    if(f('stall-ming')&&f('stall-ling')&&f('stall-observed')&&!s.stallOutcome)for(const [id,label,text] of [['compact','缩小陈列，留出通道','我收起外面個架，留條路畀大家。'],['move','把衣架移到摊位侧边','咁我移去側邊，招牌留喺前面。'],['hours','约定饭点收起衣架','食飯最忙嗰陣我收起，大家就唔使爭。']])add('stall-propose-'+id,label,text,'好，就照这个方式调整；还要问过阿明先算数。',d=>{d.flags=d.flags.filter(x=>!x.startsWith('stall-propose-')&&x!=='stall-ming-agreed');flag(d,'stall-propose-'+id);note(d,'已与玲姐商定方案（'+label+'），还需阿明同意并由玩家回玲姐处落实。');});
   if(f('stall-ming-agreed')&&!s.stallOutcome){const plan=f('stall-propose-compact')?'compact':f('stall-propose-move')?'move':'hours';add('stall-finalize','告诉玲姐：阿明同意了，按方案落实','阿明都同意？咁我依家調整，通道留返出嚟。','阿明也同意？那我现在调整，通道留出来了。',d=>{d.stallOutcome=plan;note(d,'已向玲姐转达阿明的同意，门口通道方案落实。');});}
   if(s.stallOutcome)add('stall-after','门口现在好走吗？','依家睇得見檔口，路又留返出嚟。','现在看得见摊位，路也留出来了。');
 }
 if(npc==='lam'){
  if(!f('record-start'))add('record-start','在看什么？','阿樂有隻舊唱片，好似係我老朋友嗰隻。好多年冇見佢喇。','阿乐有张旧唱片，好像是我老朋友的，好多年没见了。',d=>{flag(d,'record-start');note(d,'林伯认出旧唱片，想知道是否与失联旧友有关。');});
   if(has('contact')&&!s.recordOutcome)add('record-contact','把旧友的联系线索告诉林伯','原來佢仲記得我。我會先問聲佢想唔想見面。','原来他还记得我，我会先问他是否愿意见面。',d=>{d.recordOutcome='contact';note(d,'林伯获得了旧友的联系线索，准备先征询重逢意愿。');});
  if(has('record')&&has('contact')&&s.recordOutcome!=='gift')add('record-gift','把唱片交给林伯','連隻唱片都帶返嚟，多謝你。最緊要係搵得返個朋友。','连唱片都带来了，谢谢你，最重要是能联系到朋友。',d=>{take(d,'record');d.recordOutcome='gift';note(d,'林伯收下唱片，并准备联系旧友。');});
  if(s.recordOutcome)add('record-after','后来联系上了吗？','我留咗口訊畀佢，等佢方便先覆。','我给他留了口信，等他方便时回复。');
 }
 if(npc==='lok'){
  add('record-chat','有什么唱片推荐？','你鍾意聽邊類？慢慢睇，唔買都可以傾吓。','你喜欢听哪种？慢慢看，不买也可以聊。');
   if(!f('sleeve-read'))add('sleeve-read','可以看看封套上的留言吗？','可以，呢度寫住畀阿林。貨係朋友託我幫手賣嘅。','可以，这里写着“给阿林”，是朋友托我出售的。',d=>{flag(d,'sleeve-read');note(d,'封套留言“给阿林”；阿乐受朋友委托出售，已答应留给小文。');});
    if(f('record-start')&&f('sleeve-read')&&!f('record-relayed'))add('record-source','替林伯问问旧友愿不愿意联系','好，我幫你問吓佢；佢同意我再畀聯絡方法你轉交。','好，我帮你问他；他同意后，再把联系线索交你转达。',d=>{flag(d,'record-relayed');note(d,'已请阿乐转达联系请求，等旧友答复。');});
   if(f('record-relayed')&&!has('contact'))add('record-reply','旧友有回信了吗？','佢話記得阿林，同意畀聯絡方法。你交畀佢，等佢自己聯絡。','他记得阿林，同意给联系方式。你交给林伯，让他自己联系。',d=>{give(d,'contact');flag(d,'record-reply-received');note(d,'旧友已同意联系；线索交给了玩家，等林伯自己联络。');});
   if(f('buyer-consent')&&!f('consent-relayed'))add('consent-relay','告诉阿乐：小文同意让出唱片','小文肯讓？咁你照價俾佢，隻碟你攞去。','小文肯让？那你照价给他，唱片你拿走。',d=>{flag(d,'consent-relayed');note(d,'已转告阿乐：小文同意让出唱片。');});
   if(f('consent-relayed')&&!f('record-purchased')&&!has('record')&&s.recordOutcome!=='gift'&&s.money>=6000)add('record-buy','按约购买旧唱片 · HK$60','小文肯讓，六十蚊，幫我好好保存佢。','小文愿意让，六十元，请好好保存。',d=>{d.money-=6000;give(d,'record');flag(d,'record-purchased');});
 }
 if(npc==='buyer'){
  add('buyer-chat','你喜欢这张唱片吗？','係呀，我約咗阿樂留畀我。','对，我约了阿乐留给我。');
   if(f('record-start')&&f('sleeve-read')&&!f('buyer-consent'))add('buyer-consent','解释林伯的故事，商量让出唱片','原來有呢段故事。咁讓畀佢，我再揀另一隻。','原来有这段故事，那让给他，我再挑另一张。',d=>{flag(d,'buyer-consent');note(d,'小文同意让出预订唱片。仍可选择保留原交易，只转达联系。');});
 }
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
// 门口衣架状态：供地图读取的纯数据（placement/blocked/描述），不改动任何绘制或样式。
const MEAL_PERIODS=[2,0];
export function rackStatus(s){
 if(!s.stallOutcome)return {placement:'as-is',blocked:true,description:'衣架仍占着通道，端热食经过危险。'};
 if(s.stallOutcome==='compact')return {placement:'compact',blocked:false,description:'陈列已缩小，通道留出来了。'};
 if(s.stallOutcome==='move')return {placement:'move',blocked:false,description:'衣架移到摊位侧边，招牌仍在前面。'};
 const meal=MEAL_PERIODS.includes(s.period);
 return {placement:'hours',blocked:!meal,description:meal?'饭点时段，玲姐按约定收起衣架，通道畅通。':'非饭点时段，衣架照常摆出，通道收窄。'};
}
const NPC_PROFILES={
 qing:{background:'街坊，正准备去面试。'},
 lam:{background:'茶客，认出一张与失联旧友有关的旧唱片。'},
 lok:{background:'唱片摊主，受托出售朋友的旧唱片。'},
 buyer:{background:'唱片摊熟客，阿乐答应把旧唱片留给他。'},
 ming:{background:'茶餐厅伙计，在意门口通道安全。'},
  ling:{background:'衣物摊主，担心挪开衣架影响生意。'},
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
  if(s.coatOutcome==='returned')relations.push('玩家找回了原衣，她已穿着去面试。');
  else if(s.coatOutcome==='cooperate')relations.push('她按芳姐联系的方案去核对换衣并赴面试。');
  else if(s.coatOutcome==='emergency'){
   if(s.flags.includes('original-returned'))relations.push('她穿着应急安排的外套去面试；玩家后来把原衣交给了她。');
   else if(s.flags.includes('qing-wore-loan'))relations.push(s.flags.includes('qing-loan-back')?'她曾借穿玲姐的外套去面试，借衣已还给玩家，原衣仍未找回。':'她穿着向玲姐借的外套去面试，原衣仍未找回。');
   else relations.push('她穿着新买的外套去面试，原衣仍未找回。');
  }
  if(f('qing-loan-back'))relations.push('借来的外套已还给玩家。');
  if(f('original-returned')&&s.coatOutcome!=='emergency')relations.push('玩家后来把原衣交给了她。');
 }else if(npc==='lam'){
  if(f('record-start'))known.push('他告诉过玩家：旧唱片可能与失联旧友有关。');
  if(s.recordOutcome==='contact')relations.push('玩家转交了旧友的联系线索；他准备先问对方是否愿意见面，尚未重逢。');
  if(s.recordOutcome==='gift')relations.push('玩家把旧唱片送给了他；他仍要亲自联系对方。');
 }else if(npc==='lok'){
  known.push('受托出售旧唱片，唱片已答应留给小文。');
  if(f('sleeve-read'))known.push('封套上写着“给阿林”。');
  if(f('record-relayed')&&!f('record-reply-received'))relations.push('已替玩家转达联系请求，还在等旧友答复。');
  if(f('record-reply-received'))relations.push('旧友已同意联系，线索交给了玩家。');
  if(f('consent-relayed'))relations.push('玩家转告：小文听过林伯的故事后同意让出唱片。');
 }else if(npc==='buyer'){
  known.push('阿乐答应把一张旧唱片留给他。');
  if(f('buyer-consent'))relations.push('他听过林伯的故事，同意让出唱片。');
 }else if(npc==='ming'){
  if(f('stall-ming'))known.push('他向玩家抱怨过门口通道被衣架挡住。');
  if(f('stall-observed'))relations.push('他和玩家一起看过通道。');
  if(f('stall-ming-agreed')&&!s.stallOutcome)relations.push('他同意了玩家转达的通道方案，等回玲姐落实。');
  if(s.stallOutcome)relations.push('通道问题已按双方同意的方案解决。');
 }else if(npc==='ling'){
  if(f('stall-ling'))known.push('她担心挪开衣架后没人看见摊位。');
  if(f('loan-due')&&!f('loan-returned'))relations.push('她借出了外套，约定面试后归还。');
  if(f('loan-returned'))relations.push('借出的外套已收回。');
  if((f('stall-propose-compact')||f('stall-propose-move')||f('stall-propose-hours'))&&!s.stallOutcome)relations.push('她与玩家商定了通道方案，还没落实。');
  if(s.stallOutcome)relations.push('通道方案已落实。');
 }else if(npc==='guest'){
  known.push('他觉得外套有点紧，怀疑拿错了。');
  if(f('coat-swapped'))relations.push('他与玩家核对单据和特征，确认并换回了各自的外套。');
 }else if(npc==='fang'){
  if(f('shop-check'))known.push('她核对过取件单：周先生刚拿走一件相似外套。');
  if(f('shop-contact'))relations.push('她已联系周叔共同核对。');
 }
 return {npc,background:NPC_PROFILES[npc].background,knownClues:known,relations,legalActions:optionsFor(s,npc).map(o=>({id:o.id,label:o.label}))};
}
