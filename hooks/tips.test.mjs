import test from 'node:test';
import assert from 'node:assert/strict';
import { TIPS, FEATURES, tipsAvailable, tipAt } from './tips.ts';

test('fourteen tips, each a sentence with its capital and without the heading\'s words, filtered by what the build has', () => {
  assert.equal(TIPS.length, 14);
  for (const t of TIPS) { assert.match(t.text, /^[A-Z].+\.$/); assert.doesNotMatch(t.text, /did you know/i); assert.doesNotMatch(t.text, /!/); }
  assert.deepEqual(FEATURES, { chalk: false, pause: true, reopen: true, rename: true });
  const have = tipsAvailable();
  assert.equal(have.length, 12);
  assert.ok(!have.some((t) => /circle|hand-drawn/.test(t)));
  assert.ok(have.some((t) => t.includes('pause mid-walkthrough')));
  assert.ok(have.some((t) => t.includes('reopen a finished tutorial')));
  assert.equal(tipAt(0), have[0]);
  assert.equal(tipAt(12), have[0]);
  assert.equal(tipAt(-1), have[11]);
});
