import test from 'node:test';
import assert from 'node:assert/strict';
import { DROP, LY, PASS, R, REST_X, about, check, geo, passAt, point, restY, ribbon, takes } from './move.ts';

test('line-pass: the camera makes one move over the whole pass, from the shot before to the new one, and never holds', () => {
  for (const v of ['below', 'side']) {
    assert.deepEqual([passAt(0, v).cx, passAt(0, v).cy], [0, 0]);
    assert.deepEqual([passAt(1, v).cx, passAt(1, v).cy], [REST_X, restY(v)]);
    let last = passAt(0.02, v);
    for (let f = 3; f <= 98; f++) { const p = passAt(f / 100, v); assert.ok(p.cx > last.cx && p.cy >= last.cy && p.cx - last.cx < 0.02 * REST_X, `${v} ${f}: travelling, with no jump`); last = p; }
    // the last frame of the cut is within a hair of rest: nothing jumps when the cut hands over (99 frames: 3.3 s)
    assert.ok(REST_X - passAt(98 / 99, v).cx < 0.05, `${v}: ${REST_X - passAt(98 / 99, v).cx} px from rest on the last frame`);
  }
  assert.equal(restY('below'), DROP); assert.equal(restY('side'), 0);
  assert.ok(REST_X >= 1920 + 300, 'two shots that fill their frames are never both over one another');
});

test('line-pass: the ribbon runs in under the shot before, gets ahead of the camera and out of the frame, and leaves before the camera settles', () => {
  for (const v of ['below', 'side']) {
    const g = geo(v);
    assert.equal(passAt(0, v).head, passAt(0, v).from);
    assert.equal(passAt(PASS.head[1], v).head, g.end);
    // its head is out of the frame (past the right edge, or up through the top) before the camera is far past half way
    const mid = passAt(v === 'below' ? 0.4 : 0.58, v), tip = point(mid.head, v);
    assert.ok(tip.x - mid.cx > 1920 || tip.y - mid.cy < 0, `${v}: head off the frame`);
    assert.equal(passAt(PASS.leave[0], v).lift, 0); assert.ok(passAt(1, v).lift >= 160);
    let last = -Infinity;
    for (let f = 0; f <= 100; f++) { const h = passAt(f / 100, v).head; assert.ok(h >= last, 'the head never backs up'); last = h; }
  }
  // below: by the end the level ribbon is above the frame; side: it has turned up short of the new shot's frame
  const end = passAt(1, 'below'); assert.ok(LY - end.lift - end.cy < 0);
  const s = geo('side'); assert.ok(point(s.bend + s.turn, 'side').x < REST_X && Math.abs(point(s.bend + s.turn, 'side').y - (LY - R)) < 1e-9);
  // the path is one line: no step where the turn starts or ends
  for (const at of [s.bend, s.bend + s.turn]) { const a = point(at - 0.01, 'side'), b = point(at + 0.01, 'side'); assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 0.03); }
});

test('line-pass: the ribbon as a path, its light line above it; check and the example', () => {
  assert.match(ribbon(-200), /^M-200\.00 770\.00$/);
  const mid = ribbon(100), above = ribbon(100, 'below', 18);
  assert.ok(mid.startsWith('M-200.00 770.00L') && mid.endsWith('L100.00 770.00'));
  assert.ok(above.startsWith('M-200.00 752.00L') && above.endsWith('L100.00 752.00'));
  const { move, ...inputs } = about.example.cut;
  assert.equal(move, 'line-pass'); assert.equal(check(inputs), null); assert.equal(check({}), null);
  assert.match(check({ variant: 'over' }), /below or side/);
  assert.equal(takes(), 3.3);
});
