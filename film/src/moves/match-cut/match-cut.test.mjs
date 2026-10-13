import test from 'node:test';
import assert from 'node:assert/strict';
import { CUT, RECT, about, check, matchAt, rectCurve, takes } from './move.ts';

test('match-cut: the curve gathers speed all the way, brakes, arrives on the cut and passes its place once', () => {
  assert.equal(rectCurve(RECT.start), 0);
  assert.ok(Math.abs(rectCurve(RECT.stop) - 1) < 1e-12);
  let last = -1, peak = 0;
  for (let f = RECT.start; f <= RECT.stop; f++) { const p = rectCurve(f); assert.ok(p > last, `frame ${f}: it never goes back before it arrives`); last = p; }
  for (let f = RECT.start + 1; f < RECT.brake; f++) assert.ok(rectCurve(f + 1) - rectCurve(f) > rectCurve(f) - rectCurve(f - 1), `frame ${f}: faster every frame until the brake`);
  for (let f = RECT.stop; f <= RECT.stop + 18; f++) { const p = rectCurve(f); assert.ok(p >= 1, 'never back under its place'); peak = Math.max(peak, p); }
  assert.ok(Math.abs(peak - 1.02) < 0.001, `one overshoot of two hundredths: ${peak}`);
  assert.ok(rectCurve(RECT.stop + 18) - 1 < 1e-4, 'and it is back when the cut move ends');
});

test('match-cut: the object is in the same place and at the same size either side of the cut, and both shots are as they stand at the ends', () => {
  const a = { x: 1400, y: 20, w: 160, h: 60 }, b = { x: 600, y: 200, w: 640, h: 420 };
  const start = matchAt(0, a, b);
  assert.deepEqual([start.cut, start.scale, start.x, start.y], [false, 1, 0, 0], 'the shot before starts as it was');
  const end = matchAt(1, a, b);
  assert.ok(end.cut && Math.abs(end.scale - 1) < 1e-3 && Math.abs(end.x) < 0.2 && Math.abs(end.y) < 0.2, `the new shot ends as it will be (to a fifth of a px): ${JSON.stringify(end)}`);
  // where the object is on the frame under a shot's transform
  const seen = (m, box) => ({ x: m.x + m.scale * (box.x + box.w / 2), y: m.y + m.scale * (box.y + box.h / 2), size: m.scale * Math.sqrt(box.w * box.h) });
  const before = matchAt(CUT - 1e-9, a, b), after = matchAt(CUT, a, b);
  assert.equal(before.cut, false); assert.equal(after.cut, true);
  const p = seen(before, a), q = seen(after, b);
  assert.ok(Math.hypot(p.x - q.x, p.y - q.y) < 0.01 && Math.abs(p.size - q.size) < 0.01, `${JSON.stringify(p)} ${JSON.stringify(q)}`);
  assert.ok(Math.abs(q.x - 920) < 0.01 && Math.abs(q.y - 410) < 0.01, 'and that place is the object\'s own on the new shot');
  assert.ok(Math.abs(CUT - 47 / 65) < 1e-12);
});

test('match-cut: check and the example', () => {
  const { move, ...inputs } = about.example.cut;
  assert.equal(move, 'match-cut'); assert.equal(about.use, 'cut'); assert.equal(check(inputs), null);
  assert.match(check({}), /two names/); assert.match(check({ hero: ['row'] }), /two names/); assert.match(check({ hero: ['row', 3] }), /two names/);
  assert.equal(takes(), 1.6);
});
