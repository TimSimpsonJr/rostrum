// The generic template: state changes, framing, a film from a beat file. (The camera and cursor math are in
// tutorial.test.mjs. The film that was built by hand before there was a beat file is in ../old/.)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cameraAt, cameraFaults, project } from './cameraAt.ts';
import { cursorAt } from './cursorPath.ts';
import { OPEN, authoredText, makeBeats, movesFrom, screensShown } from './beats.ts';
import { findChange, holdExtent, panelOf } from './changes.ts';
import { cutBy, frameFor, seenBy, settle } from './framing.ts';
import { clearNear, clearOf, spotFor } from './spot.ts';
import { pacing } from '../../../tools/pacing.mjs';

const VP = { width: 1920, height: 1080 };
const el = (id, tagName, attributes = {}, childNodes = []) => ({ type: 2, id, tagName, attributes, childNodes });
const txt = (id, textContent) => ({ type: 3, id, textContent });

test('changes: a subtree that appears after a click is what opened; a changed word is nothing; another address is another page', () => {
  const page = (...extra) => el(1, 'body', {}, [el(2, 'header', {}, [el(3, 'button', { id: 'user' }, [txt(4, 'Dana')]), ...extra]), el(5, 'main', {}, [txt(6, 'Hello')])]);
  const menu = el(10, 'ul', { class: 'dropdown' }, [el(11, 'li', {}, [txt(12, 'Profile')]), el(13, 'li', {}, [txt(14, 'Sign out')]), txt(15, ' ')]);
  assert.deepEqual(findChange(page(), page(menu), 3), { kind: 'opens', node: 10, anchor: 3 });
  // the larger named subtree wins over a stray new node; a new node with no class, role or id is not a thing that opens
  const tip = el(20, 'span', { role: 'tooltip' }, [txt(21, 'Menu')]), bare = el(30, 'div', {}, [el(31, 'p', {}, [txt(32, 'a')]), el(33, 'p', {}, [txt(34, 'b')]), el(35, 'p', {}, [txt(36, 'c')]), el(37, 'p', {}, [txt(38, 'd')])]);
  assert.deepEqual(findChange(page(), page(tip, menu, bare), 3), { kind: 'opens', node: 10, anchor: 3 });
  const reworded = el(1, 'body', {}, [el(2, 'header', {}, [el(3, 'button', { id: 'user' }, [txt(4, 'Dana B.')])]), el(5, 'main', {}, [txt(6, 'Hello')])]);
  assert.equal(findChange(page(), reworded, 3), null);
  assert.deepEqual(findChange({ href: 'https://site.test/home', node: page() }, { href: 'https://site.test/profile', node: page(menu) }, 3), { kind: 'page' });
  assert.deepEqual(findChange({ href: 'https://site.test/home', node: page() }, { href: 'https://site.test/home', node: page(menu) }), { kind: 'opens', node: 10, anchor: null });
  // a menu that was in the page all along and is only shown: the same node, restyled
  const shut = el(10, 'ul', { class: 'dropdown-menu' }, menu.childNodes), shown = el(10, 'ul', { class: 'dropdown-menu show' }, menu.childNodes);
  assert.deepEqual(findChange(page(shut), page(shown), 3), { kind: 'opens', node: 10, anchor: 3 });
  // a dialog shown that way while a one-node backdrop is added to the page: the dialog opened, not the backdrop
  assert.deepEqual(findChange(page(shut), page(shown, el(40, 'div', { class: 'backdrop' })), 3), { kind: 'opens', node: 10, anchor: 3 });
});

const VIEW = { width: 2560, height: 1351 };
const B = (x, y, w, h, more = {}) => ({ screen: 0, node: 1, x, y, w, h, ...more });

test('framing: whole first, then in; a small control comes with its row; the scale never decreases', () => {
  const boxes = { panel: B(880, 212, 800, 530), button: B(1261, 624, 258, 37, { row: { x: 1108, y: 624, w: 564, h: 37 } }), icon: B(1300, 630, 24, 24) };
  const whole = frameFor({ whole: true }, boxes, VIEW);
  assert.deepEqual([whole.box, +whole.fill.toFixed(3)], [{ x: 0, y: 0, w: 2560, h: 1351 }, 0.8]);
  const small = frameFor({ target: 'button' }, boxes, VIEW, whole.scale);
  assert.deepEqual(small.box, { x: 1108, y: 624, w: 564, h: 37 }, 'a 258 px button in a 2560 px window is framed as its row');
  assert.ok(small.fill >= 0.72 && small.fill <= 0.8);
  const smaller = frameFor({ target: 'icon' }, boxes, VIEW, small.scale);                    // no row measured: room made around it
  assert.ok(smaller.box.w >= 0.2 * VIEW.width && smaller.box.x < 1300 && smaller.box.x + smaller.box.w > 1324);
  assert.ok(whole.scale < small.scale && small.scale <= smaller.scale, `${whole.scale} ${small.scale} ${smaller.scale}`);
  // asked to frame something larger after something small, the camera stays where it is rather than pull back
  const back = frameFor({ target: 'panel' }, boxes, VIEW, small.scale);
  assert.equal(back.scale, small.scale);
  // a tall box is held inside the frame's height; a group in its own right is framed wider than a control
  const panel = frameFor({ target: 'panel' }, boxes, VIEW);
  assert.ok(panel.scale * 530 <= 0.93 * 1080 + 1e-9 && panel.fill > 0.75);
  // the corner the target sits in, a little past the window's edges
  const corner = frameFor({ target: 'user', with: 'corner' }, { user: B(2180, 0, 130, 70) }, VIEW);
  assert.deepEqual([corner.box, corner.scale], [{ x: 1620, y: -30, w: 960, h: 540 }, 2]);
  assert.throws(() => frameFor({ target: 'nothing' }, boxes, VIEW), /no measured box/);
});

