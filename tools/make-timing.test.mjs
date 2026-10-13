import test from 'node:test';
import assert from 'node:assert/strict';
import { layOut, spokenLines } from './make-timing.mjs';

/** Repaired words for a spoken text: 0.3 s a word from `t0`. */
const said = (text, t0 = 0) => text.toLowerCase().replace(/[^a-z0-9' ]/g, '').split(' ').map((w, i) => ({ w, start: +(t0 + i * 0.3).toFixed(2), end: +(t0 + i * 0.3 + 0.25).toFixed(2) }));

test('timing: the take is cut per script line, even where Whisper heard one sentence or a line was said differently', () => {
  const lines = ['Open your user menu.', 'Then choose Profile.', 'You will see your name.'];
  const cut = spokenLines(lines, said('open your user menu then choose the profile you will see your name'));
  assert.deepEqual(cut.map((s) => s.words.map((w) => w.w).join(' ')), ['open your user menu', 'then choose the profile', 'you will see your name']);
  assert.deepEqual(cut.map((s) => s.text), lines);
  assert.equal(cut[1].words[0].start, 1.2);
});

test('timing: a line the take does not have keeps its place as a silent slot, 0.35 s a word', () => {
  const lines = ['Open your user menu.', 'Then choose Profile.', 'You will see your name.'];
  const cut = spokenLines(lines, said('open your user menu you will see your name'));
  assert.deepEqual([cut[1].silent, cut[1].words], [1.05, []]);
  const laid = layOut(cut, { lead: 3.6, gaps: [0, 0.9, 0.6] });
  assert.deepEqual(laid.map((s) => [+s.start.toFixed(2), +s.end.toFixed(2)]), [[3.6, 4.75], [5.65, 6.7], [7.3, 8.75]]);
  assert.equal(laid[2].words[0].start, 7.3);
});
