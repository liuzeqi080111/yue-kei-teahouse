const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');

(async()=>{
 const {createServer}=await import('../server.mjs');
 const server=createServer({provider:{status:()=>({configured:false})}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+server.address().port+'/?street=3d';
 const browser=await chromium.launch({channel:'msedge',args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:1200,height:760}});
  await page.goto(url);
  await page.evaluate(()=>document.querySelector('#chapters').showModal());
  await page.locator('[data-chapter="full"]').click();
  await page.locator('[data-learning-mode="experienced"]').click();
  await page.locator('#dining-room:visible').waitFor();
  await page.locator('.hud-direct [data-action="START_SEATING"]').first().waitFor();
  // The view returns to its starting angle. With the old accumulating bone
  // offsets, the viewport differs even though the waiter is standing still.
  const capture=()=>page.screenshot({clip:{x:450,y:180,width:300,height:300}});
  const before=await capture();
  await page.mouse.move(475,280);await page.mouse.down();
  await page.mouse.move(535,300,{steps:25});await page.mouse.move(475,280,{steps:25});await page.mouse.up();
  // Only compare the area above the animated microphone and subtitles.
  assert.deepEqual(await capture(),before,'head and shoulders must return to the same pose');
  await page.close();
  const street=await browser.newPage({viewport:{width:390,height:844},permissions:['microphone']});
  let requests=0;
  await street.route('**/api/voice/transcribe',route=>{requests++;return route.fulfill({json:{text:'出门'}});});
  await street.goto(url);await street.locator('.vinyl-new').click();
  await street.locator('[data-learning-mode="experienced"]').click();
  const mic=street.locator('#street-mic');await mic.click({timeout:60000});
  await street.waitForSelector('#street-mic[aria-pressed="true"]');await street.waitForTimeout(1200);
  await mic.click();
  await street.locator('[data-street-action="defer"]').waitFor();assert.equal(requests,1);
  const door=await browser.newPage({viewport:{width:390,height:844}});
  await door.goto(url);
  await door.evaluate(async()=>{
   const {freshWorld,saveWorld}=await import('./neighborhood-state.js');
   const world=freshWorld();world.location='street';
   world.streetView={x:-13.7,z:8.3,pitch:0,heading:-1.48};
   saveWorld(localStorage,world);
   localStorage.setItem('yuekei-learning-guide-v1',JSON.stringify({mode:'experienced',showMeaning:true}));
  });
  await door.reload();
  await door.locator('.vinyl-continue').click();
  await door.locator('#street-dine:visible').waitFor();
  await door.locator('#street-interact').filter({hasText:'阿明'}).click();
  let releaseRoom;
  const waitingForRoom=new Promise(resolve=>{
   door.route('**/assets/street/district.glb',async route=>{
    await new Promise(release=>{releaseRoom=release;resolve();});await route.continue();
   });
  });
  await door.locator('[data-street-action="enter-restaurant"]').click();
  await waitingForRoom;
  assert(await door.locator('#street-view').isVisible(),'street must remain visible while the dining scene loads');
  releaseRoom();
  await door.locator('.hud-direct [data-action="START_SEATING"]').first().waitFor();
  assert(await door.locator('#dining-room').isVisible());
  await door.locator('.hud-direct [data-action="START_SEATING"]').first().click();
  await door.waitForFunction(()=>document.querySelector('#location').textContent.includes('03'));
  await door.locator('#world-leave-restaurant').click();
  await door.locator('#street-dine:visible').click();
  await door.locator('#dining-room:visible').waitFor();
  for(const [width,height,touch] of [[1280,800,false],[390,844,true]]){
   const table=await browser.newPage({viewport:{width,height},hasTouch:touch});
   await table.goto(url);
   await table.evaluate(()=>document.querySelector('#chapters').showModal());
   await table.locator('[data-chapter="service"]').click();
   await table.locator('[data-learning-mode="experienced"]').click();
   await table.locator('#dining-room:visible').waitFor();
   async function tapEdge(locator){
    const box=await locator.boundingBox();
    assert.ok(box.width>=48&&box.height>=48);
    const x=box.x+box.width*.78,y=box.y+box.height*.49;
    if(touch)await table.touchscreen.tap(x,y);else await table.mouse.click(x,y);
   }
   for(const id of ['line-1','line-2']){
    await tapEdge(table.locator('.dining-food-spot[data-dining-select="'+id+'"]'));
    await table.locator('[data-dining-consume="'+id+'"]').waitFor();
    await table.locator('[data-dining-close]').click();
   }
   await tapEdge(table.locator('.table-menu-hotspot'));
   await table.locator('#panel:visible').waitFor();
   await table.close();
  }
  console.log('PASS reversible drag, stable waiter pose, spoken intro, dining from both the storefront and waiter dialogue, and dish/menu edge selection by mouse and touch.');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
