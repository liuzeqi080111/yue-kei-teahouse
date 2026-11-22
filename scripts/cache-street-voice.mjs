import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createBailian} from '../server/bailian.mjs';
import {characterVoice} from '../voice-clips.js';
import {SHOPS,PASSERS,streetHello,streetReply} from '../street-space.js';
import {optionsFor,freshWorld,NPCS,COUNTER_GUESTS,applyWorldAction,restEvent} from '../neighborhood-state.js';
import {STREET_CLIPS,ROLE_CLIPS} from '../fp1-clips.js';

const lines=new Map();
function add(id,text){
 const {voice}=characterVoice(id);
 lines.set(id+'|'+text,{voice,text});
}
// Reuse a published greeting only if it was recorded by the current cast.
const reusable=new Map();
for(const [text,file] of Object.entries(STREET_CLIPS)){
 const actor=/street-line-(\w+)-\d+/.exec(file)?.[1];
 const original=['ling','herbs','westBread','marketBack','fang'].includes(actor)?'Kiki':
  ['lok','radio','ming','buyer'].includes(actor)?'Ethan':'Rocky';
 if(original===characterVoice(actor).voice&&fs.existsSync(file))reusable.set(actor+'|'+text,file);
 add(actor,text);
}
for(const [id,shop] of Object.entries(SHOPS)){
 add(id,shop.line);add(id,shop.reply);
}
for(const id of Object.keys(PASSERS)){add(id,streetHello[0]);add(id,streetReply[0]);}
for(const [id,guest] of Object.entries(COUNTER_GUESTS)){
 add(id,guest.greeting[0]);add(id,guest.reply[0]);
}
const base={...freshWorld(),streetView:{x:12.22,z:8.94,heading:1.56,pitch:0}};
const pickup='coat-start shop-check coat-inspect coat-route-';
const enquiries='guest-found coat-swap';
const visits=[
 pickup+'recover '+enquiries+' coat-return rest',
 pickup+'borrow coat-loan coat-emergency rest coat-collect-loan loan-returned',
 pickup+'buy coat-quote coat-buy coat-emergency rest '+enquiries+' coat-return-original laundry-reconcile',
 'record-start sleeve-read record-source record-reply record-contact buyer-consent consent-relay record-buy record-gift',
 'record-start sleeve-read record-source record-reply record-contact record-after record-accept rest record-reunion',
 ...['compact','move','hours'].map(plan=>'stall-ming stall-observe stall-ling stall-propose-'+plan+' stall-agree stall-finalize rest'),
];
for(const visit of visits){
 let state=base;
 for(const next of [...visit.split(' '),null]){
  let speaker;
  for(const id of [...Object.keys(NPCS),'southRice'])for(const o of optionsFor(state,id)){
   add(id,o.text);
   if(o.id===next)speaker=id;
  }
  if(next==='rest')state=restEvent(state);
  else if(next){
   const result=speaker&&applyWorldAction(state,speaker,next);
   if(!result?.ok)throw Error('Invalid voice itinerary at '+next);
   state=result.state;
  }
 }
}
for(const [id,text] of [
 ['southRice','你識阿林？我同佢以前晚晚收工都捉棋㗎。'],
 ['guest','件褸換返喇，快啲拎返安和樓畀阿晴啦。'],['guest','芳姐叫你嚟㗎？張單同袖口都要對一對先。'],
 ['fang','原來真係調轉咗，快啲拎返畀阿晴啦。'],['fang','周生喺粵記門邊。你同佢對吓袖口同內袋個名。'],['fang','你去粵記門口搵阿明，問吓周生坐喺邊。'],
 ['lam','阿祥話下個禮拜再嚟捉棋。'],['lam','阿祥，呢邊！位都幫你留咗。'],
 ['lam','阿樂嗰邊，有冇我老友嘅消息呀？'],['lam','嚟，坐低捉盤五子棋。你揸黑，畀你行先。'],['lam','你揸黑，揀個交叉位落子啦。'],['lam','唔使急，望清楚啲先落。'],['lam','以前我同個老友都係咁，一邊捉棋，一邊聽唱片。'],['lam','好棋！五粒連埋一行，你贏喇。'],['lam','睇吓呢邊，連成五粒喇。再嚟一盤？'],['lam','滿晒喇，和棋。'],
 ['qing','我聽日見工，件褸仲喺洗衣舖。陪我行一轉，好唔好？'],
 ['qing','我見完工返嚟喇。'],['qing','件褸我想試多次，睇吓啱唔啱身。'],['qing','多謝你肯幫手。你問到啲咩呀？'],
 ['fang','有事嘅話，你慢慢講。'],['fang','張單已經入咗簿。'],['lam','隻碟我收好咗。唔該晒你。'],['lam','我已經留咗口訊畀老朋友。'],
 ...['ming','ling'].flatMap(id=>[[id,'未到飯點，衫架照擺出嚟。'],[id,'你睇，而家條路闊咗。']]),
])add(id,text);
// Saved dialogue history can replay lines from earlier story revisions.
const map={...ROLE_CLIPS};
for(const [key,{text,voice}] of lines){
 if(reusable.has(key)){map[key]=reusable.get(key);continue;}
 const hash=createHash('sha256').update(voice+'|'+text).digest('hex').slice(0,14);
 const file='assets/street-line-'+hash+'.wav';
 if(!fs.existsSync(file)){
  const r=await createBailian({speechVoice:voice}).speak({text});
  const b=Buffer.from(r.audioBase64,'base64');
  if(b.toString('ascii',0,4)!=='RIFF')throw Error('Invalid WAV');
  fs.writeFileSync(file,b);
 }
 map[key]=file;
}
const marker='\nexport const ROLE_CLIPS=';
const existing=fs.readFileSync('fp1-clips.js','utf8').split(marker)[0];
fs.writeFileSync('fp1-clips.js',existing+marker+JSON.stringify(map,null,1)+';\n');
console.log(Object.keys(map).length+' role lines');
