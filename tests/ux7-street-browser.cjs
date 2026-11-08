const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs/promises');

(async()=>{
 const {createServer}=await import('../server.mjs');
 const server=createServer({provider:{status:()=>({configured:false})}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const report={checks:[],errors:[]};
 await fs.mkdir('output/ux7/street',{recursive:true});
 try{
  const page=await browser.newPage({viewport:{width:1366,height:768}});
  page.on('pageerror',e=>report.errors.push(e.message));
  // Isolate renderer inspection from app observers; the real UI is tested below.
  await page.route('**/ux6-harness.html',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));
  await page.goto('http://127.0.0.1:'+server.address().port+'/ux6-harness.html');
  const pixels=await page.evaluate(async()=>{
   const {drawSceneMotion,STREET_PANES,streetMotionAt}=await import('./scene-motion.js');
   const clean=new Image(),tram=new Image();
   clean.src='assets/window-street-clean-ux5.png';tram.src='assets/window-tram-ux5.png';
   await Promise.all([clean.decode(),tram.decode()]);
   const canvas=document.createElement('canvas');canvas.width=1672;canvas.height=941;
   const ctx=canvas.getContext('2d',{willReadFrequently:true});
   const render=t=>{ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,1672,941);ctx.scale(1672/1008,941/567);drawSceneMotion(ctx,{camera:'window',elapsed:t,street:{clean,tram,crop:{x:106,y:55,width:1440,height:856}}});return ctx.getImageData(0,0,1672,941).data;};
   const inside=(x,y,poly)=>{let yes=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const [a,b]=poly[i],[c,d]=poly[j];if((b>y)!==(d>y)&&x<(c-a)*(y-b)/(d-b)+a)yes=!yes;}return yes;};
   const inGlass=(x,y)=>STREET_PANES.some(p=>inside(x,y,p));
   let outside=0,painted=0;
   const sample=render(4000);
   for(let y=0;y<941;y++)for(let x=0;x<1672;x++)if(sample[(y*1672+x)*4+3]){
    painted++;
    // Allow only the one-pixel antialiased silhouette of the measured glass.
    if(![-1,0,1].some(dx=>[-1,0,1].some(dy=>inGlass(x+dx+.5,y+dy+.5))))outside++;
   }
   const changes=(a,b)=>{let n=0;for(let i=0;i<a.length;i+=4)if(a[i]!==b[i]||a[i+1]!==b[i+1]||a[i+2]!==b[i+2]||a[i+3]!==b[i+3])n++;return n;};
   const resetDifference=changes(render(19999),render(20001));
   const movingDifference=changes(render(4000),render(8000));
   const loopDifference=changes(render(4000),render(28000));
   let largestStep=0;
   for(let t=0;t<19980;t+=16.67)largestStep=Math.max(largestStep,Math.abs(streetMotionAt(t+16.67).x-streetMotionAt(t).x));
   return {outside,painted,resetDifference,movingDifference,loopDifference,largestStep};
  });
  assert.equal(pixels.outside,0,'traffic must never paint the interior or window frames');
  assert.ok(pixels.painted>15000,'glass layer actually rendered');
  assert.equal(pixels.resetDifference,0,'loop reset must be invisible behind/outside the windows');
  assert.equal(pixels.loopDifference,0,'same loop phase must render identically');
  assert.ok(pixels.movingDifference>3000,'tram must actually pass through the glass');
  assert.ok(pixels.largestStep<.4,'travel has no visible-frame position jump');
  report.checks.push({name:'glass, motion and hidden loop boundary',...pixels});

  const pedestrians=await page.evaluate(async()=>{
   const {drawSceneMotion,streetWalkersAt,streetMotionAt}=await import('./scene-motion.js');
   const [clean,tram,walkers]=await Promise.all(['window-street-clean-ux5.png','window-tram-ux5.png','window-walkers-ux6.png'].map(async name=>{const image=new Image();image.src='assets/'+name;await image.decode();return image;}));
   const canvas=document.createElement('canvas');canvas.width=1672;canvas.height=941;
   const ctx=canvas.getContext('2d',{willReadFrequently:true}),crop={x:106,y:55,width:1440,height:856};
   const render=(people,time=0)=>{ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,1672,941);ctx.scale(1672/1008,941/567);drawSceneMotion(ctx,{camera:'window',elapsed:time,street:{clean,tram,crop,walkers:people===true?walkers:people||null}});return ctx.getImageData(0,0,1672,941).data;};
   const populated=render(true,4000),empty=render(false,4000);
   ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,1672,941);
   const car=streetMotionAt(4000);ctx.translate(car.x,car.y);ctx.rotate(-.045);
   ctx.drawImage(tram,crop.x,crop.y,crop.width,crop.height,0,-car.height,car.width,car.height);
   const carAlpha=ctx.getImageData(0,0,1672,941).data;
   let walkerPixels=0,overCar=0,farOverCar=0;
   const near=streetWalkersAt(4000).filter(p=>p.depth==='near');
   for(let i=0;i<empty.length;i+=4)if(Math.abs(empty[i]-populated[i])+Math.abs(empty[i+1]-populated[i+1])+Math.abs(empty[i+2]-populated[i+2])>12){
    walkerPixels++;if(carAlpha[i+3]>250){overCar++;const x=(i/4)%1672,y=Math.floor(i/4/1672);
     if(!near.some(p=>Math.abs(x-p.x)<p.height*.34+2&&y>p.y-p.height*1.04-2&&y<p.y+3))farOverCar++;
    }
   }
   // Isolate each clothing row in memory, then count its actual pixels through
   // the production compositing/occlusion path in the MAIN glass pane.
   const isolated=[];
   for(let row=0;row<2;row++){
    const sheet=document.createElement('canvas');sheet.width=walkers.naturalWidth;sheet.height=walkers.naturalHeight;
    sheet.getContext('2d').drawImage(walkers,0,row?444:0,1774,row?443:444,0,row?444:0,1774,row?443:444);
    const image=new Image();image.src=sheet.toDataURL();await image.decode();isolated.push(image);
   }
   const count=(a,b)=>{let n=0;for(let y=390;y<487;y++)for(let x=122;x<280;x++){const i=(y*1672+x)*4;if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>12)n++;}return n;};
   const visibility=[];
   for(let second=0;second<25;second++){const plain=render(false,second*1000);visibility.push(isolated.map(im=>count(render(im,second*1000),plain)));}
   const bothVisibleSeconds=visibility.filter(counts=>counts.every(n=>n>100)).length;
   const routes=streetWalkersAt(0).map((person,index)=>{
    const reset=person.period-person.offset;
    const before=streetWalkersAt(reset-.01)[index],after=streetWalkersAt(reset+.01)[index];
    return {direction:person.direction,hiddenReset:[before.x,after.x].every(x=>x<110||x>300),frames:new Set(Array.from({length:8},(_,n)=>streetWalkersAt(n*person.cycle/8)[index].frame)).size};
   });
   // Inspect the actual sheet, not just frame indices: every walk pose differs.
   const cell=document.createElement('canvas');cell.width=240;cell.height=390;
   const cc=cell.getContext('2d'),hips=[118,343,560,783,1009,1230,1450,1671],uniquePoses=[];
   for(let row=0;row<2;row++){
    const frames=[];for(let f=0;f<8;f++){cc.clearRect(0,0,240,390);const x=Math.max(0,hips[f]-120);cc.drawImage(walkers,x,row?470:24,Math.min(240,1774-x),390,0,0,240,390);frames.push(cell.toDataURL());}uniquePoses.push(new Set(frames).size);
   }
   return {walkerPixels,overCar,farOverCar,routes,uniquePoses,bothVisibleSeconds,visibility};
  });
  console.log(JSON.stringify(pedestrians));
  assert.ok(pedestrians.walkerPixels>150,'pedestrians must be visibly rendered in the street');
  assert.equal(pedestrians.farOverCar,0,'tram occludes distant walkers outside the nearer silhouettes');assert.ok(pedestrians.overCar>100,'near pavement walkers remain visible in front of tram');assert.ok(pedestrians.bothVisibleSeconds>=10,'both clothing styles visible together for at least ten seconds of the 25-second sample');
  assert.deepEqual(pedestrians.uniquePoses,[8,8],'both people need eight distinct walking poses');
  assert.ok(pedestrians.routes.every(r=>r.hiddenReset&&r.frames===8));
  assert.ok(pedestrians.routes.some(r=>r.direction===1)&&pedestrians.routes.some(r=>r.direction===-1));
  report.checks.push({name:'walking poses, opposite routes, tram occlusion and hidden route resets',...pedestrians});

  // Record a real-time complete loop through the production scene renderer.
  await page.evaluate(async()=>{
   const scene=await import('./scene.js');
   const decoded=await scene.ready;if(decoded.some(r=>r.status!=='fulfilled'))throw Error('A scene asset did not decode');
   document.body.innerHTML='<canvas id="loop"></canvas>';document.body.style.cssText='margin:0;background:#193f32';
   const canvas=document.querySelector('#loop');canvas.style.cssText='width:100vw;height:100vh';
   window.drawWindow=t=>scene.draw(canvas,{phase:'DINING',items:[],waiterPresent:false},{camera:'window',elapsed:t,weather:'afternoon'});
   drawWindow(0);
   window.parts=[];window.stream=canvas.captureStream(30);window.recorder=new MediaRecorder(stream,{mimeType:'video/webm'});
   recorder.ondataavailable=e=>{if(e.data.size)parts.push(e.data);};
   window.recordingDone=new Promise(resolve=>recorder.onstop=resolve);
   window.frameTimes=[];const start=performance.now();let previous=start;
   recorder.start();
   const animate=now=>{frameTimes.push(now-previous);previous=now;drawWindow(now-start);if(now-start<24500)requestAnimationFrame(animate);else recorder.stop();};
   requestAnimationFrame(animate);
  });
  const recording=await page.evaluate(async()=>{await recordingDone;stream.getTracks().forEach(t=>t.stop());const sorted=frameTimes.slice(1).sort((a,b)=>a-b);return {bytes:Array.from(new Uint8Array(await new Blob(parts).arrayBuffer())),frames:frameTimes.length,p95:sorted[Math.floor(sorted.length*.95)]};});
  await fs.writeFile('output/ux7/street/street-full-loop.webm',Buffer.from(recording.bytes));
  report.checks.push({name:'24.5 second real-time full loop',frames:recording.frames,p95FrameIntervalMs:recording.p95});
  assert.ok(recording.frames>600,'window animation must repaint smoothly during a full loop');
  for(const time of [0,4000,8000,12000,16000,19999,20001,23999]){
   await page.evaluate(t=>drawWindow(t),time);
   await page.screenshot({path:`output/ux7/street/window-${time}.png`});
  }
  await page.evaluate(async()=>{
   window.playback=document.createElement('video');playback.muted=true;
   playback.style.cssText='position:fixed;inset:0;width:100vw;height:100vh;background:#183e34';
   document.body.append(playback);
   const loaded=new Promise(resolve=>playback.onloadeddata=resolve);
   playback.src=URL.createObjectURL(new Blob(parts,{type:'video/webm'}));await loaded;
  });
  for(const second of [0.2,4,8,12,16,20,24]){
   await page.evaluate(t=>new Promise(resolve=>{playback.onseeked=resolve;playback.currentTime=t;}),second);
   await page.screenshot({path:`output/ux7/street/playback-${second}.png`});
  }
  report.checks.push({name:'recorded WebM decodes and seeks across the complete loop',seconds:[0.2,4,8,12,16,20,24]});
  await page.close();

  for(const viewport of [{width:1366,height:768},{width:390,height:844},{width:844,height:390}]){
   for(const reducedMotion of ['reduce','no-preference']){
    const game=await browser.newPage({viewport,reducedMotion,hasTouch:viewport.width===390});
    game.on('pageerror',e=>report.errors.push(e.message));
    await game.addInitScript(()=>{localStorage.setItem('yuekei-hud-intro-seen','1');localStorage.setItem('yuekei-learning-guide-v1',JSON.stringify({mode:'beginner',showMeaning:true}));});
    await game.goto('http://127.0.0.1:'+server.address().port);
    await game.locator('#welcome [data-dialog="chapters"]').click();
    await game.locator('[data-chapter="service"]').click();
    await game.locator('[data-hud-camera="room"]').click();
    const spot=game.locator('[data-explore="window"]');
    if(viewport.width===390)await spot.tap();else {await spot.focus();await game.keyboard.press('Enter');}
    assert.equal(await game.getAttribute('body','data-camera'),'window');
    const before=await game.locator('#scene').screenshot();
    await game.waitForTimeout(1800);
    assert.notDeepEqual(await game.locator('#scene').screenshot(),before,'actual UI explicitly viewing the window must animate');
    await game.screenshot({path:`output/ux7/street/ui-${viewport.width}-${reducedMotion}.png`});
    const ret=game.locator('.hud-return'),box=await ret.boundingBox();
    assert.ok(box&&box.x>=0&&box.y>=0&&box.x+box.width<=viewport.width&&box.y+box.height<=viewport.height,'return stays reachable');
    await ret.click();assert.equal(await game.getAttribute('body','data-camera'),'room');
    report.checks.push({name:'real UI enter, animate, return',viewport,reducedMotion});
    await game.close();
   }
  }
  assert.deepEqual(report.errors,[]);
  await fs.writeFile('output/ux7/street/verification.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
