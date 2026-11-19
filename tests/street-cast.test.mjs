import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {SHOPS,streetVoiceIds} from '../street-space.js';
import {characterVoice,prepareVoiceRecording,speechRequest} from '../voice-clips.js';
import {ROLE_CLIPS} from '../fp1-clips.js';

test('街坊各自有固定配音，门口阿明的音高与重听速度独立',async()=>{
 for(const id of streetVoiceIds){
  assert.ok(characterVoice(id),id);
  assert.equal(speechRequest('你好',id).speakerId,id);
  if(id!=='intro')assert.ok(Object.keys(ROLE_CLIPS).some(key=>key.startsWith(id+'|')),id);
 }
 assert.equal(characterVoice('buyer').voice,'Kiki');
 const file=ROLE_CLIPS['ming|你好呀，想問啲乜？'];
 const original=readFileSync(new URL('../'+file,import.meta.url));
 const recording=await prepareVoiceRecording(new Blob([original]),'ming');
 const adjusted=Buffer.from(await recording.blob.arrayBuffer());
 assert.equal(adjusted.readUInt32LE(24),Math.round(original.readUInt32LE(24)*.84));
 assert.deepEqual(adjusted.subarray(44),original.subarray(44));
 assert.ok(Math.abs(recording.rate*.84-.97)<1e-8);
});

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
