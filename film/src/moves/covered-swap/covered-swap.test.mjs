import test from 'node:test';
import assert from 'node:assert/strict';
import { PEAK, SWAP, about, check, coverAt, takes } from './move.ts';

test('covered-swap: the window grows to cover the frame, is largest at the swap and is back at its own size at the end', () => {
  assert.equal(coverAt(0), 1); assert.equal(coverAt(1), 1); assert.equal(coverAt(SWAP), PEAK);
  assert.ok(PEAK * 0.8 >= 1.08, 'a window at 0.8 of the frame covers it with room for its corners');
  let last = 1;
  for (let f = 1; f <= 27; f++) { const s = coverAt(f / 27); assert.ok(f / 27 <= SWAP ? s >= last : s <= last, `frame ${f}: up to the swap, down after it`); last = s; }
  // at speed either side of the swap: the cut lands on motion, not on a held frame
  assert.ok(coverAt(SWAP) - coverAt(SWAP - 1 / 27) > 0.03 && coverAt(SWAP) - coverAt(SWAP + 1 / 27) > 0.03);
  // and it has all but settled a few frames before the cut hands the shot back
  assert.ok(coverAt(1 - 2 / 27) - 1 < 0.002);
});

test('covered-swap: check and the example', () => {
  const { move, ...inputs } = about.example.cut;
  assert.equal(move, 'covered-swap'); assert.equal(about.use, 'cut'); assert.equal(check(inputs), null);
  assert.match(check({ direction: 'left' }), /no inputs/);
  assert.equal(takes(), 0.9);
});