/** Timing for lines of text: 0.3 s a word, the given air before each line. */
const timingOf = (lines, gaps) => {
  let at = 3.6;
  return { fps: 30, dir: 'narration', sentences: lines.map((text, i) => {
    const start = i ? at + gaps[i] : at, words = text.toLowerCase().replace(/[^a-z0-9' ]/g, '').split(' ').map((w, k) => ({ w, start: +(start + k * 0.3).toFixed(3), end: +(start + k * 0.3 + 0.28).toFixed(3) }));
    at = words.at(-1).end;
    return { i, text, file: null, clipAt: start, clipDur: at - start, start, end: at, words };
  }) };
};

test('beats: whole, a small control, a smaller one: one continuous camera that only goes in, and no fault', () => {
  const boxes = { button: B(1261, 624, 258, 37, { row: { x: 1108, y: 624, w: 564, h: 37 } }), icon: B(1300, 630, 24, 24) };
  const file = { version: 1, title: 'A film', viewport: VIEW, nodes: {}, beats: [
    { line: 0, screen: 0, frame: { whole: true }, cursor: 'enter' },
    { line: 1, frame: { target: 'button' }, cursor: 'click', target: 'button', cue: 'button' },
    { line: 2, frame: { target: 'icon' }, cursor: 'rest', target: 'icon', cue: 'icon' },
    { line: 3, cursor: 'leave' },
  ] };
  const timing = timingOf(['This is the page.', 'Select the button here.', 'Then look at the icon.', 'And that is it.'], pacing(movesFrom(file, boxes)));
  const { beats, faults, frames, fps } = makeBeats(file, boxes, timing);
  assert.deepEqual(faults, []);
  assert.equal(beats.shots.length, 1);
  const cam = beats.shots[0].camera, scales = cam.map((k) => (k.fill * 1920) / k.box.w);
  assert.deepEqual(cam[0].box, { x: 0, y: 0, w: 2560, h: 1351 });
  for (let i = 1; i < scales.length; i++) assert.ok(scales[i] > scales[i - 1], `key ${i} is not tighter than the one before`);
  assert.deepEqual(cameraFaults(cam, Math.ceil(beats.shots[0].from * fps), Math.min(frames, Math.ceil(beats.shots[0].to * fps)) - 1, VP), []);
  assert.deepEqual(beats.shots[0].staging.presses.map((p) => p.at), beats.clicks);
});

// Every tutorial on this machine that has a beat file, its boxes and its timing (the tutorials folder is outside the
// plugin: tools/paths.mjs). None here: these tests are skipped.
const HOME = process.env.ROSTRUM_TUTORIALS ?? path.join(os.homedir(), 'Videos', 'Rostrum');
const tutorials = () => (fs.existsSync(HOME) ? fs.readdirSync(HOME) : []).map((name) => {
  const film = path.join(HOME, name, 'film'), files = [path.join(film, 'beats.json'), path.join(film, 'clean', 'boxes.json'), path.join(film, 'narration', 'timing.json'), path.join(film, 'clean', 'manifest.json')];
  if (!files.every((f) => fs.existsSync(f))) return null;
  const [file, boxes, timing, manifest] = files.map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
  const lay = path.join(film, 'clean', 'layout.json'); // element boxes only (ids and numbers), when the screens were measured
  return { name, file: { ...file, viewport: manifest.viewport ?? file.viewport, viewports: Object.fromEntries((manifest.screens ?? []).map((s) => [s.i, s.viewport ?? manifest.viewport])), screens: (manifest.screens ?? []).map((s) => ({ i: s.i, t: s.t })) }, boxes, timing, layout: fs.existsSync(lay) ? JSON.parse(fs.readFileSync(lay, 'utf8')) : undefined };
}).filter(Boolean);
const made = tutorials();

test('the film from a beat file: every tutorial here is staged whole, its clicks follow the narration, its changes are staged; a film that asks for nothing else keeps the how-to camera', { skip: !made.length }, () => {
  for (const { name, timing, boxes, file, layout } of made) {
    const { beats, fps, frames, close, faults, title } = makeBeats(file, boxes, timing, layout);
    assert.equal(title, file.title);
    const changes = file.beats.flatMap((b) => [b.change, ...(b.then ?? []).map((a) => a.change)]).filter(Boolean), staged = beats.shots.map((s) => s.staging);
    // What the film code remarks on is a note for the builder, never a failure: a film may pull back, pan far or hold.
    // A film that uses none of the moves that do so (a framing marked back, a bar, a sequence, a screen that becomes
    // its next capture) comes out as it always has: no note at all, the camera only ever going in.
    const plain = !file.beats.some((b) => b.frame?.back || b.bar || b.sequence) && !changes.some((c) => c.kind === 'becomes');
    assert.ok(faults.every((x) => typeof x === 'string' && x.length > 8), name);
    if (plain) assert.deepEqual(faults, [], name);
    // the closing line is spoken over the logo reveal: the card is setting as the line starts, the reveal completes inside it
    assert.ok(close.endCard < close.closer.start && close.revealed > close.closer.start && close.revealed < close.closer.end + 0.2, name);
    if (beats.cursor.moves.length) assert.ok(beats.cursor.moves.at(-1).to <= close.windowOut * fps, `${name}: the cursor has left before the window does`);
    if (plain) for (const shot of beats.shots) assert.deepEqual(cameraFaults(shot.camera, Math.ceil(shot.from * fps), Math.min(frames, Math.ceil(shot.to * fps)) - 1, VP), [], name);
    assert.deepEqual([...beats.clicks].sort((a, b) => a - b), beats.clicks);
    for (const c of beats.clicks) assert.ok(beats.cursor.moves.some((m) => m.to <= c * fps && m.to >= c * fps - 12), `${name}: no cursor move ends just before the click at ${c}`);
    let prev = cursorAt(beats.cursor.start, beats.cursor.moves, 0);
    for (let f = 1; f < frames; f++) { // one cursor, never teleporting: not even across a cut
      const p = cursorAt(beats.cursor.start, beats.cursor.moves, f);
      assert.ok(Math.hypot(p.x - prev.x, p.y - prev.y) < 90, `${name}: the cursor jumps at frame ${f}`);
      prev = p;
    }
    // the screens are the beat file's, in order; the first is met whole unless the beat file frames it otherwise
    const screens = file.beats.reduce((list, b) => (b.screen != null && b.screen !== list.at(-1) ? [...list, b.screen] : list), []);
    assert.deepEqual(beats.shots.map((s) => s.screen), screens, name);
    // what the screens stage, as data: every change the beat file names, every click a press; a new screen assembles after its cut
    const opens = staged.flatMap((s) => s.opens), selects = staged.flatMap((s) => s.selects), presses = staged.flatMap((s) => s.presses);
    const swaps = beats.shots.flatMap((s) => (s.screens ?? []).slice(1).map((x) => x.at)), onBar = beats.shots.flatMap((s) => (s.bar?.click ? [s.bar.click.at] : []));
    for (const c of changes) {
      if (c.kind === 'opens') {
        const o = opens.find((x) => x.node === boxes[c.node].node), anchor = c.after && boxes[c.after];
        assert.ok(o, `${name}: "${c.node}" does not open`);
        // (from under the bar unless the bar's `arrives` says otherwise)
        const arrives = { down: 'above', right: 'right', appear: 'centre' }[file.beats.find((b) => b.bar)?.bar.arrives ?? 'down'];
        assert.equal(o.from, anchor && anchor.node < 0 ? arrives : anchor && Math.abs(boxes[c.node].y - (anchor.y + anchor.h)) <= 8 ? 'top' : 'centre', `${name}: "${c.node}" comes from under the bar, hangs from what was clicked, or does neither`);
        // (on the click that opens it, or with the capture it is first in, when the screen becomes that capture after the click)
        if (anchor) assert.ok(beats.clicks.some((t) => o.at > t && o.at - t < 0.1) || swaps.some((t) => Math.abs(t - o.at) < 1e-6), `${name}: "${c.node}" opens on the click that opens it`);
      }
      if (c.kind === 'selects') assert.ok(selects.some((x) => x.node === boxes[c.node].node && (c.to != null ? x.until > x.at : beats.clicks.includes(x.at))), `${name}: "${c.node}" is not selected on its click (or, a block, over its words)`);
    }
    assert.equal(opens.length, changes.filter((c) => c.kind === 'opens').length);
    assert.deepEqual(presses.map((p) => p.at), beats.clicks.filter((t) => !onBar.includes(t)), name); // (a bar's bookmark answers the click itself: it is not a node of the page)
    staged.forEach((s, i) => assert.equal(!!s.assemble, i > 0, `${name}: shot ${i}`));
    beats.shots.slice(1).forEach((shot) => assert.equal(shot.staging.assemble.at, shot.from));
  }
});

test('beats: a `move` carries on from the stop before it without resting there; a `rest` stays', () => {
  const boxes = { a: B(1000, 300, 200, 40), b: B(1000, 500, 200, 40), c: B(1000, 700, 200, 40) };
  const film = (second) => ({ version: 1, title: 'A film', viewport: VIEW, nodes: {}, beats: [
    { line: 0, screen: 0, frame: { whole: true }, cursor: 'enter' },
    { line: 1, cursor: 'rest', target: 'a', cue: 'one', then: [{ cursor: second, target: 'c', cue: 'there' }] },
    { line: 2, cursor: 'leave' },
  ] });
  const timing = timingOf(['This is the page.', 'Here is one and two and then at last there is three.', 'And that is it.'], [0, 1, 1]);
  const gap = (second) => { const { beats, faults } = makeBeats(film(second), boxes, timing); assert.deepEqual(faults, []); return beats.cursor.moves[1].from - beats.cursor.moves[0].to; };
  assert.ok(gap('move') <= 3, `a move leaves ${gap('move')} frames after the cursor arrived`);
  assert.ok(gap('rest') > 15, `a rest is left after ${gap('rest')} frames`);
});

test('leave: after a click whose page takes its time (a `becomes` that waits) the cursor stays on what it clicked until the capture has come', () => {
  const boxes = { save: B(1000, 700, 200, 40) }, screens = [{ i: 0, t: 0 }, { i: 1, t: 5 }];
  const film = (wait) => ({ version: 1, title: 'A film', viewport: VIEW, screens, nodes: {}, beats: [
    { line: 0, screen: 0, frame: { whole: true }, cursor: 'enter' },
    { line: 1, cursor: 'click', target: 'save', cue: 'save', then: [{ change: { kind: 'becomes', screen: 1, after: 'save', wait } }] },
    { line: 2, cursor: 'leave' },
  ] });
  const timing = (wait) => timingOf(['This is the page.', 'Now select save.', 'And that is it.'], pacing(movesFrom(film(wait), boxes)));
  const made = (wait) => { const { beats } = makeBeats(film(wait), boxes, timing(wait)); return { leave: beats.cursor.moves.at(-1), swap: beats.shots[0].screens[1].at, click: beats.clicks[0] }; };
  const slow = made(true), quick = made(false);
  assert.ok(Math.abs(slow.swap - (slow.click + 2)) < 0.04, 'the capture comes 2 s after the click');
  assert.ok(slow.leave.from >= Math.round((slow.swap + 0.3) * 30) && slow.leave.to > slow.leave.from, `it leaves at frame ${slow.leave.from}, the capture comes at ${slow.swap} s`);
  assert.ok(quick.leave.from < Math.round(quick.swap * 30) + 15, 'a page that answers at once is left as before');
});

test('framing: a row leans toward where the camera goes next, part of the way, and stays whole in the frame', () => {
  const boxes = { button: B(1261, 624, 258, 37, { row: { x: 1108, y: 624, w: 564, h: 37 }, group: { x: 1120, y: 382, w: 540, h: 340 } }) };
  const alone = frameFor({ target: 'button', with: 'row' }, boxes, VIEW), next = { x: 1280, y: 676 };
  const led = frameFor({ target: 'button', with: 'row' }, boxes, VIEW, 0, Infinity, next);
  const mid = (f) => ({ x: f.box.x + f.box.w / 2, y: f.box.y + f.box.h / 2 });
  assert.ok(mid(alone).y < 642.5 && mid(alone).x === 1390, 'with nowhere to go next it leans toward its group (here, up)');
  assert.ok(mid(led).x < 1390 && mid(led).x > 1280 && mid(led).y > 642.5 && mid(led).y < 676, JSON.stringify(mid(led)));
  assert.equal(led.scale, alone.scale);
  const half = 1920 / led.scale / 2;                         // the row is still wholly inside the frame
  assert.ok(mid(led).x - half < 1108 && mid(led).x + half > 1108 + 564);
});

test('beats: a cue the line does not say, or a target that was not measured, is an error that names it', () => {
  const boxes = { button: B(1261, 624, 258, 37) };
  const file = { version: 1, title: 'A film', viewport: VIEW, nodes: {}, beats: [{ line: 0, screen: 0, frame: { whole: true }, cursor: 'enter' }, { line: 1, cursor: 'click', target: 'button', cue: 'button' }, { line: 2, cursor: 'leave' }] };
  const timing = timingOf(['This is the page.', 'Select the button here.', 'And that is it.'], [0, 1, 1]);
  assert.deepEqual(makeBeats(file, boxes, timing).faults, []);
  const wrongCue = structuredClone(file);
  wrongCue.beats[1].cue = 'banana';
  assert.throws(() => makeBeats(wrongCue, boxes, timing), /line 1 has no "banana"/);
  const wrongTarget = structuredClone(file);
  wrongTarget.beats[1].target = 'nowhere';
  assert.throws(() => makeBeats(wrongTarget, boxes, timing), /"nowhere"/);
});

test('viewports: a film that cuts between screens of two sizes frames each whole screen by its own width, and parks the cursor inside its own window', () => {
  const timing = { fps: 30, dir: 'narration', sentences: [
    { i: 0, file: 'a', clipAt: 3.6, clipDur: 2, start: 3.6, end: 5.6, words: [{ w: 'mail', start: 3.6, end: 4 }, { w: 'table', start: 4.5, end: 5 }] },
    { i: 1, file: 'b', clipAt: 6.5, clipDur: 2, start: 6.5, end: 8.5, words: [{ w: 'now', start: 6.5, end: 7 }, { w: 'save', start: 7.5, end: 8 }] },
    { i: 2, file: 'c', clipAt: 9.5, clipDur: 2, start: 9.5, end: 11.5, words: [{ w: 'done', start: 9.5, end: 10 }] } ] };
  const boxes = { table: { screen: 0, node: 5, x: 600, y: 400, w: 700, h: 300 }, save: { screen: 1, node: 9, x: 1800, y: 1100, w: 200, h: 60, spot: [0.5, 0.6] } };
  const file = { version: 1, title: 'T', viewport: { width: 1707, height: 878 }, viewports: { 0: { width: 1707, height: 878 }, 1: { width: 2560, height: 1317 } }, nodes: { table: [0, 5], save: [1, 9] },
    beats: [{ line: 0, screen: 0, frame: { whole: true }, cursor: 'enter' }, { line: 1, screen: 1, frame: { whole: true }, cursor: 'click', target: 'save', cue: 'save', change: { kind: 'page' } }, { line: 2, cursor: 'leave' }], chalk: [] };
  const { beats, faults, fps } = makeBeats(file, boxes, timing);
  assert.deepEqual(faults, []);
  const [a, b] = beats.shots;
  assert.deepEqual(a.camera[0].box, { x: 0, y: 0, w: 1707, h: 878 });
  assert.deepEqual(b.camera[0].box, { x: 0, y: 0, w: 2560, h: 1317 });
  // the same width on the stage: both whole framings fill 0.8 of the frame's width
  assert.ok(Math.abs(a.camera[0].fill - 0.8) < 1e-9 && Math.abs(b.camera[1].fill - 0.8) < 1e-9);
  // without `viewports` every screen is the one viewport (films prepared before this change)
  const old = makeBeats({ ...file, viewports: undefined }, boxes, timing);
  assert.deepEqual(old.beats.shots[1].camera[0].box, { x: 0, y: 0, w: 1707, h: 878 });
});

test('bar: it grows out of the window\'s top before the click on its bookmark and goes back in after its line; the page\'s boxes stay put, the camera makes the room, and what the bookmark opens comes from above', () => {
  const timing = { fps: 30, dir: 'narration', sentences: [
    { i: 0, file: 'a', clipAt: 3.6, clipDur: 3, start: 3.6, end: 6.6, words: [{ w: 'now', start: 3.6, end: 3.9 }, { w: 'open', start: 4.2, end: 4.5 }, { w: 'bookmarklet', start: 5.6, end: 6.2 }] },
    { i: 1, file: 'b', clipAt: 8.5, clipDur: 2, start: 8.5, end: 10.5, words: [{ w: 'paste', start: 9.5, end: 10 }] },
    { i: 2, file: 'c', clipAt: 11.5, clipDur: 2, start: 11.5, end: 13.5, words: [{ w: 'done', start: 11.5, end: 12 }] } ] };
  const vp = { width: 1608, height: 900 }, H = 192; // the bar on a 1608 px window is 192 px tall
  const boxes = { panel: { screen: 0, node: 7, x: 1000, y: 340, w: 560, h: 500 }, field: { screen: 0, node: 8, x: 1020, y: 420, w: 500, h: 200, spot: [0.5, 0.6] }, 'bar:hero': { screen: 0, node: -1, x: 700, y: -64, w: 230, h: 46, spot: [0.6, 0.86] } };
  const bar = { title: 'T', host: 'h.example', bookmarks: [{ label: 'A', icon: 'inbox' }, { label: 'Hero', icon: 'bookmark' }], hero: 'Hero', from: 'open' };
  const file = { version: 1, title: 'T', viewport: vp, nodes: { panel: [0, 7], field: [0, 8] }, chalk: [],
    beats: [{ line: 0, screen: 0, frame: { whole: true }, cursor: 'enter', bar, then: [{ cursor: 'click', target: 'bar:hero', cue: 'bookmarklet', change: { kind: 'opens', node: 'panel', after: 'bar:hero' } }] },
      { line: 1, frame: { target: 'panel' }, cursor: 'click', target: 'field', cue: 'paste' }, { line: 2, cursor: 'leave' }] };
  const { beats, faults, moments } = makeBeats(file, boxes, timing);
  assert.deepEqual(faults, []);
  const shot = beats.shots[0], play = shot.bar.play, F = (t) => Math.round(t * 30);
  assert.ok(play.from === 4.2 && play.to <= 5.6 - 0.3 + 1e-9 && play.back >= 6.6 && play.gone > play.back, 'out from its cue, whole before the click, back in after the line');
  assert.deepEqual([shot.bar.click.at, shot.bar.viewport], [5.6, vp]);
  assert.deepEqual(moments.bar, [play.from, play.to, play.back, play.gone]);
  // the window grows about its middle: with the bar out the camera's centre is up by half the bar, and comes back after
  const before = cameraAt(shot.camera, F(4), VP), out = cameraAt(shot.camera, F(play.to), VP), after = cameraAt(shot.camera, F(play.gone), VP);
  assert.ok(Math.abs(before.cy - 450) < 0.5 && Math.abs(out.cy - (450 - H / 2)) < 0.5 && Math.abs(after.cy - 450) < 0.5, `${before.cy} ${out.cy} ${after.cy}`);
  assert.ok(out.s >= before.s, 'the bar does not push the camera back');
  // what the bookmark opens slides down from under the bar; the bookmark is the bar's own, not a node the page presses
  assert.equal(shot.staging.opens[0].from, 'above');
  assert.ok(shot.staging.opens[0].at >= 5.6 && shot.staging.opens[0].at < 5.7);
  assert.deepEqual(shot.staging.presses.map((p) => p.node), [8]);
  // the cursor presses the bookmark above the page, and is back inside the window once the bar has gone
  const on = (f) => { const p = cursorAt(beats.cursor.start, beats.cursor.moves, f), cam = cameraAt(shot.camera, f, VP); return cam.cy + (p.y - VP.height / 2) / cam.s; };
  assert.ok(on(F(5.6)) < -10 && on(F(play.gone)) > 0, `${on(F(5.6))} ${on(F(play.gone))}`);
  // `leaves: with-camera`: the push to the next framing starts once what the bookmark brought has arrived (0.7 s for
  // one that comes down, and a breath), the bar is whole until the window's top is above the frame and gone from
  // then, the camera ends where it would have, and the cursor is left behind on the bookmark, above the window
  const gone = makeBeats({ ...file, beats: [{ ...file.beats[0], bar: { ...bar, leaves: 'with-camera' } }, ...file.beats.slice(1)] }, boxes, timing), g = gone.beats.shots[0], gp = g.bar.play;
  assert.deepEqual(gone.faults, []);
  assert.ok(Math.abs(gp.back - (5.6 + 0.7 + 0.1)) < 1 / 30 && gp.back < play.back && gp.off > gp.back && gp.off <= gp.gone, `${gp.back} ${gp.off} ${gp.gone}`);
  const topAt = (f) => project(cameraAt(g.camera, f, VP), { x: 0, y: 0 }, VP).y;
  assert.ok(topAt(F(gp.off)) <= -2 && topAt(F(gp.off) - 1) > -2 && topAt(F(gp.back)) > 0, 'taken away on the first frame its foot is above the frame');
  const end = cameraAt(g.camera, F(10.4), VP), plainEnd = cameraAt(shot.camera, F(10.4), VP);   // (the hold's slow push has run longer)
  assert.ok(Math.abs(end.cx - plainEnd.cx) < 1 && Math.abs(end.cy - plainEnd.cy) < 1 && Math.abs(end.s / plainEnd.s - 1) < 0.03, `${JSON.stringify(end)} ${JSON.stringify(plainEnd)}`);
  const left = (f) => { const p = cursorAt(gone.beats.cursor.start, gone.beats.cursor.moves, f), cam = cameraAt(g.camera, f, VP); return cam.cy + (p.y - VP.height / 2) / cam.s; };
  assert.ok(Math.abs(left(F(gp.back) + 12) - left(F(5.6))) < 0.5 && left(F(5.6)) < -10, 'the cursor stays on the bookmark it pressed while the camera goes');
  // (a framing that keeps the window's top in the frame cannot carry it out: a note, and the bar goes back in)
  const kept = makeBeats({ ...file, beats: [{ ...file.beats[0], bar: { ...bar, leaves: 'with-camera' } }, { ...file.beats[1], frame: undefined }, file.beats[2]] }, boxes, timing);
  assert.ok(kept.faults.some((f) => /leaves with the camera/.test(f)) && kept.beats.shots[0].bar.play.off == null);
  // a bar with no bookmark for its hero is not a bar; a second bar is one too many
  assert.throws(() => makeBeats({ ...file, beats: [{ ...file.beats[0], bar: { ...bar, hero: 'Nope' } }, ...file.beats.slice(1)] }, boxes, timing), /hero "Nope"/);
  assert.throws(() => makeBeats({ ...file, beats: [file.beats[0], { ...file.beats[1], bar }, file.beats[2]] }, boxes, timing), /one bar/);
  assert.deepEqual(authoredText(file).map((a) => a.s), ['T', 'h.example', 'A', 'Hero']);
});

test('fills, a dragged selection, a screen that becomes its next capture, a sequence and a pull-back: all in the beat file, all timed from the narration', () => {
  const timing = { fps: 30, dir: 'narration', sentences: [
    { i: 0, file: 'a', clipAt: 3.6, clipDur: 3, start: 3.6, end: 6.6, words: [{ w: 'select', start: 3.6, end: 4 }, { w: 'top', start: 4.4, end: 4.6 }, { w: 'bottom', start: 5.8, end: 6.2 }] },
    { i: 1, file: 'b', clipAt: 7.5, clipDur: 3, start: 7.5, end: 10.5, words: [{ w: 'paste', start: 7.5, end: 8 }, { w: 'field', start: 8.6, end: 9 }, { w: 'go', start: 9.8, end: 10 }] },
    { i: 2, file: 'c', clipAt: 11.5, clipDur: 3, start: 11.5, end: 14.5, words: [{ w: 'enter', start: 11.5, end: 12 }, { w: 'short', start: 12.5, end: 13 }, { w: 'name', start: 13.8, end: 14.2 }] },
    { i: 3, file: 'd', clipAt: 15.5, clipDur: 7, start: 15.5, end: 22.5, words: [{ w: 'moment', start: 15.5, end: 16 }, { w: 'finish', start: 22, end: 22.4 }] },
    { i: 4, file: 'e', clipAt: 23.5, clipDur: 2, start: 23.5, end: 25.5, words: [{ w: 'done', start: 23.5, end: 24 }] } ] };
  const B = (screen, node, x, y, w, h) => ({ screen, node, x, y, w, h, spot: [0.5, 0.6] });
  const boxes = { table: B(0, 5, 300, 300, 900, 400), field: B(1, 8, 1000, 100, 500, 200), go: B(1, 10, 1000, 320, 120, 40), sub: B(2, 9, 1000, 500, 300, 40), panel: B(1, 11, 980, 80, 540, 300), grown: B(2, 11, 980, 80, 540, 520), list: B(7, 12, 100, 100, 1400, 700) };
  const screens = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ i, t: [0, 10, 20, 30, 30.5, 31.5, 40, 50][i] }));
  const file = { version: 1, title: 'T', viewport: { width: 1600, height: 900 }, screens, nodes: { table: [0, 5], field: [1, 8], go: [1, 10], sub: [2, 9], panel: [1, 11], grown: [2, 11], list: [7, 12] }, chalk: [], beats: [
    { line: 0, screen: 0, frame: { whole: true }, cursor: 'rest', target: 'table', cue: 'select' },
    { line: 0, cue: 'top', change: { kind: 'selects', node: 'table', to: 'bottom' } },
    { line: 1, screen: 1, frame: { target: 'panel' }, cursor: 'click', target: 'field', cue: 'field', change: { kind: 'fills', node: 'field', text: ['a  b', 'c  d'] },
      then: [{ cursor: 'click', target: 'go', cue: 'go', change: { kind: 'becomes', screen: 2, after: 'go', grows: ['panel', 'grown'] } }] },
    { line: 2, cue: 'enter', change: { kind: 'fills', node: 'sub', typed: true, to: 'name' } },
    { line: 3, frame: { target: 'list', back: true }, sequence: { from: 3, watch: 5, then: [6, 7], follow: 'list' } },
    { line: 4, cursor: 'leave' } ] };
  const { beats, faults, moments } = makeBeats(file, boxes, timing);
  const [a, b] = beats.shots, near = (x, y) => Math.abs(x - y) < 1 / 30 + 1e-9;
  assert.equal(beats.shots.length, 2, 'a screen that becomes its next capture, and a sequence, stay in their shot');
  // a block: selected from the beat's word to the word `to`, by how far down the cursor's tip is
  assert.deepEqual([a.staging.selects[0].node, a.staging.selects[0].at, a.staging.selects[0].until, typeof a.staging.selects[0].edge(5)], [5, 4.4, 5.8, 'number']);
  // a paste: whole, just after the click on the field, in the film's own words; typing: over its line, to its word
  assert.deepEqual(b.staging.fills.map((f) => ({ ...f, at: +f.at.toFixed(2) })), [{ node: 8, at: 8.72, until: 8.72 + 0, text: 'a  b\nc  d' }, { node: 9, at: 11.62, until: 13.8 }].map((f) => ({ ...f, until: f.node === 8 ? b.staging.fills[0].at : f.until })));
  assert.deepEqual(authoredText(file), [{ line: 1, what: 'fill', s: 'a  b\nc  d' }]);
  // the captures of the shot, in time: its own; what it becomes 0.3 s after the click; the sequence
  assert.deepEqual(b.screens.map((x) => x.screen), [1, 2, 3, 4, 5, 6, 7]);
  assert.ok(near(b.screens[1].at, 9.8 + 0.3) && near(b.screens[2].at, 15.5) && near(b.screens[3].at, 16) && near(b.screens[4].at, 17), 'the watched captures keep the pace they were recorded at');
  // a `becomes` that waits comes as long after its click as the recording took from the capture before (10 s here: 2 s, the most)
  const slow = structuredClone(file);
  slow.beats[2].then[0].change.wait = true;
  assert.ok(near(makeBeats(slow, boxes, timing).beats.shots[1].screens[1].at, 9.8 + 2));
  const dwell = b.screens[5].at - b.screens[4].at;
  assert.ok(near(b.screens[6].at - b.screens[5].at, dwell) && dwell >= 7 / 30 && b.screens[6].at <= 22.5 - 0.35 + 1 / 30, 'the rest are spread evenly, the last up before the line ends');
  assert.deepEqual(moments.swaps, b.screens.slice(1).map((x) => x.at));
  assert.deepEqual(screensShown(file, screens.map((s) => s.i)), [0, 1, 2, 3, 4, 5, 6, 7]);
  // what grew with the capture is carried from its old box; a scroll box that is followed stays at its end
  assert.deepEqual(b.staging.grows, [{ node: 11, at: b.screens[1].at, dx: 0, dy: 0, right: 0, bottom: 220 }]);
  assert.deepEqual(b.staging.follows, [12]);
  // what a capture adds to the one before it sets in (staging `adds`), where the two can be matched: both measured
  // and nothing of the one before gone. Not for a capture that takes something away, an unmeasured one, or a `grows`
  assert.equal(b.staging.adds, undefined, 'without measured screens every capture comes whole, as before');
  const P = { x: 0, y: 0, w: 10, h: 10 }, layout = { 1: { boxes: { 1: P } }, 2: { boxes: { 1: P, 9: P } }, 5: { boxes: { 1: P, 2: P } }, 6: { boxes: { 1: P, 2: P, 3: P, 4: P } }, 7: { boxes: { 1: P, 3: P, 4: P, 5: P } } };
  const grown = makeBeats(file, boxes, timing, layout).beats.shots[1];
  assert.deepEqual(grown.staging.adds, [{ at: grown.screens[5].at, nodes: [3, 4] }]);
  assert.deepEqual(grown.camera, b.camera);
  // a framing marked `back` is as wide as it asks: the camera pulls back to it, and the film code says so in a note
  const tight = cameraAt(b.camera, Math.round(13 * 30), VP).s, wide = cameraAt(b.camera, Math.round(21 * 30), VP).s;
  assert.ok(wide < tight * 0.7, `${tight} -> ${wide}`);
  assert.ok(faults.length && faults.every((f) => /scale decreases|moves up to/.test(f)), faults.join('; '));
  // too many screens to watch for the line: a note that names the line, and still a film
  const long = makeBeats({ ...file, beats: file.beats.map((x) => (x.sequence ? { ...x, sequence: { from: 3, watch: 6, then: [7] } } : x)) }, boxes, timing);
  assert.ok(long.faults.some((f) => /line 3: the watched screens/.test(f)));
});

