import assert from 'node:assert/strict';
import { createGame } from '../controller.js';
import { createDining } from '../dining-actions.js';
import { createSession, PHASES } from '../teahouse-scene/index.js';

const clone = (value) => JSON.parse(JSON.stringify(value));
let count = 0;
function test(name, fn) {
  fn();
  console.log(`PASS ${name}`);
  count++;
}

function harness() {
  let seq = 0;
  const queue = new Map();
  const game = createGame({
    schedule: (fn) => {
      queue.set(++seq, fn);
      return seq;
    },
    cancel: (id) => queue.delete(id),
  });
  return {
    game,
    queue,
    flush() {
      let limit = 150;
      while (queue.size) {
        assert.ok(limit--, 'timer queue must settle');
        const [id, fn] = queue.entries().next().value;
        queue.delete(id);
        fn();
      }
    },
  };
}

function seated(h) {
  h.game.action('ENTER');
  h.flush();
  h.game.action('START_SEATING');
  h.flush();
  h.game.action('OPEN_MENU');
}

function confirm(h) {
  h.game.action('CONFIRM_ORDER');
  h.flush();
  assert.equal(h.game.snapshot().view.orderReview, true);
  h.game.action('FINISH_ORDER');
  h.flush();
}

function orderingSession() {
  const session = createSession({ maxPerItem: 1 });
  for (const type of ['ENTER', 'START_SEATING', 'SIT_DOWN', 'OPEN_MENU']) {
    assert.equal(session.dispatch({ type }).ok, true);
  }
  assert.equal(session.dispatch({ type: 'ADD_ITEM', itemId: 'drink-lemon-tea' }).ok, true);
  return session;
}

test('session restores canonical business state and resumes the next order line id', () => {
  const source = orderingSession();
  const saved = source.getState();
  saved.items[0].id = 'line-41';
  const target = createSession({ maxPerItem: 1 });
  const restored = target.restoreState(saved);
  assert.equal(restored.ok, true);
  assert.equal(restored.reason, null);
  assert.deepEqual(target.getState(), saved);

  saved.items[0].qty = 99;
  assert.equal(target.getState().items[0].qty, 1, 'restore must not retain caller references');
  const added = target.dispatch({ type: 'ADD_ITEM', itemId: 'drink-milk-tea' });
  assert.equal(added.ok, true);
  assert.equal(added.state.items[1].id, 'line-42');
});

test('session rejects malformed or contradictory snapshots without partial mutation', () => {
  const session = orderingSession();
  const before = session.getState();
  const mutations = [
    (bad) => { bad.phase = '不存在'; },
    (bad) => { bad.items.push(clone(bad.items[0])); },
    (bad) => { const line = clone(bad.items[0]); line.id = 'line-2'; bad.items.push(line); },
    (bad) => { bad.items[0].itemId = 'not-on-menu'; },
    (bad) => {
      Object.assign(bad.items[0], {
        itemId: 'food-curry-fishball', name: '咖喱魚蛋', unitPrice: 2800,
        options: { spicy: '正常辣' },
      });
    },
    (bad) => { bad.items[0].options.sweetness = '超甜'; },
    (bad) => { delete bad.items[0].options.sweetness; },
    (bad) => { bad.items[0].qty = 0; },
    (bad) => { bad.items[0].unitPrice = 1; },
    (bad) => { bad.items[0].status = 'forged'; },
    (bad) => { bad.items[0].status = 'served'; },
    (bad) => { bad.isPaid = true; },
    (bad) => { bad.hasFoodOnTable = true; },
    (bad) => { bad.billPresented = true; },
    (bad) => { bad.round = -1; },
    (bad) => { bad.unknown = true; },
    (bad) => { bad.items[0].options.constructor = 'polluted'; },
  ];
  for (const mutate of mutations) {
    const bad = clone(before);
    mutate(bad);
    const result = session.restoreState(bad);
    assert.equal(result.ok, false);
    assert.ok(result.reason);
    assert.deepEqual(session.getState(), before);
  }
  const forbidden = clone(before);
  Object.defineProperty(forbidden.items[0], '__proto__', {
    value: { polluted: true }, enumerable: true, configurable: true,
  });
  assert.equal(session.restoreState(forbidden).ok, false);
  assert.deepEqual(session.getState(), before);
});

