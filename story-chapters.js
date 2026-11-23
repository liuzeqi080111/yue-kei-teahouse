import {reunion} from './story-reunion.js';
export const chapters={
 reunion,
 table:{
  title:'今晚搭张台',start:'door',other:'reunion',nodes:{
   door:['friend','这回你来开口？咱俩刚住进旅馆，我也想认几个以后能打招呼的人。','',[['唔該，兩位，可以搭枱嗎？','ask']]],
   ask:['aming','兩位呀？窗口周生嗰張枱仲有位，不如你哋問吓佢。','两位？窗边周先生那桌还有位置，你们可以问问他。',[['周先生，介唔介意一齊坐？','seat']]],
   seat:['regular','梗係得啦，我收埋份報紙。你朋友都坐吖。','当然行，我把报纸收起来。你朋友也坐呀。',[['坐下，点杯热奶茶','tea'],['坐下，点杯冻柠茶','lemon']]],
   tea:['aming','熱奶茶，少甜。記住喇。','热奶茶，少甜，记住了。',[['听听邻桌在说什么','arrive']]],
   lemon:['aming','凍檸茶，少冰。記住喇。','冻柠茶，少冰，记住了。',[['听听邻桌在说什么','arrive']]],
   arrive:['lin','芳姐，今日又買走呀？我飲完喇，呢個位留畀你哋。','芳姐，今天又要打包？我喝完了，这个位置留给你们。',[['芳姐，坐低一齊食啦！','invite'],['给她留一杯热茶带走','takeaway']]],
   invite:['fang','真係有位？咁我今晚坐低食。阿明，唔使外賣盒喇。','真有位置？那我今晚坐下吃。阿明，用不着打包盒了。',[['阿明，唔該加多對筷子','supper']]],
   takeaway:['fang','今晚要返去交衫，杯茶我拎走。聽日預埋我個位，好唔好？','今晚还要回去交衣服，茶我带走。明天给我留个位，好吗？',[['得，聽日預埋你','supper']]],
   supper:['regular','我聽朝都坐窗口。你哋經過就入嚟，一齊飲杯茶吖。','我明早也坐窗边。你们路过就进来，一起喝杯茶吧。',[['好，聽朝見。吃完出门','farewell']]],
   farewell:['friend','刚来时咱们还在找两把空椅子。这下好了，明早经过，还能跟周叔喝杯茶。','',[['第二天经过粤记','morning']]],
   morning:['aming',null,'',[]]
  }
 }
};
export const chapterSaveKey=id=>'yuekei-story-trial-v1:'+id;
export function readChapter(storage,id){
 try{return JSON.parse(storage.getItem(chapterSaveKey(id)));}catch{return null;}
}
export function chapterCompleted(id,save){
 const node=chapters[id]?.nodes[save?.node];
 return save?.completed===true||Array.isArray(node)&&node[3].length===0;
}
export const voices={master:'lam',friend:'intro',aqing:'qing',regular:'guest',aming:'ming',fang:'fang',ale:'lok',ling:'ling',lin:'lam'};
export const names={master:'南音师傅',friend:'同行朋友',aqing:'阿晴',regular:'周叔',aming:'阿明',fang:'芳姐',ale:'阿乐',ling:'玲姐',lin:'林伯'};
export function morning(drink){return drink==='lemon'?['又嚟喇？凍檸茶少冰，仲係窗口位，啱唔啱？','又来了？冻柠茶少冰，还是窗边，对吧？']:['又嚟喇？熱奶茶少甜，仲係窗口位，啱唔啱？','又来了？热奶茶少甜，还是窗边，对吧？'];}
