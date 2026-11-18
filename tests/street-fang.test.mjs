import test from 'node:test';
import assert from 'node:assert/strict';
import {atFangCounter,createFangCounter} from '../street-fang.js';
import {applyWorldAction,freshWorld} from '../neighborhood-state.js';

// 验收用合法站位与“已对阿晴执行 coat-start”的初始世界。
const START={x:16.7,z:-0.45};
function coatStarted(){
 const result=applyWorldAction(freshWorld(),'qing','coat-start');
 assert.equal(result.ok,true,'前置条件：coat-start 应当成功');
 return result.state;
}

// 模拟新街区集成器：onAction 走 applyWorldAction，返回 UI 需要的规则结果。
function createHarness({world=coatStarted(),position={...START}}={}){
 let state=world;
 let spot={...position};
 const opened=[];
 const actions=[];
 const counter=createFangCounter({
  getPosition:()=>spot,
  getWorld:()=>state,
  onOpen:npc=>{opened.push(npc);},
  onAction:(npc,id)=>{
   actions.push([npc,id]);
   const result=applyWorldAction(state,npc,id);
   if(!result.ok)return {ok:false,message:result.message};
   state=result.state;
   return {ok:true,text:result.text,meaning:result.meaning};
  }
 });
 return {
  counter,
  opened,
  actions,
  get state(){return state;},
  moveTo(next){spot={...next};}
 };
}

test('atFangCounter 只接受店内柜台合法站位', () => {
 const valid=[
  {x:16.7,z:-0.45},
  {x:16.15,z:-0.58},
  {x:17.05,z:-0.32},
  {x:16.15,z:-0.32}
 ];
 for(const point of valid)assert.equal(atFangCounter(point),true,JSON.stringify(point));
 const outside=[
  {x:14,z:-0.5},
  {x:16.7,z:-0.75},
  {x:16.14,z:-0.45},
  {x:17.06,z:-0.45},
  {x:16.7,z:-0.59},
  {x:16.7,z:-0.31},
  {x:0,z:0}
 ];
 for(const point of outside)assert.equal(atFangCounter(point),false,JSON.stringify(point));
 const invalid=[
  {x:NaN,z:-0.45},
  {x:Infinity,z:-0.45},
  {x:16.7,z:-Infinity},
  {x:'16.7',z:-0.45},
  {x:16.7,z:'-0.45'},
  {x:16.7},
  {x:16.7,z:null},
  {},
  null,
  undefined,
  [16.7,-0.45]
 ];
 invalid.forEach((point,index)=>assert.equal(atFangCounter(point),false,'invalid #'+index));
});

test('合法站位只开一次会话，显式递单只执行一次', () => {
 const harness=createHarness();
 const before=harness.state;
 assert.equal(atFangCounter(START),true);

 assert.equal(harness.counter.open(),true);
 assert.deepEqual(harness.opened,['fang']);
 assert.deepEqual(harness.actions,[],'open 不执行任何动作');
 assert.deepEqual(harness.state,before,'开会话不改变世界状态');
 assert.ok(harness.state.items.includes('ticket'),'取件单仍在手上');

 assert.equal(harness.counter.open(),false);
 assert.deepEqual(harness.opened,['fang']);
 assert.deepEqual(harness.state,before);

 const result=harness.counter.handTicket();
 assert.equal(result.ok,true);
 assert.equal(typeof result.text,'string');
 assert.deepEqual(harness.actions,[['fang','shop-check']]);
 assert.ok(harness.state.flags.includes('shop-check'));
 assert.ok(harness.state.items.includes('ticket'),'递交后取件单保持');
 assert.ok(harness.state.items.includes('wrongCoat'),'递交不删物品');
 assert.equal(harness.state.revision,before.revision+1);

 const accepted=harness.state;
 const repeat=harness.counter.handTicket();
 assert.equal(repeat.ok,false);
 assert.equal(typeof repeat.message,'string');
 assert.deepEqual(harness.actions,[['fang','shop-check']],'重复递单不再执行');
 assert.deepEqual(harness.state,accepted,'重复递单不改变状态');

 harness.counter.close();
 const closed=harness.counter.handTicket();
 assert.equal(closed.ok,false);
 assert.deepEqual(harness.actions,[['fang','shop-check']]);
 assert.deepEqual(harness.state,accepted);
});

