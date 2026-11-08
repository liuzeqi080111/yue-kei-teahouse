const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
(async()=>{
 const {createServer}=await import('../server.mjs');
 const server=createServer({provider:{status:()=>({configured:false})},pronunciation:{configured:false}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const errors=[];let scoreCalls=0,interpretCalls=0,scoreMode='offline';
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  localStorage.setItem('yuekei-learning-guide-v1',JSON.stringify({mode:'beginner',showMeaning:true}));
  // Synthetic test audio only: verifies real MediaRecorder/decode/playback paths.
  window.testTracks=[];
  navigator.mediaDevices.getUserMedia=async()=>{
   const ctx=new AudioContext(),osc=ctx.createOscillator(),gain=ctx.createGain(),dest=ctx.createMediaStreamDestination();
   osc.frequency.value=220;gain.gain.value=.15;osc.connect(gain);gain.connect(dest);osc.start();await ctx.resume();
   const track=dest.stream.getAudioTracks()[0],stop=track.stop.bind(track);
   let ended=false;track.stop=()=>{if(ended)return;ended=true;stop();osc.stop();void ctx.close();};window.testTracks.push(track);return dest.stream;
  };
 });
 await page.route('**/api/practice/status',r=>r.fulfill({json:{configured:scoreMode!=='offline'}}));
 await page.route('**/api/practice/assess',async r=>{
  scoreCalls++;const {phraseId}=r.request().postDataJSON();
  if(scoreMode==='fail')return r.fulfill({status:503,json:{error:{message:'测试服务暂不可用，录音已保留。'}}});
  return r.fulfill({json:{phraseId,provider:'test-fixture',scores:{accuracy:82,fluency:78,completeness:90},words:[],unsupportedDimensions:['tone','spokenJyutping']}});
 });
 await page.route('**/api/voice/interpret',r=>{
  interpretCalls++;const {text,context}=r.request().postDataJSON();
  let intents=[];
  if(/两位/.test(text))intents=[{type:'START_SEATING',partySize:2}];
  else if(/奶茶/.test(text))intents=[{type:'ADD_ITEM',itemId:'drink-milk-tea',options:{temperature:'熱',sweetness:'正常甜'}}];
  r.fulfill({json:{decision:'execute',intents,reply:'测试提案',meaning:'测试提案'}});
 });
 const url='http://127.0.0.1:'+server.address().port;
 const help=async()=>{if(await page.locator('#hud-help').isHidden())await page.locator('[data-hud="help"]').click();};
 const fallback=async()=>{await help();if(!await page.locator('.hud-fallback').evaluate(e=>e.open))await page.locator('.hud-fallback summary').click();};
 const type=async(text)=>{
  if(!await page.locator('.voice-text').isVisible()){await page.locator('[data-hud="more"]').click();await page.locator('[data-hud="type"]').click();}
  await page.locator('.voice-text').fill(text);await page.locator('.voice-send').click();
 };
 try{
  await fs.mkdir('output/ux3',{recursive:true});await page.goto(url);await page.locator('[data-action="ENTER"]').click();
  await page.waitForTimeout(500);
  assert.equal(await page.locator('.voice-mic').isVisible(),true);
  assert.equal(await page.locator('.voice-text').isVisible(),false);
  assert.equal(await page.locator('#learning-guide').isVisible(),false);
  assert.equal(await page.locator('#hud-help').isVisible(),false);
  const box=await page.locator('.voice-mic').boundingBox();assert.ok(Math.abs(box.x+box.width/2-720)<3);
  await page.screenshot({path:'output/ux3/desktop.png'});
  await help();await page.locator('[data-help="expression"]').click();
  assert.equal(await page.locator('.hud-example').count(),0);
  await page.locator('[data-level="frame"]').click();assert.match(await page.locator('.hud-example').innerText(),/＿/);
  await page.locator('[data-level="full"]').click();assert.match(await page.locator('.hud-jyutping').innerText(),/jat1/);
  await page.screenshot({path:'output/ux3/help.png'});
  await page.locator('[data-hud="close"]').click();await type('两位');
  await page.waitForFunction(()=>document.body.dataset.camera==='room',{timeout:15000});
  assert.equal(await page.locator('.hud-subtitle').isVisible(),true);
  await type('奶茶怎么说');await page.waitForFunction(()=>document.querySelector('.hud-subtitle').textContent.includes('naai5'),{timeout:15000});
  assert.match(await page.locator('.hud-subtitle').innerText(),/naai5/);
  await type('我要一杯热奶茶，正常甜');await page.waitForTimeout(300);
  await page.locator('#pause').click();await page.locator('#settings [data-open-review]').click();
  await page.locator('[data-challenge-record]').waitFor();await page.waitForTimeout(100);
  assert.equal(await page.locator('[data-challenge-record]').isEnabled(),true);
  const beforeInterpret=interpretCalls;
  await page.locator('[data-challenge-record]').click();await page.waitForTimeout(150);
  await page.evaluate(()=>{window.focusedRecordButton=document.querySelector('[data-challenge-record]');});
  await page.waitForTimeout(650);
  assert.ok(await page.locator('[data-review-recording-level]').evaluate(e=>e.value>0),'real signal drives the visible meter');
  assert.equal(await page.evaluate(()=>document.activeElement===focusedRecordButton&&focusedRecordButton.isConnected),true,'meter updates must preserve button and focus');
  for(const [width,height] of [[1366,768],[1920,1080],[320,568],[390,844],[430,932],[844,390]]){
   await page.setViewportSize({width,height});
   for(const size of ['standard','large','xlarge']){
    await page.evaluate(size=>{document.body.dataset.fontSize=size;},size);
    assert.ok(await page.locator('#review-dialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'review dialog has no horizontal overflow');
    await page.locator('[data-challenge-record]').scrollIntoViewIfNeeded();
    const bounds=await page.locator('[data-challenge-record]').boundingBox();
    assert.ok(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=width&&bounds.y+bounds.height<=height,'stop recording is reachable');
    assert.ok(await page.locator('[data-challenge-record]').evaluate(el=>{const r=el.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button')===el;}),'stop recording must not be covered by a footer');
   }
   if(width===320||height===390)await page.screenshot({path:`output/ux3/review-recording-${width}-${height}.png`});
  }
  await page.setViewportSize({width:1440,height:900});await page.evaluate(()=>{document.body.dataset.fontSize='standard';});
  await page.locator('[data-challenge-record]').click();
  await page.locator('[data-review-playback]').waitFor();assert.equal(scoreCalls,0);
  await page.locator('[data-review-playback]').click();
  await page.locator('[data-challenge-reveal]').click();assert.ok(await page.locator('.review-jyutping ruby').count()>0);
  assert.ok(await page.locator('.review-jyutping rt').first().evaluate(e=>parseFloat(getComputedStyle(e).fontSize)>=18));
  await page.screenshot({path:'output/ux3/review-offline.png'});
  assert.equal(interpretCalls,beforeInterpret);
  await page.locator('#review-dialog [data-dismiss]').click();
  assert.equal(await page.evaluate(()=>window.testTracks.every(t=>t.readyState==='ended')),true);
  // Reopen with scoring available, fail once and retry the retained recording.
  scoreMode='fail';await page.locator('#pause').click();await page.locator('#settings [data-open-review]').click();await page.waitForTimeout(150);
  await page.locator('[data-challenge-record]').click();await page.waitForTimeout(800);await page.locator('[data-challenge-record]').click();
  await page.locator('[data-review-retry]').waitFor();assert.equal(await page.locator('[data-review-playback]').isEnabled(),true);
  scoreMode='ok';await page.locator('[data-review-retry]').click();await page.locator('.review-score').waitFor();assert.match(await page.locator('.review-score').innerText(),/82/);
  await page.screenshot({path:'output/ux3/review-score-fixture.png'});
  await page.locator('[data-challenge-next]').click();assert.match(await page.locator('#review-challenge-progress').innerText(),/2 \/ 2/);
  await page.locator('[data-challenge-record]').click();await page.waitForTimeout(300);await page.locator('#review-dialog [data-dismiss]').click();
  await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>window.testTracks.every(t=>t.readyState==='ended')),true);
  // Stage preset is an existing user-facing navigation path.
  await page.locator('#pause').click();await page.locator('#restart').click();await page.locator('#welcome [data-dialog="chapters"]').click();await page.locator('[data-chapter="service"]').click();
  if(await page.evaluate(()=>document.body.dataset.camera==='table')){await fallback();await page.locator('#actions [data-camera="room"]').click();}
  await page.locator('[data-explore="window"]').click();await page.waitForTimeout(600);
  assert.equal(await page.locator('.hud-return').isVisible(),true);assert.equal(await page.locator('.hud-bottom').isVisible(),false);
  assert.match(await page.locator('#explore-note').innerText(),/街上的车/);
  const before=await page.locator('#scene').screenshot();await page.waitForTimeout(1500);const after=await page.locator('#scene').screenshot();assert.notDeepEqual(before,after,'window must animate');
  await page.screenshot({path:'output/ux3/window.png'});await page.locator('.hud-return').click();
  await fallback();await page.locator('#actions [data-camera="table"]').click();
  await page.locator('[data-dining-select]').first().click();
  const portion=await page.locator('.dining-remaining').innerText();await page.locator('[data-dining-consume]').click();
  assert.notEqual(await page.locator('.dining-remaining').innerText(),portion);await page.screenshot({path:'output/ux3/food-feedback.png'});
  await page.locator('[data-dining-close]').click();await fallback();await page.locator('#actions [data-camera="room"]').click();
  for(const [width,height,name] of [[390,844,'mobile'],[844,390,'landscape'],[1280,720,'laptop']]){
   await page.setViewportSize({width,height});await page.waitForTimeout(150);
   assert.equal(await page.locator('.voice-mic').isVisible(),true);
   const mic=await page.locator('.voice-mic').boundingBox();assert.ok(mic.x>=0&&mic.y>=0&&mic.x+mic.width<=width&&mic.y+mic.height<=height);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await page.screenshot({path:`output/ux3/${name}.png`});
  }
  assert.deepEqual(errors,[]);console.log('PASS UX3 browser: compact HUD, staged help, text intent, local recording, retained score retry, cancellation, window animation, portions and three viewport sizes.');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exit(1);});
