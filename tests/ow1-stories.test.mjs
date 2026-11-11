import assert from 'node:assert/strict';
// OW1-03 返工后：唱片、摊位与人物有限知识纯规则测试（只写不执行；用 node tests/ow1-stories.test.mjs 运行）。
import {
 freshWorld,optionsFor,applyWorldAction,restEvent,npcContext,rackStatus
} from '../neighborhood-state.js';

const ids=(s,npc)=>optionsFor(s,npc).map(o=>o.id);
const has=(s,item)=>s.items.includes(item);
const tryDo=(s,npc,id)=>applyWorldAction(s,npc,id);
// 预期成功的每一步都必须断言 ok，不允许无条件取 .state 掩盖失败。
const must=(s,npc,id)=>{
 const r=applyWorldAction(s,npc,id);
 assert.equal(r.ok,true,npc+'/'+id+' 应当成功');
 return r.state;
};

// 唱片：先逛摊再听林伯（顺序不限），但转达与商量都须先听过林伯；回信分阶段取得，不买也能完成联系。
{
 let s=freshWorld();
 assert.ok(ids(s,'lok').includes('sleeve-read'),'sleeve readable before hearing lam (browse first)');
 s=must(s,'lok','sleeve-read');
 // 规则1：只读封套、未听林伯讲，不能替他联系。
 let r=tryDo(s,'lok','record-source');
 assert.equal(r.ok,false,'cannot relay before hearing lam story');
 assert.deepEqual(r.state,s,'failed relay changes nothing');
 s=must(s,'lam','record-start');
 s=must(s,'lok','record-source');
 assert.ok(!has(s,'contact'),'no contact before friend agrees');
 assert.ok(!s.flags.includes('record-reply-received'),'consent not written as already granted');
 r=tryDo(s,'lam','record-contact');
 assert.equal(r.ok,false,'cannot relay contact before reply');
 assert.deepEqual(r.state,s,'premature contact relay changes nothing');
 s=must(s,'lok','record-reply');
 assert.ok(has(s,'contact'),'contact only after reply');
 s=must(s,'lam','record-contact');
 assert.equal(s.recordOutcome,'contact','contact branch done without any purchase');
 assert.ok(JSON.stringify(npcContext(s,'lam')).includes('尚未重逢'),'lam response reflects actual result, no fabricated reunion');
 assert.ok(!JSON.stringify(npcContext(s,'buyer')).includes('阿林'),'buyer knows nothing about lam story');
}
{
 // 顺序反过来：先听林伯再逛摊，同样成立（先逛后听已在上块覆盖）。
 let s=freshWorld();
 s=must(s,'lam','record-start');
 assert.ok(ids(s,'lok').includes('sleeve-read'),'sleeve available after hearing story too');
 s=must(s,'lok','sleeve-read');
 s=must(s,'lok','record-source');
 s=must(s,'lok','record-reply');
 s=must(s,'lam','record-contact');
 assert.equal(s.recordOutcome,'contact','order reversed still completes contact');
}

