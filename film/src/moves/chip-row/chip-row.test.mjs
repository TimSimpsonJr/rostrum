import test from 'node:test';
import assert from 'node:assert/strict';
import { HERO, MOVE, about, check, chipAt, chipWidth, heroAt, slotsOf, startsOf, takes, text } from './move.ts';

test('chip-row: the row is centred, inside the frame and never overlaps, at its widest too', () => {
  for (const [n, w] of [[3, 200], [5, chipWidth(['x'.repeat(16)])], [2, chipWidth(['On', 'Off'])]]) {
    const s = slotsOf(n, w), all = [s.hero, ...s.chips], right = all.at(-1).x + all.at(-1).w;
    assert.ok(Math.abs((s.hero.x + right) / 2 - 960) < 1e-9, 'centred');
    assert.ok(s.hero.x >= 40 && right <= 1880, `inside the frame (${s.hero.x} to ${right})`);
    for (let i = 1; i < all.length; i++) assert.ok(all[i].x >= all[i - 1].x + all[i - 1].w + 23.9, 'apart');
    assert.equal(s.start.x, 960 - HERO.w / 2, 'the hero starts in the middle');
  }
  assert.ok(chipWidth(['x'.repeat(16)]) >= 0.56 * 26 * 16 + 40, 'a chip holds its longest label with air either side');
});

test('chip-row: the hero has moved in 10 frames; chips 4 frames apart or on their cues; check, text, example', () => {
  assert.equal(heroAt(2, 2), 0); assert.equal(heroAt(2, 2 + MOVE), 1);
  const s = startsOf(3, 2);
  assert.ok(Math.abs(s[1] - s[0] - 4 / 30) < 1e-9 && s[0] > 2 + MOVE);
  assert.deepEqual(startsOf(3, 2, [5, 6, 7]), [5, 6, 7]);
  assert.equal(chipAt(2, 9, 2.3).k, 1); assert.equal(chipAt(2, 9, 9.4).out, 1);
  const { move, ...inputs } = about.example.moves[0];
  assert.equal(move, 'chip-row'); assert.equal(check(inputs), null);
  assert.deepEqual(text(inputs), ['Webhook events', 'Created', 'Updated', 'Deleted']);
  assert.match(check({ hero: '', items: ['a', 'b'] }), /hero/);
  assert.match(check({ hero: 'A', items: ['a'] }), /two to five/);
  assert.match(check({ hero: 'A', items: ['a', 'x'.repeat(17)] }), /16 letters/);
  assert.match(check({ hero: 'A', items: ['a', 'b'], each: ['one'] }), /one cue per item/);
  assert.equal(takes({ hero: 'A', items: ['a', 'b'], each: ['x', 'y'] }), 0.8);
});
