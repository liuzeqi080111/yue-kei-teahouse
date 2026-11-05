import assert from 'node:assert/strict';
import { createPracticeLog } from '../learning-progress.js';

const log = createPracticeLog();
const round = 3;
log.begin(round);
const record = (attemptId, phraseId, mode, matched, editedTranscript = false) =>
 log.record({ round, attemptId, phraseId, mode, matched, editedTranscript });

assert.equal(record(1, 'greeting', 'click', true).independent, false);
assert.equal(record(2, 'menu', 'text', true).independent, false);
assert.equal(record(3, 'bill', 'voice', true, true).mode, 'text');
log.markHint(round, 'water', 'frame');
assert.equal(record(4, 'water', 'voice', true).independent, false);
assert.equal(record(5, 'utensils', 'voice', false).independent, false);
assert.equal(record(6, 'tea', 'voice', true).independent, true);
log.markHint(round, 'tea', 'audio');
assert.equal(log.snapshot(round).totals.independentAttemptCount, 1);
assert.equal(record(6, 'tea', 'voice', true).reason, 'duplicate-attempt');
assert.equal(record(7, 'tea', 'voice', 'true').independent, false);
log.snapshot(round).attempts[0].mode = 'voice';
assert.equal(log.snapshot(round).attempts[0].mode, 'click');

log.begin(round);
assert.equal(log.snapshot(round).attempts.length, 7);
log.begin(round + 1);
assert.equal(record(8, 'tea', 'voice', true).reason, 'stale-round');
assert.equal(log.snapshot(round + 1).attempts.length, 0);
console.log('PASS practice log: input modes, matched targets, hints, dedupe and restart');
