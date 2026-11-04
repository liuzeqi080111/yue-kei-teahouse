/**
 * 可直接运行的验证脚本（无需任何依赖）：
 *   node teahouse-scene/verify.js
 *
 * 注意：这里发送的全部是「结构化测试动作」，用来演示和校验场景逻辑；
 * 真实游戏中这些动作将来自语音识别 + 自然语言理解模块，本模块不做识别。
 */

import assert from 'node:assert/strict';
import { createSession, PHASES, ITEM_STATUS, MENU, getMenuItem } from './index.js';

let passed = 0;
function check(label, fn) {
  fn();
  passed += 1;
  console.log(`PASS ${label}`);
}

const prices = Object.fromEntries(MENU.map((m) => [m.id, m.price]));
const lemonTea = prices['drink-lemon-tea']; // 2200
const charsiu = prices['food-charsiu-rice']; // 5800
const pineapple = prices['food-pineapple-bun']; // 1800

const s = createSession();

// ---------- 完整流程：开始新局 → 迎接入座 → 点餐 → 改甜 → 确认上菜 → 加水 → 结账 → 离店 ----------

check('新局初始状态：门外、无订单、无账单', () => {
  const st = s.getState();
  assert.equal(st.phase, PHASES.OUTSIDE);
  assert.deepEqual(st.items, []);
  assert.equal(st.bill, null);
  assert.equal(st.isPaid, false);
  assert.equal(st.waiterPresent, false);
  assert.equal(st.hasFoodOnTable, false);
  assert.equal(st.billPresented, false);
});

check('非法阶段操作被拒绝：门外不能点餐 / 请求结账 / 离店，且状态不变', () => {
  for (const action of [
    { type: 'ADD_ITEM', itemId: 'drink-lemon-tea' },
    { type: 'REQUEST_BILL' },
    { type: 'LEAVE' },
    { type: 'PAY_BILL' },
  ]) {
    const r = s.dispatch(action);
    assert.equal(r.ok, false, action.type);
    assert.ok(r.reason.length > 0);
    assert.equal(r.state.phase, PHASES.OUTSIDE);
    assert.deepEqual(r.state.items, []);
  }
});

check('进店 → 迎接 → 带位 → 入座 → 打开菜单', () => {
  assert.equal(s.dispatch({ type: 'ENTER' }).state.phase, PHASES.GREETING);
  assert.equal(s.getState().waiterPresent, true);
  assert.equal(s.dispatch({ type: 'START_SEATING' }).state.phase, PHASES.SEATING);
  const seated = s.dispatch({ type: 'SIT_DOWN' });
  assert.equal(seated.state.phase, PHASES.SEATED);
  assert.equal(seated.state.waiterPresent, false);
  assert.ok(seated.events.some((e) => e.type === 'GUEST_SEATED'));
  assert.equal(s.dispatch({ type: 'OPEN_MENU' }).state.phase, PHASES.ORDERING);
});

check('非法商品 / 非法选项 / 售罄商品被拒绝', () => {
  assert.equal(s.dispatch({ type: 'ADD_ITEM', itemId: 'drink-not-exist' }).ok, false);
  const badOption = s.dispatch({
    type: 'ADD_ITEM',
    itemId: 'drink-lemon-tea',
    options: { sweetness: '超甜' },
  });
  assert.equal(badOption.ok, false);
  assert.match(badOption.reason, /不允许取值/);
  const unknownOption = s.dispatch({
    type: 'ADD_ITEM',
    itemId: 'food-pineapple-bun',
    options: { sweetness: '少甜' }, // 菠蘿油没有甜度选项
  });
  assert.equal(unknownOption.ok, false);
  const soldOut = s.dispatch({ type: 'ADD_ITEM', itemId: 'food-curry-fishball' });
  assert.equal(soldOut.ok, false);
  assert.match(soldOut.reason, /售罄/);
  assert.deepEqual(s.getState().items, []);
});

