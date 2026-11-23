import assert from 'node:assert/strict';
import test from 'node:test';
import {createStreetNav,crossesPerson,distance,guidedStreetPath,PERSON_CLEARANCE} from '../street-space.js';

const layout={x0:0,z0:0,w:121,h:61,step:.1,rows:Array.from({length:61},()=>[0,121,22])};
const nav=createStreetNav(layout),from={x:1,z:3},target={x:10,z:3};

test('guide rounds a bystander and uses a free spot in the destination interaction area',()=>{
 const people=[{x:5,z:3},{x:10,z:3}].map(position=>({position,moving:false}));
 const allowed=p=>distance(p,target)<=1.4&&p.z>=3;
 const steps=guidedStreetPath(nav,from,target,allowed,people);
 assert.ok(steps.length>1);assert.ok(allowed(steps.at(-1)));
 assert.ok(distance(steps.at(-1),target)>=PERSON_CLEARANCE);
 let old=from;
 for(const step of steps){
  for(const {position} of people)assert.equal(crossesPerson(old,step,position),false);
  old=step;
 }
});

test('a neighbour entering an existing route is avoided on the next plan',()=>{
 const people=[{position:{x:6,z:5},moving:true}];
 const allowed=p=>distance(p,target)<.2;
 assert.deepEqual(guidedStreetPath(nav,from,target,allowed,people),[target]);
 const current={x:4.8,z:3};people[0].position={x:5.8,z:3};
 assert.ok(crossesPerson(current,target,people[0].position));
 const steps=guidedStreetPath(nav,current,target,allowed,people);
 assert.ok(steps.length>1);
 let old=current;
 for(const step of steps){
  assert.equal(crossesPerson(old,step,people[0].position),false);
  old=step;
 }
});

test('a save inside a character can step out, and cannot move deeper into the overlap',()=>{
 const person={x:2,z:3},start={x:2.1,z:3};
 assert.ok(crossesPerson(start,{x:2.05,z:3},person));
 assert.equal(crossesPerson(start,{x:2.24,z:3},person),false);
 const destination={x:.4,z:3};
 const steps=guidedStreetPath(nav,start,destination,p=>distance(p,destination)<.2,[{position:person,moving:false}]);
 assert.ok(steps.length>1);
 let old=start;
 for(const step of steps){
  assert.equal(crossesPerson(old,step,person),false);
  old=step;
 }
});
