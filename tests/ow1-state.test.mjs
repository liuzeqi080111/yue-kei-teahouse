import assert from 'node:assert/strict';
import {
 SAVE_KEY,freshWorld,parseSave,loadWorld,saveWorld,resetWorld,
 optionsFor,applyWorldAction,restEvent,qingStatus
} from '../neighborhood-state.js';

function createStorage(seed={}){
 const data=new Map(Object.entries(seed));
 return {
  getItem:key=>data.has(key)?data.get(key):null,
  setItem:(key,value)=>{data.set(key,String(value));},
  removeItem:key=>{data.delete(key);},
  _data:data
 };
}
const freshWith=patch=>({...freshWorld(),...patch});

// 正常往返：完整字段写入后可原样读回。
{
 const storage=createStorage();
 const world=freshWith({position:{x:500,y:600},location:'street',day:3,period:2,money:12345,items:['ticket','wrongCoat'],flags:['coat-start'],notes:['n1'],met:['qing'],history:{visits:2},revision:7});
 const saved=saveWorld(storage,world);
 assert.equal(saved.ok,true,'valid world saves');
 const loaded=loadWorld(storage);
 assert.equal(loaded.exists,true);
 assert.equal(loaded.error,'');
 assert.deepEqual(loaded.state,world,'round trip preserves every field');
}
{
 const storage=createStorage();
 assert.deepEqual(loadWorld(storage),{state:freshWorld(),exists:false,error:''},'missing save starts fresh without error');
}

// revision 必须是安全整数：1e30 既不保存也不读取。
{
 const storage=createStorage();
 const bad=freshWith({revision:1e30});
 const saved=saveWorld(storage,bad);
 assert.equal(saved.ok,false,'revision=1e30 is rejected on save');
 assert.equal(storage.getItem(SAVE_KEY),null,'rejected save writes nothing');
 assert.throws(()=>parseSave(JSON.stringify(bad)),/修订号/,'revision=1e30 is rejected on parse');
}

// history 失真反例：非有限数字、非普通对象、undefined/function、循环引用。
for(const [label,history] of [
 ['Infinity',{n:Infinity}],
 ['-Infinity',{n:-Infinity}],
 ['NaN',{n:NaN}],
 ['Date',{date:new Date()}],
 ['Map',new Map([['a',1]])],
 ['undefined value',{note:undefined}],
 ['function value',{cb:()=>{}}],
]){
 const storage=createStorage();
 const bad=freshWith({history});
 const saved=saveWorld(storage,bad);
 assert.equal(saved.ok,false,`history with ${label} is rejected on save`);
 assert.equal(storage.getItem(SAVE_KEY),null,`history with ${label} writes nothing`);
}
{
 const storage=createStorage();
 const bad=freshWorld();
 bad.history.self=bad; // 循环引用
 const saved=saveWorld(storage,bad);
 assert.equal(saved.ok,false,'circular reference is rejected on save');
 assert.equal(storage.getItem(SAVE_KEY),null,'circular reference writes nothing');
}

// 未来版本与缺失版本一律拒绝，且绝不覆盖存储里的原数据。
{
 const storage=createStorage();
 const future=JSON.stringify(freshWith({version:2}));
 assert.throws(()=>parseSave(future),/更新版本/,'future version is rejected');
 const seeded=createStorage({[SAVE_KEY]:future});
 const loaded=loadWorld(seeded);
 assert.equal(loaded.exists,false);
 assert.ok(loaded.error.includes('更新版本'),'future version reports honestly');
 assert.equal(seeded.getItem(SAVE_KEY),future,'future version data left untouched');
}

// 空字符串是损坏存档，不是“无存档”；原数据保留。
{
 const storage=createStorage({[SAVE_KEY]:''});
 const loaded=loadWorld(storage);
 assert.equal(loaded.exists,false);
 assert.ok(loaded.error.length>0,'empty string reports corruption');
 assert.equal(storage.getItem(SAVE_KEY),'','empty string save is not overwritten');
}
// 坏 JSON 同样只提示、不覆盖。
{
 const storage=createStorage({[SAVE_KEY]:'{oops'});
 const loaded=loadWorld(storage);
 assert.equal(loaded.exists,false);
 assert.ok(loaded.error.length>0);
 assert.equal(storage.getItem(SAVE_KEY),'{oops','corrupted json left untouched');
}

