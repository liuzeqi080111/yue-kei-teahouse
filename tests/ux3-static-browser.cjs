const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
(async()=>{
 const root=path.resolve('dist'),api=[];
 const server=http.createServer(async(req,res)=>{
  if(req.url.startsWith('/api/'))api.push(req.url);
  try{
   const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/preview\//,'')||'index.html';
   const file=path.resolve(root,relative);if(!file.startsWith(root+path.sep))throw Error('outside root');
   res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.wav':'audio/wav'})[path.extname(file)]||'application/octet-stream');res.end(await fs.readFile(file));
  }catch{res.writeHead(404).end();}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  localStorage.setItem('yuekei-hud-intro-seen','1');localStorage.setItem('yuekei-learning-guide-v1',JSON.stringify({mode:'beginner',showMeaning:true}));window.tracks=[];
  navigator.mediaDevices.getUserMedia=async()=>{
   const ctx=new AudioContext(),osc=ctx.createOscillator(),gain=ctx.createGain(),dest=ctx.createMediaStreamDestination();gain.gain.value=.15;osc.connect(gain);gain.connect(dest);osc.start();await ctx.resume();
   const track=dest.stream.getAudioTracks()[0],stop=track.stop.bind(track);let ended=false;track.stop=()=>{if(ended)return;ended=true;stop();osc.stop();void ctx.close();};tracks.push(track);return dest.stream;
  };
 });
 try{
  await page.goto(`http://127.0.0.1:${server.address().port}/preview/`);assert.equal(await page.locator('html').getAttribute('data-preview'),'true');
  assert.match(await page.locator('#welcome>small').innerText(),/公开试玩版/);
  assert.ok(await page.evaluate(async()=>(await(await import('./scene.js')).ready).every(result=>result.status==='fulfilled')),'all built sprites load');
  await page.locator('[data-action="ENTER"]').click();await page.locator('[data-hud="help"]').click();await page.locator('.hud-fallback summary').click();
  await page.locator('#actions [data-action="START_SEATING"]').first().click();await page.waitForFunction(()=>document.body.dataset.camera==='room');
  await page.locator('#pause').click();assert.match(await page.locator('#settings').innerText(),/短复习可在本机录音回听/);
  await page.locator('#settings [data-open-review]').click();await page.locator('[data-challenge-record]').click();await page.waitForTimeout(800);await page.locator('[data-challenge-record]').click();
  await page.locator('[data-review-playback]').waitFor();await page.locator('[data-review-playback]').click();
  assert.equal(await page.locator('.review-score').count(),0);await page.locator('#review-dialog [data-dismiss]').click();
  assert.equal(await page.evaluate(()=>tracks.every(t=>t.readyState==='ended')),true);assert.deepEqual(api,[]);assert.deepEqual(errors,[]);
  console.log('PASS static build under subpath: all assets, fallback seating, honest offline copy, independent recording/playback, no API calls or fake scores.');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
