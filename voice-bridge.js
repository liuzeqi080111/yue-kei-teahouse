/**
 * P2-C1 语音意图桥接：校验模型提案并唯一经由 game.action 执行。
 * 纯 JS、不碰 DOM；业务权威为 session.js/controller.js，模型自由文本不得宣称动作成功。
 */
import {MENU, getMenuItem, resolveOptions} from './teahouse-scene/menu.js';
import {PHASES as P} from './teahouse-scene/session.js';

const DECISIONS = new Set(['execute', 'clarify', 'reply', 'reject']);
const ORDER_TYPES = new Set(['ADD_ITEM', 'UPDATE_ITEM', 'CANCEL_ITEM']);
const FORBIDDEN = new Set(['RESTART', 'MARK_SERVED', 'SIT_DOWN', 'LEAVE']);
const money = (n) => 'HK$' + (n / 100).toFixed(2);
const REPLIES = {
  ENTER: ['你好呀，一位？入嚟坐吖。', '你好，一位吗？进来坐吧。'],
  START_SEATING: ['呢邊吖，跟住我嚟窗口位。', '这边请，跟我到靠窗的座位。'],
  OPEN_MENU: ['餐牌喺度，慢慢睇，睇啱話我知。', '菜单在这里，慢慢看，选好告诉我。'],
  CALL_WAITER: ['嚟喇，有咩可以幫到你？', '来了，有什么可以帮你？'],
  REQUEST_WATER: ['好，即刻幫你加水。', '好，马上帮你加水。'],
  REQUEST_UTENSILS: ['好，即刻攞餐具畀你。', '好，马上拿餐具给你。'],
  WAITER_LEAVE: ['好，有事再嗌我。', '好，有事再叫我。'],
  CONTINUE_ORDER: ['好，你慢慢揀，我喺旁邊等。', '好，你慢慢选，我在旁边等。'],
  CONFIRM_ORDER: ['仲要唔要啲嘢？齊嘅話，我就幫你落單。', '还要别的吗？选好了我就帮你下单。'],
  FINISH_ORDER: ['好，而家幫你落單，請稍等。', '好，现在帮你下单，请稍等。'],
};

