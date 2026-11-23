import { rackStatus } from './neighborhood-state.js';

export const HOME = { x: 12.22, z: 8.94, heading: 1.56 };
export const COUNTER = { x: 14.60, z: 1.15 };
export const LAUNDRY_DOOR = { x: 13.86, z: -0.50 };
export const RESTAURANT = { x: -13.56, z: 9.22, heading: -1.48 };
export const REST = { x: 13.45, z: -12.9 };

const ORIGINAL_RACK={x:-13.20,z:7.18,length:2.25};
export function rackLayout(world){
 const status=rackStatus(world);
 if(status.placement==='compact')return {...ORIGINAL_RACK,x:-13.72,length:1,visible:true};
 if(status.placement==='move')return {x:-13.32,z:4.90,length:1.85,visible:true};
 return {...ORIGINAL_RACK,visible:status.blocked};
}

export function rackBlocks(rack,point){
 return rack.visible&&Math.abs(point.x-rack.x)<.43&&Math.abs(point.z-rack.z)<rack.length/2+.19;
}

export const ACTORS = Object.freeze({
 qing: { model:'aqing', point:HOME, zone:[11.65,13.20,7.60,9.81] },
 fang: { model:'fang', point:COUNTER },
 ming: { model:'aming', point:{x:-13.86,z:8.43}, zone:[-14.65,-13.22,7.60,9.34] },
 guest: { model:'regular', point:{x:-13.33,z:10.38}, zone:[-14.05,-12.50,9.60,11.78] },
 lam: { model:'lin', point:{x:14.14,z:-12.88}, zone:[13.38,15.56,-14.78,-11.42] },
 lok: { model:'ale', point:{x:-13.68,z:-6.38}, zone:[-14.61,-12.83,-7.48,-5.78] },
 southRice: {model:'southRice',point:{x:6.65,z:-6.42}},
 marketBack: {model:'marketBack',point:{x:-12.42,z:15.78}},
 buyer: { model:'buyer', point:{x:-12.70,z:-5.03}, zone:[-13.60,-11.38,-5.76,-3.62] },
 ling: { model:'ling', point:{x:-14.02,z:-10.46}, zone:[-14.84,-13.07,-11.98,-9.19] },
});

export function within(point, [minX,maxX,minZ,maxZ]) {
 return point.x>=minX && point.x<=maxX && point.z>=minZ && point.z<=maxZ;
}

export function distance(a,b) {
 return Math.hypot(a.x-b.x,a.z-b.z);
}

// Torso, shoulder and camera clearance, measured centre to centre in metres.
export const PERSON_CLEARANCE=.83;

export function crossesPerson(from,to,person){
 const dx=to.x-from.x,dz=to.z-from.z,lengthSq=dx*dx+dz*dz;
 if(!lengthSq)return false;
 const x=person.x-from.x,z=person.z-from.z;
 const t=Math.max(0,Math.min(1,(x*dx+z*dz)/lengthSq));
 // A legacy save can start inside a body. Allow steps that leave the overlap.
 return t>0&&(x-t*dx)**2+(z-t*dz)**2<PERSON_CLEARANCE**2;
}

