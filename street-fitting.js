import * as T from 'three';

// The scan has one atlas shared by skin, shirt, trousers and jacket. Work in
// bind space, so the new fabric, hem and pocket edges follow the original skin weights.
function tailor(body,original){
 const mat=body.material.clone();
 mat.name=original?'Qing navy repaired blazer':'Qing celadon piped jacket';
 mat.customProgramCacheKey=()=>mat.name;
 mat.onBeforeCompile=shader=>{
  shader.vertexShader='varying vec3 clothBind;\n'+shader.vertexShader.replace('#include <begin_vertex>',`
   #include <begin_vertex>
   clothBind=position;
   // Warp the hem continuously across the scan's sewn, shared vertices.
   // A per-vertex textile mask would open cracks along the hem and placket.
   float hem=smoothstep(.395,.51,position.y)*(1.-smoothstep(.525,.64,position.y))
      *(1.-smoothstep(.10,.14,abs(position.x)));
   transformed.y+=${original?'-.042':'.028'}*hem;
  `);
  shader.fragmentShader='varying vec3 clothBind;\n'+shader.fragmentShader.replace('#include <map_fragment>',`
   #include <map_fragment>
   vec3 p=clothBind,tex=diffuseColor.rgb;
   // On the original atlas the jacket alone is blue. Mask its fabric in
   // texture space, including shoulders, cuffs and the fabric between buttons.
   vec3 swatch=pow(tex,vec3(1./2.2));
   float navy=smoothstep(.021,.055,swatch.b-swatch.r)*smoothstep(.505,.526,p.y)
      *(1.-smoothstep(.835,.854,p.y))*(1.-smoothstep(.324,.352,abs(p.x)));
   float shade=clamp(.34+5.6*dot(tex,vec3(.22,.70,.08)),.45,1.5);
   float front=smoothstep(.045,.064,p.z);
   `+(original?`
    vec3 wool=vec3(.043,.067,.109)*shade;
    float lapel=(1.-smoothstep(.012,.019,abs(abs(p.x)-(.027+.32*(p.y-.66)))))*smoothstep(.62,.65,p.y);
    wool=mix(wool,vec3(.095,.127,.154)*shade,lapel*front);
    float mend=(1.-smoothstep(.019,.021,abs(p.x+.285)))*(1.-smoothstep(.016,.019,abs(p.y-.786)));
    wool=mix(wool,vec3(.165,.186,.195)*shade,mend);
    diffuseColor.rgb=mix(tex,wool,navy);
   `:`
    float ax=abs(p.x);
    vec3 fabric=vec3(.17,.39,.31)*shade;
    float cuff=1.-smoothstep(.003,.005,abs(ax-.294));
    float welt=smoothstep(.047,.05,ax)*(1.-smoothstep(.095,.099,ax))*
       (1.-smoothstep(.0018,.0034,abs(p.y-(.606+.12*ax))))*front;
    fabric=mix(fabric,vec3(.59,.56,.36)*shade,max(cuff,welt));
    diffuseColor.rgb=mix(tex,fabric,navy);
   `));
 };
 return mat;
}
const V=(x,y,z)=>new T.Vector3(x,y,z);
const counter=V(-14.57,.111,-9.42),shopper=V(-14.74,.111,-10.49);
const route=[counter,V(-15.07,.111,-9.85),V(-15.54,.111,-9.80),V(-15.54,.111,-9.08)];
const path=new T.CatmullRomCurve3(route,false,'centripetal');
const ease=(x,a,b)=>T.MathUtils.smoothstep(x,a,b);
const direction=(a,b)=>Math.atan2(b.x-a.x,b.z-a.z);
const turn=(a,b,t)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*t;
const displayYaw=1.36;

function hangCurtain(scene,kit){
 const root=new T.Group();root.name='Ling fitting alcove';scene.add(root);
 const {box}=kit;
 box(root,0x6c5946,-15.07,2.13,-9.11,.025,.04,.96);
 for(const z of [-9.55,-8.68])box(root,0x77664a,-15.08,2.31,z,.025,.36,.025);
 // Hang folds from a ceiling rail. The side towards the counter stays open.
 const curtain=new T.PlaneGeometry(.91,1.93,60,1),pos=curtain.attributes.position;
 for(let i=0;i<pos.count;i++)pos.setZ(i,.033*Math.cos(pos.getX(i)*Math.PI*17));
 curtain.computeVertexNormals();
 const cloth=new T.Mesh(curtain,new T.MeshStandardMaterial({color:0x94745f,side:T.DoubleSide,roughness:.98}));
 cloth.position.set(-15.08,1.15,-9.11);cloth.rotation.y=Math.PI/2;cloth.castShadow=true;root.add(cloth);
 kit.sign(root,'試身',-15.04,2.18,-9.11,.37,.15,Math.PI/2,'#36564b');
 // The sales counter runs across the shopfront with room at its left end
 // for the walk to the fitting alcove.
 box(root,0x705040,-15.22,.54,-10.93,.42,.80,1.48);
 box(root,0xbe9470,-15.22,.965,-10.93,.49,.055,1.56);
 box(root,0xb29769,-14.999,.86,-10.93,.014,.026,1.42);
}

