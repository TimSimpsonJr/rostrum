import test from 'node:test';
import assert from 'node:assert/strict';
import { about, check, dimAt, featherOf, takes, windowOf } from './move.ts';

test('spotlight: the dim comes on in 0.3 s, holds, and is gone by the end; the window is the element grown evenly', () => {
  assert.equal(dimAt(2, 4, 1.9), 0); assert.equal(dimAt(2, 4, 2), 0);
  assert.equal(dimAt(2, 4, 2.3), 1); assert.equal(dimAt(2, 4, 3.7), 1); assert.equal(dimAt(2, 4, 4), 0);
  for (let f = 0; f <= 60; f++) { const d = dimAt(2, 4, 2 + f / 30); assert.ok(d >= 0 && d <= 1, `frame ${f}`); }
  const b = { x: 100, y: 200, w: 300, h: 50 }, w = windowOf(b);
  assert.ok(Math.abs((b.x - w.x) - (w.x + w.w - b.x - b.w)) < 1e-9 && Math.abs((b.y - w.y) - (w.y + w.h - b.y - b.h)) < 1e-9 && w.w > b.w && w.h > b.h);
  // tight: the box itself, and a small feather (a row of a table in a dialog lights nothing past it)
  assert.deepEqual(windowOf(b, true), b);
  assert.ok(featherOf(true) <= 4 && featherOf(true) < featherOf());
});

test('spotlight: check and the example', () => {
  const { move, at: _a, until: _u, ...inputs } = about.example.moves[0];
  assert.equal(move, 'spotlight'); assert.equal(check(inputs), null);
  assert.match(check({}), /target/); assert.match(check({ target: ' ' }), /target/);
  assert.equal(check({ target: 'row', tight: true }), null); assert.match(check({ target: 'row', tight: 'yes' }), /tight/);
  assert.equal(takes(), 1.2);
});
