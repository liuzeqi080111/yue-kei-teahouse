const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const {createServer}=await import('../server.mjs');
 const server=createServer({provider:{status:()=>({configured:false})}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   const AC=window.AudioContext;
   const firstGain = new WeakMap();
   window.AudioContext=class extends AC{
    createGain(){const g=super.createGain();if(!firstGain.has(this))firstGain.set(this,g);return g;}
    createBufferSource(){window.__room=this;window.__meter=this.createAnalyser();firstGain.get(this).connect(window.__meter);return super.createBufferSource();}
   };
  });
  const url=`http://127.0.0.1:${server.address().port}/`;await page.goto(url);
  assert.equal(await page.evaluate(()=>!!window.__room),false,'no audio before first user gesture');
  await page.locator('#welcome [data-dialog="settings"]').click();
  await page.waitForFunction(()=>window.__room?.state==='running');
  await page.waitForTimeout(1200);
  const energy=()=>page.evaluate(()=>{const data=new Float32Array(window.__meter.fftSize);window.__meter.getFloatTimeDomainData(data);return data.reduce((s,x)=>s+x*x,0)/data.length;});
  assert.ok(await energy()>1e-10,'room tone produces an actual audio signal');
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('voice-activity',{detail:{recording:true,active:true}})));
  await page.waitForTimeout(500);assert.ok(await energy()<1e-12,'recording/dialogue mutes ambience');
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('voice-activity',{detail:{active:false}})));
  await page.waitForTimeout(1200);assert.ok(await energy()>1e-10,'ambience fades back');
  await page.locator('#ambience').click();assert.equal(await page.locator('#ambience').getAttribute('aria-pressed'),'false');
  await page.waitForFunction(()=>window.__room?.state==='suspended');
  await page.reload();assert.equal(await page.locator('#ambience').getAttribute('aria-pressed'),'false');
  await page.locator('#welcome [data-dialog="settings"]').click();assert.equal(await page.evaluate(()=>!!window.__room),false);
  await page.locator('#ambience').click();await page.waitForFunction(()=>window.__room?.state==='running');
  await page.waitForFunction(()=>{const data=new Float32Array(window.__meter.fftSize);window.__meter.getFloatTimeDomainData(data);return data.some(sample=>Math.abs(sample)>1e-5);});
  assert.deepEqual(errors,[]);console.log('PASS ambience: gesture start, audible signal, voice duck/recovery, off, saved preference and re-enable');
 }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
