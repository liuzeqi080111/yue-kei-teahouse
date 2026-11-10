/**
 * 茶餐厅场景会话：状态机 + 订单管理 + 服务请求。
 *
 * 只处理「已经结构化的动作」。自然语言理解 / 语音识别由后续模块接入，
 * 它们只需要把识别结果翻译成本文件约定的 action 即可。
 */

import { getMenuItem, resolveOptions } from './menu.js';

/** 场景阶段 */
export const PHASES = Object.freeze({
  OUTSIDE: '门外',
  GREETING: '迎接',
  SEATING: '带位',
  SEATED: '已入座',
  ORDERING: '点餐',
  DINING: '用餐',
  BILLING: '结账',
  FINISHED: '结束',
});

/** 订单项状态 */
export const ITEM_STATUS = Object.freeze({
  PENDING: 'pending', // 已加入订单，尚未确认
  CONFIRMED: 'confirmed', // 已确认，等待上菜
  SERVED: 'served', // 已上菜：不可再修改 / 取消
});

const P = PHASES;

/** 明确的阶段允许转换表（未列出的转换一律拒绝） */
const PHASE_TRANSITIONS = Object.freeze({
  [P.OUTSIDE]: [P.GREETING],
  [P.GREETING]: [P.SEATING],
  [P.SEATING]: [P.SEATED],
  [P.SEATED]: [P.ORDERING],
  [P.ORDERING]: [P.DINING],
  [P.DINING]: [P.BILLING],
  [P.BILLING]: [P.FINISHED],
  [P.FINISHED]: [],
});

/** 各动作允许执行的阶段 */
const ACTION_PHASES = Object.freeze({
  ENTER: [P.OUTSIDE],
  START_SEATING: [P.GREETING],
  SIT_DOWN: [P.SEATING],
  OPEN_MENU: [P.SEATED],
  ADD_ITEM: [P.ORDERING, P.DINING], // 用餐中加点 = 追加订单
  UPDATE_ITEM_QTY: [P.ORDERING, P.DINING],
  UPDATE_ITEM_OPTIONS: [P.ORDERING, P.DINING],
  UPDATE_ITEM: [P.ORDERING, P.DINING],
  CANCEL_ITEM: [P.ORDERING, P.DINING],
  CONFIRM_ORDER: [P.ORDERING, P.DINING],
  MARK_SERVED: [P.DINING],
  REQUEST_WATER: [P.SEATED, P.ORDERING, P.DINING],
  REQUEST_UTENSILS: [P.SEATED, P.ORDERING, P.DINING],
  CALL_WAITER: [P.SEATED, P.ORDERING, P.DINING],
  REQUEST_BILL: [P.DINING, P.BILLING], // 结账阶段重复请求：返回原账单，幂等
  PAY_BILL: [P.BILLING],
  LEAVE: [P.BILLING],
  WAITER_LEAVE: [P.SEATED, P.ORDERING, P.DINING, P.BILLING], // 视觉层动画完成后回调
});

