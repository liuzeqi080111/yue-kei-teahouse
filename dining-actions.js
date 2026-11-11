import { PHASES } from './teahouse-scene/index.js';

const BITES_PER_ITEM = 3;
const TAKEAWAY_SERVINGS = new Set([
  "takeaway",
  "takeout",
  "take-away",
  "外賣",
  "外卖",
  "外帶",
  "外带",
]);

function isRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value, keys) {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function isPackedItem(item) {
  const options = item && item.options && typeof item.options === "object" ? item.options : {};
  const serving = typeof options.serving === "string" ? options.serving.toLowerCase() : options.serving;
  return Boolean(TAKEAWAY_SERVINGS.has(serving) || options.packed === true || options.isPacked === true);
}

/**
 * 创建独立的用餐逻辑。订单与快照只读，份量仅保存在当前回合的内部状态中。
 *
 * takeBite(orderId, expectedRound) 返回 { ok, ...inspect(orderId) }。
 * inspect(orderId) 不修改份量，并返回 UI 所需的剩余量与可消费状态。
 */
export function createDining({ getSnapshot }) {
  if (typeof getSnapshot !== "function") {
    throw new TypeError("createDining requires getSnapshot to be a function");
  }

  let activeRound;
  let hasActiveRound = false;
  const portions = new Map();

  function syncRound(round) {
    if (!hasActiveRound || !Object.is(round, activeRound)) {
      portions.clear();
      activeRound = round;
      hasActiveRound = true;
    }
  }

  function describe(state, view, orderId, item, expectedRound, checkRound) {
    const itemId = item ? item.itemId : undefined;
    const isPacked = isPackedItem(item);
    const isDrink = Boolean(
      item && typeof itemId === "string" && itemId.startsWith("drink-"),
    );
    const found = Boolean(item);
    const remaining = found
      ? (Object.is(activeRound, state.round) ? portions.get(orderId) ?? BITES_PER_ITEM : BITES_PER_ITEM)
      : 0;

    let reason = null;
    if (checkRound && !Object.is(state.round, expectedRound)) {
      reason = "stale_round";
    } else if (!found) {
      reason = "not_found";
    } else if (state.phase !== PHASES.DINING) {
      reason = "not_dining";
    } else if (view.busy) {
      reason = "busy";
    } else if (state.isPaid) {
      reason = "paid";
    } else if (item.status !== "served") {
      reason = "not_served";
    } else if (isPacked) {
      reason = "takeaway";
    } else if (remaining === 0) {
      reason = "empty";
    }

    return {
      orderId,
      itemId,
      round: state.round,
      found,
      remaining,
      bitesRemaining: remaining,
      isDrink,
      isFood: found && !isDrink,
      isPacked,
      canConsume: reason === null,
      reason,
    };
  }

  function read(orderId, expectedRound, checkRound) {
    const snapshot = getSnapshot();
    const state = snapshot && snapshot.state ? snapshot.state : {};
    const view = snapshot && snapshot.view ? snapshot.view : {};
    const items = Array.isArray(state.items) ? state.items : [];

    const item = items.find((candidate) => candidate && candidate.id === orderId);
    return { state, view, item, details: describe(
      state,
      view,
      orderId,
      item,
      expectedRound,
      checkRound,
    ) };
  }

  function inspect(orderId) {
    return read(orderId, undefined, false).details;
  }

  function takeBite(orderId, expectedRound) {
    const { state, view, item, details } = read(orderId, expectedRound, true);
    if (!details.canConsume) {
      return { ok: false, ...details };
    }

    syncRound(state.round);
    portions.set(orderId, Math.max(0, details.remaining - 1));
    return {
      ok: true,
      ...describe(state, view, orderId, item, expectedRound, true),
    };
  }

  /** 导出当前回合所有可食用已上菜行的剩余量；外卖不占用餐份量。 */
  function exportState() {
    const snapshot = getSnapshot();
    const state = snapshot && snapshot.state ? snapshot.state : {};
    const view = snapshot && snapshot.view ? snapshot.view : {};
    const items = Array.isArray(state.items) ? state.items : [];
    syncRound(state.round);
    const savedPortions = [];
    for (const item of items) {
      if (!item || item.status !== "served" || isPackedItem(item)) continue;
      const details = describe(state, view, item.id, item, undefined, false);
      savedPortions.push({ orderId: item.id, remaining: details.remaining });
    }
    return { round: state.round, portions: savedPortions };
  }

  /**
   * 原子恢复份量。条目必须对应当前回合、已上菜且非外卖的有效订单行。
   * 未列出的有效行保持默认三口；任何失败都不会清空或改写旧份量。
   */
  function restoreState(saved) {
    const failure = (reason) => ({ ok: false, reason });
    const snapshot = getSnapshot();
    const state = snapshot && snapshot.state ? snapshot.state : {};
    const items = Array.isArray(state.items) ? state.items : [];
    if (!isRecord(saved) || !hasExactKeys(saved, ["round", "portions"]) ||
        !Number.isSafeInteger(saved.round) || saved.round < 0 || !Array.isArray(saved.portions)) {
      return failure("invalid_snapshot");
    }
    if (!Object.is(saved.round, state.round)) return failure("stale_round");

    const next = new Map();
    for (const entry of saved.portions) {
      if (!isRecord(entry) || !hasExactKeys(entry, ["orderId", "remaining"]) ||
          typeof entry.orderId !== "string" || !Number.isInteger(entry.remaining) ||
          entry.remaining < 0 || entry.remaining > BITES_PER_ITEM) {
        return failure("invalid_portion");
      }
      if (next.has(entry.orderId)) return failure("duplicate_order");
      const item = items.find((candidate) => candidate && candidate.id === entry.orderId);
      if (!item) return failure("not_found");
      if (item.status !== "served") return failure("not_served");
      if (isPackedItem(item)) return failure("takeaway");
      next.set(entry.orderId, entry.remaining);
    }

    portions.clear();
    for (const [orderId, remaining] of next) portions.set(orderId, remaining);
    activeRound = saved.round;
    hasActiveRound = true;
    return { ok: true, state: exportState(), reason: null };
  }

  return {
    takeBite,
    inspect,
    exportState,
    restoreState,
    exportSnapshot: exportState,
    restoreSnapshot: restoreState,
  };
}

export default createDining;
