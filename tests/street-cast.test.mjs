import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {SHOPS,SHOP_CUSTOMERS,PASSERS,streetVoiceIds} from '../street-space.js';
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

test('街上、柜台两侧和剧情人物各用独立面部网格，扫描角色有独立贴图',()=>{
 const positions=new Set(),textures=new Set();
 const layout=JSON.parse(readFileSync(new URL('../assets/street/walk.json',import.meta.url)));
 const mainCast=layout.characters.map(person=>person.id+'-styled-v3');
 // The juice seller is the vendor from the main cast.
 const scans=[...Object.keys(SHOPS).filter(id=>id!=='juiceCart'),...Object.values(SHOP_CUSTOMERS),
  ...Object.values(PASSERS).map(person=>person.model)];
 for(const local of [...mainCast,...scans.map(id=>'shopkeepers/'+id)]){
  const bytes=readFileSync(new URL('../assets/street/'+local+'.glb',import.meta.url));
  assert.equal(bytes.toString('ascii',0,4),'glTF',local);
  assert.equal(bytes.readUInt32LE(8),bytes.length,local);
  const length=bytes.readUInt32LE(12),gltf=JSON.parse(bytes.subarray(20,20+length));
  const binary=bytes.subarray(length+28);
  const fingerprint=index=>{
   const {byteOffset=0,byteLength}=gltf.bufferViews[index];
   return createHash('sha256').update(binary.subarray(byteOffset,byteOffset+byteLength)).digest('hex');
  };
  const face=gltf.meshes.find(mesh=>mesh.extras?.targetNames?.includes('jawOpen'));
  assert.ok(face,local+' missing facial rig');
  const geometry=fingerprint(gltf.accessors[face.primitives[0].attributes.POSITION].bufferView);
  assert.ok(!positions.has(geometry),local+' reused facial mesh');positions.add(geometry);
  if(!local.startsWith('shopkeepers/'))continue;
  const texture=fingerprint(gltf.images[0].bufferView);
  assert.ok(!textures.has(texture),local+' reused image');textures.add(texture);
  assert.deepEqual(gltf.meshes[0].extras.targetNames,['workLeft','workRight','lookDown']);
  assert.equal(gltf.meshes[0].primitives[0].targets.length,3);
 }
});
