/**
 * 茶餐厅演示菜单。
 *
 * 注意：本菜单属于一家虚构餐厅，价格仅为演示用途，不代表任何真实商户。
 * 所有价格以「港币分」存储（整数），避免浮点计算误差。例如 2200 = HK$22.00。
 *
 * 每个商品字段：
 * - id: 稳定商品 ID（字符串，不随名称调整而变化）
 * - name: 繁体中文名称
 * - category: 'food' | 'drink'
 * - price: 单价（港币分）
 * - available: 是否可供应（false 时下单会被拒绝）
 * - options: 实际允许的选项定义，键为选项名，值为允许取值数组；顺序即默认展示顺序
 * - defaults: 各选项的默认值（下单未指定时使用）
 */

/**
 * 递归深度冻结：外层数组、每个商品对象、options 及其取值数组、defaults
 * 全部不可变，防止外部调用方（包括其他会话）污染价格、可供应状态等共享数据。
 * ES Module 处于严格模式，对冻结对象的写入会抛出 TypeError，而非静默失败。
 */
function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
}

export const MENU = deepFreeze([
  // ---------- 6 种食物 ----------
  {
    id: 'food-pineapple-bun',
    name: '菠蘿油',
    category: 'food',
    price: 1800,
    available: true,
    options: { serving: ['即食', '外賣'] },
    defaults: { serving: '即食' },
  },
  {
    id: 'food-charsiu-rice',
    name: '叉燒飯',
    category: 'food',
    price: 5800,
    available: true,
    options: { rice: ['正常飯', '少飯', '加飯'] },
    defaults: { rice: '正常飯' },
  },
  {
    id: 'food-wonton-noodle',
    name: '雲吞麵',
    category: 'food',
    price: 4800,
    available: true,
    options: { noodle: ['幼麵', '粗麵'], soup: ['正常湯', '走湯'] },
    defaults: { noodle: '幼麵', soup: '正常湯' },
  },
  {
    id: 'food-egg-sandwich',
    name: '蛋治',
    category: 'food',
    price: 2600,
    available: true,
    options: { bread: ['烘底', '唔烘'] },
    defaults: { bread: '烘底' },
  },
  {
    id: 'food-french-toast',
    name: '西多士',
    category: 'food',
    price: 3200,
    available: true,
    options: { syrup: ['正常糖漿', '少糖漿', '走糖漿'] },
    defaults: { syrup: '正常糖漿' },
  },
  {
    id: 'food-curry-fishball',
    name: '咖喱魚蛋',
    category: 'food',
    price: 2800,
    available: false, // 演示「售罄」：下单会被拒绝
    options: { spicy: ['正常辣', '加辣'] },
    defaults: { spicy: '正常辣' },
  },

  // ---------- 4 种饮品 ----------
  {
    id: 'drink-lemon-tea',
    name: '檸茶',
    category: 'drink',
    price: 2200,
    available: true,
    options: {
      temperature: ['凍', '熱'],
      sweetness: ['正常甜', '少甜', '走甜'],
    },
    defaults: { temperature: '熱', sweetness: '正常甜' },
  },
  {
    id: 'drink-milk-tea',
    name: '絲襪奶茶',
    category: 'drink',
    price: 2400,
    available: true,
    options: {
      temperature: ['凍', '熱'],
      sweetness: ['正常甜', '少甜', '走甜'],
    },
    defaults: { temperature: '熱', sweetness: '正常甜' },
  },
  {
    id: 'drink-yuanyang',
    name: '鴛鴦',
    category: 'drink',
    price: 2500,
    available: true,
    options: {
      temperature: ['凍', '熱'],
      sweetness: ['正常甜', '少甜', '走甜'],
    },
    defaults: { temperature: '熱', sweetness: '正常甜' },
  },
  {
    id: 'drink-horlicks',
    name: '好立克',
    category: 'drink',
    price: 2300,
    available: true,
    options: { temperature: ['凍', '熱'] }, // 好立克不提供甜度选项
    defaults: { temperature: '熱' },
  },
]);

const menuIndex = new Map(MENU.map((item) => [item.id, item]));

/**
 * 按 ID 查询商品；未找到返回 undefined。
 * 返回的是深度冻结的共享对象：可安全读取，任何写入都会在严格模式下抛错，
 * 不会影响菜单本身或其他会话。
 */
export function getMenuItem(itemId) {
  return menuIndex.get(itemId);
}

/**
 * 校验并补全选项。
 * @returns {{ ok: true, options: object } | {{ ok: false, reason: string }}
 */
export function resolveOptions(menuItem, requested = {}) {
  if (requested === null || typeof requested !== 'object' || Array.isArray(requested)) {
    return { ok: false, reason: '选项必须是对象，例如 { temperature: "凍", sweetness: "少甜" }。' };
  }
  const allowed = menuItem.options ?? {};
  for (const key of Object.keys(requested)) {
    if (!Object.prototype.hasOwnProperty.call(allowed, key)) {
      return { ok: false, reason: `「${menuItem.name}」没有「${key}」这个选项。` };
    }
    if (!allowed[key].includes(requested[key])) {
      return {
        ok: false,
        reason: `「${menuItem.name}」的「${key}」不允许取值「${requested[key]}」，可选：${allowed[key].join('、')}。`,
      };
    }
  }
  return { ok: true, options: { ...menuItem.defaults, ...requested } };
}