test('spot: a control that is all label gets the tip under its label, on the control and off the letters', () => {
  const size = { w: 119, h: 34 }, ink = [{ x: 10, y: 6, w: 99, h: 20 }];
  const [fx, fy] = spotFor(size, ink), x = fx * size.w, y = fy * size.h;
  assert.ok(y > 26 + 1 && y < 34 - 1 && x > 10 + 0.5 * 99 && x < 109, `${x}, ${y}`);
  assert.equal(spotFor({ w: 119, h: 24 }, [{ x: 1, y: 1, w: 117, h: 22 }]), undefined, 'no room at all: no spot, and the click point falls back as before');
});

const T3 = (words) => ({ fps: 30, dir: 'narration', sentences: words.map((ws, i) => { const start = 3.6 + 3 * i; return { i, file: `l${i}`, clipAt: start, clipDur: 2.4, start, end: start + 2.4, words: ws.map((w, k) => ({ w, start: start + 0.5 * k, end: start + 0.5 * k + 0.4 })) }; }) });
const MOVES = { 'mark-time': { about: { name: 'mark-time' }, check: (i) => (typeof i.text === 'string' ? null : 'text is two to four words'), text: (i) => [i.text], takes: () => 0.7 }, 'slide': { about: { name: 'slide', use: 'cut' }, takes: () => 0.8 } };
const moveOf = (n) => MOVES[n] ?? null;
const BOX = { screen: 0, node: 5, x: 600, y: 400, w: 700, h: 300, spot: [0.5, 0.6] };