export function createShopFitting(scene,actors,kit,refresh,handingOver){
 const qing=actors.get('aqing'),ling=actors.get('ling'),model=qing.model;
 let body;model.traverse(m=>{if(m.isSkinnedMesh && m.geometry.attributes.position && !m.morphTargetDictionary?.jawOpen){
  m.geometry.computeBoundingBox();if(m.geometry.boundingBox.min.y<.1)body=m;
 }});
 const daily=body.material,suit=tailor(body,true),jacket=tailor(body,false);
 hangCurtain(scene,kit);
 const cash=new T.Group();cash.name='Qing pays for her own jacket';scene.add(cash);cash.visible=false;
 for(const [i,c] of [0x889778,0xb38c7d,0x8396ad].entries()){
  const note=kit.box(cash,c,.006*i,i*.002,0,.13,.002,.066);note.rotation.y=.1*(i-1);
 }
 const sign=document.createElement('canvas');sign.width=200;sign.height=100;
 const ink=sign.getContext('2d');ink.fillStyle='#b4bfa2';ink.fillRect(0,0,200,100);ink.strokeStyle='#637565';ink.strokeRect(5,5,190,90);
 ink.fillStyle='#3e6354';ink.font='bold 47px Georgia';ink.fillText('50',10,56);
 const map=new T.CanvasTexture(sign);map.colorSpace=T.SRGBColorSpace;
 const note=new T.Mesh(new T.PlaneGeometry(.13,.066),new T.MeshStandardMaterial({map,side:T.DoubleSide}));
 note.position.set(.011,.006,0);note.rotation.x=-Math.PI/2;cash.add(note);
 let stage,started=0,last=0,finished=false;
 const duration={trying:8500,paying:3000};
 function dress(material){if(body.material!==material){body.material=material;refresh();}}
 function set(next){
  if(next===stage)return;
  if(stage==='paying'){kit.releaseHand('aqing','Right');kit.releaseHand('ling','Left');}
  stage=next;started=last=performance.now();finished=false;cash.visible=false;
  if(next!=='original'||!handingOver()){
   dress(next==='original'?suit:['review','paying','paid','worn'].includes(next)?jacket:daily);
  }
  if(['intro','trying','review','paid','paying'].includes(next)){
   model.position.copy(counter);
   model.rotation.y=['intro','paid'].includes(next)?direction(counter,ling.model.position):displayYaw;
  }
  refresh();
 }
 function tick(now){
  if(!duration[stage]||finished)return false;
  const t=Math.max(0,(now-started)/duration[stage]),dt=Math.min(.35,Math.max(0,(now-last)/1000));last=now;
  const before=model.position.clone(),towards=direction(counter,ling.model.position);
  if(stage==='trying'){
   const back=t>.47;
   const u=back?1-ease(t,.47,.77):ease(t,.03,.32);
   model.position.copy(path.getPointAt(u));
   const tangent=path.getTangentAt(u);
   const walk=Math.atan2(tangent.x*(back?-1:1),tangent.z*(back?-1:1));
   if(t<.03)model.rotation.y=towards;
   else if(t<.47)model.rotation.y=turn(towards,walk,ease(t,.03,.11));
   else if(t<.77)model.rotation.y=turn(walk,displayYaw,ease(t,.69,.77));
   else model.rotation.y=displayYaw-.88*ease(t,.79,.88)+.88*ease(t,.90,.97);
   if(t>.4)dress(jacket);
   const standing=t>=.77||t>=.32&&t<=.47;
   qing.step?.(standing?0:before.distanceTo(model.position),dt);
  }else{
   const approach=ease(t,0,.23)*(1-ease(t,.79,1));
   model.position.lerpVectors(counter,shopper,approach);model.rotation.y=direction(model.position,ling.model.position);
   const standing=t>=.23&&t<=.79||t>=1;
   qing.step?.(standing?0:before.distanceTo(model.position),dt);
   const pay=V(-15.14,1.23,-10.66),edge=V(.020,0,.050),receive=V(-15.42,1.06,-10.64);
   const start=model.localToWorld(V(-.13,.49,.18));
   const hand=start.lerp(pay.clone().add(edge),ease(t,.18,.47)*(1-ease(t,.64,.80)));
   if(cash.visible&&t>=.88){kit.releaseHand('aqing','Right');kit.releaseHand('ling','Left');}
   cash.visible=t>.14&&t<.88;
   if(cash.visible){
    const held=kit.coatGrip('aqing','Right',hand,1);
    const end=receive.clone().lerp(pay.sub(edge),ease(t,.36,.56)*(1-ease(t,.70,.87)));
    const accepted=kit.coatGrip('ling','Left',end,1);
    cash.position.copy(held).sub(edge).lerp(accepted.add(edge),ease(t,.56,.64));cash.rotation.set(.08,-1.18,.04);
   }
  }
  refresh();
  if(t>=1){finished=true;cash.visible=false;}
  return true;
 }
 function view(speaker){
  const focus=new T.Vector3().lerpVectors(model.position,ling.model.position,stage==='paying'?.54:speaker==='ling'?.70:.25);
  const pos=V(-12.47,1.74,-9.91);
  const paymentTime=(last-started)/duration.paying;
  const close=stage==='paying'?ease(paymentTime,0,.25)*(1-ease(paymentTime,.78,1)):0;
  pos.lerp(V(-13.50,1.79,-11.68),close);
  const aimY=1.14+.12*close;
  return {x:pos.x,y:pos.y,z:pos.z,heading:Math.atan2(focus.x-pos.x,pos.z-focus.z),
   pitch:Math.atan2(aimY-pos.y,Math.hypot(focus.x-pos.x,focus.z-pos.z))};
 }
 function finishCoat(){
  if(stage!=='original'||body.material===suit||handingOver())return false;
  dress(suit);return true;
 }
 return {set,tick,view,finishCoat,get finished(){return finished;},get wearingOriginal(){return body.material===suit;},
  get tendingCustomer(){return ['intro','trying','review','paying','paid'].includes(stage);}};
}
