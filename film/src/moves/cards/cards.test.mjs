import test from 'node:test';
import assert from 'node:assert/strict';
import { about, check, joinOf, labelSize, layoutOf, startsOf, takes, text } from './move.ts';

const inFrame = (b) => b.x >= 0 && b.y >= 0 && b.x + b.w <= 1920 && b.y + b.h <= 1080;

test('cards: the layouts keep every card in the frame, one size, centred, and never overlapping', () => {
  const row = layoutOf(3, 'row');
  assert.equal(row.length, 3);
  assert.ok(row.every(inFrame) && row.every((b) => b.w === row[0].w && b.h === row[0].h && b.y === row[0].y));
  assert.ok(Math.abs(row[0].x + (row[2].x + row[2].w) - 1920) < 1e-6, 'centred');
  assert.ok(row[1].x >= row[0].x + row[0].w + 40, 'a gap between cards');
  for (const [n, layout] of [[2, 'row'], [6, 'row'], [6, 'column'], [4, 'grid'], [5, 'grid'], [6, 'grid']]) {
    const s = layoutOf(n, layout, 4);
    assert.ok(s.every(inFrame), `${n} ${layout}`);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) assert.ok(s[i].x + s[i].w <= s[j].x || s[j].x + s[j].w <= s[i].x || s[i].y + s[i].h <= s[j].y || s[j].y + s[j].h <= s[i].y, `${n} ${layout}: ${i} and ${j} overlap`);
  }
  assert.deepEqual([...new Set(layoutOf(6, 'grid').map((b) => b.x))].length, 3, 'six in a grid: three columns');
});

test('cards: check, text, the starts, and the hairline from edge to edge', () => {
  const { move, at: _a, until: _u, ...inputs } = about.example.moves[0];
  assert.equal(move, 'cards'); assert.equal(check(inputs), null);
  assert.deepEqual(text(inputs), ['Your account', 'Its keys', 'The sandbox']);
  assert.match(check({ items: [{ label: 'One' }] }), /two to six/);
  assert.match(check({ items: [{ label: 'One' }, { label: 'x'.repeat(29) }] }), /label/);
  assert.match(check({ items: [{ label: 'One' }, { label: 'Two', lines: 5 }] }), /lines/);
  assert.match(check({ ...inputs, connect: [[0, 3]] }), /connect/);
  assert.match(check({ ...inputs, connect: [[1, 1]] }), /connect/);
  assert.match(check({ ...inputs, each: ['a', 'b'] }), /one cue per item/);
  assert.match(check({ ...inputs, layout: 'pile' }), /layout/);
  assert.match(check({ ...inputs, arrive: 'fly' }), /arrive/);
  assert.equal(check({ ...inputs, each: ['a', 'b', 'c'], layout: 'grid', arrive: 'fold' }), null);
  // what cannot be read is refused: six tall cards in a column, a long label on a narrow card
  const six = (lines, label = 'A part') => ({ items: Array.from({ length: 6 }, () => ({ label, lines })) });
  assert.match(check({ ...six(4), layout: 'column' }), /do not fit/);
  assert.match(check({ ...six(1, 'A label of some length'), layout: 'row' }), /label that long/);
  assert.equal(check({ ...six(4, 'A label of some length'), layout: 'grid' }), null);
  assert.equal(check({ ...six(1), layout: 'row' }), null);
  assert.equal(labelSize(inputs, 467), 30); assert.ok(labelSize(six(1, 'Twelve chars'), 209.6) < 30 && labelSize(six(1, 'Twelve chars'), 209.6) >= 22, 'a longer label on a narrow card sets smaller');
  assert.deepEqual(startsOf(3, 5, [5, 6, 7]), [5, 6, 7], 'its own cues');
  const spread = startsOf(4, 5);
  assert.ok(spread.every((s) => s >= 5 && s <= 6.2)); assert.deepEqual(startsOf(4, 5), spread);
  assert.ok(takes() >= Math.max(...startsOf(6, 0)) + 0.7, 'takes covers the last card landing');
  // two cards side by side: the line runs from the right edge of the one to the left edge of the other
  assert.deepEqual(joinOf({ x: 0, y: 0, w: 100, h: 60 }, { x: 200, y: 0, w: 100, h: 60 }), { from: { x: 100, y: 30 }, to: { x: 200, y: 30 } });
  const down = joinOf({ x: 0, y: 0, w: 100, h: 60 }, { x: 0, y: 200, w: 100, h: 60 });
  assert.deepEqual([down.from.y, down.to.y], [60, 200]);
});
