import test from 'node:test';
import assert from 'node:assert/strict';
import {SHOPS,atShopCounter,shopBlocks} from '../street-space.js';

const east=SHOPS.eastBread;

// 按商铺局部坐标取点：depth 沿柜台朝向，side 为横向偏移。
function counterPoint(shop,depth,side=0){
 return {
  x:shop.x+shop.sin*depth+shop.cos*side,
  z:shop.z+shop.cos*depth-shop.sin*side,
 };
}

function near(point,expected,tolerance=1e-9){
 assert.ok(
  Math.hypot(point.x-expected.x,point.z-expected.z)<=tolerance,
  '期望 '+JSON.stringify(expected)+'，实际 '+JSON.stringify(point)
 );
}

test('eastBread 面向 +X：前方一米可交谈', () => {
 assert.ok(east,'eastBread 必须存在');
 assert.equal(atShopCounter(east,{x:6.24,z:-6.94}),true,'前方 1 米');
 assert.equal(atShopCounter(east,{x:6.74,z:-6.94}),true,'前方 1.5 米');
 assert.equal(atShopCounter(east,{x:5.24,z:-6.94}),true,'柜台线上');
});

test('eastBread 背后一米、横向两米都不可交谈', () => {
 for(const point of [
  {x:4.24,z:-6.94},
  {x:5.24,z:-8.94},
  {x:5.24,z:-4.94},
  {x:4.51,z:-6.94},
 ]){
  assert.equal(atShopCounter(east,point),false,JSON.stringify(point));
 }
});

test('eastBread 柜面后 0.73 米阻挡，正常站位不阻挡', () => {
 assert.equal(shopBlocks(east,{x:4.51,z:-6.94}),true,'柜面后 0.73 米');
 assert.equal(shopBlocks(east,{x:6.24,z:-6.94}),false,'前方 1 米不应阻挡');
 assert.equal(shopBlocks(east,{x:5.24,z:-8.94}),true,'横向 2 米的柜台侧翼');
 assert.equal(shopBlocks(east,{x:20,z:-6.94}),false,'五米外直接放行');
});

test('交谈范围有明确的纵深与横向内界', () => {
 assert.equal(atShopCounter(east,counterPoint(east,1.9)),true);
 assert.equal(atShopCounter(east,counterPoint(east,2.05)),false);
 assert.equal(atShopCounter(east,counterPoint(east,-0.2)),true);
 assert.equal(atShopCounter(east,counterPoint(east,-0.3)),false);
 assert.equal(atShopCounter(east,counterPoint(east,0,1.0)),true);
 assert.equal(atShopCounter(east,counterPoint(east,0,1.2)),false);
});

test('其它朝向以各自局部前方为准', () => {
 const cardinal={
  eastBread:{x:6.24,z:-6.94},
  radio:{x:6.24,z:7},
  westBread:{x:-6.25,z:7},
  herbs:{x:-6.25,z:-6.94},
  arcade:{x:0.10,z:-18.16},
  southPrint:{x:-21,z:19.75},
 };
 for(const [id,expected] of Object.entries(cardinal)){
  const shop=SHOPS[id];
  assert.ok(shop,id+' 必须存在');
  near(counterPoint(shop,1),expected);
  assert.equal(atShopCounter(shop,counterPoint(shop,1)),true,id+' 前方');
  assert.equal(atShopCounter(shop,counterPoint(shop,-1)),false,id+' 背后');
  assert.equal(shopBlocks(shop,counterPoint(shop,-0.73)),true,id+' 柜面后阻挡');
 }

 // 带 -5° 旋转的布庄：前方仍沿 yaw 方向，背后与横向不可交谈。
 const cloth=SHOPS.banyanCloth;
 assert.ok(cloth,'banyanCloth 必须存在');
 near(counterPoint(cloth,1),{x:-20.516,z:-16.812},1e-3);
 assert.equal(atShopCounter(cloth,counterPoint(cloth,1)),true);
 assert.equal(atShopCounter(cloth,counterPoint(cloth,-1)),false);
 assert.equal(atShopCounter(cloth,counterPoint(cloth,0,2)),false);
});

test('全部商铺前方一米可交谈，背后与横向两米不可', () => {
 const ids=Object.keys(SHOPS);
 assert.ok(ids.length>=19,'街区应包含全部商铺');
 for(const id of ids){
  const shop=SHOPS[id];
  for(const depth of [1,1.5])assert.equal(atShopCounter(shop,counterPoint(shop,depth)),true,id+' 前方 '+depth);
  for(const depth of [-1,2.2])assert.equal(atShopCounter(shop,counterPoint(shop,depth)),false,id+' 纵深 '+depth);
  for(const side of [2,-2,1.2])assert.equal(atShopCounter(shop,counterPoint(shop,0,side)),false,id+' 横向 '+side);
  assert.equal(shopBlocks(shop,counterPoint(shop,1)),false,id+' 正常站位不应被阻挡');
  assert.equal(shopBlocks(shop,counterPoint(shop,-0.73)),true,id+' 柜台后方应阻挡');
 }
});

test('重复检查不更改商铺数据与传入点位', () => {
 const snapshot=JSON.parse(JSON.stringify(SHOPS));
 const eastSnapshot=JSON.parse(JSON.stringify(east));
 const points=[
  counterPoint(east,1),
  counterPoint(east,-1),
  counterPoint(east,0,2),
  counterPoint(east,-0.73),
 ];
 const pointsSnapshot=points.map(point=>JSON.stringify(point));

 for(let round=0;round<4;round++){
  for(const point of points){
   assert.equal(atShopCounter(east,point),atShopCounter(east,{...point}));
   assert.equal(shopBlocks(east,point),shopBlocks(east,{...point}));
   assert.doesNotThrow(()=>atShopCounter(east,Object.freeze({...point})));
   assert.doesNotThrow(()=>shopBlocks(east,Object.freeze({...point})));
  }
 }

 assert.deepEqual(SHOPS,snapshot,'SHOPS 数据不得被检查过程改写');
 assert.deepEqual(east,eastSnapshot,'单个商铺配置不得被改写');
 assert.deepEqual(points.map(point=>JSON.stringify(point)),pointsSnapshot,'传入点位不得被改写');
 assert.equal(atShopCounter(east,points[0]),true);
 assert.equal(atShopCounter(east,points[1]),false);
});
