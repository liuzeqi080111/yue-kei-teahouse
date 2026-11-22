import * as T from 'three';

const v=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const shortName=bone=>bone.name.replace(/^mixamorig[:_]?/,'');

// Extract the character's original painted, weighted skin, sleeve and phalanges.
// The grip frame is in metres, centred on the wrist; +Y runs along the fingers
// and +Z faces the palm. There is no second character download or shared pose.
export function createPlayerForearm(player,side='Right'){
 const root=new T.Group(),bones={},rest={};
 let source;
 player.model.traverse(mesh=>{
  if(!mesh.isSkinnedMesh||!mesh.geometry.attributes.color)return;
  const {skinIndex,skinWeight}=mesh.geometry.attributes;
  const wrist=mesh.skeleton.bones.findIndex(b=>shortName(b)===side+'Hand');
  for(let i=0;i<skinIndex.count;i++){
   if(skinIndex.getX(i)===wrist&&skinWeight.getX(i)>.30){source=mesh;break;}
  }
 });
 if(!source)throw Error('Missing player '+side+' hand skin');
 const sourceRig=source.skeleton,bind={};
 sourceRig.bones.forEach((b,i)=>{bind[shortName(b)]=sourceRig.boneInverses[i].clone().invert();});
 const at=name=>v().setFromMatrixPosition(bind[side+'Hand'+name]);
 const wrist=at(''),y=at('Middle1').sub(wrist).normalize();
 const x=at('Index1').sub(at('Pinky1')).multiplyScalar(side==='Right'?1:-1);
 x.addScaledVector(y,-x.dot(y)).normalize();
 const z=x.clone().cross(y);
 const frame=new T.Matrix4().makeBasis(x,y,z).setPosition(wrist).invert();
 const size=player.model.scale.x;
 const intoGrip=new T.Matrix4().makeScale(size,size,size).multiply(frame);
 const matrices={},rig=[];
 for(const b of sourceRig.bones){
  const name=shortName(b);
  if(name!==side+'ForeArm'&&!name.startsWith(side+'Hand'))continue;
  bones[name]=new T.Bone();bones[name].name=name;rig.push(bones[name]);
  const matrix=intoGrip.clone().multiply(bind[name]);
  // Converting translations to metres does not scale a bone's local axes.
  matrices[name]=new T.Matrix4().extractRotation(matrix).setPosition(v().setFromMatrixPosition(matrix));
 }
 for(const b of sourceRig.bones){
  const name=shortName(b),bone=bones[name];if(!bone)continue;
  const parentName=shortName(b.parent),parent=bones[parentName];
  const local=parent?matrices[parentName].clone().invert().multiply(matrices[name]):matrices[name];
  local.decompose(bone.position,bone.quaternion,bone.scale);(parent||root).add(bone);
  rest[name]=bone.quaternion.clone();
 }
 root.updateMatrixWorld(true);
 const skeleton=new T.Skeleton(rig);
 const g=source.geometry,a=g.attributes,sourceIndex=g.index;
 const mapped=sourceRig.bones.map(b=>rig.indexOf(bones[shortName(b)]));
 const armIndex=rig.indexOf(bones[side+'ForeArm']),points=[],normals=[],colors=[],indices=[],weights=[],faces=[];
 const kept=new Map(),point=v();
 const meshFrame=intoGrip.clone().multiply(source.bindMatrix),normalFrame=new T.Matrix3().getNormalMatrix(meshFrame);
 const accepted=new Uint8Array(a.position.count);
 for(let i=0;i<accepted.length;i++){
  point.fromBufferAttribute(a.position,i).applyMatrix4(meshFrame);
  accepted[i]=point.y>-.31&&point.y<.26&&Math.abs(point.x)<.145&&Math.abs(point.z)<.13;
 }
 function vertex(i){
  if(kept.has(i))return kept.get(i);
  const n=kept.size;kept.set(i,n);
  points.push(...point.fromBufferAttribute(a.position,i).applyMatrix4(meshFrame).toArray());
  normals.push(...point.fromBufferAttribute(a.normal,i).applyNormalMatrix(normalFrame).toArray());
  colors.push(a.color.getX(i),a.color.getY(i),a.color.getZ(i));
  for(let j=0;j<4;j++){
   const mappedIndex=mapped[a.skinIndex.getComponent(i,j)];
   indices.push(mappedIndex<0?armIndex:mappedIndex);weights.push(a.skinWeight.getComponent(i,j));
  }
  return n;
 }
 for(let i=0;i<sourceIndex.count;i+=3){
  const a=sourceIndex.getX(i),b=sourceIndex.getX(i+1),c=sourceIndex.getX(i+2);
  if(accepted[a]&&accepted[b]&&accepted[c])faces.push(vertex(a),vertex(b),vertex(c));
 }
 const geo=new T.BufferGeometry();
 geo.setAttribute('position',new T.Float32BufferAttribute(points,3));
 geo.setAttribute('normal',new T.Float32BufferAttribute(normals,3));
 geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));
 geo.setAttribute('skinIndex',new T.Uint16BufferAttribute(indices,4));
 geo.setAttribute('skinWeight',new T.Float32BufferAttribute(weights,4));geo.setIndex(faces);
 const mesh=new T.SkinnedMesh(geo,source.material);mesh.name='Player '+side+' hand and sleeve';
 mesh.frustumCulled=false;mesh.bind(skeleton,new T.Matrix4());root.add(mesh);
 return {root,bones,rest};
}