export function createVoiceBridge({ game } = {}) {
  if (!game || typeof game.snapshot !== 'function' || typeof game.action !== 'function') {
    throw new TypeError('createVoiceBridge 需要带 snapshot/action 的 game');
  }
  let pendingQuestion = null, history = [];
  const snap = () => game.snapshot();
  const bad = (reply) => ({ ok: false, reply });
  const text = (v) => (typeof v === 'string' ? v.slice(0, 200) : '');

  /** token：仅业务状态 + orderReview + busy；摄像机/notice 变化不作废。 */
  function token() {
    const { state, view } = snap();
    return JSON.stringify([state, view.orderReview, view.busy]);
  }
  let memoryToken=token();
  function refreshMemory(){
    const current=token();
    if(current!==memoryToken){pendingQuestion=null;history=[];memoryToken=current;}
  }

  /** 阶段合法动作表，与 session.ACTION_PHASES 及 controller 两步落单一致；billing 不能加水/餐具。 */
  function allowedActions(state, view) {
    if (view.busy) return [];
    const items = state.items, pending = items.some((i) => i.status === 'pending');
    const editable = items.some((i) => i.status !== 'served');
    switch (state.phase) {
      case P.OUTSIDE: return ['ENTER'];
      case P.GREETING: return ['START_SEATING'];
      case P.SEATING: return [];
      case P.SEATED:
        return ['OPEN_MENU', 'CALL_WAITER', 'REQUEST_WATER', 'REQUEST_UTENSILS', 'WAITER_LEAVE'];
      case P.ORDERING: case P.DINING: {
        if (view.orderReview) return ['FINISH_ORDER', 'CONTINUE_ORDER'];
        const list = ['OPEN_MENU', 'CALL_WAITER', 'REQUEST_WATER', 'REQUEST_UTENSILS', 'WAITER_LEAVE', 'ADD_ITEM'];
        if (editable) list.push('UPDATE_ITEM', 'CANCEL_ITEM');
        if (pending) list.push('CONFIRM_ORDER');
        if (state.phase === P.DINING && !pending) list.push('REQUEST_BILL');
        return list;
      }
      case P.BILLING: {
        if (state.isPaid) return [];
        const list = ['REQUEST_BILL', 'WAITER_LEAVE'];
        if (state.billPresented) list.push('PAY_BILL');
        return list;
      }
      default: return [];
    }
  }

  function context() {
    refreshMemory();
    const { state, view } = snap();
    return {
      menu: MENU, state, orderReview: view.orderReview,
      allowedActions: allowedActions(state, view),
      pendingQuestion, history: history.slice(-6),
    };
  }

  /** 订单增删改整批预检：在克隆 items 上按序应用，任何一项非法则整批不下发。 */
  function precheckOrder(intents, items) {
    const clone = items.map((i) => ({ ...i, options: { ...i.options } }));
    for (const it of intents) {
      if(it.options!==undefined && (it.options===null || typeof it.options!=='object' || Array.isArray(it.options))) return bad('規格格式唔啱，麻煩再講一次。');
      if (it.type === 'ADD_ITEM') {
        const menuItem = getMenuItem(it.itemId);
        if (!menuItem) return bad('菜單冇呢款嘢，麻煩再講一次。');
        if (!menuItem.available) return bad(`「${menuItem.name}」今日賣晒，揀過另一款吖。`);
        if (it.qty !== undefined && it.qty !== 1) return bad('每款餐點本局限一份，唔可以兩份。');
        if (clone.some((l) => l.itemId === menuItem.id)) return bad(`每款限一份，${menuItem.name}已經喺訂單度，想轉規格話我知。`);
        const resolved = resolveOptions(menuItem, it.options ?? {});
        if (!resolved.ok) return bad(`「${menuItem.name}」冇呢個規格，請用餐牌上嘅選項。`);
        clone.push({ id: 'preview-' + clone.length, itemId: menuItem.id, name: menuItem.name, qty: 1, options: resolved.options, status: 'pending', unitPrice: menuItem.price });
      } else {
        const line = clone.find((l) => l.id === it.orderItemId);
        if (!line || line.id.startsWith('preview-')) return bad('搵唔到要改嘅餐點，請講清楚邊一款。');
        if (line.status === 'served') return bad(`「${line.name}」已經上枱，唔可以再改或者取消。`);
        if (it.type === 'CANCEL_ITEM') { clone.splice(clone.indexOf(line), 1); continue; }
        if (it.qty !== undefined && it.qty !== 1) return bad('每款餐點本局限一份，數量唔可以改。');
        const menuItem = getMenuItem(line.itemId);
        const resolved = resolveOptions(menuItem, { ...line.options, ...(it.options ?? {}) });
        if (!resolved.ok) return bad(`「${line.name}」冇呢個規格，請用餐牌上嘅選項。`);
        line.options = resolved.options; line.qty = 1;
      }
    }
    return null; // 全部通过
  }

  function apply(proposal, tk) {
    refreshMemory();
    const { state, view } = snap();
    if (view.busy) return bad('侍應正在服務，請稍等一陣。');
    if (typeof tk !== 'string' || tk !== token()) return bad('啱啱狀態有更新，麻煩再講一次。');
    if (!proposal || typeof proposal !== 'object' || Array.isArray(proposal)) return bad('提案格式唔啱，請再試一次。');
    if (!DECISIONS.has(proposal.decision)) return bad('提案決策唔合法，請再試一次。');
    const intents = proposal.intents === undefined ? [] : proposal.intents;
    if (!Array.isArray(intents) || intents.length > 4) return bad('提案意圖數量唔合法。');
    const record = (npcText) => {
      if (text(proposal.playerText)) history.push({ role: 'player', text: text(proposal.playerText) });
      history.push({ role: 'npc', text: npcText });
      history = history.slice(-6);
    };

    if (proposal.decision !== 'execute') {
      if (intents.length) return bad('非執行決策唔可以帶動作。');
      const reply = text(proposal.reply) || (proposal.decision === 'clarify' ? text(proposal.question) : '') || '唔好意思，可唔可以再講一次？';
      pendingQuestion = proposal.decision === 'clarify' ? { question: text(proposal.question) || reply } : null;
      record(reply);
      return { ok: true, reply, meaning: text(proposal.meaning), executed: [] };
    }

    if (!intents.length) return bad('冇可執行嘅動作。');
    const allowed = new Set(allowedActions(state, view));
    const isOrderBatch = intents.every((it) => it && ORDER_TYPES.has(it.type));
    if (!isOrderBatch && intents.length !== 1) return bad('呢個動作要單獨講，唔可以同其他動作一齊。');
    for (const it of intents) {
      if (!it || typeof it !== 'object' || Array.isArray(it) || typeof it.type !== 'string') return bad('提案意圖格式唔啱。');
      if (FORBIDDEN.has(it.type)) return bad('呢個動作唔可以由語音觸發。');
      if (!allowed.has(it.type)) return bad('而家呢個階段做唔到呢個操作。');
      if (it.amountCents !== undefined && it.type !== 'PAY_BILL') return bad('金額唔可以由語音指定。');
    }

    if (isOrderBatch) {
      const failure = precheckOrder(intents, state.items);
      if (failure) return failure; // 整批不执行，状态不变
    } else {
      const it = intents[0];
      if (it.type === 'CONFIRM_ORDER' && (view.orderReview || !state.items.some((i) => i.status === 'pending'))) return bad('而家未有需要確認嘅餐點。');
      if ((it.type === 'FINISH_ORDER' || it.type === 'CONTINUE_ORDER') && !view.orderReview) return bad('要先用「確認落單」問過阿明先。');
      if (it.type === 'REQUEST_BILL' && state.items.some((i) => i.status === 'pending')) return bad('仲有餐點未確認，落單或取消之後先可以埋單。');
      if (it.type === 'PAY_BILL' && (!state.billPresented || state.isPaid || !state.bill)) return bad('而家未可以付款，請先核對帳單。');
    }

    const executed = [], names = [];
    let reply = '', meaning = '';
    for (const it of intents) {
      let r;
      if (it.type === 'OPEN_MENU' && [P.ORDERING, P.DINING].includes(state.phase)) {
        game.camera('menu'); r = { ok: true, events: [] }; // 已打开过菜单：仅视图切换
      } else {
        const extra = {};
        if (it.type === 'ADD_ITEM') { extra.itemId = it.itemId; extra.qty = 1; extra.options = it.options ?? {}; }
        if (it.type === 'UPDATE_ITEM') { extra.orderItemId = it.orderItemId; extra.qty = 1; extra.options = it.options ?? {}; }
        if (it.type === 'CANCEL_ITEM') extra.orderItemId = it.orderItemId;
        if (it.type === 'PAY_BILL') extra.amountCents = state.bill.totalCents; // 金额强制来自当前账单
        r = game.action(it.type, extra);
      }
      if (!r || !r.ok) return bad('而家做唔到呢個操作，請檢查訂單再試一次。');
      executed.push(it.type);
      const line = it.orderItemId ? state.items.find((l) => l.id === it.orderItemId) : null;
      const menuItem = it.itemId ? getMenuItem(it.itemId) : null;
      if (menuItem || line) names.push((menuItem || line).name);
      if (REPLIES[it.type]) [reply, meaning] = REPLIES[it.type];
      if (it.type === 'REQUEST_BILL' && r.state?.bill) {
        reply = `呢張係你張單，合共 ${money(r.state.bill.totalCents)}，未收錢，核對清楚話我知先至付款。`;
        meaning = `这是你的账单，合计 ${money(r.state.bill.totalCents)}，尚未付款，核对后再告诉我付款。`;
      }
      if (it.type === 'PAY_BILL') {
        const paid = r.events?.some((e) => e.type === 'PAYMENT_COMPLETED');
        reply = paid ? '收妥喇，多謝晒！慢行呀。' : '呢張單已經畀咗錢，唔使再畀。';
        meaning = paid ? '已收妥，谢谢，慢走。' : '这张单已付款，无需重复支付。';
      }
      if (it.type === 'FINISH_ORDER' && r.events?.some((e) => e.type === 'ORDER_CONFIRM_NOOP')) { reply = '冇新餐點要落單。'; meaning = '没有新餐点需要下单。'; }
    }
    if (names.length && executed.includes('ADD_ITEM')) { reply = `記低咗：${names.join('、')}，仲未落單，確認先至送去廚房。`; meaning = `已记下：${names.join('、')}，还未下单，确认后才送厨房。`; }
    else if (names.length && executed.includes('UPDATE_ITEM')) { reply = `改好喇：${names.join('、')}，未落單前仲可以改。`; meaning = `已修改：${names.join('、')}，下单前还可以再改。`; }
    else if (names.length && executed.includes('CANCEL_ITEM')) { reply = `取消咗：${names.join('、')}。`; meaning = `已取消：${names.join('、')}。`; }

    if (token() !== tk) { pendingQuestion = null; history = []; } // 任何业务变化/重开/动画完成使旧上下文作废
    record(reply);
    memoryToken=token();
    return { ok: true, reply, meaning, executed };
  }

  return { context, token, apply };
}
