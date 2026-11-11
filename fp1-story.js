// FP1-STORY-02: pure-logic story state machine with verbatim story copy.

const COPY = {
  home: ['老朋友', '走吧，陪你下楼转转。', '和朋友一起出门', [['start', '走吧']]],
  meeting: ['阿晴', '我听日要见工，洗衣店俾错咗件褛我。你哋可唔可以陪我去问吓？', '决定要不要陪阿晴去洗衣店', [['accept', '陪她去问问'], ['defer', '先不出发']]],
  deferred: ['老朋友', '行，你慢慢看。准备好了我们再出发。', '准备好后出发去洗衣店', [['accept', '出发去洗衣店']]],
  street: ['老朋友', '前面就是芳姐的洗衣店。等会儿先拿单子问清楚，唔使急。', '陪阿晴去洗衣店核对外套', []],
  door: ['老朋友', '到啦。你拿着取件单，我们进去。', '进入芳姐洗衣店', [['enter', '进店']]],
  approach: ['', '', '走到柜台前', []],
  counter: ['芳姐', '你有冇带张取件单嚟呀？', '把取件单交给芳姐', [['handTicket', '递上取件单']]],
  choice: ['芳姐', '我睇过张单，可能系两位客人攞反咗件褛。', '决定怎样帮阿晴', [['recover', '先找回原来的外套'], ['borrow', '先借一件应急'], ['buy', '先买一件新的']]],
  recover: ['老朋友', '下一步去茶餐厅问阿明，找那位客人一起核对袖口。', '已选：找回原来的外套', []],
  borrow: ['老朋友', '下一步去找玲姐借一件。穿完要记得还。', '已选：借一件应急', []],
  buy: ['老朋友', '下一步陪阿晴去玲姐的摊位问价。阿晴自己付钱，洗衣店的误会还没说清。', '已选：买一件新的', []],
};

const NEXT = {
  home: { start: 'meeting' },
  meeting: { accept: 'street', defer: 'deferred' },
  deferred: { accept: 'street' },
  street: { arriveStreet: 'door' },
  door: { enter: 'approach' },
  approach: { arriveCounter: 'counter' },
  counter: { handTicket: 'choice' },
  choice: { recover: 'end', borrow: 'end', buy: 'end' },
};

export function createFp1Story() {
  let phase = 'home';
  let revision = 0;
  let route = null;

  function snapshot() {
    const [speaker, text, goal, choices] = COPY[phase === 'end' ? route : phase];
    return {
      phase,
      revision,
      goal,
      speaker,
      text,
      choices: choices.map(([id, label]) => ({ id, label })),
      route,
    };
  }

  function act(id) {
    if (typeof id !== 'string') return false;
    const map = NEXT[phase];
    if (!map || !Object.prototype.hasOwnProperty.call(map, id)) return false;

    const next = map[id];
    if (phase === 'choice') route = id;
    phase = next;
    revision += 1;
    return true;
  }

  function reset() {
    phase = 'home';
    route = null;
    revision += 1;
    return snapshot();
  }

  return { snapshot, act, reset };
}