// 非法数组：非字符串元素、未知物品、原型键名、超长数组。
for(const [label,patch] of [
 ['non-string item',{items:[42]}],
 ['unknown item',{items:['katana']}],
 ['inherited key name',{items:['constructor']}],
 ['oversized flags',{flags:new Array(1001).fill('x')}],
 ['object in notes',{notes:[{}]}],
]){
 assert.throws(()=>parseSave(JSON.stringify(freshWith(patch))),/.*/,`illegal array (${label}) rejected`);
}

// position 越界与失真：拒绝，绝不默默夹取。
for(const [label,position] of [
 ['x too large',{x:2000,y:1220}],
 ['x negative',{x:-5,y:1220}],
 ['y too large',{x:1110,y:1537}],
 ['NaN',{x:NaN,y:1220}],
]){
 const storage=createStorage();
 const bad=freshWith({position});
 const saved=saveWorld(storage,bad);
 assert.equal(saved.ok,false,`position ${label} rejected on save`);
 assert.throws(()=>parseSave(JSON.stringify(bad)),/.*/,`position ${label} rejected on parse`);
}

// 嵌套禁用键：用 JSON.parse 构造真实自有键（对象字面量 __proto__ 不会成为自有键）。
{
 const base='"version":1,"revision":0,"position":{"x":1,"y":1},"location":"home","day":1,"period":1,"money":0,"items":[],"flags":[],"notes":[],"met":[],"paidMeals":[]';
 const withProto=JSON.parse(`{${base},"history":{"__proto__":{"polluted":true}}}`);
 assert.ok(Object.prototype.hasOwnProperty.call(withProto.history,'__proto__'),'payload really carries an own __proto__ key');
 assert.throws(()=>parseSave(JSON.stringify(withProto)),/不允许的键/,'nested own __proto__ key rejected');
 const withCtor=JSON.parse(`{${base},"history":{"nested":{"constructor":1}}}`);
 assert.throws(()=>parseSave(JSON.stringify(withCtor)),/不允许的键/,'nested constructor key rejected');
}
// 嵌套 Infinity：JSON.stringify 会把 Infinity 变 null，因此直接测 saveWorld 路径。
{
 const storage=createStorage();
 const saved=saveWorld(storage,freshWith({restaurant:{state:{balance:Infinity}}}));
 assert.equal(saved.ok,false,'nested Infinity rejected on save');
 assert.equal(storage.getItem(SAVE_KEY),null,'nested Infinity writes nothing');
}
// 嵌套结构形状回归：history 必须是普通对象；restaurant/dining 只能是 null 或普通对象。
for(const [label,patch] of [
 ['history array',{history:[]}],
 ['history null',{history:null}],
 ['restaurant number',{restaurant:42}],
 ['restaurant string',{restaurant:'bad'}],
 ['dining string',{dining:'bad'}],
]){
 assert.throws(()=>parseSave(JSON.stringify(freshWith(patch))),/.*/,`nested shape (${label}) rejected on parse`);
 const storage=createStorage();
 const saved=saveWorld(storage,freshWith(patch));
 assert.equal(saved.ok,false,`nested shape (${label}) rejected on save`);
 assert.equal(storage.getItem(SAVE_KEY),null,`nested shape (${label}) writes nothing`);
}

// 存储抛错：load/save/reset 都诚实返回失败。
{
 const denying={getItem(){throw Error('denied')},setItem(){throw Error('denied')},removeItem(){throw Error('denied')}};
 const loaded=loadWorld(denying);
 assert.equal(loaded.exists,false);
 assert.ok(loaded.error.length>0,'storage throw on load reported');
 const saved=saveWorld(denying,freshWorld());
 assert.equal(saved.ok,false,'storage throw on save reported');
 assert.ok(saved.error.length>0);
 const removed=resetWorld(denying);
 assert.equal(removed.ok,false,'storage throw on reset reported');
}

// 重新开始会清除故事进度，保留其他设置和学习记录。
{
 const storage=createStorage({'yue-kei-weather':'dusk','review-rounds':'[]'});
 assert.equal(saveWorld(storage,freshWorld()).ok,true);
 assert.equal(resetWorld(storage).ok,true);
 assert.equal(storage.getItem(SAVE_KEY),null,'world save removed');
 assert.equal(storage.getItem('yue-kei-weather'),'dusk','weather setting kept');
 assert.equal(storage.getItem('review-rounds'),'[]','learning records kept');
}

