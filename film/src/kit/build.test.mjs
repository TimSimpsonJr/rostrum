// The assembly's timing (kit/build.ts) and the rest of the easing set (kit/ease.ts): pure, from invented numbers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAt, buildOrder } from './build.ts';
import { EASE, bezier, mix, morphRect, odoCols, seg, travelAlong } from './ease.ts';

test('buildAt: nothing before its moment, whole and on its slot a little after its length; never past its slot', () => {
  assert.equal(buildAt(0.9, 1).started, false);
  const done = buildAt(1 + 1.15 * 0.9, 1, 0.9, 3);
  assert.equal(done.done, true);
  assert.ok(Math.abs(done.dx) < 1e-9 && Math.abs(done.dy) < 1e-9);
  assert.equal(done.outline, 1); assert.equal(done.fill, 1); assert.equal(done.content, 1);
  const mid = buildAt(1.3, 1, 0.9, 3);
  assert.ok(mid.started && !mid.done && mid.outline > 0 && mid.outline < 1 && mid.fill < mid.outline && mid.content === 0, 'outline, then fill, then contents');
  assert.ok(Math.hypot(mid.dx, mid.dy) < 33 && Math.hypot(mid.dx, mid.dy) > 0, 'a few px off its slot while it builds');
  assert.notDeepEqual([buildAt(1.3, 1, 0.9, 3).dx, buildAt(1.3, 1, 0.9, 3).start], [buildAt(1.3, 1, 0.9, 4).dx, buildAt(1.3, 1, 0.9, 4).start], 'a seed changes the offset and the stroke start');
});

test('buildOrder: n times inside the stretch, the same on every call, not in order', () => {
  const a = buildOrder(6, 1, 2);
  assert.equal(a.length, 6);
  assert.ok(a.every((t) => t >= 1 && t <= 2));
  assert.deepEqual(buildOrder(6, 1, 2), a);
  assert.notDeepEqual([...a].sort((x, y) => x - y), a, 'chaotic, not orderly');
  assert.notDeepEqual(buildOrder(6, 1, 2, 4), a);
});

test('ease: draw ends where it should, never overshoots; seg, morphRect, travelAlong, bezier, mix, odoCols', () => {
  assert.equal(EASE.draw(0), 0); assert.equal(EASE.draw(1), 1);
  assert.ok(Math.abs(EASE.draw(0.5) - 0.5) < 1e-6);
  let last = 0;
  for (let i = 0; i <= 100; i++) { const v = EASE.draw(i / 100); assert.ok(v >= last - 1e-9 && v <= 1, `draw is monotone at ${i}`); last = v; }
  assert.equal(seg(0.2, 0.4, 0.8), 0); assert.equal(seg(0.9, 0.4, 0.8), 1); assert.ok(Math.abs(seg(0.6, 0.4, 0.8) - 0.5) < 1e-6);
  assert.deepEqual(morphRect({ x: 0, y: 0, w: 100, h: 50 }, { x: 100, y: 200, w: 300, h: 150, r: 20 }, 0.5), { x: 50, y: 100, w: 200, h: 100, r: 10 });
  // an L: 100 along, then 300 down; half way by length is 100 down the longer leg
  const p = travelAlong([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 300 }], 0.5);
  assert.deepEqual([p.x, p.y], [100, 100]); assert.ok(Math.abs(p.angle - Math.PI / 2) < 1e-9);
  assert.deepEqual(travelAlong([{ x: 5, y: 5 }], 0.5), { x: 5, y: 5, angle: 0 });
  assert.deepEqual(bezier({ x: 0, y: 0 }, { x: 0, y: 100 }, { x: 100, y: 100 }, { x: 100, y: 0 }, 0), { x: 0, y: 0 });
  assert.deepEqual(bezier({ x: 0, y: 0 }, { x: 0, y: 100 }, { x: 100, y: 100 }, { x: 100, y: 0 }, 0.5), { x: 50, y: 75 });
  assert.equal(mix('red', 'blue', 0.25), 'color-mix(in oklch, blue 25.00%, red)');
  // 9.5 on its way to 10: the units are half way round, the tens half open and half turned
  assert.deepEqual(odoCols(9.5, 2), [{ pos: 0.5, on: 0.5 }, { pos: 9.5, on: 1 }]);
  assert.deepEqual(odoCols(77, 2), [{ pos: 7, on: 1 }, { pos: 77, on: 1 }]);
});
