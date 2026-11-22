import fs from 'node:fs';import {chapters,voices,morning} from '../story-chapters.js';import {createBailian} from '../server/bailian.mjs';import {characterVoice} from '../voice-clips.js';
for(const [chapter,story] of Object.entries(chapters))for(const [id,[actor,text]] of Object.entries(story.nodes)){
 if(actor==='master')continue;
 for(const take of (text?['']:['tea','lemon'])){
  const path='assets/story-'+chapter+'-'+id+(take?'-'+take:'')+'.wav';if(fs.existsSync(path)&&!process.argv.slice(2).includes(chapter+'/'+id))continue;
  const provider=createBailian({speechVoice:characterVoice(voices[actor]).voice});
  const reply=await provider.speak({text:text||morning(take)[0]});
  const bytes=Buffer.from(reply.audioBase64,'base64');if(bytes.toString('ascii',0,4)!=='RIFF')throw Error('invalid recording');
  fs.writeFileSync(path,bytes);console.log(path);
 }
}
