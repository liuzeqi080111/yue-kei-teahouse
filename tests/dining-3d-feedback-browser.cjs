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
  await page.locator('[data-dialog="chapters"]').click();
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
  await street.goto(url);await street.locator('[data-world-save-state]').click();
  await street.locator('[data-learning-mode="experienced"]').click();
  const mic=street.locator('#street-mic');await mic.click({timeout:60000});
  await street.waitForSelector('#street-mic[aria-pressed="true"]');await street.waitForTimeout(1200);
  await mic.click();
  await street.locator('[data-street-action="defer"]').waitFor();assert.equal(requests,1);
  console.log('PASS reversible drag, stable waiter pose, and spoken intro option on narrow street dock.');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