let lineA; // 凍檸茶・少甜 ×1
let lineB; // 凍檸茶・正常甜 ×2（同款不同规格）
let lineFood; // 叉燒飯 ×1

check('添加食物和饮品：同款饮品不同规格生成独立订单项', () => {
  const r1 = s.dispatch({
    type: 'ADD_ITEM',
    itemId: 'drink-lemon-tea',
    qty: 1,
    options: { temperature: '凍', sweetness: '少甜' },
  });
  assert.equal(r1.ok, true);
  lineA = r1.state.items[0].id;

  const r2 = s.dispatch({
    type: 'ADD_ITEM',
    itemId: 'drink-lemon-tea',
    qty: 2,
    options: { temperature: '凍', sweetness: '正常甜' },
  });
  lineB = r2.state.items[1].id;
  assert.notEqual(lineA, lineB);

  const r3 = s.dispatch({ type: 'ADD_ITEM', itemId: 'food-charsiu-rice', qty: 1 });
  lineFood = r3.state.items[2].id;
  assert.equal(r3.state.items.length, 3);
});

check('将「少甜」改为「走甜」：只改甜度，饮品、温度、数量均保留', () => {
  const r = s.dispatch({
    type: 'UPDATE_ITEM_OPTIONS',
    orderItemId: lineA,
    options: { sweetness: '走甜' },
  });
  assert.equal(r.ok, true);
  const a = r.state.items.find((it) => it.id === lineA);
  assert.equal(a.itemId, 'drink-lemon-tea');
  assert.equal(a.name, '檸茶');
  assert.equal(a.qty, 1);
  assert.deepEqual(a.options, { temperature: '凍', sweetness: '走甜' });
});

check('同款不同规格可单独修改：另一杯数量与甜度不受影响', () => {
  const r = s.dispatch({ type: 'UPDATE_ITEM_QTY', orderItemId: lineB, qty: 3 });
  assert.equal(r.ok, true);
  const a = r.state.items.find((it) => it.id === lineA);
  const b = r.state.items.find((it) => it.id === lineB);
  assert.equal(b.qty, 3);
  assert.equal(b.options.sweetness, '正常甜');
  assert.equal(a.qty, 1);
  assert.equal(a.options.sweetness, '走甜');
});

check('非法修改被拒绝：未知订单项 / 非法选项值 / 非法数量', () => {
  assert.equal(
    s.dispatch({ type: 'UPDATE_ITEM_OPTIONS', orderItemId: 'line-999', options: { sweetness: '走甜' } }).ok,
    false,
  );
  assert.equal(
    s.dispatch({ type: 'UPDATE_ITEM_OPTIONS', orderItemId: lineA, options: { sweetness: '超甜' } }).ok,
    false,
  );
  assert.equal(s.dispatch({ type: 'UPDATE_ITEM_QTY', orderItemId: lineA, qty: 0 }).ok, false);
  assert.equal(s.dispatch({ type: 'UPDATE_ITEM_QTY', orderItemId: lineA, qty: 1.5 }).ok, false);
});

check('未上菜商品可取消；取消不影响其他订单项', () => {
  const added = s.dispatch({ type: 'ADD_ITEM', itemId: 'food-egg-sandwich' });
  const tempId = added.state.items.at(-1).id;
  const cancelled = s.dispatch({ type: 'CANCEL_ITEM', orderItemId: tempId });
  assert.equal(cancelled.ok, true);
  assert.equal(cancelled.state.items.length, 3);
  assert.ok(cancelled.events.some((e) => e.type === 'ITEM_CANCELLED'));
});

