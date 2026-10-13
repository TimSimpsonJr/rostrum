import test from 'node:test';
import assert from 'node:assert/strict';
import { LINE, MARK, SIZE, about, check, columnOf, itemAt, startsOf, takes, text, yOf } from './move.ts';

test('feature-list: the block is centred on the frame; each item is there on its cue; the longest fits its column', () => {
  for (const n of [2, 3, 6]) assert.ok(Math.abs((yOf(n, 0) + yOf(n, n - 1) + SIZE * 1.25) / 2 - 540) < 1e-9, `${n} lines centred`);
  assert.equal(yOf(3, 1) - yOf(3, 0), LINE);
  assert.ok(yOf(6, 0) > 100 && yOf(6, 5) + SIZE * 1.25 < 980, 'six lines stand inside the frame');
  assert.deepEqual(startsOf(3, 2), [2, 2.5, 3]); assert.deepEqual(startsOf(2, 2, [4, 5]), [4, 5]);
  assert.equal(itemAt(2, 9, 2.3).k, 1); assert.ok(itemAt(2, 9, 2).k > 0, 'it leads its cue');
  assert.equal(itemAt(2, 9, 9).out, 0); assert.equal(itemAt(2, 9, 9.4).out, 1);
  assert.ok(MARK + 0.56 * SIZE * 28 <= columnOf({ items: [] }).w, '28 letters after a check mark fit the column');
  assert.ok(columnOf({ items: [], side: 'right' }).x < 200);
});

test('feature-list: check, the words for the sweep, and the example', () => {
  const { move, ...inputs } = about.example.moves[0];
  assert.equal(move, 'feature-list'); assert.equal(check(inputs), null);
  assert.equal(about.example.frame.side, 'left');
  assert.deepEqual(text(inputs), ['Name', 'Email', 'Username']);
  assert.match(check({ items: ['One'] }), /two to six/);
  assert.match(check({ items: ['One', 'x'.repeat(29)] }), /28 letters/);
  assert.match(check({ items: ['One', 'Two'], each: ['a'] }), /one cue per item/);
  assert.match(check({ items: ['One', 'Two'], checks: 'yes' }), /checks/);
  assert.match(check({ items: ['One', 'Two'], side: 'up' }), /left or right/);
  assert.equal(takes(inputs), 0.6); assert.equal(takes({ items: ['a', 'b', 'c'] }), 1.6);
});
