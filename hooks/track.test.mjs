import test from 'node:test';
import assert from 'node:assert/strict';
import { trackSvg, trackText } from './track.ts';

test('six dots, the done ones filled, the current hollow, the rest dim; green when done', () => {
  const s = trackSvg(3, 'dark');
  assert.match(s, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="200" height="10" viewBox="0 0 200 10"/);
  assert.equal((s.match(/<circle/g) ?? []).length, 6);
  assert.match(s, /cx="119" cy="5" r="3\.75" fill="#262624" stroke="#2C84FF"/); // the current (fourth) dot, hollow on the dark surface
  assert.match(s, /<path d="M5 5H119" stroke="#2C84FF"/);
  assert.equal((s.match(/fill="#2C84FF"/g) ?? []).length, 1); // one group of filled dots
  assert.doesNotMatch(s, /<script|on[a-z]+=/i);
  const done = trackSvg(6, 'light');
  assert.doesNotMatch(done, /stroke="#1F6FEB"/);
  assert.match(done, /stroke="#1FA347"/);
  assert.equal((done.match(/<circle/g) ?? []).length, 6);
  assert.ok(trackSvg(0, 'dark').includes('cx="5" cy="5" r="3.75"'));
});

test('the terminal gets the same in text', () => {
  assert.equal(trackText(3), '●●●◉··');
  assert.equal(trackText(6), '●●●●●●');
  assert.equal(trackText(0), '◉·····');
});
