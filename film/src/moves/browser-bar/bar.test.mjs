import test from 'node:test';
import assert from 'node:assert/strict';
import { BAR, about, barMetrics, barOut, barPlay, barShown, barText, checkBar } from './bar.ts';

test('bar: every length scales with the window width; the mockup window gives the mockup numbers', () => {
  const m = barMetrics(1608);
  assert.equal(m.u, 1);
  assert.equal(m.height, 192);
  assert.ok(Math.abs(barMetrics(2560).height - 192 * 2560 / 1608) < 1e-9);
  const n = barMetrics(1707);
  assert.ok(Math.abs(n.tabs + n.tools + n.marks - n.height) < 1e-9);
});

test('bar: it is whole at least 0.3 s before the cursor presses its bookmark, never before the shot has settled, and goes back in once its line is said', () => {
  const p = barPlay({ ready: 10, lineStart: 11, lineEnd: 14, from: null, click: 13 }, 30);
  assert.ok(p.to <= 13 - BAR.lead + 1e-9 && Math.abs(p.to - p.from - BAR.grow) < 1 / 30 && p.from >= 10 + BAR.settle && p.note === null);
  assert.ok(p.back >= 14 && p.gone > p.back, 'it retracts after the line');
  const early = barPlay({ ready: 10, lineStart: 10.1, lineEnd: 12, from: null, click: 10.6 }, 30);
  assert.ok(early.from >= 10.25 && /frames to grow/.test(early.note), 'a click too soon is noted');
  assert.equal(barPlay({ ready: 10, lineStart: 11, lineEnd: 14, from: 11.4, click: 13 }, 30).from, 11.4);
  // out: nothing before, all of it between, nothing after; the same going as coming
  assert.deepEqual([9, p.to, p.back, p.gone + 1].map((t) => barOut(p, t)), [0, 1, 1, 0]);
  assert.ok(Math.abs(barOut(p, (p.from + p.to) / 2) - 0.5) < 0.05 && Math.abs(barOut(p, (p.back + p.gone) / 2) - 0.5) < 0.05);
});

test('bar: the hero must be one of the bookmarks; what it shows is listed for the check of authored text', () => {
  const spec = { title: 'Webhooks', host: 'app.example.com', bookmarks: [{ label: 'Inbox', icon: 'inbox' }, { label: 'Webhook Autofill', icon: 'bookmark' }], hero: 'Webhook Autofill' };
  assert.equal(checkBar(spec), null);
  assert.match(checkBar({ ...spec, hero: 'Docs' }), /hero/);
  assert.match(checkBar({ ...spec, bookmarks: [] }), /bookmarks/);
  assert.equal(checkBar({ ...spec, arrives: 'right' }), null);
  assert.match(checkBar({ ...spec, arrives: 'left' }), /arrives/);
  assert.equal(checkBar({ ...spec, leaves: 'with-camera' }), null);
  assert.match(checkBar({ ...spec, leaves: 'up' }), /leaves/);
  // a bar that leaves with the camera is drawn whole until it is out of the frame (`off`), then not at all; the room it took is given back over the push
  const carried = { from: 1, to: 1.5, back: 3, gone: 4, off: 3.6 };
  assert.deepEqual([0.9, 2, 3.5, 3.6, 5].map((t) => barShown(carried, t)), [0, 1, 1, 0, 0]);
  assert.ok(barOut(carried, 3.5) > 0 && barOut(carried, 3.5) < 1 && barOut(carried, 4) === 0);
  assert.deepEqual(barText(spec), ['Webhooks', 'app.example.com', 'Inbox', 'Webhook Autofill']);
  assert.equal(checkBar(about.example.bar), null, 'the example in `about` is a bar that works');
});
