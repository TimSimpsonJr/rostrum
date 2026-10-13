import test from 'node:test';
import assert from 'node:assert/strict';
import { CAP, GAP, about, capsAt, check, rowOf, takes, text } from './move.ts';

test('keycaps: the row is centred on the frame, a longer name has a wider cap, and it sets and leaves once', () => {
  const row = rowOf(['Ctrl', 'K']), total = row[0].w + GAP + row[1].w;
  assert.equal(row[0].x + total / 2, 960);
  assert.equal(row[1].x, row[0].x + row[0].w + GAP);
  assert.ok(row.every((c) => c.w >= CAP) && row[0].w > row[1].w);
  const four = rowOf(['Ctrl', 'Shift', 'Alt', 'Delete']);
  assert.ok(four[0].x > 20 && four[3].x + four[3].w < 1900, 'four of the longest stay in the frame');
  assert.deepEqual(capsAt(2, 3.2, 2), { set: 0, out: 0 });
  assert.deepEqual(capsAt(2, 3.2, 2.2), { set: 1, out: 0 });
  assert.equal(capsAt(2, 3.2, 3.2).out, 0); assert.equal(capsAt(2, 3.2, 3.45).out, 1);
});

test('keycaps: check, the words for the sweep, and the example', () => {
  const { move, at: _a, until: _u, ...inputs } = about.example.moves[0];
  assert.equal(move, 'keycaps'); assert.equal(check(inputs), null);
  assert.match(check({ caps: ['a', 'b', 'c', 'd', 'e'] }), /one to four/);
  assert.match(check({ caps: ['Command'] }), /6 letters/);
  assert.match(check({}), /one to four/);
  assert.deepEqual(text(inputs), ['Ctrl', 'K']);
  assert.equal(takes(), 1.5);
});