// A quest marker is an interaction area. If its preferred spot is occupied,
// approach another reachable spot in that same area.
export function guidedStreetPath(nav,from,target,legal,people){
 let departure=from;
 if(people.some(({position})=>distance(position,from)<PERSON_CLEARANCE)){
  const forward=Math.atan2(target.x-from.x,target.z-from.z);
  for(let r=.18;r<2&&departure===from;r+=.18){
   for(let i=0;i<24;i++){
    const a=forward+Math.ceil(i/2)*(i%2?1:-1)*Math.PI/12;
    const p={x:from.x+r*Math.sin(a),z:from.z+r*Math.cos(a)};
    if(nav.line(from,p)&&people.every(({position})=>distance(position,p)>PERSON_CLEARANCE+.05&&!crossesPerson(from,p,position))){
     departure=p;break;
    }
   }
  }
 }
 const bodies=people.map(({position,moving})=>({...position,moving,
  radius:Math.max(0,Math.min(PERSON_CLEARANCE+.13,distance(position,departure)-.001))}));
 function blocked(list){
  return p=>list.some(b=>Math.abs(b.x-p.x)<b.radius&&(b.x-p.x)**2+(b.z-p.z)**2<b.radius*b.radius);
 }
 const occupied=blocked(bodies),fixed=blocked(bodies.filter(b=>!b.moving));
 const spots=[];
 for(const radius of [0,.3,.6,.9,1.2,1.5]){
  for(let i=0;i<(radius?12:1);i++){
   const a=i*Math.PI/6,p={x:target.x+radius*Math.sin(a),z:target.z+radius*Math.cos(a)};
   if(nav.walkable(p.x,p.z)&&legal(p)&&bodies.every(b=>distance(p,b)>=PERSON_CLEARANCE+.04))spots.push(p);
  }
 }
 // If a moving neighbour closes a single-file passage, keep a route around
 // permanent fixtures. Each actual step still waits for the neighbour.
 for(const obstacle of [occupied,fixed]){
  if(!spots.length)break;
  let path=nav.path(departure,spots[0],obstacle);
  if(!path.length)path=nav.path(departure,spots.slice(1),obstacle);
  if(path.length)return departure===from?path:[departure,...path];
 }
 return [];
}

export function createStreetNav(layout, blocked=()=>false) {
 const {x0,z0,step,w,h,rows}=layout;
 const pixels=new Uint8Array(w*h);
 rows.forEach((runs,j)=>{
  for(let k=0;k<runs.length;k+=3){
   const first=j*w+runs[k];
   pixels.fill(runs[k+2],first,first+runs[k+1]);
  }
 });
 // Clear the former stalls from the alley and the vacated ground floor.
 // The bounds stop inside the three remaining walls of the building.
 for(let j=Math.max(0,Math.ceil((-13.59-z0)/step));j<h&&z0+j*step<=-1.61;j++){
  const left=Math.max(0,Math.ceil((-24.96-x0)/step));
  const right=Math.min(w,Math.floor((-20.10-x0)/step)+1);
  if(right>left)pixels.fill(33,j*w+left,j*w+right);
 }
 for(let j=Math.max(0,Math.ceil((-8.32-z0)/step));j<h&&z0+j*step<=-7.04;j++){
  const left=Math.max(0,Math.ceil((-20.10-x0)/step));
  const right=Math.min(w,Math.floor((-14.65-x0)/step)+1);
  if(right>left)pixels.fill(22,j*w+left,j*w+right);
 }
 const index=(x,z)=>{
  const i=Math.round((x-x0)/step),j=Math.round((z-z0)/step);
  return i>=0&&i<w&&j>=0&&j<h?j*w+i:-1;
 };
 const point=i=>({x:x0+(i%w)*step,z:z0+Math.floor(i/w)*step});
 const cell=(x,z)=>pixels[index(x,z)]||0;
 const walkable=(x,z,occupied)=>cell(x,z)>0&&!blocked({x,z})&&!occupied?.({x,z});
 function line(from,to,occupied){
  const steps=Math.max(1,Math.ceil(distance(from,to)/.033));
  for(let i=1;i<=steps;i++){
   const u=i/steps;
   if(!walkable(from.x+(to.x-from.x)*u,from.z+(to.z-from.z)*u,occupied))return false;
  }
  return true;
 }
 // Leave clearance on both sides of shortcuts. A path that just grazes a
 // blocked cell can otherwise sample differently at walking-frame intervals.
 function shortcut(from,to,occupied){
  const length=distance(from,to);
  if(!length)return walkable(to.x,to.z,occupied);
  const dx=(to.z-from.z)*.055/length,dz=(from.x-to.x)*.055/length;
  return line(from,to,occupied)&&line({x:from.x+dx,z:from.z+dz},{x:to.x+dx,z:to.z+dz},occupied)
   &&line({x:from.x-dx,z:from.z-dz},{x:to.x-dx,z:to.z-dz},occupied);
 }
 function path(from,goal,occupied){
  const targets=(Array.isArray(goal)?goal:[goal]).filter(p=>walkable(p.x,p.z,occupied));
  if(!targets.length||!walkable(from.x,from.z,occupied))return [];
  let to=targets[0];
  if(shortcut(from,to,occupied))return [to];
  const start=index(from.x,from.z),ends=new Map(targets.map(p=>[index(p.x,p.z),p]));
  let end=ends.has(start)?start:-1;
  const prev=new Int32Array(w*h).fill(-1),queue=new Int32Array(w*h);
  let head=0,tail=1;
  queue[0]=start;prev[start]=start;
  while(head<tail&&end===-1){
   const i=queue[head++],col=i%w;
   for(const j of [col>0?i-1:-1,col<w-1?i+1:-1,i-w,i+w]){
    if(j<0||j>=pixels.length||!pixels[j]||prev[j]!==-1)continue;
    const p=point(j);if(blocked(p)||occupied?.(p))continue;
    prev[j]=i;queue[tail++]=j;
    if(ends.has(j)){end=j;break;}
   }
  }
  if(end===-1)return [];
  to=ends.get(end);
  const reverse=[to];
  for(let i=end;i!==start;i=prev[i])reverse.push(point(i));
  reverse.push(point(start));
  const route=reverse.reverse(),result=[];
  let current=from;
  for(let i=0;i<route.length;){
   let far=i;
   // The rounded start cell can sit a few centimetres inside a person's disc
   // even when the player's exact starting point is clear.
   if(i===0&&occupied&&!line(current,route[0],occupied)&&route.length>1)far++;
   if(!line(current,route[far],occupied))return [];
   while(far+1<route.length&&shortcut(current,route[far+1],occupied))far++;
   current=route[far];result.push(current);i=far+1;
  }
  return result;
 }
 return {cell,walkable,line,path};
}

