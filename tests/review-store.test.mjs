import assert from 'node:assert/strict';
import { createReviewStore } from '../review-store.js';

const data = new Map([['unrelated', 'keep']]);
const storage = { getItem: key => data.get(key), setItem: (key,value) => data.set(key,value), removeItem: key => data.delete(key) };
let date = 1_800_000_000_000;
const now = () => date;
let review = createReviewStore({ storage, now });
const round = (phraseId, fields) => ({ phrases:[{ phraseId, attemptCount:1, ...fields }], rawTranscript:'must not be saved' });

const missed = round('water', { matched:false, needsReview:true });
review.saveRound('session1-round1', missed);
review.saveRound('session1-round1', missed);
assert.equal(review.snapshot().phrases[0].attemptCount, 1);
assert.equal(review.snapshot().phrases[0].needsReview, false);
review.saveRound('session1-round2', round('pay', { matched:true, hinted:true, needsReview:true }));

review = createReviewStore({ storage, now });
assert.deepEqual(review.recommend(1), ['pay']);
review.snapshot().phrases[0].attemptCount = 99;
assert.equal(review.snapshot().phrases[0].attemptCount, 1);
date += 60_000;
review.saveRound('session2-round1', round('pay', { matched:true, independent:true }));
assert.equal(review.snapshot().phrases.find(p => p.phraseId === 'pay').needsReview, false);
const before = review.snapshot().phrases.find(p => p.phraseId === 'pay');
date += 60_000;
review.noteReview('pay', {hinted:true});
const after = createReviewStore({storage,now}).snapshot().phrases.find(p => p.phraseId === 'pay');
assert.equal(after.attemptCount, before.attemptCount);
assert.equal(after.independent, before.independent);
assert.notEqual(after.lastPracticedAt, before.lastPracticedAt);
assert.equal(after.needsReview,true);
assert.equal([...data.values()].join(' ').includes('must not be saved'), false);

review.clear();
assert.equal(data.get('unrelated'), 'keep');
assert.equal(createReviewStore({ storage, now }).snapshot().phrases.length, 0);
const unavailable = { getItem(){throw Error()}, setItem(){throw Error()}, removeItem(){throw Error()} };
const fallback = createReviewStore({ storage:unavailable, now });
fallback.saveRound('session1-round1', missed);
assert.equal(fallback.snapshot().phrases.length, 1);
assert.equal(createReviewStore({storage:{getItem:()=>'{malformed'},now}).snapshot().phrases.length,0);
console.log('PASS review store: persistence, dedupe, recommendations, privacy and storage failure');