function woodenSlat(){
 // Local X points along the board, Z through its two broad striking faces.
 const shape=new T.Shape();
 shape.moveTo(.012,-.009);shape.quadraticCurveTo(.018,-.008,.018,0);
 shape.quadraticCurveTo(.018,.009,.011,.010);shape.lineTo(-.056,.011);
 shape.quadraticCurveTo(-.105,.014,-.148,.017);
 shape.quadraticCurveTo(-.162,.017,-.162,.002);
 shape.quadraticCurveTo(-.162,-.015,-.152,-.016);
 shape.quadraticCurveTo(-.093,-.011,-.052,-.0095);shape.closePath();
 const geo=new T.ExtrudeGeometry(shape,{depth:.008,bevelEnabled:true,bevelSize:.0008,bevelThickness:.0008,bevelSegments:2});
 geo.translate(0,0,-.004);
 const pos=geo.attributes.position,colors=[];
 for(let i=0;i<pos.count;i++){
  const shade=.5+.5*Math.sin(pos.getY(i)*1500+1.2*Math.sin(pos.getX(i)*31));
  const c=new T.Color(0x71422b).lerp(new T.Color(0x925231),shade*.5);
  colors.push(c.r,c.g,c.b);
 }
 geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));
 const slat=new T.Mesh(geo,new T.MeshStandardMaterial({vertexColors:true,roughness:.50}));
 return slat;
}

