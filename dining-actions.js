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
    const options = item && item.options && typeof item.options === "object"
      ? item.options
      : {};
    const itemId = item ? item.itemId : undefined;
    const serving = typeof options.serving === "string"
      ? options.serving.toLowerCase()
      : options.serving;
    const isTakeaway = TAKEAWAY_SERVINGS.has(serving);
    const isPacked = Boolean(
      isTakeaway || options.packed === true || options.isPacked === true,
    );
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

  return { takeBite, inspect };
}

export default createDining;
