const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs/promises');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,ignoreDefaultArgs:['--hide-scrollbars']});
 const page=await browser.newPage({viewport:{width:1366,height:768}}),errors=[],badAssets=[],calls=[];
 page.setDefaultTimeout(45000);page.on('pageerror',e=>errors.push(e.message));
 page.on('response',r=>{if(r.status()>=400&&/\.(js|css|wav|png)(\?|$)/.test(r.url()))badAssets.push({url:r.url(),status:r.status()})});
 page.on('request',r=>{if(r.method()==='POST'&&r.url().includes('/api/voice/'))calls.push(r.url().split('/').at(-1))});
 await page.addInitScript(()=>{
  localStorage.setItem('yuekei-learning-guide-v1',JSON.stringify({mode:'beginner',showMeaning:true}));localStorage.setItem('yuekei-hud-intro-seen','1');
  window.heard=[];const AudioOriginal=window.Audio;window.Audio=function(...args){const a=new AudioOriginal(...args);a.addEventListener('playing',()=>heard.push({rate:a.playbackRate,src:a.src}));return a};
 });
 try{
  await page.goto(process.env.TEST_URL||'https://liuzeqi080111.github.io/yue-kei-teahouse/',{waitUntil:'networkidle'});
  const version=await page.evaluate(async()=>{const r=await fetch('version.json',{cache:'no-store'});if(!r.ok)throw Error('version missing');return r.json()});
  if(process.env.EXPECT_COMMIT)assert.equal(version.commit,process.env.EXPECT_COMMIT);
  assert.equal(version.voiceEnabled,true);
  await page.locator('#welcome [data-action="ENTER"]').click();
  await page.locator('.hud-direct [data-hud="first-answer"]').waitFor();
  await page.waitForFunction(()=>heard.some(a=>a.src.startsWith('blob:')));assert.equal(calls.includes('speak'),false,'greeting is a packaged local clip');
  await page.locator('[data-hud="more"]').click();await page.locator('[data-hud="slow"]').click();
  await page.waitForFunction(()=>heard.some(a=>a.rate===.72));await page.locator('[data-hud="close-more"]').click();
  // Actual cross-origin TTS and recognition from the deployed page, using synthetic speech.
  const cloud=await page.evaluate(async()=>{
   const origin=document.documentElement.dataset.voiceApi;
   const start=performance.now();const s=await fetch(origin+'/api/voice/status');if(!s.ok)throw Error('status '+s.status());const status=await s.json();
   const t=await fetch(origin+'/api/voice/speak',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:'兩位呀，唔該。'})});if(!t.ok)throw Error('speak '+t.status());const clip=await t.json();
   const a=await fetch(origin+'/api/voice/transcribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(clip)});if(!a.ok)throw Error('transcribe '+a.status());
   return {configured:status.configured,recognized:(await a.json()).text,ms:Math.round(performance.now()-start)};
  });assert.ok(cloud.configured);assert.match(cloud.recognized,/兩|两/);
  await page.locator('[data-hud="more"]').click();await page.locator('[data-hud="type"]').click();
  await page.locator('.voice-text').fill('两位');await page.locator('.voice-send').click();
  await page.locator('[data-hud-camera="menu"]:not(:disabled)').waitFor();
  await page.locator('[data-hud-camera="menu"]').click();await page.locator('[data-item="food-pineapple-bun"]').click();await page.locator('#item-form [type="submit"]').click();
  await page.locator('#panel [data-action="CONFIRM_ORDER"]').click();await page.locator('.hud-direct [data-action="FINISH_ORDER"]').click();
  await page.locator('[data-hud-camera="menu"]:not(:disabled)').waitFor();
  await page.locator('[data-hud="help"]').click();await page.locator('.hud-fallback summary').click();await page.locator('#actions [data-action="REQUEST_BILL"]').click();
  await page.locator('#panel [data-action="PAY_BILL"]:not(:disabled)').click();await page.locator('#ending').waitFor();
  await page.locator('#ending [data-open-review]').click();await page.locator('[data-challenge-next]').click();await page.locator('[data-challenge-next]').click();await page.locator('#review-dialog [data-dismiss]').click();
  await fs.mkdir('output/acceptance',{recursive:true});await page.screenshot({path:'output/acceptance/public-receipt.png'});
  assert.deepEqual(errors,[]);assert.deepEqual(badAssets,[]);
  const result={version,cloud,calls,errors,badAssets,passed:true};await fs.writeFile('output/acceptance/public-browser.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }catch(e){await fs.mkdir('output/acceptance',{recursive:true});await page.screenshot({path:'output/acceptance/public-failure.png'});throw e}
 finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