test('session verifies every bill against the live menu and preserves paid billing state', () => {
  const source = createSession({ maxPerItem: 1 });
  for (const type of ['ENTER', 'START_SEATING', 'SIT_DOWN', 'OPEN_MENU']) source.dispatch({ type });
  source.dispatch({ type: 'ADD_ITEM', itemId: 'food-charsiu-rice' });
  source.dispatch({ type: 'CONFIRM_ORDER' });
  source.dispatch({ type: 'MARK_SERVED' });
  source.dispatch({ type: 'REQUEST_BILL' });
  const billing = source.getState();
  const target = createSession({ maxPerItem: 1 });
  assert.equal(target.restoreState(billing).ok, true);
  assert.deepEqual(target.getState(), billing);

  for (const mutate of [
    (bad) => { bad.bill.totalCents++; },
    (bad) => { bad.bill.lines[0].unitPrice = 1; },
    (bad) => { bad.bill.lines[0].lineTotal = 1; },
    (bad) => { bad.bill.lines = []; },
    (bad) => { bad.bill.currency = 'USD'; },
  ]) {
    const bad = clone(billing);
    mutate(bad);
    assert.equal(target.restoreState(bad).ok, false);
    assert.deepEqual(target.getState(), billing);
  }

  source.dispatch({ type: 'PAY_BILL' });
  const paid = source.getState();
  assert.equal(paid.phase, PHASES.BILLING);
  assert.equal(paid.isPaid, true);
  assert.equal(target.restoreState(paid).ok, true);
  assert.deepEqual(target.getState(), paid);
});

test('stable export omits transient performance, speech, notices and timer state', () => {
  const h = harness();
  seated(h);
  h.game.action('ADD_ITEM', { itemId: 'drink-lemon-tea' });
  h.game.action('REQUEST_WATER');
  h.flush();
  h.game.setSpeech(true, 0.8);
  h.game.notify('temporary');
  const saved = h.game.exportSnapshot();
  assert.deepEqual(Object.keys(saved).sort(), ['state', 'version', 'view']);
  assert.equal(saved.version, 1);
  assert.deepEqual(saved.view, { water: true, utensils: false });
  assert.equal('busy' in saved.view, false);
  assert.equal('beat' in saved.view, false);
  assert.equal('notice' in saved.view, false);
  assert.equal('camera' in saved.view, false);
  assert.equal('speaking' in saved.view, false);
  assert.equal('speechPending' in saved, false);
  assert.equal('timers' in saved, false);
});

test('seating performance restores as seated, invalidates captured callbacks and remains operable', () => {
  const h = harness();
  const g = h.game;
  g.action('ENTER');
  h.flush();
  g.action('START_SEATING');
  assert.equal(g.snapshot().state.phase, PHASES.SEATING);
  assert.equal(g.snapshot().view.busy, true);
  const saved = g.exportSnapshot();
  const stale = [...h.queue.values()];
  const restored = g.restoreSnapshot(saved);
  assert.equal(restored.ok, true);
  assert.equal(restored.state.phase, PHASES.SEATED);
  assert.equal(g.snapshot().view.camera, 'room');
  assert.equal(g.snapshot().view.busy, false);
  assert.equal(g.snapshot().view.beat, null);
  assert.equal(h.queue.size, 0);
  stale.forEach((fn) => fn());
  assert.equal(g.snapshot().state.phase, PHASES.SEATED);
  assert.equal(g.action('OPEN_MENU').ok, true);
  const added = g.action('ADD_ITEM', { itemId: 'drink-lemon-tea' });
  assert.equal(added.ok, true);
  assert.equal(added.state.items[0].id, 'line-1');
});

