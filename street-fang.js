// STREET-FANG-01：芳姐柜台的合法站位与取件单核对入口。
// 纯逻辑：只判断站位、维护一次会话，并把显式递交交给调用方
// onAction('fang','shop-check')；不新增业态状态、对白或物品变更。

import {optionsFor} from './neighborhood-state.js';

// 芳姐模型位置与柜台前的合法站位（米坐标）。
// 矩形只覆盖店内柜台一侧；同时要求离芳姐模型不超过 2.05 米。
const FANG_MODEL={x:16.31,z:1.2};
const COUNTER_AREA={minX:16.15,maxX:17.05,minZ:-0.58,maxZ:-0.32,maxDistance:2.05};

const isObject=value=>typeof value==='object'&&value!==null&&!Array.isArray(value);

// 站位判定：{x,z} 米坐标，边界值算合法；非有限值、越界或离芳姐过远都不合法。
// 只做纯计算，不读取也不推测玩家状态。
export function atFangCounter(position){
 if(!isObject(position))return false;
 const {x,z}=position;
 if(typeof x!=='number'||typeof z!=='number')return false;
 if(!Number.isFinite(x)||!Number.isFinite(z))return false;
 if(x<COUNTER_AREA.minX||x>COUNTER_AREA.maxX)return false;
 if(z<COUNTER_AREA.minZ||z>COUNTER_AREA.maxZ)return false;
 return Math.hypot(x-FANG_MODEL.x,z-FANG_MODEL.z)<=COUNTER_AREA.maxDistance;
}

function requireCallback(options,name){
 if(typeof options[name]!=='function')throw new TypeError(name+' 必须是函数');
 return options[name];
}

// 读取当前站位；回调抛错、非对象或非法站位都按“不在柜台”处理。
function readPosition(getPosition){
 let position;
 try{position=getPosition();}catch{return null;}
 return atFangCounter(position)?{x:position.x,z:position.z}:null;
}

function worldOffersShopCheck(world){
 if(!isObject(world))return null;
 try{return optionsFor(world,'fang').some(option=>option&&option.id==='shop-check');}
 catch{return false;}
}

export function createFangCounter(options={}){
 if(!isObject(options))throw new TypeError('options 必须是对象');
 const getPosition=requireCallback(options,'getPosition');
 const getWorld=requireCallback(options,'getWorld');
 const onAction=requireCallback(options,'onAction');
 const onOpen=requireCallback(options,'onOpen');

 let sessionOpen=false;   // 当前是否已开启与芳姐的会话
 let accepted=false;      // 本实例是否已成功递交过，防止连点或重复触发
 let submitting=false;    // 递交进行中，避免回调重入造成重复执行

 // 首次进入合法站位才开启会话：执行 onOpen('fang') 并返回 true。
 // 已开启、不在合法站位或 onOpen 前就失败都返回 false；此方法从不执行递交动作。
 function open(){
  if(sessionOpen)return false;
  if(readPosition(getPosition)===null)return false;
  // 先占住会话再回调，避免 onOpen 重入时重复开会话；回调失败则回滚。
  sessionOpen=true;
  try{onOpen('fang');}
  catch(error){sessionOpen=false;throw error;}
  return true;
 }

 // 显式递交取件单：仅在会话已打开、仍处合法站位、且当前 optionsFor 确实
 // 提供 shop-check 时，才调用 onAction('fang','shop-check') 并透传其结果。
 // 其余情况一律拒绝，且不改变世界状态。
 function handTicket(){
  if(!sessionOpen)return {ok:false,message:'尚未与芳姐开始核对取件单。'};
  if(accepted)return {ok:false,message:'这张取件单已经核对过了。'};
  if(submitting)return {ok:false,message:'正在核对取件单，请稍候。'};
  if(readPosition(getPosition)===null)return {ok:false,message:'请走近芳姐柜台再递交取件单。'};

  let world;
  try{world=getWorld();}catch{world=null;}
  if(!isObject(world))return {ok:false,message:'暂时无法读取当前进度，请稍后再试。'};

  const offers=worldOffersShopCheck(world);
  if(!offers){
   // 遗留存档早已核对过 shop-check，或手上根本没有取件单：同样诚实拒绝。
   const checked=Array.isArray(world.flags)&&world.flags.includes('shop-check');
   return {ok:false,message:checked?'这张取件单已经核对过了。':'现在没有可以递交的取件单。'};
  }

  submitting=true;
  let result;
  let failure='';
  try{result=onAction('fang','shop-check');}
  catch{failure='递交取件单时出错，请稍后再试。';}
  finally{submitting=false;}
  if(failure)return {ok:false,message:failure};
  if(!isObject(result))return {ok:false,message:'取件单核对没有返回结果，请稍后再试。'};
  // 只透传，不合并、不改写规则结果；只有接受成功才封住后续重复执行。
  if(result.ok===true)accepted=true;
  return result;
 }

 // 清理会话。已接受的递交记录保留，避免关闭再打开后重复执行。
 function close(){sessionOpen=false;}

 return {open,close,handTicket};
}
