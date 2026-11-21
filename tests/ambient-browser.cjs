const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const {createServer}=await import('../server.mjs');
 const server=createServer({provider:{status:()=>({configured:false})}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   const AudioClass=window.Audio;
   window.Audio=class extends AudioClass{constructor(src){super(src);if(src==='assets/hongkong-evening.wav')window.score=this;}};
  });
  await page.goto('http://127.0.0.1:'+server.address().port+'/?street=3d');
  const settings=page.locator('#welcome [data-dialog="settings"]:visible').first();
  await settings.click();await page.waitForFunction(()=>window.score?.currentTime>.1&&!score.paused&&score.volume>0&&score.loop);
  const volume=await page.evaluate(()=>score.volume);
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('voice-activity',{detail:{recording:true,active:true}})));
  await page.waitForFunction(()=>score.volume===0);
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('voice-activity',{detail:{active:false}})));
  await page.waitForFunction(v=>score.volume===v,volume);
  await page.locator('#ambience').click();await page.waitForFunction(()=>score.paused);
  await page.reload();await settings.click();assert.equal(await page.locator('#ambience').getAttribute('aria-pressed'),'false');
  assert.equal(await page.evaluate(()=>score.paused),true);
  await page.locator('#ambience').click();await page.waitForFunction(()=>score.currentTime>.1&&!score.paused);
  assert.deepEqual(errors,[]);console.log('PASS ambience: gesture start, audible signal, voice duck/recovery, off, saved preference and re-enable');
 }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
