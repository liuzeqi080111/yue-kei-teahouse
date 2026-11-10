// Tone and usage references: https://lshk.org/jyutping-scheme/
// https://words.hk/zidin/喇 ; https://words.hk/zidin/位 ; https://words.hk/zidin/菠蘿油
// 前 12 条复制自 FEEDBACK-03-DATA-attempt-1/phrases.reviewed.mjs。
export const PHRASES = [
  {
    id: 'one-person',
    cantonese: '一位呀，唔該。',
    meaning: '一位，麻烦你。',
    jyutping: 'jat1 wai2 aa3, m4 goi1.',
    parts: ['一位呀', '唔該'],
    words: [
      { word: '一位', meaning: '一位（用餐人数）' },
      { word: '唔該', meaning: '麻烦你；劳驾' },
    ],
  },
  {
    id: 'read-menu',
    cantonese: '唔該，我想睇吓餐牌。',
    meaning: '麻烦你，我想看一下菜单。',
    jyutping: 'm4 goi1, ngo5 soeng2 tai2 haa5 caan3 paai4.',
    parts: ['唔該', '我想睇吓餐牌'],
    words: [
      { word: '唔該', meaning: '麻烦你；劳驾' },
      { word: '我', meaning: '我' },
      { word: '想', meaning: '想' },
      { word: '睇吓', meaning: '看一下' },
      { word: '餐牌', meaning: '菜单' },
    ],
  },
  {
    id: 'order-iced-milk-tea-less-sweet',
    cantonese: '唔該，我要一杯凍絲襪奶茶，少甜。',
    meaning: '麻烦你，我要一杯冰丝袜奶茶，少糖。',
    jyutping: 'm4 goi1, ngo5 jiu3 jat1 bui1 dung3 si1 mat6 naai5 caa4, siu2 tim4.',
    parts: ['唔該', '我要一杯凍絲襪奶茶', '少甜'],
    words: [
      { word: '唔該', meaning: '麻烦你；劳驾' },
      { word: '我', meaning: '我' },
      { word: '要', meaning: '要' },
      { word: '一杯', meaning: '一杯' },
      { word: '凍', meaning: '冰的（饮品温度）' },
      { word: '絲襪奶茶', meaning: '丝袜奶茶' },
      { word: '少甜', meaning: '少糖' },
    ],
  },
  {
    id: 'order-pineapple-bun',
    cantonese: '唔該，我要一個菠蘿油。',
    meaning: '麻烦你，我要一个菠萝油。',
    jyutping: 'm4 goi1, ngo5 jiu3 jat1 go3 bo1 lo4 jau4.',
    parts: ['唔該', '我要一個菠蘿油'],
    words: [
      { word: '唔該', meaning: '麻烦你；劳驾' },
      { word: '我', meaning: '我' },
      { word: '要', meaning: '要' },
      { word: '一個', meaning: '一个' },
      { word: '菠蘿油', meaning: '夹了一片黄油的港式菠萝包' },
    ],
  },
  {
    id: 'confirm-order',
    cantonese: '唔該，就咁落單。',
    meaning: '麻烦你，就这样下单。',
    jyutping: 'm4 goi1, zau6 gam2 lok6 daan1.',
    parts: ['唔該', '就咁落單'],
    words: [
      { word: '唔該', meaning: '麻烦你；劳驾' },
      { word: '就咁', meaning: '就这样' },
      { word: '落單', meaning: '下单' },
    ],
  },
  {
    id: 'request-water',
    cantonese: '唔該，幫我加啲水。',
    meaning: '麻烦你，帮我加一点水。',
    jyutping: 'm4 goi1, bong1 ngo5 gaa1 di1 seoi2.',
    parts: ['唔該', '幫我加啲水'],
    words: [
      { word: '唔該', meaning: '麻烦你；劳驾' },
      { word: '幫', meaning: '帮；替我' },
      { word: '我', meaning: '我' },
      { word: '加', meaning: '添加' },
      { word: '啲', meaning: '一点' },
      { word: '水', meaning: '水' },
    ],
  },
  {
    id: 'request-utensils',
    cantonese: '唔該，攞套餐具畀我。',
    meaning: '麻烦你，拿一套餐具给我。',
    jyutping: 'm4 goi1, lo2 tou3 caan3 geoi6 bei2 ngo5.',
    parts: ['唔該', '攞套餐具畀我'],
    words: [
      { word: '唔該', meaning: '麻烦你；劳驾' },
      { word: '攞', meaning: '拿' },
      { word: '套', meaning: '套（量词）' },
      { word: '餐具', meaning: '餐具' },
      { word: '畀', meaning: '给' },
      { word: '我', meaning: '我' },
    ],
  },
  {
    id: 'speak-slower',
    cantonese: '唔該，可唔可以講慢啲？',
    meaning: '麻烦你，可以说慢一点吗？',
    jyutping: 'm4 goi1, ho2 m4 ho2 ji5 gong2 maan6 di1?',
    parts: ['唔該', '可唔可以講慢啲'],
    words: [
      { word: '唔該', meaning: '麻烦你；劳驾' },
      { word: '可唔可以', meaning: '可不可以' },
      { word: '講', meaning: '说' },
      { word: '慢', meaning: '慢' },
      { word: '啲', meaning: '一点（表示比较）' },
    ],
  },
  {
    id: 'delicious',
    cantonese: '真係好好味！',
    meaning: '真的很好吃！',
    jyutping: 'zan1 hai6 hou2 hou2 mei6!',
    parts: ['真係', '好好味'],
    words: [
      { word: '真係', meaning: '真的；真是' },
      { word: '好好味', meaning: '很好吃；味道很好' },
    ],
  },
  {
    id: 'finished-eating',
    cantonese: '我食完喇。',
    meaning: '我吃完了。',
    jyutping: 'ngo5 sik6 jyun4 laa3.',
    parts: ['我食完喇'],
    words: [
      { word: '我', meaning: '我' },
      { word: '食完', meaning: '吃完' },
      { word: '喇', meaning: '了（句末语气词）' },
    ],
  },
  {
    id: 'request-bill',
    cantonese: '唔該，埋單。',
    meaning: '麻烦你，结账。',
    jyutping: 'm4 goi1, maai4 daan1.',
    parts: ['唔該', '埋單'],
    words: [
      { word: '唔該', meaning: '麻烦你；劳驾' },
      { word: '埋單', meaning: '结账' },
    ],
  },
  {
    id: 'thanks',
    cantonese: '多謝晒！',
    meaning: '非常感谢！',
    jyutping: 'do1 ze6 saai3!',
    parts: ['多謝晒'],
    words: [
      { word: '多謝', meaning: '感谢；谢谢' },
      { word: '晒', meaning: '加强谢意，相当于“非常”' },
    ],
  },
  // 以下阶段补充句及动态替换读音尚未经独立语言校对。
  {
    id: 'follow-seat',
    cantonese: '好呀，唔該你。',
    meaning: '好呀，麻烦你。',
    jyutping: 'hou2 aa3, m4 goi1 nei5.',
    parts: ['好呀', '唔該你'],
    words: [
      { word: '好呀', meaning: '好呀' },
      { word: '唔該你', meaning: '麻烦你；谢谢你' },
    ],
    needsReview: true,
  },
  {
    id: 'check-bill',
    cantonese: '唔該，我想睇吓張單。',
    meaning: '麻烦你，我想看一下账单。',
    jyutping: 'm4 goi1, ngo5 soeng2 tai2 haa5 zoeng1 daan1.',
    parts: ['唔該', '我想睇吓張單'],
    words: [
      { word: '唔該', meaning: '麻烦你；劳驾' },
      { word: '我', meaning: '我' },
      { word: '想', meaning: '想' },
      { word: '睇吓', meaning: '看一下' },
      { word: '張單', meaning: '账单' },
    ],
    needsReview: true,
  },
  {
    id: 'delicious-drink',
    cantonese: '真係好好飲！',
    meaning: '真的很好喝！',
    jyutping: 'zan1 hai6 hou2 hou2 jam2!',
    parts: ['真係', '好好飲'],
    words: [
      { word: '真係', meaning: '真的；真是' },
      { word: '好好飲', meaning: '很好喝' },
    ],
    needsReview: true,
  },
  {
    id: 'finished-drinking',
    cantonese: '我飲晒喇。',
    meaning: '我喝完了。',
    jyutping: 'ngo5 jam2 saai3 laa3.',
    parts: ['我飲晒喇'],
    words: [
      { word: '我', meaning: '我' },
      { word: '飲晒', meaning: '喝完' },
      { word: '喇', meaning: '了（句末语气词）' },
    ],
    needsReview: true,
  },
];

