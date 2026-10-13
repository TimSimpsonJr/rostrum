import test from 'node:test';
import assert from 'node:assert/strict';
import { beside } from './beside.ts';

test('beside: above when the frame has room, else below, else at its side; always inside the frame', () => {
  assert.deepEqual(beside({ x: 800, y: 400, w: 200, h: 40 }, 120, 50), { x: 900, y: 400 - 14 - 25 });
  const top = { x: 800, y: 40, w: 200, h: 40 };
  assert.equal(beside(top, 120, 50).y, 40 + 40 + 14 + 25, 'no room above: below');
  const tall = { x: 200, y: 0, w: 400, h: 1080 };
  assert.equal(beside(tall, 120, 50).x, 600 + 14 + 60, 'as tall as the frame: to its right');
  assert.equal(beside({ ...tall, x: 1500 }, 120, 50).x, 1500 - 14 - 60, 'and no room there: to its left');
  const edge = beside({ x: 1880, y: 400, w: 40, h: 40 }, 120, 50);
  assert.ok(edge.x + 60 <= 1900 && edge.x - 60 >= 20, 'kept inside the frame');
  assert.equal(beside({ x: 800, y: 400, w: 200, h: 40 }, 120, 50, 30).y, 400 - 30 - 25, 'the gap is the caller\'s');
  // side first: at its right, level with it; no room there, at its left; neither, above as before
  assert.deepEqual(beside({ x: 800, y: 400, w: 200, h: 40 }, 120, 50, 14, true), { x: 1000 + 14 + 60, y: 420 });
  assert.equal(beside({ x: 1700, y: 400, w: 200, h: 40 }, 120, 50, 14, true).x, 1700 - 14 - 60);
  assert.equal(beside({ x: 60, y: 400, w: 1800, h: 40 }, 120, 50, 14, true).y, 400 - 14 - 25);
});
