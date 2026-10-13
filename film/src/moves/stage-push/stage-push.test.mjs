import test from 'node:test';
import assert from 'node:assert/strict';
import { GHOST, REACH, about, check, pushAt, slotAt, takes } from './move.ts';

const W = 1920, H = 1080;

test('stage-push: the outgoing shot ends off the frame and the incoming one at rest; the two are never over one another', () => {
  const start = pushAt(0), end = pushAt(1);
  assert.deepEqual(start.outgoing, { x: 0, y: 0, scale: 1, opacity: 1, blur: 0, a: 0 }, 'the cut starts on the shot as it was');
  assert.deepEqual(end.incoming, { x: 0, y: 0, scale: 1, opacity: 1, blur: 0, a: 0 }, 'and ends on the new shot as it will be: nothing jumps when the cut hands over');
  // gone: its frame-sized picture, shrunk, is wholly beyond the edge
  assert.ok(W / 2 + end.outgoing.x + (GHOST.scale * W) / 2 <= 0, 'off the left edge');
  const down = pushAt(1, 'down').outgoing;
  assert.ok(H / 2 + down.y - (GHOST.scale * H) / 2 >= H, 'off the bottom edge');
  for (let f = 0; f <= 24; f++) {
    const { outgoing: o, incoming: i } = pushAt(f / 24);
    assert.ok(W / 2 + o.x + (o.scale * W) / 2 <= W / 2 + i.x - (i.scale * W) / 2 + 1e-6, `frame ${f}: the pictures do not overlap`);
    assert.ok(o.opacity >= GHOST.opacity && o.blur <= GHOST.blur && i.scale >= GHOST.scale);
  }
  assert.equal(slotAt(1, 'right').x, REACH.x); assert.equal(slotAt(1, 'up').y, -REACH.y);
});

test('stage-push: check and the example', () => {
  const { move, ...inputs } = about.example.cut;
  assert.equal(move, 'stage-push'); assert.equal(about.use, 'cut'); assert.equal(check(inputs), null);
  assert.equal(check({}), null); assert.match(check({ direction: 'in' }), /left, right, up or down/);
  assert.equal(takes(), 0.8);
});
