const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const {createServer}=await import('../server.mjs');
 const server=createServer({provider:{status:()=>({configured:false})}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage();
 try{
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.evaluate(async()=>{
   const NativeContext=window.AudioContext;
   window.testContexts=[];window.testTracks=[];window.testProgress=[];window.testStates=[];window.testErrors=[];
   window.failAnalyser=false;
   window.AudioContext=class extends NativeContext{
    constructor(...args){super(...args);window.testContexts.push(this);}
    createAnalyser(){if(window.failAnalyser)throw Error('analyser unavailable');return super.createAnalyser();}
   };
   navigator.mediaDevices.getUserMedia=async()=>{
    const ctx=new AudioContext(),osc=ctx.createOscillator(),gain=ctx.createGain(),dest=ctx.createMediaStreamDestination();
    gain.gain.value=.15;osc.connect(gain);gain.connect(dest);osc.start();await ctx.resume();window.testGain=gain;
    const track=dest.stream.getAudioTracks()[0],stop=track.stop.bind(track);let ended=false;
    track.stop=()=>{if(ended)return;ended=true;stop();osc.stop();void ctx.close();};window.testTracks.push(track);return dest.stream;
   };
   const {createPracticeRecorder}=await import('/practice-recorder.js');
   window.testRecorder=createPracticeRecorder(value=>{window.testRecording=value;});
   window.startTest=()=>window.testRecorder.start('one-person',{
    score:false,onState:s=>testStates.push(s),onError:e=>testErrors.push(e),onResult:()=>{},onRecorded:()=>{window.testRecorded=true;},
    onProgress:p=>testProgress.push(p),
   });
   await startTest();
  });
  await page.waitForFunction(()=>testProgress.some(p=>p.seconds>=.5&&p.level>0));
  const live=await page.evaluate(()=>({seconds:testProgress.at(-1).seconds,level:testProgress.at(-1).level}));
  assert.ok(live.seconds>=.5&&live.seconds<3);assert.ok(live.level>0&&live.level<=1);
  await page.evaluate(()=>{testGain.gain.value=0;});await page.waitForTimeout(250);
  assert.ok(await page.evaluate(()=>testProgress.at(-1).level<.01),'meter follows actual silence');
  await page.evaluate(()=>{testGain.gain.value=.15;});await page.waitForTimeout(200);
  await page.evaluate(()=>testRecorder.stop());
  await page.waitForFunction(()=>testStates.includes('recorded'));
  assert.equal(await page.evaluate(()=>testRecorded),true);
  const stoppedCount=await page.evaluate(()=>testProgress.length);await page.waitForTimeout(250);
  assert.equal(await page.evaluate(()=>testProgress.length),stoppedCount,'no meter ticks after stop');
  assert.equal(await page.evaluate(()=>testTracks.every(t=>t.readyState==='ended')&&testContexts.every(c=>c.state==='closed')),true);
  // Cancel and restart: old meter callbacks and resources must not survive.
  await page.evaluate(()=>{testProgress=[];testStates=[];return startTest();});await page.waitForTimeout(250);
  await page.evaluate(()=>testRecorder.cancel());const cancelCount=await page.evaluate(()=>testProgress.length);await page.waitForTimeout(250);
  assert.equal(await page.evaluate(()=>testProgress.length),cancelCount);
  assert.equal(await page.evaluate(()=>testTracks.every(t=>t.readyState==='ended')&&testContexts.every(c=>c.state==='closed')),true);
  // Meter construction failure must preserve local recording and elapsed time.
  await page.evaluate(()=>{failAnalyser=true;testProgress=[];testStates=[];return startTest();});
  await page.waitForFunction(()=>testProgress.some(p=>p.seconds>=.5));
  assert.equal(await page.evaluate(()=>testProgress.at(-1).level),0);
  await page.evaluate(()=>testRecorder.stop());await page.waitForFunction(()=>testStates.includes('recorded'));
  assert.deepEqual(await page.evaluate(()=>testErrors),[]);
  assert.equal(await page.evaluate(()=>testTracks.every(t=>t.readyState==='ended')&&testContexts.every(c=>c.state==='closed')),true);
  console.log('PASS real WebAudio/MediaRecorder synthetic-source meter: elapsed time, signal/silence, stop/cancel cleanup, analyser failure fallback. Not human microphone validation.');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
