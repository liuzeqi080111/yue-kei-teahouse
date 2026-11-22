import * as T from 'three';

export const reunionSaveKey='yuekei-story-trial-v1:reunion';
export const isPrint=value=>typeof value==='string'&&value.startsWith('data:image/jpeg;base64,');
export function savedPrint(){
 try{return JSON.parse(localStorage.getItem(reunionSaveKey))?.photo;}catch{return null;}
}

// All three dining-room views share these wall coordinates and the same print.
export function createReunionWall(scene){
 const frame=new T.Group();
 frame.name='ReunionPortrait';frame.position.set(3.50,1.76,-1.66);frame.rotation.y=-Math.PI/2;
 frame.visible=false;scene.add(frame);
 function mount(w,h,depth,z,colour){
  const mesh=new T.Mesh(new T.BoxGeometry(w,h,depth),new T.MeshStandardMaterial({color:colour}));
  mesh.position.z=z;frame.add(mesh);
 }
 mount(1.46,1.06,.045,0,0x845a3e);mount(1.39,.99,.018,.027,0xefe2bf);
 const face=new T.Mesh(new T.PlaneGeometry(1.25,.833),new T.MeshBasicMaterial());
 face.position.set(0,.046,.041);frame.add(face);
 const label=document.createElement('canvas');label.width=600;label.height=72;
 const ink=label.getContext('2d');ink.fillStyle='#eee2c7';ink.fillRect(0,0,600,72);
 ink.fillStyle='#5d3829';ink.textAlign='center';ink.font='48px KaiTi,serif';ink.fillText('年三十　·　粵記街坊',300,52);
 const caption=new T.CanvasTexture(label);caption.colorSpace=T.SRGBColorSpace;
 const legend=new T.Mesh(new T.PlaneGeometry(.92,.10),new T.MeshBasicMaterial({map:caption}));
 legend.position.set(0,-.43,.042);frame.add(legend);
 let current;
 return function show(url){
  if(current===url)return;
  current=url;frame.visible=false;
  if(!isPrint(url))return;
  new T.TextureLoader().load(url,tex=>{
   if(current!==url){tex.dispose();return;}
   tex.colorSpace=T.SRGBColorSpace;face.material.map?.dispose();face.material.map=tex;
   face.material.needsUpdate=true;frame.visible=true;
  });
 };
}