// 唱片购买：须小文同意且玩家已转告阿乐；未授权/未转告/余额不足不可买；成交只扣一次；已购/已赠不可再买。
{
 // 规则1反例：独立世界，只读封套、未听林伯讲，不能找小文商量。
 const u=must(freshWorld(),'lok','sleeve-read');
 let r=tryDo(u,'buyer','buyer-consent');
 assert.equal(r.ok,false,'cannot ask buyer consent before hearing lam story');
 assert.deepEqual(r.state,u,'consent without story changes nothing');
 // 正常路径：先听林伯再读封套。
 let s=freshWorld();
 s=must(s,'lam','record-start');
 s=must(s,'lok','sleeve-read');
 assert.ok(!ids(s,'lok').includes('record-buy'),'no purchase without buyer consent');
 r=tryDo(s,'lok','record-buy');
 assert.equal(r.ok,false,'unauthorized purchase fails');
 assert.deepEqual(r.state,s,'unauthorized purchase changes nothing');
 // 先取得 contact：转达请求→旧友回信，gift 须同时持有 record 与 contact。
 s=must(s,'lok','record-source');
 s=must(s,'lok','record-reply');
 assert.ok(has(s,'contact'),'contact obtained via staged reply');
 s=must(s,'buyer','buyer-consent');
 // 规则2：同意但未转告，阿乐不知道，也不可购买。
  assert.ok(!JSON.stringify(npcContext(s,'lok').relations).includes('同意让出唱片'),'lok unaware before player relays consent');
 assert.ok(!ids(s,'lok').includes('record-buy'),'no purchase before consent relayed');
 r=tryDo(s,'lok','record-buy');
 assert.equal(r.ok,false,'purchase blocked before relay');
 assert.deepEqual(r.state,s,'purchase before relay changes nothing');
 // 规则6：转告后余额不足，购买失败且状态不变。
 s=must(s,'lok','consent-relay');
 const poor={...s,money:5000};
 assert.ok(!ids(poor,'lok').includes('record-buy'),'insufficient balance blocks purchase');
 r=tryDo(poor,'lok','record-buy');
 assert.equal(r.ok,false,'purchase with HK$50 fails');
 assert.deepEqual(r.state,poor,'failed poor purchase changes nothing');
 const money=s.money;
 s=must(s,'lok','record-buy');
 assert.equal(s.money,money-6000,'exactly HK$60 deducted once');
 assert.ok(has(s,'record'),'record in bag');
 assert.ok(!JSON.stringify(npcContext(s,'buyer')).includes('成交'),'buyer not auto-informed of deal');
 r=tryDo(s,'lok','record-buy');
 assert.equal(r.ok,false,'repeat purchase fails');
 assert.deepEqual(r.state,s,'repeat purchase changes nothing');
 s=must(s,'lam','record-gift');
 assert.equal(s.recordOutcome,'gift','gift recorded');
 assert.ok(!ids(s,'lok').includes('record-buy'),'no repurchase option after gift');
 r=tryDo(s,'lok','record-buy');
 assert.equal(r.ok,false,'buy after gift fails');
 assert.deepEqual(r.state,s,'buy after gift changes nothing');
}

// 摊位：听双方+观察→玲姐拟议→玩家向阿明转达并征得同意→回玲姐落实；最终转达前通道保持旧状态。
{
 let s=freshWorld();
 s=must(s,'ling','stall-ling');
 assert.ok(!ids(s,'ling').some(i=>i.startsWith('stall-propose')),'no proposal after hearing one side only');
 s=must(s,'ming','stall-ming');
 assert.ok(!ids(s,'ling').some(i=>i.startsWith('stall-propose')),'observation action still required');
 s=must(s,'ming','stall-observe');
 s=must(s,'ling','stall-propose-hours');
 assert.equal(s.stallOutcome,null,'proposal alone does not implement anything');
 // 规则3：拟议后、玩家转达前，阿明不应知道方案；通道保持旧状态。
 assert.ok(!JSON.stringify(npcContext(s,'ming').relations).includes('方案'),'ming unaware before player relays plan');
 assert.equal(rackStatus(s).placement,'as-is','passage unchanged before finalize');
 assert.equal(rackStatus(s).blocked,true,'passage still blocked before finalize');
 s=must(s,'ming','stall-agree');
 assert.equal(s.stallOutcome,null,'ming agreement alone does not implement anything');
 assert.equal(rackStatus(s).placement,'as-is','passage unchanged before relay back to ling');
 assert.ok(JSON.stringify(npcContext(s,'ming')).includes('同意'),'ming knows after player relays plan');
 assert.ok(JSON.stringify(npcContext(s,'ling')).includes('还没落实'),'ling context pending before finalize');
 assert.ok(!JSON.stringify(npcContext(s,'ling')).includes('已落实'),'ling context not done before finalize');
 s=must(s,'ling','stall-finalize');
 assert.equal(s.stallOutcome,'hours','implemented only after relay back to ling');
 assert.equal(rackStatus(s).placement,'hours','rack placement changes only after finalize');
 assert.ok(!JSON.stringify(npcContext(s,'ling')).includes('还没落实'),'ling context not contradictory after finalize');
 assert.ok(JSON.stringify(npcContext(s,'ling')).includes('已落实'),'ling context done after finalize');
 const beforeBlocked=rackStatus(s).blocked;
 const after=restEvent(s);
 assert.notEqual(rackStatus(after).blocked,beforeBlocked,'hours placement toggles with event period');
 // 搁置不锁死其他故事：外套支线照常进行。
 let t=must(freshWorld(),'qing','coat-start');
 t=must(t,'qing','coat-detail');
 t=must(t,'fang','shop-check');
 t=must(t,'guest','coat-swap');
 assert.ok(has(t,'coat'),'coat story unaffected while stall shelved');
}
{
 // 缩小与移位两种方案的最终落地状态有区别。
 let u=must(freshWorld(),'ming','stall-ming');
 u=must(u,'ling','stall-ling');
 u=must(u,'ming','stall-observe');
 u=must(u,'ling','stall-propose-compact');
 u=must(u,'ming','stall-agree');
 u=must(u,'ling','stall-finalize');
 assert.equal(rackStatus(u).placement,'compact','compact placement distinct');
 assert.equal(rackStatus(u).blocked,false,'compact unblocks passage');
 let v=must(freshWorld(),'ming','stall-ming');
 v=must(v,'ling','stall-ling');
 v=must(v,'ming','stall-observe');
 v=must(v,'ling','stall-propose-move');
 v=must(v,'ming','stall-agree');
 v=must(v,'ling','stall-finalize');
 assert.equal(rackStatus(v).placement,'move','move placement distinct');
 assert.equal(rackStatus(v).blocked,false,'move unblocks passage');
}

