import {createRenderer, loadImage, surface} from './fp1-render.js';

export const start = {x:.6,z:3.6};
export const streetPath = [start,{x:.65,z:.4},{x:.85,z:-5.8},{x:.34,z:-10.7},{x:.34,z:-12.68}];
export const shopPath = [{x:.34,z:-12.68},{x:.34,z:-15.2},{x:.34,z:-17.13}];
export const people = {
  friend:{x:-.54,z:1.65},
  qing:{x:1.36,z:1.46},
  fang:{x:.42,z:-19.05}
};

const solid = [
  [-3.4,-.58,-13.85,-13.36],[1.24,3.4,-13.85,-13.36],
  [-2.72,2.72,-18.84,-18.16],
  [-3.38,-2.68,1.42,3.26],
  [2.48,3.38,-4.1,-3.2],[-3.38,-2.62,-7.52,-6.66],
  [-3.38,-2.72,-.02,.58]
];
function free({x,z}) {
  if (!Number.isFinite(x)||!Number.isFinite(z)||x<=-3.19||x>=3.19||z>5.1||z<-20.85) return false;
  if (Object.values(people).some(person=>Math.hypot(x-person.x,z-person.z)<.34)) return false;
  return !solid.some(([l,r,n,f])=>x>l-.19&&x<r+.19&&z>n-.19&&z<f+.19);
}
export function canMove(from,to) {
  const steps=Math.max(1,Math.ceil(Math.hypot(to.x-from.x,to.z-from.z)/.09));
  for (let i=1;i<=steps;i++) {
    const u=i/steps;
    if (!free({x:from.x+(to.x-from.x)*u,z:from.z+(to.z-from.z)*u})) return false;
  }
  return true;
}

function crop(image,x,y,width,height,outWidth=512,outHeight=512) {
  return surface(outWidth,outHeight,ctx=>ctx.drawImage(image,x,y,width,height,0,0,outWidth,outHeight));
}
function seeded() {
  let seed=311;
  return ()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
}
function grain(color, wood = false) {
  return surface(128,128,(ctx,w,h)=>{
    ctx.fillStyle=color;
    ctx.fillRect(0,0,w,h);
    const random=seeded();
    for (let i=0;i<1400;i++) {
      const x=random()*w,y=random()*h;
      ctx.fillStyle=random()>.5?'#ffffff14':'#160f1430';
      ctx.fillRect(x,y,wood?5+random()*56:1+random()*8,1+random()*2);
    }
  });
}
function sign(label, subtitle, {ink='#fff0ce', paper='#173e38', border='#d4b17c'}={}) {
  return surface(1024,256,(ctx,w,h)=>{
    ctx.fillStyle=paper;ctx.fillRect(0,0,w,h);
    ctx.strokeStyle=border;ctx.lineWidth=3;ctx.strokeRect(12,12,w-24,h-24);
    ctx.strokeRect(20,20,w-40,h-40);
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=ink;
    ctx.font='bold 107px "Microsoft JhengHei","PingFang TC",sans-serif';
    ctx.fillText(label,w/2,105,w-100);
    ctx.font='26px Georgia,serif';
    ctx.fillText(subtitle,w/2,196,w-90);
  });
}
function lampGlass() {
  return surface(128,128,(ctx,w,h)=>{
    const glow=ctx.createRadialGradient(w/2,h/2,2,w/2,h/2,74);
    glow.addColorStop(0,'#fff4c8');glow.addColorStop(.35,'#e7b476');glow.addColorStop(1,'#7f4d33');
    ctx.fillStyle=glow;ctx.fillRect(0,0,w,h);
  });
}

