const assert=require('node:assert/strict');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=process.env.STORY_URL||'http://127.0.0.1:4216';
(async()=>{
 const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader','--autoplay-policy=no-user-gesture-required','--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture='+path.resolve('assets/story-table-tea.wav')]});
 const errors=[];
 try{
  for(const mobile of [false,true]){
   const ctx=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1100,height:720}});
   const page=await ctx.newPage();page.on('pageerror',err=>errors.push(err.message));
   page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
   async function open(story){await page.goto(root+'/story-preview.html?story='+story);await page.locator('#choices button').first().waitFor({timeout:90000});}
   async function pick(n=0){const b=page.locator('#choices button').nth(n);await b.click();assert(await page.locator('#choices button').first().isVisible());}
   const stored=story=>page.evaluate(id=>JSON.parse(localStorage.getItem('yuekei-story-trial-v1:'+id)),story);
   await open('photo');assert.equal(await page.locator('#speaker').innerText(),'阿乐');await pick();
   await page.locator('#paper').waitFor();assert.match(await page.locator('#meaning').innerText(),/二十多年的老邻居/);
   await pick();await page.locator('#paper[aria-label^="芳姐手书"]').waitFor();
   assert.equal(await page.locator('#speaker').innerText(),'芳姐');
   await pick(mobile?1:0);await pick();await pick();assert.equal(await page.locator('#speaker').innerText(),'玲姐');
   assert.equal((await stored('photo')).node,'finder');await pick();const first=(await stored('photo')).photo;
   assert.ok(first.startsWith('data:image/jpeg;base64,')&&first.length>10000);
   await pick(1);await page.locator('input').fill('.85');await page.locator('#stage').focus();await page.keyboard.press('ArrowLeft');await page.keyboard.press('Space');
   assert.notEqual((await stored('photo')).photo,first);await pick();await pick();
   const result=await stored('photo');assert.equal(result.node,'tomorrow');assert.equal(result.layout,mobile?'bench':'wait');
   await open('photo');assert.equal(await page.locator('#choices button').first().innerText(),'再玩一次');
   await page.screenshot({path:'output/ba-review/accepted-photo-'+(mobile?'phone':'desktop')+'.jpg'});
   await open('table');assert.equal(await page.locator('#speaker').innerText(),'同行朋友');
   await pick();await pick();await pick(mobile?1:0);await page.waitForTimeout(3600);await pick();
   assert.equal(await page.locator('#speaker').innerText(),'林伯');await pick(mobile?1:0);
   assert.equal(await page.locator('#speaker').innerText(),'芳姐');await pick();
   assert.equal(await page.locator('#speaker').innerText(),'周叔');assert.match(await page.locator('#meaning').innerText(),/明早.*一起喝杯茶/);await pick();
   assert.match(await page.locator('#place').innerText(),/门外.*晚饭后/);assert.equal(await page.locator('#speaker').innerText(),'同行朋友');await pick();
   const meal=await stored('table');assert.equal(meal.node,'morning');assert.equal(meal.invited,!mobile);assert.equal(meal.drink,mobile?'lemon':'tea');assert((await page.locator('#line').innerText()).includes(mobile?'凍檸茶':'熱奶茶'));
   await open('table');assert((await page.locator('#line').innerText()).includes(mobile?'凍檸茶':'熱奶茶'));
   await page.screenshot({path:'output/ba-review/accepted-table-'+(mobile?'phone':'desktop')+'.jpg'});
   for(const el of await page.locator('#choices button').all()){const box=await el.boundingBox();assert(box.x>=0&&box.x+box.width<=page.viewportSize().width+1);assert(box.y+box.height<=page.viewportSize().height+1);}
   assert.equal((await stored('photo')).photo,result.photo);await pick();assert.equal((await stored('table')).node,'door');
   await ctx.close();
   console.log('Both finales, saved photo, retake, drink, invitation and restart passed',mobile?'390px':'1100px');
  }
  const voice=await browser.newContext({permissions:['microphone']});
  const mic=await voice.newPage();let heard=false;
  await mic.route('**/api/voice/transcribe',async route=>{
   assert(route.request().postDataJSON().audioBase64.length>200);heard=true;
   await route.fulfill({json:{text:'唔該，兩位，可以搭枱嗎？'}});
  });
  await mic.goto(root+'/story-preview.html?story=table');await mic.getByRole('button',{name:'讲粤语'}).click();
  await mic.getByRole('button',{name:'讲完了'}).waitFor();await mic.waitForTimeout(1900);await mic.getByRole('button',{name:'讲完了'}).click();
  await mic.getByRole('button',{name:/周先生/}).waitFor();assert(heard);await voice.close();console.log('Recorded fixture advanced the matching dialogue option');
  const page=await browser.newPage();await page.goto(root+'/cast-review.html');
  const options=await page.locator('option').evaluateAll(nodes=>nodes.map(n=>n.value));
  assert.equal(options.length,13);
  for(const id of options){await page.locator('select').selectOption(id);await page.waitForFunction(()=>document.querySelector('video').readyState>=2);assert(await page.locator('video').evaluate(v=>v.duration>1&&v.videoWidth>=800));}
  assert.deepEqual(errors,[]);console.log('Playback passed for',options.length,'films');
 }finally{await browser.close();}
})().catch(err=>{console.error(err);process.exitCode=1;});
