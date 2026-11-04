/**
 * 茶餐厅场景逻辑模块入口。
 *
 * 用法：
 *   import { createSession, MENU } from './teahouse-scene/index.js';
 *   const session = createSession();
 *   session.dispatch({ type: 'ENTER' });
 *   console.log(session.getState());
 */

export { createSession, PHASES, ITEM_STATUS } from './session.js';
export { MENU, getMenuItem } from './menu.js';