check('确认订单进入用餐；重复确认幂等，不重复添加、不重复计费', () => {
  const confirmed = s.dispatch({ type: 'CONFIRM_ORDER' });
  assert.equal(confirmed.ok, true);
  assert.equal(confirmed.state.phase, PHASES.DINING);
  assert.ok(confirmed.state.items.every((it) => it.status === ITEM_STATUS.CONFIRMED));

  const again = s.dispatch({ type: 'CONFIRM_ORDER' });
  assert.equal(again.ok, true);
  assert.ok(again.events.some((e) => e.type === 'ORDER_CONFIRM_NOOP'));
  assert.equal(again.state.items.length, 3);
  assert.deepEqual(again.state.items, confirmed.state.items);
});

check('有未确认商品时不能请求结账', () => {
  const r = s.dispatch({ type: 'ADD_ITEM', itemId: 'drink-milk-tea' });
  assert.equal(r.ok, true);
  const bill = s.dispatch({ type: 'REQUEST_BILL' });
  assert.equal(bill.ok, false);
  assert.match(bill.reason, /未确认/);
  // 取消这杯测试用奶茶，恢复既有订单
  const tempId = r.state.items.at(-1).id;
  assert.equal(s.dispatch({ type: 'CANCEL_ITEM', orderItemId: tempId }).ok, true);
});

check('标记已上菜：桌面有食物；已上菜商品禁止修改与取消', () => {
  const served = s.dispatch({ type: 'MARK_SERVED' });
  assert.equal(served.ok, true);
  assert.ok(served.state.items.every((it) => it.status === ITEM_STATUS.SERVED));
  assert.equal(served.state.hasFoodOnTable, true);
  assert.ok(served.events.some((e) => e.type === 'ITEMS_SERVED'));

  const mod = s.dispatch({
    type: 'UPDATE_ITEM_OPTIONS',
    orderItemId: lineA,
    options: { sweetness: '少甜' },
  });
  assert.equal(mod.ok, false);
  assert.match(mod.reason, /已经上菜/);
  assert.equal(s.dispatch({ type: 'UPDATE_ITEM_QTY', orderItemId: lineA, qty: 2 }).ok, false);
  assert.equal(s.dispatch({ type: 'CANCEL_ITEM', orderItemId: lineA }).ok, false);
});

check('追加订单：用餐中加点 → 确认 → 上菜', () => {
  const added = s.dispatch({ type: 'ADD_ITEM', itemId: 'food-pineapple-bun', qty: 1 });
  assert.equal(added.ok, true);
  assert.ok(added.events.some((e) => e.type === 'ITEM_ADDED_ADDITIONAL'));
  const lineExtra = added.state.items.at(-1).id;

  const confirmed = s.dispatch({ type: 'CONFIRM_ORDER' });
  assert.equal(confirmed.ok, true);
  assert.equal(confirmed.events.find((e) => e.type === 'ORDER_CONFIRMED').isAdditional, true);

  const served = s.dispatch({ type: 'MARK_SERVED', orderItemId: lineExtra });
  assert.equal(served.state.items.find((it) => it.id === lineExtra).status, ITEM_STATUS.SERVED);
});

check('服务请求：加水 / 餐具 / 招呼服务员返回结构化事件', () => {
  const water = s.dispatch({ type: 'REQUEST_WATER' });
  assert.equal(water.ok, true);
  assert.ok(water.events.some((e) => e.type === 'WAITER_APPROACH'));
  assert.ok(water.events.some((e) => e.type === 'WATER_REFILLED'));
  assert.equal(water.state.waiterPresent, true);

  assert.ok(s.dispatch({ type: 'REQUEST_UTENSILS' }).events.some((e) => e.type === 'UTENSILS_PROVIDED'));
  assert.ok(s.dispatch({ type: 'CALL_WAITER' }).events.some((e) => e.type === 'WAITER_APPROACH'));
});

const expectedTotal = lemonTea * 1 + lemonTea * 3 + charsiu * 1 + pineapple * 1; // 2200+6600+5800+1800=16400

