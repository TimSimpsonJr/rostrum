import test from 'node:test';
import assert from 'node:assert/strict';
import { about, check, scrimOf } from './move.ts';

test('footage: a supplied clip by its plain file name; no trimming, a loop only by the clip\'s own length; the same refusals as a picture', () => {
  assert.equal(about.use, 'stage'); assert.equal(check(about.example.stage), null);
  assert.equal(check({ file: 'drift.webm' }), null); assert.equal(check({ file: 'brand/loop.mp4', loop: 2.5, scrim: 0.3 }), null);
  for (const bad of ['../a.mp4', 'brand/../a.mp4', 'a/b.mp4', '/a.mp4', 'C:\\a.mp4', 'https://x.test/a.mp4', 'a.png', 'a.mov', 'a.mp4?t=3', '', null]) assert.match(check({ file: bad }) ?? '', /plain file name/, String(bad));
  assert.match(check({ file: 'a.mp4', loop: 0 }), /loop is/); assert.match(check({ file: 'a.mp4', loop: 'yes' }), /loop is/);
  assert.match(check({ file: 'a.mp4', scrim: -1 }), /scrim/); assert.match(check({ file: 'a.mp4', tone: 'x' }), /tone/);
  assert.equal(scrimOf({ file: 'a.mp4' }), 0.6);
  assert.equal('from' in about.inputs || 'trim' in about.inputs, false, 'used as given');
});