{
 // 规则5回归：改变提案必须清除旧同意，落实改过的方案须再次征得阿明同意。
 let s=must(freshWorld(),'ming','stall-ming');
 s=must(s,'ling','stall-ling');
 s=must(s,'ming','stall-observe');
 s=must(s,'ling','stall-propose-compact');
 s=must(s,'ming','stall-agree');
 s=must(s,'ling','stall-propose-move');
 assert.equal(s.stallOutcome,null,'changed proposal not implemented');
 assert.ok(!ids(s,'ling').includes('stall-finalize'),'old agreement cleared by changed proposal');
 assert.ok(!JSON.stringify(npcContext(s,'ming').relations).includes('同意'),'ming agreement cleared by changed proposal');
 let r=tryDo(s,'ling','stall-finalize');
 assert.equal(r.ok,false,'finalize blocked without fresh consent');
 assert.deepEqual(r.state,s,'finalize without fresh consent changes nothing');
 assert.equal(rackStatus(s).placement,'as-is','passage unchanged while re-consent pending');
 s=must(s,'ming','stall-agree');
 s=must(s,'ling','stall-finalize');
 assert.equal(s.stallOutcome,'move','re-consented plan implemented');
 assert.equal(rackStatus(s).placement,'move','rack reflects re-consented plan');
}

// 人物知识：plain JSON、无 effect、此刻合法动作；边界不含他人秘密；玩家知道≠NPC知道；交谈/转告后才更新。
{
 const s=freshWorld();
 assert.equal(npcContext(s,'stranger'),null,'unknown npc context is null');
 const qing=must(s,'qing','coat-start');
 const ctx=npcContext(qing,'qing');
 assert.deepEqual(JSON.parse(JSON.stringify(ctx)),ctx,'context is plain JSON');
 for(const a of ctx.legalActions)assert.deepEqual(Object.keys(a).sort(),['id','label'],'legal actions carry no effect function');
 assert.ok(JSON.stringify(ctx).includes('右袖'),'qing inherently knows her own sleeve feature');
 assert.ok(!JSON.stringify(ctx).includes('林伯'),'qing context keeps lam secrets out');
 assert.ok(!JSON.stringify(ctx).includes('衣架'),'qing context keeps stall business out');
 const buyerCtx=npcContext(qing,'buyer');
 assert.ok(!JSON.stringify(buyerCtx).includes('外套'),'buyer knows nothing about coat mix-up');
 const lokCtx=npcContext(qing,'lok');
 assert.ok(JSON.stringify(lokCtx).includes('小文'),'lok knows his own reservation');
 assert.ok(!JSON.stringify(lokCtx).includes('面试'),'lok knows nothing about qing interview');
 // 小文同意后、玩家转告前，阿乐不应知道；转告后才知道。
 let t=must(qing,'lam','record-start');
 t=must(t,'lok','sleeve-read');
 t=must(t,'buyer','buyer-consent');
 assert.ok(!JSON.stringify(npcContext(t,'lok')).includes('小文听过林伯的故事'),'lok relations update only after actual relay');
 t=must(t,'lok','consent-relay');
 assert.ok(JSON.stringify(npcContext(t,'lok')).includes('小文听过林伯的故事'),'lok relations update after relay');
}