check('请求结账：按实际订单计算金额（整数分），出示账单', () => {
  const r = s.dispatch({ type: 'REQUEST_BILL' });
  assert.equal(r.ok, true);
  assert.equal(r.state.phase, PHASES.BILLING);
  assert.equal(r.state.billPresented, true);
  assert.equal(r.state.bill.totalCents, expectedTotal);
  assert.equal(r.state.bill.lines.length, 4);
  assert.equal(r.state.bill.lines.reduce((sum, l) => sum + l.lineTotal, 0), expectedTotal);
  assert.ok(r.events.some((e) => e.type === 'BILL_PRESENTED'));
});

check('结账阶段重复请求账单：ok 成功、返回原账单、只出示账单、无任何支付副作用', () => {
  const before = s.getState();
  const again = s.dispatch({ type: 'REQUEST_BILL' });
  assert.equal(again.ok, true); // 修复前：第二次会被阶段检查拒绝
  assert.equal(again.reason, null);
  assert.equal(again.state.phase, PHASES.BILLING);
  assert.deepEqual(again.state.bill, before.bill); // 同一份账单，金额不变
  assert.deepEqual(again.state.items, before.items); // 订单不变
  assert.equal(again.state.bill.totalCents, expectedTotal);
  assert.equal(again.state.isPaid, false);
  assert.deepEqual(
    again.events.map((e) => e.type),
    ['BILL_PRESENTED'], // 只重新出示账单，无支付 / 收费 / 阶段事件
  );
  assert.deepEqual(again.events[0].bill, before.bill);

  // 再调一次依然幂等
  const third = s.dispatch({ type: 'REQUEST_BILL' });
  assert.equal(third.ok, true);
  assert.deepEqual(third.state.bill, before.bill);
});

check('结账阶段限制：不能再加点 / 加水；支付金额不符被拒绝', () => {
  assert.equal(s.dispatch({ type: 'ADD_ITEM', itemId: 'drink-milk-tea' }).ok, false);
  assert.equal(s.dispatch({ type: 'REQUEST_WATER' }).ok, false);
  assert.equal(s.dispatch({ type: 'PAY_BILL', amountCents: 1 }).ok, false);
});

check('未支付不能离店', () => {
  const r = s.dispatch({ type: 'LEAVE' });
  assert.equal(r.ok, false);
  assert.match(r.reason, /尚未完成虚拟结账/);
  assert.equal(r.state.phase, PHASES.BILLING);
});

check('虚拟结账 → 离店，进入结束阶段', () => {
  const paid = s.dispatch({ type: 'PAY_BILL', amountCents: expectedTotal });
  assert.equal(paid.ok, true);
  assert.equal(paid.state.isPaid, true);
  assert.ok(paid.events.some((e) => e.type === 'PAYMENT_COMPLETED'));

  // 重复支付幂等
  const paidAgain = s.dispatch({ type: 'PAY_BILL' });
  assert.equal(paidAgain.ok, true);
  assert.ok(paidAgain.events.some((e) => e.type === 'PAYMENT_NOOP'));

  const left = s.dispatch({ type: 'LEAVE' });
  assert.equal(left.state.phase, PHASES.FINISHED);
  assert.ok(left.events.some((e) => e.type === 'GUEST_LEFT'));
});

check('重新开始：不残留上一局订单、账单与支付记录', () => {
  const r = s.dispatch({ type: 'RESTART' });
  assert.equal(r.ok, true);
  assert.equal(r.state.phase, PHASES.OUTSIDE);
  assert.deepEqual(r.state.items, []);
  assert.equal(r.state.bill, null);
  assert.equal(r.state.isPaid, false);
  assert.equal(r.state.hasFoodOnTable, false);
  assert.equal(r.state.billPresented, false);
  assert.equal(r.state.waiterPresent, false);
  assert.equal(r.state.round, 1);

  // 新一局订单项 ID 重新计数，不与上一局混淆
  s.dispatch({ type: 'ENTER' });
  s.dispatch({ type: 'START_SEATING' });
  s.dispatch({ type: 'SIT_DOWN' });
  s.dispatch({ type: 'OPEN_MENU' });
  const added = s.dispatch({ type: 'ADD_ITEM', itemId: 'drink-lemon-tea' });
  assert.equal(added.state.items.length, 1);
  assert.equal(added.state.items[0].id, 'line-1');
});

