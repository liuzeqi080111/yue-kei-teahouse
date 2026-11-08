const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
(async()=>{
 const {createServer}=await import('../server.mjs');
 const server=createServer({provider:{status:()=>({configured:false})}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  await fs.mkdir('output/ux3/exploration',{recursive:true});
  for(const viewport of [{width:1366,height:768},{width:390,height:844},{width:844,height:390}]){
   const page=await browser.newPage({viewport,hasTouch:viewport.width===390});
   await page.addInitScript(()=>{
    localStorage.setItem('yuekei-learning-guide-v1',JSON.stringify({mode:'beginner',showMeaning:true}));
    localStorage.setItem('yuekei-ux3-intro-seen','1');
   });
   await page.goto('http://127.0.0.1:'+server.address().port);
   await page.locator('#welcome [data-dialog="chapters"]').click();
   await page.locator('[data-chapter="service"]').click();
   await page.locator('#hotspots [data-camera="room"]').click();
   const spot=page.locator('[data-explore="window"]');
   const bounds=await spot.boundingBox();
   assert.ok(bounds&&bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=viewport.width&&bounds.y+bounds.height<=viewport.height,'window entrance must be in viewport');
   if(viewport.width===390)await spot.tap();else {await spot.focus();await page.keyboard.press('Enter');}
   assert.equal(await page.getAttribute('body','data-camera'),'window');
   await page.locator('#explore-note').waitFor({state:'visible'});
   const note=await page.locator('#explore-note').boundingBox();
   assert.ok(note.x>=0&&note.y>=64&&note.x+note.width<=viewport.width&&note.y+note.height<viewport.height-100,'observation copy stays readable and away from controls');
   assert.ok(await page.locator('#explore-note').evaluate(e=>parseFloat(getComputedStyle(e).fontSize)>=18),'observation copy uses readable body type');
   assert.equal(await page.locator('.hud-bottom').isVisible(),false);
   const ret=page.locator('.hud-return');
   await ret.waitFor({state:'visible'});
   const box=await ret.boundingBox();
   assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=viewport.width&&box.y+box.height<=viewport.height,'return must be in viewport');
   await page.screenshot({path:`output/ux3/exploration/window-${viewport.width}.png`});
   await page.emulateMedia({reducedMotion:'reduce'});
   await page.waitForTimeout(150);
   const still=await page.locator('#scene').screenshot();await page.waitForTimeout(250);
   assert.deepEqual(await page.locator('#scene').screenshot(),still,'reduced motion must stop scene motion');
   if(viewport.width===390)await ret.tap();else {await ret.focus();await page.keyboard.press('Enter');}
   assert.equal(await page.getAttribute('body','data-camera'),'room');
   assert.equal(await page.locator('#explore-note').isVisible(),false);
   assert.equal(await page.locator('.voice-mic').isVisible(),true);
   await page.close();
  }
  console.log('PASS exploration keyboard/touch entrance and return, reduced motion, three viewports.');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exit(1)});
