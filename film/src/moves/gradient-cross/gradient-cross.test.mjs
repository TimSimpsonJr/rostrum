import test from 'node:test';
import assert from 'node:assert/strict';
import { AHEAD, FLIP, LEAN, T, TRAVEL, WIND, about, check, crossAt, gradientOf, screenOf, stopsOf, takes } from './move.ts';

test('gradient-cross: the camera makes one run of three screens and is at rest when the cut ends; nothing has moved when it starts', () => {
  for (const axis of ['v', 'h']) {
    const S = screenOf(axis), a = crossAt(0, axis), z = crossAt(1, axis);
    assert.deepEqual([a.cam, a.out.offset, a.out.lean], [0, 0, 0]); assert.equal(a.out.on, true); assert.equal(a.into.on, false);
    assert.equal(z.cam, TRAVEL * S); assert.equal(z.into.offset, 0); assert.equal(z.out.on, false);
    let last = a;
    for (let f = 1; f <= 93; f++) { const c = crossAt(f / 93, axis); assert.ok(c.cam >= last.cam && c.into.offset <= last.into.offset, `${axis} ${f}`); last = c; }
    // the cut's last frame (93 frames: 3.1 s) is within a hair of rest: no jump as the cut hands over
    assert.ok(crossAt(92 / 93, axis).into.offset < 0.25, `${axis}: ${crossAt(92 / 93, axis).into.offset} px from rest on the last frame`);
  }
  assert.equal(takes(), T.dur);
});

test('gradient-cross: the shot before leans back a little, then goes ahead and out of the frame before the new shot is in view', () => {
  for (const axis of ['v', 'h']) {
    const S = screenOf(axis);
    const back = Math.min(...Array.from({ length: 30 }, (_, f) => crossAt((T.wind + f / 60) / T.dur, axis).out.offset));
    assert.ok(back < -0.5 * WIND && back >= -WIND, `${axis}: it leans back ${-back} px`);
    const gone = crossAt((T.go + T.out) / T.dur, axis);
    assert.ok(Math.abs(gone.out.offset - AHEAD * S) < WIND && !gone.out.on, 'a screen and more ahead: out of the frame');
    // never both in view: the page swap is not seen
    for (let f = 0; f <= 93; f++) { const c = crossAt(f / 93, axis); assert.ok(!(c.out.on && c.into.on), `${axis} ${f}`); }
    const leans = Array.from({ length: 94 }, (_, f) => crossAt(f / 93, axis).out.lean);
    assert.ok(Math.max(...leans) > 0.9 * LEAN && Math.max(...leans) <= LEAN && Math.min(...leans) > -2 && leans.at(-1) === 0);
    for (let f = 1; f < 94; f++) assert.ok(Math.abs(leans[f] - leans[f - 1]) < 1.6, `${axis} ${f}: the lean never snaps`);
  }
});

test('gradient-cross: the gradient is clear over its first and last screen and solid between; the stage flips while the solid part fills the frame', () => {
  const L = 'oklch(0.975 0.008 272)', D = 'oklch(0.165 0.036 275)', stops = stopsOf(L, D);
  assert.deepEqual(stops[0], ['oklch(0.975 0.008 272 / 0)', 0]); assert.deepEqual(stops[1], ['oklch(0.975 0.008 272 / 0)', 0.25]);
  assert.deepEqual(stops.at(-1), ['oklch(0.165 0.036 275 / 0)', 1]); assert.deepEqual(stops.at(-2), ['oklch(0.165 0.036 275 / 0)', 0.75]);
  for (let i = 1; i < stops.length; i++) assert.ok(stops[i][1] >= stops[i - 1][1]);
  assert.equal(stops.filter(([c]) => !c.endsWith('/ 0)')).length, 5, 'five solid stops');
  const back = gradientOf('light', L, D);
  assert.deepEqual(back[0], ['oklch(0.165 0.036 275 / 0)', 0]); assert.deepEqual(back.at(-1), ['oklch(0.975 0.008 272 / 0)', 1]);
  for (let i = 1; i < back.length; i++) assert.ok(back[i][1] >= back[i - 1][1]);
  assert.deepEqual(gradientOf('dark', L, D), stops);
  // at the flip the frame (one screen from the camera's place) is inside the solid part (1.3 to 2.7 screens), with room either side
  for (const axis of ['v', 'h']) { const S = screenOf(axis), c = crossAt(FLIP, axis).cam / S; assert.ok(c > 1.3 + 0.15 && c + 1 < 2.7 - 0.15, `${axis}: ${c}`); }
  assert.ok(Math.abs(about.toneAt - FLIP) < 0.002, `about.toneAt ${about.toneAt} is the flip ${FLIP}`);
});

test('gradient-cross: check and the example', () => {
  const { move, ...inputs } = about.example.cut;
  assert.equal(move, 'gradient-cross'); assert.equal(check(inputs), null);
  assert.equal(check({ to: 'light', axis: 'h' }), null);
  assert.match(check({}), /light or dark/); assert.match(check({ to: 'dark', axis: 'x' }), /v or h/);
});
