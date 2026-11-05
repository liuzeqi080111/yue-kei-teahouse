import assert from 'node:assert/strict';
import {createGame,diningOutcome,MOTION} from '../controller.js';
import {createDining} from '../dining-actions.js';
function harness(){let seq=0;const queue=new Map(),delays=[];const game=createGame({schedule:(fn,delay)=>{delays.push(delay);queue.set(++seq,fn);return seq;},cancel:id=>queue.delete(id)});return {game,queue,delays,flush(){let limit=100;while(queue.size){assert.ok(limit--);const [id,fn]=queue.entries().next().value;queue.delete(id);fn();}}};}
function confirm(h){h.game.action('CONFIRM_ORDER');h.flush();assert.equal(h.game.snapshot().view.orderReview,true);h.game.action('FINISH_ORDER');h.flush();}
let count=0;const test=(name,fn)=>{fn();console.log('PASS '+name);count++};
function seated(h){h.game.action('ENTER');h.flush();h.game.action('START_SEATING');h.flush();h.game.action('OPEN_MENU');}
test('full flow, independent specifications, camera persistence and exact bill',()=>{
 const h=harness(),g=h.game;seated(h);
 g.action('ADD_ITEM',{itemId:'drink-lemon-tea',options:{temperature:'凍',sweetness:'少甜'}});
 g.action('ADD_ITEM',{itemId:'drink-milk-tea',options:{temperature:'熱',sweetness:'正常甜'}});
 g.action('UPDATE_ITEM_OPTIONS',{orderItemId:'line-1',options:{sweetness:'走甜'}});
 assert.equal(g.snapshot().state.items[1].qty,1);assert.equal(g.snapshot().state.items[1].options.sweetness,'正常甜');
 g.action('CONFIRM_ORDER');assert.equal(g.action('CONFIRM_ORDER').ok,false);h.flush();assert.equal(g.snapshot().state.items[0].status,'pending');g.action('FINISH_ORDER');h.flush();
 assert.equal(g.snapshot().state.items.length,2);assert.ok(g.snapshot().state.items.every(i=>i.status==='served'));assert.equal(g.snapshot().state.waiterPresent,true);
 assert.equal(g.snapshot().view.notice,'','rapid-click waiting notice must disappear with the service');
 let before=g.snapshot().state;for(const camera of ['table','room','menu'])g.camera(camera);assert.deepEqual(g.snapshot().state,before);
 g.action('REQUEST_WATER');h.flush();g.action('REQUEST_UTENSILS');h.flush();g.camera('table');assert.equal(g.snapshot().view.water,true);assert.equal(g.snapshot().view.utensils,true);
 assert.equal(g.action('UPDATE_ITEM_QTY',{orderItemId:'line-1',qty:3}).ok,false);assert.equal(g.action('CANCEL_ITEM',{orderItemId:'line-1'}).ok,false);
 g.action('ADD_ITEM',{itemId:'food-pineapple-bun'});assert.equal(g.action('REQUEST_BILL').ok,false);confirm(h);
 g.action('REQUEST_BILL');h.flush();assert.equal(g.snapshot().state.bill.totalCents,6400);g.camera('table');g.action('REQUEST_BILL');assert.equal(g.snapshot().view.camera,'bill');assert.equal(g.snapshot().view.busy,false);assert.equal(h.queue.size,0);assert.equal(g.snapshot().state.bill.totalCents,6400);
 g.action('PAY_BILL');g.action('PAY_BILL');h.flush();assert.equal(g.snapshot().state.phase,'结束');g.action('RESTART');assert.equal(g.snapshot().view.water,false);assert.equal(g.snapshot().view.utensils,false);assert.equal(g.snapshot().state.bill,null);
});
test('restart cancels old seating callbacks, including callbacks already captured by the event loop',()=>{
 const h=harness(),g=h.game;g.action('ENTER');h.flush();g.action('START_SEATING');const stale=[...h.queue.values()];g.action('RESTART');assert.equal(h.queue.size,0);g.action('ENTER');stale.forEach(fn=>fn());assert.equal(g.snapshot().state.phase,'迎接');assert.equal(g.snapshot().state.round,1);
});
test('restart during serving cannot serve new line-1 or remove new waiter',()=>{
 const h=harness(),g=h.game;seated(h);g.action('ADD_ITEM',{itemId:'drink-lemon-tea'});g.action('CONFIRM_ORDER');h.flush();g.action('FINISH_ORDER');const stale=[...h.queue.values()];g.action('RESTART');seated(h);g.action('ADD_ITEM',{itemId:'food-pineapple-bun'});g.action('CALL_WAITER');stale.forEach(fn=>fn());assert.equal(g.snapshot().state.items[0].status,'pending');assert.equal(g.snapshot().state.waiterPresent,true);h.flush();assert.equal(g.snapshot().state.waiterPresent,true);g.action('WAITER_LEAVE');assert.equal(g.snapshot().state.waiterPresent,false);
});
test('same-round service requests cannot overlap; switching camera does not dispatch service',()=>{
 const h=harness(),g=h.game;seated(h);g.action('REQUEST_WATER');assert.equal(g.action('REQUEST_UTENSILS').ok,false);g.camera('table');assert.equal(g.snapshot().view.utensils,false);h.flush();g.action('REQUEST_UTENSILS');assert.equal(g.snapshot().state.waiterPresent,true);h.flush();assert.equal(g.snapshot().view.utensils,true);
});
test('sold out, invalid options and invalid quantity fail without mutating business state',()=>{
 const h=harness(),g=h.game;seated(h);const before=g.snapshot().state;
 for(const extra of [{itemId:'food-curry-fishball'},{itemId:'drink-lemon-tea',options:{sweetness:'超甜'}},{itemId:'drink-lemon-tea',qty:0}]){assert.equal(g.action('ADD_ITEM',extra).ok,false);assert.deepEqual(g.snapshot().state,before);}
});
test('a combined edit rejects either invalid field without partially saving the other',()=>{
 const h=harness(),g=h.game;seated(h);
 g.action('ADD_ITEM',{itemId:'drink-lemon-tea',options:{sweetness:'少甜'}});
 g.action('ADD_ITEM',{itemId:'drink-milk-tea',options:{sweetness:'正常甜'}});
 const before=g.snapshot().state;
 for(const [qty,sweetness] of [[0,'走甜'],[3,'超甜']]){
  assert.equal(g.action('UPDATE_ITEM',{orderItemId:'line-1',qty,options:{sweetness}}).ok,false);
  assert.deepEqual(g.snapshot().state,before);
 }
 assert.equal(g.action('UPDATE_ITEM',{orderItemId:'line-1',qty:1,options:{sweetness:'走甜'}}).ok,true);
 assert.equal(g.snapshot().state.items[0].qty,1);
 assert.equal(g.snapshot().state.items[0].options.sweetness,'走甜');
 assert.deepEqual(g.snapshot().state.items[1],before.items[1]);
});
test('a large order finishes within twenty seconds without redundant trips and preserves camera',()=>{
 const h=harness(),g=h.game;seated(h);
 for(const itemId of ['food-pineapple-bun','food-charsiu-rice','food-wonton-noodle','food-egg-sandwich','food-french-toast','drink-lemon-tea','drink-milk-tea','drink-yuanyang','drink-horlicks'])g.action('ADD_ITEM',{itemId});
 g.action('CONFIRM_ORDER');h.flush();
 h.delays.length=0;
 assert.equal(g.action('FINISH_ORDER').ok,true);
 assert.equal(g.action('FINISH_ORDER').ok,false);
 g.camera('table');h.flush();
 assert.equal(g.snapshot().state.items.filter(i=>i.status==='served').length,9);
 assert.equal(g.snapshot().view.camera,'table');
 assert.equal(g.snapshot().view.busy,false);
 assert.ok(h.delays.reduce((sum,ms)=>sum+ms,0)<=20000);
});
test('service changes water only at placement, and new chapter cancels captured callbacks',()=>{
 const h=harness(),g=h.game;seated(h);g.action('REQUEST_WATER');
 assert.equal(g.snapshot().view.water,false);assert.equal(g.snapshot().view.beat.pose,'approach');
 const stale=[...h.queue.values()];g.chapter('order');stale.forEach(fn=>fn());
 assert.equal(g.snapshot().state.phase,'点餐');assert.equal(g.snapshot().view.water,false);assert.equal(g.snapshot().view.beat,null);assert.equal(h.queue.size,0);
 g.action('REQUEST_WATER');h.flush();assert.equal(g.snapshot().view.water,true);assert.equal(g.snapshot().state.waiterPresent,true);
});
test('chapter presets go through module pricing and fully reset previous orders',()=>{
 const h=harness(),g=h.game;g.chapter('service');assert.equal(g.snapshot().state.items.length,2);assert.ok(g.snapshot().state.items.every(i=>i.status==='served'));
 g.chapter('bill');assert.equal(g.snapshot().state.bill.totalCents,4000);assert.equal(g.snapshot().view.camera,'bill');
 g.chapter('full');assert.equal(g.snapshot().state.phase,'门外');assert.equal(g.snapshot().state.items.length,0);
});
test('a waiter already at the table responds without approaching again; cameras do not change state',()=>{
 const h=harness(),g=h.game;seated(h);g.action('CALL_WAITER');h.flush();
 const before=g.snapshot().state;g.camera('menu');g.camera('room');assert.deepEqual(g.snapshot().state,before);
 g.action('REQUEST_WATER');assert.equal(g.snapshot().view.beat.pose,'talk');assert.equal(g.snapshot().view.line[0],'阿明 · 侍應');
 h.flush();assert.equal(g.snapshot().view.water,true);assert.equal(g.snapshot().state.waiterPresent,true);
});
test('waiter welcomes at the door, leads once, and is called back from the aisle',()=>{
 const h=harness(),g=h.game;
 g.action('ENTER');assert.equal(g.snapshot().view.beat.pose,'talk');
 assert.ok(MOTION.walk>=2800&&MOTION.walk<=3600);assert.ok(MOTION.frame<=250);h.flush();
 g.action('START_SEATING');assert.equal(g.snapshot().view.beat.pose,'talk');
 h.flush();assert.equal(g.snapshot().state.waiterPresent,false);assert.equal(g.snapshot().view.near,false);
 g.action('CALL_WAITER');assert.equal(g.snapshot().view.beat.pose,'approach');h.flush();
 assert.equal(g.snapshot().view.near,true);
});
test('water and utensils commit before hand withdrawal; looking away and restart are preserved',()=>{
 for(const [type,flag] of [['REQUEST_WATER','water'],['REQUEST_UTENSILS','utensils']]){
  const h=harness(),g=h.game;seated(h);g.action(type);
  const tick=()=>{const [id,fn]=h.queue.entries().next().value;h.queue.delete(id);fn();};
  tick();tick();assert.equal(g.snapshot().view.beat.pose,'place');
  assert.equal(g.snapshot().view.camera,'table');assert.equal(g.snapshot().view[flag],false);
  tick();assert.equal(g.snapshot().view.beat.pose,'withdraw');assert.equal(g.snapshot().view[flag],true);
  g.camera('menu');tick();assert.equal(g.snapshot().view.camera,'menu');h.flush();
  assert.equal(g.snapshot().view[flag],true);
  g.action(type);tick();tick();const old=[...h.queue.values()];g.action('RESTART');old.forEach(fn=>fn());
  assert.equal(g.snapshot().view[flag],false);assert.equal(g.snapshot().view.beat,null);
 }
});
test('bill waiter stays, payment ends automatically after one farewell, and repeat pay is harmless',()=>{
 const h=harness(),g=h.game;g.chapter('service');g.action('REQUEST_BILL');h.flush();
 assert.equal(g.snapshot().state.waiterPresent,true);assert.equal(g.snapshot().view.near,true);
 assert.equal(g.snapshot().view.camera,'bill');
 assert.equal(g.action('PAY_BILL',{amountCents:1}).ok,false);assert.equal(h.queue.size,0);
 h.delays.length=0;const total=g.snapshot().state.bill.totalCents;
 assert.equal(g.action('PAY_BILL').ok,true);assert.equal(g.snapshot().view.beat.kind,'farewell');
 assert.equal(g.action('PAY_BILL').ok,true);assert.equal(h.queue.size,1);
 g.camera('bill');assert.equal(g.snapshot().view.camera,'room');h.flush();
 assert.deepEqual(h.delays,[MOTION.farewell]);assert.equal(g.snapshot().state.phase,'结束');
 assert.equal(g.snapshot().view.camera,'outside');assert.equal(g.snapshot().view.busy,false);
 assert.equal(g.snapshot().state.bill.totalCents,total);assert.equal(g.snapshot().state.waiterPresent,false);
});
test('restart during farewell cannot end the next round; billing chapter follows the same ending',()=>{
 const h=harness(),g=h.game;g.chapter('bill');g.action('PAY_BILL');const old=[...h.queue.values()];
 g.action('RESTART');g.action('ENTER');old.forEach(fn=>fn());h.flush();
 assert.equal(g.snapshot().state.phase,'迎接');assert.equal(g.snapshot().state.isPaid,false);
 g.chapter('bill');g.action('PAY_BILL');h.flush();assert.equal(g.snapshot().state.phase,'结束');
});
test('order question has no timeout, continue preserves pending edits, explicit answer submits once',()=>{
 const h=harness(),g=h.game;seated(h);g.action('ADD_ITEM',{itemId:'drink-lemon-tea'});
 g.action('CONFIRM_ORDER');h.flush();assert.equal(h.queue.size,0);assert.equal(g.snapshot().view.orderReview,true);
 assert.equal(g.snapshot().state.items[0].status,'pending');assert.equal(g.snapshot().state.waiterPresent,true);
 assert.equal(g.action('CONTINUE_ORDER').ok,true);assert.equal(g.snapshot().view.camera,'menu');
 assert.equal(g.action('FINISH_ORDER').ok,false);assert.equal(g.snapshot().state.items[0].status,'pending');
 g.action('UPDATE_ITEM_OPTIONS',{orderItemId:'line-1',options:{sweetness:'走甜'}});confirm(h);
 assert.equal(g.snapshot().state.items[0].status,'served');assert.equal(g.snapshot().state.items[0].options.sweetness,'走甜');
 assert.equal(g.action('FINISH_ORDER').ok,false);assert.equal(h.queue.size,0);
});
test('one per menu item across quantities/specifications, atomic edits, cancellation and new rounds',()=>{
 const h=harness(),g=h.game;seated(h);assert.equal(g.action('ADD_ITEM',{itemId:'drink-lemon-tea',qty:2}).ok,false);
 assert.equal(g.action('ADD_ITEM',{itemId:'drink-lemon-tea',options:{temperature:'凍'}}).ok,true);
 const before=g.snapshot().state;
 for(const [type,extra] of [['ADD_ITEM',{itemId:'drink-lemon-tea',options:{temperature:'熱'}}],['UPDATE_ITEM_QTY',{orderItemId:'line-1',qty:2}],['UPDATE_ITEM',{orderItemId:'line-1',qty:2,options:{sweetness:'走甜'}}]]){
  assert.equal(g.action(type,extra).ok,false);assert.deepEqual(g.snapshot().state,before);
 }
 g.action('CANCEL_ITEM',{orderItemId:'line-1'});assert.equal(g.action('ADD_ITEM',{itemId:'drink-lemon-tea'}).ok,true);confirm(h);
 assert.equal(g.action('ADD_ITEM',{itemId:'drink-lemon-tea'}).ok,false);
 g.action('RESTART');seated(h);assert.equal(g.action('ADD_ITEM',{itemId:'drink-lemon-tea'}).ok,true);
});
test('service completion offers another request until explicit dismissal, with no stale departure',()=>{
 const h=harness(),g=h.game;seated(h);g.action('CALL_WAITER');h.flush();
 for(const type of ['REQUEST_WATER','REQUEST_UTENSILS']){
  g.action(type);assert.equal(g.snapshot().view.beat.pose,'talk');h.flush();
  assert.equal(g.snapshot().state.waiterPresent,true);assert.equal(g.snapshot().view.near,true);
  assert.match(g.snapshot().view.line[1],/仲有咩需要/);assert.equal(h.queue.size,0);
 }
 g.camera('menu');g.camera('room');assert.equal(g.snapshot().state.waiterPresent,true);
 g.action('WAITER_LEAVE');h.flush();assert.equal(g.snapshot().state.waiterPresent,false);assert.equal(g.snapshot().view.near,false);
});
test('takeaway stays packed across cameras, receipt and automatic farewell',()=>{
 const h=harness(),g=h.game;seated(h);g.action('ADD_ITEM',{itemId:'food-pineapple-bun',options:{serving:'外賣'}});confirm(h);
 assert.match(g.snapshot().view.line[1],/外賣包好/);g.camera('table');g.camera('room');
 g.action('REQUEST_BILL');h.flush();assert.equal(g.snapshot().state.bill.lines[0].options.serving,'外賣');
 assert.equal(g.snapshot().state.bill.totalCents,1800);g.action('PAY_BILL');assert.match(g.snapshot().view.line[1],/外賣/);h.flush();assert.equal(g.snapshot().state.phase,'结束');
});


