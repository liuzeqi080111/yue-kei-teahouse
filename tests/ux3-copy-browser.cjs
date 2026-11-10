const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');const fs=require('node:fs/promises');
(async()=>{
 const {createServer}=await import('../server.mjs');const server=createServer({provider:{status:()=>({configured:false})}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage({viewport:{width:1366,height:768}}),rows=[];
 await page.addInitScript(()=>{localStorage.setItem('yuekei-hud-intro-seen','1');localStorage.setItem('yuekei-learning-guide-v1',JSON.stringify({mode:'beginner',showMeaning:true}));});
 async function capture(name){
  const texts=await page.evaluate(()=>{
   const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT),texts=[];
   while(walker.nextNode()){
    const node=walker.currentNode,el=node.parentElement;
    if(!node.nodeValue.trim()||el.closest('[lang="yue"],.learning-example,.learning-frame,.review-challenge-answer,.jyutping-intro,.hud-original,.voice-transcript,#shop-sign,script,style'))continue;
    if(!el.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}))continue;
    texts.push(node.nodeValue.trim());
   }return texts;
  });
  rows.push({name,texts});
  const system=texts.join('\n').replace(/[「“][^」”]*[」”]/g,'');
  const untranslated=system.split('\n').filter(text=>/[唔嘅啲喺咗嚟揀睇冇這麼還請謝顧語錄聽話開關體學練習項虛擬詳遊戲]/.test(text));
  assert.deepEqual(untranslated,[],name+' has untranslated system copy');
 }
 try{
  await page.goto('http://127.0.0.1:'+server.address().port);await capture('welcome');
  await page.locator('[data-action="ENTER"]').click();await capture('greeting');
  await page.locator('[data-hud="help"]').click();await page.locator('.hud-fallback summary').click();
  await page.locator('#actions [data-action="START_SEATING"]').first().click();
  await page.waitForFunction(()=>document.body.dataset.camera==='room');await capture('seated');
  assert.match(await page.locator('.hud-subtitle').innerText(),/请坐/);
  await page.locator('[data-hud="more"]').click();await page.locator('[data-hud="original"]').click();
  assert.match(await page.locator('.hud-original').innerText(),/坐吖，睇吓/,'spoken Cantonese must remain unchanged');
  await page.locator('[data-hud="close-more"]').click();
  await page.locator('[data-hud="help"]').click();await page.locator('[data-help="meaning"]').click();await capture('meaning help');
  assert.match(await page.locator('.hud-example').innerText(),/坐吖，睇吓/);
  if(!await page.locator('.hud-fallback').evaluate(e=>e.open))await page.locator('.hud-fallback summary').click();
  await page.locator('#actions [data-action="OPEN_MENU"]').click();await capture('menu');
  await page.locator('[data-tab="order"]').click();await capture('empty order');
  await page.locator('[data-tab="drink"]').click();await page.locator('[data-item="drink-milk-tea"]').click();await capture('drink options');
  await page.locator('select[name="temperature"]').selectOption('凍');
  assert.equal(await page.locator('select[name="temperature"]').inputValue(),'凍','localization must not rewrite business values');
  await page.locator('#pause').click();await capture('settings');await page.locator('#restart').click();
  await page.locator('#welcome [data-dialog="chapters"]').click();await capture('chapters');await page.locator('[data-chapter="service"]').click();
  await page.locator('[data-hud-camera="room"]').click();await capture('service chapter');
  assert.match(await page.locator('.hud-subtitle').innerText(),/菠萝油和冰柠檬茶已经上桌/);
  await fs.mkdir('output/ux3',{recursive:true});await fs.writeFile('output/ux3/ui-copy.json',JSON.stringify(rows,null,2));
  console.log('PASS Mandarin system captions/help/menu/settings/chapters; Cantonese original and business option values preserved.');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
