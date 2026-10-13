import test from 'node:test';
import assert from 'node:assert/strict';
import { CLEAR, FLIGHT, LEAVE, about, besideOf, carryAt, check, halfOf, takes, text } from './move.ts';

const A = { x: 400, y: 700 }, B = { x: 1400, y: 300 };

test('carry: it sets on the first element, leaves at once, flies one smooth curve bowed upward, rests where it lands and clears after its run', () => {
  assert.equal(carryAt(2, 5, A, B, 2).set, 0); assert.equal(carryAt(2, 5, A, B, 2.35).set, 1);
  const set = carryAt(2, 5, A, B, 2 + LEAVE / 2);
  assert.deepEqual([set.x, set.y, set.k, set.out], [A.x, A.y, 0, 0], 'it is where it set until it leaves');
  // a page change follows its click by 0.3 s: the capsule is under way by then, and still near where it set
  const cut = carryAt(2, 5, A, B, 2.3);
  assert.ok(cut.k > 0 && cut.k < 0.01 && carryAt(2, 5, A, B, 2.6).k > 0.03, `moving as the cut lands: ${cut.k}`);
  const mid = carryAt(2, 5, A, B, 2 + LEAVE + FLIGHT / 2);
  assert.ok(Math.abs(mid.k - 0.5) < 1e-9 && Math.abs(mid.x - 900) < 1e-6, 'half way at half time');
  assert.ok(mid.y < 500 - 200, `above the straight line between the two by most of 0.3 of the way: ${mid.y}`);
  const landed = carryAt(2, 5, A, B, 2 + LEAVE + FLIGHT), resting = carryAt(2, 5, A, B, 5);
  assert.ok(Math.abs(landed.x - B.x) < 1e-9 && Math.abs(landed.y - B.y) < 1e-9);
  assert.deepEqual([resting.x, resting.y, resting.out], [landed.x, landed.y, 0], 'it rests where it landed to the end of its run');
  let last = set;
  for (let f = 1; f <= 36; f++) { const c = carryAt(2, 5, A, B, 2 + LEAVE + f / 30); assert.ok(c.x >= last.x && Math.hypot(c.x - last.x, c.y - last.y) < 70, `frame ${f}: no jump, no turning back`); last = c; }
  // gone inside the second and a half a move stays mounted after its run (Template)
  assert.ok(CLEAR < 1.5); assert.equal(carryAt(2, 5, A, B, 5 + CLEAR).out, 1);
  assert.ok(LEAVE + FLIGHT < takes(), 'its own length leaves it time at rest');
});

test('carry: it rests beside the element it names, never over it: above when the frame has room, else below, else at its side', () => {
  const h = 56, half = halfOf('API key', h), clear = (p, b) => p.x + half <= b.x || p.x - half >= b.x + b.w || p.y + h / 2 <= b.y || p.y - h / 2 >= b.y + b.h;
  const inFrame = (p) => p.x - half >= 0 && p.x + half <= 1920 && p.y - h / 2 >= 0 && p.y + h / 2 <= 1080;
  const mid = { x: 700, y: 500, w: 300, h: 60 }, top = { x: 1500, y: 10, w: 150, h: 60 }, tall = { x: 200, y: 20, w: 600, h: 1040 };
  const above = besideOf(mid, h, half), below = besideOf(top, h, half), right = besideOf(tall, h, half), left = besideOf({ ...tall, x: 1200 }, h, half);
  assert.ok(above.y + h / 2 < mid.y && above.x === 850, 'above, over its middle');
  assert.ok(below.y - h / 2 > top.y + top.h, 'no room above: below');
  assert.ok(right.x - half > tall.x + tall.w && left.x + half < 1200, 'as tall as the frame: at its side');
  for (const [p, b] of [[above, mid], [below, top], [right, tall], [left, { ...tall, x: 1200 }]]) assert.ok(clear(p, b) && inFrame(p), JSON.stringify([p, b]));
  // near the frame's edge it stays in the frame, still clear of the element
  const edge = { x: 1850, y: 400, w: 60, h: 40 }, e = besideOf(edge, h, half);
  assert.ok(inFrame(e) && clear(e, edge));
  assert.deepEqual(besideOf(null, h, half), { x: 960, y: 88 }, 'no element: top centre');
});

test('carry: check, the words for the sweep, and the example', () => {
  const { move, at: _a, until: _u, ...inputs } = about.example.moves[0];
  assert.equal(move, 'carry'); assert.equal(check(inputs), null);
  assert.equal(check({ text: 'Key' }), null);
  assert.match(check({}), /one or two words/); assert.match(check({ text: 'x'.repeat(25) }), /one or two words/);
  assert.match(check({ text: 'Key', to: 3 }), /names in `nodes`/);
  assert.deepEqual(text(inputs), ['API key']);
  assert.equal(takes(), 2.2);
});
