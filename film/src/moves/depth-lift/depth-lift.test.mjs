import test from 'node:test';
import assert from 'node:assert/strict';
import { APART, EYE, STEP, about, castAt, check, depthAt, layerAt, recedes, takes } from './move.ts';

test('depth-lift: the layers are apart over 0.7 s, stay, and are closed when the run ends; the screen recedes half as far', () => {
  assert.equal(depthAt(2, 5, 2), 0); assert.equal(depthAt(2, 5, 2 + APART), 1); assert.equal(depthAt(2, 5, 4), 1);
  assert.equal(depthAt(2, 5, 5), 0); assert.equal(depthAt(2, 5, 6), 0);
  let last = 0;
  for (let f = 0; f <= 21; f++) { const k = depthAt(2, 5, 2 + f / 30); assert.ok(k >= last && k <= 1, `frame ${f}`); last = k; }
  assert.equal(recedes(2.35, 2, 5), 0.5 * depthAt(2, 5, 2.35));
  assert.equal(depthAt(0, takes(), 1), 1, 'its shortest run still has them fully apart for a moment');
});

test('depth-lift: closed, every layer is its own box; apart, each is a step nearer than the one before, larger about the eye, its shape kept', () => {
  const box = { x: 700, y: 300, w: 400, h: 200 };
  for (let i = 0; i < 4; i++) { const r = layerAt(i, 0, 7.3, box); assert.deepEqual([r.x, r.y, r.w, r.h, r.z], [box.x, box.y, box.w, box.h, 0]); }
  const far = layerAt(0, 1, 4, box), mid = layerAt(1, 1, 4, box), near = layerAt(2, 1, 4, box);
  assert.deepEqual([far.x, far.y, far.w, far.scale], [box.x, box.y, box.w, 1], 'the farthest stays in the page');
  assert.equal(mid.z, STEP); assert.equal(near.z, 2 * STEP);
  assert.ok(Math.abs(mid.scale - EYE / (EYE - STEP)) < 1e-12 && near.scale > mid.scale && near.scale < 1.12, `${near.scale}: nearer is larger, and not by much`);
  assert.ok(Math.abs(near.w / near.h - 2) < 1e-9);
  // it rises over its own place: its middle is within the parallax of where it was, and it covers its own box
  assert.ok(Math.hypot(near.x + near.w / 2 - 900, near.y + near.h / 2 - 400) < 12);
  assert.ok(near.x < box.x && near.y < box.y && near.x + near.w > box.x + box.w && near.y + near.h > box.y + box.h);
  // the parallax: as the eye wanders a near layer shifts, the farthest does not; a few px at most
  const a = layerAt(2, 1, 0, box), b = layerAt(2, 1, 9, box);
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 0.5 && Math.hypot(a.x - b.x, a.y - b.y) < 20);
  assert.deepEqual(layerAt(0, 1, 0, box), layerAt(0, 1, 9, box));
  // no jump between frames while they hold
  for (let f = 1; f < 60; f++) { const p = layerAt(2, 1, 3 + (f - 1) / 30, box), q = layerAt(2, 1, 3 + f / 30, box); assert.ok(Math.hypot(p.x - q.x, p.y - q.y) < 0.5); }
  assert.match(castAt(90), /^0 14\.40px 36\.00px -4\.50px /);
});

test('depth-lift: check, what it lifts, and the example', () => {
  const { move, at: _a, until: _u, ...inputs } = about.example.moves[0];
  assert.equal(move, 'depth-lift'); assert.equal(check(inputs), null);
  assert.deepEqual(about.lifts, ['nodes[]']);
  for (const bad of [{}, { nodes: ['a'] }, { nodes: ['a', 'b', 'c', 'd', 'e'] }, { nodes: ['a', 'a'] }, { nodes: ['a', 3] }]) assert.match(check(bad), /two to four different names/);
  assert.equal(takes(), 2);
});
