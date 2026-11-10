const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs/promises');
(async()=>{
 const {createServer}=await import('../server.mjs'),spoken=[];
 const wav=Buffer.alloc(44+16000);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(16000,24);wav.writeUInt32LE(32000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(16000,40);
 const server=createServer({provider:{status:()=>({configured:true,tts:true}),speak:({text})=>{spoken.push(text);return {audioBase64:wav.toString('base64'),mimeType:'audio/wav'};}}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'msedge',headless:true});await fs.mkdir('output/ux4',{recursive:true});
 try{
  for(const [width,height] of [[1366,768],[320,568],[844,390]]){
   const page=await browser.newPage({viewport:{width,height}});page.setDefaultTimeout(10000);
   await page.addInitScript(()=>{localStorage.setItem('yuekei-hud-intro-seen','1');localStorage.setItem('yuekei-learning-guide-v1',JSON.stringify({mode:'beginner',showMeaning:true}));});
   await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('#welcome [data-dialog="chapters"]').click();await page.locator('[data-chapter="service"]').click();
   const ids=await page.locator('.dining-food-spot').evaluateAll(es=>es.map(e=>e.dataset.diningSelect));assert.equal(ids.length,2);
   for(const id of ids){
    await page.locator(`.dining-food-spot[data-dining-select="${id}"]`).click();
    assert.equal(await page.locator('.dining-food-spot.selected').evaluate(e=>getComputedStyle(e).borderTopWidth),'0px');
    for(const bite of [0,1,2,3]){
     const text=await page.locator('.dining-cantonese').innerText();assert.ok(text.length>3);assert.match(await page.locator('.dining-jyutping').innerText(),/[a-z]+[1-6]/);
     assert.equal(await page.locator('.dining-phrase').isVisible(),true,'phrase must not depend on a legacy full-hint setting');
     await page.locator('[data-dining-preview]:not([data-dining-name])').click();await page.waitForTimeout(250);assert.equal(spoken.at(-1),text,'displayed Cantonese must equal TTS input');
     if(bite<3)await page.locator('[data-dining-consume]').click();
    }
    await page.locator('.dining-cantonese').scrollIntoViewIfNeeded();await page.screenshot({path:`output/ux4/phrase-${width}-${id}.png`});
    const box=await page.locator('.dining-detail').boundingBox();assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=width+1&&box.y+box.height<=height+1);
    assert.ok(await page.locator('.dining-detail').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
    await page.locator('[data-dining-close]').click();
   }
   await page.close();
  }
  console.log('PASS visible matching Cantonese/Jyutping/meaning and TTS text for food/drink, all four portions, desktop/narrow/landscape; soft selection.');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