// Storefront coordinates follow the published district modules. Positive local Z faces the pavement.
export const SHOPKEEPER_CAST = Object.fromEntries([
 ["juiceCart","凉茶铺的强叔","drinks",-16.53,.52,90,"vendor","行到口渴呀？我啱啱煲好竹蔗水。","走渴了吗？我刚煮好竹蔗水。","为什么要放茅根？","竹蔗清甜，落少少茅根一齊煲，飲落冇咁膩。","竹蔗清甜，和茅根一起煮，喝起来更清爽。",true],
 ["westBread","南洋饼家的莲姨","bakery",-5.25,7,-90,"ling","啱啱出爐嘅蛋撻，小心熱呀。","蛋挞刚出炉，小心烫。","蛋挞怎么吃？","等一陣先咬，個酥皮一掂就甩㗎。","等一下再吃，酥皮一碰就掉。"],
 ["eastBread","南洋饼家的荣叔","bakery",5.24,-6.94,90,"regular","菠蘿包出爐喇，聞唔聞到香味呀？","菠萝包出炉了，闻到香味了吗？","里面有菠萝吗？","冇菠蘿㗎，面頭層脆皮似菠蘿啫。","没有菠萝，名字来自表面的脆皮。"],
 ["radio","修收音机的阿全","radio",5.24,7,90,"ale","你聽吓，呢部機又收到台喇。","你听，这台收音机又收到电台了。","刚才哪里坏了？","粒掣接觸得唔好，扭兩扭就沙沙聲。","旋钮接触不良，一转就有杂音。"],
 ["herbs","药材铺的娟姨","herbs",-5.25,-6.94,-90,"fang","陳皮喺上格，當心唔好整跌個樽。","陈皮在上层，小心玻璃罐。","这阵香味是什么？","陳皮呀，一揭蓋成間舖都香。","是陈皮，一开盖整间铺子都是香的。"],
 ["arcade","北街的辉叔","radio",0.1,-19.16,0,"aming","舊機都整得，拎嚟畀我睇吓。","旧机器也能修，拿来让我看看。","台上这部还能响吗？","仲響㗎，換條天線就清楚好多。","还能响，换根天线就清楚多了。"],
 ["marketBack","杂货铺的芳嫂","herbs",-20.28,-7.6,90,"buyer","入嚟睇吓，乾貨啱啱到。","进来看看，干货刚到。","这些放在哪儿？","用完冚返個蓋，最緊要唔好受潮。","用完盖上盖子，最重要的是防潮。"],
 ["riceCorner","成记米铺的标叔","rice",-15.79,-13.60,90,"vendor","行埋嚟聞吓，呢袋係絲苗米。","过来闻闻，这是丝苗米。","细长的米适合煮什么？","煲仔飯最好，啲飯粒夠爽身。","适合煲仔饭，饭粒干爽分明。",true],
 ["banyanCloth","布庄的美姨","cloth",-20.429,-17.808,-5,"ling","呢匹藍布啱啱開封，你想睇就攤開畀你。","这匹蓝布刚开封，想看我就摊开。","布上的折痕怎么处理？","掛起噴少少水，聽朝就平服好多。","挂起来喷一点水，明早就会平整许多。",true],
 ["lanePrint","巷尾的印刷师傅","print",-24.2,-17.12,90,"regular","啲墨未乾，拎紙要捉住紙角。","油墨还没干，拿纸时捏住纸角。","这是给谁印的？","街坊訂嘅單簿，印完仲要逐本釘。","街坊订的单据本，印好还得逐本装订。",true],
 ["southPrint","南街印务的文仔","print",-21,20.75,180,"ale","呢疊係粵記訂嘅餐牌，等埋封面就齊。","这叠是粤记订的菜单，就差封面。","封面要用哪种纸？","揀厚少少嗰張，成日揭都襟用。","选稍厚的纸，经得起天天翻。",true],
 ["southRice","米行的祥伯","rice",-10.25,21.25,180,"lin","想煲粥呀？呢邊有碎米。","想煮粥吗？这边有碎米。","为什么用碎米？","碎米快啲開花，朝早趕時間都煲得切。","碎米煮开得快，早上赶时间也来得及。",true],
 ["southCloth","绸缎庄的阿珍","cloth",0.5,22.05,180,"aqing","揀布呀？呢匹棉布夠透氣。","挑布吗？这匹棉布透气。","怎么分辨布料？","你摸吓條布邊，軟熟嗰匹係棉。","摸摸布边，手感柔软的那匹是棉布。",true],
 ["eastPrint","东头纸铺的昌叔","print",11.9,20.65,180,"aming","婚帖要對清楚個名先落墨㗎。","印喜帖前要核对好名字。","台上这张是样稿吗？","係呀，畀新人睇過，聽日先印成疊。","对，等新人看过，明天才整批印。",true],
 ["eastRice","东头粮行的英姐","rice",22.5,21.45,180,"fang","幫手睇住把秤呀，我倒啲米落去。","帮忙看一下秤，我往里倒点米。","以前也用这把秤吗？","我阿爸留低㗎，換過個盤，仲好準。","是我爸留下的，换过秤盘，现在还很准。",true],
 ["westCorner","街角生果店的萍姨","fruit",-13.83,15.26,90,"buyer","橙喺左邊，今朝先返貨。","橙子在左边，今早刚到。","怎么挑橙子？","揀個墜手啲嘅，通常多汁啲。","挑拿在手里较沉的，通常汁水更多。",true],
 ["workshop","工房的师傅","print",-16.51,3.80,90,"regular","呢本舊書甩咗線，我幫街坊穿返。","这本旧书脱了线，我帮街坊重新装订。","用胶水粘行吗？","書脊要揭得開，穿返條線耐用啲。","书脊得能翻开，重新穿线更耐用。",true],
 ["gardenHomes","榕树里的街坊","cloth",19.41,-12.18,-90,"ling","坐陣啦，我幫隔籬改緊條褲腳。","坐一会儿，我在给邻居改裤脚。","为什么先别上针？","要着住對鞋度，先知長短啱唔啱。","得穿着鞋量，才知道裤脚长短是否合适。",true],
 ["northTurn","北街果店的威哥","fruit",-9.9,-17.2,0,"vendor","香蕉熟得快，呢梳要先食。","香蕉熟得快，这一串要先吃。","怎么知道熟了？","見到皮上面有兩三點梅花，就啱甜喇。","果皮有两三点褐斑时，甜度正好。",true],
 ["eastTurn","东街米铺的霞姨","rice",9.56,-17.26,0,"fang","街坊寄低個米罌，話收工先嚟攞。","街坊把米缸寄放在这儿，下班才来拿。","为什么用陶罐装米？","個蓋冚得實，擺喺陰涼位就好。","盖子盖得严，放阴凉处就好。",true]
].map(([id,name,kind,x,z,degrees,cast,line,meaning,question,reply,translation,stall=false]) => [id,{name,kind,x,z,yaw:degrees*Math.PI/180,cast,line,meaning,question,reply,translation,stall}]));

