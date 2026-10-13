// The rules the second real tutorial showed the template lacked, each from invented boxes: a framing that holds two
// things, a frame edge that falls between elements, what a click opens whole in the frame, where a click lands on a
// wide control, when a cut comes, when the cursor enters, where it waits after a cut.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraAt, project } from './cameraAt.ts';
import { cursorAt } from './cursorPath.ts';
import { makeBeats } from './beats.ts';
import { cutBy, frameFor, seenBy, settle } from './framing.ts';
import { clearNear, clearOf, spotFor } from './spot.ts';

const VIEW = { width: 2560, height: 1351 }, FRAME = { width: 1920, height: 1080 };
const B = (x, y, w, h, more = {}) => ({ screen: 0, node: 1, x, y, w, h, ...more });
const box = (x, y, w, h) => ({ x, y, w, h });
const inside = (b, v, air = 0) => b.x >= v.x + air && b.y >= v.y + air && b.x + b.w <= v.x + v.w - air && b.y + b.h <= v.y + v.h - air;

/** Timing for lines of text: 0.3 s a word, `gaps[i]` of air before line i. */
const timingOf = (lines, gaps) => {
  let at = 3.6;
  return { fps: 30, dir: 'narration', sentences: lines.map((text, i) => {
    const start = i ? at + gaps[i] : at, words = text.toLowerCase().replace(/[^a-z0-9' ]/g, '').split(' ').map((w, k) => ({ w, start: +(start + k * 0.3).toFixed(3), end: +(start + k * 0.3 + 0.28).toFixed(3) }));
    at = words.at(-1).end;
    return { i, text, file: null, clipAt: start, clipDur: at - start, start, end: at, words };
  }) };
};

// ── 1. a framing that holds two things; the frame's edge between elements ──

test('framing: `targets` frames the union of the named boxes like a group, and is never looser than the framing before', () => {
  const boxes = { tabs: B(270, 337, 487, 237), panel: B(781, 337, 1509, 384), field: B(781, 559, 359, 58) };
  const both = frameFor({ targets: ['tabs', 'panel'] }, boxes, VIEW);
  assert.deepEqual(both.box, { x: 270, y: 337, w: 2020, h: 384 });
  assert.ok(Math.abs(both.fill - 0.78) < 1e-9 && inside(boxes.tabs, seenBy(both)) && inside(boxes.panel, seenBy(both)));
  // a tall pair is held inside the frame's height, like any framing
  const tall = frameFor({ targets: ['a', 'b'] }, { a: B(100, 100, 300, 200), b: B(100, 900, 300, 300) }, VIEW);
  assert.ok(tall.scale * 1100 <= 0.93 * 1080 + 1e-9);
  // after something tighter the camera does not pull back to hold the pair
  const tight = frameFor({ target: 'field', with: 'self' }, boxes, VIEW);
  assert.equal(frameFor({ targets: ['tabs', 'field'] }, boxes, VIEW, tight.scale).scale, tight.scale);
  assert.throws(() => frameFor({ targets: ['tabs', 'nothing'] }, boxes, VIEW), /no measured box named "nothing"/);
});

test('framing: an element the frame edge would cut is brought whole into the frame or left out of it: by a shift first, by widening when no shift does', () => {
  const panel = B(800, 300, 1000, 400), boxes = { panel };
  const plain = frameFor({ target: 'panel' }, boxes, VIEW), v = seenBy(plain);
  // a label a little way across the frame's left edge, most of it in the frame: a shift brings it whole into the frame
  const label = box(v.x - 20, 400, 120, 30);
  assert.ok(cutBy(plain, [label]) > 0);
  const shifted = frameFor({ target: 'panel' }, boxes, VIEW, 0, Infinity, undefined, { pieces: [label] });
  assert.equal(cutBy(shifted, [label]), 0);
  assert.equal(shifted.scale, plain.scale, 'a shift, not a change of scale');
  assert.ok(inside(label, seenBy(shifted)) && inside(panel, seenBy(shifted)), 'the label and the panel are both whole in the frame');
  // a stub of something that is mostly outside the frame: the edge moves off it
  const stub = box(v.x - 200, 400, 240, 36);
  const off = settle(plain, [stub]);
  assert.equal(cutBy(off, [stub]), 0);
  assert.ok(seenBy(off).x >= stub.x + stub.w, 'the stub is out of the frame');
  // a row of tabs too far across the edge for a nudge, with the panel leaving no room to shift: the framing widens to hold it
  const tabs = [0, 1, 2].map((i) => box(v.x - 60, 320 + 50 * i, 200, 36)), fields = [box(v.x + v.w - 215, 320, 200, 40)];
  const wide = settle(plain, [...tabs, ...fields]);
  assert.equal(cutBy(wide, [...tabs, ...fields]), 0);
  assert.ok(wide.scale < plain.scale && wide.scale >= 0.88 * plain.scale - 1e-9, `${wide.scale} of ${plain.scale}`);
  // ...but never looser than the framing before it on the screen
  assert.ok(settle(plain, [...tabs, ...fields], plain.scale).scale >= plain.scale);
  // nothing measured, or nothing cut: the same framing; a band wider than half the frame is nobody's neighbour
  assert.deepEqual(frameFor({ target: 'panel' }, boxes, VIEW, 0, Infinity, undefined, { pieces: [] }), plain);
  assert.equal(settle(plain, [box(v.x + 300, 400, 100, 30), box(0, 250, 2560, 40)]), plain);
  // the whole screen and a corner are what they are: no neighbours move them
  assert.deepEqual(frameFor({ whole: true }, boxes, VIEW, 0, Infinity, undefined, { pieces: [label] }), frameFor({ whole: true }, boxes, VIEW));
  const user = { user: B(2180, 0, 130, 70) }, corner = frameFor({ target: 'user', with: 'corner' }, user, VIEW);
  assert.deepEqual(frameFor({ target: 'user', with: 'corner' }, user, VIEW, 0, Infinity, undefined, { pieces: [box(seenBy(corner).x - 30, 80, 100, 30)] }), corner);
});

// ── 5. what a click opens is whole in the frame the click is seen in ──

const dialogFilm = (frame) => ({ version: 1, title: 'A film', viewport: VIEW, nodes: {}, beats: [
  { line: 0, screen: 0, frame: { whole: true }, cursor: 'enter' },
  { line: 1, frame, cursor: 'click', target: 'button', cue: 'button' },
  { line: 2, frame: { target: 'dialog' }, change: { kind: 'opens', node: 'dialog', after: 'button' } },
  { line: 3, cursor: 'leave' },
] });
const dialogBoxes = { card: B(880, 212, 800, 530), button: B(1261, 624, 258, 37, { row: { x: 1108, y: 624, w: 564, h: 37 } }), dialog: B(1030, 573, 500, 205) };
const dialogTiming = timingOf(['This is the page.', 'Select the button here.', 'A window opens.', 'And that is it.'], [0, 1.2, 0.8, 1]);

test('beats: the framing a click is seen in holds what the click opens, so it is whole in frame from its first frame', () => {
  const { beats, faults } = makeBeats(dialogFilm({ target: 'card' }), dialogBoxes, dialogTiming);
  assert.deepEqual(faults, []);
  const open = beats.shots[0].staging.opens[0], cam = cameraAt(beats.shots[0].camera, Math.round(open.at * 30), FRAME);
  const seen = { x: cam.cx - 960 / cam.s, y: cam.cy - 540 / cam.s, w: 1920 / cam.s, h: 1080 / cam.s };
  assert.ok(inside(dialogBoxes.dialog, seen, 20 / cam.s), `the dialog (to y ${573 + 205}) is inside the frame (to y ${seen.y + seen.h}) as it opens`);
  assert.ok(inside(dialogBoxes.card, seen), 'the card is still whole too');
  // a framing that already holds what opens is left exactly as it was
  const a = makeBeats(dialogFilm({ target: 'button', with: 'row' }), dialogBoxes, dialogTiming).beats.shots[0].camera;
  const lone = structuredClone(dialogFilm({ target: 'button', with: 'row' }));
  delete lone.beats[2].change;
  assert.deepEqual(a.slice(0, 3).map((k) => k.box), makeBeats(lone, dialogBoxes, dialogTiming).beats.shots[0].camera.slice(0, 3).map((k) => k.box));
});

// ── 4. where a click lands ──

test('spot: a wide control with its label at the left is clicked just past the label; a control its content fills, where it was before', () => {
  const tab = spotFor({ w: 487, h: 36 }, [box(16, 8, 64, 20)]);
  assert.ok(tab[0] * 487 > 80 + 7 && tab[0] * 487 < 80 + 60, `the tip is ${Math.round(tab[0] * 487 - 80)} px past the label's end`);
  assert.ok(clearOf(tab[0] * 487, tab[1] * 36, [box(16, 8, 64, 20)]));
  // a field 1500 px wide with a short value at its left
  const field = spotFor({ w: 1509, h: 58 }, [box(13, 26, 110, 20)]);
  assert.ok(field[0] * 1509 < 123 + 100, `${field[0] * 1509}`);
  // content that fills the control (an avatar, a name, a caret): just under it, at the middle, as before
  assert.deepEqual(spotFor({ w: 130, h: 70 }, [box(12, 17, 36, 36), box(55, 25, 46, 20), box(105, 25, 13, 20)]), [0.5, 0.82]);
  // a button with a short centred label: right of the label (0.8, as before); a menu item with a short label at its left: its middle
  assert.deepEqual(spotFor({ w: 258, h: 37 }, [box(70, 9, 18, 18), box(94, 9, 94, 19)]), [0.8, 0.6]);
  assert.deepEqual(spotFor({ w: 192, h: 32 }, [box(12, 8, 14, 14), box(32, 6, 44, 20)]), [0.5, 0.6]);
  // centred text in a wide field: past its end
  assert.deepEqual(spotFor({ w: 466, h: 37 }, [box(158, 9, 150, 19)]), [0.7, 0.6]);
  // nothing in it: the middle
  assert.deepEqual(spotFor({ w: 200, h: 40 }, []), [0.5, 0.6]);
});

// ── 7. when the cut comes ──

const cutFilm = (cue) => ({ version: 1, title: 'A film', viewport: VIEW, nodes: {}, beats: [
  { line: 0, screen: 0, frame: { whole: true }, cursor: 'enter' },
  { line: 1, cursor: 'click', target: 'link', cue },
  { line: 2, screen: 1, frame: { whole: true }, cursor: 'rest', target: 'thing', cue: 'thing', change: { kind: 'page' } },
  { line: 3, cursor: 'leave' },
] });
const cutBoxes = { link: B(400, 300, 200, 40), thing: B(1400, 800, 200, 40) };
const cutTiming = timingOf(['This is the page.', 'Copy this and keep it somewhere safe for later.', 'Here is the thing.', 'And that is it.'], [0, 1, 0.9, 1]);

test('beats: a cut follows the click that causes it at once only when the line is all but said; otherwise the shot holds until just before the next line', () => {
  const S = cutTiming.sentences;
  const early = makeBeats(cutFilm('copy'), cutBoxes, cutTiming);
  assert.deepEqual(early.faults, []);
  assert.ok(Math.abs(early.moments.cuts[0] - (S[2].start - 0.25)) < 1e-9, `the cut at ${early.moments.cuts[0]} waits for the line (to ${S[1].end}); the next starts at ${S[2].start}`);
  assert.ok(early.moments.cuts[0] >= S[1].end);
  const late = makeBeats(cutFilm('later'), cutBoxes, cutTiming), click = late.beats.clicks[0];
  assert.ok(Math.abs(late.moments.cuts[0] - (click + 0.3)) < 1e-9, 'a click on the line\'s last word is followed by the cut 0.3 s later');
  // with little air before the next line, the cut never comes before click + 0.3 s
  const tight = timingOf(['This is the page.', 'Copy this and keep it.', 'Here is the thing.', 'And that is it.'], [0, 1, 0.1, 1]);
  const t = makeBeats(cutFilm('and'), cutBoxes, tight);
  assert.ok(t.moments.cuts[0] >= t.beats.clicks[0] + 0.3 - 1e-9);
});

// ── 6. the cursor is on soon ──

test('beats: under a long first line the cursor is on within about two seconds of the window settling, and rests low and right until its first action', () => {
  const film = { version: 1, title: 'A film', viewport: VIEW, nodes: {}, beats: [
    { line: 0, screen: 0, frame: { whole: true }, cursor: 'enter' },
    { line: 1, frame: { target: 'button' }, cursor: 'click', target: 'button', cue: 'button' },
    { line: 2, cursor: 'leave' },
  ] };
  const boxes = { button: B(1261, 624, 258, 37, { row: { x: 1108, y: 624, w: 564, h: 37 } }) };
  const long = timingOf(['To use this you need three things and here they all are one two and three as promised to you today.', 'Select the button here.', 'And that is it.'], [0, 1, 1]);
  const { beats, faults } = makeBeats(film, boxes, long), settled = beats.shots[0].from + 0.75, onFrame = (p) => p.x > 0 && p.x < 1920 && p.y > 0 && p.y < 1080;
  assert.deepEqual(faults, []);
  const at = (s) => cursorAt(beats.cursor.start, beats.cursor.moves, Math.round(s * 30));
  assert.ok(onFrame(at(settled + 2.1)), 'on the frame two seconds after the window has settled');
  assert.ok(!onFrame(at(settled + 0.5)), 'it comes on, it is not there from the start');
  const rest = at(settled + 3);
  assert.ok(rest.x > 0.6 * 1920 && rest.y > 0.6 * 1080, `it rests low and right (${Math.round(rest.x)}, ${Math.round(rest.y)})`);
  assert.ok(Math.hypot(at(settled + 4).x - rest.x, at(settled + 4).y - rest.y) > 0.01, 'and drifts there');
  // with the screen's elements measured, the resting place is clear of them
  const ink = [box(0.86 * 2560 - 60, 0.84 * 1351 - 15, 160, 30)], lay = { 0: { boxes: { 5: ink[0] } } };
  const made = makeBeats(film, boxes, long, lay), f = Math.round((settled + 2.5) * 30), p = cursorAt(made.beats.cursor.start, made.beats.cursor.moves, f);
  const cam = cameraAt(made.beats.shots[0].camera, f, FRAME), on = project(cam, { x: ink[0].x, y: ink[0].y }, FRAME);
  assert.ok(p.x + 16 < on.x || p.x - 7 > on.x + ink[0].w * cam.s || p.y + 20 < on.y || p.y - 6 > on.y + ink[0].h * cam.s, 'the tip and the arrow are off the element');
  // a first line of ordinary length: the cursor comes on with the camera's first move, as it always has
  const short = timingOf(['This is the page.', 'Select the button here.', 'And that is it.'], [0, 1, 1]);
  assert.equal(makeBeats(film, boxes, short).beats.cursor.moves.length, 2, 'one move to the button, one away');
});

// ── 3. where the cursor waits after a cut ──

test('beats: after a cut the cursor does not wait on text: it steps to the nearest clear spot; waiting long, it drifts toward what it does next', () => {
  const film = (gap) => ({ file: cutFilm('later'), timing: timingOf(['This is the page.', 'Copy this and keep it somewhere safe for later.', gap > 2 ? 'Now wait a good long while before we get round to the thing.' : 'Now here in the middle is the thing.', 'And that is it.'], [0, 1, gap > 2 ? 0.9 : 0.3, 1]) });
  const tipOn = (made, frame, b) => { const p = cursorAt(made.beats.cursor.start, made.beats.cursor.moves, frame), cam = cameraAt(made.beats.shots[1].camera, frame, FRAME), o = project(cam, b, FRAME); return p.x >= o.x && p.x <= o.x + b.w * cam.s && p.y >= o.y && p.y <= o.y + b.h * cam.s; };
  // where the cursor would wait in the new shot: under it, a word
  const { file, timing } = film(0), bare = makeBeats(file, cutBoxes, timing), cut = Math.round(bare.moments.cuts[0] * 30);
  const here = cursorAt(bare.beats.cursor.start, bare.beats.cursor.moves, cut + 1), cam = cameraAt(bare.beats.shots[1].camera, cut + 45, FRAME);
  const word = box(cam.cx + (here.x - 960) / cam.s - 40, cam.cy + (here.y - 540) / cam.s - 12, 180, 30), lay = { 1: { boxes: { 9: word } } };
  const parked = makeBeats(file, cutBoxes, timing, lay);
  assert.deepEqual(parked.faults, []);
  assert.ok(tipOn(bare, cut + 16, word) || bare.beats.cursor.moves.length === 3, 'without the layout nothing is known to be under it');
  for (let f = cut + 16; f < cut + 22; f++) assert.ok(!tipOn(parked, f, word), `frame ${f}: the tip is off the word`);
  // it glides there: no jump across the cut or after it
  let prev = cursorAt(parked.beats.cursor.start, parked.beats.cursor.moves, cut - 1);
  for (let f = cut; f < cut + 40; f++) { const p = cursorAt(parked.beats.cursor.start, parked.beats.cursor.moves, f); assert.ok(Math.hypot(p.x - prev.x, p.y - prev.y) < 60, `jumps at ${f}`); prev = p; }
  // a long wait: by a second and a half after the cut it is on its way toward the target's side, not where it was
  const slow = film(3), waited = makeBeats(slow.file, cutBoxes, slow.timing), c2 = Math.round(waited.moments.cuts[0] * 30);
  const start = cursorAt(waited.beats.cursor.start, waited.beats.cursor.moves, c2), later = cursorAt(waited.beats.cursor.start, waited.beats.cursor.moves, c2 + 60);
  const target = project(cameraAt(waited.beats.shots[1].camera, c2 + 60, FRAME), { x: 1622, y: 822 }, FRAME), d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  assert.ok(d(later, target) < 0.85 * d(start, target), `${Math.round(d(start, target))} px away at the cut, ${Math.round(d(later, target))} two seconds on`);
  assert.ok(d(later, target) > 0.3 * d(start, target), 'it has not arrived: it arrives on its cue');
  assert.deepEqual(waited.faults, []);
});

test('beats: pointing at a field whose neighbour stands where the cursor would rest, it rests on the field\'s own blank spot', () => {
  const field = B(781, 559, 359, 58, { spot: [0.3, 0.6] }), next = box(1164, 559, 359, 58);
  const film = { version: 1, title: 'A film', viewport: VIEW, nodes: {}, beats: [{ line: 0, screen: 0, frame: { whole: true }, cursor: 'enter' }, { line: 1, cursor: 'rest', target: 'field', cue: 'field' }, { line: 2, cursor: 'leave' }] };
  const timing = timingOf(['This is the page.', 'Here is the field you want.', 'And that is it.'], [0, 1, 1]);
  const where = (layout) => { const m = makeBeats(film, { field }, timing, layout), f = m.beats.cursor.moves[0].to + 2, p = cursorAt(m.beats.cursor.start, m.beats.cursor.moves, f), cam = cameraAt(m.beats.shots[0].camera, f, FRAME); return { x: cam.cx + (p.x - 960) / cam.s, y: cam.cy + (p.y - 540) / cam.s }; };
  const alone = where(undefined), crowded = where({ 0: { boxes: { 1: box(781, 559, 359, 58), 2: next } } }), clear = where({ 0: { boxes: { 1: box(781, 559, 359, 58), 2: box(1700, 559, 359, 58) } } });
  assert.ok(Math.abs(alone.x - (781 + 359 + 22)) < 1, 'with nothing measured: beside it');
  assert.ok(Math.abs(clear.x - alone.x) < 1e-6, 'with room beside it: beside it');
  assert.ok(Math.abs(crowded.x - (781 + 0.3 * 359)) < 1 && Math.abs(crowded.y - (559 + 0.6 * 58)) < 1, `with a neighbour there: on its blank spot (${Math.round(crowded.x)}, ${Math.round(crowded.y)})`);
});

test('spot: the nearest clear place to a point on a page', () => {
  const page = box(0, 0, 2560, 1351), ink = [box(300, 300, 200, 30)];
  assert.deepEqual(clearNear({ x: 100, y: 100 }, ink, page), { x: 100, y: 100 });
  const p = clearNear({ x: 320, y: 315 }, ink, page);
  assert.ok(clearOf(p.x, p.y, ink) && Math.hypot(p.x - 320, p.y - 315) < 220);
  // at another scale the arrow is that much larger on the page
  const q = clearNear({ x: 320, y: 315 }, ink, page, 2);
  assert.ok(clearOf(q.x, q.y, ink, 2));
});
