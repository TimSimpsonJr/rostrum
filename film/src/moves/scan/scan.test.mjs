import test from 'node:test';
import assert from 'node:assert/strict';
import { SLOWEST, about, check, scanAt, takes } from './move.ts';

test('scan: the light crosses once, steadily, with the rest dimmed while it does; a long line does not slow it past its limit', () => {
  assert.deepEqual(scanAt(2, 3.4, 1), { k: 0, dim: 0 }, 'nothing before');
  assert.deepEqual(scanAt(2, 3.4, 2), { k: 0, dim: 0 });
  assert.equal(scanAt(2, 3.4, 3.4).k, 1);
  assert.ok(Math.abs(scanAt(2, 3.4, 2.7).k - 0.5) < 1e-6, 'half way at half time');
  assert.equal(scanAt(2, 3.4, 2.7).dim, 1, 'fully dimmed mid-pass');
  let last = { k: 0 };
  for (let f = 0; f <= 60; f++) { const s = scanAt(2, 3.4, 2 + f / 30); assert.ok(s.k >= last.k && s.k <= 1 && s.dim >= 0 && s.dim <= 1, `frame ${f}`); last = s; }
  assert.deepEqual(scanAt(2, 3.4, 4), { k: 1, dim: 0 }, 'the dimming is gone after the pass');
  // to a far cue: the pass is over in SLOWEST seconds, not stretched over the line
  assert.equal(scanAt(2, 12, 2 + SLOWEST).k, 1);
  assert.ok(scanAt(2, 12, 2 + SLOWEST / 2).k > 0.49);
  assert.equal(scanAt(2, 12, 2 + SLOWEST + 0.2).dim, 0);
});

test('scan: check and the example', () => {
  const { move, at: _a, until: _u, ...inputs } = about.example.moves[0];
  assert.equal(move, 'scan'); assert.equal(check(inputs), null);
  assert.equal(check({}), null); assert.equal(check({ kind: 'cone' }), null);
  assert.match(check({ kind: 'beam' }), /line or cone/); assert.match(check({ target: 3 }), /target/);
  assert.equal(takes(), 1.4);
});