check('createSession() 之间互不影响（独立会话）', () => {
  const other = createSession();
  other.dispatch({ type: 'ENTER' });
  assert.equal(other.getState().phase, PHASES.GREETING);
  assert.equal(s.getState().phase, PHASES.ORDERING);
});

// ---------- 回归测试：针对本轮修复 ----------

check('非法动作：toString / constructor / __proto__ 等不抛异常，统一失败结构且状态不变', () => {
  const before = s.getState();
  for (const type of ['toString', 'constructor', '__proto__', 'hasOwnProperty', 'valueOf', '', 'NO_SUCH_ACTION']) {
    let r;
    assert.doesNotThrow(() => {
      r = s.dispatch({ type });
    }, `动作 ${type} 不应抛异常`);
    assert.equal(r.ok, false, type);
    assert.deepEqual(r.events, [], type);
    assert.ok(typeof r.reason === 'string' && r.reason.length > 0, type);
    assert.match(r.reason, /未知动作类型/);
    assert.deepEqual(r.state, before, `动作 ${type} 失败后状态必须完全不变`);
    assert.deepEqual(s.getState(), before);
  }
  // 非对象动作同样安全
  for (const bad of [null, undefined, 42, 'ENTER', {}, { type: 123 }]) {
    const r = s.dispatch(bad);
    assert.equal(r.ok, false);
    assert.deepEqual(r.events, []);
    assert.deepEqual(s.getState(), before);
  }
});

check('各类业务失败时状态完全不变（深比较）', () => {
  const attempts = [
    { type: 'LEAVE' }, // 非法阶段
    { type: 'REQUEST_BILL' }, // 非法阶段
    { type: 'ADD_ITEM', itemId: 'no-such-item' },
    { type: 'ADD_ITEM', itemId: 'drink-lemon-tea', options: { sweetness: '超甜' } },
    { type: 'ADD_ITEM', itemId: 'food-curry-fishball' }, // 售罄
    { type: 'UPDATE_ITEM_QTY', orderItemId: 'line-999', qty: 2 },
    { type: 'MARK_SERVED' }, // 非法阶段
  ];
  for (const action of attempts) {
    const before = s.getState();
    const r = s.dispatch(action);
    assert.equal(r.ok, false, JSON.stringify(action));
    assert.deepEqual(r.events, []);
    assert.deepEqual(r.state, before, JSON.stringify(action));
    assert.deepEqual(s.getState(), before, JSON.stringify(action));
  }
});

check('菜单深度冻结：外部无法修改价格、可供应状态、选项与默认值', () => {
  assert.ok(Object.isFrozen(MENU));
  for (const item of MENU) {
    assert.ok(Object.isFrozen(item), item.id);
    assert.ok(Object.isFrozen(item.options), item.id);
    assert.ok(Object.isFrozen(item.defaults), item.id);
    for (const key of Object.keys(item.options)) {
      assert.ok(Object.isFrozen(item.options[key]), `${item.id}.${key}`);
    }
  }
  const bun = getMenuItem('food-pineapple-bun');
  assert.ok(Object.isFrozen(bun));
  // ES Module 严格模式下，写入冻结对象抛 TypeError
  assert.throws(() => { MENU[0].price = 1; }, TypeError);
  assert.throws(() => { bun.available = false; }, TypeError);
  assert.throws(() => { bun.name = '被篡改'; }, TypeError);
  assert.throws(() => { bun.options.serving.push('不要'); }, TypeError);
  assert.throws(() => { bun.defaults.serving = '外賣'; }, TypeError);
  assert.throws(() => { MENU.push({ id: 'fake' }); }, TypeError);
  // 数据保持原样
  assert.equal(getMenuItem('food-pineapple-bun').price, 1800);
  assert.equal(getMenuItem('food-pineapple-bun').available, true);
  assert.deepEqual(getMenuItem('food-pineapple-bun').options.serving, ['即食', '外賣']);
  // 新会话下单仍使用未被污染的价格
  const fresh = createSession();
  fresh.dispatch({ type: 'ENTER' });
  fresh.dispatch({ type: 'START_SEATING' });
  fresh.dispatch({ type: 'SIT_DOWN' });
  fresh.dispatch({ type: 'OPEN_MENU' });
  const added = fresh.dispatch({ type: 'ADD_ITEM', itemId: 'food-pineapple-bun' });
  assert.equal(added.state.items[0].unitPrice, 1800);
  assert.equal(added.state.items[0].options.serving, '即食');
});

