import test from 'node:test';
import assert from 'node:assert/strict';
import { statusLabel, countLine, versionsOf, keepTime, timecode, pinsOf, isDrag, pictureBox, regionOf, cleanRegion, deleteQuestion } from './model.mjs';

test('the three statuses in the page\'s words', () => {
  assert.equal(statusLabel({ status: 'open' }), 'To fix');
  assert.equal(statusLabel({ status: 'done', fixedIn: 'v3' }), 'Fixed in v3');
  assert.equal(statusLabel({ status: 'done' }), 'Fixed');
  assert.equal(statusLabel({ status: 'wontfix' }), 'No change needed');
});

test('the count line', () => {
  assert.equal(countLine([]), 'No notes yet');
  assert.equal(countLine([{ status: 'open' }]), '1 to fix');
  assert.equal(countLine([{ status: 'open' }, { status: 'done' }, { status: 'wontfix' }]), '1 to fix, 1 fixed, 1 no change');
  assert.equal(countLine([{ status: 'done' }, { status: 'done' }]), '2 fixed');
});

test('versions from the videos, by number, with when they were built', () => {
  const v = versionsOf([{ path: 'out/v10.mp4', mtime: 3 }, { path: 'out/v2.mp4', mtime: 2 }, { path: 'out/other.mp4', mtime: 9 }, { path: 'out/v1.mp4', mtime: 1 }]);
  assert.deepEqual(v.map((x) => x.name), ['v1', 'v2', 'v10']);
  assert.equal(v[2].path, 'out/v10.mp4');
});

test('switching version keeps the time, inside the new film', () => {
  assert.equal(keepTime(31.2, 54), 31.2);
  assert.equal(keepTime(60, 54), 54);
  assert.equal(keepTime(-1, 54), 0);
  assert.equal(keepTime(10, null), 10);
});

test('pins: numbered by time across versions', () => {
  const pins = pinsOf([{ id: 'b', time: 31, status: 'done' }, { id: 'a', time: 7, status: 'open' }, { id: 'c', time: 48, status: 'wontfix' }], 54);
  assert.deepEqual(pins.map((p) => [p.n, p.id, p.left, p.isOpen]), [[1, 'a', 7 / 54, true], [2, 'b', 31 / 54, false], [3, 'c', 48 / 54, false]]);
  assert.deepEqual(pinsOf([{ id: 'a', time: 7, status: 'open' }], 0), [{ n: 1, id: 'a', left: 0, isOpen: true, time: 7, hasRegion: false }]);
  // the sign of a selection: only on the notes that have one
  assert.deepEqual(pinsOf([{ id: 'a', time: 7, region: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } }, { id: 'b', time: 9, region: null }, { id: 'c', time: 11 }], 54).map((p) => p.hasRegion), [true, false, false]);
});

test('the question before a note is deleted says its state and what goes with it', () => {
  assert.equal(deleteQuestion({ status: 'open', reply: '' }), 'Delete this comment?');
  assert.equal(deleteQuestion({ status: 'open', reply: 'Which card do you mean?' }), 'Delete this comment? Claude\'s reply goes with it.');
  assert.equal(deleteQuestion({ status: 'done', fixedIn: 'v3', reply: 'Held longer.' }), 'Delete this comment? It is marked "Fixed in v3". Claude\'s reply goes with it.');
  assert.equal(deleteQuestion({ status: 'wontfix', reply: '' }), 'Delete this comment? It is marked "No change needed".');
});

test('a press on the film: a few pixels is a click, further is a drag', () => {
  assert.equal(isDrag({ x: 100, y: 100 }, { x: 100, y: 100 }), false);
  assert.equal(isDrag({ x: 100, y: 100 }, { x: 103, y: 104 }), false); // 5 pixels: a hand that shook
  assert.equal(isDrag({ x: 100, y: 100 }, { x: 104, y: 104 }), true);
  assert.equal(isDrag({ x: 100, y: 100 }, { x: 40, y: 100 }), true);
});