const PHRASE_BY_ID = new Map(PHRASES.map(phrase => [phrase.id, phrase]));
export function getPhrase(id) {
  return PHRASE_BY_ID.get(id);
}

const ITEM_LANGUAGE = {
  'food-pineapple-bun': { jyutping: 'bo1 lo4 jau4', meaning: '菠萝油', wordMeaning: '夹了一片黄油的港式菠萝包', amount: '一個', amountJyutping: 'jat1 go3', amountMeaning: '一个' },
  'food-charsiu-rice': { jyutping: 'caa1 siu1 faan6', meaning: '叉烧饭', amount: '一份', amountJyutping: 'jat1 fan6', amountMeaning: '一份' },
  'food-wonton-noodle': { jyutping: 'wan4 tan1 min6', meaning: '云吞面', amount: '一份', amountJyutping: 'jat1 fan6', amountMeaning: '一份' },
  'food-egg-sandwich': { jyutping: 'daan6 zi6', meaning: '鸡蛋三明治', amount: '一份', amountJyutping: 'jat1 fan6', amountMeaning: '一份' },
  'food-french-toast': { jyutping: 'sai1 do1 si6', meaning: '港式西多士', amount: '一份', amountJyutping: 'jat1 fan6', amountMeaning: '一份' },
  'drink-lemon-tea': { jyutping: 'ning4 caa4', meaning: '柠檬茶', amount: '一杯', amountJyutping: 'jat1 bui1', amountMeaning: '一杯' },
  'drink-milk-tea': { jyutping: 'si1 mat6 naai5 caa4', meaning: '丝袜奶茶', amount: '一杯', amountJyutping: 'jat1 bui1', amountMeaning: '一杯' },
  'drink-yuanyang': { jyutping: 'jyun1 joeng1', meaning: '鸳鸯（咖啡混合奶茶）', amount: '一杯', amountJyutping: 'jat1 bui1', amountMeaning: '一杯' },
  'drink-horlicks': { jyutping: 'hou2 lap6 hak1', meaning: '好立克（麦芽奶饮品）', amount: '一杯', amountJyutping: 'jat1 bui1', amountMeaning: '一杯' },
};