const w = createSession(); // WAITER_LEAVE 专用会话

check('WAITER_LEAVE：服务员完成服务离开，事件明确，重复调用幂等', () => {
  w.dispatch({ type: 'ENTER' });
  w.dispatch({ type: 'START_SEATING' });
  w.dispatch({ type: 'SIT_DOWN' }); // 入座后服务员本就不在场
  const noop = w.dispatch({ type: 'WAITER_LEAVE' });
  assert.equal(noop.ok, true);
  assert.equal(noop.state.waiterPresent, false);
  assert.deepEqual(noop.events.map((e) => e.type), ['WAITER_LEAVE_NOOP']);

  const called = w.dispatch({ type: 'CALL_WAITER' });
  assert.equal(called.state.waiterPresent, true);
  const left = w.dispatch({ type: 'WAITER_LEAVE' });
  assert.equal(left.ok, true);
  assert.equal(left.state.waiterPresent, false);
  assert.deepEqual(left.events.map((e) => e.type), ['WAITER_LEFT']);
  // 重复调用：不再产生 WAITER_LEFT，避免重复播放离场动画
  const again = w.dispatch({ type: 'WAITER_LEAVE' });
  assert.equal(again.ok, true);
  assert.deepEqual(again.events.map((e) => e.type), ['WAITER_LEAVE_NOOP']);

  // 收单、送餐、加水、出示账单后均可回调离开
  w.dispatch({ type: 'OPEN_MENU' });
  w.dispatch({ type: 'ADD_ITEM', itemId: 'drink-lemon-tea' });
  const confirmed = w.dispatch({ type: 'CONFIRM_ORDER' });
  assert.equal(confirmed.state.waiterPresent, true); // 收单
  assert.equal(w.dispatch({ type: 'WAITER_LEAVE' }).state.waiterPresent, false);
  assert.equal(w.dispatch({ type: 'MARK_SERVED' }).state.waiterPresent, true); // 送餐
  assert.equal(w.dispatch({ type: 'WAITER_LEAVE' }).state.waiterPresent, false);
  assert.equal(w.dispatch({ type: 'REQUEST_WATER' }).state.waiterPresent, true); // 加水
  assert.equal(w.dispatch({ type: 'WAITER_LEAVE' }).state.waiterPresent, false);
  assert.equal(w.dispatch({ type: 'REQUEST_BILL' }).state.waiterPresent, true); // 出示账单
  const billingLeave = w.dispatch({ type: 'WAITER_LEAVE' }); // 结账阶段也允许
  assert.equal(billingLeave.ok, true);
  assert.equal(billingLeave.state.waiterPresent, false);
  assert.equal(billingLeave.state.phase, PHASES.BILLING);
});