export async function createFp1Scene(canvas) {
  const [atlas,actors,garments]=await Promise.all([
    loadImage('./assets/fp1-materials.png'),loadImage('./assets/fp1-people.png'),
    loadImage('./assets/fp1-garments.png')
  ]);
  const render=createRenderer(canvas);
  const {material,box,quad,figure}=render;
  const halfW=atlas.width/2,halfH=atlas.height/2;
  const wall=material(crop(atlas,0,0,halfW,halfH));
  const stones=material(crop(atlas,halfW,0,halfW,halfH));
  const panels=material(crop(atlas,0,halfH,halfW,halfH));
  const shelves=material(crop(atlas,halfW,halfH,halfW,halfH));
  const coats=material(crop(garments,0,0,garments.width,garments.height,1024,512));
  const wood=material(grain('#6f4730',true));
  const trim=material(grain('#28433a',true));
  const cream=material(grain('#d6b995'));
  const plaster=material(grain('#8e7a64'));
  const steel=material(grain('#445653',true));
  const ceiling=material(grain('#c4ab89'));
  const wine=material(grain('#7f4337',true));
  const deep=material(grain('#172e2d'));
  const paper=material(grain('#e9d5a9'));
  const gold=material(grain('#b78f55'));
  const light=material(lampGlass(),true);
  const leaf=[material(grain('#385947')),material(grain('#52684b')),material(grain('#67734d'))];
  const laundry=material(sign('芳姐洗衣','FONG KEE LAUNDRY'),true);
  const general=material(sign('裕昌士多','YU CHEONG STORE',{paper:'#643c32'}),true);
  const house=material(sign('福安樓','FOOK ON HOUSE',{paper:'#2b4238'}));
  const open=material(sign('營業中','OPEN',{paper:'#682f26',ink:'#f8de9d'}));
  const board=material(surface(256,256,(ctx,w,h)=>{
    ctx.fillStyle='#ccb793';ctx.fillRect(0,0,w,h);
    ctx.strokeStyle='#7c5945';ctx.strokeRect(10,10,w-20,h-20);
    ctx.textAlign='center';ctx.fillStyle='#55382b';ctx.font='bold 37px "Microsoft JhengHei"';
    ctx.fillText('洗 衣 服 務',w/2,62);
    ctx.font='27px "Microsoft JhengHei"';
    ['乾洗 · 熨衣','改衣 · 洗被','取衣請帶單'].forEach((line,i)=>ctx.fillText(line,w/2,120+i*46));
  }));
  const face=(x,y,z,w,h,mat)=>quad(
    [[x-w/2,y,z],[x+w/2,y,z],[x+w/2,y+h,z],[x-w/2,y+h,z]], [0,0,1],mat
  );

  for (let z=6;z>-25;z-=2.65) {
    for (let x=-2.6;x<=2.61;x+=1.3) {
      const t=1-(((Math.round((x+2.6)*10+z*19)%7)+7)%7)*.025;
      box(x,-.12,z,1.302,.12,2.652,stones,[t,t,t]);
    }
  }
  for (const side of [-1,1]) {
    for (let i=0;i<7;i++) {
      const z=4-i*2.86;
      const tint=i%2?[.8,.76,.67]:[.93,.88,.79];
      box(side*3.74,0,z,.64,5.4+(i%3)*.42,2.9,wall,tint);
      box(side*3.32,.02,z,.19,.48,2.87,plaster);
      box(side*3.36,2.8,z,.31,.12,2.86,cream);
      if (i%3!==2) {
        box(side*3.03,3.07,z,.94,.14,2.38,plaster);
        box(side*2.61,3.22,z,.045,.66,2.3,steel);
        for (const offset of [-1.09,-.55,0,.55,1.09]) {
          box(side*2.57,3.2,z+offset,.06,.78,.045,trim);
        }
        box(side*2.57,3.97,z,.075,.066,2.34,wood);
      }
      box(side*3.37,3.2,z,.14,1.28,1.42,trim);
      box(side*3.287,3.3,z,.03,1.08,1.22,i%3===1?light:deep);
      for (const offset of [-.37,0,.37]) box(side*3.25,3.28,z+offset,.06,1.12,.038,wood);
      box(side*3.23,3.72,z,.06,.036,1.3,wood);
      box(side*3.25,3.17,z,.32,.065,1.56,plaster);
      if (i%2===0) {
        box(side*3.33,.47,z,.10,1.8,1.65,wood);
        for (let k=0;k<14;k++) box(side*3.259,.51+k*.121,z,.04,.025,1.55,steel);
        box(side*3.21,2.26,z,.27,.08,1.88,wine);
      }
      box(side*3.24,0,z-1.35,.055,4.9,.085,steel);
      if (i%3===1) {
        box(side*3.19,2.28,z+.99,.23,.42,.27,wood);
        box(side*3.06,2.33,z+.99,.04,.32,.19,light);
      }
    }
  }
  // The building entrance frames the first conversation.
  box(-2.93,0,4.99,.96,2.4,.1,trim);
  box(-2.93,.09,5.055,.73,2.18,.08,deep);
  face(-2.92,2.52,5.06,1.45,.34,house);
  box(-3.37,0,2.34,.12,2.62,1.44,trim);
  box(-3.294,.22,2.34,.025,2.16,1.15,deep);
  for (let n=0;n<3;n++) {
    box(-3.04-n*.10,0,2.34,.18,.31-n*.096,1.7,plaster);
  }
  quad([[-3.26,2.65,1.48],[-3.26,2.65,3.20],[-3.26,3.07,3.20],[-3.26,3.07,1.48]],[1,0,0],house);
  box(.1,0,5.55,6.8,4.1,.54,wall);
  box(-2.58,2.77,-6.95,1.55,.11,.57,wine);
  face(-2.55,2.87,-6.66,1.65,.44,general);
  box(-2.97,2.36,-6.97,.22,.4,.27,light);
  box(-2.96,0,-7.09,.65,.66,.63,wood);
  box(2.92,0,-3.64,.64,.55,.82,steel);
  box(2.92,.55,-3.64,.68,.06,.86,trim);
  box(-3.03,0,.27,.45,.36,.49,wine);
  const random=seeded();
  for (let i=0;i<25;i++) {
    const x=-3.04+(random()-.5)*.45,z=.27+(random()-.5)*.48;
    box(x,.34+random()*.52,z,.06+random()*.12,.08+random()*.16,.085,leaf[i%3]);
  }
  for (let i=0;i<22;i++) {
    const x=-3.15+i*.3;
    box(x,3.97-Math.sin(i/21*Math.PI)*.46,-5.3,.31,.018,.027,deep);
  }

  // Continuous shop doorway and interior.
  box(-2.02,0,-13.63,2.88,3.36,.48,wall);
  box(2.33,0,-13.63,2.18,3.36,.48,wall);
  box(.34,2.63,-13.63,1.82,.73,.48,wall);
  box(.34,3.26,-13.64,6.8,2.2,.68,wall);
  for (const x of [-.62,1.30]) box(x,0,-13.35,.135,2.73,.32,trim);
  box(.34,2.55,-13.32,2.02,.16,.4,trim);
  box(.34,2.72,-13.21,4.96,.75,.24,wood);
  face(.34,2.79,-13.08,4.73,.61,laundry);
  box(.34,2.55,-12.95,5.26,.09,.87,trim);
  box(-1.9,.54,-13.34,1.98,1.79,.13,trim);
  box(-1.9,.68,-13.255,1.75,1.52,.029,light);
  face(-1.9,.72,-13.224,1.56,1.42,shelves);
  box(-1.9,1.52,-13.202,1.85,.045,.064,trim);
  for (const x of [-2.37,-1.42]) box(x,.64,-13.20,.05,1.61,.06,trim);
  box(-1.89,.51,-13.22,2.06,.12,.31,wood);
  face(1.84,1.69,-13.31,.70,.23,open);
  face(2.49,.70,-13.36,.84,1.04,board);
  box(.36,-.03,-13.59,1.79,.04,.47,gold);
  box(.0,2.98,-17.6,6.8,.16,8.0,ceiling);
  box(.0,0,-21.22,6.8,3.0,.35,wall);
  box(.0,0,-21.07,6.76,.58,.05,trim);
  for (const s of [-1,1]) {
    box(s*3.29,0,-17.49,.16,3.03,7.72,wall);
    box(s*3.18,.03,-17.49,.095,.47,7.64,trim);
  }
  box(.14,0,-18.48,5.17,.98,.61,panels);
  box(.14,.98,-18.48,5.31,.088,.76,wood);
  box(.14,.032,-18.48,5.22,.10,.65,trim);
  box(.14,.94,-18.48,5.22,.034,.65,gold);
  box(-1.78,1.07,-18.49,.70,.043,.46,paper);
  box(-1.75,1.114,-18.51,.48,.016,.35,cream);
  for (let i=0;i<4;i++) box(1.8,1.068+i*.087,-18.53,.61-i*.035,.084,.42-i*.018,i%2?paper:plaster);
  box(-1.92,.32,-20.94,2.01,2.08,.31,wood);
  face(-1.92,.41,-20.775,1.86,1.9,shelves);
  for (const x of [.24,2.9]) box(x,2.38,-20.76,.06,.045,.25,gold);
  face(1.56,1.01,-20.61,2.80,1.42,coats);
  face(-2.63,1.35,-20.995,.70,.92,board);
  for (const x of [-1.7,1.7]) {
    box(x,2.85,-17.85,1.5,.10,.32,wood);
    box(x,2.822,-17.85,1.35,.045,.23,light);
  }

  const atlasColumns=[
    {id:'friend',u:.072,w:.115,top:.040,bottom:.948,height:1.78},
    {id:'friendBack',u:.312,w:.123,top:.041,bottom:.948,height:1.78},
    {id:'qing',u:.549,w:.136,top:.058,bottom:.950,height:1.66},
    {id:'fang',u:.803,w:.116,top:.078,bottom:.949,height:1.58}
  ];
  const figures={};
  for (const {id,u,w,top,bottom,height} of atlasColumns) {
    const spriteWidth=actors.width*w,spriteHeight=actors.height*(bottom-top);
    const mat=material(crop(actors,actors.width*u,actors.height*top,spriteWidth,spriteHeight,256,512));
    figures[id]=figure(mat,height,height*spriteWidth/spriteHeight);
  }
  render.seal();
  return {
    draw(camera, cast){render.render(camera,cast.map(person=>({...person,figure:figures[person.id]})));},
    destroy:render.destroy
  };
}
