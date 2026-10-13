import test from 'node:test';
import assert from 'node:assert/strict';
import { alignLines, compareLines, scriptLines } from './compare-lines.mjs';

/** Whisper-shaped words for a spoken text: 0.3 s a word, in order. */
const heard = (text) => text.split(/\s+/).filter(Boolean).map((word, i) => ({ word: ' ' + word, start: +(i * 0.3).toFixed(2), end: +(i * 0.3 + 0.25).toFixed(2) }));

const LINES = ['Your user API key is on your Profile page.', 'Then choose Profile.', 'You will see your name, email and username.'];

test('lines: a take that says the script gives one window per line, in order, and nothing to report', () => {
  const words = heard(LINES.join(' '));
  const a = alignLines(LINES, words);
  assert.deepEqual(a.map((w) => [w.line, w.from, w.to, w.wer]), [[0, 0, 9, 0], [1, 9, 12, 0], [2, 12, 20, 0]]);
  assert.equal(a[1].heard, 'then choose profile');
  assert.deepEqual(compareLines(LINES, words), { differs: [], missing: [], extra: [] });
});

test('lines: a word added inside a line is that line\'s difference; the line is still cut from its own window', () => {
  const words = heard('Your user API key is on your Profile page. Then choose the Profile. You will see your name, email and username.');
  const a = alignLines(LINES, words);
  assert.equal(a[1].wer, 0.33);
  assert.equal(a[1].heard, 'then choose the profile');
  assert.deepEqual([a[1].from, a[1].to], [9, 13]);
  assert.deepEqual([a[2].from, a[2].to], [13, 21]);
  const c = compareLines(LINES, words);
  assert.deepEqual(c.differs, [{ line: 1, text: 'Then choose Profile.', heard: 'then choose the profile', wer: 0.33 }]);
  assert.deepEqual([c.missing, c.extra], [[], []]);
});

test('lines: a line never spoken is missing and takes no words; the lines after it keep theirs', () => {
  const words = heard('Your user API key is on your Profile page. You will see your name, email and username.');
  const a = alignLines(LINES, words);
  assert.deepEqual([a[1].from, a[1].to, a[1].wer, a[1].heard], [9, 9, 1, '']);
  assert.deepEqual([a[2].from, a[2].to, a[2].wer], [9, 17, 0]);
  assert.deepEqual(compareLines(LINES, words), { differs: [], missing: [1], extra: [] });
});

test('lines: a spoken sentence that is not in the script is reported with its text, and belongs to no line', () => {
  const words = heard('Your user API key is on your Profile page. Remember to drink some water today. Then choose Profile. You will see your name, email and username.');
  const a = alignLines(LINES, words);
  assert.deepEqual(a.map((w) => [w.from, w.to, w.wer]), [[0, 9, 0], [15, 18, 0], [18, 26, 0]]);
  assert.deepEqual(compareLines(LINES, words), { differs: [], missing: [], extra: ['remember to drink some water today'] });
});

test('lines: punctuation and case do not count; "A.P.I." is "API"', () => {
  const words = heard('your user A.P.I. key, is on your PROFILE page then choose profile you will see your name email and username');
  assert.deepEqual(compareLines(LINES, words), { differs: [], missing: [], extra: [] });
  assert.deepEqual(alignLines(['Your user API key.'], [{ word: ' Your', start: 0, end: 0.2 }, { word: ' user', start: 0.2, end: 0.4 }, { word: ' A.P.I.', start: 0.4, end: 0.8 }, { word: ' key.', start: 0.8, end: 1 }])[0].wer, 0);
});

test('lines: the script\'s narration column, without the rows that have none', () => {
  const md = ['# A script', '', '| # | Narration | On screen | Cursor |', '|---|---|---|---|', '| 0 | (no narration) | The title | |', '| 1 | Your key is on your Profile page. | The dashboard | Enters |', '| 2 | Open the menu \\| choose Profile. | Push | Clicks |', '', 'Not a row.'].join('\n');
  assert.deepEqual(scriptLines(md), ['Your key is on your Profile page.', 'Open the menu | choose Profile.']);
});