// Keep the portrait and voice catalogue independent from the playable shops.
// Each customer uses a different scan, assigned to just this counter.
export const SHOP_CUSTOMERS=Object.freeze({
 westBread:'eastTurn',eastBread:'southRice',radio:'southPrint',herbs:'riceCorner',
 arcade:'lanePrint',juiceCart:'eastRice',westCorner:'marketBack',
});
export const SHOPS=Object.fromEntries(Object.keys(SHOP_CUSTOMERS).map(id=>[id,SHOPKEEPER_CAST[id]]));

function shopOffset(shop,point){
 const dx=point.x-shop.x,dz=point.z-shop.z;
 return {side:Math.abs(dx*shop.cos-dz*shop.sin),depth:dx*shop.sin+dz*shop.cos};
}
const customerLines={
 juiceCart:'點解要落茅根嘅？',westBread:'啱出爐，依家食得未呀？',eastBread:'菠蘿包入面有冇菠蘿㗎？',
 radio:'頭先邊度壞咗呀？',herbs:'呢陣咁香嘅係咩呀？',arcade:'枱面呢部仲響唔響呀？',
 marketBack:'呢啲乾貨點收好呀？',riceCorner:'呢隻米煮咩好食呀？',banyanCloth:'匹布有摺痕，點整好呀？',
 lanePrint:'呢啲係幫邊個印㗎？',southPrint:'封面用邊隻紙好呀？',southRice:'點解用碎米煲粥呀？',
 southCloth:'點睇得出邊匹係棉呀？',eastPrint:'呢張係咪婚帖個稿呀？',eastRice:'以前都係用呢把秤㗎？',
 westCorner:'點揀個多汁啲嘅橙呀？',workshop:'用膠水黐得唔得呀？',gardenHomes:'點解要着埋鞋先落針呀？',
 northTurn:'點睇得出梳蕉熟未呀？',eastTurn:'用米罌裝米有咩好呀？',
};
for(const [id,shop] of Object.entries(SHOPS)){
 shop.customerLine=customerLines[id];
 shop.sin=Math.sin(shop.yaw);shop.cos=Math.cos(shop.yaw);
}
export function atShopCounter(shop,point){
 const {side,depth}=shopOffset(shop,point);
 return depth>=-.24&&depth<=1.95&&side<=1.08;
}
// Local X is across the opening. Positive local Z faces the street.
export const MARKET_ROOMS=[
 {id:'records',sign:'永聲唱片',z:-4.99,width:3.72},
 {id:'clothes',sign:'玲記衣舖',z:-10.17,width:3.34},
];
export function marketRoomBlocks({x,z}){
 if(x< -20.18||x> -14.91)return false;
 return MARKET_ROOMS.some(r=>Math.abs(Math.abs(z-r.z)-r.width/2)<.15);
}
export function shopBlocks(shop,point){
 if(Math.abs(point.x-shop.x)>5||Math.abs(point.z-shop.z)>5)return false;
 const {side,depth}=shopOffset(shop,point);
 const along=(point.x-shop.x)*shop.cos-(point.z-shop.z)*shop.sin;
 if(Math.hypot(along+.52,depth-.06)<.26)return true;
 if(side<.95&&depth<-.25&&depth>-1.65)return true;
 if(shop.stall)return depth> -1.95 && depth<.12 && side<1.48 && (side>1.33||depth<-.27);
 return side>1.40&&side<3.6&&depth<.57&&depth>-.15;
}

