import {chapters} from './story-chapters.js';
import {ACTORS,REST,RESTAURANT} from './street-space.js';

const qingAtHome={...ACTORS.qing,name:'安和楼梯口'};
const qingAtMarket={name:'玲记衣铺门边',position:[-14.57,.111,-9.42],point:{x:-13.55,z:-9.14},zone:[-14.42,-12.98,-9.88,-8.18]};
export function qingLocation(world){
 return world.flags.includes('coat-route-buy')&&!world.coatOutcome?qingAtMarket:qingAtHome;
}

// Derive all three entries from the save, including saves made mid-story.
export function streetQuests(w,completed={}){
 const f=id=>w.flags.includes(id),has=id=>w.items.includes(id);
 function coat(){
  if(!f('coat-start'))return ['qing','到安和楼梯口，问阿晴为什么着急。','coat-start'];
  if(!f('shop-check'))return ['fang','陪阿晴去洗衣店，把取件单交给芳姐。','shop-check'];
  if(f('coat-pickup-visit')&&!f('coat-inspected'))return ['fang','在芳姐柜前把外套递给阿晴，让她看右袖口。','show-coat'];
  if(has('coat')&&(!w.coatOutcome||f('qing-returned')))return ['qing','带着外套去找阿晴。她在'+qingLocation(w).name+'等你，把外套亲手交给她。',w.coatOutcome?'coat-return-original':'coat-return'];
  if(has('coat'))return ['rest','带着外套去找阿晴。她还在面试，先到榕树下等她回来。','rest'];
  if(!w.coatOutcome&&!w.flags.some(k=>k.startsWith('coat-route-')))return ['fang','问芳姐怎么办，选定找回、借用或买衣。','coat-route-recover'];
  if(!w.coatOutcome){
   if(f('qing-paid-coat'))return ['qing','阿晴已经在玲记付了钱，送她穿着新外套去面试。','coat-emergency'];
   if(has('newCoat')||has('loanCoat'))return ['qing','把面试用衣交给阿晴，送她去面试。','coat-emergency'];
   if(f('coat-route-borrow'))return ['ling','到夜市衣铺，向玲姐借一件面试外套。','coat-loan'];
   if(f('coat-route-buy'))return f('coat-quoted')?['qing','在衣铺旁找阿晴确认价格，由她付款。','coat-buy']:['ling','陪阿晴到夜市，请玲姐报价。','coat-quote'];
  }
  if(!w.coatOutcome||f('coat-misunderstanding')&&!f('original-returned')){
   if(!f('guest-found'))return ['ming','先到粤记门口问阿明，哪位客人拿错了衣服。','guest-found'];
   if(!f('coat-detail'))return ['qing','回安和楼，请阿晴说清袖口和内袋的特征。','coat-detail'];
   if(!has('coat'))return ['guest','找粤记门口的周叔，出示取衣记录，核对袖口并换衣。','coat-swap'];
  }
  if(!f('qing-returned'))return ['rest','阿晴去面试了。到榕树下歇一会，等她回来。','rest'];
  if(!f('loan-returned')&&(has('loanCoat')||f('qing-wore-loan')))return has('loanCoat')?['ling','把借来的外套还给玲姐。','loan-returned']:['qing','阿晴回来了，向她取回借衣。','coat-collect-loan'];
  if(f('coat-misunderstanding'))return ['fang','回洗衣店，向芳姐说明两件外套拿反的经过。','laundry-reconcile'];
  if(!f('coat-epilogue'))return ['qing','到安和楼问阿晴面试如何，听她道谢。','coat-followup'];
  return [null,'阿晴穿上面试外套，已向你道谢。'];
 }
 const [npc,text,action]=coat();
 const result=[{id:'coat',name:'阿晴的面试外套',npc,text,action,done:!npc}];
 for(const id of ['table','reunion']){
  const name=chapters[id].title,done=completed[id]===true;
  result.push({id,name,done,href:'./story-preview.html?story='+id,npc:done?null:'restaurant',
   text:done?'已完成《'+name+'》。':'去粤记门口，或在任务菜单进入《'+name+'》。'});
 }
 return result;
}

export function questPoint(quest,world){
 if(quest.npc==='restaurant')return RESTAURANT;
 if(quest.npc==='rest')return REST;
 if(quest.npc==='qing')return qingLocation(world).point;
 return ACTORS[quest.npc]?.point;
}
