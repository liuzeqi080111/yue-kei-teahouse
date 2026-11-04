// Live smoke test: incurs three model requests plus opening NPC speech.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  if(process.env.TEST_STAGED==='1')await page.route('https://liuzeqi080111.github.io/yue-kei-teahouse/**',async route=>{
   const rel=new URL(route.request().url()).pathname.replace('/yue-kei-teahouse/','')||'index.html';
   const filename=path.resolve('dist',rel);if(!filename.startsWith(path.resolve('dist')+path.sep))throw Error('path');
   await route.fulfill({body:await fs.readFile(filename),contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.wav':'audio/wav'})[path.extname(filename)]||'application/octet-stream'});
  });
  await page.addInitScript(()=>{window.__played=0;document.addEventListener('playing',()=>window.__played++,true);const OriginalAudio=window.Audio;window.Audio=function(...args){const a=new OriginalAudio(...args);a.addEventListener('playing',()=>window.__played++);return a;};});
  await page.goto('https://liuzeqi080111.github.io/yue-kei-teahouse/',{waitUntil:'domcontentloaded',timeout:60000});
  await page.locator('.voice-status').filter({hasText:'準備好'}).waitFor({state:'attached',timeout:45000});
  assert.equal(await page.locator('html').getAttribute('data-preview'),null);
  const loaded=await page.evaluate(async()=>await(await import('./scene.js')).ready);assert.ok(loaded.every(x=>x.status==='fulfilled'));
  // Browser fetches exercise real cross-origin preflight and all three model routes.
  const result=await page.evaluate(async()=>{
   const {voiceUrl}=await import('./voice-endpoint.js');
   async function post(action,body){const r=await fetch(voiceUrl('/api/voice/'+action),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(!r.ok)throw Error(action+' HTTP '+r.status+' '+await r.text());return r.json();}
   const audio=await post('speak',{text:'你好，我想入嚟食嘢。'});
   const {text}=await post('transcribe',audio);
   const {createGame}=await import('./controller.js'),{createVoiceBridge}=await import('./voice-bridge.js');
   const game=createGame(),bridge=createVoiceBridge({game});
   const proposal=await post('interpret',{text,context:bridge.context()});
   return {text,decision:proposal.decision,intents:proposal.intents,audioBytes:audio.audioBase64.length};
  });
  assert.ok(result.text.length>2);assert.ok(result.audioBytes>1000);assert.equal(result.decision,'execute');assert.ok(result.intents.some(i=>i.type==='ENTER'));
  await page.locator('[data-action="ENTER"]').click();
  await page.waitForFunction(()=>window.__played>0,{},{timeout:45000});
  await page.locator('[data-action="START_SEATING"]:not(:disabled)').waitFor({timeout:45000});
  assert.equal(await page.locator('#voice-dock').isVisible(),true);assert.deepEqual(errors,[]);
  await fs.mkdir('output/pages-qa',{recursive:true});await page.screenshot({path:'output/pages-qa/published-voice.png'});
  console.log('PASS public cloud voice: real browser CORS, TTS → ASR → ENTER intent, NPC audio playing, assets and UI',JSON.stringify(result));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
