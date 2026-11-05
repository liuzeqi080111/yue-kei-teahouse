const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');

(async () => {
 const { createServer } = await import('../server.mjs');
 const spoken = [];
 const wav = Buffer.alloc(44 + 16000);
 wav.write('RIFF');
 wav.writeUInt32LE(wav.length - 8, 4);
 wav.write('WAVEfmt ', 8);
 wav.writeUInt32LE(16, 16);
 wav.writeUInt16LE(1, 20);
 wav.writeUInt16LE(1, 22);
 wav.writeUInt32LE(16000, 24);
 wav.writeUInt32LE(32000, 28);
 wav.writeUInt16LE(2, 32);
 wav.writeUInt16LE(16, 34);
 wav.write('data', 36);
 wav.writeUInt32LE(16000, 40);
 for (let i = 0; i < 8000; i++) wav.writeInt16LE(Math.round(Math.sin(i * .15) * 1000), 44 + i * 2);
 let blockRequest = null;
 let failNext = false;
 const server = createServer({ provider: {
  status: () => ({ configured: true, asr: true, npc: true, tts: true }),
  speak: async ({ text }) => {
   spoken.push(text);
   if (failNext) { failNext = false; throw Error('stub failure'); }
   if (blockRequest) await blockRequest;
   return { audioBase64: wav.toString('base64'), mimeType: 'audio/wav' };
  }
 } });
 await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
 const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
 try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
   window.testAudio = { rates: [], overlaps: 0, microphoneCalls: 0, pauses: 0 };
   const active = new Set();
   const play = HTMLMediaElement.prototype.play;
   HTMLMediaElement.prototype.play = function () {
    if (this.src.startsWith('blob:')) {
     if ([...active].some(a => a !== this && !a.paused && !a.ended)) window.testAudio.overlaps++;
     active.add(this);
     window.testAudio.rates.push(this.playbackRate);
     this.addEventListener('ended', () => active.delete(this), { once: true });
     this.addEventListener('pause', () => { active.delete(this); window.testAudio.pauses++; }, { once: true });
    }
    return play.call(this);
   };
   if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = () => {
    window.testAudio.microphoneCalls++;
    return Promise.reject(Error('unexpected microphone request'));
   };
  });
  await page.goto('http://127.0.0.1:' + server.address().port + '/');
  await page.locator('#welcome [data-dialog="chapters"]').click();
  await page.locator('[data-chapter="order"]').click();
  await page.locator('#learning-mode [data-learning-mode="beginner"]').click();

  const sceneGuide = page.locator('#learning-guide');
  const action = (guide, kind) => guide.locator('[data-practice-action="' + kind + '"]');
  const status = guide => guide.locator('[data-practice-status]');
  const audio = () => page.evaluate(() => window.testAudio);

  await action(sceneGuide, 'normal').click();
  await page.waitForFunction(() => window.testAudio.rates.length === 1);
  assert.equal((await audio()).rates[0], 1);
  assert.equal(await page.locator('#panel').isVisible(), false);
  await action(sceneGuide, 'slow').click();
  await page.waitForFunction(() => window.testAudio.rates.length === 2);
  assert.ok((await audio()).rates[1] < 1);
  assert.equal(spoken.length, 1, 'slow audio should reuse the same audio response');

  await action(sceneGuide, 'follow').click();
  await page.waitForFunction(() => window.testAudio.rates.length === 3);
  await action(sceneGuide, 'next').click();
  await page.waitForFunction(() => window.testAudio.rates.length === 4);
  await action(sceneGuide, 'stop').click();
  assert.equal((await audio()).microphoneCalls, 0);
  assert.equal((await audio()).overlaps, 0);
  assert.equal(await page.locator('#panel').isVisible(), false);

  await action(sceneGuide, 'follow').click();
  await page.waitForFunction(() => window.testAudio.rates.length === 5);
  const pausesBeforeMic = (await audio()).pauses;
  await page.getByRole('button', {name:'開始說話',exact:true}).click();
  await page.waitForFunction(() => window.testAudio.microphoneCalls === 1);
  assert.ok((await audio()).pauses > pausesBeforeMic, 'starting to record interrupts the example');
  assert.equal(await action(sceneGuide,'next').isVisible(), true, 'recording does not reset the selected segment');
  await action(sceneGuide,'stop').click();
  await page.locator('#hotspots [data-camera="menu"]').click();
  const panelGuide = page.locator('#panel [data-learning-guide]');
  const attempts = spoken.length;
  failNext = true;
  await action(panelGuide, 'normal').click();
  await page.waitForFunction(() => /失敗|失败/.test(document.querySelector('#panel [data-practice-status]').textContent));
  assert.equal(spoken.length, attempts + 1);
  let unblock;
  blockRequest = new Promise(resolve => { unblock = resolve; });
  const playsBefore = (await audio()).rates.length;
  try {
   await action(panelGuide, 'normal').click();
   await expectCount(() => spoken.length, attempts + 2);
   await page.locator('#panel [data-close]').click();
  } finally {
   unblock();
   blockRequest = null;
  }
  await page.waitForTimeout(350);
  assert.equal((await audio()).rates.length, playsBefore, 'late audio must not start after closing the menu');
  assert.equal(await page.locator('#panel').isVisible(), false);
  await page.locator('#hotspots [data-camera="menu"]').click();
  await page.locator('#panel [data-tab="drink"]').click();
  await page.locator('#panel [data-item="drink-milk-tea"]').click();
  await page.locator('#item-form [name="temperature"]').selectOption('凍');
  await page.locator('#item-form [name="sweetness"]').selectOption('少甜');
  const expected = await panelGuide.locator('[data-learning-example]').innerText();
  const beforeSpec = spoken.length;
  await action(panelGuide, 'normal').click();
  await expectCount(() => spoken.length, beforeSpec + 1);
  assert.equal(spoken.at(-1), expected);
  assert.match(expected, /凍絲襪奶茶，少甜/);
  assert.equal(await page.locator('#item-form').isVisible(), true, 'hearing the customized phrase does not submit the order');
  await page.locator('#panel [data-close]').click();

  await page.locator('#pause').click();
  await page.locator('#restart').click();
  await page.locator('#welcome [data-action="ENTER"]').click();
  await page.locator('#actions [data-practice-choice="START_SEATING"]').waitFor();
  await page.waitForFunction(() => document.querySelector('.voice-status').textContent === '準備好');
  const optionPlays = (await audio()).rates.length;
  await page.locator('#actions [data-practice-choice="START_SEATING"]').click();
  await page.waitForFunction(count => window.testAudio.rates.length > count, optionPlays);
  assert.equal(spoken.at(-1), '一位呀，唔該。');
  assert.equal(await page.locator('#actions [data-action="START_SEATING"]').isVisible(), true);
  assert.deepEqual(errors, []);
  console.log('PASS practice audio: normal/slow, cache reuse, manual segments, no game/mic action, failed and stale requests');
 } finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
 }
})().catch(error => { console.error(error); process.exitCode = 1; });

async function expectCount(count, target) {
 const end = Date.now() + 3000;
 while (Date.now() < end && count() < target) await new Promise(resolve => setTimeout(resolve, 20));
 assert.equal(count(), target);
}
