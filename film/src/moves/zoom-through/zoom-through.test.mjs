import test from 'node:test';
import assert from 'node:assert/strict';
import { FILL, GONE, SHOW, about, check, takes, zoomAt } from './move.ts';

const BOX = { x: 1200, y: 300, w: 400, h: 120 };

test('zoom-through: the picture travels into the element until it fills the frame, and the new shot comes out a little large and settles', () => {
  const start = zoomAt(0, BOX);
  assert.deepEqual(start.out, { scale: 1, cx: 1400, cy: 360, blur: 0, on: true }, 'the cut starts on the shot as it was');
  assert.equal(start.into.on, false);
  const full = zoomAt(FILL, BOX);
  assert.ok(Math.abs(full.out.scale - 9.9) < 1e-9, 'the 400 x 120 element covers the frame: 1080 / 120, and a tenth more');
  assert.ok(Math.abs(full.out.cx - 960) < 1e-9 && Math.abs(full.out.cy - 540) < 1e-9, 'and its middle is the frame\'s');
  assert.ok(full.swap && full.out.blur === 8);
  let last = start;
  for (let f = 1; f <= 30; f++) {
    const z = zoomAt(f / 30, BOX);
    assert.ok(z.out.scale > last.out.scale - 1e-12 && z.out.blur >= last.out.blur && z.into.opacity >= last.into.opacity && (!last.into.on || z.into.scale <= last.into.scale), `frame ${f}`);
    last = z;
  }
  // the old shot is drawn until the new one is whole over it, and never sharp while the two are together
  assert.equal(zoomAt(GONE - 0.01, BOX).out.on, true); assert.equal(zoomAt(GONE, BOX).out.on, false); assert.equal(zoomAt(GONE, BOX).into.opacity, 1);
  assert.ok(zoomAt(SHOW, BOX).out.blur > 5 && zoomAt(SHOW, BOX).into.opacity === 0);
  const end = zoomAt(1, BOX);
  assert.deepEqual(end.into, { scale: 1, opacity: 1, on: true }, 'and it ends on the new shot as it will be');
});

test('zoom-through: check and the example', () => {
  const { move, ...inputs } = about.example.cut;
  assert.equal(move, 'zoom-through'); assert.equal(about.use, 'cut'); assert.equal(check(inputs), null);
  assert.match(check({}), /through/); assert.match(check({ through: 4 }), /through/);
  assert.equal(takes(), 1);
});
