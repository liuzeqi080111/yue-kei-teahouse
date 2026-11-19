import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createBailian} from '../server/bailian.mjs';
import {SHOPS} from '../street-space.js';
import {optionsFor,freshWorld,NPCS,applyWorldAction,restEvent} from '../neighborhood-state.js';
import {STREET_CLIPS} from '../fp1-clips.js';

// Original common greeting assets retain their published paths for existing saves and builds.
for(const [text,file] of Object.entries(STREET_CLIPS)){
 if(fs.existsSync(file))continue;
 const actor=/street-line-(\w+)-\d+/.exec(file)?.[1];
 const voice=['ling','herbs','westBread','marketBack','fang'].includes(actor)?'Kiki':
  ['lok','radio','ming','buyer'].includes(actor)?'Ethan':'Rocky';
 const reply=await createBailian({speechVoice:voice}).speak({text});
 const bytes=Buffer.from(reply.audioBase64,'base64');
 if(bytes.toString('ascii',0,4)!=='RIFF')throw Error('Invalid WAV');
 fs.writeFileSync(file,bytes);
}
const lines=new Map();
function add(id,text,cast=id){
 const voice=['ling','qing','aqing','buyer','fang'].includes(cast)?'Kiki':['aming','ming','ale','lok','friend'].includes(cast)?'Ethan':'Rocky';
 lines.set(id+'|'+text,{voice,text});
}
for(const [id,shop] of Object.entries(SHOPS)){
 if(shop.stall){add(id,shop.line,shop.cast);add(id,shop.reply,shop.cast);}
}
const base={...freshWorld(),streetView:{x:12.22,z:8.94,heading:1.56,pitch:0}};
const pickup='coat-start shop-check coat-inspect coat-route-';
const enquiries='guest-found coat-swap';
const visits=[
 pickup+'recover '+enquiries+' coat-return rest',
 pickup+'borrow coat-loan coat-emergency rest coat-collect-loan loan-returned',
 pickup+'buy coat-quote coat-buy coat-emergency rest '+enquiries+' coat-return-original laundry-reconcile',
 'record-start sleeve-read record-source record-reply record-contact buyer-consent consent-relay record-buy record-gift',
 ...['compact','move','hours'].map(plan=>'stall-ming stall-observe stall-ling stall-propose-'+plan+' stall-agree stall-finalize rest'),
];
for(const visit of visits){
 let state=base;
 for(const next of [...visit.split(' '),null]){
  let speaker;
  for(const id of Object.keys(NPCS))for(const o of optionsFor(state,id)){
   if(!STREET_CLIPS[o.text])add(id,o.text);
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
 ['lam','阿樂嗰邊，有冇我老友嘅消息呀？'],['lam','嚟，坐低捉盤五子棋。你揸黑，畀你行先。'],['lam','你揸黑，揀個交叉位落子啦。'],['lam','唔使急，望清楚啲先落。'],['lam','以前我同個老友都係咁，一邊捉棋，一邊聽唱片。'],['lam','好棋！五粒連埋一行，你贏喇。'],['lam','睇吓呢邊，連成五粒喇。再嚟一盤？'],['lam','滿晒喇，和棋。'],
 ['qing','我聽日見工，件褸仲喺洗衣舖。陪我行一轉，好唔好？'],
 ['qing','我見完工返嚟喇。'],['qing','件褸我想試多次，睇吓啱唔啱身。'],['qing','多謝你肯幫手。你問到啲咩呀？'],
 ['fang','有事嘅話，你慢慢講。'],['fang','張單已經入咗簿。'],['lam','隻碟我收好咗。唔該晒你。'],['lam','我已經留咗口訊畀老朋友。'],
 ...['ming','ling'].flatMap(id=>[[id,'未到飯點，衫架照擺出嚟。'],[id,'你睇，而家條路闊咗。']]),
])add(id,text);
const map={};
for(const [key,{text,voice}] of lines){
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
