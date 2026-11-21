import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {freshWorld, applyWorldAction, restEvent, parseSave} from '../neighborhood-state.js';
import {ACTORS, SHOPS, createStreetNav, rackBlocks, rackLayout, shopBlocks} from '../street-space.js';
import {streetQuests, questPoint} from '../street-quests.js';
import {createFp1Travel} from '../fp1-travel.js';

function firstPerson(){
 return {...freshWorld(),streetView:{...ACTORS.fang.point,heading:0,pitch:0}};
}
function takeStep(w,id){
 const q=streetQuests(w).find(q=>q.id===id);
 if(q.action==='rest')return restEvent(w);
 const [npc,action]=q.action==='show-coat'?['qing','coat-inspect']:[q.npc,q.action];
 const result=applyWorldAction(w,npc,action);
 assert.equal(result.ok,true,npc+' / '+action);
 return result.state;
}

for(const id of ['coat','record','stall']){
 test('every displayed step is playable through the ending of '+id,()=>{
  let w=firstPerson();
  for(let i=0;i<24;i++){
   const q=streetQuests(w).find(q=>q.id===id);
   if(q.done)return;
   assert.ok(questPoint(q,w));
   w=takeStep(w,id);
  }
  assert.fail('quest never completed');
 });
}
test('an old save resumes the invitation after the contact or gift ending',()=>{
 for(const outcome of ['contact','gift']){
  let w=firstPerson();w.recordOutcome=outcome;
  w=parseSave(JSON.stringify(w));
  assert.equal(streetQuests(w)[1].action,'record-after');
  for(let i=0;i<4;i++)w=takeStep(w,'record');
  assert.equal(streetQuests(w)[1].done,true);
  assert.equal(w.money,30000);
 }
});
for(const route of ['buy','borrow']){
 test('the '+route+' route guides the player through returning the original coat',()=>{
  let w=firstPerson();
  while(streetQuests(w)[0].action!=='coat-route-recover')w=takeStep(w,'coat');
  w=applyWorldAction(w,'fang','coat-route-'+route).state;
  for(let i=0;i<22&&!streetQuests(w)[0].done;i++)w=takeStep(w,'coat');
  assert.equal(streetQuests(w)[0].done,true);
  assert.ok(w.flags.includes('original-returned'));
 });
}
test('guided walks between story destinations reach the interaction point',()=>{
 const layout=JSON.parse(readFileSync(new URL('../assets/street/walk.json',import.meta.url)));
 const w=firstPerson(),rack=rackLayout(w);
 const nav=createStreetNav(layout,p=>Object.values(SHOPS).some(shop=>shopBlocks(shop,p))||rackBlocks(rack,p));
 const points=Object.fromEntries(Object.entries(ACTORS).map(([id,a])=>[id,a.point]));
 for(const id of ['southRice','rest'])points[id]=questPoint({npc:id},w);
 for(const [a,from] of Object.entries(points))for(const [b,to] of Object.entries(points)){
  const travel=createFp1Travel({initial:from,canMove:nav.line});
  travel.start(nav.path(from,to));
  for(let i=0;i<1800&&travel.snapshot().mode==='following';i++)travel.tick(i%2?.045:.026);
  assert.equal(travel.snapshot().mode,'arrived',a+' → '+b);
 }
});
