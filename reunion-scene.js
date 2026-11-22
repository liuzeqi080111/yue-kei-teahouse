import {createPlayerMeal} from './reunion-player-meal.js';
import {createReunionBoards} from './reunion-boards.js';
import {createReunionWall} from './reunion-wall.js';
import * as T from 'three';
import {handFrame,positionChopsticks,applyChopstickGrip,fingerContact,registerSkinPads,stringContact} from './reunion-hand-poses.js';

export function createReunionScene({scene,camera,cast,group,box,cyl,part,sphere,print,texture,actor,placeHand,shot,portraitLean,portraitArm}){
 for(const id of ['regular','aming','master','player'])registerSkinPads(cast[id]);
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
 const feast=group(table);
 function platter(parent,x,z,width,depth){
  const dish=group(parent);dish.position.set(x,0,z);
  for(const [color,y,m] of [[0xd4c7a7,.006,.84],[0x567976,.014,1],[0xf7efdc,.019,.97]]){
   cyl(dish,color,0,y,0,width*m,.009,depth*m);
  }
  return dish;
 }
 function bowl(parent,x,z,size,filling){
  const crock=group(parent);crock.position.set(x,0,z);
  const profile=[[0,.02],[.27,.02],[.34,.19],[.48,.35],[.5,.43],[.47,.44],[.43,.38],[.31,.23],[0,.23]];
  part(crock,new T.LatheGeometry(profile.map(([r,y])=>new T.Vector2(r,y)),28),0xf1e6d1,0,0,0,size,size,size);
  const rim=new T.LatheGeometry([new T.Vector2(.490,.385),new T.Vector2(.497,.409)],28);
  part(crock,rim,0x417378,0,0,0,size,size,size);
  if(filling!==null){
   const liquid=filling===0xa96d36;
   cyl(crock,filling,0,size*(liquid?.365:.406),0,size*(liquid?.846:.89),size*.006,size*(liquid?.846:.89));
  }
  return crock;
 }
 const fish=platter(feast,0,-.19,.46,.22);
 part(fish,sphere,0x52301e,0,.024,0,.401,.006,.163);
 const profile=[[-.167,.004],[-.158,.018],[-.139,.032],[-.109,.044],[-.067,.054],[-.02,.057],[.035,.049],[.077,.035],[.11,.020],[.132,.009]];
 const flank=new T.LatheGeometry(profile.map(([x,r])=>new T.Vector2(r,x)),32);
 flank.rotateZ(-Math.PI/2);
 const colors=[],positions=flank.attributes.position;
 for(let i=0;i<positions.count;i++){
  const x=positions.getX(i),z=positions.getZ(i);
  const shade=T.MathUtils.smoothstep(z,-.04,.048);
  const c=new T.Color(0x637064).lerp(new T.Color(0xcfbf97),shade);
  if(x<-.104)c.multiplyScalar(.88);
  colors.push(c.r,c.g,c.b);
 }
 flank.setAttribute('color',new T.Float32BufferAttribute(colors,3));
 const whole=new T.Mesh(flank,new T.MeshStandardMaterial({vertexColors:true,roughness:.54}));
 whole.scale.y=.55;whole.position.y=.050;fish.add(whole);
 part(fish,sphere,0xb9b392,-.142,.063,.008,.022,.012,.020);
 part(fish,sphere,0x322c21,-.143,.069,.009,.011,.006,.010);
 const finShape=new T.Shape();
 finShape.moveTo(.113,0);finShape.quadraticCurveTo(.145,.020,.179,.048);
 finShape.quadraticCurveTo(.183,.033,.167,.003);finShape.quadraticCurveTo(.181,-.019,.175,-.040);
 finShape.quadraticCurveTo(.145,-.020,.113,0);
 const tail=part(fish,new T.ExtrudeGeometry(finShape,{depth:.003,bevelEnabled:false}),0x97845d,0,.050,0,1,1,1);
 tail.rotation.x=-Math.PI/2;
 for(let i=-3;i<=3;i++){
  const vein=box(fish,0x776c4b,.145,.054,i*.005,.055,.001,.0015);vein.rotation.y=-i*.19;
 }
 for(let i=0;i<4;i++){
  const slit=part(fish,sphere,0xe1cfaa,-.072+i*.039,.077-.002*i,.010,.010,.003,.044);slit.rotation.y=-.52;
 }
 for(let i=0;i<12;i++){
  const x=(i-5.5)*.015;
  const garnish=box(fish,i%3?0x4a7b3e:0xe5bd67,x,.079+.008*Math.cos(x*12),.013*Math.sin(i*1.9),.004,.003,.047);
  garnish.rotation.y=.68+.42*Math.sin(i);
 }
 const chicken=platter(feast,-.015,.082,.34,.25);
 // Each chopped cross-section has a flat cut face, a bone and a thin skin cap.
 for(let row=0;row<2;row++)for(let i=0;i<4;i++){
  const piece=group(chicken);piece.position.set((i-2)*.037,.024,(row-.5)*.065+.008*Math.cos(i));
  piece.rotation.y=-.67+row*.24+i*.07;piece.rotation.z=-.07;piece.scale.y=.87+.15*Math.cos(i+row);
  const flesh=new T.Shape();flesh.moveTo(-.031,.003);flesh.lineTo(.031,0);flesh.quadraticCurveTo(.040,.023,.017,.042);
  flesh.quadraticCurveTo(-.013,.064,-.032,.039);flesh.quadraticCurveTo(-.041,.020,-.031,.003);
  const cut=new T.ExtrudeGeometry(flesh,{depth:.029,bevelSize:.002,bevelThickness:.002,bevelSegments:2});
  cut.rotateY(-Math.PI/2);part(piece,cut,row?0xe4bf9d:0xead1b2,.015,0,0,1,1,1);
  const skin=new T.Shape();skin.moveTo(-.033,.038);skin.quadraticCurveTo(-.013,.067,.018,.045);skin.quadraticCurveTo(.029,.037,.034,.021);
  skin.lineTo(.031,.023);skin.quadraticCurveTo(.015,.047,-.002,.048);skin.quadraticCurveTo(-.022,.054,-.033,.033);skin.closePath();
  const cap=new T.ExtrudeGeometry(skin,{depth:.031,bevelSize:.0015,bevelThickness:.0015,bevelSegments:2});
  cap.rotateY(-Math.PI/2);part(piece,cap,0xd5a14f,.016,0,0,1,1,1);
  part(piece,sphere,0xc3a685,.017,.021,-.005,.004,.016,.019);
 }
 const leg=group(chicken);leg.position.set(.080,.051,.001);leg.rotation.y=1.14;
 part(leg,sphere,0xd3a256,-.019,.005,0,.094,.053,.061);
 const taper=part(leg,new T.ConeGeometry(.025,.078,20),0xd8ad66,.029,.002,0,1,1,1);
 taper.rotation.z=-Math.PI/2;part(leg,sphere,0xe5d5bc,.062,0,0,.027,.017,.019);
 for(let i=0;i<6;i++){
  const leaf=part(chicken,sphere,0x55763b,-.1+.021*Math.sin(i),.031,.064+.013*Math.cos(i),.036,.006,.019);
  leaf.rotation.y=i;
 }
 const dip=bowl(feast,.176,.094,.079,0x96904c);
 for(let i=0;i<13;i++)box(dip,i%3?0xaab053:0xdebf82,Math.sin(i*2.4)*.022,.034,Math.cos(i*2.4)*.019,.007,.003,.004);
 const rice=0xe9e0cb,tea=0xa96d36;
 const riceBowls=[[-.230,-.055],[-.245,.286],[.245,.26],[.24,-.33]]
  .map(([x,z])=>bowl(feast,x,z,.112,rice));
 const elderBowl=riceBowls[0];
 for(const crock of riceBowls){
  part(crock,sphere,0xe4d7bb,0,.048,0,.096,.024,.096);
  for(let i=0;i<22;i++){
   const r=.044*Math.sqrt(i/22),a=i*2.4;
   const grain=part(crock,sphere,i%3?0xf0e6ce:0xd4cbb4,r*Math.cos(a),.06-.011*(r/.044)**2,r*Math.sin(a),.008,.003,.003);
   grain.rotation.y=a;
  }
 }
 bowl(feast,.10,.393,.085,tea);
 for(const [x,z] of [[-.178,-.353],[.204,.175]])bowl(feast,x,z,.079,tea);
 function sticks(parent){
  const pair=group(parent);
  for(const side of [-1,1]){
   const stick=part(pair,new T.CylinderGeometry(.0028,.00145,.245,8),0x6f4731,side*.008,0,0,1,1,1);
   stick.rotation.z=-side*.055;
  }
  return pair;
 }
 const afterMeal=group(table);
 bowl(afterMeal,-.21,-.23,.113,null);bowl(afterMeal,-.20,.28,.11,null);
 bowl(afterMeal,-.13,.11,.079,tea);
 const sidePlate=platter(afterMeal,-.03,.03,.235,.17);
 for(let i=0;i<3;i++)box(sidePlate,0xbd9c62,.025*i-.034,.026,.012*Math.sin(i),.003,.003,.030).rotation.y=i;
 const laidDown=sticks(afterMeal);laidDown.position.set(-.23,.021,-.059);laidDown.rotation.x=Math.PI/2-.025;
 const eatingSticks=sticks(feast);
 const morsel=part(feast,sphere,0xf4dfb9,0,0,0,.016,.030,.023);
 const shared=part(elderBowl,sphere,0xe7d5b4,0,.052,0,.045,.024,.029);
 const playerMeal=createPlayerMeal({player:cast.player,actor,placeHand,shot,sticks:eatingSticks,bite:morsel,shared,table});
 const diners=[
  {id:'regular',bowl:elderBowl,delay:1.7},
  {id:'master',bowl:riceBowls[3],delay:4.0},
  {id:'aming',bowl:riceBowls[2],delay:.1}
 ].map(diner=>{
  const pair=sticks(scene);const grain=part(pair,sphere,0xe1c4a2,0,-.123,0,.021,.014,.018);
  const serving=part(diner.bowl,sphere,0xe1c4a2,0,.062,0,.021,.014,.018);
  return {...diner,pair,grain,serving};
 });
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

 scene.add(camera);
 const {rig:boards,tick:tickBoards,strike,slats}=createReunionBoards(cast.player,camera);
 // A wooden zheng rests on the narrow table in front of the seated singer.
 const zheng=group();
 zheng.position.set(2.28,.966,-1.87);
 box(zheng,0x533327,0,.026,0,.19,.05,.72);
 box(zheng,0x935d37,0,.057,0,.18,.015,.69);
 for(const z of [-.335,.335])box(zheng,0x442d25,0,.069,z,.185,.022,.018);
 const strings=[];
 for(let i=0;i<16;i++){
  const x=-.081+i*.0108,bridge=-.11+i*.014;
  const string=group(zheng);string.position.x=x;
  const lengths=[[-.33,bridge],[bridge,.205],[.205,.33]];
  for(const [a,b] of lengths)box(string,0xd7ba84,0,.079,(a+b)/2,.0013,.0013,b-a);
  strings.push(string);
  box(zheng,0x493327,x,.071,-.11+i*.014,.007,.015,.008);
 }
 for(const z of [-.23,.23])box(zheng,0x402e25,0,-.009,z,.15,.033,.028);
 const eating=['supper','fish','chicken','passFish'];
 // Heights fit the underside of each seated character's relaxed hand to the
 // 0.9425 m terrazzo top. The finger length and natural curl differ by rig.
 const restingHeight={fang:{Left:.996,Right:1.008},regular:{Left:1.001,Right:1.010},
  master:{Left:1.003,Right:1.001},aming:{Left:1.022}};
 function restHand(id,side,thanks=null){
  const bones=cast[id].bones,dir=id==='regular'||id==='fang'?1:-1;
  const front=new T.Vector3(dir,0,0),across=new T.Vector3(0,0,-dir);
  const shoulder=bones[side+'Arm'].getWorldPosition(new T.Vector3());
  const z=T.MathUtils.clamp(shoulder.z,-2.05,-1.145);
  const palm=new T.Vector3(0,-1,0),fingers=front.clone();
  const edge=dir===1?1.73:2.51;
  const wrist=new T.Vector3(edge+(side==='Right'?.014:.026)*dir,restingHeight[id][side],z);
  if(id==='master'&&side==='Left')wrist.z+=.036;
  if(id==='fang'&&side==='Left')wrist.z-=.016;
  if(id==='regular'&&side==='Right')wrist.z-=.027;
  if(thanks!==null){
   // A small invitation beside his bowl; the hand stays in front of the jacket.
   wrist.set(1.787+.021*thanks,1.080+.030*thanks,-1.703+.015*thanks);
   palm.set(0,-.72,.48+.24*thanks);fingers.set(1,.035+.07*thanks,.12);
  }
  placeHand(bones,side,wrist,front,across,3.1,palm,fingers);
 }
 function settleDiners(concert,dining){
  for(const role of ['fang','regular','master',...(dining?['aming']:[])]){
   if(concert&&role==='master')continue;
   restHand(role,'Left');
   if(role==='fang'||!dining)restHand(role,'Right');
  }
 }
 function groupPose(candid,includePlayer=true){
  const back=.14,front=.60,face=Math.PI/2;
  actor('master',back,.19,-1.43,face+.25);
  actor('fang',front,.19,-1.88,face+.12);
  actor('regular',back,.19,-2.32,face+.10);
  if(includePlayer)actor('player',front,.19,-2.73,face);
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
  const concert=id==='wait'||id==='gather';
  const afterDinner=concert||['call','ready','enterPortrait','proof','snapTidy','snapLaugh'].includes(id);
  zheng.visible=concert;
  oranges.visible=afterDinner&&!wall;orange.visible=false;showWall(wall?state.photo:null);boards.visible=id==='gather';
  table.visible=concert||(!wall&&!afterDinner&&id!=='join');
  afterMeal.visible=concert;plate.visible=!concert;
  feast.visible=eating.includes(id);
  for(const diner of diners)diner.pair.visible=feast.visible&&!(id==='passFish'&&diner.id==='regular');
  plate.position.set(0,0,feast.visible?.356:0);plate.scale.setScalar(feast.visible?.75:1);
  eatingSticks.visible=['chicken','fish','passFish'].includes(id);
  shared.visible=false;morsel.visible=eatingSticks.visible;
  lid.visible=['guess','goose','right','dish'].includes(id);lid.position.set(0,0,0);
  if(wall){
   shot([1.50,1.78,-1.62],[3.56,1.76,-1.66],42);
  }else if(['ready','enterPortrait','snapTidy','snapLaugh','proof'].includes(id)){
   groupPose(id==='snapLaugh',id!=='ready');
  }else if(concert){
   actor('master',2.65,.19,-1.84,-1.57,true,[2.55,1.120,-1.993],[2.55,1.124,-1.684]);
   actor('regular',1.61,.19,-1.84,1.54,true);actor('fang',1.61,.19,-1.21,1.57,true);
   actor('aming',-.32,.19,-3.21,-1.24);
   if(id==='wait')shot([2.11,1.62,-.65],[2.11,1.27,-1.87],53);
   else shot([1.77,1.52,-1.19],[2.56,1.16,-1.82],54);
  }else if(afterDinner){
   actor('master',.22,.19,-1.60,1.9);actor('fang',.35,.19,-2.26,1.6);
   actor('friend',.18,.19,-3.12,1.42);
   actor('aming',id==='ready'?.63:-.32,.19,id==='ready'?-3.55:-3.21,id==='ready'?1.42:-1.24);
   shot([2.76,1.59,-2.69],[.29,1.48,-2.48],57);
  }else{
   actor('fang',1.61,.19,-1.21,1.55,true);actor('regular',1.61,.19,-1.83,1.53,true);
   actor('master',2.65,.19,-1.84,-1.57,true);
   if(feast.visible)actor('aming',2.65,.19,-1.24,-1.57,true);
   else actor('aming',2.21,.19,-2.46,.03);
   shot([2.34,1.53,-.68],[1.65,1.34,-1.32],54);
   if(['guess','right','goose'].includes(id))shot([2.04,1.53,-.92],[2.17,1.33,-2.24],55);
   if(id==='dish')shot([2.12,1.52,-1.01],[2.09,.98,-1.54],44);
   if(feast.visible)shot([2.10,1.68,-.65],[2.09,1.02,-1.62],57);
  }
  if(concert||!wall&&!afterDinner)settleDiners(concert,feast.visible);
  playerMeal.stage(id);
 }
 function tick(now,entered,mode,singing){
  if(mode==='enterPortrait'){
   const player=cast.player,step=T.MathUtils.smootherstep((now-entered)/1650,0,1);
   const stride=Math.sin(step*Math.PI*4)*Math.sin(step*Math.PI);
   player.model.position.set(.60+1.23*(1-step),.19+Math.abs(stride)*.022,-2.73-1.05*(1-step));
   player.model.rotation.y=T.MathUtils.lerp(-.86,Math.PI/2,T.MathUtils.smoothstep(step,.62,1));
   for(const [bone,angle] of [['LeftUpLeg',.31],['RightUpLeg',-.31],['LeftArm',-.17],['RightArm',.17]]){
    player.bones[bone].quaternion.copy(player.neutral[bone]);player.bones[bone].rotateX(stride*angle);
   }
  }
  if(zheng.visible){
   const master=cast.master,t=singing?.time??0;
   const front=new T.Vector3(-1,0,0),across=new T.Vector3(0,0,1);
   const smooth=T.MathUtils.smootherstep;
   const lane=6+2*smooth(t,5.25,5.65)-smooth(t,12,12.55)+2*smooth(t,21.95,22.25)-2*smooth(t,26.25,26.8);
   const stringX=zheng.position.x-.081+.0108*lane;
   const press=singing?.press??0,pluck=singing?.pluck??0,depth=.0025*press;
   // On the left, the string changes slope about its bridge as the pad presses.
   for(let i=0;i<strings.length;i++){
    const amount=depth*Math.max(0,1-Math.abs(i-lane));
    for(const section of strings[i].children.slice(1)){
     section.position.y=.079-amount/2;
     section.rotation.x=(section===strings[i].children[1]?1:-1)*Math.atan2(amount,section.scale.z);
    }
   }
   for(const side of ['Right','Left']){
    const right=side==='Right',stroke=right?(singing?.thumb?0:pluck):press;
    const z=right?-2.066:-1.665,contact=new T.Vector3(stringX,1.045+(right?.007*(1-stroke):.003*(1-stroke)-depth)+.0035,z);
    const active=right?'Index':'Middle';
    if(right)contact.x+=.005*(1-stroke);
    const wrist=new T.Vector3(contact.x+.175,1.070+(right?.006:0),z+(right?.018:-.018));
    const fingers=new T.Vector3(-1,-.16,right?.10:-.10);
    for(let i=0;i<3;i++){
     placeHand(master.bones,side,wrist,front,across,2.7,new T.Vector3(0,-1,0),fingers);
     const f=handFrame(master.bones,side);
     const root=master.bones[side+'Hand'+active+'1'].getWorldPosition(new T.Vector3());
     const restPad=root.addScaledVector(f.forward,.045).addScaledVector(f.palm,.034);
     wrist.addScaledVector(contact.clone().sub(restPad),.72);
    }
    const f=handFrame(master.bones,side);
    for(const digit of ['Index','Middle','Ring','Pinky','Thumb']){
     const root=master.bones[side+'Hand'+digit+'1'].getWorldPosition(new T.Vector3());
     const target=root.addScaledVector(f.forward,digit==='Thumb'?.066:.040).addScaledVector(f.palm,digit==='Pinky'?.017:.025);
     target.y=Math.max(target.y,1.058);
     if(digit==='Thumb')target.addScaledVector(f.radial,.035);
     if(right&&digit==='Thumb'){
      const lane=T.MathUtils.clamp(Math.round((target.x-zheng.position.x+.081)/.0108),0,15);
      const thumbStroke=singing?.thumb?pluck:0;
      target.x=zheng.position.x-.081+.0108*lane-.004*(1-thumbStroke);
      target.y=1.0485+.011*(1-thumbStroke);
     }
     if(digit===active)stringContact(master.bones,side,digit,contact,f,contact.y-.0025);
     else if(right&&digit==='Thumb')stringContact(master.bones,side,digit,target,f,target.y-.0025);
     else fingerContact(master.bones,side,digit,target,f);
    }
   }
   const nod=mode==='gather'&&t<1.6?.075*Math.sin(Math.PI*t/1.6)**2:0;
   master.bones.Head.rotateX(.07+nod+.018*(singing?.lift??0)+.011*Math.sin(t*1.37));
   master.bones.Head.rotateY(mode==='wait'?.12:.025*Math.sin(t*.75));
  }
  for(const {id,bowl,delay,pair,grain,serving} of diners){
   serving.visible=false;
   if(!pair.visible)continue;
   const a=cast[id],dir=id==='regular'?1:-1,phase=((now-entered)/1000+delay)%6.8;
   const ease=T.MathUtils.smootherstep;
   const carry=ease(phase,.95,2.65)*(1-ease(phase,3.15,4.95));
   const front=new T.Vector3(dir,0,0),across=new T.Vector3(0,0,-dir);
   const own=bowl.getWorldPosition(new T.Vector3());own.y+=id==='regular'?.074:.064;
   own.x+=dir*(id==='regular'?.028:.008);
   const start=new T.Vector3(id==='regular'?2.015:2.145,id==='aming'?1.031:1.025,id==='aming'?-1.465:-1.743);
   const tip=start.clone().lerp(own,carry);
   const clear=ease(phase,.93,1.58)*(1-ease(phase,2.2,2.68))+ease(phase,3.28,3.95)*(1-ease(phase,4.55,5.08));
   tip.y+=.062*clear+.018*(1-ease(phase,.14,.62)+ease(phase,5.65,6.1));
   const wrist=tip.clone().addScaledVector(front,-.19).addScaledVector(across,-.075);
   wrist.y+=.108;
   const fingers=front.clone().addScaledVector(across,.29);fingers.y=.02;
   for(let iteration=0;iteration<7;iteration++){
    placeHand(a.bones,'Right',wrist,front,across,3.5,new T.Vector3(0,-.78,-dir*.62),fingers);
    positionChopsticks(a.bones,'Right',pair);
    const actual=pair.localToWorld(new T.Vector3(0,-.1225,0));
    const delta=tip.clone().sub(actual);
    if(delta.lengthSq()<.00000025)break;
    wrist.addScaledVector(delta,.65);
   }
   const opening=1-ease(phase,.50,.90)+ease(phase,2.76,3.1)-ease(phase,3.45,3.8)+ease(phase,5.1,5.44);
   grain.visible=phase>.84&&phase<2.87;serving.visible=phase>=2.87;
   applyChopstickGrip(a.bones,'Right',pair,T.MathUtils.clamp(opening,grain.visible?.30:0,1));
   a.bones.Head.rotateX(.085*carry+.030*(1-carry));
  }
  if(mode==='passFish'){
   const seconds=(now-entered)/1000;
   const thanks=T.MathUtils.smootherstep(seconds,.45,1.35)*(1-T.MathUtils.smootherstep(seconds,2.8,3.75));
   restHand('regular','Right',thanks);
  }
  playerMeal.tick(mode,(now-entered)/1000);
  tickBoards(now);
  if(mode==='dish'){
   const t=T.MathUtils.smootherstep((now-entered)/850,0,1);lid.position.set(-.26*t,.18*t,0);lid.rotation.z=t*.6;lid.visible=t<.99;
  }else lid.rotation.z=0;
 }
 function hit(ray,mode){
  if(boards.visible&&ray.intersectObjects(slats,false).length)return 'beat';
  if(['right','goose'].includes(mode)&&ray.intersectObject(lid,true).length)return 'lid';
  if(mode==='supper'){
   if(ray.intersectObject(fish,true).length)return 'fish';
   if(ray.intersectObject(chicken,true).length)return 'chicken';
  }
  return null;
 }
 return {stage,tick,strike,hit};
}
