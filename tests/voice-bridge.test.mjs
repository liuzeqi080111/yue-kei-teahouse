import assert from 'node:assert/strict';
import {createGame} from '../controller.js';
import {createVoiceBridge} from '../voice-bridge.js';
let queue=[];
const game=createGame({schedule:(fn)=>{queue.push(fn);return fn;},cancel:fn=>{queue=queue.filter(x=>x!==fn);}});
const bridge=createVoiceBridge({game});
const flush=()=>{let n=0;while(queue.length){if(++n>100)throw Error('timer loop');queue.shift()();}};
const apply=(...intents)=>bridge.apply({decision:'execute',intents,reply:'FAKE SUCCESS'},bridge.token());
const unchanged=fn=>{const before=game.snapshot().state;assert.equal(fn().ok,false);assert.deepEqual(game.snapshot().state,before);};
game.chapter('order');
unchanged(()=>apply({type:'MARK_SERVED'}));
unchanged(()=>apply({type:'ADD_ITEM',itemId:'food-pineapple-bun'},{type:'ADD_ITEM',itemId:'food-curry-fishball'}));
unchanged(()=>apply({type:'ADD_ITEM',itemId:'food-charsiu-rice',options:{serving:'外賣'}}));
unchanged(()=>apply({type:'ADD_ITEM',itemId:'drink-milk-tea',qty:2}));
assert.equal(apply({type:'ADD_ITEM',itemId:'drink-milk-tea',options:{temperature:'凍',sweetness:'少甜'}}).ok,true);
let item=game.snapshot().state.items[0];
assert.equal(item.status,'pending');assert.equal(item.options.temperature,'凍');
unchanged(()=>apply({type:'ADD_ITEM',itemId:'food-pineapple-bun'},{type:'UPDATE_ITEM',orderItemId:item.id,options:[]}));
assert.equal(apply({type:'UPDATE_ITEM',orderItemId:item.id,options:{sweetness:'走甜'}}).ok,true);
item=game.snapshot().state.items[0];assert.equal(item.options.sweetness,'走甜');assert.equal(item.options.temperature,'凍');
unchanged(()=>apply({type:'ADD_ITEM',itemId:'drink-milk-tea'}));
unchanged(()=>apply({type:'FINISH_ORDER'}));
assert.equal(apply({type:'CONFIRM_ORDER'}).ok,true);flush();
assert.equal(game.snapshot().view.orderReview,true);assert.equal(game.snapshot().state.items[0].status,'pending');
assert.equal(apply({type:'FINISH_ORDER'}).ok,true);flush();
assert.equal(game.snapshot().state.items[0].status,'served');
unchanged(()=>apply({type:'CANCEL_ITEM',orderItemId:item.id}));
assert.equal(apply({type:'REQUEST_WATER'}).ok,true);flush();assert.equal(game.snapshot().view.water,true);
assert.equal(apply({type:'REQUEST_BILL'}).ok,true);flush();assert.equal(game.snapshot().state.isPaid,false);
unchanged(()=>apply({type:'REQUEST_WATER'}));
assert.equal(apply({type:'PAY_BILL',amountCents:1}).ok,true);assert.equal(game.snapshot().state.isPaid,true);flush();
const old=bridge.token();game.chapter('order');
unchanged(()=>bridge.apply({decision:'execute',intents:[{type:'ADD_ITEM',itemId:'food-pineapple-bun'}]},old));
const token=bridge.token();game.camera('room');assert.equal(bridge.token(),token);
assert.equal(bridge.apply({decision:'clarify',intents:[],reply:'凍定熱？',question:'凍定熱？'},bridge.token()).ok,true);
assert.ok(bridge.context().pendingQuestion);
game.chapter('bill');assert.equal(bridge.context().pendingQuestion,null);assert.deepEqual(bridge.context().history,[]);assert.ok(!bridge.context().allowedActions.includes('CALL_WAITER'));
game.chapter('service');
const meal=game.snapshot().state;
for(const [playerText,pattern,rate] of [
 ['真係好好味！',/多謝/,undefined],
 ['我聽唔明。',/加水.*埋單/,undefined],
 ['可唔可以講慢啲呀，唔該？',/講慢啲.*加水/,0.72]
]){
 // The local conversational answer must override an accidental model action.
 const response=bridge.apply({decision:'execute',playerText,intents:[{type:'REQUEST_BILL'}]},bridge.token());
 assert.equal(response.ok,true);
 assert.deepEqual(response.executedIntents,[]);
 assert.match(response.reply,pattern);
 assert.equal(response.playbackRate,rate);
 assert.deepEqual(game.snapshot().state,meal);
}
const unknown=bridge.apply({decision:'clarify',playerText:'呢個點搞？',reply:'想問邊一樣？',intents:[]},bridge.token());
assert.equal(unknown.reply,'想問邊一樣？');
assert.deepEqual(game.snapshot().state,meal);
game.chapter('order');
bridge.apply({decision:'clarify',reply:'想要凍定熱？',question:'想要凍定熱？',intents:[]},bridge.token());
const pending=bridge.context().pendingQuestion;
for(const playerText of ['奶茶怎么说','奶茶點講','教我点一杯奶茶','加水怎么说','菠萝油怎么说']){
 const before=game.snapshot().state;
 const answer=bridge.apply({decision:'execute',playerText,intents:[{type:'ADD_ITEM',itemId:'drink-milk-tea'}]},bridge.token());
 assert.deepEqual(answer.executedIntents,[]);
 assert.deepEqual(game.snapshot().state,before);
 assert.deepEqual(bridge.context().pendingQuestion,pending,'teaching must preserve pending clarification');
}
const ordered=bridge.apply({decision:'execute',playerText:'我要一杯热奶茶，正常甜',intents:[{type:'ADD_ITEM',itemId:'drink-milk-tea',options:{temperature:'熱',sweetness:'正常甜'}}]},bridge.token());
assert.equal(ordered.ok,true);assert.equal(game.snapshot().state.items.length,1);
const milkId=game.snapshot().state.items[0].id;
unchanged(()=>apply({type:'UPDATE_ITEM',orderItemId:milkId,itemId:'food-curry-fishball'}));
const replace=apply({type:'UPDATE_ITEM',orderItemId:milkId,itemId:'drink-lemon-tea',options:{temperature:'凍',sweetness:'少甜'}});
assert.equal(replace.ok,true);assert.equal(game.snapshot().state.items.length,1);
assert.equal(game.snapshot().state.items[0].itemId,'drink-lemon-tea');
assert.equal(game.snapshot().state.items[0].options.sweetness,'少甜');
console.log('PASS voice bridge: menu rules, service, safe virtual payment, contextual replies without order mutation, and stale response');
game.action('RESTART');game.action('ENTER');flush();
unchanged(()=>apply({type:'START_SEATING',qty:3}));
assert.equal(apply({type:'START_SEATING',qty:2}).ok,true);flush();
assert.equal(game.snapshot().state.partySize,2,'legacy hosted qty maps to partySize only for seating');
const taught=bridge.apply({decision:'reply',intents:[],playerText:'教我点冻奶茶少甜，用普通话解释',reply:'可以講「唔該，一杯凍奶茶，少甜」。',meaning:'麻烦，一杯冰奶茶，少甜。'},bridge.token());
assert.match(taught.reply,/凍奶茶，少甜/);assert.equal(game.snapshot().state.items.length,0);
