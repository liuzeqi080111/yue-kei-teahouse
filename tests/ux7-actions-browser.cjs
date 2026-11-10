const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs/promises');
(async()=>{
 const {createServer}=await import('../server.mjs');const server=createServer({provider:{status:()=>({configured:false})}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 // Playwright normally hides scrollbars. That hides the original mouse-down
 // overflow/reflow bug on Windows, so retain the browser's real scrollbars.
 const browser=await chromium.launch({channel:'msedge',headless:true,ignoreDefaultArgs:['--hide-scrollbars']});
 const report=[],errors=[];await fs.mkdir('output/ux7',{recursive:true});
 try{
  for(const viewport of [{width:1105,height:697},{width:1672,height:954},{width:390,height:844}])for(const action of ['REQUEST_BILL','WAITER_LEAVE']){
   const page=await browser.newPage({viewport,hasTouch:viewport.width===390});page.setDefaultTimeout(12000);
   page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(()=>{localStorage.setItem('yuekei-hud-intro-seen','1');localStorage.setItem('yuekei-learning-guide-v1',JSON.stringify({mode:'beginner',showMeaning:true}));});
   await page.goto('http://127.0.0.1:'+server.address().port);
   await page.locator('#welcome [data-dialog="chapters"]').click();await page.locator('[data-chapter="service"]').click();
   await page.locator('[data-hud-camera="room"]').click();await page.locator('[data-action="CALL_WAITER"]').click();
   await page.locator('[data-explore="window"]').waitFor({state:'visible'});
   await page.locator('[data-hud="help"]').click();await page.locator('.hud-fallback summary').click();
   // User scrolls the help card to reach its bottom row; do not use locator.click
   // for the regression, since it may scroll/retry after the control moves.
   await page.locator('#hud-help').evaluate(e=>e.scrollTop=e.scrollHeight);
   const button=page.locator(`#actions [data-action="${action}"]`),before=await button.boundingBox();
   const point={x:before.x+before.width/2,y:before.y+before.height/2};
   assert.ok(await button.evaluate((b,p)=>document.elementFromPoint(p.x,p.y)===b,point),'visible action receives pointer');
   await page.mouse.move(point.x,point.y);await page.mouse.down();await page.waitForTimeout(180);
   const held=await button.boundingBox();await page.mouse.up();
   assert.ok(Math.abs(held.x-before.x)<1&&Math.abs(held.y-before.y)<1&&Math.abs(held.width-before.width)<1,`${action}: held button must stay at its original target: ${JSON.stringify({before,held})}`);
   if(action==='REQUEST_BILL'){
    await page.waitForFunction(()=>document.body.dataset.camera==='bill');
    assert.match(await page.locator('#panel').innerText(),/40\.00/);
   }else{
    await page.locator('#hotspots [data-action="CALL_WAITER"]').waitFor({state:'visible'});
    assert.match(await page.locator('.hud-subtitle').innerText(),/有事再叫我/);
   }
   await page.screenshot({path:`output/ux7/${action}-${viewport.width}.png`});
   report.push({action,viewport,passed:true});await page.close();
  }
  assert.deepEqual(errors,[]);await fs.writeFile('output/ux7/actions.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
