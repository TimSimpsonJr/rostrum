import test from 'node:test';
import assert from 'node:assert/strict';
import { screenAt } from './recording.ts';

test('finds the screen in force at a time', () => {
  const m = { screens: [{ i: 0, t: 0.01, path: 'screen-0.json', href: 'a' }, { i: 1, t: 1.005, path: 'screen-1.json', href: 'a' }] };
  assert.equal(screenAt(m, 0).i, 0);     // before the first snapshot: the first one
  assert.equal(screenAt(m, 0.5).i, 0);
  assert.equal(screenAt(m, 1.005).i, 1); // a snapshot taken at a click is in force at that click
  assert.equal(screenAt(m, 9).i, 1);
});
