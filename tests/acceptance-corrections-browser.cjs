const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const {createServer}=await import('../server.mjs');
 const pending=[],requests=[];
 const server=createServer({provider:{status:()=>({configured:false}),interpret:body=>new Promise(resolve=>{requests.push(body);pending.push(resolve)}),transcribe:()=>({text:'不要奶茶，改成冻柠檬茶少甜'})}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage();
 const proposal=itemId=>({decision:'execute',intents:[{type:'ADD_ITEM',itemId,options:{temperature:'凍',sweetness:'少甜'}}]});
 const waitRequests=async n=>{for(let i=0;i<100&&requests.length<n;i++)await new Promise(r=>setTimeout(r,50));assert.equal(requests.length,n)};
 try{
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.evaluate(async()=>{
   const {createGame}=await import('./controller.js'),{mountVoice}=await import('./voice.js');
   window.probeGame=createGame();probeGame.chapter('order');
   const host=document.createElement('div');host.id='correction-probe';document.body.prepend(host);
   window.probeVoice=mountVoice({game:probeGame,host});probeVoice.setTextMode(true);
   navigator.mediaDevices.getUserMedia=async()=>{const ctx=new AudioContext(),osc=ctx.createOscillator(),dest=ctx.createMediaStreamDestination();osc.connect(dest);osc.start();await ctx.resume();const track=dest.stream.getAudioTracks()[0],stop=track.stop.bind(track);track.stop=()=>{stop();osc.stop();void ctx.close()};return dest.stream};
  });
  const input=page.locator('#correction-probe .voice-text'),send=page.locator('#correction-probe .voice-send'),mic=page.locator('#correction-probe .voice-mic');
  const type=async text=>{await input.fill(text);await send.click()};
  await type('我要冻奶茶少甜');await waitRequests(1);assert.equal(await send.isDisabled(),false);assert.equal(await mic.isDisabled(),false);
  await type('不要奶茶，改成冻柠檬茶少甜');await waitRequests(2);
  assert.equal(requests[1].text,'我要冻奶茶少甜\n不要奶茶，改成冻柠檬茶少甜');
  pending[1](proposal('drink-lemon-tea'));pending[0](proposal('drink-milk-tea'));
  await page.waitForFunction(()=>probeGame.snapshot().state.items.length===1);
  await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>probeGame.snapshot().state.items[0].itemId),'drink-lemon-tea');
  // Microphone can interrupt an interpretation; recognized correction includes the pending intent.
  await type('再要冻奶茶少甜');await waitRequests(3);await mic.click();await page.waitForTimeout(650);await mic.click();await waitRequests(4);
  assert.equal(requests[3].text,'再要冻奶茶少甜\n不要奶茶，改成冻柠檬茶少甜');
  pending[3]({decision:'reply',intents:[],reply:'好，维持原来的柠檬茶。'});pending[2](proposal('drink-milk-tea'));
  await page.waitForFunction(()=>!document.querySelector('#correction-probe .voice-cancel')?.hidden===false);
  assert.equal(await page.evaluate(()=>probeGame.snapshot().state.items.length),1);
  // Restart invalidates the outstanding request even if the provider completes later.
  await type('再来杯奶茶');await waitRequests(5);
  await page.evaluate(()=>{probeGame.action('RESTART');probeVoice.sync(probeGame.snapshot())});pending[4](proposal('drink-milk-tea'));
  await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>probeGame.snapshot().state.items.length),0);
  assert.equal(await page.evaluate(()=>probeGame.snapshot().state.phase),'门外');
  console.log('PASS text and synthetic microphone corrections while interpreting, stale response rejected, restart clears pending intent');
 }finally{pending.forEach(resolve=>resolve({decision:'reply',intents:[],reply:'结束'}));await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);process.exitCode=1});
