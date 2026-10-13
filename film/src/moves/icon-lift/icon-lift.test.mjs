import test from 'node:test';
import assert from 'node:assert/strict';
import { GROW, about, check, liftAt, patchOf, scaleAt, takes } from './move.ts';

test('icon-lift: up in ten frames, held, back in ten, and gone at the end of its run', () => {
  assert.equal(liftAt(2, 4, 2), 0); assert.equal(liftAt(2, 4, 2 + 1 / 3), 1); assert.equal(liftAt(2, 4, 4 - 1 / 3), 1); assert.equal(liftAt(2, 4, 4), 0);
  let last = 0;
  for (let f = 0; f <= 10; f++) { const k = liftAt(2, 4, 2 + f / 30); assert.ok(k >= last && k <= 1, `frame ${f}`); last = k; }
  assert.equal(scaleAt(0), 1); assert.equal(scaleAt(1), GROW); assert.equal(GROW, 1.5);
  assert.equal(liftAt(0, takes(), 0.6), 1, 'its shortest run still has the element fully up');
});

test('icon-lift: what dims is a patch round the element, not the frame', () => {
  const b = { x: 900, y: 500, w: 120, h: 40 }, p = patchOf(b);
  assert.ok(Math.abs(p.x + p.w / 2 - 960) < 1e-9 && Math.abs(p.y + p.h / 2 - 520) < 1e-9, 'centred on the element');
  assert.ok(p.w > GROW * b.w && p.h > GROW * b.h && p.w < 1920 / 2 && p.h < 1080, JSON.stringify(p));
});

test('icon-lift: check, what it lifts, and the example', () => {
  const { move, at: _a, until: _u, ...inputs } = about.example.moves[0];
  assert.equal(move, 'icon-lift'); assert.equal(check(inputs), null); assert.deepEqual(about.lifts, ['target']);
  assert.match(check({}), /target is a name/);
  assert.equal(takes(), 1.2);
});