test('pending menu selection round-trips and can still be confirmed', () => {
  const h = harness();
  const g = h.game;
  seated(h);
  g.action('ADD_ITEM', {
    itemId: 'drink-lemon-tea', options: { temperature: '凍', sweetness: '少甜' },
  });
  const saved = g.exportSnapshot();
  g.action('UPDATE_ITEM_OPTIONS', { orderItemId: 'line-1', options: { sweetness: '走甜' } });
  assert.equal(g.restoreSnapshot(saved).ok, true);
  assert.deepEqual(g.snapshot().state, saved.state);
  assert.equal(g.snapshot().state.items[0].options.sweetness, '少甜');
  assert.equal(g.snapshot().view.camera, 'menu');
  assert.equal(g.snapshot().view.busy, false);
  confirm(h);
  assert.equal(g.snapshot().state.items[0].status, 'served');
});

test('confirmed but unserved lines fast-forward once without duplicate charges or ids', () => {
  const h = harness();
  const g = h.game;
  seated(h);
  g.action('ADD_ITEM', { itemId: 'drink-lemon-tea' });
  g.action('CONFIRM_ORDER');
  h.flush();
  g.action('FINISH_ORDER');
  assert.equal(g.snapshot().state.items[0].status, 'confirmed');
  assert.equal(g.snapshot().state.isPaid, false);
  const saved = g.exportSnapshot();
  const stale = [...h.queue.values()];
  const restored = g.restoreSnapshot(saved);
  assert.equal(restored.ok, true);
  assert.equal(restored.state.items.length, 1);
  assert.equal(restored.state.items[0].status, 'served');
  assert.equal(restored.state.bill, null);
  assert.equal(restored.state.isPaid, false);
  assert.equal(g.snapshot().view.busy, false);
  assert.equal(h.queue.size, 0);
  stale.forEach((fn) => fn());
  assert.equal(g.snapshot().state.items.length, 1);
  assert.equal(g.snapshot().state.items[0].status, 'served');
  const added = g.action('ADD_ITEM', { itemId: 'food-pineapple-bun' });
  assert.equal(added.ok, true);
  assert.equal(added.state.items[1].id, 'line-2');
});

test('dining portions survive game restore and reject forged consumption atomically', () => {
  const h = harness();
  const g = h.game;
  const dining = createDining({ getSnapshot: g.snapshot });
  seated(h);
  g.action('ADD_ITEM', { itemId: 'food-charsiu-rice' });
  g.action('ADD_ITEM', { itemId: 'food-pineapple-bun', options: { serving: '外賣' } });
  confirm(h);
  const foodId = g.snapshot().state.items[0].id;
  const takeawayId = g.snapshot().state.items[1].id;
  assert.equal(dining.takeBite(foodId, g.snapshot().state.round).remaining, 2);
  const gameSave = g.exportSnapshot();
  const diningSave = dining.exportState();
  assert.deepEqual(diningSave.portions, [{ orderId: foodId, remaining: 2 }]);

  const invalidPortions = [
    { round: diningSave.round + 1, portions: clone(diningSave.portions) },
    { round: diningSave.round, portions: [{ orderId: 'line-999', remaining: 2 }] },
    { round: diningSave.round, portions: [{ orderId: takeawayId, remaining: 2 }] },
    { round: diningSave.round, portions: [{ orderId: foodId, remaining: 4 }] },
    { round: diningSave.round, portions: [{ orderId: foodId, remaining: -1 }] },
    { round: diningSave.round, portions: [
      { orderId: foodId, remaining: 2 }, { orderId: foodId, remaining: 1 },
    ] },
  ];
  for (const bad of invalidPortions) {
    assert.equal(dining.restoreState(bad).ok, false);
    assert.equal(dining.inspect(foodId).remaining, 2, 'failed restore must preserve old portions');
  }

  g.action('ADD_ITEM', { itemId: 'drink-lemon-tea' });
  const pendingId = g.snapshot().state.items.at(-1).id;
  const unserved = clone(diningSave);
  unserved.portions.push({ orderId: pendingId, remaining: 2 });
  assert.equal(dining.restoreState(unserved).reason, 'not_served');
  assert.equal(dining.inspect(foodId).remaining, 2);

  assert.equal(g.restoreSnapshot(gameSave).ok, true);
  const restored = dining.restoreState(diningSave);
  assert.equal(restored.ok, true);
  assert.equal(dining.inspect(foodId).remaining, 2, 'restore must not refill a partly eaten item');
  assert.equal(dining.takeBite(foodId, g.snapshot().state.round).remaining, 1);
});

