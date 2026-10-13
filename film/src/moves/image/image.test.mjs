import test from 'node:test';
import assert from 'node:assert/strict';
import { mediaSrc } from '../../kit/media.ts';
import { about, check, scrimOf } from './move.ts';

test('image: a supplied picture by its plain file name, the tutorial\'s or the brand\'s; anything that could leave the film\'s folder is refused', () => {
  assert.equal(about.use, 'stage'); assert.equal(check(about.example.stage), null);
  for (const ok of ['a.png', 'Ground-2.JPG', 'brand/wall.webp', 'x_y.v2.jpeg']) assert.equal(check({ file: ok }), null, ok);
  for (const bad of ['../a.png', 'brand/../a.png', 'media/a.png', 'a/b.png', '/a.png', '\\a.png', 'C:/a.png', 'C:\\a.png', 'c:a.png', 'https://x.test/a.png', '//x.test/a.png', 'file:///a.png', 'data:image/png;base64,AAAA', 'a..png', '.hidden.png', 'a.svg', 'a.gif', 'a.mp4', 'a.png?x=1', 'a.png#x', 'a b.png', 'a.png ', '', null, 7, ['a.png']]) assert.match(check({ file: bad }) ?? '', /plain file name/, String(bad));
  assert.match(check({}), /plain file name/);
  assert.deepEqual([mediaSrc('a.png'), mediaSrc('brand/wall.webp')], ['media/a.png', 'brand/wall.webp']);
});

test('image: the scrim is on unless it is turned down; one input', () => {
  assert.equal(scrimOf({ file: 'a.png' }), 0.6); assert.equal(scrimOf({ file: 'a.png', scrim: 0 }), 0); assert.equal(scrimOf({ file: 'a.png', scrim: 0.85 }), 0.85);
  assert.equal(check({ file: 'a.png', scrim: 0 }), null); assert.equal(check({ file: 'a.png', scrim: 1, fit: 'contain', tone: 'dark' }), null);
  assert.match(check({ file: 'a.png', scrim: 1.2 }), /scrim is 0 to 1/); assert.match(check({ file: 'a.png', scrim: '0.5' }), /scrim/);
  assert.match(check({ file: 'a.png', fit: 'fill' }), /fit/); assert.match(check({ file: 'a.png', tone: 'x' }), /tone/);
});
