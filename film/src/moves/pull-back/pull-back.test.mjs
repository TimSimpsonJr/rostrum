import test from 'node:test';
import assert from 'node:assert/strict';
import { START, about, check, pullAt, takes } from './move.ts';

test('pull-back: it lands at twice the size and pulls back in one stroke, most of the way in the first third', () => {
  assert.equal(pullAt(0), START); assert.equal(pullAt(1), 1); assert.equal(pullAt(2), 1);
  let last = pullAt(0);
  for (let f = 1; f <= 24; f++) { const s = pullAt(f / 24); assert.ok(s <= last && s >= 1, `frame ${f}`); last = s; }
  assert.ok(pullAt(8 / 24) < 1.35, 'two thirds of the way back by the end of the attack');
  assert.ok(pullAt(23 / 24) - 1 < 0.001, 'and no step on the last frame');
});

test('pull-back: the stage is the new shot\'s from the first frame, the page is whole, check and the example', () => {
  const { move, ...inputs } = about.example.cut;
  assert.equal(move, 'pull-back'); assert.equal(about.use, 'cut'); assert.equal(check(inputs), null);
  assert.equal(about.toneAt, 0); assert.equal(about.whole, true); assert.equal(about.cursor, 'fades');
  assert.match(check({}), /from is a name/); assert.match(check({ from: 3 }), /from is a name/);
  assert.equal(takes(), 0.8);
});
