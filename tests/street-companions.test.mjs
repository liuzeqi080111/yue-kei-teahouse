import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createFp1Travel } from '../fp1-travel.js';
import { createStreetCompanions } from '../street-companions.js';
import { atFangCounter } from '../street-fang.js';
import { COUNTER, HOME, createStreetNav, distance } from '../street-space.js';

const layout=JSON.parse(readFileSync(new URL('../assets/street/walk.json',import.meta.url)));
const nav=createStreetNav(layout);
const counterPlace={x:14.59,z:-.21};
const dt=1/30;

function rig(x,z){
 const position={x,z,set(x,y,z){Object.assign(this,{x,y,z});}};
 return {model:{position,rotation:{y:0},visible:true}};
}
function checkPeople(player,friend,qing){
 const a=friend.model.position,b=qing.model.position;
 for(const [from,to] of [[player,a],[player,b],[a,b]])assert.ok(distance(from,to)>=.7799);
 for(const p of [player,a,b])assert.ok(nav.walkable(p.x,p.z));
}

test('walk past both companions, stop, and turn back without pushing through either rig',()=>{
 const start={x:11,z:8.9},friend=rig(11.04,7.45),qing=rig(10.98,6.35);
 const group=createStreetCompanions(nav,friend,qing);
 group.reset(start);
 const travel=createFp1Travel({initial:start,canMove:(from,to)=>group.canPlayerMove(from,to,true)});
 for(const [speed,frames] of [[-2.45,50],[0,16],[2.45,50]]){
  for(let i=0;i<frames;i++){
   const {position}=travel.move(0,speed*dt);
   group.walk(position,dt,null);checkPeople(position,friend,qing);
  }
  if(speed<0)assert.ok(travel.snapshot().position.z<5.5,'player overtakes the starting positions of both companions');
 }
 assert.ok(travel.snapshot().position.z>8.5,'return to the starting stretch');
});

test('pass the laundry corner, then let both companions take separate counter positions',()=>{
 const friend=rig(12.83,8.18),qing=rig(13.8,8.96),group=createStreetCompanions(nav,friend,qing);
 group.reset(HOME);
 const travel=createFp1Travel({initial:HOME,canMove:(from,to)=>group.canPlayerMove(from,to,true)});
 travel.start(nav.path(HOME,COUNTER));
 for(let i=0;i<450;i++){
  const {position,reason}=travel.tick(dt);
  if(reason==='blocked'&&group.retryPlayer)travel.resume();
  group.walk(position,dt,atFangCounter(position)?counterPlace:null);
  checkPeople(position,friend,qing);
 }
 assert.equal(travel.snapshot().mode,'arrived');
 assert.ok(distance(qing.model.position,counterPlace)<.10);
 assert.ok(distance(friend.model.position,{x:12.55,z:.48})<.10);
});

test('a stationary quest character keeps her position when approached head on',()=>{
 const friend=rig(10,7),qing=rig(11,7),start={x:11,z:8.6},group=createStreetCompanions(nav,friend,qing);
 group.reset(start);
 const travel=createFp1Travel({initial:start,canMove:(from,to)=>group.canPlayerMove(from,to,false)});
 for(let i=0;i<40;i++)travel.move(0,-.05);
 checkPeople(travel.snapshot().position,friend,qing);
 assert.equal(qing.model.position.x,11);assert.equal(qing.model.position.z,7);
});
