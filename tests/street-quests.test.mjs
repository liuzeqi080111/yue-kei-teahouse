import {applyChapterDay} from '../campaign.js';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {freshWorld, applyWorldAction, restEvent, parseSave, optionsFor, coatOwners} from '../neighborhood-state.js';
import {chapterCompleted} from '../story-chapters.js';
import {ACTORS, SHOPS, createStreetNav, rackBlocks, rackLayout, marketRoomBlocks, shopBlocks} from '../street-space.js';
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

test('every displayed coat step is playable up to the ending',()=>{
 let w=firstPerson();
 for(let i=0;i<24;i++){
  const q=streetQuests(w)[0];
  if(q.done)return;
  assert.ok(questPoint(q,w));w=takeStep(w,'coat');
 }
 assert.fail('quest never completed');
});
test('retired tracking migrates while historical possessions and coat progress survive',()=>{
 for(const trackedQuest of ['record','stall']){
  const w=parseSave(JSON.stringify({...firstPerson(),trackedQuest,flags:['coat-start','reunion-invite'],items:['contact','ticket']}));
  assert.equal(w.trackedQuest,'coat');
  assert.deepEqual(w.items,['contact','ticket']);
  assert.equal(streetQuests(w)[0].action,'shop-check');
  assert.deepEqual(streetQuests(w).map(q=>q.id),['coat','table','reunion']);
  assert.ok(!optionsFor(w,'southRice').some(o=>o.id==='record-accept'));
  assert.ok(!restEvent(w).flags.includes('reunion-arrived'));
 }
});
test('restaurant chapters point to the entrance until complete, including older endings',()=>{
 const w=firstPerson();
 const completed={table:chapterCompleted('table',{node:'morning'}),reunion:chapterCompleted('reunion',{node:'join'})};
 const [,table,reunion]=streetQuests(w,completed);
 assert.ok(table.done);assert.ok(!questPoint(table,w));
 assert.equal(reunion.done,false);assert.ok(questPoint(reunion,w));
 assert.equal(chapterCompleted('reunion',{node:'tidy'}),true);
 assert.equal(chapterCompleted('table',{node:'door',completed:true}),true);
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
 const nav=createStreetNav(layout,p=>marketRoomBlocks(p)||Object.values(SHOPS).some(shop=>shopBlocks(shop,p))||rackBlocks(rack,p));
 for(const [id,shop] of Object.entries(SHOPS)){
  const counter={x:shop.x+1.2*shop.sin,z:shop.z+1.2*shop.cos};
  assert.ok(nav.path(ACTORS.qing.point,counter).length,'shop entrance '+id);
 }
 const points=Object.fromEntries(Object.entries(ACTORS).map(([id,a])=>[id,a.point]));
 for(const id of ['southRice','rest'])points[id]=questPoint({npc:id},w);
 for(const [a,from] of Object.entries(points))for(const [b,to] of Object.entries(points)){
  const travel=createFp1Travel({initial:from,canMove:nav.line});
  travel.start(nav.path(from,to));
  for(let i=0;i<1800&&travel.snapshot().mode==='following';i++)travel.tick(i%2?.045:.026);
  assert.equal(travel.snapshot().mode,'arrived',a+' → '+b);
 }
});

test('borrowed coat cannot be returned before the interview and old early returns can recover',()=>{
 let w=firstPerson();
 while(streetQuests(w)[0].action!=='coat-route-recover')w=takeStep(w,'coat');
 w=applyWorldAction(w,'fang','coat-route-borrow').state;
 w=applyWorldAction(w,'ling','coat-loan').state;
 const refused=applyWorldAction(w,'ling','loan-returned');
 assert.equal(refused.ok,false);
 assert.ok(w.items.includes('loanCoat'));
 const old={...w,items:w.items.filter(x=>x!=='loanCoat'),flags:[...w.flags,'loan-returned']};
 const retry=applyWorldAction(parseSave(JSON.stringify(old)),'ling','coat-loan');
 assert.equal(retry.ok,true);
 w=retry.state;
 assert.equal(w.flags.includes('loan-returned'),false);
 for(let i=0;i<25&&!streetQuests(w)[0].done;i++)w=takeStep(w,'coat');
 assert.equal(streetQuests(w)[0].done,true);
 assert.ok(w.flags.includes('loan-returned'));
 assert.equal(applyWorldAction(w,'ling','loan-returned').ok,false);
});