const OPTION_LANGUAGE = {
  temperature: {
    '凍': { id: 'cold', jyutping: 'dung3', meaning: '冰', wordMeaning: '冰的（饮品温度）', include: true },
    '熱': { id: 'hot', jyutping: 'jit6', meaning: '热', wordMeaning: '热的（饮品温度）', include: true },
  },
  sweetness: {
    '正常甜': { id: 'normal-sweet', jyutping: 'zing3 soeng4 tim4', meaning: '正常甜度', include: true },
    '少甜': { id: 'less-sweet', jyutping: 'siu2 tim4', meaning: '少糖', include: true },
    '走甜': { id: 'no-sugar', jyutping: 'zau2 tim4', meaning: '不要糖', include: true },
  },
  serving: {
    '即食': { id: 'dine-in', jyutping: 'zik1 sik6', meaning: '堂食', include: false },
    '外賣': { id: 'takeaway', jyutping: 'ngoi6 maai6', meaning: '外卖', include: true },
  },
  rice: {
    '正常飯': { id: 'normal-rice', jyutping: 'zing3 soeng4 faan6', meaning: '正常饭量', include: false },
    '少飯': { id: 'less-rice', jyutping: 'siu2 faan6', meaning: '少饭', include: true },
    '加飯': { id: 'extra-rice', jyutping: 'gaa1 faan6', meaning: '加饭', include: true },
  },
  noodle: {
    '幼麵': { id: 'thin-noodle', jyutping: 'jau3 min6', meaning: '细面', include: false },
    '粗麵': { id: 'thick-noodle', jyutping: 'cou1 min6', meaning: '粗面', include: true },
  },
  soup: {
    '正常湯': { id: 'normal-soup', jyutping: 'zing3 soeng4 tong1', meaning: '正常汤量', include: false },
    '走湯': { id: 'no-soup', jyutping: 'zau2 tong1', meaning: '不要汤', include: true },
  },
  bread: {
    '烘底': { id: 'toasted', jyutping: 'hung1 dai2', meaning: '烘底', include: false },
    '唔烘': { id: 'untoasted', jyutping: 'm4 hung1', meaning: '不烘底', include: true },
  },
  syrup: {
    '正常糖漿': { id: 'normal-syrup', jyutping: 'zing3 soeng4 tong4 zoeng1', meaning: '正常糖浆', include: false },
    '少糖漿': { id: 'less-syrup', jyutping: 'siu2 tong4 zoeng1', meaning: '少糖浆', include: true },
    '走糖漿': { id: 'no-syrup', jyutping: 'zau2 tong4 zoeng1', meaning: '不要糖浆', include: true },
  },
};

