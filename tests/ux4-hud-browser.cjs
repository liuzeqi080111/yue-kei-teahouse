const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs/promises');
(async()=>{
 const {createServer}=await import('../server.mjs');
 const server=createServer({provider:{status:()=>({configured:false})}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'msedge',headless:true});await fs.mkdir('output/ux4',{recursive:true});
 try{
  const page=await browser.newPage();page.setDefaultTimeout(10000);
  await page.addInitScript(()=>{
   localStorage.setItem('yuekei-hud-intro-seen','1');localStorage.setItem('yuekei-learning-guide-v1',JSON.stringify({mode:'beginner',showMeaning:true}));
   navigator.mediaDevices.getUserMedia=async()=>{const ctx=new AudioContext(),osc=ctx.createOscillator(),dest=ctx.createMediaStreamDestination();osc.connect(dest);osc.start();await ctx.resume();const track=dest.stream.getAudioTracks()[0],stop=track.stop.bind(track);track.stop=()=>{stop();osc.stop();void ctx.close();};return dest.stream;};
  });
  await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('#welcome [data-dialog="chapters"]').click();await page.locator('[data-chapter="service"]').click();
  for(const [width,height] of [[1366,768],[320,568],[390,844],[844,390]]){
   await page.setViewportSize({width,height});
   await page.locator('[data-hud-camera="room"]').click();
   assert.equal(await page.locator('#hotspots [data-action="CALL_WAITER"]').isVisible(),true,'menu available while waiter absent');
   await page.locator('[data-hud-camera="menu"]').click();assert.equal(await page.locator('#panel').isVisible(),true);
   await page.locator('[data-hud-camera="table"]').click();assert.equal(await page.getAttribute('body','data-camera'),'table');
   assert.equal(await page.locator('#hotspots .look').count(),0,'old corner look button removed');
   for(const selector of ['[data-hud-camera="room"]','[data-hud-camera="menu"]','.voice-mic']){
    const e=page.locator(selector);assert.ok(await e.evaluate(el=>{const r=el.getBoundingClientRect();return r.width>=44&&r.height>=44&&r.x>=0&&r.y>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button')===el;}),'dock controls visible and unobstructed '+selector);
   }
   await page.locator('[data-hud="help"]').click();await page.locator('[data-help="expression"]').click();
   assert.equal(await page.locator('[data-level]').count(),0);assert.doesNotMatch(await page.locator('.hud-example').innerText(),/＿/);
   assert.match(await page.locator('.hud-jyutping').innerText(),/[a-z]+[1-6]/);
   await page.locator('.voice-mic').click();await page.waitForTimeout(200);
   assert.equal(await page.locator('.voice-mic').getAttribute('data-recording'),'true');
   await page.locator('.hud-jyutping').scrollIntoViewIfNeeded();
   assert.ok(await page.locator('#hud-help').evaluate(el=>el.getBoundingClientRect().top>=0),'help card must not extend above the screen');
   assert.ok(await page.locator('.hud-jyutping').evaluate(el=>{const r=el.getBoundingClientRect(),p=el.closest('.hud-card').getBoundingClientRect();return r.top>=p.top&&r.bottom<=p.bottom&&r.top>=0;}),'Jyutping actually inside visible help while recording');
   await page.screenshot({path:`output/ux4/recording-${width}.png`});
   assert.ok(await page.locator('.voice-mic').evaluate(el=>{const r=el.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button')===el;}),'recording stop remains reachable');
   await page.getByRole('button',{name:'取消本次语音'}).click();await page.locator('[data-hud="close"]').click();
  }
  console.log('PASS dock menu without waiter, table switch, no corner button, direct full example, real MediaRecorder Jyutping and reachable stop across four viewports.');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
