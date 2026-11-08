const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs/promises');
(async()=>{
 const {createServer}=await import('../server.mjs');
 const server=createServer({provider:{status:()=>({configured:false})}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1366,height:768},hasTouch:true});
 const requests=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{localStorage.setItem('yuekei-hud-intro-seen','1');localStorage.setItem('yuekei-learning-guide-v1',JSON.stringify({mode:'beginner',showMeaning:true}));});
 // Deliberately deterministic interpretation fixture; UI, queue, bridge and game are real.
 await page.route('**/api/voice/interpret',async route=>{
  const body=route.request().postDataJSON();requests.push(body);const {text}=body;let intents=[];
  if(text.includes('两位'))intents=[{type:'START_SEATING',partySize:2}];
  else if(text==='加水')intents=[{type:'REQUEST_WATER'}];
  else if(text.includes('柠檬茶'))intents=[{type:'ADD_ITEM',itemId:'drink-lemon-tea',options:{temperature:'凍',sweetness:'少甜'}}];
  else if(text.includes('奶茶'))intents=[{type:'ADD_ITEM',itemId:'drink-milk-tea',options:{temperature:'熱',sweetness:'正常甜'}}];
  else if(text.includes('菠萝油'))intents=[{type:'ADD_ITEM',itemId:'food-pineapple-bun'}];
  else if(text==='确认订单')intents=[{type:'CONFIRM_ORDER'}];
  else if(text==='就这些，正式下单')intents=[{type:'FINISH_ORDER'}];
  await route.fulfill({json:{decision:'execute',intents,reply:'测试提案，不能代替业务执行结果。',meaning:'测试提案'}});
 });
 const type=async text=>{
  if(!await page.locator('.voice-text').isVisible()){await page.locator('[data-hud="more"]').click();await page.locator('[data-hud="type"]').click();}
  await page.locator('.voice-text').fill(text);await page.locator('.voice-send').click();
 };
 const fallback=async()=>{
  if(!await page.locator('#hud-help').isVisible())await page.locator('[data-hud="help"]').click();
  if(!await page.locator('.hud-fallback').evaluate(e=>e.open))await page.locator('.hud-fallback summary').click();
 };
 try{
  await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('[data-action="ENTER"]').click();
  await type('两位用粤语怎么说');await page.waitForFunction(()=>document.querySelector('.hud-subtitle').textContent.includes('意思是两位'));
  assert.match(await page.locator('#stage').textContent(),/迎接/);
  await type('两位');await page.waitForFunction(()=>document.body.dataset.camera==='room');
  await type('奶茶怎么说');await page.waitForFunction(()=>document.querySelector('.hud-subtitle').textContent.includes('naai5'));
  await type('加水');await page.waitForFunction(()=>document.querySelector('#scene-hint').textContent.includes('正在服务'));
  const beforeQueue=requests.length;
  await type('我要一杯奶茶');await type('不要奶茶了，改成柠檬茶，冻的少甜');
  assert.equal(requests.length,beforeQueue,'service messages must wait, not call the model separately');
  await page.waitForFunction(()=>document.querySelector('.hud-subtitle').textContent.includes('已记下'));
  assert.equal(requests.length,beforeQueue+1,'waiting corrections are merged into one request');
  assert.equal(requests.at(-1).text,'我要一杯奶茶\n不要奶茶了，改成柠檬茶，冻的少甜');
  await type('再来一个菠萝油');await page.waitForFunction(()=>document.querySelector('.hud-subtitle').textContent.includes('菠萝油'));
  const ctx=requests.at(-1).context;
  assert.equal(ctx.state.partySize,2);assert.equal(ctx.state.items.length,1);
  assert.equal(ctx.state.items[0].itemId,'drink-lemon-tea');assert.deepEqual(ctx.state.items[0].options,{temperature:'凍',sweetness:'少甜'});
  await type('确认订单');await page.waitForFunction(()=>/还要.*吗/.test(document.querySelector('.hud-subtitle').textContent));
  await type('就这些，正式下单');await page.waitForFunction(()=>document.querySelector('#scene-hint').textContent.includes('正在服务'));
  await page.waitForFunction(()=>!document.querySelector('#scene-hint').textContent.includes('正在服务'),{timeout:25000});
  assert.equal(requests.at(-1).context.state.items.length,2);
  await page.locator('.voice-text-close').click();
  await page.locator('[data-explore="window"]').click();await page.waitForTimeout(600);assert.equal(await page.locator('#explore-note').isVisible(),true);
  await page.locator('.hud-return').click();await page.locator('#hotspots [data-camera="table"]').click();
  const itemIds=await page.locator('.table-inventory [data-dining-select]').evaluateAll(items=>items.map(el=>el.dataset.diningSelect));assert.equal(itemIds.length,2);
  for(const [index,id] of itemIds.entries()){
   if(index===1)await page.setViewportSize({width:390,height:844});
   const activate=async locator=>{if(index===1)await locator.tap();else{await locator.focus();await page.keyboard.press('Enter');}};
   await activate(page.locator(`.table-inventory [data-dining-select="${id}"]`));
   for(const remaining of [2,1,0]){
    await activate(page.locator('[data-dining-consume]'));assert.match(await page.locator('.dining-remaining').innerText(),new RegExp(`${remaining} / 3`));
   }
   assert.equal(await page.locator('[data-dining-consume]').isDisabled(),true);await page.locator('[data-dining-close]').click();
  }
  await page.setViewportSize({width:1366,height:768});
  await page.locator('#hotspots [data-camera="room"]').click();await fallback();await page.locator('#actions [data-action="REQUEST_BILL"]').click();
  await page.locator('#panel [data-action="PAY_BILL"]').waitFor();assert.match(await page.locator('.total').innerText(),/40\.00/);
  await page.locator('#panel [data-action="PAY_BILL"]').click();await page.locator('#ending').waitFor();
  assert.match(await page.locator('#summary').innerText(),/柠茶已喝完/);assert.match(await page.locator('#summary').innerText(),/菠萝油已吃完/);
  assert.doesNotMatch(await page.locator('#round-review').innerText(),/发音.*\d+分|声调.*\d+分/);
  for(const [width,height] of [[1366,768],[1920,1080],[320,568],[390,844],[430,932],[844,390]]){
   await page.setViewportSize({width,height});
   for(const size of ['standard','large','xlarge']){
    await page.evaluate(size=>{document.body.dataset.fontSize=size;},size);
    const bounds=await page.locator('#ending').boundingBox();
    assert.ok(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=width&&bounds.y+bounds.height<=height,'receipt fits viewport');
    assert.ok(await page.locator('#ending').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'receipt has no horizontal overflow');
    assert.ok(await page.locator('#summary').evaluate(e=>parseFloat(getComputedStyle(e).fontSize)>=18),'receipt body remains readable');
    await page.locator('#ending [data-open-review]').scrollIntoViewIfNeeded();
   }
  }
  await page.setViewportSize({width:1366,height:768});await page.evaluate(()=>{document.body.dataset.fontSize='standard';});
  await fs.mkdir('output/ux3',{recursive:true});await page.screenshot({path:'output/ux3/journey-receipt.png'});
  await page.locator('#ending [data-open-review]').click();await page.locator('[data-challenge-next]').click();await page.locator('[data-challenge-next]').click();
  await page.locator('#review-dialog [data-dismiss]').click();await page.locator('#ending [data-action="RESTART"]').click();assert.equal(await page.locator('#welcome').isVisible(),true);
  assert.deepEqual(errors,[]);
  await fs.writeFile('output/ux3/journey.json',JSON.stringify({type:'deterministic-interpretation-fixture-real-UI-queue-and-business',requests:requests.map(r=>({text:r.text,phase:r.context.state.phase,items:r.context.state.items.length})),passed:true},null,2));
  console.log('PASS complete UI journey: teaching isolation, two-person seating, merged service correction, one correct drink, food, window, consumption, HK$40 payment, factual recap, two review skips, restart.');
 }catch(error){await fs.mkdir('output/ux3',{recursive:true});await page.screenshot({path:'output/ux3/journey-failure.png'});await fs.writeFile('output/ux3/journey-failure.json',JSON.stringify({requests,caption:await page.locator('.hud-subtitle').textContent(),status:await page.locator('.voice-status').textContent()},null,2));throw error;
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
