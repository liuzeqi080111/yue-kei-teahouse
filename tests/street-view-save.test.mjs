import test from 'node:test';
import assert from 'node:assert/strict';
import {
 freshWorld,parseSave,loadWorld,saveWorld,resetWorld,applyWorldAction,SAVE_KEY,
} from '../neighborhood-state.js';

// app.js 的 onView 传给存档的第一人称位置形状。
const VIEW={x:16.7,z:-0.45,heading:3.3,pitch:0.02};
const SETTINGS_KEY='yuekei-font-size';
const LEARNING_KEY='yuekei-learning-guide-v1';

// 带真实剧情物件的“第一人称新档”：取件单、拿错的外套、已核对记录。
function storyWorld(){
 const started=applyWorldAction(freshWorld(),'qing','coat-start');
 assert.equal(started.ok,true,'前置条件：coat-start 应当成功');
 const checked=applyWorldAction(started.state,'fang','shop-check');
 assert.equal(checked.ok,true,'前置条件：shop-check 应当成功');
 return {...checked.state,location:'laundry',streetView:{...VIEW}};
}

// 极简 localStorage：记录写入/删除，便于确认失败路径没有覆盖原值。
function createStorage(entries={}){
 const data=new Map(Object.entries(entries).map(([key,value])=>[key,String(value)]));
 const writes=[];
 const removals=[];
 return {
  getItem(key){return data.has(key)?data.get(key):null;},
  setItem(key,value){writes.push(key);data.set(key,String(value));},
  removeItem(key){removals.push(key);data.delete(key);},
  raw(key){return data.has(key)?data.get(key):null;},
  keys(){return [...data.keys()];},
  writes,
  removals,
 };
}

test('无 streetView 的 v1 老档可读且不虚构第一人称坐标', () => {
 const legacy=freshWorld();
 const raw=JSON.stringify(legacy);
 assert.equal(raw.includes('streetView'),false,'老档本身不含 streetView');

 const parsed=parseSave(raw);
 assert.deepEqual(parsed,legacy);
 assert.equal(parsed.streetView,undefined);
 assert.equal(Object.prototype.hasOwnProperty.call(parsed,'streetView'),false,'不得补出虚构坐标');
 assert.deepEqual(parsed.position,{x:1110,y:1220},'探索用地图坐标保持原样');

 const storage=createStorage({[SAVE_KEY]:raw});
 const loaded=loadWorld(storage);
 assert.equal(loaded.exists,true);
 assert.equal(loaded.error,'');
 assert.deepEqual(loaded.state,legacy);
 assert.equal(Object.prototype.hasOwnProperty.call(loaded.state,'streetView'),false);
 assert.equal(storage.raw(SAVE_KEY),raw,'读取老档不得改写原值');
 assert.deepEqual(storage.writes,[]);
});

test('老档再次保存不会写入虚构的 streetView', () => {
 const storage=createStorage();
 assert.deepEqual(saveWorld(storage,freshWorld()),{ok:true});
 const saved=JSON.parse(storage.raw(SAVE_KEY));
 assert.equal(Object.prototype.hasOwnProperty.call(saved,'streetView'),false);
 assert.deepEqual(saved.position,{x:1110,y:1220});
});

test('新档序列化后原样保留坐标与剧情物件', () => {
 const state=storyWorld();
 const before=JSON.parse(JSON.stringify(state));
 const storage=createStorage();

 assert.deepEqual(saveWorld(storage,state),{ok:true});
 assert.deepEqual(state,before,'保存不得改动传入的状态');
 const raw=storage.raw(SAVE_KEY);
 assert.equal(JSON.parse(raw).streetView.x,VIEW.x);
 assert.deepEqual(JSON.parse(raw).streetView,VIEW);

 // 直接解析与经 loadWorld 读取都必须保留四分量和剧情物件。
 assert.deepEqual(parseSave(raw),state);
 const loaded=loadWorld(storage);
 assert.equal(loaded.exists,true);
 assert.equal(loaded.error,'');
 assert.deepEqual(loaded.state,state);
 assert.deepEqual(loaded.state.streetView,VIEW);
 assert.deepEqual(loaded.state.items,state.items);
 assert.deepEqual(loaded.state.flags,state.flags);
 assert.deepEqual(loaded.state.notes,state.notes);
 assert.deepEqual(loaded.state.history,state.history);
 assert.equal(loaded.state.location,'laundry');
 assert.equal(loaded.state.revision,state.revision);

 // 再存一次仍然稳定，坐标不会因往返而漂移。
 assert.deepEqual(saveWorld(storage,loaded.state),{ok:true});
 assert.deepEqual(JSON.parse(storage.raw(SAVE_KEY)),JSON.parse(raw));
});

test('streetView 任一分量为字符串时拒绝解析和保存', () => {
 for(const key of ['x','z','heading','pitch']){
  const broken={...freshWorld(),streetView:{...VIEW,[key]:String(VIEW[key])}};
  assert.throws(()=>parseSave(JSON.stringify(broken)),/第一人称游玩位置无效/,'分量 '+key+' 不应被强制转换');
 }

 const broken={...freshWorld(),streetView:{...VIEW,x:'16.7'}};
 const storage=createStorage();
 assert.deepEqual(saveWorld(storage,broken),{ok:false,error:'进度状态无效，本次未保存。'});
 assert.equal(storage.raw(SAVE_KEY),null);
 assert.deepEqual(storage.writes,[]);
});

