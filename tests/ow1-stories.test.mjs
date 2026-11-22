import assert from 'node:assert/strict';
import {
 freshWorld,optionsFor,applyWorldAction,restEvent,npcContext
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

// Fresh and legacy worlds offer conversation without activating a retired task.
for(const flags of [[],['record-start','stall-observed','reunion-invite','stall-ming-agreed']]){
 const w={...freshWorld(),flags};
 for(const [npc,chat,retired] of [['lam','lam-chat','record-start'],['lok','lok-chat','sleeve-read'],['ming','ming-chat','stall-observe'],['ling','ling-chat','stall-finalize'],['buyer','buyer-chat','buyer-consent']]){
  assert.ok(ids(w,npc).includes(chat));assert.ok(!ids(w,npc).includes(retired));
  assert.equal(tryDo(w,npc,retired).ok,false);
  assert.equal(must(w,npc,chat).period,w.period);
 }
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

// Invalid actions never change state; waiting advances the time.
{
 const s=freshWorld();
 const bad=applyWorldAction(s,'qing','no-such-id');
 assert.equal(bad.ok,false,'illegal id fails');
 assert.deepEqual(bad.state,s,'illegal id changes nothing');
 const ghost=applyWorldAction(s,'nobody','chat');
 assert.equal(ghost.ok,false,'unknown npc fails');
 assert.deepEqual(ghost.state,s,'unknown npc changes nothing');
 const waited=restEvent(s);
 assert.notEqual(waited.period,s.period,'explicit wait advances time');
}

console.log('PASS OW1 stories: retired quest migration, casual chats and NPC knowledge bounds');