// ===== 外套故事纯规则（coat-step.md） =====
const ids=(s,npc)=>optionsFor(s,npc).map(o=>o.id);
const has=(s,item)=>s.items.includes(item);
{
 // 原衣正常路径 + 先问芳姐再问特征（乱序）+ 无特征泄漏 + 直接索取失败。
 let r=applyWorldAction(freshWorld(),'qing','coat-start');
 assert.equal(r.ok,true,'coat-start ok');
 assert.ok(has(r.state,'ticket')&&has(r.state,'wrongCoat'),'ticket and wrong coat received');
 assert.ok(!r.state.notes.some(n=>n.includes('袖口')),'features not leaked before asking');
 r=applyWorldAction(r.state,'fang','shop-check');
 assert.equal(r.ok,true,'fang record check first in any order');
 const denied=applyWorldAction(r.state,'guest','coat-swap');
 assert.equal(denied.ok,false,'demanding the coat without checks fails');
 assert.deepEqual(denied.state,r.state,'failed demand changes nothing');
 assert.ok(!ids(r.state,'guest').includes('coat-swap'),'swap not offered before features confirmed');
 r=applyWorldAction(r.state,'qing','coat-detail');
 assert.equal(r.ok,true,'feature question ok');
 assert.ok(r.state.notes.includes('外套特征：右袖补痕、内袋名字。'),'feature note only after asking');
 r=applyWorldAction(r.state,'guest','coat-swap');
 assert.equal(r.ok,true,'swap ok after ticket+record+features');
 assert.ok(has(r.state,'coat')&&!has(r.state,'wrongCoat'),'exactly one swap');
 const swapped=r.state;
 const dupSwap=applyWorldAction(swapped,'guest','coat-swap');
 assert.equal(dupSwap.ok,false,'repeat swap fails');
 assert.deepEqual(dupSwap.state,swapped,'repeat swap changes nothing');
 const before={period:swapped.period,day:swapped.day};
 r=applyWorldAction(swapped,'qing','coat-return');
 assert.equal(r.ok,true,'return original coat ok');
 assert.equal(r.state.coatOutcome,'returned');
 assert.equal(r.state.period,(before.period+1)%3,'delivery advances exactly one period');
 if((before.period+1)%3===0)assert.equal(r.state.day,before.day+1,'day rolls over');
 assert.equal(qingStatus(r.state).presence,'interview','qing is away at interview');
 assert.ok(!ids(r.state,'qing').includes('coat-followup'),'no result question while away');
 const early=applyWorldAction(r.state,'qing','coat-followup');
 assert.equal(early.ok,false,'asking result right away fails');
 assert.deepEqual(early.state,r.state,'early followup changes nothing');
 const back=restEvent(r.state);
 assert.ok(back.flags.includes('qing-returned'),'explicit wait event brings qing back');
 assert.equal(qingStatus(back).presence,'returned');
 assert.ok(ids(back,'qing').includes('coat-followup'),'followup available after return');
}
{
 // 买应急：只扣一次 HK$80，重复购买失败且状态不变；买衣无归还义务。
 const s=applyWorldAction(freshWorld(),'qing','coat-start').state;
 const money=s.money;
 const bought=applyWorldAction(s,'ling','coat-buy');
 assert.equal(bought.ok,true,'buy ok');
 assert.equal(bought.state.money,money-8000,'exactly HK$80 deducted once');
 assert.ok(has(bought.state,'newCoat'),'new coat in bag');
 const dupBuy=applyWorldAction(bought.state,'ling','coat-buy');
 assert.equal(dupBuy.ok,false,'repeat buy fails');
 assert.deepEqual(dupBuy.state,bought.state,'repeat buy changes nothing');
 const before=bought.state.period;
 const r=applyWorldAction(bought.state,'qing','coat-emergency');
 assert.equal(r.ok,true,'emergency with bought coat');
 assert.equal(r.state.coatOutcome,'emergency');
 assert.equal(r.state.period,(before+1)%3,'emergency advances one period');
 assert.equal(qingStatus(r.state).wearing,'新外套','wearing info: new coat');
 assert.ok(!ids(r.state,'ling').includes('loan-returned'),'bought coat has no return duty');
}
{
 // 借衣完整链：借→交阿晴赴面试→等待返回→取回借衣→还玲姐；每步重复失败均不变。
 let s=applyWorldAction(freshWorld(),'qing','coat-start').state;
 assert.ok(!ids(s,'ling').includes('loan-returned'),'cannot return before borrowing');
 s=applyWorldAction(s,'ling','coat-loan').state;
 assert.ok(has(s,'loanCoat'),'borrowed coat in bag');
 const noCoat=applyWorldAction(s,'qing','coat-return');
 assert.equal(noCoat.ok,false,'delivering without original coat fails');
 assert.deepEqual(noCoat.state,s,'illegal delivery changes nothing');
 s=applyWorldAction(s,'qing','coat-emergency').state;
 assert.equal(qingStatus(s).wearing,'借来的外套','wearing info: loaned coat');
 assert.ok(!has(s,'loanCoat')&&s.flags.includes('qing-wore-loan'),'loan coat went to qing');
 assert.ok(!ids(s,'ling').includes('loan-returned'),'cannot return while coat is with qing');
 const back=restEvent(s);
 let r=applyWorldAction(back,'qing','coat-collect-loan');
 assert.equal(r.ok,true,'collect loan coat on return');
 assert.ok(has(r.state,'loanCoat'),'loan coat back in bag');
 const dupCollect=applyWorldAction(r.state,'qing','coat-collect-loan');
 assert.equal(dupCollect.ok,false,'repeat collect fails');
 assert.deepEqual(dupCollect.state,r.state,'repeat collect changes nothing');
 assert.equal(qingStatus(r.state).wearing,null,'wearing cleared once loan coat is back in bag');
 r=applyWorldAction(r.state,'ling','loan-returned');
 assert.equal(r.ok,true,'return to ling');
 assert.ok(!has(r.state,'loanCoat')&&r.state.flags.includes('loan-returned'),'loan coat returned once');
 assert.equal(qingStatus(r.state).wearing,null,'wearing stays cleared after returning to ling');
 assert.ok(!ids(r.state,'ling').includes('coat-loan'),'no re-borrow after loan returned');
 const dupReturn=applyWorldAction(r.state,'ling','loan-returned');
 assert.equal(dupReturn.ok,false,'repeat return fails');
 assert.deepEqual(dupReturn.state,r.state,'repeat return changes nothing');
}
{
 // 合作路径：查单→联系→核对并交还错误外套；联系不凭一句话、无物件不能完成。
 let s=applyWorldAction(freshWorld(),'qing','coat-start').state;
 s=applyWorldAction(s,'fang','shop-check').state;
 s=applyWorldAction(s,'fang','shop-contact').state;
 const before=s.period;
 const r=applyWorldAction(s,'qing','coat-cooperate');
 assert.equal(r.ok,true,'cooperate ok');
 assert.equal(r.state.coatOutcome,'cooperate');
 assert.ok(!has(r.state,'wrongCoat'),'wrong coat handed over for the joint swap');
 assert.equal(r.state.period,(before+1)%3,'cooperate advances one period');
 assert.ok(r.state.flags.includes('interview-left'),'interview event recorded');
 const dup=applyWorldAction(r.state,'qing','coat-cooperate');
 assert.equal(dup.ok,false,'repeat cooperate fails');
 assert.deepEqual(dup.state,r.state,'repeat cooperate changes nothing');
}
{
 // 应急不锁死原衣（离开前已问特征）：应急后仍可核实交换；等她回来再交还；不重复推进时间、不覆盖应急经历。
 let s=applyWorldAction(freshWorld(),'qing','coat-start').state;
 s=applyWorldAction(s,'qing','coat-detail').state;
 s=applyWorldAction(s,'ling','coat-loan').state;
 const emergency=applyWorldAction(s,'qing','coat-emergency').state;
 assert.equal(emergency.coatOutcome,'emergency');
 const periodAfterEmergency=emergency.period;
 s=applyWorldAction(emergency,'fang','shop-check').state;
 s=applyWorldAction(s,'guest','coat-swap').state;
 assert.ok(has(s,'coat'),'original coat still recoverable after emergency');
 assert.ok(!ids(s,'qing').includes('coat-return-original'),'cannot hand original back while she is away');
 const back=restEvent(s);
 const r=applyWorldAction(back,'qing','coat-return-original');
 assert.equal(r.ok,true,'hand original back after return');
 assert.ok(!has(r.state,'coat'),'original coat delivered');
 assert.equal(r.state.coatOutcome,'emergency','emergency outcome not overwritten');
 assert.equal(qingStatus(r.state).wearing,'原衣','wearing info: original coat after handover');
 assert.equal(r.state.period,back.period,'handover does not advance time again');
 assert.equal(r.state.period,(periodAfterEmergency+1)%3,'only emergency plus one wait advanced time');
}
{
 // 应急后还没问特征：离场期间不能对话，等阿晴返回后再问，仍可换回。
 let s=applyWorldAction(freshWorld(),'qing','coat-start').state;
 s=applyWorldAction(s,'ling','coat-loan').state;
 s=applyWorldAction(s,'qing','coat-emergency').state;
 const awayAsk=applyWorldAction(s,'qing','coat-detail');
 assert.equal(awayAsk.ok,false,'cannot talk to qing while she is away');
 assert.ok(awayAsk.message.includes('面试'),'away refusal explains why');
 assert.deepEqual(awayAsk.state,s,'away refusal changes nothing');
 assert.deepEqual(ids(s,'qing'),[],'no options while qing is away');
 const back=restEvent(s);
 let r=applyWorldAction(back,'qing','coat-detail');
 assert.equal(r.ok,true,'feature question ok after return');
 assert.ok(r.state.notes.includes('外套特征：右袖补痕、内袋名字。'),'feature note after asking post-return');
 r=applyWorldAction(r.state,'fang','shop-check');
 assert.equal(r.ok,true,'record check still possible');
 r=applyWorldAction(r.state,'guest','coat-swap');
 assert.equal(r.ok,true,'swap ok with features confirmed after return');
 assert.ok(has(r.state,'coat'),'original coat recovered');
}
{
 // 先借衣后来找回原衣：未使用的借衣可直接还玲姐，归还后不能反复借刷物件。
 let s=applyWorldAction(freshWorld(),'qing','coat-start').state;
 s=applyWorldAction(s,'ling','coat-loan').state;
 s=applyWorldAction(s,'fang','shop-check').state;
 s=applyWorldAction(s,'qing','coat-detail').state;
 s=applyWorldAction(s,'guest','coat-swap').state;
 assert.ok(has(s,'coat'),'original coat recovered without using loan');
 assert.ok(ids(s,'ling').includes('loan-returned'),'unused loan coat can be returned');
 const r=applyWorldAction(s,'ling','loan-returned');
 assert.equal(r.ok,true,'return unused loan ok');
 assert.ok(!has(r.state,'loanCoat')&&r.state.flags.includes('loan-returned'),'unused loan returned once');
 assert.ok(!ids(r.state,'ling').includes('coat-loan'),'no re-borrow after return');
 const dup=applyWorldAction(r.state,'ling','loan-returned');
 assert.equal(dup.ok,false,'repeat return fails');
 assert.deepEqual(dup.state,r.state,'repeat return changes nothing');
}
{
 // 三个赴面试选项的 label 必须事先标明推进一个时段，不能只写执行后 meaning。
 let s=applyWorldAction(freshWorld(),'qing','coat-start').state;
 s=applyWorldAction(s,'fang','shop-check').state;
 s=applyWorldAction(s,'qing','coat-detail').state;
 s=applyWorldAction(s,'guest','coat-swap').state;
 const ret=optionsFor(s,'qing').find(o=>o.id==='coat-return');
 assert.ok(ret&&ret.label.includes('推进一个时段'),'coat-return label announces time advance');
 let t=applyWorldAction(freshWorld(),'qing','coat-start').state;
 t=applyWorldAction(t,'ling','coat-loan').state;
 const em=optionsFor(t,'qing').find(o=>o.id==='coat-emergency');
 assert.ok(em&&em.label.includes('推进一个时段'),'coat-emergency label announces time advance');
 let u=applyWorldAction(freshWorld(),'qing','coat-start').state;
 u=applyWorldAction(u,'fang','shop-check').state;
 u=applyWorldAction(u,'fang','shop-contact').state;
 const co=optionsFor(u,'qing').find(o=>o.id==='coat-cooperate');
 assert.ok(co&&co.label.includes('推进一个时段'),'coat-cooperate label announces time advance');
}

console.log('PASS OW1 state: strict save/load validation, honest errors, no overwrite, story reset, coat rules');
