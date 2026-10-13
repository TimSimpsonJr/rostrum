import test from 'node:test';
import assert from 'node:assert/strict';
import { about, check, digitsOf, takes, text, valueAt } from './move.ts';

test('counter: the roll is exact at both ends, never past either, and moves in between; check, text, digits', () => {
  assert.equal(valueAt(0, 77, 2, 3.3, 1), 0); assert.equal(valueAt(0, 77, 2, 3.3, 2), 0);
  assert.equal(valueAt(0, 77, 2, 3.3, 3.3), 77); assert.equal(valueAt(0, 77, 2, 3.3, 9), 77);
  let last = 0;
  for (let f = 0; f <= 39; f++) { const v = valueAt(0, 77, 2, 3.3, 2 + f / 30); assert.ok(v >= last && v <= 77, `frame ${f}`); last = v; }
  assert.ok(Math.abs(valueAt(0, 77, 2, 3.3, 2.65) - 38.5) < 1e-9, 'half way at half time');
  assert.equal(valueAt(40, 10, 0, 1, 0.5), 25, 'it rolls down too');
  const { move, at: _a, until: _u, ...inputs } = about.example.moves[0];
  assert.equal(move, 'counter'); assert.equal(check(inputs), null);
  assert.deepEqual(text(inputs), ['77', 'programs'], 'the quantity is read by the sweep like any authored text');
  assert.deepEqual(text({ to: 9, from: 12 }), ['9', '12']);
  assert.equal(digitsOf(inputs), 2); assert.equal(digitsOf({ to: 9, from: 120 }), 3); assert.equal(digitsOf({ to: 0 }), 1);
  assert.equal(takes(), 1.6);
  for (const bad of [{}, { to: 7.5 }, { to: -1 }, { to: '77' }, { to: 1e6 }]) assert.match(check(bad), /to:/, JSON.stringify(bad));
  assert.match(check({ to: 7, from: 0.5 }), /from:/);
  assert.match(check({ to: 7, label: 'x'.repeat(41) }), /label/);
});
