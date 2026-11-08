const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),crypto=require('node:crypto');
(async()=>{
 const {createServer}=await import('../server.mjs');
 const server=createServer({provider:{status:()=>({configured:false})}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 await fs.mkdir('output/ux4',{recursive:true});
 const report=[];
 try{
  for(const reducedMotion of ['reduce','no-preference']){
   const page=await browser.newPage({viewport:{width:1366,height:768},reducedMotion});
   page.setDefaultTimeout(10000);
   await page.addInitScript(()=>{localStorage.setItem('yuekei-hud-intro-seen','1');localStorage.setItem('yuekei-learning-guide-v1',JSON.stringify({mode:'beginner',showMeaning:true}));});
   await page.goto('http://127.0.0.1:'+server.address().port);
   await page.evaluate(()=>{window.videoParts=[];window.videoStream=document.querySelector('#scene').captureStream(24);window.videoRecorder=new MediaRecorder(window.videoStream,{mimeType:'video/webm'});videoRecorder.ondataavailable=e=>{if(e.data.size)videoParts.push(e.data);};videoRecorder.start();});
   await page.locator('#welcome [data-dialog="chapters"]').click();await page.locator('[data-chapter="service"]').click();
   const help=async()=>{if(!await page.locator('#hud-help').isVisible())await page.locator('[data-hud="help"]').click();if(!await page.locator('.hud-fallback').evaluate(e=>e.open))await page.locator('.hud-fallback summary').click();};
   const act=async action=>{await help();await page.locator(`#actions [data-action="${action}"]`).click();if(await page.locator('#hud-help').isVisible())await page.locator('[data-hud="close"]').click();};
   const samples=async(name,count=5,delay=300)=>{
    const hashes=[];for(let n=0;n<count;n++){await page.waitForTimeout(delay);const data=await page.locator('#scene').screenshot();hashes.push(crypto.createHash('sha256').update(data).digest('hex'));if(n===2)await page.screenshot({path:`output/ux4/${name}-${reducedMotion}.png`});}
    assert.equal(new Set(hashes).size,count,`${name} must repaint every sampled intermediate position with ${reducedMotion}`);report.push({name,reducedMotion,uniqueFrames:count});
   };
   // Service chapter starts seated with food, waiter absent. Actual UI actions and RAF.
   await page.locator('[data-hud-camera="room"]').first().click();
   await page.locator('#hotspots [data-action="CALL_WAITER"]').click();await samples('approach');await page.waitForFunction(()=>!document.querySelector('#scene-hint').textContent.includes('正在服务'));
   await act('REQUEST_WATER');await page.waitForFunction(()=>document.body.dataset.camera==='table');await samples('water',6,400);
   await page.waitForFunction(()=>!document.querySelector('#scene-hint').textContent.includes('正在服务'));
   await page.locator('[data-explore="window"]').click();await samples('window',5,450);
   await page.locator('.hud-return').click();
   await page.setViewportSize({width:390,height:844});await act('REQUEST_WATER');await page.waitForFunction(()=>document.body.dataset.camera==='table');await page.waitForTimeout(2300);await page.screenshot({path:`output/ux4/water-mobile-${reducedMotion}.png`});await page.waitForFunction(()=>!document.querySelector('#scene-hint').textContent.includes('正在服务'));
   await page.setViewportSize({width:1366,height:768});
   // Add a different dish through the actual menu, confirm, and sample serving.
   await page.locator('[data-hud-camera="table"]').click();await page.locator('[data-hud-camera="menu"]').click();await page.locator('[data-item="food-charsiu-rice"]').click();await page.locator('#item-form [type="submit"]').click();await page.locator('#panel [data-action="CONFIRM_ORDER"]').click();
   await page.waitForFunction(()=>!document.querySelector('#scene-hint').textContent.includes('正在服务'));await act('FINISH_ORDER');
   // Departure + preparation + approach = 8000ms, then the 900ms placement.
   await page.waitForTimeout(7900);await samples('serving',3,150);
   await page.waitForFunction(()=>!document.querySelector('#scene-hint').textContent.includes('正在服务'));
   const video=await page.evaluate(()=>new Promise(resolve=>{videoRecorder.onstop=async()=>{videoStream.getTracks().forEach(t=>t.stop());resolve(Array.from(new Uint8Array(await new Blob(videoParts).arrayBuffer())));};videoRecorder.stop();}));
   await fs.writeFile(`output/ux4/${reducedMotion}.webm`,Buffer.from(video));await page.close();
  }
  await fs.writeFile('output/ux4/motion.json',JSON.stringify(report,null,2));console.log('PASS actual canvas intermediate frames: walking, pouring and window with reduced motion both on and off.');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
