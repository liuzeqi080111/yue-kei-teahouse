import assert from 'node:assert/strict';
import {
 SIZE,GRID,ROADS,PLACES,STALL_OBSTACLE,
 walkable,nearestRoad,nearestPlace,entryPosition,findPath,moveSafely
} from '../neighborhood-map.js';

assert.equal(SIZE,1536);
assert.equal(PLACES.length,5,'first batch exposes exactly five places');
assert.deepEqual(new Set(PLACES.map(place=>place.id)),new Set(['restaurant','market','home','laundry','rest']));
assert.ok(ROADS.length>=5,'two vertical streets, two cross streets and the rest-area spur');

for(const place of PLACES){
 assert.ok(walkable(place.x,place.y),`${place.id} entrance is on a road`);
 assert.deepEqual(entryPosition(place.id),{x:place.x,y:place.y});
 assert.equal(nearestPlace({x:place.x,y:place.y})?.id,place.id);
}
assert.equal(nearestPlace({x:760,y:760}),null,'distant scenery has no active interaction');
assert.equal(entryPosition('missing'),null);

for(const start of PLACES)for(const end of PLACES){
 const path=findPath(start,end);
 assert.ok(path.length>0,`${start.id} reaches ${end.id}`);
 for(let index=0;index<path.length;index++){
  const point=path[index];
  assert.ok(walkable(point.x,point.y),`${start.id} → ${end.id}: every node is legal`);
  assert.equal(point.x%GRID,0,'x stays on the collision grid');
  assert.equal(point.y%GRID,0,'y stays on the collision grid');
  if(index)assert.equal(Math.abs(point.x-path[index-1].x)+Math.abs(point.y-path[index-1].y),GRID,'path uses safe cardinal steps');
 }
}

const blocked={x:420,y:980};
assert.equal(walkable(blocked.x,blocked.y),true);
assert.equal(walkable(blocked.x,blocked.y,true),false,'the stall is a real obstacle when present');
assert.equal(walkable(520,980,true),true,'space remains beside the stall');
const detour=findPath({x:400,y:920},{x:400,y:1060},true);
assert.ok(detour.length>0,'a click path can go around the stall');
assert.ok(detour.every(point=>walkable(point.x,point.y,true)),'detour never crosses the stall');
assert.ok(detour.some(point=>point.x>STALL_OBSTACLE.x+STALL_OBSTACLE.w),'detour uses the open side of the street');
assert.deepEqual(findPath({x:NaN,y:0},{x:400,y:500}),[],'invalid coordinates cannot create a path');

for(const point of [{x:-500,y:-500},{x:2000,y:2000},{x:760,y:760}]){
 const snapped=nearestRoad(point);
 assert.ok(snapped&&walkable(snapped.x,snapped.y),'nearestRoad always returns a legal grid point');
}
const stopped=moveSafely({x:520,y:940},-160,80,true);
assert.ok(walkable(stopped.x,stopped.y,true),'swept movement cannot end inside an obstacle');
assert.ok(stopped.x!==360||stopped.y!==1020,'large movement does not tunnel through the stall');
assert.deepEqual(moveSafely({x:400,y:560},Infinity,0),{x:400,y:560},'non-finite movement is ignored');

console.log('PASS OW1 map: five entrances, connected loop, legal paths, stall collision and swept movement');
