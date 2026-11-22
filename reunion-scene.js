import {barSeconds} from './nanyin-practice.js';
import {createReunionWall} from './reunion-wall.js';
import * as T from 'three';

export function createReunionScene({scene,camera,cast,group,box,cyl,part,sphere,print,texture,actor,shot,portraitLean,portraitArm}){
 const table=group();
 table.position.set(2.09,.952,-1.55);
 const plate=group(table);
 cyl(plate,0x487867,0,.006,0,.36,.012,.30);
 cyl(plate,0xf6e9cb,0,.014,0,.341,.012,.283);
 // Dried oysters on a bed of fat choy, with greens around the rim.
 const strandMaterial=new T.MeshStandardMaterial({color:0x2b2419,roughness:.57});
 for(let i=0;i<90;i++){
  const a=i*2.39996,r=.118*Math.sqrt((i+.3)/90),x=Math.cos(a)*r,z=Math.sin(a)*r*.76;
  const knots=Array.from({length:9},(_,j)=>{
   const k=j/8,angle=a+k*4.2;
   return new T.Vector3(x+.018*Math.cos(angle)+.019*(k-.5),.048+.017*(1-r/.118)+.003*Math.sin(angle*2),z+.008*Math.sin(angle));
  });
  plate.add(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(knots),10,.0016,4,false),strandMaterial));
 }
 for(let i=0;i<8;i++){
  const angle=i*.785,r=.085+(i%3)*.006;
  const leaf=part(plate,sphere,0x597832,.133*Math.cos(angle),.029,.100*Math.sin(angle),.057,.019,.028);
  leaf.rotation.y=-angle;
  const flesh=new T.SphereGeometry(.5,16,10),points=flesh.attributes.position;
  for(let k=0;k<points.count;k++){
   const x=points.getX(k),y=points.getY(k),z=points.getZ(k);
   points.setXYZ(k,x+.13*Math.sin(z*5+i)*(.55-y),y*(1+.16*Math.cos(5*x+i)),z*(.9+.32*x));
  }
  flesh.computeVertexNormals();
  const oyster=part(plate,flesh,i%2?0x975c33:0xad7141,r*Math.cos(angle),.049,r*.78*Math.sin(angle),.071,.047,.052);
  oyster.rotation.y=-angle+.37;
 }
 const lid=group(table);
 part(lid,new T.SphereGeometry(1,44,20,0,Math.PI*2,0,Math.PI/2),0xc6b393,0,.019,0,.183,.102,.154);
 cyl(lid,0xa57b49,0,.019,0,.372,.013,.315);
 part(lid,sphere,0x695136,0,.132,0,.042,.031,.042);
 for(const [x,z] of [[-.09,.19],[.10,-.20]]){
  cyl(table,0xf1e4c4,x,.032,z,.06,.06,.06);cyl(table,0xa16b3d,x,.063,z,.051,.002,.051);
 }
 const showWall=createReunionWall(scene);
 // The red paper and lanterns frame the bench where the group gathers.
 const greetings=group();
 const paper=texture((c,w,h)=>{c.fillStyle='#a53324';c.fillRect(0,0,w,h);c.strokeStyle='#d8ad62';c.lineWidth=4;c.strokeRect(7,7,w-14,h-14);c.fillStyle='#f8db9f';c.font='bold 73px KaiTi,serif';c.textAlign='center';[...'新春大吉'].forEach((s,i)=>c.fillText(s,w/2,80+i*91));},120,384);
 const wallPaper=print(greetings,paper,3.55,1.87,-.72,.23,.74);wallPaper.rotation.y=-Math.PI/2;
 for(const [x,z] of [[-.8,-3.02],[.5,-3.84],[2.4,-3.30]]){
  const lamp=group(greetings);lamp.position.set(x,2.66,z);
  cyl(lamp,0xb68b48,0,.31,0,.01,.44,.01);
  part(lamp,sphere,0xbb3625,0,0,0,.30,.27,.30);
  for(const y of [-.11,.11])cyl(lamp,0xc3954c,0,y,0,.18,.025,.18);
  cyl(lamp,0xf5bf67,0,-.193,0,.019,.14,.019);
 }
 const oranges=group();oranges.position.set(-.77,1.291,-2.11);
 cyl(oranges,0xebe2bd,0,0,0,.23,.01,.20);
 for(const [x,z] of [[-.05,0],[.045,-.014],[.021,.045]])part(oranges,sphere,0xd98227,x,.026,z,.070,.054,.069);
 const orange=part(cast.aming.bones.RightHand,sphere,0xe68c29,.01,.035,.025,.038,.042,.043);

 const boards=group(camera);scene.add(camera);
 boards.position.set(.145,-.084,-.47);boards.rotation.set(.08,-.32,-.22);
 const slat=group(boards);
 for(const [p,x] of [[boards,0],[slat,.023]]){
  box(p,0x9b6139,x,0,0,.028,.15,.012);
  for(const y of [-.053,-.047])box(p,0x8d2822,x,y,.001,.03,.005,.014);
 }
 let lastStrike=-1e5;
 function strike(){lastStrike=performance.now();}
 function groupPose(candid){
  const back=.14,front=.60,face=Math.PI/2;
  actor('master',back,.19,-1.43,face+.25);
  actor('fang',front,.19,-1.88,face+.12);
  actor('regular',back,.19,-2.32,face+.10);
  actor('player',front,.19,-2.73,face);
  actor('friend',back,.19,-3.15,face-.12);
  actor('aming',front,.19,-3.61,face-.20);
  orange.visible=candid;
  if(candid){
   portraitLean('aming',.16,-.39);portraitLean('player',-.11,-.30);
   portraitLean('fang',-.09,.30);portraitLean('friend',.14,.30);
   portraitArm('aming','Right',[-.28,-.45,.35],[.37,.87,.39],[.15,.72,.30]);
   portraitArm('friend','Right',[-.4,-.45,.24],[-.18,.87,.27],[-.12,.9,.10]);
  }
  shot([3.17,1.68,-2.61],[.31,1.38,-2.54],42);
 }
 function stage(id,state){
  const wall=['tidy','laugh'].includes(id);
  const afterDinner=['gather','call','ready','proof','snapTidy','snapLaugh'].includes(id);
  oranges.visible=afterDinner&&!wall;orange.visible=false;showWall(wall?state.photo:null);boards.visible=id==='riddle'||id==='gather';
  table.visible=!wall&&!afterDinner&&id!=='join';
  lid.visible=['riddle','guess','goose','right','dish'].includes(id);lid.position.set(0,0,0);
  if(wall){
   shot([1.50,1.78,-1.62],[3.56,1.76,-1.66],42);
  }else if(['snapTidy','snapLaugh','proof'].includes(id)){
   groupPose(id==='snapLaugh');
  }else if(afterDinner){
   actor('master',.22,.19,-1.60,1.9);actor('fang',.35,.19,-2.26,1.6);
   actor('friend',.18,.19,-3.12,1.42);
   actor('aming',id==='ready'?.63:-.32,.19,id==='ready'?-3.55:-3.21,id==='ready'?1.42:-1.24);
   shot([2.76,1.59,-2.69],[.29,1.48,-2.48],57);
  }else{
   actor('fang',1.61,.19,-1.21,1.55,true);actor('regular',1.61,.19,-1.83,1.53,true);
   actor('master',2.65,.19,-1.84,-1.57,true);
   actor('aming',2.21,.19,-2.46,.03);
   shot([2.34,1.53,-.68],[1.65,1.34,-1.32],54);
   if(id==='riddle')shot([1.72,1.49,-1.15],[2.62,1.32,-1.81],50);
   if(['guess','right','goose'].includes(id))shot([2.04,1.53,-.92],[2.17,1.33,-2.24],55);
   if(id==='dish')shot([2.12,1.52,-1.01],[2.09,.98,-1.54],44);
  }
 }
 function tick(now,entered,mode,playhead){
  if(boards.visible){
   const performer=cast.master,arm=performer.bones.LeftForeArm;
   arm.quaternion.copy(performer.neutral.LeftForeArm);
   if(playhead>=0){
    const phase=playhead%barSeconds/barSeconds;
    const lift=phase>.73?(phase-.73)/.27:Math.max(0,1-phase/.10);
    arm.rotateX(-.49*lift);performer.bones.Head.rotateX(.056*Math.cos(phase*2*Math.PI));
   }
  }
  slat.rotation.z=-.24+.20*Math.max(0,1-(now-lastStrike)/180);
  if(mode==='dish'){
   const t=T.MathUtils.smootherstep((now-entered)/850,0,1);lid.position.set(-.26*t,.18*t,0);lid.rotation.z=t*.6;lid.visible=t<.99;
  }else lid.rotation.z=0;
 }
 function hit(ray,mode){
  if(boards.visible&&ray.intersectObject(boards,true).length)return 'beat';
  if(['right','goose'].includes(mode)&&ray.intersectObject(lid,true).length)return 'lid';
  return null;
 }
 return {stage,tick,strike,hit};
}