test('streetView 越界坐标与俯仰角被拒绝，边界值仍可接受', () => {
 for(const view of [
  {...VIEW,x:60.01},
  {...VIEW,x:-60.01},
  {...VIEW,z:60.01},
  {...VIEW,z:-60.01},
  {...VIEW,pitch:1.141},
  {...VIEW,pitch:-1.051},
 ]){
  assert.throws(()=>parseSave(JSON.stringify({...freshWorld(),streetView:view})),/第一人称游玩位置无效/,'应拒绝 '+JSON.stringify(view));
 }

 for(const view of [
  {...VIEW,x:60,z:-60,pitch:1.14},
  {...VIEW,x:-60,z:60,pitch:-1.05},
 ]){
  const parsed=parseSave(JSON.stringify({...freshWorld(),streetView:view}));
  assert.deepEqual(parsed.streetView,view,'边界值应原样保留');
 }
});

test('streetView 缺分量或不是普通对象时被拒绝', () => {
 for(const key of ['x','z','heading','pitch']){
  const view={...VIEW};
  delete view[key];
  const raw=JSON.stringify({...freshWorld(),streetView:view});
  assert.throws(()=>parseSave(raw),/第一人称游玩位置无效/,'缺少 '+key);
  const loaded=loadWorld(createStorage({[SAVE_KEY]:raw}));
  assert.equal(loaded.exists,false);
  assert.match(loaded.error,/第一人称游玩位置无效/);
 }

 for(const value of [null,[],'16.7,-0.45',3]){
  const raw=JSON.stringify({...freshWorld(),streetView:value});
  assert.throws(()=>parseSave(raw),/第一人称游玩位置无效/,'应拒绝 '+JSON.stringify(value));
 }
});

test('损坏 JSON 读取失败时保留原值且不写入', () => {
 for(const raw of ['{oops','','null','[]','"street"']){
  const storage=createStorage({[SAVE_KEY]:raw});
  const loaded=loadWorld(storage);
  assert.equal(loaded.exists,false);
  assert.equal(loaded.error.includes('原数据已保留'),true,'错误应说明原数据已保留：'+loaded.error);
  assert.deepEqual(loaded.state,freshWorld());
  assert.equal(Object.prototype.hasOwnProperty.call(loaded.state,'streetView'),false);
  assert.equal(storage.raw(SAVE_KEY),raw,'损坏原值不得被覆盖');
  assert.deepEqual(storage.writes,[]);
 }
});

test('存储读取抛错时给出诚实提示且不抛出', () => {
 const storage={
  getItem(){throw Error('denied');},
  setItem(){throw Error('denied');},
  removeItem(){throw Error('denied');},
 };
 const loaded=loadWorld(storage);
 assert.equal(loaded.exists,false);
 assert.match(loaded.error,/无法访问浏览器存储/);
 assert.deepEqual(loaded.state,freshWorld());
 assert.equal(loaded.state.streetView,undefined);
});

test('重新开始清除三个故事的进度并保留设置与学习记录', () => {
 const raw=JSON.stringify(storyWorld());
 const chapters=['yuekei-story-trial-v1:table','yuekei-story-trial-v1:reunion'];
 const storage=createStorage({
  [SAVE_KEY]:raw, [chapters[0]]:'{}', [chapters[1]]:'{}',
  [SETTINGS_KEY]:'large',
  [LEARNING_KEY]:'{"mode":"beginner","showMeaning":false}',
 });

 assert.deepEqual(resetWorld(storage),{ok:true});
 assert.equal(storage.raw(SAVE_KEY),null);
 assert.equal(storage.raw(SETTINGS_KEY),'large');
 assert.equal(storage.raw(LEARNING_KEY),'{"mode":"beginner","showMeaning":false}');
 assert.deepEqual(storage.removals,[...chapters,SAVE_KEY],'只清除这三个故事');
 assert.deepEqual(storage.keys().sort(),[LEARNING_KEY,SETTINGS_KEY].sort());

 const loaded=loadWorld(storage);
 assert.equal(loaded.exists,false);
 assert.equal(loaded.error,'');
 assert.deepEqual(loaded.state,freshWorld());
 assert.equal(loaded.state.streetView,undefined);
});

test('保存失败不覆盖已有新档，存储写入异常也不破坏原值', () => {
 const raw=JSON.stringify(storyWorld());
 const storage=createStorage({[SAVE_KEY]:raw});
 const bad={...storyWorld(),streetView:{...VIEW,pitch:2}};
 assert.deepEqual(saveWorld(storage,bad),{ok:false,error:'进度状态无效，本次未保存。'});
 assert.equal(storage.raw(SAVE_KEY),raw);
 assert.deepEqual(storage.writes,[]);

 const failing={
  getItem:()=>raw,
  setItem(){throw Error('quota');},
  removeItem(){},
 };
 assert.deepEqual(saveWorld(failing,storyWorld()),{
  ok:false,
  error:'进度未保存：浏览器存储不可用，请暂时不要关闭页面。',
 });
 const loaded=loadWorld(failing);
 assert.equal(loaded.exists,true);
 assert.deepEqual(loaded.state.streetView,VIEW,'旧新档坐标仍在');
});
