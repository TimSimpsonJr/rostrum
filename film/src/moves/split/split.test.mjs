import test from 'node:test';
import assert from 'node:assert/strict';
import { PANE, about, check, fitOf, paneOf, recedes, splitAt, takes, text } from './move.ts';

test('split: two panes symmetric about the frame\'s middle; an element fits its pane by width or by height', () => {
  const a = paneOf(0), b = paneOf(1);
  assert.ok(Math.abs((960 - (a.x + a.w)) - (b.x - 960)) < 1e-9 && a.w === b.w && a.y === b.y);
  assert.ok(a.x > 0 && b.x + b.w < 1920 && a.y > 0 && a.y + a.h < 1080);
  assert.equal(fitOf({ w: 600, h: 60 }), PANE.w - 2 * PANE.pad, 'wide: the pane\'s inside');
  assert.ok(fitOf({ w: 300, h: 600 }) < PANE.w - 2 * PANE.pad, 'tall: less');
});

test('split: the before pane rises first, the after 0.25 s later; both set down by the end and the screen comes back', () => {
  const s = splitAt(2, 5, 2.5);
  assert.equal(s.up[0], 1); assert.ok(s.up[1] > 0 && s.up[1] < 1);
  assert.equal(splitAt(2, 5, 2.75).up[1], 1);
  assert.equal(splitAt(2, 5, 4.6).down, 0); assert.equal(splitAt(2, 5, 5).down, 1);
  assert.equal(recedes(1.9, 2, 5), 0); assert.equal(recedes(3, 2, 5), 1); assert.equal(recedes(5, 2, 5), 0);
});

test('split: check, the captions for the sweep, and the example', () => {
  const { move, at: _a, until: _u, ...inputs } = about.example.moves[0];
  assert.equal(move, 'split'); assert.equal(check(inputs), null);
  assert.match(check({ before: 'a' }), /names in `nodes`/);
  assert.match(check({ before: 'a', after: 'a' }), /two names/);
  assert.deepEqual(about.lifts, ['before', 'after']);
  assert.deepEqual(text(), ['Before', 'After']);
  assert.equal(takes(), 2);
});
