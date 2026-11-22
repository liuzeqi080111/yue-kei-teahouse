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
    // Exercise native media seeking and wall-clock playback without depending on the journal's network.
    const sampleRate=8000;
    const wav=Buffer.alloc(44+sampleRate*2*65);
    wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);
    wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);
    wav.writeUInt32LE(sampleRate,24);wav.writeUInt32LE(sampleRate*2,28);
    wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
    await page.route('https://chinoperl.org/audio/*.mp3',async route=>{
     const range=/bytes=(\d+)-(\d*)/.exec(route.request().headers().range||'');
     const start=range?Number(range[1]):0,end=range?.[2]?Number(range[2]):wav.length-1;
     const headers={'Accept-Ranges':'bytes','Content-Type':'audio/wav'};
     if(range)headers['Content-Range']='bytes '+start+'-'+end+'/'+wav.length;
     await route.fulfill({status:range?206:200,headers,body:wav.subarray(start,end+1)});
    });
   async function open(story){await page.goto(root+'/story-preview.html?story='+story);await page.locator('#choices button').first().waitFor({timeout:90000});}
   async function pick(n=0){const b=page.locator('#choices button').nth(n);await b.click();assert(await page.locator('#choices button').first().isVisible());}
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
    assert.equal(await page.locator('.song-mark').count(),3);
    assert.equal(await page.locator('#record,dialog').count(),0);
    const panel=page.locator('#song-panel'),audio=page.locator('#master-recording');
    const beat=page.getByRole('button',{name:'敲板',exact:true});
    await beat.waitFor();assert(await audio.evaluate(a=>!a.paused&&a.currentTime>30));
    async function atMark(index){
     await page.waitForFunction(index=>{
      const mark=document.querySelectorAll('.song-mark')[index];
      if(mark?.dataset.state!=='now')return false;
      document.querySelector('#choices button').click();return true;
     },index);
    }
    if(node==='riddle'){
     await beat.evaluate(b=>b.click());
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
    await page.waitForFunction(dest=>document.body.dataset.moment===dest,dest);
    assert.equal(await audio.getAttribute('src'),null);
   }
   await song('riddle','guess',true);await pick(mobile?1:0);await pick();
   assert.equal((await stored('reunion')).node,'dish');await page.waitForTimeout(950);await shot('dish');
   await pick();await pick();await song('gather','call');await pick(mobile?1:0);await pick();
   const proofs=(await stored('reunion')).photos;
   assert.equal(proofs.length,2);assert.notEqual(proofs[0],proofs[1]);
   assert(proofs.every(src=>src.startsWith('data:image/jpeg;base64,')&&src.length>10000));
   await open('reunion');await page.waitForFunction(()=>Array.from(document.querySelectorAll('#photo-view img')).filter(i=>i.naturalWidth===840).length===2);
   await shot('proof');await pick(mobile?1:0);
   const result=await stored('reunion');
   assert.equal(result.photo,proofs[mobile?1:0]);assert.equal(result.node,mobile?'laugh':'tidy');
   await open('reunion');assert.equal(await page.locator('#choices button').first().innerText(),'再玩一次');
   await page.waitForTimeout(600);await shot('wall');
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
   assert.equal((await stored('reunion')).photo,result.photo);await pick();assert.equal((await stored('table')).node,'door');
   await ctx.close();
   console.log('Both finales, saved photo, clap rounds, drink, invitation and restart passed',mobile?'390px':'1100px');
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
