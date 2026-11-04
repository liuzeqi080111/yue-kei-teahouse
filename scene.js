// Fixed spatial plan: street/windows left, aisle center, cashier rear right.
// All interior views share one background and the same stable table slot layout.
import {MOTION} from './controller.js';
const interior=new Image(),exterior=new Image(),waiterImage=new Image();waiterImage.src='assets/waiter-poses.png';interior.src='assets/interior-furnished.png';exterior.src='assets/exterior.png';
const tableImage=new Image();tableImage.src='assets/table.png';
const foodImage=new Image();foodImage.src='assets/food-sheet.png';
const foodIds=['food-pineapple-bun','food-charsiu-rice','food-wonton-noodle','food-egg-sandwich','food-french-toast','food-curry-fishball','drink-lemon-tea','drink-milk-tea','drink-yuanyang','drink-horlicks'];
const drinkImage=new Image();drinkImage.src='assets/drinks.png';
const walkImage = new Image();
walkImage.src = 'assets/waiter-gait-v2.png';
const handsImage=new Image();handsImage.src='assets/service-hands.png';
const takeawayImage=new Image();takeawayImage.src='assets/takeaway-bun.png';
export const ready=Promise.allSettled([interior.decode(),exterior.decode(),waiterImage.decode(),tableImage.decode(),foodImage.decode(),drinkImage.decode(),walkImage.decode(),handsImage.decode(),takeawayImage.decode()]);
function rect(c,x,y,w,h,color){c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));}
function poly(c,pts,color){c.fillStyle=color;c.beginPath();pts.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fill();}
function ellipse(c,x,y,rx,ry,color){c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fill();}
export function food(c,id,x,y,s=1,options={}){
 if(options.serving==='外賣'&&takeawayImage.complete&&takeawayImage.naturalWidth){
  const h=100*s,w=h*takeawayImage.naturalWidth/takeawayImage.naturalHeight;
  ellipse(c,x,y+3*s,25*s,6*s,'#241c2255');
  c.drawImage(takeawayImage,Math.round(x-w/2),Math.round(y-h*.89),Math.round(w),Math.round(h));return;
 }
 const drinkIndex=['drink-lemon-tea','drink-milk-tea','drink-yuanyang','drink-horlicks'].indexOf(id);
 if(drinkIndex>=0&&drinkImage.complete&&drinkImage.naturalWidth){const sw=drinkImage.naturalWidth/4,sh=drinkImage.naturalHeight/2,w=67*s,h=w*sh/sw;ellipse(c,x,y+3*s,21*s,5*s,'#241c2255');c.imageSmoothingEnabled=false;c.drawImage(drinkImage,drinkIndex*sw,options.temperature==='凍'?sh:0,sw,sh,Math.round(x-w/2),Math.round(y-h*.8),Math.round(w),Math.round(h));return;}
 const index=foodIds.indexOf(id);
 if(index>=0&&foodImage.complete&&foodImage.naturalWidth){const sw=foodImage.naturalWidth/5,sh=foodImage.naturalHeight/2;const w=72*s,h=w*sh/sw;ellipse(c,x,y+6*s,29*s,6*s,'#241c2255');c.imageSmoothingEnabled=false;c.drawImage(foodImage,index%5*sw,Math.floor(index/5)*sh,sw,sh,Math.round(x-w/2),Math.round(y-h*.76),Math.round(w),Math.round(h));return;}
 c.save();c.translate(x,y);c.scale(s,s);c.imageSmoothingEnabled=false;
 ellipse(c,0,14,26,7,'#211b2455');
 if(id.startsWith('drink')){const cold=options.temperature?options.temperature==='凍':id==='drink-lemon-tea';rect(c,-13,-29,26,40,'#d0c5a1');rect(c,-10,-26,20,34,cold?'#ad5f24':id==='drink-horlicks'?'#d4ba85':'#b28551');rect(c,-8,-23,3,29,'#ebcd8d');ellipse(c,0,-28,13,4,'#f4dfb4');ellipse(c,0,-28,10,3,'#99612b');rect(c,13,-20,7,3,'#efe3bf');rect(c,18,-18,3,15,'#efe3bf');rect(c,13,-5,7,3,'#efe3bf');rect(c,-11,9,22,3,'#776b51');if(cold){rect(c,4,-46,3,29,'#632f22');ellipse(c,-4,-23,7,3,'#e9c755');}else{rect(c,-3,-43,2,8,'#f9e8c77a');rect(c,3,-49,2,7,'#f9e8c75a');}}
 else {ellipse(c,0,3,30,13,'#adaf90');ellipse(c,0,0,29,12,'#f2e4bc');ellipse(c,0,0,24,9,'#d4c9a9');
 if(id.includes('bun')){ellipse(c,0,-5,21,13,'#9b5426');ellipse(c,0,-9,20,11,'#e0a047');for(let i=-12;i<15;i+=7){rect(c,i,-17,2,16,'#b77936');rect(c,-15,i/2-12,31,2,'#f3c267');}rect(c,-12,-1,24,4,'#f3dd7c');}
 else if(id.includes('sandwich')||id.includes('toast')){poly(c,[[-22,0],[-9,-22],[25,1]],'#9e5b2b');poly(c,[[-20,-3],[-9,-23],[22,-3]],'#e3b869');poly(c,[[-16,-6],[-8,-19],[17,-6]],'#f7dda0');rect(c,-8,-12,12,6,'#ecc256');}
 else if(id.includes('fishball')){for(let i=0;i<6;i++)ellipse(c,(i%3-1)*11,Math.floor(i/3)*8-8,6,5,'#c78b37');}
 else {ellipse(c,0,-6,22,11,'#f6e9c2');for(let i=0;i<22;i++)rect(c,((i*13)%38)-19,((i*7)%14)-13,3,1,'#cabe8d');if(id.includes('charsiu')){for(let i=0;i<4;i++){poly(c,[[-12+i*7,-17],[-6+i*7,-15],[-10+i*7,-2],[-17+i*7,-4]],'#a3452b');rect(c,-13+i*7,-13,4,7,'#da8153');}}else{for(let i=0;i<3;i++)ellipse(c,i*12-12,-10,7,5,'#dcc18a');}rect(c,10,-16,3,10,'#416443');rect(c,13,-18,3,9,'#688048');}}
 c.restore();}
