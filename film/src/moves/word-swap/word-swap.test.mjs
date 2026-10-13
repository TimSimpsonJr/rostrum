import test from 'node:test';
import assert from 'node:assert/strict';
import { SWAP, about, check, sizeOf, swapAt, swapsOf, takes, text } from './move.ts';

test('word-swap: which word shows and how far the swap has got; the default pace; check, text, size', () => {
  assert.deepEqual(swapAt([2, 4], 1), { i: 0, u: 1 }, 'the first word is at rest');
  assert.deepEqual(swapAt([2, 4], 2), { i: 1, u: 0 }, 'the swap starts on the cue');
  assert.ok(Math.abs(swapAt([2, 4], 2 + SWAP / 2).u - 0.5) < 1e-9);
  assert.deepEqual(swapAt([2, 4], 3), { i: 1, u: 1 });
  assert.deepEqual(swapAt([2, 4], 9), { i: 2, u: 1 });
  assert.deepEqual(swapAt([], 9), { i: 0, u: 1 });
  const { move, at: _a, until: _u, ...inputs } = about.example.moves[0];
  assert.equal(move, 'word-swap'); assert.equal(check(inputs), null);
  assert.deepEqual(text(inputs), ['Status', 'In review', 'Approved']);
  assert.deepEqual(text({ words: ['One', 'Two'] }), ['One', 'Two']);
  assert.deepEqual(swapsOf({ words: ['a', 'b', 'c'] }, 10), [10.9, 11.8]);
  assert.deepEqual(swapsOf({ words: ['a', 'b'], each: [3.5] }, 10), [3.5], 'its cues, as seconds');
  assert.equal(takes({ words: ['a', 'b', 'c'] }), 2.4); assert.equal(takes(inputs), 0.6);
  assert.match(check({ words: ['One'] }), /two to five/);
  assert.match(check({ words: ['One', 'x'.repeat(25)] }), /24 characters/);
  assert.match(check({ words: ['One', 'Two'], each: ['a', 'b'] }), /one cue per swap/);
  assert.match(check({ before: 'x'.repeat(41), words: ['One', 'Two'] }), /before/);
  assert.match(check({ before: 'x'.repeat(40), words: ['One', 'y'.repeat(24)] }), /too long/);
  assert.equal(sizeOf(inputs), 96);
  assert.ok(sizeOf({ before: 'A much longer phrase that stays', words: ['One', 'Two'] }) < 96);
});
