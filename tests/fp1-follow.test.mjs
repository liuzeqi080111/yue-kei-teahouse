import assert from 'node:assert/strict';
import {createFollowController} from '../fp1-follow.js';
import {createFp1Travel} from '../fp1-travel.js';
import {canMove, shopPath, start, streetPath} from '../fp1-scene.js';

const segment=createFollowController({
  waypoints:[{x:0,z:0},{x:1,z:0}],
  speed:1,
  arriveRadius:.05,
  maxStep:.1
});
for (let i=0;i<9;i++) segment.tick(.1);
const nearEnd=segment.tick(.06,(_from,to)=>to.x<.98);
assert.equal(nearEnd.mode,'arrived');
assert.ok(Math.abs(nearEnd.position.x-.96)<1e-8,'arrival cannot snap through an obstacle or exceed the frame budget');
nearEnd.position.x=0;
assert.ok(segment.snapshot().position.x>.95,'snapshots do not expose mutable controller state');

const arrivals=[];
const travel=createFp1Travel({
  initial:start,
  canMove,
  onArrive:tag=>{
    arrivals.push(tag);
    if (tag==='street') travel.start(shopPath.slice(1),'shop');
  }
});
travel.start(streetPath.slice(1),'street');
travel.tick(10);
assert.ok(Math.hypot(travel.snapshot().position.x-start.x,travel.snapshot().position.z-start.z)<.18);
travel.pause();
const paused=travel.snapshot().position;
travel.tick(1);
assert.deepEqual(travel.snapshot().position,paused);
travel.move(.1,0);
assert.equal(travel.snapshot().mode,'paused');
assert.notDeepEqual(travel.snapshot().position,paused);
travel.resume();
for (let i=0;i<250;i++) travel.tick(.08);
assert.deepEqual(arrivals,['street','shop']);
assert.equal(travel.snapshot().mode,'arrived');

travel.reset({x:.34,z:-17.8});
for (let i=0;i<10;i++) travel.move(0,-.18);
assert.equal(travel.snapshot().reason,'blocked');
assert.ok(travel.snapshot().position.z>-18.16);
console.log('PASS first-person arrival budget, detach and rejoin, doorway and counter collision');
