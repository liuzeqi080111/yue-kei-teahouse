import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createBailian} from '../server/bailian.mjs';
import {SHOPS} from '../street-space.js';
import {optionsFor,freshWorld,NPCS} from '../neighborhood-state.js';
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
for(const state of [base,{...base,flags:['coat-start'],items:['ticket','wrongCoat']},{...base,flags:['coat-start','shop-check','ticket-filed','guest-found','coat-detail'],items:['wrongCoat']}]){
 for(const id of Object.keys(NPCS))for(const o of optionsFor(state,id))if(!STREET_CLIPS[o.text])add(id,o.text);
}
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
