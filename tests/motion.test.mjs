import assert from 'node:assert/strict';
// Geometry is shared by Canvas rendering and these invariants; no image decoding in Node.
globalThis.Image=class {decode(){return Promise.resolve();}};
const {waiterPlacement,serviceGeometry,walkProgress}=await import('../scene.js');
for(const camera of ['entrance','walk','room']){
 const beat={pose:'approach',start:1000,duration:4200};
 const end=waiterPlacement({camera,beat},5200);
 const idle=waiterPlacement({camera},5200);
 const depart=waiterPlacement({camera,beat:{...beat,pose:'depart'}},1000);
 for(const key of ['x','feet','scale']){
  assert.equal(end[key],idle[key],`${camera}: arrival must equal idle ${key}`);
  assert.equal(depart[key],idle[key],`${camera}: departure must start at idle ${key}`);
 }
}
for(let t=0;t<=4200;t+=100){
 const p=waiterPlacement({camera:'room',beat:{pose:'approach',start:0,duration:4200}},t);
 assert.ok(p.x>=570&&p.x<=625,'feet remain inside the aisle');
 assert.ok(p.feet>=325&&p.feet<=444,'feet remain behind the table edge');
 assert.ok(p.feet-380*p.scale>95,'closer waiter keeps his head inside the scene');
}
assert.deepEqual(waiterPlacement({camera:'entrance'}),waiterPlacement({camera:'walk'}));
console.log('PASS motion geometry: arrival/idle/departure continuity, aisle bounds, headroom and seating camera');
assert.equal(walkProgress(0),0);assert.equal(walkProgress(1),1);
const increments=[.2,.3,.4,.5,.6,.7].map(t=>walkProgress(t+.1)-walkProgress(t));
assert.ok(Math.max(...increments)-Math.min(...increments)<1e-10,'mid-stride speed stays steady');
assert.ok(walkProgress(.02)<walkProgress(.52)-walkProgress(.5),'start eases into steady walk');
for(const camera of ['table','room']){
 const water={camera,water:false,beat:{pose:'place',kind:'REQUEST_WATER',start:0,duration:4800}};
 const start=serviceGeometry(water,0),pour=serviceGeometry(water,2600),end=serviceGeometry(water,4700);
 assert.equal(start.stream,false);assert.equal(start.fill,0);
 assert.equal(pour.stream,true);assert.equal(pour.spout.x,pour.cup.x);
 assert.equal(pour.spout.y,pour.cup.rim-30);assert.ok(pour.fill>0&&pour.fill<1);
 assert.equal(end.stream,false);assert.equal(end.fill,1);
 const utensils=serviceGeometry({camera,beat:{pose:'place',kind:'REQUEST_UTENSILS',start:0,duration:3200}},2000);
 assert.equal(utensils.offset.x,0);assert.equal(utensils.grip.x,utensils.utensils.x+25);
 const committed=serviceGeometry({camera,water:true},0);assert.equal(committed.fill,1);
}
console.log('PASS service geometry: water starts after reach, stream ends at cup, fill persists, utensil grip matches landing');
