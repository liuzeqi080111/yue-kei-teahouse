const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const {createServer}=await import('../server.mjs');const server=createServer({provider:{status:()=>({configured:false})}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage();
 try{
 await page.goto('http://127.0.0.1:'+server.address().port);
 const result=await page.evaluate(async()=>{
 const {mountVoice}=await import('./voice.js');const {createGame}=await import('./controller.js');
 const game=createGame();let spoken=[],micCalls=0;const events=[];
 const host=document.createElement('div');document.body.append(host);
 navigator.mediaDevices.getUserMedia=async()=>{micCalls++;throw Error('must not capture');};
 const originalFetch=window.fetch;window.fetch=async(url,options)=>{
 if(String(url).endsWith('/api/voice/speak')){spoken.push(JSON.parse(options.body));return new Response(JSON.stringify({error:{message:'fixture unavailable'}}),{status:503});}
 return originalFetch(url,options);
 };
 const status=e=>events.push(e.detail);window.addEventListener('voice-status',status);
 const v=mountVoice({game,host});await new Promise(r=>setTimeout(r,100));
 const transcriptBefore=v.transcriptEnabled;const transcriptAfter=v.toggleTranscript();const devices=v.showDevices();
 const start=v.replay('兩位呀，唔該。',.72);await new Promise(r=>setTimeout(r,100));
 v.toggleMute();const muted=v.muted;const mutedReplay=v.replay('不可播放');v.destroy();window.removeEventListener('voice-status',status);window.fetch=originalFetch;
 return {transcriptBefore,transcriptAfter,devices,start,spoken,muted,mutedReplay,micCalls,errorReported:events.some(e=>e.error)};
 });
 assert.equal(result.transcriptBefore,false);assert.equal(result.transcriptAfter,true);assert.equal(result.devices,true);assert.equal(result.micCalls,0);assert.equal(result.start,true);assert.equal(result.spoken.length,1);assert.equal(result.spoken[0].text,'兩位呀，唔該。');assert.equal(result.muted,true);assert.equal(result.mutedReplay,false);assert.equal(result.errorReported,true);
 console.log('PASS voice HUD contract: transcript, devices without capture, one explicit replay, mute and error event.');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
