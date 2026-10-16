// A shot whose window is some nodes of its screen (a beat file's `window`), and the scroll inside it (`scrolls`).
import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraAt, scrollAt } from './cameraAt.ts';
import { makeBeats } from './beats.ts';
import { unhidesIn, windowsIn } from '../../../tools/measure-boxes.mjs';

const VP = { width: 1920, height: 1080 };
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;
const timing = { fps: 30, dir: 'narration', sentences: [
  { i: 0, file: 'a', clipAt: 3.6, clipDur: 5, start: 3.6, end: 8.6, words: [{ w: 'email', start: 3.6, end: 4 }, { w: 'table', start: 7.5, end: 8 }] },
  { i: 1, file: 'b', clipAt: 9.5, clipDur: 5, start: 9.5, end: 14.5, words: [{ w: 'from', start: 10, end: 10.3 }, { w: 'bottom', start: 13, end: 13.4 }] },
  { i: 2, file: 'c', clipAt: 15.5, clipDur: 2, start: 15.5, end: 17.5, words: [{ w: 'now', start: 15.5, end: 16 }, { w: 'save', start: 16.5, end: 17 }] },
  { i: 3, file: 'd', clipAt: 18.5, clipDur: 2, start: 18.5, end: 20.5, words: [{ w: 'done', start: 18.5, end: 19 }] } ] };
// as measured unclipped: the heading sits above the message, the message runs far past the 878 px viewport
const boxes = { head: { screen: 0, node: 4286, x: 768, y: 94, w: 891, h: 44 }, pane: { screen: 0, node: 4292, x: 778, y: 138, w: 871, h: 1229 },
  table: { screen: 0, node: 5, x: 880, y: 300, w: 740, h: 200 }, last: { screen: 0, node: 6, x: 880, y: 1300, w: 740, h: 40 }, save: { screen: 1, node: 9, x: 1800, y: 1100, w: 200, h: 60, spot: [0.5, 0.6] } };
const file = { version: 1, title: 'T', viewport: { width: 1707, height: 878 }, viewports: { 0: { width: 1707, height: 878 }, 1: { width: 2560, height: 1317 } },
  nodes: { head: [0, 4286], pane: [0, 4292], table: [0, 5], last: [0, 6], save: [1, 9] }, chalk: [],
  beats: [{ line: 0, screen: 0, window: ['head', 'pane'], frame: { whole: true }, cursor: 'enter' }, { line: 0, cursor: 'rest', target: 'table', cue: 'table' },
    { line: 1, cue: 'from', change: { kind: 'scrolls', to: 'bottom' }, then: [{ cursor: 'move', target: 'last', cue: 'bottom' }] },
    { line: 2, screen: 1, frame: { whole: true }, cursor: 'click', target: 'save', cue: 'save', change: { kind: 'page' } }, { line: 3, cursor: 'leave' }] };

test('window: a shot shows some nodes of its screen through a window of an ordinary shape, at the film\'s width; the next full-page shot is unchanged', () => {
  const { beats, faults } = makeBeats(file, boxes, timing);
  assert.deepEqual(faults, []);
  const [a, b] = beats.shots, h = (891 * 0.86 * 1080) / (0.8 * 1920);
  assert.deepEqual({ ...a.window, h: 0 }, { x: 768, y: 94, w: 891, h: 0 });   // the nodes together, from their top
  assert.ok(near(a.window.h, h), `the window is ${a.window.h} tall`);         // not the 1273 px of content: that scrolls
  assert.deepEqual(a.isolate, [4286, 4292]);
  assert.deepEqual(windowsIn(file), { 0: [4286, 4292] });                     // the screen every tool lays out unclipped
  assert.ok(near(a.camera[0].fill, 0.8));
  for (const k of a.camera) assert.deepEqual(k.box, a.window);                // the camera holds on the whole window
  assert.equal(b.window, undefined);
  assert.deepEqual(b.camera[0].box, { x: 0, y: 0, w: 2560, h: 1317 });
  assert.throws(() => makeBeats({ ...file, beats: [{ ...file.beats[0], window: 'nowhere' }, ...file.beats.slice(1)] }, boxes, timing), /window names "nowhere"/);
  assert.throws(() => makeBeats({ ...file, beats: [file.beats[0], { ...file.beats[1], window: 'pane' }, ...file.beats.slice(2)] }, boxes, timing), /window goes on the first beat of its shot/);
});

