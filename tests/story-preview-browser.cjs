const assert=require('node:assert/strict');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=process.env.STORY_URL||'http://127.0.0.1:4216';
(async()=>{
 const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader','--autoplay-policy=no-user-gesture-required','--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture='+path.resolve('assets/story-table-tea.wav')]});
 const errors=[];
 require('node:fs').mkdirSync('output/ba-review',{recursive:true});
 try{
  for(const mobile of [false,true]){
   const ctx=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1100,height:720}});
   const page=await ctx.newPage();page.on('pageerror',err=>errors.push(err.message));
   page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
   const origin=new URL(root).origin;
   await ctx.route(/^https?:/,route=>{
    const request=route.request();
    if(new URL(request.url()).origin===origin)return route.continue();
    if(request.resourceType()==='media'||/\.(wav|mp3)(\?|$)/i.test(request.url()))errors.push('External audio: '+request.url());
    return route.abort('internetdisconnected');
   });
   async function open(story){await page.goto(root+'/story-preview.html?story='+story);await page.locator('#choices button').first().waitFor({timeout:90000});}
   async function pick(n=0){
    const before=await page.locator('body').getAttribute('data-moment');
    await page.locator('#choices button').nth(n).click();
    if(before==='ready'){
     assert.equal(await page.locator('body').getAttribute('data-moment'),'enterPortrait');
     await page.getByRole('button',{name:/挂第一张/}).waitFor();
    }
    assert(await page.locator('#choices button').first().isVisible());
   }
   const stored=story=>page.evaluate(id=>JSON.parse(localStorage.getItem('yuekei-story-trial-v1:'+id)),story);
   await page.goto(root+'/?street=3d');
   await page.locator('.vinyl-new').click();
   await page.locator('[data-learning-mode="experienced"]').click();
   await page.locator('[data-tray="tasks"]').click({timeout:90000});
   await page.getByRole('link',{name:'新年主线 · 预埋你嗰份'}).click();
   await page.getByRole('button',{name:'唔該，咁我坐喇！'}).waitFor();
   await page.evaluate(()=>localStorage.setItem('yuekei-story-trial-v1:photo',JSON.stringify({node:'tomorrow',photo:'old'})));
   await open('photo'); // Existing bookmarks open the replacement chapter.
   assert.equal(await page.locator('h1').innerText(),'预埋你嗰份');
   await pick();
   const shot=name=>page.screenshot({path:'output/ba-review/reunion-'+name+(mobile?'-phone':'-desktop')+'.jpg'});
   async function song(node,dest,reload=false){
    assert.equal(await page.locator('#speaker').innerText(),'南音师傅');
    assert.equal(await page.locator('.song-mark').count(),8);
    assert.equal(await page.locator('#record,dialog').count(),0);
    const panel=page.locator('#song-panel'),audio=page.locator('#master-recording');
    const beat=page.getByRole('button',{name:'敲板',exact:true});
    await beat.waitFor();
    const expected=new URL('/assets/nanyin-wusong-'+node+'.wav',origin).href;
    assert(await audio.evaluate(a=>a.currentSrc.startsWith('blob:'+location.origin+'/')));
    assert(await page.evaluate(url=>performance.getEntriesByName(url).some(entry=>entry.decodedBodySize>0),expected));
    assert.equal(await audio.evaluate(a=>a.duration),30);
    await page.waitForFunction(()=>{const a=document.querySelector('#master-recording');return !a.paused&&a.currentTime>0&&a.volume>.1;});
    async function atMark(index){
     await page.waitForFunction(index=>{
      const mark=document.querySelectorAll('.song-mark')[index];
      if(mark?.dataset.state!=='now')return false;
      document.querySelector('#choices button').click();return true;
     },index);
    }
    if(!reload){
     const knocks=await beat.evaluate(async button=>{
      const start=AudioBufferSourceNode.prototype.start,times=[];
      let handlingClick=true;
      AudioBufferSourceNode.prototype.start=function(...args){
       times.push(handlingClick?'press':'animation');
       return start.apply(this,args);
      };
      try{
       button.click();handlingClick=false;
       // Wait for the closing stroke even when software rendering is slow.
       const deadline=performance.now()+2500;
       while(!times.length&&performance.now()<deadline)await new Promise(requestAnimationFrame);
       await new Promise(requestAnimationFrame);
       return times;
      }finally{AudioBufferSourceNode.prototype.start=start;}
     });
     assert.deepEqual(knocks,['animation'],'One wooden knock after the boards close');
     assert.equal(await panel.locator('[data-state="hit"]').count(),0);
    }
    await atMark(0);
    await beat.evaluate(b=>b.click());assert.equal(await panel.locator('[data-state="hit"]').count(),1);
    if(reload){
     await open('reunion');await beat.waitFor();
     assert.equal(await panel.locator('[data-state="hit"]').count(),1);
    }
    await atMark(1);
    assert.equal(await panel.locator('[data-state="hit"]').count(),2);
    assert.equal(await page.locator('body').getAttribute('data-moment'),node);
    await shot(node);
    await atMark(7);
    assert((await stored('reunion')).songHits&128);
    await page.waitForFunction(dest=>document.body.dataset.moment===dest,dest,{timeout:45000});
    assert.equal(await audio.getAttribute('src'),null);
   }
   assert.equal((await stored('reunion')).node,'guess');await pick(mobile?1:0);await pick();
   assert.equal((await stored('reunion')).node,'dish');await page.waitForTimeout(950);await shot('dish');
   await pick();assert.equal((await stored('reunion')).node,'supper');await shot('supper');
   await pick(mobile?1:0);assert.equal((await stored('reunion')).node,mobile?'fish':'chicken');
   await page.waitForTimeout(1150);await shot('pick-up');
   await pick();assert.equal((await stored('reunion')).node,'passFish');await page.waitForTimeout(2700);await shot('pass-fish');await pick();
   assert.equal((await stored('reunion')).node,'toast');await page.waitForTimeout(1900);await shot('toast');await pick();
   assert.equal((await stored('reunion')).node,'wait');await shot('request');await pick();
   assert.equal(await page.getByText(/1975 年富隆茶楼录音/).count(),0);
   await song('gather','call',mobile);await pick(mobile?1:0);await pick();
   const proofs=(await stored('reunion')).photos;
   assert.equal(proofs.length,2);assert.notEqual(proofs[0],proofs[1]);
   assert(proofs.every(src=>src.startsWith('data:image/jpeg;base64,')&&src.length>10000));
   await open('reunion');await page.waitForFunction(()=>Array.from(document.querySelectorAll('#photo-view img')).filter(i=>i.naturalWidth===840).length===2);
   await shot('proof');await pick(mobile?1:0);
   const result=await stored('reunion');
   assert.equal(result.photo,proofs[mobile?1:0]);assert.equal(result.node,mobile?'laugh':'tidy');
   await open('reunion');assert.equal(await page.locator('#choices button').first().innerText(),'再玩一次');
   await page.waitForTimeout(600);await shot('wall');
   const oldPhoto='data:image/jpeg;base64,/9j/2Q==';
   await page.evaluate(({oldPhoto,result})=>localStorage.setItem('yuekei-story-trial-v1:reunion',
    JSON.stringify({...result,portraitVersion:3,photo:oldPhoto})),{oldPhoto,result});
   await open('reunion');
   const migrated=await stored('reunion');
   assert.equal(migrated.portraitVersion,4);
   assert.equal(migrated.node,result.node);assert.equal(migrated.photos,null);
   assert(migrated.photo.startsWith('data:image/jpeg;base64,')&&migrated.photo.length>10000);
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
   assert.equal((await stored('reunion')).photo,migrated.photo);await pick();assert.equal((await stored('table')).node,'door');
   const legacy=mobile?'gather':'riddle';
   await page.evaluate(node=>localStorage.setItem('yuekei-story-trial-v1:reunion',JSON.stringify({node,songHits:7})),legacy);
   await open('reunion');
   assert.equal(await page.locator('body').getAttribute('data-moment'),mobile?'wait':'guess');
   await ctx.close();
   console.log('Both dishes, saved photo, 30-second accompaniment, drink, invitation and restart passed',mobile?'390px':'1100px');
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