function waiter(c,x,feet,scale=1,pose=0){
 ellipse(c,x,feet-3,28*scale,6*scale,'#17291b66');
 if(waiterImage.complete&&waiterImage.naturalWidth){const h=Math.round(380*scale),sw=waiterImage.naturalWidth/4,w=Math.round(h*sw/waiterImage.naturalHeight);c.drawImage(waiterImage,pose*sw,0,sw,waiterImage.naturalHeight,Math.round(x-w/2),Math.round(feet-h),w,h);return;}
 c.save();c.translate(x,feet-133*scale);c.scale(scale,scale);
 ellipse(c,0,129,41,8,'#17291b66');rect(c,-22,70,18,59,'#263a32');rect(c,6,70,18,59,'#304439');rect(c,-25,125,22,8,'#212c28');rect(c,6,125,24,8,'#212c28');
 poly(c,[[-22,-14],[22,-14],[34,34],[25,78],[-27,78],[-34,30]],'#e6dab2');rect(c,-22,-7,9,73,'#f3e7c9');rect(c,19,0,8,61,'#b5ae8d');
 poly(c,[[-17,-7],[-8,8],[0,-3],[9,8],[18,-7],[14,66],[-17,66]],'#e8dec1');rect(c,-22,35,46,45,'#204e43');rect(c,-18,39,3,37,'#507565');rect(c,-7,44,20,17,'#37685b');rect(c,-7,44,20,2,'#93a890');rect(c,-3,0,2,27,'#8b8b71');
 poly(c,[[-33,0],[-43,44],[-33,54],[-25,43],[-24,0]],'#d9cda6');rect(c,-42,43,11,13,'#c68b5e');poly(c,[[24,0],[31,0],[42,42],[31,51],[24,28]],'#e9dbb8');rect(c,31,42,11,13,'#d09b6a');
 rect(c,-7,-25,15,18,'#c79162');rect(c,-17,-62,34,39,'#dfa877');rect(c,-21,-51,7,17,'#d29b6d');rect(c,15,-51,7,17,'#bd8157');rect(c,-17,-66,34,13,'#273c34');rect(c,-21,-61,9,17,'#273c34');rect(c,11,-61,10,17,'#273c34');rect(c,-13,-64,20,4,'#546052');rect(c,-13,-46,8,3,'#3b3a2c');rect(c,6,-46,8,3,'#3b3a2c');rect(c,-13,-43,8,7,'#aa986e');rect(c,6,-43,8,7,'#aa986e');rect(c,-5,-42,11,2,'#635c43');rect(c,-10,-42,3,3,'#26362f');rect(c,9,-42,3,3,'#26362f');rect(c,0,-38,4,8,'#bd8054');rect(c,-5,-28,12,2,'#804c37');
 rect(c,-47,50,29,3,'#f2ddb1');rect(c,-45,53,25,5,'#9d6f3d');c.restore();}
