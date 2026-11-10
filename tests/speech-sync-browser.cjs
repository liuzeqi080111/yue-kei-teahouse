const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const {createServer}=await import('../server.mjs');const n=48000,b=Buffer.alloc(44+n*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(16000,24);b.writeUInt32LE(32000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(n*2,40);for(let i=0;i<n;i++)b.writeInt16LE(Math.round(Math.sin(i*.15)*5000*(Math.floor(i/4000)%2)),44+i*2);
 const server=createServer({provider:{status:()=>({configured:true,asr:true,npc:true}),interpret:async()=>({decision:'reply',intents:[],reply:'可以。'}),speak:async()=>{await new Promise(r=>setTimeout(r,1500));return {audioBase64:b.toString('base64'),mimeType:'audio/wav'};}}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  window.__audios=[];
  const Original=window.Audio;
  window.Audio=function(...args){const a=new Original(...args);window.__audios.push(a);return a;};
  const AC=window.AudioContext,gains=new WeakMap();
  window.AudioContext=class extends AC{
   createGain(){const gain=super.createGain();if(!gains.has(this))gains.set(this,gain);return gain;}
   createMediaElementSource(audio){if(audio.src.includes('hongkong-evening'))window.__musicGain=gains.get(this);return super.createMediaElementSource(audio);}
  };
 });
 await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>document.querySelector('.voice-status').textContent==='準備好');
 await page.locator('[data-action="ENTER"]').click();
 await page.waitForFunction(()=>window.__musicGain?.gain.value > .15 && window.__audios.some(a=>a.src.includes('hongkong-evening')&&a.currentTime>0));
 await page.locator('#learning-mode [data-learning-mode="beginner"]').click();
 await page.waitForFunction(()=>window.__musicGain?.gain.value < .08);
 await page.locator('[data-action="START_SEATING"]:not(:disabled)').waitFor({timeout:10000});
 await page.evaluate(async()=>{const {createGame}=await import('/controller.js');const {mountVoice}=await import('/voice.js');const {draw,ready}=await import('/scene.js');await ready;document.querySelector('#voice-host').replaceChildren();window.testGame=createGame({changed:s=>window.testVoice?.sync(s)});window.testVoice=mountVoice({game:testGame,host:document.querySelector('#voice-host')});window.probe=document.createElement('canvas');probe.id='mouth-probe';probe.style.width='1008px';probe.style.height='567px';document.body.append(probe);window.testDraw=()=>{const s=testGame.snapshot();draw(probe,s.state,s.view);};});
 await page.waitForFunction(()=>document.querySelector('.voice-status').textContent==='準備好');
 await page.evaluate(()=>{testGame.chapter('bill');testGame.action('WAITER_LEAVE');});
 await page.waitForTimeout(2200);assert.equal(await page.evaluate(()=>testGame.snapshot().view.beat.pose),'talk','still facing player while audio plays');
 await page.evaluate(()=>{testDraw();window.staticFace=probe.toDataURL();});
 await page.waitForTimeout(300);await page.evaluate(()=>testDraw());
 assert.equal(await page.evaluate(()=>probe.toDataURL()),await page.evaluate(()=>window.staticFace),'face remains unchanged during speech');
 await page.waitForFunction(()=>testGame.snapshot().view.beat?.pose==='depart',{timeout:10000});assert.equal(await page.evaluate(()=>testGame.snapshot().view.speaking),false,'mouth shuts before departure');
 assert.ok(await page.evaluate(()=>window.__audios.filter(a=>a.src.startsWith('blob:')).every(a=>a.paused||a.ended)),'no speech after turning away');
 await page.evaluate(()=>testGame.action('RESTART'));await page.waitForTimeout(300);assert.equal(await page.evaluate(()=>testGame.snapshot().view.camera),'outside');
 await page.evaluate(()=>testGame.chapter('service'));
 await page.locator('#voice-host textarea').fill('可唔可以講慢啲呀，唔該？');
 await page.getByRole('button',{name:'發送文字'}).click();
 await page.waitForFunction(()=>window.__audios.some(a=>a.src.startsWith('blob:')&&a.playbackRate===.72&&!a.paused),null,{timeout:8000});
 const slow=()=>page.evaluate(()=>window.__audios.filter(a=>a.src.startsWith('blob:')&&a.playbackRate===.72).length);
 assert.equal(await slow(),1);
 await page.waitForFunction(()=>window.__audios.some(a=>a.playbackRate===.72&&a.ended));
 const spoken=await page.evaluate(()=>window.__audios.filter(a=>a.src.startsWith('blob:')).length);
 await page.evaluate(()=>testGame.notify(''));
 await page.waitForTimeout(1700);
 assert.equal(await page.evaluate(()=>window.__audios.filter(a=>a.src.startsWith('blob:')).length),spoken,'normal rendering must not replay the same reply');
 await page.getByRole('button',{name:'重播阿明回答'}).click();
 await page.waitForFunction(()=>window.__audios.filter(a=>a.src.startsWith('blob:')&&a.playbackRate===.72).length===2);
 assert.deepEqual(errors,[]);console.log('PASS music ducking, speech hold, restart cleanup and actual slow reply/replay without a duplicate');
 }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
