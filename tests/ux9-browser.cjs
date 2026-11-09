const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs/promises');
(async()=>{
 const {createServer}=await import('../server.mjs');const server=createServer({provider:{status:()=>({configured:false})}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'msedge',headless:true,ignoreDefaultArgs:['--hide-scrollbars']});
 const errors=[],report=[];await fs.mkdir('output/ux9',{recursive:true});
 try{
 for(const viewport of (process.env.UX9_VIEWPORTS?JSON.parse(process.env.UX9_VIEWPORTS):[{width:1366,height:768},{width:410,height:556},{width:390,height:844},{width:320,height:568},{width:844,height:390}])){
  const page=await browser.newPage({viewport});page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{localStorage.setItem('yuekei-hud-intro-seen','1');localStorage.setItem('yuekei-learning-guide-v1',JSON.stringify({mode:'beginner',showMeaning:true}));});
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.locator('#welcome [data-action="ENTER"]').click();
  await page.locator('.hud-direct [data-hud="first-answer"]').click();
  assert.match(await page.locator('.hud-help-content').innerText(),/jat1/);
  await page.locator('[data-hud="close"]').click();
  await page.locator('.hud-direct [data-action="START_SEATING"]').first().click();
  await page.locator('[data-hud-camera="menu"]').waitFor({state:'visible'});
  await page.locator('[data-hud-camera="menu"]').click();
  await page.screenshot({path:`output/ux9/menu-${viewport.width}.png`});
  const body=page.locator('.paper-body');assert.ok((await body.boundingBox()).height>=120,JSON.stringify({viewport,body:await body.boundingBox()}));
  await page.screenshot({path:`output/ux9/menu-${viewport.width}.png`});
  await page.locator('.panel-lesson-details > summary').click();
  await page.locator('[data-item="food-pineapple-bun"]').click();
  await page.locator('#item-form [type="submit"]').click();
  await page.locator('#panel [data-action="CONFIRM_ORDER"]').click();
  await page.locator('.hud-direct [data-action="CONTINUE_ORDER"]').click();
  await page.locator('#panel [data-action="CONFIRM_ORDER"]').click();
  const finish=page.locator('.hud-direct [data-action="FINISH_ORDER"]');await finish.waitFor({state:'visible'});
  assert.match(await page.locator('.hud-direct-note').innerText(),/尚未下单/);
  const box=await finish.boundingBox();assert.ok(box.y>=0&&box.y+box.height<=viewport.height);
  await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
  await page.locator('[data-hud-camera="menu"]:not(:disabled)').waitFor({state:'visible'});
  await page.locator('[data-hud-camera="menu"]').click();
  await page.locator('[data-tab="order"]').click();
  assert.match(await page.locator('.paper-body').innerText(),/已上/);
  await page.locator('#panel [data-close]').click();
  await page.screenshot({path:`output/ux9/room-${viewport.width}.png`});
  if(viewport.width<=410){const scene=await page.locator('#scene').boundingBox();assert.ok(scene.y<=64&&scene.height>viewport.width*9/16,'portrait scene fills more than the old strip');}
  await page.locator('[data-hud="more"]').click();await page.locator('[data-hud="type"]').click();
  await page.locator('.voice-text').fill('暂时保留的文字');
  await page.locator('[data-hud-camera="menu"]').click();assert.equal(await page.locator('.voice-text').isVisible(),false);
  await page.locator('[data-hud="more"]').click();await page.locator('[data-hud="type"]').click();
  assert.equal(await page.locator('#panel').isVisible(),false);assert.equal(await page.locator('.voice-text').inputValue(),'暂时保留的文字');
  await page.locator('.voice-text-close').click();
  if(viewport.width===390){
   await page.locator('[data-hud="help"]').click();await page.locator('.hud-fallback summary').click();
   await page.locator('#actions [data-action="REQUEST_BILL"]').click();
   await page.locator('#panel [data-action="PAY_BILL"]:not(:disabled)').waitFor({state:'visible'});
   await page.locator('[data-recall-review]').click();
   assert.match(await page.locator('#review-context').innerText(),/先回想/);
   await page.locator('[data-challenge-reveal]').click();assert.ok(await page.locator('.review-jyutping').isVisible());
   await page.locator('[data-challenge-next]').click();await page.locator('#review-dialog [data-dismiss]').click();
   await page.locator('#panel [data-action="PAY_BILL"]').click();await page.locator('#ending').waitFor({state:'visible'});
   assert.match(await page.locator('#round-review').innerText(),/尚未尝试语音/);
   assert.doesNotMatch(await page.locator('#round-review').innerText(),/记住一句/);
   await page.screenshot({path:'output/ux9/receipt-390.png'});
  }
  console.log('PASS',viewport);
  report.push({viewport,passed:true});await page.close();
 }
 assert.deepEqual(errors,[]);await fs.writeFile('output/ux9/verification.json',JSON.stringify(report,null,2));console.log(report);
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});

