import test from 'node:test';
import assert from 'node:assert/strict';
import { about, check, edgeOf, strokesAt, takes } from './move.ts';

test('impact-lines: six to eight strokes that only ever go outward, the tail behind the head, gone by the end; the same for the same seed', () => {
  for (const seed of [0, 1, 7, 42, 311]) {
    const n = strokesAt(0.5, seed).length;
    assert.ok(n >= 6 && n <= 8, `seed ${seed}: ${n} strokes`);
    assert.deepEqual(strokesAt(0.5, seed), strokesAt(0.5, seed));
    let last = strokesAt(0, seed);
    assert.ok(last.every((s) => s.head === 0 && s.tail === 0), 'nothing before it starts');
    for (let f = 1; f <= 20; f++) {
      const now = strokesAt(f / 20, seed);
      now.forEach((s, j) => { assert.ok(s.tail <= s.head + 1e-9 && s.head <= 1 && s.o >= 0 && s.o <= 1); assert.ok(s.head >= last[j].head - 1e-9 && s.tail >= last[j].tail - 1e-9, 'a stroke never comes back'); assert.equal(s.a, last[j].a, 'its heading is fixed'); });
      last = now;
    }
    assert.ok(last.every((s) => s.o === 0 && s.head === 1), 'faded out at the end, at full reach');
    const angles = strokesAt(0.5, seed).map((s) => s.a);
    assert.ok(angles.every((a, j) => !j || a > angles[j - 1]), 'spread round, in order');
  }
  assert.notEqual(strokesAt(0.5, 1)[0].a, strokesAt(0.5, 2)[0].a);
});

test('impact-lines: the edge of a box along a heading; check and the example', () => {
  const b = { x: 100, y: 100, w: 200, h: 100 };
  const right = edgeOf(b, 0); assert.deepEqual([right.x, right.y], [300, 150]);
  const down = edgeOf(b, Math.PI / 2); assert.ok(Math.abs(down.x - 200) < 1e-9 && Math.abs(down.y - 200) < 1e-9);
  const corner = edgeOf(b, Math.atan2(50, 100)); assert.ok(Math.abs(corner.x - 300) < 1e-9 && Math.abs(corner.y - 200) < 1e-9);
  const { move, at: _a, until: _u, ...inputs } = about.example.moves[0];
  assert.equal(move, 'impact-lines'); assert.equal(check(inputs), null);
  assert.equal(check({}), null); assert.match(check({ target: 5 }), /target/); assert.match(check({ target: ' ' }), /target/);
  assert.equal(takes(), 0.35);
});