// 回归：原衣交给阿晴后，周叔仍记得交换事实（不依赖玩家当前持有）。
{
 let s=must(freshWorld(),'qing','coat-start');
 s=must(s,'qing','coat-detail');
 s=must(s,'fang','shop-check');
 s=must(s,'guest','coat-swap');
 s=must(s,'ling','coat-loan');
 s=must(s,'qing','coat-emergency');
 s=restEvent(s);
 s=must(s,'qing','coat-collect-loan');
 assert.ok(has(s,'loanCoat'),'player holds loan coat after explicit collect step');
 s=must(s,'qing','coat-return-original');
 assert.ok(!has(s,'coat'),'original coat handed to qing');
 assert.ok(JSON.stringify(npcContext(s,'guest')).includes('换回'),'guest still remembers swap after coat handed over');
 const qctx=JSON.stringify(npcContext(s,'qing'));
 assert.ok(qctx.includes('原衣'),'qing context reflects original coat returned');
 assert.ok(!qctx.includes('仍未找回'),'qing context not contradictory after original returned');
}

// 通用动作规则：非法 npc/id 状态不变；普通交谈不推进时间；三支线交错互不清空。
{
 let s=freshWorld();
 const period0=s.period;
 s=must(s,'qing','coat-start');
 s=must(s,'lok','sleeve-read');
 s=must(s,'ming','stall-ming');
 assert.equal(s.period,period0,'normal chats do not advance time');
 s=must(s,'lam','record-start');
 s=must(s,'ling','coat-loan');
 s=must(s,'fang','shop-check');
 s=must(s,'qing','coat-detail');
 s=must(s,'lok','record-source');
 s=must(s,'ling','stall-ling');
 s=must(s,'ming','stall-observe');
 s=must(s,'guest','coat-swap');
 assert.ok(has(s,'coat')&&has(s,'loanCoat'),'items from different branches coexist');
 s=must(s,'lok','record-reply');
 s=must(s,'ling','stall-propose-compact');
 s=must(s,'ming','stall-agree');
 s=must(s,'ling','stall-finalize');
 s=must(s,'buyer','buyer-consent');
 s=must(s,'lok','consent-relay');
 s=must(s,'qing','coat-emergency');
 assert.equal(s.coatOutcome,'emergency','coat outcome intact after interleaving');
 assert.equal(s.stallOutcome,'compact','stall outcome intact after interleaving');
 assert.ok(has(s,'contact'),'record items intact after interleaving');
 const bad=applyWorldAction(s,'qing','no-such-id');
 assert.equal(bad.ok,false,'illegal id fails');
 assert.deepEqual(bad.state,s,'illegal id changes nothing');
 const ghost=applyWorldAction(s,'nobody','chat');
 assert.equal(ghost.ok,false,'unknown npc fails');
 assert.deepEqual(ghost.state,s,'unknown npc changes nothing');
 const waited=restEvent(s);
 assert.notEqual(waited.period,s.period,'explicit wait advances time');
}

console.log('PASS OW1 stories: record staged clues, stall two-party negotiation, npc knowledge bounds');