// Clerks stay with their shops. These residents have their own dialogue identity.
export const PASSERS={
 yan:{name:'散步的欣姨',model:'gardenHomes',tint:0x745581,facts:['欣姨喜欢在街市买菜前先走一圈，经过东街的南洋饼家时会闻到菠萝包香。','她喜欢菠萝包刚出炉的脆皮，走完一圈才买，留到回家配茶。']},
 kit:{name:'阿杰',model:'eastPrint',tint:0x46637d,facts:['阿杰喜欢拍街景，今天出门找手写店招。','他最爱拍旧招牌的笔画，等街上人走过去才拍。']},
 mei:{name:'阿美',model:'southCloth',tint:0x578469,facts:['阿美在散步时爱看店铺窗里的布，平时会自己缝布袋。','她爱用结实的棉布做袋身，剩下的碎布可以缝成里面的小口袋。']},
 wing:{name:'荣伯',model:'northTurn',tint:0x55788a,facts:['荣伯每天出来舒展双腿，喜欢在榕树附近听街坊下棋。','他喜欢听棋子落在棋盘上的声音，自己围观时不出声提点。']},
 ching:{name:'阿静',model:'banyanCloth',tint:0x9c6552,facts:['阿静爱听旧唱片，出来走路时会经过永声唱片。','她喜欢慢歌，听旧唱片时特别留心经唱针传来的轻轻沙沙声。']},
 wai:{name:'阿威',model:'workshop',tint:0x606e4b,facts:['阿威对旧收音机有兴趣，散步时喜欢到电器铺看看。','他喜欢慢慢转动调频旋钮，直到人声清楚，杂音消下去。']},
};
export const streetVoiceIds=['intro','qing','fang','lok','ling','lam','ming','guest','buyer',...Object.keys(SHOPKEEPER_CAST),...Object.keys(PASSERS)];
export const streetHello=['你好呀，咁啱嘅！','你好呀，真巧！'];
export const streetReply=['幾好呀，多謝你。你都出嚟行吓呀？','挺好的，谢谢你。你也出来散步呀？'];