test('scrolls: the window\'s content moves up in one eased move from the cue word, landed before the line ends, and the cursor rides with it', () => {
  const { beats, faults, fps } = makeBeats(file, boxes, timing);
  assert.deepEqual(faults, []);
  const a = beats.shots[0], most = 1273 - a.window.h;
  assert.equal(a.scroll.length, 1);
  const [m] = a.scroll;
  assert.ok(m.from === 10 && m.to > m.from + 1 && m.to <= 14.5 - 0.2 && m.y0 === 0 && near(m.y1, most), JSON.stringify(m));
  assert.equal(scrollAt(a.scroll, 9.9), 0);
  assert.ok(scrollAt(a.scroll, (m.from + m.to) / 2) > 0.3 * most && scrollAt(a.scroll, (m.from + m.to) / 2) < 0.7 * most);
  assert.ok(near(scrollAt(a.scroll, 14), most) && near(scrollAt(undefined, 14), 0));
  // where the cursor stands on the screen: beside the table before the scroll; beside the last row, scrolled into the window, on "bottom"
  const onScreen = (move, frame) => { const p = move.stop(frame), cam = cameraAt(a.camera, frame, VP); return { x: cam.cx + (p.x - VP.width / 2) / cam.s, y: cam.cy + (p.y - VP.height / 2) / cam.s }; };
  const [rest, down] = beats.cursor.moves, r = onScreen(rest, rest.to), d = onScreen(down, down.to);
  assert.ok(near(r.y, 300 + 200 * 0.55, 0.01), JSON.stringify(r));
  assert.ok(near(d.y, 1300 + 40 * 0.55 - most, 0.01) && d.y > a.window.y && d.y < a.window.y + a.window.h, JSON.stringify(d));
  // it rides up with the content while the scroll runs: the same stop, later, is higher on the screen
  assert.ok(onScreen(rest, Math.round(m.to * fps)).y < r.y - 0.9 * most);
  // what the cursor reaches must be in the window when it gets there; a full page has no measured bottom here; the camera holds
  const early = structuredClone(file); early.beats[1].target = 'last';
  assert.match(makeBeats(early, boxes, timing).faults.join('\n'), /line 0: "last" is outside the window when the cursor reaches it/);
  const page = structuredClone(file); page.beats[3].then = [{ cursor: 'rest', target: 'save', cue: 'save', change: { kind: 'scrolls', to: 'bottom' } }];
  assert.match(makeBeats(page, boxes, timing).faults.join('\n'), /line 2: a full page scrolls to a named element/);
  const pushed = structuredClone(file); pushed.beats[2].frame = { target: 'last' };
  assert.match(makeBeats(pushed, boxes, timing).faults.join('\n'), /line 1: the camera frames a target on or after a scroll/);
});

test('scrolls: a whole screen scrolls its own page to a named element; what is framed or pointed at afterwards is where the scroll left it', () => {
  const low = { screen: 1, node: 12, x: 800, y: 2000, w: 600, h: 300 }, page = structuredClone(file);
  page.nodes.low = [1, 12];
  page.beats.splice(3, 1, { line: 2, screen: 1, frame: { whole: true }, cue: 'now', change: { kind: 'scrolls', to: 'low' } }, { line: 3, frame: { target: 'low' }, cursor: 'rest', target: 'low', cue: 'done' });
  const { beats, faults, fps } = makeBeats(page, { ...boxes, low }, timing), b = beats.shots[1];
  assert.deepEqual(faults.filter((f) => !/^screen/.test(f)), []);
  // the page is at least as long as its lowest measured element (2300): it cannot go further than that less the window
  const most = 2300 - 1317;
  assert.equal(b.window, undefined);
  assert.deepEqual(b.scroll, [{ from: 15.5, to: b.scroll[0].to, y0: 0, y1: most }]);
  assert.deepEqual(b.staging.scroll, b.scroll);
  // the first framing is the window itself, whatever the page does in it; the one after the scroll frames the element where it now is
  assert.deepEqual(b.camera[0].box, { x: 0, y: 0, w: 2560, h: 1317 });
  const last = b.camera.at(-1).box, cy = last.y + last.h / 2;
  assert.ok(cy > 2000 - most && cy < 2300 - most, `the camera ends on y ${cy}`);
  const move = beats.cursor.moves.find((m) => m.to === Math.round((18.5 - 0.05) * fps)), p = move.stop(move.to), cam = cameraAt(b.camera, move.to, VP);
  assert.ok(near(cam.cy + (p.y - VP.height / 2) / cam.s, 2000 + 300 * 0.55 - most, 0.01));
  // a film that does not scroll has no scroll anywhere
  const plain = makeBeats(file, boxes, timing).beats.shots[1];
  assert.ok(!('scroll' in plain) && !('scroll' in plain.staging));
});

test('unhidesIn: an `opens` with unhide names its node on the screen the node is on (not the beat screen), once; one without unhide, none', () => {
  const f = { nodes: { menu: [2, 40], item: [2, 41], tip: [0, 7], btn: [0, 3] }, beats: [
    { line: 0, screen: 0, cursor: 'click', target: 'btn', change: { kind: 'opens', node: 'menu', after: 'btn', unhide: true } },
    { line: 1, then: [{ cursor: 'click', target: 'btn', change: { kind: 'opens', node: 'menu', after: 'btn', unhide: true } }] },
    { line: 2, change: { kind: 'opens', node: 'tip', after: 'btn' } }] };
  assert.deepEqual(unhidesIn(f), { 2: [40] });
  assert.deepEqual(unhidesIn(null), {});
  assert.deepEqual(unhidesIn(file), {});
});
