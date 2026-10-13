// The library's own moves, their pure sides (the catalogue and the source scan are in tools/moves.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { about, check, takes, text } from './mark-time/move.ts';

test('mark-time: a short label is sound, its words are listed for the sweep, and its own example passes', () => {
  assert.equal(check({ text: 'Step 2' }), null);
  assert.match(check({}), /text/);
  assert.match(check({ text: 'x'.repeat(41) }), /text/);
  assert.deepEqual(text({ text: 'Step 2' }), ['Step 2']);
  assert.equal(takes(), 0.7);
  const { move, at: _a, until: _u, ...inputs } = about.example.moves[0];
  assert.equal(move, about.name);
  assert.equal(check(inputs), null);
});
