import assert from 'node:assert/strict';
import { MENU } from '../teahouse-scene/index.js';
import { PHRASES, buildOrderPhrase } from '../learning-phrases.js';

const strip = value => value.replace(/[\s\p{P}]/gu, '');
function checkAlignment(phrase) {
 assert.equal(strip(phrase.parts.join('')), strip(phrase.cantonese), phrase.id);
 const syllables = phrase.jyutping.match(/[a-z]+[1-6]/g) ?? [];
 assert.equal(syllables.length, [...strip(phrase.cantonese)].length, phrase.id);
 assert.equal(strip(syllables.join('')), strip(phrase.jyutping), phrase.id);
}

for (const phrase of PHRASES) checkAlignment(phrase);
assert.equal(new Set(PHRASES.map(phrase => phrase.id)).size, PHRASES.length);

for (const item of MENU) {
 if (!item.available) {
  assert.equal(buildOrderPhrase(item), null);
  continue;
 }
 const options = Object.entries(item.options).reduce(
  (acc, [key, values]) => acc.flatMap(previous => values.map(value => ({...previous, [key]: value}))),
  [{}]
 );
 for (const selection of options) {
  const phrase = buildOrderPhrase(item, selection);
  assert.ok(phrase?.cantonese.includes(item.name), item.id);
  checkAlignment(phrase);
  if (selection.temperature) assert.ok(phrase.cantonese.includes(selection.temperature));
  if (selection.sweetness) assert.ok(phrase.cantonese.includes(selection.sweetness));
 }
 assert.equal(buildOrderPhrase(item, { temperature: '室溫' }), null);
}
const horlicks = MENU.find(item => item.id === 'drink-horlicks');
assert.equal(buildOrderPhrase(horlicks, { sweetness: '少甜' }), null);
console.log('PASS learning phrases: character and tone alignment; all legal options and representative illegal options');