check('WAITER_LEAVE 阶段限制：门外 / 迎接 / 带位 / 结束阶段被拒绝且状态不变', () => {
  const early = createSession();
  const outside = early.dispatch({ type: 'WAITER_LEAVE' });
  assert.equal(outside.ok, false);
  assert.equal(outside.state.phase, PHASES.OUTSIDE);
  early.dispatch({ type: 'ENTER' });
  const before = early.getState();
  const greeting = early.dispatch({ type: 'WAITER_LEAVE' }); // 迎接时服务员必须在场
  assert.equal(greeting.ok, false);
  assert.equal(greeting.state.waiterPresent, true);
  assert.deepEqual(early.getState(), before);
  early.dispatch({ type: 'START_SEATING' });
  assert.equal(early.dispatch({ type: 'WAITER_LEAVE' }).ok, false); // 带位中

  // 结束阶段：独立会话按正常动作完整走完一局，直到离店
  const done = createSession();
  assert.equal(done.dispatch({ type: 'ENTER' }).ok, true);
  assert.equal(done.dispatch({ type: 'START_SEATING' }).ok, true);
  assert.equal(done.dispatch({ type: 'SIT_DOWN' }).ok, true);
  assert.equal(done.dispatch({ type: 'OPEN_MENU' }).ok, true);
  assert.equal(done.dispatch({ type: 'ADD_ITEM', itemId: 'drink-lemon-tea' }).ok, true);
  assert.equal(done.dispatch({ type: 'CONFIRM_ORDER' }).ok, true);
  assert.equal(done.dispatch({ type: 'MARK_SERVED' }).ok, true);
  assert.equal(done.dispatch({ type: 'REQUEST_BILL' }).ok, true);
  assert.equal(done.dispatch({ type: 'PAY_BILL' }).ok, true);
  assert.equal(done.dispatch({ type: 'LEAVE' }).ok, true);
  assert.equal(done.getState().phase, PHASES.FINISHED); // 确认确实处于结束阶段

  const beforeDone = done.getState();
  const finishedLeave = done.dispatch({ type: 'WAITER_LEAVE' });
  assert.equal(finishedLeave.ok, false);
  assert.deepEqual(finishedLeave.events, []);
  assert.ok(typeof finishedLeave.reason === 'string' && finishedLeave.reason.length > 0);
  assert.deepEqual(finishedLeave.state, beforeDone); // 返回状态与调用前一致
  assert.deepEqual(done.getState(), beforeDone); // 内部状态与调用前一致
});

check('旧回合动作不污染新回合：round 不符被拒绝，当前 round 与缺省调用正常', () => {
  const oldRound = w.getState().round; // 第 0 回合
  w.dispatch({ type: 'RESTART' });
  assert.equal(w.getState().round, oldRound + 1);
  w.dispatch({ type: 'ENTER' });
  w.dispatch({ type: 'START_SEATING' });
  w.dispatch({ type: 'SIT_DOWN' });
  w.dispatch({ type: 'CALL_WAITER' }); // 新回合服务员在场

  const before = w.getState();
  // 迟到的离场回调（上一回合的动画完成）不得影响新一局
  const stale = w.dispatch({ type: 'WAITER_LEAVE', round: oldRound });
  assert.equal(stale.ok, false);
  assert.match(stale.reason, /回合/);
  assert.deepEqual(stale.events, []);
  assert.equal(stale.state.waiterPresent, true); // 新回合服务员未被错误移除
  assert.deepEqual(w.getState(), before);
  // 旧回合的其他动作同样被拒绝
  const staleWater = w.dispatch({ type: 'REQUEST_WATER', round: oldRound });
  assert.equal(staleWater.ok, false);
  assert.deepEqual(w.getState(), before);

  // 带当前 round：正常执行
  const current = w.dispatch({ type: 'WAITER_LEAVE', round: w.getState().round });
  assert.equal(current.ok, true);
  assert.equal(current.state.waiterPresent, false);
  // 不带 round：保持兼容，正常执行
  w.dispatch({ type: 'CALL_WAITER' });
  const legacy = w.dispatch({ type: 'WAITER_LEAVE' });
  assert.equal(legacy.ok, true);
  assert.equal(legacy.state.waiterPresent, false);
});

console.log(`\n全部 ${passed} 项验证通过。`);