test('where the picture sits: the whole element at 16:9, inside the bars otherwise', () => {
  assert.deepEqual(pictureBox(960, 540, 1920, 1080), { x: 0, y: 0, w: 960, h: 540 });
  assert.deepEqual(pictureBox(960, 720, 1920, 1080), { x: 0, y: 90, w: 960, h: 540 });   // bars above and below
  assert.deepEqual(pictureBox(1200, 540, 1920, 1080), { x: 120, y: 0, w: 960, h: 540 }); // bars left and right
  assert.deepEqual(pictureBox(960, 540, 0, 0), { x: 0, y: 0, w: 960, h: 540 });          // before the film is known
});

test('a region: fractions of the frame, kept inside it, whichever way the drag went', () => {
  const box = pictureBox(960, 720, 1920, 1080);
  assert.deepEqual(regionOf({ x: 96, y: 90 + 54 }, { x: 480, y: 90 + 270 }, box), { x: 0.1, y: 0.1, w: 0.4, h: 0.4 });
  assert.deepEqual(regionOf({ x: 480, y: 90 + 270 }, { x: 96, y: 90 + 54 }, box), { x: 0.1, y: 0.1, w: 0.4, h: 0.4 }); // dragged up and left
  assert.deepEqual(regionOf({ x: 480, y: 360 }, { x: 2000, y: 900 }, box), { x: 0.5, y: 0.5, w: 0.5, h: 0.5 });        // past the edge and into the bar
  assert.deepEqual(regionOf({ x: -50, y: 0 }, { x: 96, y: 144 }, box), { x: 0, y: 0, w: 0.1, h: 0.1 });
  assert.equal(regionOf({ x: 100, y: 200 }, { x: 400, y: 201 }, box), null);                                            // a line is not an area
  assert.deepEqual(regionOf({ x: 192, y: 108 }, { x: 384, y: 216 }, pictureBox(1920, 1080, 1920, 1080)), regionOf({ x: 96, y: 54 }, { x: 192, y: 108 }, pictureBox(960, 540, 1920, 1080))); // the same at any player size
});

test('a region as stored: none, or four numbers clamped to the frame; anything else is refused', () => {
  assert.equal(cleanRegion(null), null);
  assert.equal(cleanRegion(undefined), null);
  assert.deepEqual(cleanRegion({ x: 0.12345678, y: 0.2, w: 0.3, h: 0.4 }), { x: 0.1235, y: 0.2, w: 0.3, h: 0.4 });
  assert.deepEqual(cleanRegion({ x: -0.2, y: 0.9, w: 0.5, h: 0.5 }), { x: 0, y: 0.9, w: 0.3, h: 0.1 });
  assert.deepEqual(cleanRegion({ x: 0.5, y: 0.5, w: 9, h: 9 }), { x: 0.5, y: 0.5, w: 0.5, h: 0.5 });
  assert.equal(cleanRegion({ x: 2, y: 2, w: 1, h: 1 }), null);              // wholly outside
  assert.equal(cleanRegion({ x: 0.1, y: 0.1, w: 0.001, h: 0.4 }), null);
  for (const bad of ['0.1,0.1,0.2,0.2', 7, [0.1, 0.1, 0.2, 0.2], { x: 0.1, y: 0.1, w: 0.2 }, { x: '0.1', y: 0.1, w: 0.2, h: 0.2 }, { x: NaN, y: 0, w: 1, h: 1 }]) assert.throws(() => cleanRegion(bad), TypeError);
  const kept = cleanRegion({ x: 0.1, y: 0.2, w: 0.3, h: 0.4 });
  assert.deepEqual(cleanRegion(JSON.parse(JSON.stringify(kept))), kept);    // there and back unchanged
});

test('m:ss', () => {
  assert.equal(timecode(0), '0:00');
  assert.equal(timecode(31.4), '0:31');
  assert.equal(timecode(125), '2:05');
});
