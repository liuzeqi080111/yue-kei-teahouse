const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs/promises');
(async()=>{
 const {createServer}=await import('../server.mjs'),server=createServer({provider:{status:()=>({configured:false})}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'msedge',headless:true,ignoreDefaultArgs:['--hide-scrollbars']});
 const results=[],errors=[];await fs.mkdir('output/ux8',{recursive:true});
 const prepare=async(viewport)=>{const p=await browser.newPage({viewport,hasTouch:viewport.width===390});p.setDefaultTimeout(18000);p.on('pageerror',e=>errors.push(e.message));await p.addInitScript(()=>{localStorage.setItem('yuekei-hud-intro-seen','1');localStorage.setItem('yuekei-learning-guide-v1',JSON.stringify({mode:'beginner',showMeaning:true}));});await p.goto('http://127.0.0.1:'+server.address().port);return p;};
 try{
  const fresh=await prepare({width:1287,height:1161});
  await fresh.locator('#welcome [data-action="ENTER"]').click();
  await fresh.locator('[data-hud="help"]').click();await fresh.locator('.hud-fallback summary').click();
  await fresh.locator('#actions [data-action="START_SEATING"]').first().click();
  const physical=fresh.locator('.table-menu-hotspot');await physical.waitFor({state:'visible'});
  assert.doesNotMatch(await fresh.locator('#scene').getAttribute('aria-label'),/阿明在場/);
  await physical.focus();await fresh.screenshot({path:'output/ux8/seated-menu-focus.png'});await fresh.keyboard.press('Enter');
  assert.equal(await fresh.getAttribute('body','data-camera'),'menu');
  assert.equal(await physical.count(),0);
  assert.match(await fresh.locator('#panel').innerText(),/菠萝油/);
  assert.doesNotMatch(await fresh.locator('#scene').getAttribute('aria-label'),/阿明在場/);
  await fresh.screenshot({path:'output/ux8/opened-menu.png'});results.push('fresh seating: direct keyboard menu opening without calling waiter');await fresh.close();
  for(const viewport of [{width:1366,height:768},{width:1287,height:1161},{width:390,height:844},{width:844,height:390}]){
   const page=await prepare(viewport);
   await page.locator('#welcome [data-dialog="chapters"]').click();await page.locator('[data-chapter="service"]').click();
   for(const camera of ['room','table']){
    if(await page.getAttribute('body','data-camera')!==camera)await page.locator(`[data-hud-camera="${camera}"]`).click();
    const menu=page.locator('.table-menu-hotspot'),rect=await menu.boundingBox();
    assert.ok(rect&&rect.width>=44&&rect.height>=44);
    // An independent point on the painted menu, transformed from scene space.
    const point=await page.locator('#scene').evaluate((canvas,camera)=>{
     const r=canvas.getBoundingClientRect(),fit=getComputedStyle(canvas).objectFit;
     const s=(fit==='contain'?Math.min:Math.max)(r.width/1008,r.height/567);
     return {x:Math.max(8,r.x+(r.width-1008*s)/2+80*s),y:Math.min(r.bottom-12,r.y+(r.height-567*s)/2+(camera==='room'?519:350)*s)};
    },camera);
    const hit=await menu.evaluate((button,p)=>({ok:document.elementFromPoint(p.x,p.y)===button,element:document.elementFromPoint(p.x,p.y)?.outerHTML.slice(0,200)}),point);
    assert.ok(hit.ok,`painted menu receives the click ${JSON.stringify({viewport,camera,point,rect,hit})}`);
    await page.screenshot({path:`output/ux8/${camera}-${viewport.width}.png`});
    if(viewport.width===390)await page.touchscreen.tap(point.x,point.y);else await page.mouse.click(point.x,point.y);
    assert.equal(await page.getAttribute('body','data-camera'),'menu');
    assert.equal(await menu.count(),0);assert.doesNotMatch(await page.locator('#scene').getAttribute('aria-label'),/阿明在場/);
    await page.locator('#panel [data-close]').click();await menu.waitFor({state:'visible'});
    results.push({viewport,camera,opened:true});
   }
   await page.close();
  }
  assert.deepEqual(errors,[]);await fs.writeFile('output/ux8/verification.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
