import test from 'node:test';
import assert from 'node:assert/strict';
import { about, check, columnOf, sizeOf, swapAt, swapsOf, takes, text } from './move.ts';

test('label-beside: the default pace; its column is the side the window is not on; long labels shrink to fit it', () => {
  assert.deepEqual(swapsOf({ words: ['a', 'b', 'c'] }, 10), [10.9, 11.8]);
  assert.deepEqual(swapsOf({ words: ['a', 'b'], each: [3.5] }, 10), [3.5], 'its cues, as seconds');
  assert.deepEqual(swapAt([2], 2), { i: 1, u: 0 }, 'the word swap\'s own motion');
  assert.ok(columnOf({ words: ['a'] }).x > 960 && columnOf({ words: ['a'], side: 'right' }).x < 200);
  for (const side of ['left', 'right']) { const c = columnOf({ words: ['a'], side }); assert.ok(c.x >= 80 && c.x + c.w <= 1840, 'inside the frame'); }
  assert.equal(sizeOf({ words: ['Open the menu'] }), 64);
  const long = { words: ['x'.repeat(24)] };
  assert.ok(sizeOf(long) < 64 && sizeOf(long) >= 40 && 0.52 * sizeOf(long) * 24 <= columnOf(long).w + 1e-9, 'the longest label still fits, and is still large type');
});

test('label-beside: check, the words for the sweep, and the example', () => {
  const { move, ...inputs } = about.example.moves[0];
  assert.equal(move, 'label-beside'); assert.equal(check(inputs), null);
  assert.equal(about.example.frame.side, 'left', 'the example\'s framing leaves the column free');
  assert.deepEqual(text(inputs), ['Open the menu', 'Choose Profile']);
  assert.equal(check({ words: ['One'] }), null, 'a label that does not change');
  assert.match(check({ words: [] }), /one to six/);
  assert.match(check({ words: ['One', 'x'.repeat(25)] }), /24 letters/);
  assert.match(check({ words: ['One', 'Two'], each: ['a', 'b'] }), /one cue per change/);
  assert.match(check({ words: ['One'], side: 'top' }), /left or right/);
  assert.equal(takes({ words: ['a', 'b', 'c'] }), 2.4); assert.equal(takes(inputs), 0.6);
});