const W=1008,H=567;
const available=img=>img.complete&&img.naturalWidth>0;
const shots={
 entrance:{zoom:1.08,centerX:555,centerY:282},
 walk:{zoom:1.08,centerX:555,centerY:282},
 room:{zoom:1,centerX:W/2,centerY:H/2},
};
function table(c){
 if(available(tableImage)){c.drawImage(tableImage,0,0,W,H);return;}
 rect(c,0,0,W,H,'#825732');rect(c,0,0,W,165,'#204737');
}
// Ground anchors in the background's 1008 × 567 coordinates, inside the aisle.
// Both walking and idle figures use this projection; changing poses never moves feet.
export function walkProgress(t){
 const ramp=.12;
 if(t<ramp)return t*t/(2*ramp*(1-ramp));
 if(t>1-ramp)return 1-(1-t)*(1-t)/(2*ramp*(1-ramp));
 return (t-ramp/2)/(1-ramp);
}
export function waiterPlacement(view, now=Date.now()) {
 const beat = view.beat;
 const elapsed = beat ? Math.max(0, now - beat.start) : 0;
 const t = !beat ? 1 : Math.min(1, elapsed / beat.duration);
 const eased = walkProgress(t);
 const walking = ['approach', 'depart'].includes(beat?.pose) && t < 1;
 const progress = beat?.pose === 'approach' ? eased : beat?.pose === 'depart' ? 1 - eased : 1;
 const worldX = 570 + 55 * progress, worldFeet = 325 + 119 * progress;
 const worldScale = (165 + 175 * progress) / 380;
 const {zoom,centerX,centerY}=shots[view.camera]||shots.room;
 return {x:(worldX-centerX)*zoom+W/2, feet:(worldFeet-centerY)*zoom+H/2,
  scale:worldScale*zoom, elapsed, walking, progress};
}
function service(c, view) {
 const beat=view.beat;
 if (beat?.pose === 'prepare') return;
 const {x,feet,scale,progress,walking}=waiterPlacement(view);
 if (walking && available(walkImage)) {
  // Contact → passing → opposite contact → passing. Advance by distance so
  // the feet slow down with the body at the start and stop, instead of skating.
  const travel=beat.pose==='depart'?1-progress:progress;
  const frame = [0,2,1,5][Math.floor(travel*beat.duration/MOTION.frame)%4];
  const row = beat.pose === 'depart' ? 1 : 0;
  const sw = walkImage.naturalWidth / 6;
  const sh = walkImage.naturalHeight / 2;
  const h = Math.round(380 * scale);
  const sourceH=sh*420/512;
  const w = Math.round(h * sw / sourceH);
  ellipse(c, x, feet - 3, 28 * scale, 6 * scale, '#17291b66');
  c.drawImage(walkImage, frame * sw, row * sh+sh*40/512, sw, sourceH,
   Math.round(x - w*140/256), Math.round(feet - h), w, h);
  return;
 }
 const tableService=['REQUEST_WATER','REQUEST_UTENSILS'].includes(beat?.kind);
 const pose = beat?.pose === 'depart' ? 3 : beat?.pose === 'place'&&!tableService ? 2 : 0;
 waiter(c, x, feet, scale, pose);
}
const clamp=n=>Math.max(0,Math.min(1,n));
const smooth=n=>{const t=clamp(n);return t*t*(3-2*t);};
// Cup rims are measured from the two background paintings. The stream and water
// surface share the same anchor; neither is an independent screen decoration.
export function serviceGeometry(view,now=Date.now()){
 const down=['table','menu','bill'].includes(view.camera);
 const cup=down?{x:817,rim:111,bottom:212,rx:41}:{x:914,rim:443,bottom:515,rx:26};
 const utensils=down?{x:860,y:480,width:145}:{x:875,y:539,width:100};
 const beat=view.beat;
 const placing=beat?.pose==='place',withdrawing=beat?.pose==='withdraw';
 const active=['REQUEST_WATER','REQUEST_UTENSILS'].includes(beat?.kind)&&(placing||withdrawing);
 const t=beat?clamp((now-beat.start)/beat.duration):1;
 const reach=smooth(t/.32);
 const retreat=withdrawing?smooth(t):0;
 const offset={x:(1-reach+retreat)*260,y:-(1-reach+retreat)*75};
 const filling=active&&placing&&beat.kind==='REQUEST_WATER';
 const fill=view.water?1:filling?clamp((t-.32)/.55):0;
 const stream=filling&&t>=.32&&t<.87;
 const waterLevel=cup.rim+(cup.bottom-cup.rim)*(.49-.29*fill);
 return {down,cup,utensils,active,placing,withdrawing,t,offset,fill,stream,waterLevel,
  spout:{x:cup.x+offset.x,y:cup.rim-30+offset.y},
  grip:{x:utensils.x+25+offset.x,y:utensils.y-5+offset.y}};
}
function handCell(c,index,x,y,width){
 if(!available(handsImage))return;
 const sw=handsImage.naturalWidth/2,sh=handsImage.naturalHeight/2;
 c.drawImage(handsImage,(index%2)*sw,Math.floor(index/2)*sh,sw,sh,
  Math.round(x),Math.round(y),Math.round(width),Math.round(width*sh/sw));
}
function utensilBundle(c,x,y,width){
 const h=width*(handsImage.naturalHeight||1)/(handsImage.naturalWidth||2);
 ellipse(c,x,y+10,width*.43,4,'#30271933');
 handCell(c,2,x-width*.5,y-h*.59,width);
}
function tableService(c,view){
 const g=serviceGeometry(view),{cup,utensils,offset}=g;
 // Fill inside the existing glass, retaining the original highlights and rim.
 if(g.fill>0){
  const level=g.waterLevel;
  c.save();c.beginPath();
  c.moveTo(cup.x-cup.rx+5,cup.rim+8);c.lineTo(cup.x+cup.rx-5,cup.rim+8);
  c.lineTo(cup.x+cup.rx*.7,cup.bottom-6);c.lineTo(cup.x-cup.rx*.7,cup.bottom-6);c.closePath();c.clip();
  rect(c,cup.x-cup.rx,level,cup.rx*2,cup.bottom-level,'#b2c7af38');
  ellipse(c,cup.x,level,cup.rx*.85,g.down?7:4,'#d7e0c77a');c.restore();
 }
 const delivery=g.active&&g.placing&&view.beat.kind==='REQUEST_UTENSILS';
 if(view.utensils&&!delivery)utensilBundle(c,utensils.x,utensils.y,utensils.width);
 // The close-up shows the server's arm entering from the table's right side.
 // Looking away never replays or moves the committed props.
 if(!g.down||!g.active)return;
 if(view.beat.kind==='REQUEST_WATER'){
  const width=240,h=width*handsImage.naturalHeight/handsImage.naturalWidth;
  handCell(c,0,g.spout.x-width*.05,g.spout.y-h*.59,width);
  if(g.stream){
   rect(c,g.spout.x-1,g.spout.y,3,g.waterLevel-g.spout.y,'#cee6dcbb');
   ellipse(c,cup.x,g.waterLevel,8,2,'#ecf2d8aa');
  }
 }else{
  if(delivery)utensilBundle(c,utensils.x+offset.x,utensils.y+offset.y,utensils.width);
  const width=400,h=width*handsImage.naturalHeight/handsImage.naturalWidth;
  handCell(c,1,g.grip.x-width*.18,g.grip.y-h*.8,width);
 }
}
export function draw(canvas,state,view){
 // Keep the original world coordinates, but retain facial detail on large/high-DPI displays.
 const resolution=Math.min(2,Math.max(1,canvas.clientWidth/W,canvas.clientHeight/H)*(globalThis.devicePixelRatio||1));
 const pixelW=Math.round(W*resolution),pixelH=Math.round(H*resolution);
 if(canvas.width!==pixelW||canvas.height!==pixelH){canvas.width=pixelW;canvas.height=pixelH;}
 const c=canvas.getContext('2d');
 c.setTransform(pixelW/W,0,0,pixelH/H,0,0);
 c.imageSmoothingEnabled=false;c.clearRect(0,0,W,H);
 const {camera}=view;
 const down=['table','menu','bill'].includes(camera);
 if(camera==='outside'){
  if(available(exterior))c.drawImage(exterior,0,0,W,H);else rect(c,0,0,W,H,'#2a493b');
  return;
 }
 if(down)table(c);
 else{
  const {zoom,centerX,centerY}=shots[camera]||shots.room;
  const x=centerX-W/(2*zoom),y=centerY-H/(2*zoom);
  const sx=interior.naturalWidth/W,sy=interior.naturalHeight/H;
  if(available(interior))c.drawImage(interior,x*sx,y*sy,W*sx/zoom,H*sy/zoom,0,0,W,H);
  else rect(c,0,0,W,H,'#38544a');
  if(state.waiterPresent||view.beat){
   service(c,view);
   // At the booth the foreground tabletop occludes the lower part of the sprite.
   if(camera==='room'&&available(interior)){
    // Restore the same background at native proportions along its table edge.
    c.save();
    c.beginPath();
    c.moveTo(0,498);c.lineTo(65,449);c.lineTo(883,449);c.lineTo(W,527);c.lineTo(W,H);c.lineTo(0,H);c.closePath();
    c.clip();
    c.drawImage(interior,0,0,W,H);
    c.restore();
   }
  }
 }
 if(!down&&camera!=='room')return;

 // The fitted scene crops the sides on a phone. Keep every slot and the place
 // setting inside that visible area and keep the same slot order at every angle.
 const span=(canvas.clientWidth||W)<=650?W:Math.min(W,H*(canvas.clientWidth||W)/(canvas.clientHeight||H));
 const scale=Math.min(1,span/480);
 const start=(view.tablePage||0)*6;
 const list=state.items.filter(i=>i.status==='served').slice(start,start+6);
 list.forEach((item,slot)=>{
  const row=Math.floor(slot/3);
  const x=Math.round(W/2+span*(-.13+(slot%3)*.19));
  const y=down?315+row*105:477+row*45;
  const size=(down?1.8:row?1.05:.9)*scale;
  food(c,item.itemId,x,y,size,item.options);
 });
 if(camera==='room'&&view.beat?.pose==='place'){
  const t=Math.min(1,(Date.now()-view.beat.start)/view.beat.duration);
  const item=state.items.find(i=>i.id===view.beat.orderItemId);
  if(item&&item.status!=='served'){
   const slot=state.items.filter(i=>i.status==='served').length%6;
   const endX=W/2+span*(-.13+(slot%3)*.19),endY=477+Math.floor(slot/3)*45;
   food(c,item.itemId,575+(endX-575)*t,355+(endY-355)*t,1.1,item.options);
  }
 }
 const x=Math.round(W/2+span*.34);
 tableService(c,view);
 if(state.billPresented&&camera==='table'){
  c.save();c.translate(x,405);c.scale(scale,scale);
  poly(c,[[-30,-38],[35,-33],[30,42],[-36,37]],'#eee0b9');
  for(let i=0;i<6;i++)rect(c,-20,-23+i*9,36-(i%3)*6,2,'#89816a');
  c.restore();
 }
}
