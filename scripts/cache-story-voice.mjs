import fs from 'node:fs';
import {chapterRecordings,voices} from '../story-chapters.js';
import {createBailian} from '../server/bailian.mjs';
import {characterVoice} from '../voice-clips.js';

const refresh=new Set(process.argv.slice(2));
for(const {chapter,node,actor,text,file} of chapterRecordings()){
 if(fs.existsSync(file)&&!refresh.has(chapter+'/'+node))continue;
 const provider=createBailian({speechVoice:characterVoice(voices[actor]).voice});
 const reply=await provider.speak({text});
 const bytes=Buffer.from(reply.audioBase64,'base64');
 if(bytes.toString('ascii',0,4)!=='RIFF')throw Error('invalid recording');
 fs.writeFileSync(file,bytes);
 console.log(file);
}
