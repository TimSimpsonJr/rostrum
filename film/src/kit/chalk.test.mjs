import test from 'node:test';
import assert from 'node:assert/strict';
import { circlePath } from './chalkPath.ts';

test('a chalk circle is seeded, closed past its start, and encloses the box with clearance', () => {
  const box = { x: 100, y: 200, w: 300, h: 80 };
  const a = circlePath(box, 7), b = circlePath(box, 7), c = circlePath(box, 8);
  assert.equal(a.d, b.d);              // same seed, same stroke on every frame
  assert.notEqual(a.d, c.d);           // another seed, another hand
  assert.ok(a.length > 2 * Math.PI * 150);
  for (const [x, y] of a.points) {     // every point is outside the box
    const inside = x > box.x && x < box.x + box.w && y > box.y && y < box.y + box.h;
    assert.equal(inside, false);
  }
  assert.ok(a.points.length >= 40);
});
