import test from 'node:test';
import assert from 'node:assert/strict';
import { AFTER, CARD_H, DROP, LEAVE, SLIDE, about, cardW, check, pinAt, runAt, takes, text } from './move.ts';

const clear = (c, w, b) => c.x >= b.x + b.w || c.x + w <= b.x || c.y >= b.y + b.h || c.y + CARD_H <= b.y;
const inFrame = (c, w) => c.x >= 0 && c.y >= 0 && c.x + w <= 1920 && c.y + CARD_H <= 1080;

test('pin: the pin is on the element\'s top right corner; the card is beside it, in the frame, never over the element', () => {
  const w = cardW('Shown once only');
  const mid = { x: 600, y: 400, w: 300, h: 40 }, right = { x: 1500, y: 400, w: 380, h: 40 }, corner = { x: 1500, y: 10, w: 400, h: 60 }, low = { x: 1500, y: 1000, w: 400, h: 60 };
  const a = pinAt(mid, w);
  assert.deepEqual(a.pin, { x: 900, y: 400 });
  assert.ok(a.way === 1 && a.card.x > 900 && Math.abs(a.card.y + CARD_H / 2 - 400) < 1e-9, 'right of the corner, level with it');
  const b = pinAt(right, w), c = pinAt(corner, w), d = pinAt(low, w);
  assert.ok(b.way === -1 && b.card.y + CARD_H < right.y, 'no room to the right: above the element');
  assert.ok(c.card.y > corner.y + corner.h, 'nor above: below it');
  for (const [p, box] of [[a, mid], [b, right], [c, corner], [d, low]]) assert.ok(clear(p.card, w, box) && inFrame(p.card, w), JSON.stringify([p, box]));
  assert.equal(cardW('Yes'), 240); assert.ok(cardW('x'.repeat(36)) > 480 && cardW('x'.repeat(36)) < 540);
});

test('pin: the pin drops first, the card follows, both stay and leave after the run', () => {
  assert.deepEqual(runAt(2, 5, 2), { drop: 0, out: 0, gone: 0 });
  assert.equal(runAt(2, 5, 2 + DROP).drop, 1); assert.equal(runAt(2, 5, 2 + AFTER).out, 0);
  assert.equal(runAt(2, 5, 2 + AFTER + SLIDE).out, 1);
  assert.deepEqual(runAt(2, 5, 4.9), { drop: 1, out: 1, gone: 0 });
  assert.equal(runAt(2, 5, 5 + LEAVE).gone, 1); assert.ok(LEAVE < 1.5 && AFTER + SLIDE < takes());
});

test('pin: check, the words for the sweep, and the example', () => {
  const { move, at: _a, until: _u, ...inputs } = about.example.moves[0];
  assert.equal(move, 'pin'); assert.equal(check(inputs), null);
  assert.deepEqual(text(inputs), ['Shown once only']);
  assert.match(check({ text: 'x' }), /target is a name/); assert.match(check({ target: 'a' }), /few plain words/);
  assert.match(check({ target: 'a', text: 'x'.repeat(37) }), /36 letters/);
});