test('departure waits for pending speech and restart clears the hold',()=>{
 const h=harness(),g=h.game;g.chapter('bill');g.action('WAITER_LEAVE');g.setSpeech(true);
 let [id,fn]=h.queue.entries().next().value;h.queue.delete(id);fn();
 assert.equal(g.snapshot().view.beat.pose,'talk');g.setSpeech(false);h.flush();assert.equal(g.snapshot().view.near,false);
 g.chapter('bill');g.action('WAITER_LEAVE');g.setSpeech(true);g.action('RESTART');g.action('ENTER');h.flush();assert.equal(g.snapshot().view.busy,false);
});
test('dining recap survives payment, keeps takeaway separate, and resets between rounds',()=>{
 const h=harness(),g=h.game,dining=createDining({getSnapshot:g.snapshot});
 seated(h);
 g.action('ADD_ITEM',{itemId:'food-charsiu-rice'});
 g.action('ADD_ITEM',{itemId:'drink-lemon-tea'});
 g.action('ADD_ITEM',{itemId:'food-egg-sandwich'});
 g.action('ADD_ITEM',{itemId:'food-pineapple-bun',options:{serving:'外賣'}});
 confirm(h);
 const {state}=g.snapshot(),[finishedFood,partialDrink,untouchedFood,takeaway]=state.items;
 for(let bite=0;bite<3;bite++)assert.equal(dining.takeBite(finishedFood.id,state.round).ok,true);
 assert.equal(dining.takeBite(partialDrink.id,state.round).ok,true);
 assert.equal(dining.takeBite(takeaway.id,state.round).ok,false);
 g.action('REQUEST_BILL');h.flush();
 assert.equal(g.snapshot().state.bill.totalCents,state.items.reduce((total,item)=>total+item.unitPrice,0));
 g.action('PAY_BILL');h.flush();
 const recap=diningOutcome(g.snapshot().state,dining.inspect);
 assert.deepEqual(recap.completed,[{name:finishedFood.name,isDrink:false}]);
 assert.deepEqual(recap.leftover,[{name:partialDrink.name,isDrink:true}]);
 assert.deepEqual(recap.untouched,[{name:untouchedFood.name,isDrink:false}]);
 assert.deepEqual(recap.packed,[{name:takeaway.name,isDrink:false}]);
 g.chapter('service');
 const next=diningOutcome(g.snapshot().state,dining.inspect);
 assert.equal(next.untouched.length,2);
 assert.equal(next.completed.length,0);
});
console.log(`All ${count} controller integration tests passed.`);
