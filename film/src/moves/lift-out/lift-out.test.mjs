import test from 'node:test';
import assert from 'node:assert/strict';
import { about, check, heroOf, liftAt, recedes, takes } from './move.ts';

test('lift-out: the element is up over 0.6 s, stays, and is back in its place when its run ends; the screen recedes as far as it is out', () => {
  assert.equal(liftAt(2, 5, 1.9), 0); assert.equal(liftAt(2, 5, 2), 0);
  assert.equal(liftAt(2, 5, 2.6), 1); assert.equal(liftAt(2, 5, 4.4), 1);
  assert.ok(Math.abs(liftAt(2, 5, 2.3) - 0.5) < 1e-9 && Math.abs(liftAt(2, 5, 4.7) - 0.5) < 1e-9, 'half way at half time, up and down');
  assert.equal(liftAt(2, 5, 5), 0); assert.equal(liftAt(2, 5, 6), 0);
  let last = 0;
  for (let f = 0; f <= 18; f++) { const k = liftAt(2, 5, 2 + f / 30); assert.ok(k >= last && k <= 1, `frame ${f}`); last = k; }
  assert.equal(recedes(2.3, 2, 5), liftAt(2, 5, 2.3));
  // its shortest run (1.5 s) still has the element fully out for a moment
  assert.equal(liftAt(0, takes(), 0.75), 1);
});

test('lift-out: out, the element keeps its shape and stands in the middle at its strength of the frame\'s width, or as tall as the frame allows', () => {
  const field = { x: 700, y: 500, w: 400, h: 40 };
  const near = (a, b) => Math.abs(a - b) < 1e-9, h = heroOf(field);
  assert.ok(near(h.w, 0.72 * 1920) && near(h.h, h.w / 10) && near(h.x + h.w / 2, 960) && near(h.y + h.h / 2, 540), JSON.stringify(h));
  assert.ok(near(heroOf(field, 1).w, 0.6 * 1920) && near(heroOf(field, 3).w, 0.85 * 1920));
  const tall = heroOf({ x: 0, y: 0, w: 300, h: 600 }, 3);
  assert.ok(Math.abs(tall.h - 0.78 * 1080) < 1e-9 && Math.abs(tall.w / tall.h - 0.5) < 1e-9 && Math.abs(tall.x + tall.w / 2 - 960) < 1e-9);
});

test('lift-out: check, what it lifts, and the example', () => {
  const { move, at: _a, until: _u, ...inputs } = about.example.moves[0];
  assert.equal(move, 'lift-out'); assert.equal(check(inputs), null);
  assert.deepEqual(about.lifts, ['node']);
  assert.match(check({}), /node is a name/); assert.match(check({ node: 'x', strength: 4 }), /1, 2 or 3/);
  assert.equal(check({ node: 'x', strength: 3 }), null);
  assert.equal(takes(), 1.5);
});