test('stable water and utensils survive a round change while transient state is cleared', () => {
  const h = harness();
  const g = h.game;
  seated(h);
  g.action('REQUEST_WATER');
  h.flush();
  g.action('REQUEST_UTENSILS');
  h.flush();
  const saved = g.exportSnapshot();
  g.action('RESTART');
  assert.equal(g.restoreSnapshot(saved).ok, true);
  assert.equal(g.snapshot().view.water, true);
  assert.equal(g.snapshot().view.utensils, true);
  assert.equal(g.snapshot().view.busy, false);
  assert.equal(g.snapshot().view.notice, '');
  assert.equal(g.snapshot().view.beat, null);
  assert.equal(g.snapshot().view.camera, 'menu');
});

test('paid farewell restores as finished and captured payment callbacks cannot repeat completion', () => {
  const h = harness();
  const g = h.game;
  g.chapter('bill');
  g.action('PAY_BILL');
  const saving = g.snapshot();
  const total = saving.state.bill.totalCents;
  assert.equal(saving.state.phase, PHASES.BILLING);
  assert.equal(saving.state.isPaid, true);
  assert.equal(saving.view.beat.kind, 'farewell');
  const saved = g.exportSnapshot();
  const stale = [...h.queue.values()];
  const restored = g.restoreSnapshot(saved);
  assert.equal(restored.ok, true);
  assert.equal(restored.state.phase, PHASES.FINISHED);
  assert.equal(restored.state.isPaid, true);
  assert.equal(restored.state.bill.totalCents, total);
  assert.equal(g.snapshot().view.camera, 'outside');
  assert.equal(g.snapshot().view.busy, false);
  assert.equal(g.snapshot().view.beat, null);
  assert.equal(h.queue.size, 0);
  stale.forEach((fn) => fn());
  assert.equal(g.snapshot().state.phase, PHASES.FINISHED);
  assert.equal(g.snapshot().state.bill.totalCents, total);
});

test('malicious controller snapshots leave business, view and pending timers untouched', () => {
  const h = harness();
  const g = h.game;
  seated(h);
  g.action('ADD_ITEM', { itemId: 'drink-lemon-tea' });
  g.action('REQUEST_WATER');
  h.flush();
  g.action('CALL_WAITER');
  const before = g.snapshot();
  const timerIds = [...h.queue.keys()];
  const valid = g.exportSnapshot();
  const mutations = [
    (bad) => { bad.version = 2; },
    (bad) => { bad.view.busy = true; },
    (bad) => { bad.view.water = 'yes'; },
    (bad) => { bad.state.phase = PHASES.BILLING; },
    (bad) => { bad.state.isPaid = true; },
    (bad) => { bad.state.items[0].unitPrice = 1; },
    (bad) => { bad.state.items[0].options.sweetness = '超甜'; },
    (bad) => { bad.state.items.push(clone(bad.state.items[0])); },
    (bad) => { bad.state.items[0].constructor = 'polluted'; },
    (bad) => { bad.state.bill = { currency: 'HKD', unit: 'cent', lines: [], totalCents: 0 }; },
  ];
  for (const mutate of mutations) {
    const bad = clone(valid);
    mutate(bad);
    const result = g.restoreSnapshot(bad);
    assert.equal(result.ok, false);
    assert.ok(result.reason);
    assert.deepEqual(g.snapshot(), before);
    assert.deepEqual([...h.queue.keys()], timerIds);
  }
});

console.log(`All ${count} OW1 restore tests passed.`);
