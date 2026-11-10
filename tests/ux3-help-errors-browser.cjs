const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const {createServer}=await import('../server.mjs');
 const wav=Buffer.alloc(44+16000);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(16000,24);wav.writeUInt32LE(32000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(16000,40);
 let calls=0,fail=false;
 const server=createServer({provider:{status:()=>({configured:true,asr:true,npc:true,tts:true}),speak:()=>({audioBase64:wav.toString('base64'),mimeType:'audio/wav'}),interpret:()=>({decision:'reply',intents:[],reply:'我喺度，慢慢講。',meaning:'我在这里，慢慢说。'})}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  localStorage.setItem('yuekei-learning-guide-v1',JSON.stringify({mode:'beginner',showMeaning:true}));localStorage.setItem('yuekei-hud-intro-seen','1');window.captureKind='tone';window.testStreams=[];
  navigator.mediaDevices.getUserMedia=async()=>{
   if(window.captureKind==='denied')throw new DOMException('denied','NotAllowedError');
   const ctx=new AudioContext(),osc=ctx.createOscillator(),gain=ctx.createGain(),dest=ctx.createMediaStreamDestination();gain.gain.value=window.captureKind==='silent'?0:.1;
   osc.connect(gain);gain.connect(dest);osc.start();await ctx.resume();const track=dest.stream.getAudioTracks()[0],stop=track.stop.bind(track);let ended=false;
   track.stop=()=>{if(ended)return;ended=true;stop();osc.stop();void ctx.close();};window.testStreams.push(track);return dest.stream;
  };
 });
 await page.route('**/api/voice/interpret',r=>{calls++;if(fail)return r.abort('failed');return r.continue();});
 try{
  await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('[data-action="ENTER"]').click();
  await page.locator('.hud-direct [data-hud="first-answer"]').click();
  assert.equal(await page.locator('.hud-example').count(),1,'greeting offers direct help');
  await page.locator('[data-hud="close"]').click();
  await page.locator('.hud-direct [data-action="START_SEATING"]').first().click();
  await page.locator('[data-hud-camera="menu"]:not(:disabled)').waitFor();
  await page.locator('#hotspots [data-action="CALL_WAITER"]').click();
  await page.locator('#hud-idle-hint').waitFor({state:'visible',timeout:25000});
  assert.equal(await page.locator('#hud-idle-hint').isVisible(),true,'idle hint after NPC finished');
  await page.locator('#hud-idle-hint').click();assert.equal(await page.locator('.hud-example').count(),1,'expression help immediately provides the complete example');
  await page.locator('[data-hud="close"]').click();await page.waitForTimeout(15000);assert.equal(await page.locator('#hud-idle-hint').isVisible(),false,'only once per line');
  await page.keyboard.press('h');assert.equal(await page.locator('#hud-help').isVisible(),true);
  await page.locator('[data-hud="pin"]').click();await page.locator('.voice-mic').click();await page.waitForTimeout(200);assert.equal(await page.locator('#hud-help').isVisible(),true,'pinned help survives recording');
  await page.getByRole('button',{name:'取消本次语音'}).click();await page.locator('[data-hud="close"]').click();
  await page.keyboard.press('h');await page.locator('.voice-mic').click();await page.waitForTimeout(200);assert.equal(await page.locator('#hud-help').isVisible(),true,'unpinned help remains visible while recording');assert.equal(await page.locator('.hud-jyutping').isVisible(),true);
  await page.getByRole('button',{name:'取消本次语音'}).click();
  await page.locator('[data-hud="more"]').click();await page.locator('[data-hud="type"]').click();await page.locator('.voice-text').fill('h');await page.keyboard.press('h');assert.equal(await page.locator('#hud-help').isVisible(),false);
  fail=true;await page.locator('.voice-text').fill('我想问个问题');await page.locator('.voice-send').click();await page.getByRole('button',{name:'重试这句话',exact:true}).waitFor();
  assert.equal(await page.locator('.voice-text').inputValue(),'我想问个问题');const failedCalls=calls;
  await page.locator('.voice-text-close').click();await page.waitForTimeout(15000);assert.equal(await page.locator('#hud-idle-hint').isVisible(),false,'technical error must suppress teaching prompt');assert.equal(calls,failedCalls);
  fail=false;await page.getByRole('button',{name:'重试这句话',exact:true}).click();await page.waitForTimeout(1200);assert.equal(calls,failedCalls+1);
  await page.evaluate(()=>window.captureKind='denied');await page.locator('.voice-mic').click();await page.waitForTimeout(100);assert.match(await page.locator('.voice-status').innerText(),/权限/);assert.equal(await page.locator('.voice-devices').isVisible(),false);
  await page.evaluate(()=>window.captureKind='silent');await page.locator('.voice-mic').click();await page.waitForTimeout(600);await page.locator('.voice-mic').click();await page.waitForTimeout(350);assert.match(await page.locator('.voice-status').innerText(),/没录到/);assert.equal(await page.locator('.voice-devices').isVisible(),true);assert.equal(calls,failedCalls+1);
  assert.equal(await page.evaluate(()=>window.testStreams.every(t=>t.readyState==='ended')),true);assert.deepEqual(errors,[]);
  console.log('PASS UX3 help/error lifecycle: idle once, H typing safety, pin/unpin recording, retained network retry, permission vs silence, no erroneous orders.');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exit(1);});
