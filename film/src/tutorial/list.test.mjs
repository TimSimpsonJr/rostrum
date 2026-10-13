// A narrated list (a beat's `list`), from invented boxes and timing: when the screen recedes and comes back, when each
// item sets, what is a fault, what the cursor and the camera do around it, and that the sweep reads its text.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeBeats, movesFrom } from './beats.ts';
import { LIST_CLEARS, listBlur, listItem, listUp, playList } from './list.ts';
import { pacing } from '../../../tools/pacing.mjs';
import { findHits, listSeen } from '../../../tools/sweep.mjs';

const VIEW = { width: 2560, height: 1351 };
const B = (x, y, w, h, more = {}) => ({ screen: 0, node: 1, x, y, w, h, ...more });
const f = (s) => Math.round(s * 30);

/** Timing for lines of text: 0.3 s a word, `gaps[i]` of air before line i. */
const timingOf = (lines, gaps = []) => {
  let at = 3.6;
  return { fps: 30, dir: 'narration', sentences: lines.map((text, i) => {
    const start = i ? at + (gaps[i] ?? 1.5) : at, words = text.toLowerCase().replace(/[^a-z0-9' ]/g, '').split(' ').map((w, k) => ({ w, start: +(start + k * 0.3).toFixed(3), end: +(start + k * 0.3 + 0.28).toFixed(3) }));
    at = words.at(-1).end;
    return { i, text, file: null, clipAt: start, clipDur: at - start, start, end: at, words };
  }) };
};

const LINES = ['You need three things your id your team key and at the end your own key', 'Open the menu in the corner', 'And that is all'];
const boxes = { menu: B(2300, 20, 200, 60) };
const ITEMS = [{ text: 'Your ID', icon: 'id-card', cue: 'id' }, { text: 'Your team key', icon: 'building', cue: 'team' }, { text: 'Your own key', icon: 'user-round', cue: 'own' }];
const film = (list, more = {}) => ({ version: 1, title: 'T', viewport: VIEW, nodes: {}, beats: [
  { line: 0, screen: 0, frame: { whole: true }, cursor: 'enter', ...(list ? { list } : {}), ...more },
  { line: 1, frame: { target: 'menu', with: 'corner' }, cursor: 'click', target: 'menu', cue: 'corner' },
  { line: 2, cursor: 'leave' },
] });
/** the timing a real build would give: the air after a list's line is the pacing's */
const timed = (file) => timingOf(LINES, pacing(movesFrom(file, boxes)));

test('list: `from` and each item resolve to words of the line; the screen starts to recede on `from`', () => {
  const file = film({ from: { word: 'your', nth: 0 }, items: ITEMS }), timing = timed(file), S = timing.sentences[0];
  const { beats, faults, moments } = makeBeats(file, boxes, timing);
  assert.deepEqual(faults, []);
  const [list] = beats.lists, at = (w, nth = 0) => S.words.filter((x) => x.w === w)[nth].start;
  assert.deepEqual(list.items.map((i) => f(i.at)), [f(at('id')), f(at('team')), f(at('own'))], 'each item is opaque on its word');
  assert.deepEqual(list.items.map((i) => [i.text, i.icon]), ITEMS.map((i) => [i.text, i.icon]));
  assert.equal(f(list.blurIn), f(at('your')), 'the first "your", a word before the first item');
  // without `from`: the first item's word, moved early enough for the screen to be unreadable when the item shows
  const [bare] = makeBeats(film({ items: ITEMS }), boxes, timing).beats.lists;
  assert.equal(f(bare.blurIn), f(at('id')) - 8);
  // a `from` too late for that is brought forward the same way
  assert.equal(f(makeBeats(film({ from: 'team', items: ITEMS }), boxes, timing).beats.lists[0].blurIn), f(at('id')) - 8);
  assert.deepEqual(moments.list, [{ blur: list.blurIn, items: list.items.map((i) => i.at), out: list.out, sharp: list.sharp }]);
  // a word the line does not say, an empty list, an item with no text: errors that name the line
  assert.throws(() => makeBeats(film({ items: [{ ...ITEMS[0], cue: 'nothing' }] }), boxes, timing), /line 0 has no "nothing"/);
  assert.throws(() => makeBeats(film({ from: 'never', items: ITEMS }), boxes, timing), /line 0 has no "never"/);
  assert.throws(() => makeBeats(film({ items: [] }), boxes, timing), /line 0's list has no items/);
  assert.throws(() => makeBeats(film({ items: [{ icon: 'key', cue: 'id', text: ' ' }] }), boxes, timing), /item with no text/);
});

test('list: the screen is unreadable whenever list type shows; the list is gone before the screen is sharp; nothing pops', () => {
  const file = film({ from: { word: 'your', nth: 0 }, items: ITEMS }), timing = timed(file), S = timing.sentences;
  const [p] = makeBeats(file, boxes, timing).beats.lists;
  assert.ok(f(p.out) >= f(S[0].end) && f(p.out) >= f(p.items.at(-1).at) + 24, 'it clears after the line has ended and the last item has been held');
  assert.ok(p.out < p.clear && p.clear < p.sharp && p.sharp < S[1].start, 'out, gone, sharp, all before the next line');
  assert.ok(Math.abs(p.sharp - S[0].end - LIST_CLEARS) < 0.05, 'the air the pacing gives is the time the list takes to clear');
  let shown = 0;
  for (let n = f(p.blurIn) - 3; n <= f(p.sharp) + 3; n++) {
    const t = n / 30, blur = listBlur(p, t), up = listUp(p, t);
    if (up) { shown++; assert.ok(blur >= 0.7, `frame ${n}: list type over a screen at ${blur.toFixed(2)} of its blur`); }
    if (n < f(p.blurIn) || n >= f(p.sharp)) assert.equal(blur, 0, `frame ${n}: sharp outside the list`);
    assert.ok(Math.abs(blur - listBlur(p, t - 1 / 30)) < 0.3, `frame ${n}: the blur does not jump`);
    p.items.forEach((_, i) => {
      const a = listItem(p, i, t - 1 / 30), b = listItem(p, i, t);
      assert.ok(Math.abs(b.o - a.o) <= 0.34, `frame ${n}, item ${i}: opacity steps ${Math.abs(b.o - a.o).toFixed(2)}`);
      if (a.o > 0 && b.o > 0) assert.ok(Math.abs(b.dy - a.dy) < 0.3, `frame ${n}, item ${i}: it jumps`);
    });
  }
  assert.ok(shown > 60);
  // each item: nothing before its lead, opaque on its word and still rising, settled soon after; earlier items stay
  p.items.forEach((it, i) => {
    assert.equal(listItem(p, i, it.at - 3 / 30).o, 0);
    assert.ok(listItem(p, i, it.at - 2 / 30).o > 0 && listItem(p, i, it.at - 2 / 30).o < 1);
    const on = listItem(p, i, it.at);
    assert.ok(on.o === 1 && on.dy > 0.2 && on.dy < 0.6, 'opaque on the word, part of the way up');
    assert.deepEqual(listItem(p, i, it.at + 10 / 30), { o: 1, dy: 0 });
    assert.deepEqual(listItem(p, i, p.out), { o: 1, dy: 0 }, 'it stays until all clear together');
    assert.equal(listItem(p, i, p.clear).o, 0);
  });
  assert.ok(listItem(p, 0, p.out + 4 / 30).dy < 0, 'they leave upward');
});

test('list: items too close to read, or out of spoken order, are faults that name them', () => {
  const said = (at) => (cue) => at[typeof cue === 'string' ? cue : cue.word];
  const item = (text, cue) => ({ text, icon: 'key', cue });
  let faults = [];
  playList({ items: [item('One', 'a'), item('Two', 'b')] }, 4, said({ a: 10, b: 10.2 }), 12, 30, faults);
  assert.deepEqual(faults, ['line 4: the list\'s items "One" and "Two" are 6 frames apart: too close to read one before the next']);
  faults = [];
  playList({ items: [item('One', 'a'), item('Two', 'b')] }, 4, said({ a: 10, b: 10.3 }), 12, 30, faults);
  assert.deepEqual(faults, [], '9 frames apart is enough');
  playList({ items: [item('One', 'b'), item('Two', 'a')] }, 4, said({ a: 10, b: 11 }), 12, 30, faults);
  assert.deepEqual(faults, ['line 4: the list\'s items are not in the order they are spoken ("Two" is said before "One")']);
  // through the film: the fault is among the film's own
  const close = film({ items: [ITEMS[0], { ...ITEMS[1], cue: 'id' }, ITEMS[2]] });
  assert.match(makeBeats(close, boxes, timed(close)).faults.join('\n'), /"Your ID" and "Your team key" are \d frames apart/);
});

test('list: an icon the set does not have stops the build, naming it and how to see the names', () => {
  const file = film({ items: [ITEMS[0], { ...ITEMS[1], icon: 'buildng' }] }), timing = timed(file);
  const known = (name) => ['id-card', 'building', 'user-round'].includes(name);
  assert.throws(() => makeBeats(file, boxes, timing, undefined, known), /line 0's list names the icon "buildng", which is not in the icon set.*helper\.mjs icons/);
  assert.doesNotThrow(() => makeBeats(film({ items: ITEMS }), boxes, timing, undefined, known));
});

test('list: no cursor while it is up: the entrance waits until the list has cleared, and still reaches its first action', () => {
  const plain = film(null), listed = film({ from: { word: 'your', nth: 0 }, items: ITEMS });
  // without a list, under this long first line, the cursor comes on early and rests (faults.test.mjs)
  const before = makeBeats(plain, boxes, timed(plain)).beats.cursor.moves;
  assert.ok(before[0].to < f(timed(plain).sentences[0].end));
  const timing = timed(listed), made = makeBeats(listed, boxes, timing), [p] = made.beats.lists, moves = made.beats.cursor.moves;
  assert.deepEqual(made.faults, []);
  assert.ok(moves[0].from >= f(p.clear), `the cursor's first move starts at ${moves[0].from}, the list is gone at ${f(p.clear)}`);
  const click = timing.sentences[1].words.find((w) => w.w === 'corner').start;
  assert.equal(moves[0].to, f(click - 0.07), 'it lands for its click as it would have');
  assert.ok(moves[0].to - moves[0].from >= 21, 'with time to travel');
  // the air after the list's line: the pacing adds what the list takes to clear
  const gapPlain = pacing(movesFrom(plain, boxes))[1], gapListed = pacing(movesFrom(listed, boxes))[1];
  assert.ok(Math.abs(gapListed - gapPlain - LIST_CLEARS) < 0.011, `${gapPlain} -> ${gapListed}`);
  // the camera's move to the next beat's framing starts on a sharp screen
  const cam = made.beats.shots[0].camera, move = cam.findIndex((k) => !k.ease && k.frame > f(p.blurIn));
  assert.ok(cam[move - 1].frame >= f(p.sharp), `the camera leaves at ${cam[move - 1].frame}, the screen is sharp at ${f(p.sharp)}`);
  // with no air after the line the cursor cannot do both: a fault says so
  // ...and is not hurried: it keeps its own length. An action cued so early that the camera is far from in: a fault
  const cued = (word) => ({ ...listed, beats: listed.beats.map((b, i) => (i === 1 ? { ...b, cue: word } : b)) });
  assert.ok(cam[move].frame - cam[move - 1].frame >= 75, `the move takes ${cam[move].frame - cam[move - 1].frame} frames`);
  assert.match(makeBeats(cued('the'), boxes, timing).faults.join('\n'), /line 1: after the list the camera is still on its way in when the cursor acts \(\d+ frames short\)/);
  // with no air after the line the cursor cannot do both: a fault says so
  const tight = timingOf(LINES, [0, 0.1, 1.5]);
  assert.match(makeBeats(cued('open'), boxes, tight).faults.join('\n'), /line 1: after the list the cursor has -?\d+ frames to come on and reach "menu"/);
  // a list after the cursor has come on would sit under it: a fault
  const late = { ...plain, beats: [plain.beats[0], { ...plain.beats[1], line: 1 }, { line: 2, list: { items: [{ text: 'All', icon: 'check', cue: 'all' }] } }, { line: 3, cursor: 'leave' }] };
  assert.match(makeBeats(late, boxes, timingOf([...LINES, 'Goodbye'])).faults.join('\n'), /line 2: the cursor is on while the list is up/);
});

test('list: a film without one is the film it was', () => {
  const plain = film(null), timing = timed(plain), made = makeBeats(plain, boxes, timing);
  assert.deepEqual(made.beats.lists, []);
  assert.deepEqual(made.moments.list, []);
  assert.equal(pacing(movesFrom(plain, boxes)).length, 3);
  assert.ok(movesFrom(plain, boxes).every((m) => !m?.list));
});

test('sweep: a list\'s text is read like anything shown: an original typed into an item fails', () => {
  const file = film({ items: [ITEMS[0], { text: 'Your key CK-99812-XA', icon: 'key', cue: 'team' }, { text: 'Ask Rivka Montalban', icon: 'user-round', cue: 'own' }] });
  const seen = listSeen(file);
  assert.deepEqual(seen.map((e) => [e.line, e.item, e.kind]), [[0, 0, 'list'], [0, 1, 'list'], [0, 2, 'list']]);
  const originals = [{ kind: 'secret', value: 'CK-99812-XA' }, { kind: 'cell', value: 'Rivka Montalban' }, { kind: 'cell', value: 'Zebra Corp' }];
  const hits = findHits(seen, originals);
  assert.deepEqual([...new Set(hits.map((h) => h.ids[0]))].sort(), [1, 2], 'items 1 and 2, not item 0');
  assert.ok(hits.every((h) => h.where === 'list' && !h.hidden));
  assert.ok(!JSON.stringify(hits).includes('99812') && !JSON.stringify(hits).includes('Rivka'), 'no value in the report');
  // spaced or punctuated differently, it is still found
  assert.ok(findHits(listSeen(film({ items: [{ text: 'ck 99812 xa', icon: 'key', cue: 'id' }] })), originals).length);
  assert.deepEqual(findHits(listSeen(film({ items: ITEMS })), originals), []);
  assert.deepEqual(listSeen(film(null)), []);
});