test('cut on the first beat: the way into the first shot from the open; it runs to its `until` word, its cue inputs are seconds, its text is the sweep\'s, and the shot, its camera and the cursor are as without it', () => {
  const timing = T3([['open', 'the', 'menu', 'right', 'here', 'now'], ['done']]);
  const boxes = { menu: BOX };
  const beat = { line: 0, screen: 0, frame: { whole: true }, cursor: 'rest', target: 'menu', cue: 'now' };
  const file = (cut) => ({ version: 1, title: 'T', viewport: VP, nodes: { menu: [0, 5] }, chalk: [], beats: [{ ...beat, ...(cut ? { cut } : {}) }, { line: 1, cursor: 'leave' }] });
  const opens = (n) => (n === 'unfold' ? { about: { name: 'unfold', use: 'cut', cues: ['lands'], text: ['label'] }, text: (i) => [i.label], takes: () => 0.8 } : null);
  const plain = makeBeats(file(), boxes, timing, undefined, undefined, false, opens).beats;
  const { beats, faults } = makeBeats(file({ move: 'unfold', until: 'right', lands: 'the', label: 'A letter' }), boxes, timing, undefined, undefined, false, opens);
  assert.deepEqual(faults, []);
  const from = beats.shots[0].from;
  assert.deepEqual(beats.cuts, [{ name: 'unfold', shot: 0, at: from, dur: Math.round((5.1 - from) * 30) / 30, inputs: { label: 'A letter', lands: 4.1 }, pins: {}, window: { x: 0, y: 0, w: VP.width, h: VP.height } }]);
  assert.deepEqual(beats.shots, plain.shots, 'the shot and its camera are the plain film\'s');
  assert.equal(JSON.stringify(beats.cursor.moves.map((m) => [m.from, m.to])), JSON.stringify(plain.cursor.moves.map((m) => [m.from, m.to])), 'and so is the cursor');
  assert.deepEqual(plain.cuts, []);
  // without `until` it runs for its own length
  assert.equal(makeBeats(file({ move: 'unfold', label: 'A letter' }), boxes, timing, undefined, undefined, false, opens).beats.cuts[0].dur, 0.8);
  assert.throws(() => makeBeats(file({ move: 'unfold', until: 'done' }), boxes, timing, undefined, undefined, false, opens), /line 0 has no "done"/);
  assert.deepEqual(authoredText(file({ move: 'unfold', until: 'right', label: 'A letter' }), opens), [{ line: 0, what: 'unfold', s: 'A letter' }]);
});

