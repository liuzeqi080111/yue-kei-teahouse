import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {SHOPS} from '../street-space.js';

test('每位店主有独立贴图与几何，柜边工作姿势与网页载入格式一致',()=>{
 const positions=new Set(),textures=new Set();
 for(const id of Object.keys(SHOPS)){
  const local=id==='juiceCart'?'vendor-styled-v3':'shopkeepers/'+id;
  const bytes=readFileSync(new URL('../assets/street/'+local+'.glb',import.meta.url));
  assert.equal(bytes.toString('ascii',0,4),'glTF',id);
  assert.equal(bytes.readUInt32LE(8),bytes.length,id);
  const length=bytes.readUInt32LE(12),gltf=JSON.parse(bytes.subarray(20,20+length));
  const binary=bytes.subarray(length+28);
  const fingerprint=index=>{
   const {byteOffset=0,byteLength}=gltf.bufferViews[index];
   return createHash('sha256').update(binary.subarray(byteOffset,byteOffset+byteLength)).digest('hex');
  };
  const primitive=gltf.meshes[0].primitives[0],geometry=fingerprint(gltf.accessors[primitive.attributes.POSITION].bufferView);
  assert.ok(!positions.has(geometry),id+' reused mesh');positions.add(geometry);
  if(id==='juiceCart')continue;
  const texture=fingerprint(gltf.images[0].bufferView);
  assert.ok(!textures.has(texture),id+' reused image');textures.add(texture);
  assert.deepEqual(gltf.meshes[0].extras.targetNames,['workLeft','workRight','lookDown']);
  assert.equal(primitive.targets.length,3);
 }
});