test('both physical coats retain their holders across borrowing, collection and reloads',()=>{
 let w=firstPerson();
 const use=(npc,id)=>{
  const result=applyWorldAction(w,npc,id);
  assert.ok(result.ok,npc+'/'+id);
  w=parseSave(JSON.stringify(result.state));
 };
 while(streetQuests(w)[0].action!=='coat-route-recover')w=takeStep(w,'coat');
 use('fang','coat-route-borrow');use('ling','coat-loan');
 assert.match(streetQuests(w)[0].text,/带着借来的外套去找阿晴/);
 use('ming','guest-found');use('guest','coat-swap');
 assert.deepEqual(coatOwners(w),{loan:'player',original:'player'});
 assert.equal(streetQuests(w)[0].action,'coat-emergency');
 use('qing','coat-emergency');
 assert.deepEqual(coatOwners(w),{loan:'aqing',original:'player'});
 assert.equal(streetQuests(w)[0].action,'rest');
 w=restEvent(w);
 assert.equal(streetQuests(w)[0].action,'coat-collect-loan');
 use('qing','coat-collect-loan');
 assert.deepEqual(coatOwners(w),{loan:'player',original:'player'});
 assert.equal(streetQuests(w)[0].action,'loan-returned');
 use('ling','loan-returned');use('qing','coat-return-original');
 assert.deepEqual(coatOwners(w),{loan:'ling',original:'aqing'});
 assert.ok(!w.items.includes('coat')&&!w.items.includes('loanCoat'));
});

test('an original recovered on the shopping route resumes at Qing’s current shop or home',()=>{
 let w=firstPerson();
 while(streetQuests(w)[0].action!=='coat-route-recover')w=takeStep(w,'coat');
 for(const [npc,id] of [['fang','coat-route-buy'],['ming','guest-found'],['guest','coat-swap']]){
  const result=applyWorldAction(w,npc,id);assert.ok(result.ok);w=result.state;
 }
 const saved=parseSave(JSON.stringify(w)),atShop=streetQuests(saved)[0];
 assert.equal(atShop.action,'coat-return');assert.match(atShop.text,/带着外套去找阿晴.*玲记/);
 assert.ok(saved.items.includes('coat'));assert.ok(!saved.items.includes('wrongCoat'));
 assert.ok(Math.hypot(questPoint(atShop,saved).x-ACTORS.ling.point.x,questPoint(atShop,saved).z-ACTORS.ling.point.z)<2);
 assert.ok(!applyWorldAction(saved,'guest','coat-swap').ok);
 const quoted=applyWorldAction(saved,'ling','coat-quote');assert.ok(quoted.ok);
 const paid=applyWorldAction(quoted.state,'qing','coat-buy');assert.ok(paid.ok);
 const emergency=applyWorldAction(paid.state,'qing','coat-emergency');assert.ok(emergency.ok);
 const away=emergency.state;
 assert.equal(streetQuests(away)[0].action,'rest');
 const back=restEvent(away),atHome=streetQuests(back)[0];
 assert.equal(atHome.action,'coat-return-original');assert.match(atHome.text,/安和楼/);
 assert.deepEqual(questPoint(atHome,back),ACTORS.qing.point);
 const handed=applyWorldAction(back,'qing',atHome.action);
 assert.ok(handed.ok);assert.ok(!handed.state.items.includes('coat'));
 assert.ok(!applyWorldAction(handed.state,'qing',atHome.action).ok);
});

test('table completion advances from the current day exactly once across a partial save and reload',()=>{
 const values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
 const worldKey='mgoi-neighborhood-v1',tableKey='yuekei-story-trial-v1:table';
 values.set(worldKey,JSON.stringify({...firstPerson(),day:7}));
 assert.equal(applyChapterDay(storage),null);
 assert.equal(streetQuests(firstPerson())[2].locked,true);
 values.set(tableKey,JSON.stringify({node:'morning'}));
 assert.equal(applyChapterDay(storage),8);assert.equal(JSON.parse(values.get(worldKey)).day,8);
 values.set(worldKey,JSON.stringify({...firstPerson(),day:7}));
 assert.equal(applyChapterDay(storage),8);assert.equal(applyChapterDay(storage),8);
 values.set(tableKey,JSON.stringify({node:'morning'}));
 assert.equal(applyChapterDay(storage),8);
 assert.equal(JSON.parse(values.get(worldKey)).trackedQuest,'reunion');
 assert.equal(streetQuests(firstPerson(),{table:true})[2].locked,false);
});