test('moves: a beat\'s moves run from their cues, carry their inputs and the boxes they name; a bad input or an unknown move stops the build; authored text is listed for the sweep', () => {
  const timing = T3([['open', 'the', 'menu'], ['choose', 'profile', 'now'], ['done']]);
  const boxes = { menu: BOX, save: { ...BOX, screen: 1, node: 9 } };
  const file = { version: 1, title: 'T', viewport: VP, nodes: { menu: [0, 5], save: [1, 9] }, chalk: [], beats: [
    { line: 0, screen: 0, frame: { whole: true }, cursor: 'enter', moves: [{ move: 'mark-time', text: 'Step 1', at: 'menu' }] },
    { line: 1, screen: 1, frame: { whole: true }, cursor: 'click', target: 'save', cue: 'now', change: { kind: 'page' }, moves: [{ move: 'mark-time', text: 'Step 2', at: 'choose', until: 'profile', target: 'save' }] },
    { line: 2, cursor: 'leave' }] };
  const { beats, faults } = makeBeats(file, boxes, timing, undefined, undefined, false, moveOf);
  assert.deepEqual(faults, []);
  assert.equal(beats.moves.length, 2);
  const [a, b] = beats.moves;
  assert.equal(a.from, 3.6 + 1.0); assert.equal(a.to, 6.0, 'to the line end when that is later than from + takes');
  assert.deepEqual([b.from, b.to, b.shot, b.name], [6.6, 7.1, 1, 'mark-time']);
  assert.deepEqual(b.inputs, { text: 'Step 2', target: 'save' });
  assert.deepEqual(b.pins, { save: { x: 600, y: 400, w: 700, h: 300 } }, 'an input that names a measured element carries its box');
  assert.deepEqual(b.pinScreens, { save: 1 }, '...and, beside it, the screen it is measured on');
  assert.equal('pinScreens' in a, false, 'a move that names no element has none');
  assert.deepEqual(authoredText(file, moveOf).filter((x) => x.what === 'mark-time').map((x) => x.s), ['Step 1', 'Step 2']);
  assert.throws(() => makeBeats({ ...file, beats: [{ ...file.beats[0], moves: [{ move: 'nope' }] }, ...file.beats.slice(1)] }, boxes, timing, undefined, undefined, false, moveOf), /names the move "nope"/);
  assert.throws(() => makeBeats({ ...file, beats: [{ ...file.beats[0], moves: [{ move: 'mark-time' }] }, ...file.beats.slice(1)] }, boxes, timing, undefined, undefined, false, moveOf), /line 0's mark-time: text/);
  // without a registry (older callers) moves are carried through unchecked
  assert.equal(makeBeats(file, boxes, timing).beats.moves.length, 2);
});

test('lifts: a move that draws elements alone (about.lifts) is told which node of which screen each is, beside its unchanged pins; a move that lifts nothing has none; a name with no measured box stops the build', () => {
  const timing = T3([['open', 'the', 'menu'], ['done']]);
  const boxes = { menu: BOX, save: { ...BOX, screen: 1, node: 9 } }, lifter = { about: { name: 'lifter', lifts: ['node', 'more[]'] } }, of = (n) => (n === 'lifter' ? lifter : moveOf(n));
  const file = { version: 1, title: 'T', viewport: VP, nodes: { menu: [0, 5], save: [1, 9] }, chalk: [], beats: [
    { line: 0, screen: 0, frame: { whole: true }, cursor: 'enter', moves: [{ move: 'lifter', node: 'menu', more: ['save'], at: 'menu' }, { move: 'mark-time', text: 'Step 1' }] },
    { line: 1, cursor: 'leave' }] };
  const [a, b] = makeBeats(file, boxes, timing, undefined, undefined, false, of).beats.moves;
  assert.deepEqual(a.lifts, { menu: { node: 5, screen: 0 }, save: { node: 9, screen: 1 } });
  assert.deepEqual(a.pins, { menu: { x: 600, y: 400, w: 700, h: 300 }, save: { x: 600, y: 400, w: 700, h: 300 } }, 'a pin is still exactly a box');
  assert.equal('lifts' in b, false);
  assert.throws(() => makeBeats({ ...file, beats: [{ ...file.beats[0], moves: [{ move: 'lifter', node: 'nope' }] }, file.beats[1]] }, boxes, timing, undefined, undefined, false, of), /line 0's lifter names "nope", which has no measured box/);
});

test('cut: a cut move keeps the outgoing shot mounted for its length and hands both shots over; scene: a shot with no screen has no camera, and the cursor is off it', () => {
  // (the click after the cut is cued late in its line: the cursor comes on only once the cut move has run)
  const timing = T3([['open', 'the', 'menu'], ['an', 'idea', 'here'], ['choose', 'profile', 'and', 'save', 'now'], ['done']]);
  const boxes = { menu: BOX, save: { ...BOX, screen: 1, node: 9 } };
  const file = { version: 1, title: 'T', viewport: VP, stage: 'light', nodes: { menu: [0, 5], save: [1, 9] }, chalk: [], beats: [
    { line: 0, screen: 0, frame: { whole: true }, cursor: 'click', target: 'menu', cue: 'menu' },
    { line: 1, scene: { stage: 'dark' }, moves: [{ move: 'mark-time', text: 'An idea', at: 'idea' }] },
    { line: 2, screen: 1, frame: { whole: true }, cursor: 'click', target: 'save', cue: 'now', change: { kind: 'page' }, cut: { move: 'slide', direction: 'left' } },
    { line: 3, cursor: 'leave' }] };
  const { beats, fps, faults } = makeBeats(file, boxes, timing, undefined, undefined, false, moveOf);
  assert.deepEqual(faults, []);
  assert.equal(beats.shots.length, 3);
  const [a, scene, b] = beats.shots;
  assert.equal(scene.scene?.stage, 'dark'); assert.equal(scene.screen, -1);
  assert.deepEqual(beats.cuts, [{ name: 'slide', shot: 2, at: b.from, dur: 0.8, inputs: { direction: 'left' }, pins: {}, window: { x: 0, y: 0, w: VP.width, h: VP.height } }]);
  assert.equal(scene.to, b.from + 0.8, 'the outgoing shot stays up while the cut runs');
  assert.equal(beats.tone, 'light');
  // the new page sets in after a cut move as after a plain cut, unless the cut says it lands on the page whole
  assert.equal(b.staging.assemble.at, b.from);
  const landing = (n) => (n === 'slide' ? { about: { name: 'slide', use: 'cut', whole: true }, takes: () => 0.8 } : moveOf(n));
  assert.equal(makeBeats(file, boxes, timing, undefined, undefined, false, landing).beats.shots[2].staging.assemble, undefined);
  // the cursor leaves before the scene's cut and comes back for the next shot's click, never jumping
  const off = cursorAt(beats.cursor.start, beats.cursor.moves, Math.round(scene.from * fps));
  assert.ok(off.x > VP.width || off.y > VP.height, `the cursor is off the frame at the scene's start: ${JSON.stringify(off)}`);
  // ...and it stays off while the cut move brings the new shot in: its entrance waits for the cut to have run
  const held = cursorAt(beats.cursor.start, beats.cursor.moves, Math.round((b.from + 0.8) * fps));
  assert.ok(held.x > VP.width || held.y > VP.height, `the cursor is still off the frame on the cut's last frame: ${JSON.stringify(held)}`);
  let prev = cursorAt(beats.cursor.start, beats.cursor.moves, 0);
  // (as far as that click: the film's closing leave is the template's own, and these invented lines leave it half a second)
  for (let f = 1; f <= Math.round(beats.clicks[1] * fps); f++) { const p = cursorAt(beats.cursor.start, beats.cursor.moves, f); assert.ok(Math.hypot(p.x - prev.x, p.y - prev.y) < 90, `jump at ${f}`); prev = p; }
  assert.throws(() => makeBeats({ ...file, beats: [file.beats[0], { ...file.beats[1], cursor: 'rest', target: 'menu' }, ...file.beats.slice(2)] }, boxes, timing, undefined, undefined, false, moveOf), /a scene has no cursor/);
  assert.throws(() => makeBeats({ ...file, beats: [file.beats[0], file.beats[1], { line: 2, frame: { whole: true } }, file.beats[3]] }, boxes, timing, undefined, undefined, false, moveOf), /after a scene/);
});

test('moves: the inputs a move lists as cues (about.cues) reach it as seconds of the film; its check still sees the words', () => {
  const timing = T3([['open', 'the', 'menu'], ['one', 'two', 'three'], ['done']]);
  const seen = [], paced = { about: { name: 'paced', cues: ['each', 'on'] }, check: (i) => { seen.push(i.each); return null; } };
  const file = { version: 1, title: 'T', viewport: VP, nodes: { menu: [0, 5] }, chalk: [], beats: [
    { line: 0, screen: 0, frame: { whole: true }, cursor: 'enter' },
    { line: 1, moves: [{ move: 'paced', each: ['one', { word: 'three' }], on: 'two', label: 'two' }, { move: 'paced' }] },
    { line: 2, cursor: 'leave' }] };
  const { beats } = makeBeats(file, { menu: BOX }, timing, undefined, undefined, false, (n) => (n === 'paced' ? paced : null));
  assert.deepEqual(beats.moves[0].inputs, { each: [6.6, 7.6], on: 7.1, label: 'two' }, 'the cues are seconds; an input that is not a cue keeps its word');
  assert.deepEqual(beats.moves[1].inputs, {}, 'a cue input that was not given is not made up');
  assert.deepEqual(seen[0], ['one', { word: 'three' }]);
  assert.throws(() => makeBeats({ ...file, beats: [file.beats[0], { line: 1, moves: [{ move: 'paced', each: ['nope'] }] }, file.beats[2]] }, { menu: BOX }, timing, undefined, undefined, false, () => paced), /has no "nope"/);
});

test('end: a logo lift gives the last shot one more camera key, a push onto the logo that arrives as the end card sets; the close\'s times and a film without it do not change', () => {
  const timing = T3([['open', 'the', 'menu'], ['choose', 'profile', 'now'], ['done']]);
  const boxes = { menu: BOX, mark: { screen: 0, node: 2, x: 640, y: 480, w: 640, h: 90 }, speck: { screen: 0, node: 3, x: 40, y: 30, w: 60, h: 20 } };
  const file = { version: 1, title: 'T', viewport: VP, nodes: {}, chalk: [], beats: [
    { line: 0, screen: 0, frame: { whole: true }, cursor: 'enter' }, { line: 1, cursor: 'click', target: 'menu', cue: 'profile' }, { line: 2, cursor: 'leave' }] };
  const plain = makeBeats(file, boxes, timing), lifted = makeBeats({ ...file, end: { move: 'logo-lift', from: 'mark' } }, boxes, timing);
  assert.equal(plain.beats.lift, undefined);
  assert.deepEqual(lifted.close, plain.close); assert.equal(lifted.frames, plain.frames);
  const a = plain.beats.shots[0].camera, b = lifted.beats.shots[0].camera, fps = 30, close = plain.close;
  assert.equal(b.length, a.length + 1, 'one more key');
  assert.deepEqual(b.slice(0, -2), a.slice(0, -1), 'the camera before the push is the film\'s own');
  assert.equal(b.at(-2).frame, Math.round((close.windowOut - 0.6) * fps)); assert.equal(b.at(-1).frame, Math.round(close.endCard * fps));
  assert.deepEqual([b.at(-1).box, b.at(-1).ease], [{ x: 640, y: 480, w: 640, h: 90 }, 'heavy']);
  assert.equal(b.at(-1).fill, 0.6, 'a logo near the middle is framed at 0.6 of the frame');
  assert.deepEqual(lifted.faults, []);
  assert.deepEqual(cameraFaults(b, Math.ceil(lifted.beats.shots[0].from * fps), Math.ceil(lifted.beats.shots[0].to * fps) - 1, VP), []);
  // where the logo is on the frame when the push arrives: in the middle, 0.6 of the frame wide
  const at = lifted.beats.lift.from;
  assert.ok(Math.abs(at.w - 0.6 * 1920) < 1e-6 && Math.abs(at.x + at.w / 2 - 960) < 1e-6 && Math.abs(at.y + at.h / 2 - 540) < 1e-6, JSON.stringify(at));
  // a small mark in a far corner is not chased across the frame: the push stops short of 0.6, goes in all the same, and keeps the camera's rule
  const far = makeBeats({ ...file, end: { move: 'logo-lift', from: 'speck' } }, boxes, timing), cam = far.beats.shots[0].camera, scale = (k) => (k.fill * 1920) / k.box.w;
  assert.ok(cam.at(-1).fill < 0.6 && scale(cam.at(-1)) > scale(cam.at(-2)), `${cam.at(-1).fill}`);
  assert.deepEqual(far.faults, []);
  assert.ok(far.beats.lift.from.w < 0.6 * 1920);
  assert.throws(() => makeBeats({ ...file, end: { move: 'logo-lift', from: 'nothing' } }, boxes, timing), /end names "nothing", which has no measured box/);
  assert.throws(() => makeBeats({ ...file, end: { move: 'spin', from: 'mark' } }, boxes, timing), /end is \{ move: "logo-lift".*or \{ move: "fade" \}/);
  assert.throws(() => makeBeats({ ...file, beats: [...file.beats.slice(0, 2), { line: 2, scene: {} }], end: { move: 'logo-lift', from: 'mark' } }, boxes, timing), /ends on a whole screen/);
});

test('end: a glyph cuts the last shot away 1.5 s before its window would have left and stands in the middle; the camera and the close are the plain film\'s; on a scrolled page a box of the end is raised by the scroll', () => {
  const timing = T3([['open', 'the', 'menu'], ['choose', 'profile', 'now'], ['done']]);
  const boxes = { menu: BOX, card: { screen: 0, node: 2, x: 600, y: 300, w: 800, h: 400 }, tower: { screen: 0, node: 3, x: 100, y: 100, w: 200, h: 800 }, low: { screen: 0, node: 4, x: 640, y: 1500, w: 640, h: 90 }, far: { screen: 0, node: 7, x: 100, y: 2000, w: 300, h: 100 }, other: { screen: 1, node: 9, x: 0, y: 0, w: 10, h: 10 } };
  const file = { version: 1, title: 'T', viewport: VP, nodes: {}, chalk: [], beats: [
    { line: 0, screen: 0, frame: { whole: true }, cursor: 'enter' }, { line: 1, cursor: 'click', target: 'menu', cue: 'choose' }, { line: 2, cursor: 'leave' }] };
  const plain = makeBeats(file, boxes, timing), ended = makeBeats({ ...file, end: { move: 'end-glyph', glyph: 'card' } }, boxes, timing), close = plain.close;
  assert.deepEqual(ended.close, plain.close); assert.equal(ended.frames, plain.frames); assert.equal(ended.beats.lift, undefined);
  assert.deepEqual(ended.beats.shots[0].camera, plain.beats.shots[0].camera, 'the camera is the plain film\'s');
  const g = ended.beats.glyph;
  assert.equal(g.at, Math.round((close.windowOut - 1.5) * 30) / 30); assert.equal(ended.beats.shots[0].to, g.at, 'the last shot ends on the cut to it');
  assert.deepEqual([g.node, g.screen, g.box], [2, 0, { x: 600, y: 300, w: 800, h: 400 }]);
  assert.deepEqual(g.rest, { x: 672, y: 396, w: 576, h: 288 }, '0.3 of the frame wide, in the middle');
  const tall = makeBeats({ ...file, end: { move: 'end-glyph', glyph: 'tower' } }, boxes, timing).beats.glyph.rest;
  assert.deepEqual([tall.h, tall.w], [540, 135], 'a tall one is half the frame high at most');
  // the cursor is off the frame by the cut; the line before the closing one is still being said then: a note
  const tip = cursorAt(ended.beats.cursor.start, ended.beats.cursor.moves, Math.round(g.at * 30));
  assert.ok(tip.x > VP.width || tip.y > VP.height, JSON.stringify(tip));
  assert.match(ended.faults.join('\n'), /end: the glyph cuts in \d+ frames before line 1 has been said/);
  assert.throws(() => makeBeats({ ...file, end: { move: 'end-glyph', glyph: 'nothing' } }, boxes, timing), /end names "nothing", which has no measured box/);
  assert.throws(() => makeBeats({ ...file, end: { move: 'end-glyph', glyph: 'other' } }, boxes, timing), /not on the screen the film ends on/);
  assert.throws(() => makeBeats({ ...file, end: { move: 'end-glyph' } }, boxes, timing), /end is \{ move: "logo-lift".*or \{ move: "end-glyph"/);
  assert.throws(() => makeBeats({ ...file, beats: [...file.beats.slice(0, 2), { line: 2, scene: {} }], end: { move: 'end-glyph', glyph: 'card' } }, boxes, timing), /an end glyph ends on a whole screen/);
  // a page that has scrolled by the end: the glyph's box, and a logo lift's push, are where the scroll left them
  const scrolled = { ...file, beats: [file.beats[0], { line: 1, cue: 'choose', change: { kind: 'scrolls', to: 'far' } }, file.beats[2]] };
  const up = makeBeats(scrolled, boxes, timing).beats.shots[0].scroll.at(-1).y1;
  assert.equal(up, 1020, 'the page is 2100 px long in a 1080 px window');
  assert.equal(makeBeats({ ...scrolled, end: { move: 'end-glyph', glyph: 'low' } }, boxes, timing).beats.glyph.box.y, 480);
  const lifted = makeBeats({ ...scrolled, end: { move: 'logo-lift', from: 'low' } }, boxes, timing);
  assert.equal(lifted.beats.shots[0].camera.at(-1).box.y, 480);
  assert.ok(Math.abs(lifted.beats.lift.from.y + lifted.beats.lift.from.h / 2 - 540) < 1e-6, 'and the mark sets out of where it is on the frame');
});

test('end: a fade holds the last shot\'s camera still from when its window would have left, keeps the shot up over the end card for the fade, and changes nothing else', () => {
  const timing = T3([['open', 'the', 'menu'], ['choose', 'profile', 'now'], ['done']]);
  const file = { version: 1, title: 'T', viewport: VP, nodes: {}, chalk: [], beats: [
    { line: 0, screen: 0, frame: { whole: true }, cursor: 'enter' }, { line: 1, cursor: 'click', target: 'menu', cue: 'profile' }, { line: 2, cursor: 'leave' }] };
  const plain = makeBeats(file, { menu: BOX }, timing), faded = makeBeats({ ...file, end: { move: 'fade' } }, { menu: BOX }, timing), close = plain.close, fps = 30;
  assert.equal(plain.beats.fade, undefined); assert.equal(faded.beats.fade, true);
  assert.deepEqual(faded.close, plain.close); assert.equal(faded.frames, plain.frames);
  assert.deepEqual([faded.beats.lift, faded.beats.glyph], [undefined, undefined]);
  const shot = faded.beats.shots[0], cam = shot.camera;
  assert.equal(shot.to, Math.round((close.endCard + 0.3) * fps) / fps, 'up until 0.3 s into the end card');
  const still = Math.round(close.windowOut * fps), at = (f) => cameraAt(cam, f, VP);
  assert.deepEqual(cam.slice(0, -2), plain.beats.shots[0].camera.slice(0, -1), 'the camera before is the film\'s own');
  assert.deepEqual(at(Math.round(shot.to * fps) - 1), at(still), 'the camera does not move from when the window would have left');
  assert.deepEqual(faded.faults, plain.faults);
});

test('stage: a tone, or a named stage that passes its own check; its tone is the film\'s; a scene may name one; a film without one is as before', async () => {
  const { loadMoves, moveMap } = await import('../../../tools/moves.mjs');
  const lib = moveMap(await loadMoves({ oneOffs: false })), of = (n) => lib[n] ?? null;
  const timing = T3([['open', 'the', 'menu'], ['an', 'idea', 'here'], ['done']]);
  const file = (stage, scene) => ({ version: 1, title: 'T', viewport: VP, ...(stage !== undefined ? { stage } : {}), nodes: {}, chalk: [], beats: [
    { line: 0, screen: 0, frame: { whole: true }, cursor: 'enter' }, { line: 1, scene: scene ?? {} }, { line: 2, screen: 0, frame: { whole: true } }] });
  const make = (stage, scene) => makeBeats(file(stage, scene), { menu: BOX }, timing, undefined, undefined, false, of).beats;
  const field = { move: 'field', from: 'accent', to: '#102040' };
  assert.deepEqual([make(field).stage, make(field).tone], [field, 'light']);
  assert.equal(make({ ...field, tone: 'dark' }).tone, 'dark');
  assert.deepEqual([make('dark').tone, 'stage' in make('dark'), make().tone, 'stage' in make()], ['dark', false, 'light', false]);
  assert.deepEqual(make(undefined, { stage: { move: 'environment', tone: 'dark' } }).shots[1].scene.stage, { move: 'environment', tone: 'dark' });
  for (const name of ['field', 'environment', 'image', 'footage']) assert.equal(of(name).about.use, 'stage', name);
  assert.throws(() => make({ move: 'cards' }), /stage "cards" is not a stage in the library/);
  assert.throws(() => make({ move: 'nope' }), /stage "nope" is not a stage/);
  assert.throws(() => make('blue'), /stage is "light", "dark", or a named stage/);
  assert.throws(() => make({ move: 'field', colour: 'url(x)' }), /stage \(field\): a colour is/);
  assert.throws(() => make({ move: 'image', file: '../secret.png' }), /stage \(image\): file is a plain file name/);
  assert.throws(() => make({ move: 'footage', file: 'https://x.test/a.mp4' }), /stage \(footage\): file is a plain file name/);
  assert.throws(() => make(undefined, { stage: { move: 'image', file: 'brand/../x.png' } }), /line 1's stage \(image\): file is a plain file name/);
});

test('close: what an open showed goes the way it came, on the cue, and is shut until its next open', () => {
  const S = (i, start, words) => ({ i, file: `s${i}`, clipAt: start, clipDur: 2, start, end: start + 2, words: words.map(([w, at]) => ({ w, start: at, end: at + 0.3 })) });
  const timing = { fps: 30, dir: 'narration', sentences: [S(0, 3.6, [['open', 4.2]]), S(1, 6.5, [['read', 6.5]]), S(2, 9.5, [['now', 9.5], ['done', 10.4]]), S(3, 12.5, [['again', 13]]), S(4, 15.5, [['bye', 15.5]])] };
  const B = (node, x, y, w, h) => ({ screen: 0, node, x, y, w, h, spot: [0.5, 0.6] });
  // the menu hangs directly under its button (an open from its top edge); the dialog does not hang from anything
  const boxes = { button: B(5, 700, 300, 200, 40), other: B(6, 1000, 300, 200, 40), menu: B(7, 700, 344, 240, 200), dialog: B(9, 560, 360, 480, 180) };
  const file = { version: 1, title: 'T', viewport: { width: 1600, height: 900 }, nodes: { button: [0, 5], other: [0, 6], menu: [0, 7], dialog: [0, 9] }, chalk: [], beats: [
    { line: 0, screen: 0, frame: { whole: true }, cursor: 'click', target: 'button', cue: 'open', change: { kind: 'opens', node: 'menu', after: 'button' } },
    { line: 1, cursor: 'rest', target: 'menu', cue: 'read' },
    { line: 2, cue: 'done', change: { kind: 'close', node: 'menu' } },
    { line: 3 }, { line: 4, cursor: 'leave' }] };
  const { beats, faults, moments } = makeBeats(file, boxes, timing), st = beats.shots[0].staging;
  assert.deepEqual(faults, []);
  assert.equal(st.opens[0].from, 'top');
  assert.deepEqual(st.closes, [{ node: 7, at: 10.4, from: 'top', until: Infinity }]);
  assert.ok(moments.opens.includes(10.4), 'a still is worth taking as it closes');
  // without a cue it closes with its line; something the film never opened closes as a dialog does
  const plain = makeBeats({ ...file, beats: [...file.beats.slice(0, 2), { line: 2, change: { kind: 'close', node: 'dialog' } }, ...file.beats.slice(3)] }, boxes, timing).beats.shots[0].staging;
  assert.deepEqual(plain.closes, [{ node: 9, at: 9.5, from: 'centre', until: Infinity }]);
  // it opens again later: shut from the close until then
  const again = makeBeats({ ...file, beats: [...file.beats.slice(0, 3), { line: 3, cursor: 'click', target: 'other', cue: 'again', change: { kind: 'opens', node: 'menu', after: 'other' } }, file.beats[4]] }, boxes, timing).beats.shots[0].staging;
  assert.equal(again.closes[0].until, again.opens[1].at);
  assert.ok(again.opens[1].at >= 13 && again.opens[1].at < 13.1);
  // a film with no close has no `closes` at all (its staging is what it was)
  assert.ok(!('closes' in makeBeats({ ...file, beats: [...file.beats.slice(0, 2), { line: 2 }, ...file.beats.slice(3)] }, boxes, timing).beats.shots[0].staging));
  assert.throws(() => makeBeats({ ...file, beats: [...file.beats.slice(0, 2), { line: 2, change: { kind: 'close', node: 'nope' } }, ...file.beats.slice(3)] }, boxes, timing), /names "nope", which has no measured box/);
  // a menu the capture holds hidden (`unhide`): staged as any open, and marked to be displayed
  const hid = structuredClone(file); hid.beats[0].change.unhide = true;
  const h = makeBeats(hid, boxes, timing).beats.shots[0].staging.opens[0];
  assert.deepEqual(h, { ...st.opens[0], unhide: true });
  assert.ok(!('unhide' in st.opens[0]));
  hid.beats[0].change.unhide = 'yes';
  assert.throws(() => makeBeats(hid, boxes, timing), /line 0: an opens' unhide is true or false/);
});

test('drag: the press is held from the cue to the release, the thing rides to where it is dropped, and the page after the drop follows', () => {
  const S = (i, start, words) => ({ i, file: `s${i}`, clipAt: start, clipDur: 3, start, end: start + 3, words: words.map(([w, at]) => ({ w, start: at, end: at + 0.3 })) });
  const timing = { fps: 30, dir: 'narration', sentences: [S(0, 3.6, [['drag', 4.5], ['drop', 5.7]]), S(1, 8, [['bye', 8]])] };
  const B = (screen, node, x, y) => ({ screen, node, x, y, w: 400, h: 40, spot: [0.25, 0.5] });
  const boxes = { rowA: B(0, 5, 600, 300), rowB: B(0, 6, 600, 400) };
  const file = { version: 1, title: 'T', viewport: { width: 1600, height: 900 }, nodes: { rowA: [0, 5], rowB: [0, 6] }, chalk: [], beats: [
    { line: 0, screen: 0, frame: { whole: true }, cursor: 'drag', target: 'rowA', to: 'rowB', cue: 'drag', release: 'drop', change: { kind: 'becomes', screen: 1 } }, { line: 1, cursor: 'leave' }] };
  const { beats, faults, fps } = makeBeats(file, boxes, timing), shot = beats.shots[0];
  assert.deepEqual(faults, []);
  assert.deepEqual(beats.clicks, [], 'a drag is no click');
  assert.deepEqual(beats.drags, [{ shot: 0, from: 4.5, release: 5.7, to: 6, screen: 0, node: 5, box: { x: 600, y: 300, w: 400, h: 40 }, grab: { x: 100, y: 20 } }]);
  assert.deepEqual(shot.staging.hides, [{ node: 5, at: 4.5, until: 6 }]);
  assert.deepEqual(shot.screens.map((x) => x.screen), [0, 1]); assert.equal(shot.screens[1].at, 6, 'the page after the drop comes 0.3 s after the release');
  // two moves: onto the row by the cue, then to where it is dropped by the release, held by the same spot
  const [onto, carry] = beats.cursor.moves, at = (m) => { const p = m.stop(m.to), cam = cameraAt(shot.camera, m.to, VP); return { x: cam.cx + (p.x - VP.width / 2) / cam.s, y: cam.cy + (p.y - VP.height / 2) / cam.s }; };
  assert.equal(onto.to, Math.round((4.5 - 0.07) * fps)); assert.equal(carry.to, Math.round(5.7 * fps));
  assert.ok(Math.abs(at(onto).x - 700) < 0.01 && Math.abs(at(onto).y - 320) < 0.01 && Math.abs(at(carry).x - 700) < 0.01 && Math.abs(at(carry).y - 420) < 0.01, JSON.stringify([at(onto), at(carry)]));
  assert.throws(() => makeBeats({ ...file, beats: [{ ...file.beats[0], release: undefined }, file.beats[1]] }, boxes, timing), /line 0: a drag is/);
  assert.throws(() => makeBeats({ ...file, beats: [{ ...file.beats[0], to: 'nope' }, file.beats[1]] }, boxes, timing), /names "nope", which has no measured box/);
  // a film with no drag has none of it
  const plain = makeBeats({ ...file, beats: [{ line: 0, screen: 0, frame: { whole: true }, cursor: 'click', target: 'rowA', cue: 'drag' }, file.beats[1]] }, boxes, timing).beats;
  assert.ok(!('drags' in plain) && !('hides' in plain.shots[0].staging));
});

test('hover: a tip opens as the cursor comes to rest ON its control, which takes the hover look, and closes as the cursor moves on', () => {
  const S = (i, start, words) => ({ i, file: `s${i}`, clipAt: start, clipDur: 2, start, end: start + 2, words: words.map(([w, at]) => ({ w, start: at, end: at + 0.3 })) });
  const timing = { fps: 30, dir: 'narration', sentences: [S(0, 3.6, [['hover', 4.4]]), S(1, 6.5, [['next', 7]]), S(2, 9.5, [['bye', 9.5]])] };
  const B = (node, x, y, w, h) => ({ screen: 0, node, x, y, w, h, spot: [0.5, 0.6] });
  const boxes = { button: B(5, 700, 300, 200, 40), other: B(6, 300, 600, 200, 40), tip: B(7, 700, 346, 180, 30) };
  const file = { version: 1, title: 'T', viewport: { width: 1600, height: 900 }, nodes: { button: [0, 5], other: [0, 6], tip: [0, 7] }, chalk: [], beats: [
    { line: 0, screen: 0, frame: { whole: true }, cursor: 'rest', target: 'button', cue: 'hover', change: { kind: 'hover', node: 'tip', after: 'button' } },
    { line: 1, cursor: 'rest', target: 'other', cue: 'next' }, { line: 2, cursor: 'leave' }] };
  const { beats, faults } = makeBeats(file, boxes, timing), st = beats.shots[0].staging, fps = 30;
  assert.deepEqual(faults, []);
  const on = beats.cursor.moves.find((m) => m.to === Math.round((4.4 - 0.05) * fps)), away = beats.cursor.moves[beats.cursor.moves.indexOf(on) + 1].from / fps;
  assert.deepEqual(st.opens, [{ node: 7, at: 4.4, from: 'top' }]);
  assert.deepEqual(st.closes, [{ node: 7, at: away, from: 'top', until: Infinity }]);
  assert.deepEqual(st.hovers, [{ node: 5, at: 4.4, until: away }]);
  assert.ok(away > 4.4 && away < 7);
  // the cursor is on the control (its blank spot), not beside it
  const cam = cameraAt(beats.shots[0].camera, on.to, VP), p = on.stop(on.to), spot = project(cam, { x: 700 + 0.5 * 200, y: 300 + 0.6 * 40 }, VP);
  assert.ok(Math.abs(p.x - spot.x) < 1e-6 && Math.abs(p.y - spot.y) < 1e-6, JSON.stringify(p));
  // no cursor action on the control: a note, and nothing staged for it
  const none = makeBeats({ ...file, beats: [{ line: 0, screen: 0, frame: { whole: true }, change: { kind: 'hover', node: 'tip', after: 'button' } }, ...file.beats.slice(1)] }, boxes, timing);
  assert.match(none.faults.join('\n'), /line 0: the hover's control "button" has no cursor action on this shot/);
  assert.ok(!('hovers' in none.beats.shots[0].staging) && none.beats.shots[0].staging.opens.length === 0);
  assert.throws(() => makeBeats({ ...file, beats: [{ ...file.beats[0], change: { kind: 'hover', node: 'tip', after: 'nope' } }, ...file.beats.slice(1)] }, boxes, timing), /names "nope", which has no measured box/);
});

// ── the showcase's engine choices (plan 3) ──
/** a small film for them: one screen, a click, a second screen */
const SHOW = { button: B(1261, 624, 258, 37, { row: { x: 1108, y: 624, w: 564, h: 37 } }), panel: B(880, 212, 800, 530), card: { ...B(600, 300, 900, 500), screen: 1 } };
const showFile = (more = {}, beats) => ({ version: 1, title: 'A film', viewport: VIEW, nodes: {}, beats: beats ?? [
  { line: 0, screen: 0, frame: { whole: true } },
  { line: 1, frame: { target: 'panel' }, cursor: 'click', target: 'button', cue: 'button' },
  { line: 2, screen: 1, frame: { whole: true }, change: { kind: 'page' } },
  { line: 3, cursor: 'leave' },
], ...more });
const SHOW_LINES = ['This is the page.', 'Select the button here.', 'Then look at the card.', 'And that is it.'];
const showTiming = (file) => timingOf(SHOW_LINES, pacing(movesFrom(file, SHOW)));

test('open: a film that names none opens as ever; title-makes-room and cut-to-screen have the screen on from frame 0', () => {
  const file = showFile(), timing = showTiming(file), S0 = timing.sentences[0].start;
  const plain = makeBeats(file, SHOW, timing).beats;
  assert.equal(plain.open, undefined); assert.equal(plain.shots[0].from, S0 - 0.55); assert.equal(plain.openLeave, S0 - 1.3);
  const room = makeBeats(showFile({ open: { move: 'title-makes-room' } }), SHOW, timing);
  assert.deepEqual(room.faults, []);
  assert.equal(room.beats.open, 'title-makes-room'); assert.equal(room.beats.shots[0].from, 0); assert.equal(room.beats.shots[0].camera[0].frame, 0);
  assert.equal(room.beats.openLeave, S0 - 1); assert.equal(room.moments.enter, 0);
  // nothing acts on the first shot while its window is aside: the camera's first move and the cursor's entrance
  // start once it is back (OPEN.clear + OPEN.back after the title starts to go)
  const back = Math.round((S0 - 1 + OPEN.clear + OPEN.back) * 30);
  assert.ok(room.beats.shots[0].camera[1].frame >= back, 'the camera holds its first framing until the window is back');
  assert.ok(room.beats.cursor.moves[0].from >= back, 'the cursor comes on after it');
  assert.deepEqual(room.beats.shots.slice(1), plain.shots.slice(1), 'the shots after the first are as ever');
  const cut = makeBeats(showFile({ open: { move: 'cut-to-screen' } }), SHOW, timing).beats;
  assert.ok(cut.openLeave < 0 && cut.shots[0].from === 0 && cut.open === 'cut-to-screen');
  assert.throws(() => makeBeats(showFile({ open: { move: 'fade' } }), SHOW, timing), /open is \{ move: "title-makes-room" \| "cut-to-screen" \}/);
  // the window is put aside at its size: a first shot that is not its whole screen is remarked on
  const close = makeBeats(showFile({ open: { move: 'title-makes-room' } }, [{ line: 0, screen: 0, frame: { target: 'panel' } }, ...showFile().beats.slice(1)]), SHOW, timing);
  assert.match(close.faults.join('\n'), /title-makes-room puts the whole first screen aside/);
});

test('framing: a cut is two keys one frame apart and no fault, wider or tighter; a held shot does not drift', () => {
  const beats = [
    { line: 0, screen: 0, frame: { whole: true } },
    { line: 1, frame: { target: 'panel', cut: true }, cursor: 'click', target: 'button', cue: 'button' },
    { line: 2, frame: { whole: true, cut: true } },
    { line: 3, cursor: 'leave' },
  ];
  const file = showFile({}, beats), timing = showTiming(file), made = makeBeats(file, SHOW, timing), cam = made.beats.shots[0].camera;
  assert.deepEqual(made.faults, []);
  const cuts = cam.filter((k) => k.cut);
  assert.equal(cuts.length, 2);
  for (const k of cuts) assert.equal(cam[cam.indexOf(k) - 1].frame, k.frame - 1, 'the framing before is up until the frame before');
  assert.deepEqual(cuts[0].box, { x: 880, y: 212, w: 800, h: 530 }); assert.deepEqual(cuts[1].box, { x: 0, y: 0, w: 2560, h: 1351 });
  assert.equal(cuts[1].fill, 0.8, 'back to the whole screen at its own size: a cut is not held to the scale before');
  assert.equal(cuts[0].frame, Math.round((timing.sentences[1].words.find((w) => w.w === 'button').start - 0.1) * 30));
  // the same framings travelled: `cut` tells two framings apart
  const travelled = makeBeats(showFile({}, beats.map((b) => (b.frame?.cut ? { ...b, frame: { ...b.frame, cut: false, back: true } } : b))), SHOW, timing).beats.shots[0].camera;
  assert.ok(!travelled.some((k) => k.cut));
  assert.equal(makeBeats(showFile({}, [beats[0], { ...beats[1], frame: { whole: true, cut: true } }, beats[3]]), SHOW, timing).beats.shots[0].camera.filter((k) => k.cut).length, 1, 'whole after whole, by cut, is a framing of its own');
  // held: every key the same fill, flagged, no "identical" note; the shot after a page change has one key at its cut and nothing sets in
  const heldFile = showFile({}, [{ line: 0, screen: 0, frame: { whole: true, hold: true } }, { line: 1, cursor: 'click', target: 'button', cue: 'button' }, { line: 2, screen: 1, frame: { whole: true, hold: true }, change: { kind: 'page' } }, { line: 3, cursor: 'leave' }]);
  const held = makeBeats(heldFile, SHOW, timing);
  assert.deepEqual(held.faults, []);
  for (const shot of held.beats.shots) { assert.ok(shot.camera.every((k) => k.hold && k.fill === 0.8)); assert.equal(shot.camera[0].frame, Math.round(shot.from * 30)); }
  assert.equal(held.beats.shots[1].staging.assemble, undefined);
  assert.ok(makeBeats(showFile(), SHOW, timing).beats.shots[1].staging.assemble, 'a shot that is not held assembles as ever');
  assert.match(cameraFaults([{ frame: 0, box: cam[0].box, fill: 0.8 }, { frame: 30, box: cam[0].box, fill: 0.8 }], 0, 30, VP).join('\n'), /identical/, 'without the flag a still camera is remarked on');
});

test('framing: to one side the window is half the frame wide at most, its middle at 0.3 or 0.7 of it; free after a framing in the middle', () => {
  const at = (side, spec = { whole: true }) => { const f = frameFor({ ...spec, side }, SHOW, VIEW), cam = cameraAt([{ frame: 0, box: f.box, fill: f.fill }], 0, VP); return { f, cam, mid: project(cam, { x: VIEW.width / 2, y: VIEW.height / 2 }, VP) }; };
  const left = at('left'), right = at('right');
  assert.ok(Math.abs(left.mid.x - 576) < 1e-6 && Math.abs(right.mid.x - 1344) < 1e-6 && Math.abs(left.mid.y - 540) < 1e-6);
  assert.ok(Math.abs(left.cam.s * VIEW.width - 960) < 1e-6, 'the whole screen at half the frame');
  // the window's right edge leaves the column free (label-beside and feature-list start at x = 1171)
  assert.ok(project(left.cam, { x: VIEW.width, y: 0 }, VP).x <= 1171 - 100 && project(right.cam, { x: 0, y: 0 }, VP).x >= 96 + 669 + 90);
  const panel = at('left', { target: 'panel' });
  assert.ok(Math.abs(project(panel.cam, { x: 880 + 400, y: 0 }, VP).x - 576) < 1e-6 && panel.cam.s * 800 <= 960 + 1e-6, 'a target, too');
  // in a film: after the whole screen in the middle, a side framing is smaller and is let be (like `back`); `side` tells framings apart
  const file = showFile({}, [{ line: 0, screen: 0, frame: { whole: true } }, { line: 1, frame: { whole: true, side: 'left' } }, { line: 2, frame: { whole: true, side: 'right', cut: true } }, { line: 3, cursor: 'leave' }]);
  const cam = makeBeats(file, SHOW, showTiming(file)).beats.shots[0].camera, last = cam.at(-1);
  assert.ok(cam.some((k) => Math.abs(k.fill - 0.5) < 1e-9 && k.box.x > 0) && Math.abs(last.box.x + 2560 * 0.4) < 1e-6 && last.fill >= 0.5);
});

test('bare: a windowed shot without its frame; frame-back says when it returns', () => {
  const beats = (first, change) => [{ line: 0, screen: 0, frame: { whole: true }, ...first }, { line: 1, cursor: 'click', target: 'button', cue: 'button', ...(change ? { then: [{ cue: 'here', change }] } : {}) }, { line: 2, screen: 1, frame: { whole: true }, change: { kind: 'page' } }, { line: 3, cursor: 'leave' }];
  const timing = showTiming(showFile());
  const made = makeBeats(showFile({}, beats({ window: 'panel', bare: true }, { kind: 'frame-back' })), SHOW, timing), shot = made.beats.shots[0];
  assert.ok(!made.faults.some((f) => /frame-back/.test(f)));
  assert.equal(shot.bare, true); assert.deepEqual([shot.window.x, shot.window.y, shot.window.w], [880, 212, 800]);
  assert.equal(shot.frameBack, timing.sentences[1].words.find((w) => w.w === 'here').start, 'on its cue');
  const never = makeBeats(showFile({}, beats({ window: 'panel', bare: true })), SHOW, timing).beats.shots[0];
  assert.ok(never.bare && !('frameBack' in never), 'bare for the whole shot');
  assert.ok(!('bare' in makeBeats(showFile({}, beats({ window: 'panel' })), SHOW, timing).beats.shots[0]));
  assert.throws(() => makeBeats(showFile({}, beats({ bare: true })), SHOW, timing), /line 0: bare goes with window on the first beat of its shot/);
  assert.match(makeBeats(showFile({}, beats({ window: 'panel' }, { kind: 'frame-back' })), SHOW, timing).faults.join('\n'), /line 1: frame-back is for a shot that is bare/);
});

test('a first line that is only context: with no cursor on the first beat, the cursor comes on at the start of the first beat that has one, not before', () => {
  const lines = (...ls) => ({ fps: 30, dir: 'narration', sentences: ls.map(([start, dur, ws], i) => ({ i, file: `l${i}`, clipAt: start, clipDur: dur, start, end: start + dur, words: ws.map((w, k) => ({ w, start: start + 0.5 * k, end: start + 0.5 * k + 0.4 })) })) });
  const timing = lines([3.6, 8, ['context']], [12.2, 4, ['open', 'the', 'menu', 'now']], [16.8, 4, ['now', 'click', 'the', 'menu']], [21.4, 2, ['done']]);
  const F = (s) => Math.round(s * 30), file = (b0, b1, b2) => ({ version: 1, title: 'T', viewport: VP, nodes: {}, chalk: [], beats: [
    { line: 0, screen: 0, frame: { whole: true }, ...b0 }, { line: 1, ...b1 }, { line: 2, ...b2 }, { line: 3, cursor: 'leave' }] });
  // as ever: `enter` on the first beat brings it on about two seconds after the window settles, under a long first line
  const early = makeBeats(file({ cursor: 'enter' }, { cursor: 'click', target: 'menu', cue: 'menu' }, {}), { menu: BOX }, timing);
  assert.ok(early.beats.cursor.moves[0].from < F(8), `${early.beats.cursor.moves[0].from}`);
  // no cursor on the first beat: it travels in from off the frame with the line of its first action, and acts on the cue
  const waited = makeBeats(file({}, { cursor: 'click', target: 'menu', cue: 'menu' }, {}), { menu: BOX }, timing);
  const m = waited.beats.cursor.moves;
  assert.ok(m[0].from >= F(12.2) && m[0].to <= F(13.2), `${m[0].from} ${m[0].to}`);
  assert.deepEqual(waited.faults, []);
  assert.deepEqual(waited.beats.clicks, early.beats.clicks);
  // an `enter` on a later beat, its first action a line on: it comes on at the start of that `enter`'s line and rests
  const rested = makeBeats(file({}, { cursor: 'enter' }, { cursor: 'click', target: 'menu', cue: 'menu' }), { menu: BOX }, timing).beats.cursor.moves;
  assert.equal(rested[0].from, F(12.2));
  assert.ok(rested[1].to <= F(18.3) && rested[1].from > rested[0].to);
});

test('becomes with an anchor: the new capture is scrolled as Measure scrolled it (its `pageY`); without one, nothing changes', async () => {
  const { anchorsIn } = await import('../../../tools/measure-boxes.mjs');
  const timing = T3([['open', 'the', 'menu'], ['choose', 'the', 'menu'], ['done']]);
  const boxes = { menu: BOX, tableA: { screen: 0, node: 9, x: 100, y: 300, w: 800, h: 200 }, tableB: { screen: 1, node: 9, x: 100, y: 300, w: 800, h: 200, pageY: 343 } };
  const file = (change) => ({ version: 1, title: 'T', viewport: VP, nodes: {}, chalk: [], beats: [
    { line: 0, screen: 0, frame: { whole: true }, cursor: 'enter' }, { line: 1, cursor: 'click', target: 'menu', cue: 'menu', change }, { line: 2, cursor: 'leave' }] });
  const plain = makeBeats(file({ kind: 'becomes', screen: 1, after: 'menu' }), boxes, timing).beats.shots[0].screens;
  assert.deepEqual(plain.map((x) => Object.keys(x)), [['at', 'screen'], ['at', 'screen']], 'no anchor: the captures as ever');
  const anchored = file({ kind: 'becomes', screen: 1, after: 'menu', anchor: ['tableA', 'tableB'] });
  const shown = makeBeats(anchored, boxes, timing).beats.shots[0].screens;
  assert.deepEqual(shown, [plain[0], { ...plain[1], pageY: 343 }]);
  assert.deepEqual(anchorsIn(anchored), [{ from: 'tableA', to: 'tableB' }]);
  assert.deepEqual(anchorsIn(file({ kind: 'becomes', screen: 1 })), []);
  assert.throws(() => makeBeats(file({ kind: 'becomes', screen: 1, anchor: 'tableA' }), boxes, timing), /anchor is \[a name on the capture before/);
  assert.throws(() => makeBeats(file({ kind: 'becomes', screen: 1, anchor: ['tableB', 'tableA'] }), boxes, timing), /second name is on screen 0/);
  assert.throws(() => makeBeats(file({ kind: 'becomes', screen: 1, anchor: ['tableA', 'nope'] }), boxes, timing), /"nope", which has no measured box/);
});

test('a page scrolled near its end keeps its scroll while a menu that reaches its bottom is shut (scaled) before it opens: its extent is held', () => {
  // (the clamp itself, checked in Chrome: a page scrolled to its end, 522 of 922 px, an absolute menu that reaches the
  // bottom scaled to 0.96 while shut: the extent fell to 910 and the scroll to 510; with the mark, 922 and 522)
  const added = [], doc = { scrollingElement: { scrollHeight: 922 }, documentElement: { appendChild: (e) => added.push(e) }, createElement: () => ({ style: {}, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } }) };
  const pin = holdExtent(doc);
  assert.deepEqual(added, [pin]);
  assert.match(pin.style.cssText, /position:absolute;left:0;top:921px;width:1px;height:1px;visibility:hidden;pointer-events:none/);
});

test('a rebuilt page scrolls instantly: its own scroll-behavior: smooth is overridden, so Measure and the film read the scroll the template set', async () => {
  // (the fixture check: a page with scroll-behavior: smooth on <html>, recorded at 300, read 0 at Measure and in the
  // film before this; 300 in both after)
  const { STILL_PAGE_CSS } = await import('../css.ts');
  assert.match(STILL_PAGE_CSS, /\*,\*::before,\*::after\{[^}]*scroll-behavior:auto!important/);
  assert.match(STILL_PAGE_CSS, /html,body\{scroll-behavior:auto!important\}/);
  assert.match(STILL_PAGE_CSS, /transition:none!important/);
});

test('extend: a shot shows more of the page below its window: its screen and what it becomes are that much taller, for the framing and for the tools', async () => {
  const { extendsIn } = await import('../../../tools/measure-boxes.mjs');
  const timing = T3([['open'], ['the', 'menu'], ['done'], ['and', 'more']]);
  const file = (b0, more = []) => ({ version: 1, title: 'T', viewport: VP, nodes: {}, chalk: [], beats: [
    { line: 0, screen: 0, frame: { whole: true }, cursor: 'enter', ...b0 },
    { line: 1, cursor: 'click', target: 'menu', cue: 'menu', change: { kind: 'becomes', screen: 1, after: 'menu' } }, ...more, { line: 2, cursor: 'leave' }] });
  const plain = makeBeats(file({}), { menu: BOX }, timing), tall = makeBeats(file({ extend: 300 }), { menu: BOX }, timing);
  assert.equal(plain.beats.extends, undefined, 'no extend: nothing changes');
  assert.deepEqual(tall.beats.extends, { 0: 300, 1: 300 }, 'the shot\'s screen and the capture it becomes');
  assert.deepEqual(plain.beats.shots[0].camera[0].box, { x: 0, y: 0, w: VP.width, h: VP.height });
  assert.deepEqual(tall.beats.shots[0].camera[0].box, { x: 0, y: 0, w: VP.width, h: VP.height + 300 }, 'the whole framing holds the taller window');
  // the tools read the beat file the same way (Measure, Probe and the sweep rebuild those screens taller)
  assert.deepEqual(extendsIn(file({ extend: 300 })), { 0: 300, 1: 300 });
  assert.deepEqual(extendsIn(file({})), {});
  // a whole number, 1 to half the recorded height; on the first beat of a whole-screen shot
  for (const bad of [0, -5, 1.5, '300', VP.height / 2 + 1]) assert.throws(() => makeBeats(file({ extend: bad }), { menu: BOX }, timing), /extend is a whole number of px, 1 to 540/);
  const late = file({}); late.beats[1].extend = 100;
  assert.throws(() => makeBeats(late, { menu: BOX }, timing), /extend goes on the first beat of its shot/);
  assert.throws(() => makeBeats(file({ window: 'menu', extend: 100 }), { menu: BOX }, timing), /extend is for a whole screen/);
  // one screen, one layout: shown taller on one shot and as recorded on another is refused
  const again = file({ extend: 300 }, [{ line: 3, screen: 0, frame: { whole: true }, change: { kind: 'page' } }]);
  again.beats.splice(2, 0, { line: 2, screen: 2, frame: { whole: true }, change: { kind: 'page' } });
  again.beats = again.beats.filter((b) => b.cursor !== 'leave');
  assert.throws(() => makeBeats(again, { menu: BOX }, timing), /screen 0 is shown with extend 300 on one shot and 0 on another/);
});

test('opens of a node on a later capture the shot does not show: a layer over the page, not a swap; its open and close are the layer\'s', async () => {
  const { extendsIn } = await import('../../../tools/measure-boxes.mjs');
  const timing = T3([['open'], ['the', 'menu'], ['view', 'it'], ['done']]);
  const boxes = { menu: BOX, shell: { screen: 0, node: 9, x: 700, y: 200, w: 500, h: 400 }, dialog: { screen: 1, node: 9, x: 700, y: 200, w: 500, h: 400 }, view: { screen: 1, node: 11, x: 900, y: 500, w: 80, h: 30 } };
  const file = (node, b0 = {}) => ({ version: 1, title: 'T', viewport: VP, nodes: {}, chalk: [], beats: [
    { line: 0, screen: 0, frame: { whole: true }, cursor: 'enter', ...b0 },
    { line: 1, cursor: 'click', target: 'menu', cue: 'menu', change: { kind: 'opens', node, after: 'menu' } },
    { line: 2, frame: { target: node }, cursor: 'click', target: node === 'dialog' ? 'view' : 'menu', cue: 'view', then: [{ cue: 'it', change: { kind: 'close', node } }] },
    { line: 3, cursor: 'leave' }] });
  // on the shot's own screen: as ever, no layer
  const own = makeBeats(file('shell'), boxes, timing).beats.shots[0];
  assert.equal(own.layers, undefined);
  assert.deepEqual(own.staging.opens.map((o) => o.node), [9]);
  // on another capture: the page does not stage it (its copy is a shell); the layer does, as a dialog, from its open
  const made = makeBeats(file('dialog'), boxes, timing), shot = made.beats.shots[0];
  assert.deepEqual(shot.screens, undefined, 'no swap');
  assert.deepEqual(shot.staging.opens, []);
  assert.deepEqual(shot.staging.closes ?? [], []);
  assert.equal(shot.layers.length, 1);
  const [layer] = shot.layers;
  assert.deepEqual([layer.screen, layer.nodes, layer.staging.opens.map((o) => [o.node, o.from])], [1, [9], [[9, 'centre']]]);
  assert.ok(Math.abs(layer.from - (layer.staging.opens[0].at - 0.05)) < 1 / 30 + 1e-9);
  assert.deepEqual(layer.staging.closes.map((c) => [c.node, c.from]), [[9, 'centre']]);
  assert.deepEqual(layer.staging.presses, shot.staging.presses, 'a control in the dialog is pressed in the layer');
  // a node in it is a cursor target, through the same camera
  assert.equal(made.beats.clicks.length, 2);
  // the layer's capture is rebuilt as tall as its shot
  assert.deepEqual(makeBeats(file('dialog', { extend: 200 }), boxes, timing).beats.extends, { 0: 200, 1: 200 });
  assert.deepEqual(extendsIn({ ...file('dialog', { extend: 200 }), nodes: { dialog: [1, 9], menu: [0, 5] } }), { 0: 200, 1: 200 });
});

test('a dialog drawn as a layer sets in as its whole panel: the outermost ancestor of the node short of its host and of anything window-wide', () => {
  const body = {}, doc = { defaultView: { innerWidth: 1000, innerHeight: 800 }, body };
  const box = (width, height, parentElement) => ({ ownerDocument: doc, parentElement, getBoundingClientRect: () => ({ width, height }) });
  const host = box(1000, 800, body), frame = box(1000, 800, host), card = box(620, 420, frame), content = box(600, 400, card);
  assert.equal(panelOf(content, host), card, 'the card the page paints, not only its content; never the window-wide frame');
  assert.equal(panelOf(card, host), card);
  const plain = box(600, 400, host);
  assert.equal(panelOf(plain, host), plain, 'a node right under its host is its own panel');
});
