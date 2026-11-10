const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');

(async () => {
 const { createServer } = await import('../server.mjs');
 let sent = 0;
 const server = createServer({ provider: {
  status: () => ({ configured: true, asr: true, npc: true, tts: true }),
  speak: async () => { throw Error('silent stub'); },
  transcribe: async () => ({ text: '一位呀，唔該。' }),
  interpret: async () => { sent++; return { decision: 'execute', intents: [{ type:'START_SEATING' }] }; }
 } });
 await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
 const browser = await chromium.launch({
  channel: process.env.BROWSER_CHANNEL || 'msedge',
  headless: true,
  args: ['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']
 });
 try {
  const page = await browser.newPage({permissions:['microphone']});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:' + server.address().port + '/');
  const go = () => page.locator('#welcome [data-action="ENTER"]').click();
  const guide = page.locator('#learning-guide');
  const progress = guide.locator('[data-practice-progress]');
  const record = async () => {
   const before = sent;
   await page.getByRole('button',{name:'開始說話',exact:true}).click();
   await page.getByRole('button',{name:'停止錄音',exact:true}).waitFor();
   await page.waitForTimeout(2100);
   await page.getByRole('button',{name:'停止錄音',exact:true}).click();
   await page.locator('.voice-status').filter({hasText:'核對文字'}).waitFor();
   assert.equal(sent,before,'recording alone must not execute an action');
  };
  const submit = () => page.getByRole('button',{name:'發送文字',exact:true}).click();
  const targetReady = () => guide.locator('[data-learning-goal]').filter({hasText:'你是一个人'}).waitFor();
  const restart = async () => {await page.locator('#pause').click();await page.locator('#restart').click();await go();await targetReady();};
  const waitProgress = async pattern => {
   try { await page.waitForFunction(re => new RegExp(re).test(document.querySelector('#learning-guide [data-practice-progress]').textContent),pattern,{timeout:6000}); }
   catch { assert.match(await progress.textContent(),new RegExp(pattern),await page.locator('.voice-status').textContent()); }
  };
  await go();
  await page.locator('#learning-mode [data-learning-mode="experienced"]').click();
  await targetReady();
  assert.equal(await guide.locator('.learning-example').isVisible(),false);
  assert.equal(await page.locator('#actions [data-action="START_SEATING"]').isVisible(),false);
  await record();await submit();await waitProgress('语音 1 次（独立 1）');
  await restart();
  await guide.locator('[data-guide-hint="frame"]').click();
  assert.equal(await guide.locator('[data-learning-frame]').isVisible(),true);
  assert.equal(await guide.locator('.learning-example').isVisible(),false);
  await guide.locator('[data-guide-hint="full"]').click();
  assert.equal(await guide.locator('.learning-example').isVisible(),true);
  await guide.locator('[data-guide-hint="goal"]').click();
  assert.equal(await guide.locator('.learning-example').isVisible(),false);
  await record();await submit();await waitProgress('语音 1 次（独立 0）');
  await restart();
  await record();
  await page.locator('#voice-host textarea').fill('我一个人来。');
  await submit();await waitProgress('文字 1 次');
  assert.match(await progress.textContent(),/独立 0/);
  await restart();
  await page.locator('#actions [data-click-fallback] summary').click();
  await page.locator('#actions [data-action="START_SEATING"]').click();
  await waitProgress('点击 1 次');
  assert.match(await progress.textContent(),/独立 0/);
  assert.deepEqual(errors,[]);
  console.log('PASS practice levels: hidden answer, frame/full/goal, confirmed untouched voice, hinted voice, edited text and click');
 } finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
 }
})().catch(error => {console.error(error);process.exitCode=1;});
