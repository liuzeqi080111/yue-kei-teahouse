import {ACTORS,REST} from './street-space.js';

// Derive all three entries from the save, including saves made mid-story.
export function streetQuests(w){
 const f=id=>w.flags.includes(id),has=id=>w.items.includes(id);
 function coat(){
  if(!f('coat-start'))return ['qing','到安和楼梯口，问阿晴为什么着急。','coat-start'];
  if(!f('shop-check'))return ['fang','陪阿晴去洗衣店，把取件单交给芳姐。','shop-check'];
  if(f('coat-pickup-visit')&&!f('coat-inspected'))return ['fang','在芳姐柜前把外套递给阿晴，让她看右袖口。','show-coat'];
  if(!w.coatOutcome&&!w.flags.some(k=>k.startsWith('coat-route-')))return ['fang','问芳姐怎么办，选定找回、借用或买衣。','coat-route-recover'];
  if(has('coat')&&!w.coatOutcome)return ['qing','已和周叔换衣。回安和楼，把原衣交给阿晴。','coat-return'];
  if(!w.coatOutcome){
   if(f('qing-paid-coat')||has('newCoat')||has('loanCoat'))return ['qing','把面试用衣交给阿晴，送她去面试。','coat-emergency'];
   if(f('coat-route-borrow'))return ['ling','到夜市衣铺，向玲姐借一件面试外套。','coat-loan'];
   if(f('coat-route-buy'))return f('coat-quoted')?['qing','在衣铺旁找阿晴确认价格，由她付款。','coat-buy']:['ling','陪阿晴到夜市，请玲姐报价。','coat-quote'];
  }
  if(!w.coatOutcome||f('coat-misunderstanding')&&!f('original-returned')){
   if(!f('guest-found'))return ['ming','先到粤记门口问阿明，哪位客人拿错了衣服。','guest-found'];
   if(!f('coat-detail'))return ['qing','回安和楼，请阿晴说清袖口和内袋的特征。','coat-detail'];
   if(!has('coat'))return ['guest','找粤记门口的周叔，出示取衣记录，核对袖口并换衣。','coat-swap'];
   if(f('qing-returned'))return ['qing','回安和楼，把找回的原衣交给阿晴。','coat-return-original'];
  }
  if(!f('qing-returned'))return ['rest','阿晴去面试了。到榕树下歇一会，等她回来。','rest'];
  if(f('qing-wore-loan')&&!f('loan-returned'))return has('loanCoat')?['ling','把借来的外套还给玲姐。','loan-returned']:['qing','阿晴回来了，向她取回借衣。','coat-collect-loan'];
  if(f('coat-misunderstanding'))return ['fang','回洗衣店，向芳姐说明两件外套拿反的经过。','laundry-reconcile'];
  if(!f('coat-epilogue'))return ['qing','到安和楼问阿晴面试如何，听她道谢。','coat-followup'];
  return [null,'阿晴穿上面试外套，已向你道谢。'];
 }
 function record(){
  if(f('record-reunited'))return [null,'林伯和祥伯在榕树下听完了当年的曲子。'];
  if(f('reunion-arrived'))return ['lam','两位老友都到了。去棋桌边，请林伯放唱片。','record-reunion'];
  if(f('reunion-date'))return ['rest','到榕树下等到约定时段，和两位老人碰面。','rest'];
  if(f('reunion-invite'))return ['southRice','到夜市杂货铺找祥伯，把林伯的邀约带给他。','record-accept'];
  if(w.recordOutcome)return ['lam','回棋桌问林伯旧友的回音，约他们见一面。','record-after'];
  if(has('contact'))return ['lam','回棋桌把旧友的消息告诉林伯。','record-contact'];
  if(!f('record-start'))return ['lam','在榕树下陪林伯下两手棋，问起他和旧友的唱片。','record-start'];
  if(!f('sleeve-read'))return ['lok','到夜市唱片店，请阿乐给你看封套留言。','sleeve-read'];
  return f('record-relayed')?['lok','向阿乐取回旧友的答复。','record-reply']:['lok','请阿乐问一声，旧友是否愿意联系。','record-source'];
 }
 function stall(){
  if(w.stallOutcome)return [null,'玲姐和阿明商定了衣架的摆放位置和时间，门口通道已调整。'];
  if(!f('stall-ming'))return ['ming','到粤记门外，听阿明说说衣架挡路的事。','stall-ming'];
  if(!f('stall-observed'))return ['ming','跟阿明看看送餐通道被哪里挡住了。','stall-observe'];
  if(f('stall-ming-agreed'))return ['ling','到衣铺告诉玲姐，阿明同意了，请她落实。','stall-finalize'];
  if(w.flags.some(k=>k.startsWith('stall-propose-')))return ['ming','回粤记，问阿明是否同意调整。','stall-agree'];
  return ['ling',f('stall-ling')?'与玲姐选定衣架的摆放方案。':'到夜市衣铺听玲姐说说她的难处。',f('stall-ling')?'stall-propose-compact':'stall-ling'];
 }
 return [['coat','阿晴的面试外套',coat()],['record','林伯的旧唱片',record()],['stall','粤记门口的衣架',stall()]].map(([id,name,[npc,text,action]])=>({id,name,npc,text,action,done:!npc}));
}

export function questPoint(quest,world){
 if(quest.npc==='rest')return REST;
 if(quest.npc==='qing'&&world.flags.includes('coat-route-buy')&&!world.coatOutcome)return {x:-13.55,z:-9.14};
 return ACTORS[quest.npc]?.point;
}
