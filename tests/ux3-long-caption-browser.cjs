const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const assert=require('node:assert/strict');
(async()=>{
 const {createServer}=await import('../server.mjs');const server=createServer({provider:{status:()=>({configured:false})}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:390,height:844}});
 await page.addInitScript(()=>{localStorage.setItem('yuekei-hud-intro-seen','1');localStorage.setItem('yuekei-learning-guide-v1',JSON.stringify({mode:'beginner',showMeaning:true}));});
 const meaning='可以看看菜单和窗外，选好餐品后再告诉阿明。'.repeat(12).slice(0,200);
 await page.route('**/api/voice/interpret',r=>r.fulfill({json:{decision:'reply',intents:[],reply:'慢慢揀，唔使急。',meaning}}));
 try{
  await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('[data-action="ENTER"]').click();await page.waitForTimeout(550);
  await page.locator('[data-hud="more"]').click();await page.locator('[data-hud="type"]').click();await page.locator('.voice-text').fill('我想听详细说明');await page.locator('.voice-send').click();
  await page.waitForFunction(()=>document.querySelector('.hud-subtitle').textContent.length===200);await page.locator('.voice-text-close').click();
  for(const [width,height] of [[1366,768],[1920,1080],[320,568],[390,844],[430,932],[844,390]]){
   await page.setViewportSize({width,height});await page.evaluate(()=>{document.body.dataset.fontSize='xlarge';});
   await page.locator('[data-hud="subtitle"]').click();assert.equal(await page.locator('.hud-subtitle').textContent(),meaning);
   await page.locator('.hud-subtitle').focus();await page.keyboard.press('End');
   const bounds=await page.locator('.hud-caption').boundingBox(),mic=await page.locator('.voice-mic').boundingBox();
   assert.ok(bounds.y>=0&&bounds.x>=0&&bounds.x+bounds.width<=width,'expanded long caption stays on screen');
   assert.ok(mic.y>=0&&mic.y+mic.height<=height,'microphone remains visible');
   assert.ok(await page.locator('.hud-subtitle').evaluate(e=>e.scrollHeight<=e.clientHeight||e.scrollTop>0),'long text can be read by keyboard scrolling');
   await page.locator('[data-hud="subtitle"]').click();
  }
  // Geometry simulation only; a physical phone keyboard still needs human validation.
  await page.setViewportSize({width:390,height:844});await page.locator('[data-hud="more"]').click();await page.locator('[data-hud="type"]').click();await page.locator('.voice-text').focus();
  await page.evaluate(()=>{Object.defineProperty(visualViewport,'height',{configurable:true,get:()=>440});visualViewport.dispatchEvent(new Event('resize'));});
  assert.equal(await page.locator('body').getAttribute('data-mobile-keyboard'),'true');assert.equal(await page.locator('.hud-caption').isVisible(),false);
  for(const selector of ['.voice-text','.voice-send','.voice-text-close']){
   const bounds=await page.locator(selector).boundingBox();assert.ok(bounds.y>=0&&bounds.y+bounds.height<=440,selector+' remains above the simulated keyboard');
  }
  await page.screenshot({path:'output/ux3/keyboard-simulated.png'});
  await page.evaluate(()=>{delete visualViewport.height;visualViewport.dispatchEvent(new Event('resize'));});await page.locator('.voice-text-close').click();
  await page.waitForFunction(()=>document.body.dataset.mobileKeyboard==='false');assert.equal(await page.locator('.hud-caption').isVisible(),true);
  console.log('PASS long caption expansion/keyboard scroll at six viewports with extra large type; simulated mobile visual viewport keeps input/send above keyboard.');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