test('门口与隔壁站位不能开会话或递单', () => {
 const baseline=coatStarted();
 const door=createHarness({world:baseline,position:{x:14,z:-0.5}});
 assert.equal(door.counter.open(),false);
 assert.deepEqual(door.opened,[]);
 assert.equal(door.counter.handTicket().ok,false);
 assert.deepEqual(door.actions,[]);
 assert.deepEqual(door.state,baseline);

 const neighbour=createHarness({world:baseline,position:{x:16.7,z:-0.75}});
 assert.equal(neighbour.counter.open(),false);
 assert.deepEqual(neighbour.opened,[]);
 assert.equal(neighbour.counter.handTicket().ok,false);
 assert.deepEqual(neighbour.actions,[]);
 assert.deepEqual(neighbour.state,baseline);
});

test('离开合法站位后递单被拒绝，回到合法点才可递交', () => {
 const harness=createHarness();
 assert.equal(harness.counter.open(),true);

 harness.moveTo({x:16.7,z:-0.75});
 const away=harness.counter.handTicket();
 assert.equal(away.ok,false);
 assert.deepEqual(harness.actions,[]);

 harness.moveTo({...START});
 const back=harness.counter.handTicket();
 assert.equal(back.ok,true);
 assert.deepEqual(harness.actions,[['fang','shop-check']]);
});

test('没有取件单时拒绝递单且不改变状态', () => {
 const world=freshWorld();
 const harness=createHarness({world});
 assert.equal(harness.counter.open(),true);
 const result=harness.counter.handTicket();
 assert.equal(result.ok,false);
 assert.deepEqual(harness.actions,[]);
 assert.deepEqual(harness.state,world);
});

test('遗留 OW1 已核对存档同样拒绝递单', () => {
 const checked=applyWorldAction(coatStarted(),'fang','shop-check');
 assert.equal(checked.ok,true,'前置条件：OW1 核对应当成功');
 const harness=createHarness({world:checked.state});
 assert.equal(harness.counter.open(),true);
 const result=harness.counter.handTicket();
 assert.equal(result.ok,false);
 assert.match(result.message,/核对/);
 assert.deepEqual(harness.actions,[]);
 assert.deepEqual(harness.state,checked.state);
});

test('规则拒绝时透传结果，且不封住后续重试', () => {
 const world=coatStarted();
 const refusal={ok:false,message:'情况已经变化，请重新确认。',detail:'changed'};
 const calls=[];
 const counter=createFangCounter({
  getPosition:()=>START,
  getWorld:()=>world,
  onOpen:()=>{},
  onAction:(npc,id)=>{calls.push([npc,id]);return refusal;}
 });
 assert.equal(counter.open(),true);
 const first=counter.handTicket();
 assert.equal(first,refusal,'规则结果原样透传');
 const second=counter.handTicket();
 assert.equal(second,refusal);
 assert.deepEqual(calls,[['fang','shop-check'],['fang','shop-check']]);
});

test('close 清理会话后可在合法点重新开启', () => {
 const harness=createHarness();
 assert.equal(harness.counter.open(),true);
 harness.counter.close();
 assert.equal(harness.counter.handTicket().ok,false);
 assert.deepEqual(harness.actions,[]);
 assert.equal(harness.counter.open(),true);
 assert.deepEqual(harness.opened,['fang','fang']);

 assert.equal(harness.counter.handTicket().ok,true);
 harness.counter.close();
 assert.equal(harness.counter.open(),true);
 const repeat=harness.counter.handTicket();
 assert.equal(repeat.ok,false,'已接受的递交在重开会话后仍不重复执行');
 assert.deepEqual(harness.actions,[['fang','shop-check']]);
});

test('站位回调抛错时不开会话也不递单', () => {
 const counter=createFangCounter({
  getPosition:()=>{throw Error('boom');},
  getWorld:()=>coatStarted(),
  onOpen:()=>{throw Error('onOpen 不应被调用');},
  onAction:()=>{throw Error('onAction 不应被调用');}
 });
 assert.equal(counter.open(),false);
 assert.equal(counter.handTicket().ok,false);
});

test('工厂校验必需回调', () => {
 assert.throws(()=>createFangCounter(),TypeError);
 assert.throws(()=>createFangCounter({getPosition:()=>START,getWorld:()=>freshWorld()}),TypeError);
});
