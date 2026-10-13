import test from 'node:test';
import assert from 'node:assert/strict';
import { OFFSET, SHEET, TAB, about, check, lettersIn, sheetAt, startsOf, tabW, tabsOf, takes, text } from './move.ts';

test('sheet-stack: the sheets come one after another over 1.2 s, the back one first, each rising to its place', () => {
  for (const n of [2, 5, 13]) {
    const s = startsOf(n, 3);
    assert.equal(s.length, n); assert.equal(s[0], 3);
    for (let i = 1; i < n; i++) assert.ok(s[i] >= s[i - 1] + 0.04 - 1e-9, `${n}: sheet ${i} after the one behind it`);
    assert.ok(s.at(-1) <= 3 + 1.2 + 0.04 * n && s.at(-1) + 0.5 <= 3 + takes() + 0.3, `${n}: the last has set by about the move's own length`);
    assert.deepEqual(s, startsOf(n, 3), 'the same on every frame');
  }
  assert.equal(sheetAt(0, 5, 3, 3).k, 0); assert.equal(sheetAt(4, 5, 3, 3.1).k, 0);
  let last = Infinity;
  for (let f = 0; f <= 20; f++) { const y = sheetAt(0, 5, 3, 3 + f / 30).y; assert.ok(y <= last, 'it only rises'); last = y; }
});

test('sheet-stack: at rest the stack is centred, in the frame, each sheet up and right of the one in front, every tab on the top edge and apart', () => {
  for (const n of [2, 5, 13]) {
    const all = Array.from({ length: n }, (_, i) => sheetAt(i, n, 0, 10));
    assert.ok(all.every((s) => s.k === 1 && s.x >= 0 && s.y - TAB.h >= 0 && s.x + SHEET.w <= 1920 && s.y + SHEET.h <= 1080), `${n}: in the frame`);
    for (let i = 1; i < n; i++) { assert.equal(all[i - 1].x - all[i].x, OFFSET); assert.equal(all[i].y - all[i - 1].y, OFFSET); assert.ok(all[i].tab - all[i - 1].tab >= tabW(n) - 1e-9); }
    assert.ok(all.at(-1).tab + tabW(n) <= SHEET.w, `${n}: the last tab is on the sheet`);
    const left = all.at(-1).x, right = all[0].x + SHEET.w, top = all[0].y - TAB.h, bottom = all.at(-1).y + SHEET.h;
    assert.ok(Math.abs(left + right - 1920) < 1e-6 && Math.abs(top + bottom - 1080) < 1e-6, `${n}: centred`);
  }
});

test('sheet-stack: check, the tabs\' words for the sweep, and the example', () => {
  const { move, at: _a, until: _u, ...inputs } = about.example.moves[0];
  assert.equal(move, 'sheet-stack'); assert.equal(check(inputs), null);
  assert.deepEqual(text(inputs), ['1', '2', '3', '4', '5']);
  assert.deepEqual(tabsOf({ count: 2, labels: ['Draft', 'Final'] }), ['Draft', 'Final']);
  for (const bad of [{}, { count: 1 }, { count: 14 }, { count: 2.5 }]) assert.match(check(bad), /2 to 13/);
  assert.match(check({ count: 3, labels: ['a', 'b'] }), /one short word per sheet/);
  assert.ok(lettersIn(13) >= 2 && lettersIn(2) > 12, 'thirteen tabs still hold their numbers');
  assert.match(check({ count: 13, labels: Array.from({ length: 13 }, () => 'Round') }), /a tab holds \d letters/);
  assert.equal(check({ count: 3, labels: ['Draft', 'Review', 'Final'] }), null);
});
