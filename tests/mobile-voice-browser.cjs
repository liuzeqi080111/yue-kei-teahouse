const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const {createServer}=await import('../server.mjs');let statusCalls=0,interpretCalls=0;
 const server=createServer({provider:{status:()=>{statusCalls++;if(statusCalls===1)throw Error('offline');return {configured:true,asr:true,npc:true,tts:true};},interpret:async()=>{interpretCalls++;return {decision:'reply',intents:[],reply:'你好',meaning:'你好'};},speak:async()=>{throw Error('audio test');}}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 await page.addInitScript(()=>{AbortSignal.timeout=undefined;});
 await page.goto(`http://127.0.0.1:${server.address().port}/`);
 await page.locator('#welcome [data-dialog="chapters"]').click();await page.locator('[data-chapter="order"]').click();
 await page.getByRole('button',{name:'重新連接語音',exact:true}).waitFor();
 const input=page.locator('#voice-host textarea');await input.tap();await input.fill('一杯咖啡');
 assert.equal(await page.getByRole('button',{name:'發送文字',exact:true}).isEnabled(),true);
 assert.equal(await page.getByRole('button',{name:'開始說話',exact:true}).isEnabled(),true);
 const prevented=await input.evaluate(el=>{const e=new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true,cancelable:true});el.dispatchEvent(e);return e.defaultPrevented;});assert.equal(prevented,false);assert.equal(interpretCalls,0);
 assert.equal(await page.locator('#meaning').evaluate(el=>el.hidden),false);assert.equal(await page.locator('#translation').getAttribute('aria-pressed'),'true');
 await page.getByRole('button',{name:'發送文字',exact:true}).tap();await page.waitForFunction(()=>document.querySelector('.voice-reply').textContent==='你好');assert.equal(interpretCalls,1);assert.equal(await page.locator('#meaning').isVisible(),true);assert.equal(await input.inputValue(),'一杯咖啡');
 await page.locator('#voice-host').evaluate(el=>el.scrollTop=el.scrollHeight);const status=await page.locator('.voice-status').boundingBox(),host=await page.locator('#voice-host').boundingBox();assert.ok(status.y>=host.y-1&&status.y<host.y+host.height);
 await page.screenshot({path:'output/voice-qa/mobile-recovery.png'});
 console.log('PASS mobile: legacy AbortSignal, failed status does not lock text/record, IME Enter, touch send, sticky status, default translated subtitles');
 }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
