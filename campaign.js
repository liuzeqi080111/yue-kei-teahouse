import {chapterCompleted,chapterSaveKey,readChapter} from './story-chapters.js';
import {loadWorld,saveWorld} from './neighborhood-state.js';

// Record the destination date before applying it. Refreshing between the two
// writes can safely finish the change without advancing a second time.
export function applyChapterDay(storage){
 const table=readChapter(storage,'table');
 if(!chapterCompleted('table',table))return null;
 const world=loadWorld(storage);
 if(world.error)throw Error(world.error);
 let day=table.reunionDay;
 if(!Number.isSafeInteger(day)||day<1){
  const marker=world.state.flags.find(flag=>flag.startsWith('table-next-day-'));
  const recorded=marker&&Number(marker.slice('table-next-day-'.length));
  day=Number.isSafeInteger(recorded)&&recorded>0?recorded:world.state.day+1;
  storage.setItem(chapterSaveKey('table'),JSON.stringify({...table,reunionDay:day}));
 }
 if(world.state.day<day){
  const result=saveWorld(storage,{...world.state,day,period:0,flags:[...world.state.flags,'table-next-day-'+day],revision:world.state.revision+1,trackedQuest:'reunion'});
  if(!result.ok)throw Error(result.error);
 }
 return day;
}
