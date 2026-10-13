import test from 'node:test';
import assert from 'node:assert/strict';
import { about, beatAt, check, takes, text } from './move.ts';

test('type-beat: the words rise over 0.8 s and have cleared by the end of the run', () => {
  assert.equal(beatAt(2, 5, 2).rise, 0); assert.equal(beatAt(2, 5, 2.8).rise, 1);
  assert.equal(beatAt(2, 5, 4.6).out, 0); assert.equal(beatAt(2, 5, 5).out, 1);
});

test('type-beat: two to four words; the example; the words for the sweep', () => {
  const { move, at: _a, until: _u, ...inputs } = about.example.moves[0];
  assert.equal(move, 'type-beat'); assert.equal(check(inputs), null);
  assert.match(check({ text: 'One' }), /two to four words/);
  assert.match(check({ text: 'One two three four five' }), /two to four words/);
  assert.match(check({}), /two to four words/);
  assert.deepEqual(text(inputs), ['Now the webhook']);
  assert.equal(takes(), 1.6);
});
