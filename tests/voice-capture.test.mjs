import assert from 'node:assert/strict';
import {preparePcm} from '../voice-capture.js';
assert.equal(preparePcm(new Float32Array(16000)).reason,'no_signal');
for(const amplitude of [.006,.0003,.00001]){const input=new Float32Array(16000);for(let i=0;i<input.length;i++)input[i]=amplitude*Math.sin(i*.1);const copy=input.slice(),r=preparePcm(input);assert.equal(r.valid,true);assert.equal(r.samples.length,input.length);assert.ok(r.gain<=20&&r.gain>=1);assert.deepEqual(input,copy);assert.ok(r.peak>amplitude);}
assert.equal(preparePcm(new Float32Array([.5])).reason,'too_short');
console.log('PASS very quiet speech retained, full utterance preserved, bounded gain, digital silence/short rejected');