export function createReunionBoards(player,camera){
 const {root,bones,rest}=createPlayerForearm(player,'Left');
 const rig=new T.Group();rig.name='Held clappers';camera.add(rig);rig.add(root);
 const grip=new T.Group();root.add(grip);
 const wrist=bones.LeftHand;
 const flexAxis=v(1,0,0).applyQuaternion(wrist.getWorldQuaternion(new T.Quaternion()).invert().multiply(root.getWorldQuaternion(new T.Quaternion())));
 wrist.attach(grip);
 const fixed=woodenSlat(),moving=woodenSlat();
 fixed.name='Palm board';moving.name='Finger board';
 grip.add(fixed,moving);
 const pivot=v(.040,.084,.0325),width=.0096;
 fixed.position.copy(pivot);moving.position.copy(pivot);moving.position.z+=width;
 // Two loops pass around the butt ends; fingers control the free end.
 for(const off of [-.002,.005]){
  const curve=new T.CatmullRomCurve3([v(.003+off,-.011,-.006),v(.003+off,.0105,-.006),v(.003+off,.012,.012),v(.003+off,.0105,.017),v(.003+off,-.011,.017),v(.003+off,-.0125,.005)],true);
  const cord=new T.Mesh(new T.TubeGeometry(curve,32,.0011,6,true),new T.MeshStandardMaterial({color:0x813e29,roughness:.92}));
  fixed.add(cord);
 }
 const joints=['Index','Middle','Ring','Pinky','Thumb'].map(f=>[1,2,3,4].map(i=>bones['LeftHand'+f+i]));
 const spread=.185;
 // Pad targets relative to the outer board at rest and at contact. These
 // account for the different lengths and pad thicknesses in the player mesh.
 const pads=[[.013,-.005,.013,-.005],[.007,.001,.010,.016],[-.002,.008,.014,.022],[-.001,.010,.017,.019]];
 // Set a phalanx direction in grip space while preserving its bind-pose twist.
 function point(joint,child,direction){
  const p=joint.getWorldPosition(v()),from=child.getWorldPosition(v()).sub(p).normalize();
  const world=direction.clone().applyQuaternion(grip.getWorldQuaternion(new T.Quaternion()));
  const q=joint.parent.getWorldQuaternion(new T.Quaternion());
  joint.quaternion.premultiply(q.clone().invert().multiply(new T.Quaternion().setFromUnitVectors(from,world.normalize())).multiply(q));
 }
 function grasp(angle){
  // The moving outer face at x is a different depth for each fingertip.
  for(let f=0;f<5;f++){
   const chain=joints[f];for(const joint of chain)joint.quaternion.copy(rest[joint.name]);
   if(f===4){
    // Thumb opposes the four pads at the edge nearest the wrist.
    point(chain[0],chain[1],v(-.88,.44,.035));
    point(chain[1],chain[2],v(-.98,.13,-.18));
    point(chain[2],chain[3],v(-.98,.13,-.14));
    continue;
   }
   const base=grip.worldToLocal(chain[0].getWorldPosition(v()));
   const outer=pivot.z+width+.019*Math.sin(angle)+.0048/Math.cos(angle)+(pivot.x-base.x)*Math.tan(angle);
   const opening=angle/spread,[y0,z0,y1,z1]=pads[f];
   const pad=v(base.x,pivot.y+T.MathUtils.lerp(y0,y1,opening),outer+T.MathUtils.lerp(z0,z1,opening));
   const distal=v(-.055,-.94,-.33).normalize();
   const dip=pad.clone().addScaledVector(distal,-chain[3].position.length());
   const axis=dip.sub(base),l1=chain[1].position.length(),l2=chain[2].position.length();
   const reach=T.MathUtils.clamp(axis.length(),Math.abs(l1-l2)+.0001,l1+l2-.0001);
   axis.normalize();
   const along=(reach*reach+l1*l1-l2*l2)/(2*reach);
   const pole=v(0,axis.z,-axis.y).normalize();
   const pip=axis.clone().multiplyScalar(along).addScaledVector(pole,Math.sqrt(Math.max(0,l1*l1-along*along)));
   point(chain[0],chain[1],pip);
   point(chain[1],chain[2],axis.multiplyScalar(reach).sub(pip));
   point(chain[2],chain[3],distal);
  }
 }
 let pressed=-Infinity,contact=-Infinity,onContact=null,previousAngle=-1;
 function strike(callback){
  if(!rig.visible)return;
  pressed=performance.now();contact=-Infinity;onContact=callback;
 }
 function tick(now){
  if(!rig.visible){pressed=-Infinity;contact=-Infinity;onContact=null;return;}
  const dt=now-pressed,open=spread;
  let angle=open,recoil=0,landed=false;
  if(Number.isFinite(pressed)){
   if(dt<72){angle=open*(1-T.MathUtils.smootherstep(dt,0,72));}
   else{
    if(!Number.isFinite(contact)){contact=now;landed=true;}
    const released=T.MathUtils.smootherstep(now-contact,28,162);
    angle=open*released;recoil=Math.sin(Math.PI*released)*.048;
    if(released===1)pressed=-Infinity;
   }
  }
  moving.rotation.y=angle;
  // Flush faces meet at zero; allow a tiny hinge offset while opening to avoid
  // intersection behind the tied end.
  moving.position.z=pivot.z+width+.019*Math.sin(angle);
  const vertical=Math.tan(T.MathUtils.degToRad(camera.fov)/2)*.46;
  const horizontal=vertical*camera.aspect;
  rig.position.set(-horizontal*.75,-Math.min(vertical*.49,.156),-.46);
  rig.scale.setScalar(.82);rig.rotation.set(-.62,0,-1.07+recoil*.45);
  root.rotation.x=.40;
  wrist.quaternion.copy(rest.LeftHand).multiply(new T.Quaternion().setFromAxisAngle(flexAxis,.105*(1-angle/open)-recoil));
  if(angle!==previousAngle){grasp(angle);previousAngle=angle;}
  if(landed){onContact?.();onContact=null;}
 }
 return {rig,tick,strike,slats:[fixed,moving]};
}
