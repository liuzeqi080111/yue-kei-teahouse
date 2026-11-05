const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
(async()=>{
 const {createServer}=await import('../server.mjs');
 const server=createServer({provider:{status:()=>({configured:false})}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const url='http://127.0.0.1:'+server.address().port+'/';
 try {
  await fs.mkdir('output/feedback-qa',{recursive:true});
  for(const [width,height,dpr,name] of [[390,844,1,'portrait'],[1440,900,2,'desktop']]){
   const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:dpr});
   const failures=[];
   page.on('pageerror',error=>failures.push(error.message));
   await page.goto(url);
   await page.evaluate(async()=>await(await import('/scene.js')).ready);
   await page.locator('[data-dialog="chapters"]').click();
   await page.locator('[data-chapter="service"]').click();
   await page.locator('[data-learning-mode="beginner"]').click();
   const metrics=await page.locator('#scene').evaluate(canvas=>{
    const rect=canvas.getBoundingClientRect(),fit=getComputedStyle(canvas).objectFit;
    const contentScale=(fit==='contain'?Math.min:Math.max)(rect.width/1008,rect.height/567);
    return {fit,width:canvas.width,height:canvas.height,contentWidth:1008*contentScale,contentHeight:567*contentScale};
   });
   if(name==='portrait'){
    assert.deepEqual(metrics,{fit:'contain',width:1008,height:567,contentWidth:390,contentHeight:219.375});
   }else{
    assert.equal(metrics.fit,'cover');assert.equal(metrics.width,2016);assert.equal(metrics.height,1134);
   }
   const bun=page.getByRole('button',{name:/查看菠蘿油，剩/});
   const hits=await bun.evaluate(button=>{
    const box=button.getBoundingClientRect();
    return document.elementFromPoint(box.left+box.width/2,box.top+box.height/2)===button;
   });
   assert.equal(hits,true,'hotspot center receives pointer input');
   await page.screenshot({path:'output/feedback-qa/scene-'+name+'.png'});
   await bun.click();
   await page.locator('.dining-detail [data-dining-consume]').click();
   assert.match(await page.locator('.dining-detail .dining-remaining').innerText(),/2 \/ 3/);
   if(name==='portrait'){
    await page.locator('.dining-detail [data-dining-close]').click();
    await page.locator('#hotspots [data-camera="room"]').click();
    const cashier=page.locator('[data-explore="cashier"]');
    await cashier.focus();await page.keyboard.press('Enter');
    assert.match(await page.locator('#explore-note').innerText(),/收銀處.*埋單/);
    assert.equal(await page.locator('#panel').isVisible(),false);
    const capture=()=>page.locator('#scene').evaluate(el=>el.toDataURL());
    await page.locator('#pause').click();
    const dusk=await capture();
    await page.locator('#scene-weather').selectOption('afternoon');
    const afternoon=await capture();
    assert.notEqual(afternoon,dusk);
    await page.locator('#scene-weather').selectOption('rain');
    const rain=await capture();
    assert.notEqual(rain,afternoon);
    await page.waitForTimeout(220);
    assert.equal(await capture(),rain,'scene animation pauses while settings covers the scene');
    await page.locator('#settings [data-dismiss]').click();
    await page.waitForFunction(before=>document.querySelector('#scene').toDataURL()!==before,rain);
    assert.equal(await page.locator('[data-explore="window"]').isVisible(),true);
    await page.screenshot({path:'output/feedback-qa/scene-rain.png'});
    await page.reload();
    assert.equal(await page.locator('body').getAttribute('data-weather'),'rain');
   }
   assert.deepEqual(failures,[]);
   await page.close();
  }
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.route('**/assets/table.png',r=>r.abort());
  await page.goto(url);
  await page.locator('#asset-status').waitFor();
  await page.locator('[data-dialog="chapters"]').click();
  await page.locator('[data-chapter="service"]').click();
  await page.locator('[data-learning-mode="beginner"]').click();
  await page.getByRole('button',{name:/查看菠蘿油，剩/}).click();
  await page.locator('.dining-detail [data-dining-consume]').click();
  assert.match(await page.locator('.dining-detail .dining-remaining').innerText(),/2 \/ 3/);
  console.log('PASS actual contain 390×219.375/bitmap 1008×567, desktop DPR2 cap, touch targets, weather persistence, keyboard exploration, and missing background fallback');
 }finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
