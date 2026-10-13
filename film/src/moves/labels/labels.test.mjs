import test from 'node:test';
import assert from 'node:assert/strict';
import { about, apart, beside, check, labelAt, startsOf, takes, text, widthOf } from './move.ts';

const near = (a, b) => a.every((x, i) => Math.abs(x - b[i]) < 1e-9);

test('labels: each sets on its own cue, else spread over 1.2 s; all clear together after the run', () => {
  assert.ok(near(startsOf(3, 2), [2, 2.6, 3.2]));
  assert.deepEqual(startsOf(1, 2), [2]);
  assert.deepEqual(startsOf(3, 2, [4, 5, 6]), [4, 5, 6], 'cues win');
  assert.deepEqual(labelAt(2, 5, 1.9), { k: 0, out: 0 });
  assert.equal(labelAt(2, 5, 2.3).k, 1);
  assert.equal(labelAt(2, 5, 5).out, 0); assert.equal(labelAt(2, 5, 5.3).out, 1);
});

test('labels: a label stands clear of the element it names', () => {
  const box = { x: 700, y: 400, w: 280, h: 40 }, w = widthOf('Your name'), h = 46, c = beside(box, w, h, 12);
  assert.ok(c.y + h / 2 <= box.y, 'above it');
  assert.ok(widthOf('Your sign-in name') > w);
});

test('labels: two labels never stand within 12 px of each other', () => {
  const a = { x: 100, y: 100, w: 200, h: 40 }, b = { x: 100, y: 146, w: 150, h: 40 };
  assert.deepEqual(apart([a, { ...b, y: 152 }]), [a, { ...b, y: 152 }], '12 px apart: left alone');
  assert.equal(apart([a, b])[1].x, 312, 'closer: shifted past the first, to its right');
  assert.equal(apart([{ ...a, x: 1700 }, { ...b, x: 1700 }])[1].x, 1700 - 12 - 150, 'no room on the right: to its left');
});

test('labels: check, the words for the sweep, and the example', () => {
  const { move, at: _a, until: _u, ...inputs } = about.example.moves[0];
  assert.equal(move, 'labels'); assert.equal(check(inputs), null);
  const item = { target: 'a', text: 'A' };
  assert.match(check({ items: [item, item, item, item, item] }), /one to four/);
  assert.match(check({ items: [] }), /one to four/);
  assert.match(check({ items: [{ target: 'a', text: 'x'.repeat(31) }] }), /30 letters/);
  assert.match(check({ items: [item, item], each: ['one'] }), /one cue per item/);
  assert.deepEqual(text(inputs), ['Your name', 'Your sign-in name']);
  assert.deepEqual(about.cues, ['each']);
  assert.equal(takes(inputs), 0.6); assert.equal(takes({ items: [item] }), 1.5);
});