function createInitialState() {
  return {
    phase: P.OUTSIDE,
    items: [], // 订单项，见 dispatch ADD_ITEM
    bill: null, // { lines, totalCents, currency }，REQUEST_BILL 时按实际订单计算
    isPaid: false, // 虚拟结账是否已完成
    waiterPresent: false, // 服务员是否在场（供镜头 / 人物动画使用）
    partySize: null,
    hasFoodOnTable: false, // 桌面是否已有食物（由已上菜订单项派生）
    billPresented: false, // 是否已出示账单
    round: 0, // 第几局，RESTART 后 +1
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function ok(state, events = []) {
  syncDerived(state);
  return { ok: true, state: clone(state), events, reason: null };
}

function fail(state, reason) {
  // 失败时状态保持完全一致，只返回可读原因
  return { ok: false, state: clone(state), events: [], reason };
}

function syncDerived(state) {
  state.hasFoodOnTable = state.items.some((it) => it.status === ITEM_STATUS.SERVED);
  state.billPresented = state.bill !== null;
}

function transition(state, to, events) {
  const allowed = PHASE_TRANSITIONS[state.phase] ?? [];
  if (!allowed.includes(to)) {
    return fail(state, `当前阶段「${state.phase}」不能转换为「${to}」。`);
  }
  const from = state.phase;
  state.phase = to;
  events.push({ type: 'PHASE_CHANGED', from, to });
  return null;
}

function findItem(state, orderItemId) {
  return state.items.find((it) => it.id === orderItemId);
}

/** 计算账单：只统计已确认 / 已上菜、未取消的商品，金额全部为整数（港币分）。 */
function calculateBill(state) {
  const billable = state.items.filter(
    (it) => it.status === ITEM_STATUS.CONFIRMED || it.status === ITEM_STATUS.SERVED,
  );
  const lines = billable.map((it) => ({
    orderItemId: it.id,
    itemId: it.itemId,
    name: it.name,
    qty: it.qty,
    options: { ...it.options },
    unitPrice: it.unitPrice,
    lineTotal: it.unitPrice * it.qty,
  }));
  return {
    currency: 'HKD',
    unit: 'cent',
    lines,
    totalCents: lines.reduce((sum, line) => sum + line.lineTotal, 0),
  };
}

/**
 * 创建一局新会话。
 * @returns {{ getState: Function, dispatch: Function }}
 */
export function createSession({maxPerItem=Infinity}={}) {
  if(maxPerItem!==Infinity&&(!Number.isInteger(maxPerItem)||maxPerItem<1))throw new RangeError('maxPerItem must be a positive integer');
  let state = createInitialState();
  let itemSeq = 0;
  const exceedsLimit=(itemId,qty,exceptId)=>qty+state.items.filter(it=>it.itemId===itemId&&it.id!==exceptId).reduce((n,it)=>n+it.qty,0)>maxPerItem;
  const limitReason=()=>maxPerItem===1?'每款餐點本局限點一份；想轉規格，請修改已選餐點。':`每款餐點最多 ${maxPerItem} 份。`;

  function getState() {
    return clone(state);
  }

  function dispatch(action) {
    if (action === null || typeof action !== 'object' || typeof action.type !== 'string') {
      return fail(state, '动作必须是带 type 字段的对象。');
    }
    const { type } = action;

    // 回合校验（可选参数，用于识别旧回调）：
    // 视觉层在动画完成等延迟回调中带上动作发生时的 state.round；
    // 若中途 RESTART 重开，旧回合动作一律被拒绝，不会污染新一局。
    // 不传 round 时保持原有行为（兼容既有调用方与测试动作）。
    if (action.round !== undefined && action.round !== state.round) {
      return fail(
        state,
        `动作属于第 ${action.round} 回合，当前已是第 ${state.round} 回合，旧回调已忽略。`,
      );
    }

    if (type === 'RESTART') {
      // 恢复一局独立的初始状态：订单、账单、支付记录全部清空
      const nextRound = state.round + 1;
      state = createInitialState();
      state.round = nextRound;
      itemSeq = 0;
      return ok(state, [{ type: 'SESSION_RESTARTED', round: nextRound }]);
    }

    // 必须用自有属性检查：'toString'、'constructor'、'__proto__' 等
    // 原型链上的名字不是合法动作，统一按未知动作拒绝，不抛异常。
    if (!Object.prototype.hasOwnProperty.call(ACTION_PHASES, type)) {
      return fail(state, `未知动作类型「${type}」。`);
    }
    const allowedPhases = ACTION_PHASES[type];
    if (!allowedPhases.includes(state.phase)) {
      return fail(
        state,
        `当前阶段「${state.phase}」不允许执行「${type}」，可在「${allowedPhases.join('、')}」阶段执行。`,
      );
    }

    const events = [];

    switch (type) {
      case 'ENTER': {
        const err = transition(state, P.GREETING, events);
        if (err) return err;
        state.waiterPresent = true; // 服务员上前迎接
        events.push({ type: 'WAITER_APPROACH', reason: 'greeting' });
        return ok(state, events);
      }

      case 'START_SEATING': {
        const partySize = action.partySize ?? 1;
        if (partySize !== 1 && partySize !== 2) return fail(state, '目前只安排一至两位的座位。');
        const err = transition(state, P.SEATING, events);
        if (err) return err;
        state.partySize = partySize;
        state.waiterPresent = true;
        events.push({ type: 'WAITER_LEADS_TO_TABLE', partySize });
        return ok(state, events);
      }

      case 'SIT_DOWN': {
        const err = transition(state, P.SEATED, events);
        if (err) return err;
        state.waiterPresent = false; // 服务员暂时离开
        events.push({ type: 'GUEST_SEATED' });
        return ok(state, events);
      }

      case 'OPEN_MENU': {
        const err = transition(state, P.ORDERING, events);
        if (err) return err;
        events.push({ type: 'MENU_OPENED' });
        return ok(state, events);
      }

      case 'ADD_ITEM': {
        const menuItem = getMenuItem(action.itemId);
        if (!menuItem) return fail(state, `菜单中不存在商品「${action.itemId}」。`);
        if (!menuItem.available) {
          return fail(state, `「${menuItem.name}」今日售罄，暂时无法供应。`);
        }
        const qty = action.qty ?? 1;
        if (!Number.isInteger(qty) || qty < 1 || qty > 99) {
          return fail(state, '数量必须是 1–99 的整数。');
        }
        if(exceedsLimit(menuItem.id,qty))return fail(state,limitReason());
        const resolved = resolveOptions(menuItem, action.options ?? {});
        if (!resolved.ok) return fail(state, resolved.reason);

        const isAdditional = state.items.length > 0 && state.phase === P.DINING;
        const item = {
          id: `line-${++itemSeq}`, // 每条订单项独立 ID，同款不同规格互不影响
          itemId: menuItem.id,
          name: menuItem.name,
          qty,
          options: resolved.options,
          unitPrice: menuItem.price,
          status: ITEM_STATUS.PENDING,
        };
        state.items.push(item);
        events.push({ type: isAdditional ? 'ITEM_ADDED_ADDITIONAL' : 'ITEM_ADDED', item: clone(item) });
        return ok(state, events);
      }

      case 'UPDATE_ITEM_QTY': {
        const item = findItem(state, action.orderItemId);
        if (!item) return fail(state, `订单项「${action.orderItemId}」不存在。`);
        if (item.status === ITEM_STATUS.SERVED) {
          return fail(state, `「${item.name}」已经上菜，不能再修改数量。`);
        }
        const qty = action.qty;
        if (!Number.isInteger(qty) || qty < 1 || qty > 99) {
          return fail(state, '数量必须是 1–99 的整数。');
        }
        if(exceedsLimit(item.itemId,qty,item.id))return fail(state,limitReason());
        item.qty = qty;
        events.push({ type: 'ITEM_QTY_UPDATED', orderItemId: item.id, qty });
        return ok(state, events);
      }

      case 'UPDATE_ITEM':
      case 'UPDATE_ITEM_OPTIONS': {
        const item = findItem(state, action.orderItemId);
        if (!item) return fail(state, `订单项「${action.orderItemId}」不存在。`);
        if (item.status === ITEM_STATUS.SERVED) {
          return fail(state, `「${item.name}」已经上菜，不能再修改选项。`);
        }
        if (type === 'UPDATE_ITEM' && (!Number.isInteger(action.qty) || action.qty < 1 || action.qty > 99)) {
          return fail(state, '数量必须是 1–99 的整数。');
        }
        if(type==='UPDATE_ITEM'&&exceedsLimit(item.itemId,action.qty,item.id))return fail(state,limitReason());
        const menuItem = getMenuItem(item.itemId);
        const patch = action.options;
        if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) {
          return fail(state, 'options 必须是对象，且只需包含要修改的选项。');
        }
        // 部分更新：先校验合并结果，再写回；只改传入的选项，其余信息保留
        const merged = { ...item.options, ...patch };
        const resolved = resolveOptions(menuItem, merged);
        if (!resolved.ok) return fail(state, resolved.reason);
        item.options = resolved.options;
        events.push({
          type: 'ITEM_OPTIONS_UPDATED',
          orderItemId: item.id,
          changed: Object.keys(patch),
          options: { ...item.options },
        });
        if (type === 'UPDATE_ITEM') {
          item.qty = action.qty;
          events.push({ type: 'ITEM_QTY_UPDATED', orderItemId: item.id, qty: item.qty });
        }
        return ok(state, events);
      }

      case 'CANCEL_ITEM': {
        const item = findItem(state, action.orderItemId);
        if (!item) return fail(state, `订单项「${action.orderItemId}」不存在。`);
        if (item.status === ITEM_STATUS.SERVED) {
          return fail(state, `「${item.name}」已经上菜，不能取消。`);
        }
        state.items = state.items.filter((it) => it.id !== item.id);
        events.push({ type: 'ITEM_CANCELLED', orderItemId: item.id, itemId: item.itemId });
        return ok(state, events);
      }

      case 'CONFIRM_ORDER': {
        const pending = state.items.filter((it) => it.status === ITEM_STATUS.PENDING);
        if (pending.length === 0) {
          if (state.items.length === 0) {
            return fail(state, '订单为空，请先添加商品再确认。');
          }
          // 幂等：重复确认同一订单，不新增商品、不改变金额、不重复计费
          events.push({ type: 'ORDER_CONFIRM_NOOP', message: '没有待确认的新商品，订单保持不变。' });
          return ok(state, events);
        }
        for (const item of pending) item.status = ITEM_STATUS.CONFIRMED;
        state.waiterPresent = true; // 服务员收单
        events.push({
          type: 'ORDER_CONFIRMED',
          orderItemIds: pending.map((it) => it.id),
          isAdditional: state.phase === P.DINING,
        });
        if (state.phase === P.ORDERING) {
          const err = transition(state, P.DINING, events);
          if (err) return err;
        }
        return ok(state, events);
      }

      case 'MARK_SERVED': {
        let targets;
        if (action.orderItemId !== undefined) {
          const item = findItem(state, action.orderItemId);
          if (!item) return fail(state, `订单项「${action.orderItemId}」不存在。`);
          if (item.status === ITEM_STATUS.PENDING) {
            return fail(state, `「${item.name}」尚未确认订单，请先确认再上菜。`);
          }
          targets = [item];
        } else {
          targets = state.items.filter((it) => it.status === ITEM_STATUS.CONFIRMED);
        }
        const freshlyServed = targets.filter((it) => it.status === ITEM_STATUS.CONFIRMED);
        if (freshlyServed.length === 0) {
          events.push({ type: 'SERVE_NOOP', message: '没有等待上菜的商品。' });
          return ok(state, events);
        }
        for (const item of freshlyServed) item.status = ITEM_STATUS.SERVED;
        state.waiterPresent = true; // 服务员送餐到桌
        events.push({ type: 'WAITER_APPROACH', reason: 'serving' });
        events.push({ type: 'ITEMS_SERVED', orderItemIds: freshlyServed.map((it) => it.id) });
        return ok(state, events);
      }

      case 'REQUEST_WATER': {
        state.waiterPresent = true;
        events.push({ type: 'WAITER_APPROACH', reason: 'water' });
        events.push({ type: 'WATER_REFILLED' });
        return ok(state, events);
      }

      case 'REQUEST_UTENSILS': {
        state.waiterPresent = true;
        events.push({ type: 'WAITER_APPROACH', reason: 'utensils' });
        events.push({ type: 'UTENSILS_PROVIDED' });
        return ok(state, events);
      }

      case 'CALL_WAITER': {
        state.waiterPresent = true;
        events.push({ type: 'WAITER_APPROACH', reason: 'called' });
        return ok(state, events);
      }

      case 'WAITER_LEAVE': {
        // 视觉层在收单 / 送餐 / 加水 / 递餐具等动画完成后调用。
        // 幂等：服务员本就不在场时不产生离开事件，避免重复播放离场动画。
        if (!state.waiterPresent) {
          events.push({ type: 'WAITER_LEAVE_NOOP', message: '服务员已不在场，无需再次离开。' });
          return ok(state, events);
        }
        state.waiterPresent = false;
        events.push({ type: 'WAITER_LEFT' });
        return ok(state, events);
      }

      case 'REQUEST_BILL': {
        if (state.items.some((it) => it.status === ITEM_STATUS.PENDING)) {
          return fail(state, '还有未确认的商品，请先确认订单或取消后再结账。');
        }
        if (state.bill === null) {
          // 从实际订单计算金额；已出示账单后重复请求直接返回同一账单（幂等）
          state.bill = calculateBill(state);
          const err = transition(state, P.BILLING, events);
          if (err) return err;
          state.waiterPresent = true;
          events.push({ type: 'WAITER_APPROACH', reason: 'bill' });
          events.push({ type: 'BILL_PRESENTED', bill: clone(state.bill) });
          return ok(state, events);
        }
        events.push({ type: 'BILL_PRESENTED', bill: clone(state.bill) });
        return ok(state, events);
      }

      case 'PAY_BILL': {
        if (state.bill === null) return fail(state, '尚未出示账单，请先请求结账。');
        if (state.isPaid) {
          events.push({ type: 'PAYMENT_NOOP', message: '本单已完成支付。' });
          return ok(state, events);
        }
        if (action.amountCents !== undefined && action.amountCents !== state.bill.totalCents) {
          return fail(
            state,
            `支付金额不符：应付 ${state.bill.totalCents} 分，实付 ${action.amountCents} 分。`,
          );
        }
        state.isPaid = true;
        state.waiterPresent = false;
        events.push({ type: 'PAYMENT_COMPLETED', totalCents: state.bill.totalCents, method: 'virtual' });
        return ok(state, events);
      }

      case 'LEAVE': {
        if (!state.isPaid) {
          return fail(state, '尚未完成虚拟结账，不能离店。');
        }
        const err = transition(state, P.FINISHED, events);
        if (err) return err;
        state.waiterPresent = false;
        events.push({ type: 'GUEST_LEFT' });
        return ok(state, events);
      }

      default:
        return fail(state, `未处理的动作类型「${type}」。`);
    }
  }

  return { getState, dispatch };
}
