const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs/promises');
(async()=>{
 const {createServer}=await import('../server.mjs');const {NPC_VOICE_CLIPS}=await import('../npc-voice-manifest.js');
 const {LINES}=await import('../controller.js');
 for(const line of Object.values(LINES).filter(l=>l[0].startsWith('阿明')))assert.ok(NPC_VOICE_CLIPS[line[1]],line[1]);
 const sample=await fs.readFile(Object.values(NPC_VOICE_CLIPS)[0]);let onlineCalls=0;
 const server=createServer({provider:{status:()=>({configured:false}),speak:()=>{onlineCalls++;return {audioBase64:(onlineCalls===1?Buffer.from('broken audio'):sample).toString('base64'),mimeType:'audio/wav'};}}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.mouse.click(2,2); // Real activation; do not bypass autoplay policy.
  const results=await page.evaluate(async()=>{
   const {NPC_VOICE_CLIPS}=await import('./npc-voice-manifest.js');const {createNpcSpeech}=await import('./npc-speech.js');
   const ctx=new AudioContext(),report=[];window.voiceStates=[];
   const Original=window.Audio;window.Audio=function(...args){return window.lastProbeAudio=new Original(...args);};
   window.probeSpeech=createNpcSpeech({onState:s=>window.voiceStates.push(String(s))});
   for(const [text,file] of Object.entries(NPC_VOICE_CLIPS)){
    const response=await fetch(file);if(!response.ok)throw Error(file);
    const decoded=await ctx.decodeAudioData(await response.arrayBuffer());
    const pcm=decoded.getChannelData(0),rms=Math.sqrt(pcm.reduce((sum,x)=>sum+x*x,0)/pcm.length);
    if(decoded.duration<.2||rms<.001)throw Error('empty/silent '+file);
    window.voiceStates=[];const start=performance.now();await probeSpeech.speak(text);
    if(!window.voiceStates.includes('阿明說話中'))throw Error(window.voiceStates.join('|'));
    report.push({file,seconds:decoded.duration,rms,startMs:Math.round(performance.now()-start)});probeSpeech.stop();
   }
   await ctx.close();return report;
  });
  assert.equal(results.length,26);assert.equal(onlineCalls,0,'local clips never request online TTS');
  // Corrupt dynamic audio is evicted, so explicit retry fetches a fresh clip.
  await page.evaluate(async()=>{window.voiceStates=[];await probeSpeech.speak('本轮动态音频恢复测试');});
  assert.match(await page.evaluate(()=>voiceStates.join('|')),/音频无法播放/);
  await page.evaluate(async()=>{window.voiceStates=[];await probeSpeech.speak('本轮动态音频恢复测试',{rate:.72});});
  assert.equal(onlineCalls,2);assert.ok(await page.evaluate(()=>voiceStates.includes('阿明說話中')));
  assert.equal(await page.evaluate(()=>lastProbeAudio.playbackRate),.72);
  await page.waitForFunction(()=>lastProbeAudio.ended);assert.equal(await page.evaluate(()=>probeSpeech.active),false);
  await page.evaluate(()=>probeSpeech.stop());
  // Local missing asset falls back online once; stop during fetch never starts old audio.
  await page.route('**/assets/npc-*.wav',r=>r.fulfill({status:404,body:''}));
  await page.evaluate(async()=>{const {NPC_VOICE_CLIPS}=await import('./npc-voice-manifest.js');window.voiceStates=[];await probeSpeech.speak(Object.keys(NPC_VOICE_CLIPS)[0]);});
  // The first clip was already cached by the probe: use a fresh player for missing-file recovery.
  await page.evaluate(async()=>{probeSpeech.stop();const {createNpcSpeech}=await import('./npc-speech.js');probeSpeech=createNpcSpeech({onState:s=>voiceStates.push(String(s))});const {NPC_VOICE_CLIPS}=await import('./npc-voice-manifest.js');await probeSpeech.speak(Object.keys(NPC_VOICE_CLIPS)[0]);probeSpeech.stop();});
  assert.equal(onlineCalls,3);await page.unroute('**/assets/npc-*.wav');
  await page.route('**/api/voice/speak',async r=>{await new Promise(done=>setTimeout(done,200));try{await r.fulfill({json:{audioBase64:sample.toString('base64'),mimeType:'audio/wav'}});}catch{}});
  await page.evaluate(async()=>{voiceStates=[];const pending=probeSpeech.speak('取消后不能播放这句');probeSpeech.stop();await pending;});
  await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>voiceStates.includes('阿明說話中')),false);
  await page.unroute('**/api/voice/speak');
  // The independent learning player shares local clips and keeps slow/replay local.
  await page.evaluate(async()=>{
   const {createPracticeAudio}=await import('./practice-audio.js');const {NPC_VOICE_CLIPS}=await import('./npc-voice-manifest.js');
   const text=Object.keys(NPC_VOICE_CLIPS)[0],snapshot={state:{round:1,phase:'测试'},view:{camera:'wide'}};
   window.practiceProbe=createPracticeAudio({getSnapshot:()=>snapshot,getPractice:()=>({example:text,npcText:text,parts:[]})});
   practiceProbe.sync(snapshot);practiceProbe.handle('npc-slow');
  });
  await page.waitForFunction(()=>lastProbeAudio.playbackRate===.65&&!lastProbeAudio.paused);
  assert.equal(onlineCalls,3);await page.evaluate(()=>practiceProbe.destroy());
  // Actual UI must speak the greeting even when online recognition is unconfigured.
  await page.addInitScript(()=>{localStorage.setItem('yuekei-learning-guide-v1',JSON.stringify({mode:'beginner',showMeaning:true}));window.played=[];const Original=window.Audio;window.Audio=function(...args){const a=new Original(...args);a.addEventListener('playing',()=>played.push({src:a.src,rate:a.playbackRate}));return a;};});
  await page.reload();await page.locator('#welcome [data-action="ENTER"]').click();
  await page.waitForFunction(()=>played.some(a=>a.src.startsWith('blob:')));
  await page.waitForFunction(()=>document.querySelector('#actions [data-action="START_SEATING"]')?.disabled===false);
  await page.locator('[data-hud="more"]').click();
  await page.locator('[data-hud="slow"]').click();
  await page.waitForFunction(()=>played.some(a=>a.rate===.72));
  assert.equal(onlineCalls,3);assert.deepEqual(errors,[]);
  await fs.mkdir('output/ux10',{recursive:true});await fs.writeFile('output/ux10/verification.json',JSON.stringify({clips:results,onlineFallbackTests:true,unconfiguredGreeting:true,errors},null,2));
  console.log(JSON.stringify({clips:results.length,maxStartMs:Math.max(...results.map(r=>r.startMs)),recovery:true,unconfiguredGreeting:true}));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
