// Explicit opt-in paid provider check. Only synthetic test speech; no human recordings.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createBailian} from '../server/bailian.mjs';
import {createGame} from '../controller.js';
import {createVoiceBridge} from '../voice-bridge.js';
const usage=[],rows=[];
const remote=process.env.ACCEPTANCE_VOICE_ORIGIN;
const fetchImpl=async(url,options)=>{
 const started=Date.now(),res=await fetch(url,options);
 if(options?.method==='POST'){
  const body=JSON.parse(options.body),data=await res.clone().json();
  usage.push({model:body.model,status:res.status,ms:Date.now()-started,usage:data.usage??null});
 }
 return res;
};
const local=createBailian({fetchImpl});
const provider=remote?Object.fromEntries(['interpret','speak','transcribe'].map(method=>[method,async body=>{
 const start=Date.now(),res=await fetch(remote+'/api/voice/'+method,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://liuzeqi080111.github.io'},body:JSON.stringify(body),signal:AbortSignal.timeout(45000)});
 usage.push({endpoint:method,ms:Date.now()-start,status:res.status,usage:null});if(!res.ok)throw Error('Remote '+method+' '+res.status);return res.json();
}])):local;
let tasks=[];const game=createGame({schedule:fn=>{tasks.push(fn);return fn},cancel:fn=>{tasks=tasks.filter(f=>f!==fn)}});
const bridge=createVoiceBridge({game});const flush=()=>{for(let i=0;tasks.length&&i<300;i++)tasks.shift()();assert.equal(tasks.length,0)};
const report={source:remote?'existing public backend, synthetic scripted inputs':'real local provider, synthetic scripted inputs',rows,usage,passed:false};
async function turn(text,check){
 const started=Date.now(),proposal=await provider.interpret({text,context:bridge.context()}),result=bridge.apply({...proposal,playerText:text},bridge.token());
 if(result.ok&&!game.snapshot().view.busy)game.say(result.reply,result.meaning);flush();
 const snapshot=game.snapshot();rows.push({text,ms:Date.now()-started,decision:proposal.decision,ok:result.ok,reply:result.reply,phase:snapshot.state.phase,items:snapshot.state.items.map(i=>({itemId:i.itemId,options:i.options,status:i.status}))});
 assert.ok(result.ok,text);check?.(snapshot);console.log('PASS live',text);
}
try{
 game.action('ENTER');flush();
 await turn('两位用粤语怎么说',s=>assert.equal(s.state.phase,'迎接'));
 const audio=await provider.speak({text:'兩位呀，唔該。'}),recognized=await provider.transcribe(audio);
 report.syntheticAudio={text:recognized.text,bytes:Buffer.from(audio.audioBase64,'base64').length};
 await turn(recognized.text,s=>assert.equal(s.state.partySize,2));
 await turn('我第一次来香港，茶餐厅为什么叫茶餐厅？',s=>assert.equal(s.state.items.length,0));
 await turn('我听不懂，能用普通话解释一下，并教我怎么点一杯冻奶茶少甜吗？',s=>assert.equal(s.state.items.length,0));
 await turn('我要一杯冻奶茶，少甜',s=>assert.equal(s.state.items[0]?.itemId,'drink-milk-tea'));
 await turn('不要奶茶了，改成冻柠檬茶，少甜',s=>{assert.equal(s.state.items.length,1);assert.equal(s.state.items[0]?.itemId,'drink-lemon-tea')});
 await turn('确认订单',s=>assert.equal(s.view.orderReview,true));
 await turn('没有其他了，正式下单',s=>assert.equal(s.state.items[0]?.status,'served'));
 await turn('唔该，加水',s=>assert.equal(s.state.items.length,1));
 await turn('唔该，埋单',s=>assert.equal(s.state.phase,'结账'));
 await turn('确认支付这张账单',s=>assert.equal(s.state.isPaid,true));
 assert.equal(game.snapshot().state.phase,'结束');
 game.action('RESTART');flush();assert.equal(bridge.context().history.length,0);report.passed=true;
}catch(e){report.error=e.message;process.exitCode=1;console.error(e.message)}
finally{await mkdir('output/acceptance',{recursive:true});await writeFile(`output/acceptance/live-${remote?'public':'local'}.json`,JSON.stringify(report,null,2))}
