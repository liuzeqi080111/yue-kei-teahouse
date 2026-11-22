import {createReunionWall} from './reunion-wall.js';
import * as T from 'three';

export function createReunionScene({scene,camera,cast,group,box,cyl,part,sphere,print,texture,actor,placeHand,shot,portraitLean,portraitArm}){
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
  cyl(crock,0x417378,0,size*.405,0,size*.994,size*.025,size*.994);
  if(filling!==null)cyl(crock,filling,0,size*.417,0,size*.90,size*.016,size*.90);
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
 const riceBowls=[[-.254,-.23],[-.245,.286],[.245,.26],[.24,-.33]]
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
 const teaCup=bowl(feast,.17,.399,.085,tea);
 const toastGuests=[['regular',-.178,-.353],['aming',.204,.175]]
  .map(([id,x,z])=>({id,x,z,cup:bowl(feast,x,z,.079,tea)}));
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
 const morsel=part(feast,sphere,0xf4dfb9,0,0,0,.039,.022,.024);
 const shared=part(elderBowl,sphere,0xe7d5b4,0,.052,0,.045,.024,.029);
 const diners=[
  {id:'regular',bowl:[1.836,1.016,-1.78],delay:1.7},
  {id:'master',bowl:[2.33,1.016,-1.88],delay:4.0},
  {id:'aming',bowl:[2.335,1.016,-1.29],delay:.1}
 ].map(diner=>{
  const pair=sticks(scene);const grain=part(pair,sphere,0xf0dfbb,0,-.123,0,.016,.012,.014);
  return {...diner,pair,grain};
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

 const boards=group(camera);scene.add(camera);
 boards.position.set(.158,-.078,-.48);boards.rotation.set(.09,-.40,-.26);boards.scale.setScalar(.72);
 const slat=group(boards);
 for(const [p,x] of [[boards,0],[slat,.023]]){
  const outline=new T.Shape();
  outline.moveTo(-.010,-.074);outline.quadraticCurveTo(-.014,-.073,-.014,-.063);
  outline.lineTo(-.012,.065);outline.quadraticCurveTo(-.012,.078,0,.078);
  outline.quadraticCurveTo(.012,.078,.012,.065);outline.lineTo(.014,-.063);
  outline.quadraticCurveTo(.014,-.074,.010,-.074);outline.closePath();
  part(p,new T.ExtrudeGeometry(outline,{depth:.007,bevelThickness:.0016,bevelSize:.0016,bevelSegments:2}),0x85502e,x,0,0,1,1,1);
  for(const y of [-.053,-.047])box(p,0x873a2c,x,y,.003,.03,.003,.013);
 }
 let lastStrike=-1e5;
 function strike(){lastStrike=performance.now();}
 // A wooden zheng rests on the narrow table in front of the seated singer.
 const zheng=group();
 zheng.position.set(2.40,.966,-1.87);
 box(zheng,0x533327,0,.026,0,.19,.05,.72);
 box(zheng,0x935d37,0,.057,0,.18,.015,.69);
 for(const z of [-.335,.335])box(zheng,0x442d25,0,.069,z,.185,.022,.018);
 for(let i=0;i<16;i++){
  const x=-.081+i*.0108;
  box(zheng,0xd7ba84,x,.079,0,.0013,.0013,.66);
  box(zheng,0x493327,x,.071,-.11+i*.014,.007,.015,.008);
 }
 for(const z of [-.23,.23])box(zheng,0x402e25,0,-.009,z,.15,.033,.028);
 const eating=['supper','fish','chicken','passFish','toast'];
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
  for(const diner of diners)diner.pair.visible=feast.visible&&id!=='toast'&&!(id==='passFish'&&diner.id==='regular');
  plate.position.set(0,0,feast.visible?.356:0);plate.scale.setScalar(feast.visible?.75:1);
  eatingSticks.visible=['chicken','fish','passFish'].includes(id);
  shared.visible=id==='toast';morsel.visible=eatingSticks.visible;
  teaCup.position.set(.17,0,.399);
  for(const {cup,x,z} of toastGuests)cup.position.set(x,0,z);
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
   if(id==='passFish')shot([2.29,1.52,-.93],[1.88,1.09,-1.81],54);
   if(id==='toast')shot([2.11,1.55,-.70],[2.12,1.23,-1.76],61);
  }
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
   const master=cast.master;
   const turn=(name,axis,angle)=>{
    const bone=master.bones[name];if(!bone)return;
    bone.quaternion.copy(master.neutral[name]);bone[axis](angle);
   };
   const t=singing?.time??0,accent=singing?.lift??0;
   const pluck=singing?.pluck??0,press=singing?.press??0;
   const front=new T.Vector3(-1,0,0),across=new T.Vector3(0,0,1);
   const right=new T.Vector3(2.55+.016*Math.sin(t*1.4),1.120-.007*pluck,-1.993+.012*Math.sin(t*1.15));
   const left=new T.Vector3(2.55+.009*Math.sin(t*.77),1.124-.008*press,-1.684);
   for(const finger of ['Index','Middle','Thumb']){
    const amount=finger==='Thumb'?.13:finger==='Index'?.38:.27;
    turn('RightHand'+finger+'2','rotateZ',-amount*pluck);
    turn('LeftHand'+finger+'2','rotateZ',.16*press);
   }
   // The strings are 79 mm above the instrument origin. Solve at the fingertip,
   // so rolling the wrist or curling a finger cannot lift it away from its string.
   for(const [side,wrist,stroke] of [['Right',right,pluck],['Left',left,press]]){
    const fingertip=master.bones[side+'HandMiddle4'];
    const height=zheng.position.y+.079+.009*(1-stroke);
    for(let pass=0;pass<3;pass++){
     placeHand(master.bones,side,wrist,front,across,.8,new T.Vector3(0,-1,0));
     const delta=height-fingertip.getWorldPosition(new T.Vector3()).y;
     if(Math.abs(delta)<.001)break;
     wrist.y+=delta;
    }
   }
   const nod=mode==='gather'&&t<1.6?.09*Math.sin(Math.PI*t/1.6)**2:0;
   master.bones.Head.rotateX(.085+nod+.037*accent+.016*Math.sin(t*1.37));
   master.bones.Head.rotateY(mode==='wait'?.12:.035*Math.sin(t*.75));
  }
  for(const {id,bowl,delay,pair,grain} of diners){
   if(!pair.visible)continue;
   const a=cast[id],direction=id==='regular'?1:-1;
   const phase=((now-entered)/1000+delay)%6.8;
   const lift=T.MathUtils.smootherstep(phase,.8,2.5)*(1-T.MathUtils.smootherstep(phase,3,4.7));
   const front=new T.Vector3(direction,0,0),across=new T.Vector3(0,0,-direction);
   const tip=new T.Vector3(...bowl);
   const mouth=a.bones.Head.getWorldPosition(new T.Vector3()).addScaledVector(front,.112);
   mouth.y-=.010;tip.lerp(mouth,lift);
   const toward=front.clone().multiplyScalar(.33-lift*1.14).addScaledVector(across,.46);
   toward.y=-.76+lift*1.02;toward.normalize();
   const fingers=front.clone().lerp(toward,.72).normalize();
   const target=tip.clone().addScaledVector(toward,-.172).addScaledVector(fingers,-.125);
   placeHand(a.bones,'Right',target,front,across,3.5,new T.Vector3(0,-.72,-direction*.6),fingers);
   const grip=a.bones.RightHandIndex2.getWorldPosition(new T.Vector3())
    .lerp(a.bones.RightHandThumb3.getWorldPosition(new T.Vector3()),.5);
   pair.position.copy(grip).addScaledVector(toward,.049);
   pair.quaternion.setFromUnitVectors(new T.Vector3(0,-1,0),toward);
   grain.visible=phase>.72&&phase<2.68;
   a.bones.Head.rotateX(.075*(1-lift));
  }
  if(eatingSticks.visible){
   const s=T.MathUtils.smootherstep((now-entered)/1850,0,1);
   const sharing=mode==='passFish',start=mode==='chicken'?[0,.090,.083]:[-.012,.083,-.18];
   const end=sharing?[-.254,.052,-.23]:[.049,.28,.52];
   morsel.position.fromArray(start).lerp(new T.Vector3(...end),s);
   morsel.position.y+=.092*Math.sin(s*Math.PI);
   eatingSticks.position.copy(morsel.position);
   eatingSticks.rotation.set(.66,0,sharing?-.43:-.26);
   eatingSticks.translateY(.116);
   eatingSticks.visible=s<.998;morsel.visible=s<.998;shared.visible=sharing&&s>=.998;
  }
  if(mode==='toast'){
   const t=T.MathUtils.clamp((now-entered)/2600,0,1);
   const lift=Math.sin(Math.PI*t)**2;
   teaCup.position.y=.178*lift;
   teaCup.rotation.z=-.13*Math.sin(Math.PI*t);
   for(const {id,cup,x,z} of toastGuests){
    const dir=id==='regular'?1:-1,front=new T.Vector3(dir,0,0),across=new T.Vector3(0,0,-dir);
    cup.position.set(x+dir*.048*lift,.17*lift,z);
    const wrist=cup.getWorldPosition(new T.Vector3()).addScaledVector(front,-.14);
    wrist.y+=.061;
    placeHand(cast[id].bones,'Right',wrist,front,across,3.5,new T.Vector3(0,-.4,-dir));
   }
  }else teaCup.rotation.z=0;
  slat.rotation.z=-.24+.20*Math.max(0,1-(now-lastStrike)/180);
  if(mode==='dish'){
   const t=T.MathUtils.smootherstep((now-entered)/850,0,1);lid.position.set(-.26*t,.18*t,0);lid.rotation.z=t*.6;lid.visible=t<.99;
  }else lid.rotation.z=0;
 }
 function hit(ray,mode){
  if(boards.visible&&ray.intersectObject(boards,true).length)return 'beat';
  if(['right','goose'].includes(mode)&&ray.intersectObject(lid,true).length)return 'lid';
  if(mode==='supper'){
   if(ray.intersectObject(fish,true).length)return 'fish';
   if(ray.intersectObject(chicken,true).length)return 'chicken';
  }
  return null;
 }
 return {stage,tick,strike,hit};
}
