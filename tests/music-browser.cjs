const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const {createServer}=await import('../server.mjs');const server=createServer({provider:{status:()=>({configured:false})}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   window.__music={volume:null,playing:false};
   window.YT={Player:class{constructor(host,options){this.options=options;window.__music.video=options.videoId;if(!window.__musicNeverReady)setTimeout(()=>options.events.onReady(),0);}setVolume(v){window.__music.volume=v;}playVideo(){window.__music.playing=true;this.options.events.onStateChange({data:1});}pauseVideo(){window.__music.playing=false;this.options.events.onStateChange({data:2});}destroy(){}}};
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.locator('#welcome [data-dialog="settings"]').click();
  assert.equal(await page.evaluate(()=>window.__music.playing),false);
  await page.getByRole('button',{name:'播放香港老歌',exact:true}).click();await page.waitForFunction(()=>window.__music.playing);
  assert.equal(await page.evaluate(()=>window.__music.video),'d44u2W-votY');
  const volumeIs=(min,max)=>page.waitForFunction(([lo,hi])=>window.__music.volume>=lo&&window.__music.volume<=hi,[min,max]);
  const voice=detail=>page.evaluate(value=>window.dispatchEvent(new CustomEvent('voice-activity',{detail:value})),detail);
  const practice=active=>page.evaluate(value=>window.dispatchEvent(new CustomEvent('practice-activity',{detail:{active:value}})),active);
  await volumeIs(20,24);
  await voice({npcActive:true,busy:false,active:true});await practice(true);await volumeIs(1,1);
  await voice({npcActive:false,busy:false,active:false});await volumeIs(4,5);
  await voice({recording:true,active:true});assert.equal(await page.evaluate(()=>window.__music.volume),0);
  await voice({});await volumeIs(4,5);
  await practice(false);await volumeIs(20,24);
  await page.getByRole('button',{name:'暫停香港老歌',exact:true}).click();assert.equal(await page.evaluate(()=>window.__music.playing),false);
  await page.locator('#settings [data-dismiss]').click();
  await page.locator('#sound-controls > summary').click();
  await page.locator('#music-volume').fill('0.25');
  await page.locator('#music-toggle').click();
  await page.reload();
  await page.locator('#sound-controls > summary').click();
  assert.equal(await page.locator('#music-toggle').getAttribute('aria-pressed'),'false');
  assert.equal(await page.locator('#music-volume').inputValue(),'0.25');
  await page.locator('#music-toggle').click();
  await page.locator('#sound-controls > summary').click();
  await page.clock.install();await page.evaluate(()=>window.__musicNeverReady=true);
  await page.locator('#welcome [data-dialog="settings"]').click();await page.getByRole('button',{name:'播放香港老歌',exact:true}).click();
  await page.clock.fastForward(16000);
  assert.equal(await page.getByRole('button',{name:'重試香港老歌',exact:true}).isEnabled(),true,'unresponsive iframe times out and permits retry');
  assert.equal(await page.evaluate(()=>window.__music.playing),false);
  await page.evaluate(()=>window.__musicNeverReady=false);await page.getByRole('button',{name:'重試香港老歌',exact:true}).click();await page.clock.runFor(100);
  assert.equal(await page.evaluate(()=>window.__music.playing),true,'player can recover after timeout');
  assert.deepEqual(errors,[]);console.log('PASS music controls: selected official song, user start/pause and voice duck; player API stub, external playback requires connectivity');
 }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
