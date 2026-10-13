import test from 'node:test';
import assert from 'node:assert/strict';
import { about, check, countAt, text } from './move.ts';

test('step-counter: sets in 0.3 s, stays to the end of its run, clears in 0.3 s', () => {
  assert.deepEqual(countAt(2, 5, 1.9), { k: 0, out: 0 });
  assert.equal(countAt(2, 5, 2.3).k, 1);
  assert.equal(countAt(2, 5, 5).out, 0); assert.equal(countAt(2, 5, 5.3).out, 1);
});

test('step-counter: whole numbers in range; the phrase the frames show is what the sweep reads', () => {
  const { move, at: _a, until: _u, ...inputs } = about.example.moves[0];
  assert.equal(move, 'step-counter'); assert.equal(check(inputs), null);
  assert.deepEqual(text(inputs), ['2 of 5']);
  assert.deepEqual(about.text, [], 'its inputs are numbers: no input is an authored string');
  assert.match(check({ step: 6, of: 5 }), /whole numbers/);
  assert.match(check({ step: 1, of: 13 }), /whole numbers/);
  assert.match(check({ step: 0, of: 5 }), /whole numbers/);
  assert.match(check({ step: 1.5, of: 5 }), /whole numbers/);
});