// Each first point is a spawn on a straight section. The middle lane has
// offset entrances; opposite directions use separate tracks past the posts.
// The other crossings use the open north and south streets.
const neighbourhoodWalks={
 yan:[[11.5,4.16],[11.5,16.4],[-10.6,16.4],[-10.6,-16.6],[11.5,-16.6]],
 kit:[[1,-15.4],[-9.1,-15.4],[-9.1,-1.12],[-4.4,-1.12],[3.6,.33],[9.2,.33],[9.2,-15.4]],
 mei:[[8.2,-6],[8.2,-14.5],[-11.8,-14.5],[-11.8,-1.1],[-4.4,-1.1],[3.6,.33],[10.5,.33],
      [10.5,18],[-9.8,18],[-9.8,-1.1],[-4.4,-1.1],[3.6,.33],[8.2,.33]],
 wing:[[-8.2,7],[-8.2,15.3],[9.4,15.3],[9.4,1.17],[3.6,1.17],[-4.4,1.17],[-8.2,1.17]],
 ching:[[-3,17.2],[10.2,17.2],[10.2,-17.4],[-11.4,-17.4],[-11.4,17.2]],
 wai:[[.8,1.17],[-8.4,1.17],[-8.4,-16],[10,-16],[10,1.17]],
};

export function pedestrianRoutes(){
 return Object.entries(neighbourhoodWalks).map(([id,stops])=>{
  const corners=stops.map(([x,z])=>({x,z}));
  const start=corners[0],points=[start];
  for(let i=1;i<corners.length;i++){
   const prev=corners[i-1],at=corners[i],next=corners[(i+1)%corners.length];
   const incoming=distance(prev,at),outgoing=distance(at,next);
   const radius=Math.min(1.15,incoming*.35,outgoing*.35);
   const entry={x:at.x+(prev.x-at.x)*radius/incoming,z:at.z+(prev.z-at.z)*radius/incoming};
   const exit={x:at.x+(next.x-at.x)*radius/outgoing,z:at.z+(next.z-at.z)*radius/outgoing};
   // A short quadratic arc keeps the body moving through the intersection.
   for(let j=0;j<=6;j++){
    const t=j/6,u=1-t;
    points.push({x:u*u*entry.x+2*u*t*at.x+t*t*exit.x,z:u*u*entry.z+2*u*t*at.z+t*t*exit.z});
   }
  }
  return {id,start,points,next:1};
 });
}