/**
 * 只为菜单实际供应的项目及其合法规格造句；遇到未知或非法组合时返回 null。
 * 两条已校对原句直接复用，其余动态读音标为 needsReview，不在模型台词上猜测。
 */
export function buildOrderPhrase(item, requested = {}) {
  if (!item?.available || !ITEM_LANGUAGE[item.id] || !requested || typeof requested !== 'object' || Array.isArray(requested)) return null;
  const allowedOptions = item.options || {};
  if (Object.keys(requested).some(key => !Object.prototype.hasOwnProperty.call(allowedOptions, key))) return null;
  const selections = [];
  for (const [key, allowed] of Object.entries(allowedOptions)) {
    const value = Object.prototype.hasOwnProperty.call(requested, key) ? requested[key] : item.defaults?.[key];
    const language = OPTION_LANGUAGE[key]?.[value];
    if (!allowed.includes(value) || !language) return null;
    selections.push({ key, value, ...language });
  }
  const values = Object.fromEntries(selections.map(selection => [selection.key, selection.value]));
  if (item.id === 'drink-milk-tea' && values.temperature === '凍' && values.sweetness === '少甜') return getPhrase('order-iced-milk-tea-less-sweet');
  if (item.id === 'food-pineapple-bun' && values.serving === '即食') return getPhrase('order-pineapple-bun');

  const language = ITEM_LANGUAGE[item.id];
  const drink = item.category === 'drink';
  const temperature = selections.find(selection => selection.key === 'temperature');
  const included = selections.filter(selection => selection.include);
  const tail = included.filter(selection => selection.key !== 'temperature');
  const orderText = `我要${language.amount}${drink && temperature ? temperature.value : ''}${item.name}`;
  const orderMeaning = `我要${language.amountMeaning}${drink && temperature ? temperature.meaning : ''}${language.meaning}`;
  const orderJyutping = `ngo5 jiu3 ${language.amountJyutping} ${drink && temperature ? `${temperature.jyutping} ` : ''}${language.jyutping}`;
  const cantoneseParts = [orderText, ...tail.map(selection => selection.value)];
  const meaningParts = [orderMeaning, ...tail.map(selection => selection.meaning)];
  const jyutpingParts = [orderJyutping, ...tail.map(selection => selection.jyutping)];
  const words = [
    { word: '唔該', meaning: '麻烦你；劳驾' },
    { word: '我', meaning: '我' },
    { word: '要', meaning: '要' },
    { word: language.amount, meaning: language.amountMeaning },
  ];
  if (drink && temperature) words.push({ word: temperature.value, meaning: temperature.wordMeaning || temperature.meaning });
  words.push({ word: item.name, meaning: language.wordMeaning || language.meaning });
  for (const selection of tail) words.push({ word: selection.value, meaning: selection.wordMeaning || selection.meaning });
  const suffix = selections.map(selection => selection.id).join('-') || 'default';
  return {
    id: `order-${item.id}-${suffix}`,
    cantonese: `唔該，${cantoneseParts.join('，')}。`,
    meaning: `麻烦你，${meaningParts.join('，')}。`,
    jyutping: `m4 goi1, ${jyutpingParts.join(', ')}.`,
    parts: ['唔該', ...cantoneseParts],
    words,
    needsReview: true,
  };
}
