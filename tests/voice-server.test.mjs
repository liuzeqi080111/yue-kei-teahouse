import assert from 'node:assert/strict';
import {createServer} from '../server.mjs';

let calls=0;
const provider={status:()=>({configured:true}),
 transcribe:async body=>{calls++;return {text:body.audioBase64?'唔該，加水。':''};},
 interpret:async()=>({decision:'reply',intents:[],reply:'你好呀。'}),
 speak:async()=>{throw Object.assign(new Error('PRIVATE-UPSTREAM-DETAIL'),{code:'UPSTREAM_ERROR',status:502});}};
const server=createServer({provider});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
try{
 let r=await fetch(base+'/api/voice/status');assert.equal(r.status,200);assert.equal((await r.json()).configured,true);
 const post=(path,body,headers={})=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body});
 r=await post('/api/voice/transcribe',JSON.stringify({audioBase64:'YQ==',mimeType:'audio/wav'}));assert.equal(r.status,200);assert.equal(calls,1);
 r=await post('/api/voice/transcribe','{}',{Origin:'https://evil.example'});assert.equal(r.status,403);assert.equal(calls,1);
 r=await post('/api/voice/transcribe','{');assert.equal(r.status,400);
 r=await post('/api/voice/transcribe','{}',{'Content-Type':'text/plain'});assert.equal(r.status,415);
 r=await post('/api/voice/transcribe',JSON.stringify({data:'a'.repeat(3*1024*1024)}));assert.equal(r.status,413);
 r=await fetch(base+'/api/voice/speak');assert.equal(r.status,405);
 r=await post('/api/voice/speak','{"text":"你好"}');assert.ok(r.status>=400);assert.ok(!(await r.text()).includes('PRIVATE-UPSTREAM'));
 for(const path of ['/.env','/server/bailian.mjs','/deepworks-phase2/STATUS.md','/docs/phase2-contract.md']){
  r=await fetch(base+path);assert.equal(r.status,404,path);
 }
 r=await fetch(base+'/');assert.equal(r.status,200);assert.match(await r.text(),/html/i);
 r=await fetch(base+'/',{method:'HEAD'});assert.equal(r.status,200);assert.equal(await r.text(),'');
 console.log('PASS voice server: routes, limits, origin, safe errors, static isolation');
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
