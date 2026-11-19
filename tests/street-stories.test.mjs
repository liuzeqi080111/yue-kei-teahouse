import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { applyWorldAction, freshWorld, restEvent, rackStatus } from '../neighborhood-state.js';
import { COUNTER, createStreetNav, rackBlocks, rackLayout } from '../street-space.js';

function play(actions, world={...freshWorld(),streetView:{...COUNTER,heading:3.3,pitch:0}}) {
 for(const [npc,action] of actions){
  const result=applyWorldAction(world,npc,action);
  assert.equal(result.ok,true,npc+' / '+action);
  world=result.state;
 }
 return world;
}

test('第一人称买衣由阿晴付款，应急与和解是两个事件',()=>{
 const initial=play([['qing','coat-start'],['fang','shop-check'],['fang','coat-route-buy']]);
 assert.equal(initial.items.includes('ticket'),false);
 assert.equal(applyWorldAction(initial,'qing','coat-buy').ok,false);
 assert.equal(applyWorldAction(initial,'ling','coat-buy').ok,false);
 const paid=play([['ling','coat-quote'],['qing','coat-buy']],initial);
 assert.equal(paid.money,initial.money);
 assert.equal(applyWorldAction(paid,'qing','coat-buy').ok,false);
 const emergency=play([['qing','coat-emergency']],paid);
 assert.ok(emergency.flags.includes('coat-misunderstanding'));
 assert.deepEqual(emergency.items,['wrongCoat']);
 assert.equal(applyWorldAction(emergency,'fang','laundry-reconcile').ok,false);
 const solved=play([['ming','guest-found'],['qing','coat-detail'],['guest','coat-swap'],['qing','coat-return-original'],['fang','laundry-reconcile']],restEvent(emergency));
 assert.ok(solved.flags.includes('laundry-reconciled'));
 assert.equal(solved.flags.includes('coat-misunderstanding'),false);
 assert.equal(solved.coatOutcome,'emergency');
});

test('唱片只传话不扣款，购买与赠送至多执行一次',()=>{
 const contact=play([['lam','record-start'],['lok','sleeve-read'],['lok','record-source'],['lok','record-reply'],['lam','record-contact']]);
 assert.equal(contact.recordOutcome,'contact');
 assert.equal(contact.flags.includes('buyer-consent'),false);
 assert.equal(contact.money,30000);
 const bought=play([['buyer','buyer-consent'],['lok','consent-relay'],['lok','record-buy']],contact);
 assert.equal(bought.money,24000);
 assert.equal(applyWorldAction(bought,'lok','record-buy').ok,false);
 const gift=play([['lam','record-gift']],bought);
 assert.equal(gift.recordOutcome,'gift');
 assert.equal(applyWorldAction(gift,'lam','record-gift').ok,false);
});

test('三个摆放方案更新同一通行区，分时仅在约定时段收架',()=>{
 const grid=JSON.parse(readFileSync(new URL('../assets/street/walk.json',import.meta.url),'utf8'));
 const from={x:-12.25,z:7.18},to={x:-13.20,z:7.18};
 const clear=s=>createStreetNav(grid,p=>rackBlocks(rackLayout(s),p)).line(from,to);
 const initial=play([['ming','stall-ming'],['ling','stall-ling'],['ming','stall-observe']]);
 assert.equal(clear(initial),false);
 for(const plan of ['compact','move','hours']){
  const done=play([['ling','stall-propose-'+plan],['ming','stall-agree'],['ling','stall-finalize']],initial);
  assert.equal(done.stallOutcome,plan);
  assert.equal(clear(done),plan!=='hours');
  if(plan==='hours'){
   const dinner=restEvent(done);
   assert.equal(rackStatus(dinner).blocked,false);
   assert.equal(clear(dinner),true);
   assert.equal(clear(restEvent(restEvent(dinner))),false);
  }
 }
});
