import assert from 'node:assert/strict';
import {voiceUrl} from '../voice-endpoint.js';
globalThis.document={documentElement:{dataset:{}}};
assert.equal(voiceUrl('/api/voice/status'),'/api/voice/status');
document.documentElement.dataset.voiceApi='https://example.test';
for(const action of ['status','transcribe','interpret','speak'])assert.equal(voiceUrl('/api/voice/'+action),'https://example.test/api/voice/'+action);
console.log('PASS voice endpoints: local same-origin and cloud routes');
