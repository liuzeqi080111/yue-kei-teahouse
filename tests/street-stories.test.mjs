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
 const picked=play([['qing','coat-start'],['fang','shop-check']]);
 assert.equal(applyWorldAction(picked,'fang','coat-route-buy').ok,false);
 const inspected=play([['qing','coat-inspect']],picked);
 assert.equal(applyWorldAction(inspected,'qing','coat-inspect').ok,false);
 const initial=play([['fang','coat-route-buy']],inspected);
 assert.equal(initial.items.includes('ticket'),false);
 assert.equal(applyWorldAction(initial,'qing','coat-buy').ok,false);
 assert.equal(applyWorldAction(initial,'ling','coat-buy').ok,false);
 const quoted=play([['ling','coat-quote']],initial);
 assert.equal(applyWorldAction(quoted,'qing','coat-review').ok,false);
 assert.equal(applyWorldAction(quoted,'qing','coat-buy').ok,false);
 const fitted=play([['qing','coat-fitted']],quoted);
 assert.equal(applyWorldAction(fitted,'qing','coat-buy').ok,false);
 const paid=play([['qing','coat-review'],['qing','coat-buy']],fitted);
 assert.equal(paid.money,initial.money);
 assert.equal(paid.items.includes('newCoat'),false);
 assert.equal(applyWorldAction(paid,'qing','coat-buy').ok,false);
 const emergency=play([['qing','coat-emergency']],paid);
 assert.ok(emergency.flags.includes('coat-misunderstanding'));
 assert.deepEqual(emergency.items,['wrongCoat']);
 assert.equal(applyWorldAction(emergency,'fang','laundry-reconcile').ok,false);
 const solved=play([['ming','guest-found'],['guest','coat-swap'],['qing','coat-return-original'],['fang','laundry-reconcile']],restEvent(emergency));
 assert.ok(solved.flags.includes('laundry-reconciled'));
 assert.equal(solved.flags.includes('coat-misunderstanding'),false);
 assert.equal(solved.coatOutcome,'emergency');
});

test('retired quests leave a clear entrance for all periods and old outcomes',()=>{
 const grid=JSON.parse(readFileSync(new URL('../assets/street/walk.json',import.meta.url),'utf8'));
 for(const stallOutcome of [null,'move','hours','compact']){
  for(const period of [0,1,2]){
   const world={...freshWorld(),period,stallOutcome};
   assert.equal(rackStatus(world).blocked,false);
   const nav=createStreetNav(grid,p=>rackBlocks(rackLayout(world),p));
   assert.ok(nav.line({x:-12.25,z:7.18},{x:-13.20,z:7.18}));
  }
 }
});
