import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { clicksAgainst, describe, enclose, findCircles, findGestures, findRests, findSweeps, scrollAt } from './gestures.mjs';
import { el, tx } from '../fixtures/scrub/leak-set.mjs';

// Synthetic pointer paths, about seven positions a second (what the recorder gives).
const HZ = 7;
/** `turns` round the centre in `dur` seconds, starting at angle `a0` (radians) at time `t0`; `rx`/`ry` for an ellipse; `grow`: radius multiplier by the end */
const loop = ({ cx = 400, cy = 300, r = 60, rx = r, ry = r, turns = 1, dur = 1.2, t0 = 0, a0 = 0, screen = 0, grow = 1, hz = HZ, dir = 1 }) => {
  const n = Math.round(dur * hz), out = [];
  for (let i = 0; i <= n; i++) { const f = i / n, a = a0 + dir * 2 * Math.PI * turns * f, k = 1 + (grow - 1) * f; out.push({ t: t0 + dur * f, x: cx + rx * k * Math.cos(a), y: cy + ry * k * Math.sin(a), screen }); }
  return out;
};
const line = ({ from, to, dur, t0 = 0, screen = 0, hz = HZ }) => { const n = Math.max(1, Math.round(dur * hz)); return Array.from({ length: n + 1 }, (_, i) => ({ t: t0 + dur * i / n, x: from[0] + (to[0] - from[0]) * i / n, y: from[1] + (to[1] - from[1]) * i / n, screen })); };
const stay = ({ at, dur, t0 = 0, screen = 0, jitter = 0, hz = HZ }) => Array.from({ length: Math.round(dur * hz) + 1 }, (_, i) => ({ t: t0 + i / hz, x: at[0] + jitter * Math.sin(i * 12.9898) , y: at[1] + jitter * Math.cos(i * 78.233), screen }));

// ---- the plan's cases

test('one full loop of radius 60 over 1.2 s is one circle: strong, centred, the right size', () => {
  const [c, ...rest] = findCircles(loop({}));
  assert.equal(rest.length, 0);
  assert.ok(c.strength > 0.8, `strength ${c.strength}`);
  assert.ok(Math.hypot(c.centre.x - 400, c.centre.y - 300) <= 3, 'centre');
  assert.ok(Math.abs(c.radius - 60) <= 6, 'radius');
  assert.ok(Math.abs(c.box.x - 340) <= 6 && Math.abs(c.box.w - 120) <= 8 && Math.abs(c.box.h - 120) <= 8, 'the box is the loop\'s own');
  assert.deepEqual([c.kind, c.screen, c.encloses], ['circle', 0, []]);
});

test('a loop of one and a half turns is one circle, not two, at full strength', () => {
  const cs = findCircles(loop({ turns: 1.5, dur: 1.8 }));
  assert.equal(cs.length, 1);
  assert.ok(cs[0].strength > 0.95, `strength ${cs[0].strength}`);
});

test('an arc of 200 degrees is not a circle', () => {
  assert.deepEqual(findCircles(loop({ turns: 200 / 360, dur: 0.9 })), []);
});

// The plan had this one as "borderline: a weak circle or none". Changed on purpose: a loop drawn round a wide control
// IS an ellipse, and it is the narrator's main way of pointing, so it counts in full and its box is the ellipse's.
test('an ellipse (a loop round a wide control) is a circle, and its box is the loop\'s own; a sliver is not', () => {
  const cs = findCircles(loop({ rx: 60, ry: 30 }));
  assert.equal(cs.length, 1);
  assert.ok(cs[0].strength > 0.8, `strength ${cs[0].strength}`);
  assert.ok(Math.abs(cs[0].box.w - 120) <= 8 && Math.abs(cs[0].box.h - 60) <= 6 && Math.hypot(cs[0].centre.x - 400, cs[0].centre.y - 300) <= 3);
  assert.equal(findCircles(loop({ rx: 200, ry: 50, dur: 1.6 })).length, 1);          // 4 to 1: round a table row
  assert.deepEqual(findCircles(loop({ rx: 200, ry: 14, dur: 1.6 })), []);           // 14 to 1: that is a to-and-fro, not a loop
});

test('a back-and-forth wiggle is not a circle', () => {
  const wiggle = [];
  for (let i = 0; i < 6; i++) wiggle.push(...line({ from: [300 + (i % 2) * 120, 300], to: [420 - (i % 2) * 120, 300 + 4], dur: 0.3, t0: i * 0.3 }).slice(i ? 1 : 0));
  assert.deepEqual(findCircles(wiggle), []);
  // nor is rocking to and fro along an arc: the turning changes direction
  const rock = [...loop({ turns: 0.5, dur: 0.6 }), ...loop({ turns: 0.5, dur: 0.6, t0: 0.6, a0: Math.PI, dir: -1 }).slice(1), ...loop({ turns: 0.5, dur: 0.6, t0: 1.2 }).slice(1)];
  assert.deepEqual(findCircles(rock), []);
});

test('a rest of 1.0 s then a straight 500 px pass in 0.6 s: one rest at half strength and one sweep', () => {
  const pts = [...stay({ at: [200, 200], dur: 1.0 }), ...line({ from: [200, 200], to: [700, 200], dur: 0.6, t0: 1.0 }).slice(1)];
  const gs = findGestures(pts);
  assert.deepEqual(gs.map((g) => g.kind), ['rest', 'sweep']);
  assert.ok(Math.abs(gs[0].strength - 0.5) <= 0.08, `rest strength ${gs[0].strength}`);
  assert.equal(gs[1].strength, 0.3);
  assert.ok(gs[1].radius * 2 >= 400 && gs[1].from.x < gs[1].to.x);
  assert.deepEqual(findCircles(pts), []);
});

test('a loop that crosses a page change is not a circle', () => {
  const pts = loop({}).map((p, i, all) => ({ ...p, screen: i < all.length / 2 ? 0 : 1 }));
  assert.deepEqual(findCircles(pts), []);
});

// ---- awkward ones

test('an open spiral (the radius doubling as it turns) is weak or nothing, never a strong circle', () => {
  const cs = findCircles(loop({ r: 40, grow: 2.2, turns: 1.2, dur: 1.4 }));
  assert.ok(cs.every((c) => c.strength < 0.8), JSON.stringify(cs.map((c) => c.strength)));
});

test('a tight scribble (small, fast, changing direction) is not a circle', () => {
  const pts = [];
  for (let i = 0; i < 14; i++) pts.push({ t: i / HZ, x: 400 + (i % 2 ? 16 : -16) + 3 * Math.sin(i), y: 300 + 12 * Math.sin(i * 1.3), screen: 0 });
  assert.deepEqual(findCircles(pts), []);
});

test('a slow wide loop is a circle while it takes 3 s or less, and not one drawn slower than that', () => {
  const wide = findCircles(loop({ r: 300, dur: 2.8 }));
  assert.equal(wide.length, 1);
  assert.ok(wide[0].strength > 0.8 && Math.abs(wide[0].radius - 300) < 30);
  assert.deepEqual(findCircles(loop({ r: 300, dur: 4.5 })), []);   // ponytail: a limit of the plan's thresholds, not a judgement that this is no circle
  assert.deepEqual(findCircles(loop({ r: 450, dur: 2.5 })), []);   // wider than 400 px: that is travelling round the page
});

test('a target circled twice is one circle, its turns added up', () => {
  const cs = findCircles(loop({ turns: 2, dur: 2.2 }));
  assert.equal(cs.length, 1);
  assert.ok(cs[0].turns >= 1.8 && cs[0].strength > 0.8 && cs[0].t1 - cs[0].t0 > 1.9, JSON.stringify(cs[0]));
  // two circles in two places, one after the other, stay two
  const two = findCircles([...loop({}), ...line({ from: [460, 300], to: [860, 300], dur: 0.5, t0: 1.2 }).slice(1), ...loop({ cx: 800, t0: 1.7 }).slice(1)]);
  assert.equal(two.length, 2);
});

test('a straight sweep is not a circle; neither is a pointer jittering in place', () => {
  assert.deepEqual(findCircles(line({ from: [100, 100], to: [900, 500], dur: 1.0 })), []);
  const jitter = stay({ at: [500, 400], dur: 2.5, jitter: 5 });
  assert.deepEqual(findCircles(jitter), []);
  assert.deepEqual(findGestures(jitter).map((g) => g.kind), ['rest']); // it is a rest
  assert.deepEqual(findSweeps(jitter), []);
});

test('a counter-clockwise loop counts as much as a clockwise one; dense positions (20 a second) too', () => {
  assert.equal(findCircles(loop({ dir: -1 })).length, 1);
  const dense = findCircles(loop({ hz: 20 }));
  assert.equal(dense.length, 1);
  assert.ok(dense[0].strength > 0.9);
});

test('a still pointer sends no positions: a rest is also the gap before the next one, cut where the page changes', () => {
  const pts = [...line({ from: [100, 100], to: [300, 300], dur: 0.4 }), { t: 2.4, x: 304, y: 302, screen: 0 }, ...line({ from: [304, 302], to: [700, 302], dur: 0.5, t0: 2.4 }).slice(1)];
  const rests = findRests(pts);
  assert.equal(rests.length, 1);
  assert.ok(Math.abs(rests[0].t0 - 0.4) < 0.2 && Math.abs(rests[0].t1 - 2.4) < 1e-9 && rests[0].strength === 1, JSON.stringify(rests[0]));
  // the page changed at 1.2 s while the pointer sat there: the rest belongs to the old screen and ends with it
  const cut = findRests([...line({ from: [100, 100], to: [300, 300], dur: 0.4 }), { t: 3, x: 500, y: 500, screen: 1 }], { cuts: [0, 1.2] });
  assert.ok(cut.length === 1 && Math.abs(cut[0].t1 - 1.2) < 1e-9 && cut[0].screen === 0);
});

test('a sweep is a straight pass: a bent path is not one, a short hop is not one', () => {
  assert.equal(findSweeps(line({ from: [100, 100], to: [600, 140], dur: 0.6 })).length, 1);
  assert.deepEqual(findSweeps(line({ from: [100, 100], to: [300, 100], dur: 0.4 })), []);
  const bent = [...line({ from: [100, 100], to: [300, 100], dur: 0.3 }), ...line({ from: [300, 100], to: [300, 320], dur: 0.3, t0: 0.3 }).slice(1)];
  assert.deepEqual(findSweeps(bent), []);
  // part of a circle is not reported beside the circle
  assert.deepEqual(findGestures(loop({ r: 300, dur: 2.8 })).map((g) => g.kind), ['circle']);
});

// ---- what a gesture points at (the clean tree and measured boxes)

const screen = () => {
  const view = el('button', { class: 'btn' }, el('span', {}, tx('View API Key')));
  const name = el('input', { id: 'first', type: 'text', value: 'Jordan' }), label = el('label', { for: 'first' }, tx('First name'));
  const heading = el('h2', {}, tx('Profile')), cell = el('td', {}, tx('Transaction 1')), row = el('tr', {}, cell), link = el('a', { href: '#' }, tx('Sign out'));
  const card = el('div', { class: 'card' }, heading, label, name, view), tree = el('html', {}, el('body', {}, card, el('table', {}, el('tbody', {}, row)), link));
  const boxes = { [card.id]: { x: 100, y: 100, w: 600, h: 400 }, [heading.id]: { x: 120, y: 120, w: 200, h: 30 }, [label.id]: { x: 120, y: 200, w: 120, h: 24 }, [name.id]: { x: 260, y: 196, w: 280, h: 32 },
    [view.id]: { x: 260, y: 300, w: 280, h: 36 }, [view.childNodes[0].id]: { x: 340, y: 308, w: 120, h: 20 }, [row.id]: { x: 100, y: 600, w: 900, h: 40 }, [cell.id]: { x: 100, y: 600, w: 300, h: 40 }, [link.id]: { x: 1000, y: 20, w: 80, h: 24 } };
  return { tree, boxes, view, name, heading, cell, row, link, label };
};

test('a circle encloses what lies inside the loop, not merely what is under the pointer', () => {
  const s = screen();
  // a loop round the button: its centre is on the button, and the button (with its caption span) lies inside it
  const [g] = enclose(findCircles(loop({ cx: 400, cy: 318, rx: 160, ry: 40 })), s.tree, s.boxes);
  assert.deepEqual(g.encloses.map((e) => [e.node, e.tag, e.role, e.text, e.how]), [[s.view.id, 'button', 'button', 'View API Key', 'inside']]);       // the caption span is not listed beside its button
  // a wider loop takes in the field above it too, nearest the centre first; the field carries its label
  const [wide] = enclose(findCircles(loop({ cx: 400, cy: 270, r: 190, dur: 1.6 })), s.tree, s.boxes);
  assert.deepEqual(wide.encloses.map((e) => e.node).sort(), [s.name.id, s.view.id].sort());                    // not the label: it reaches outside the loop
  assert.deepEqual(wide.encloses.find((e) => e.node === s.name.id), { node: s.name.id, tag: 'input', role: 'field', text: 'Jordan', label: 'First name', how: 'inside' });
  // a small loop drawn ON the button holds nothing whole: it points at what is around its centre
  const [tight] = enclose(findCircles(loop({ cx: 300, cy: 318, r: 14, dur: 1.0 })), s.tree, s.boxes);
  assert.deepEqual(tight.encloses.map((e) => [e.node, e.how]), [[s.view.id, 'under']]);
  // a loop over nothing
  const [empty] = enclose(findCircles(loop({ cx: 1500, cy: 900, r: 40 })), s.tree, s.boxes);
  assert.deepEqual(empty.encloses, []);
  assert.match(describe(g), /^circle +0\.0-1\.2 s +screen 0 +strength [01]\.\d\d +encloses 1: button "View API Key"$/);
});

test('a rest points at the smallest named thing under it, with its row; a sweep at what it crosses, in order', () => {
  const s = screen();
  const [rest] = enclose(findRests(stay({ at: [150, 620], dur: 1.2 })), s.tree, s.boxes);
  assert.deepEqual(rest.encloses, [{ node: s.cell.id, tag: 'td', role: 'cell', text: 'Transaction 1', how: 'under', row: s.row.id }]);
  const [sweep] = enclose(findSweeps(line({ from: [700, 214], to: [100, 210], dur: 0.7 })), s.tree, s.boxes);
  assert.deepEqual(sweep.encloses.map((e) => [e.node, e.how]), [[s.name.id, 'crossed'], [s.label.id, 'crossed']]);
});

test('a scrolled page: the pointer is in window px, the boxes in the captured screen, so the region moves with the scroll', () => {
  const s = screen(), scrolls = [{ t: 0.5, id: 1, x: 0, y: 0, screen: 0 }, { t: 2, id: 1, x: 0, y: 300, screen: 0 }, { t: 2.5, id: 77, x: 0, y: 900, screen: 0 }, { t: 9, id: 1, x: 0, y: 50, screen: 1 }];
  assert.deepEqual(scrollAt(scrolls, 1, { screen: 0, root: 1 }), { x: 0, y: 0 });
  assert.deepEqual(scrollAt(scrolls, 3, { screen: 0, root: 1 }), { x: 0, y: 300 });                 // an inner scroller (id 77) is not the page
  assert.deepEqual(scrollAt(scrolls, 3, { screen: 0, root: 1, initial: { left: 0, top: 100 } }), { x: 0, y: 200 });
  assert.deepEqual(scrollAt(scrolls, 10, { screen: 0, root: 1 }), { x: 0, y: 300 });
  const [g] = enclose(findRests(stay({ at: [150, 320], dur: 1.2, t0: 3 })), s.tree, s.boxes, { scroll: (x) => scrollAt(scrolls, x.t0, { screen: 0, root: 1 }) });
  assert.deepEqual([g.encloses[0].node, g.scrolled], [s.cell.id, { x: 0, y: 300 }]);                   // 320 on the window is 620 on the page
});

test('nothing but ids, tags, roles and the clean tree\'s text (40 characters at most) comes out', () => {
  const long = el('button', {}, tx('x'.repeat(90))), tree = el('html', {}, el('body', {}, long));
  const [g] = enclose(findRests(stay({ at: [50, 50], dur: 1 })), tree, { [long.id]: { x: 0, y: 0, w: 100, h: 100 } });
  assert.deepEqual(Object.keys(g.encloses[0]).sort(), ['how', 'node', 'role', 'tag', 'text']);
  assert.equal(g.encloses[0].text.length, 40);
});

test('the clicks are a check on the evidence: a rest on the clicked control, a sweep arriving at it', () => {
  const s = screen();
  const pts = [...line({ from: [900, 600], to: [400, 318], dur: 0.7 }), ...stay({ at: [400, 318], dur: 1.0, t0: 0.7 }).slice(1)];
  const gs = enclose(findGestures(pts), s.tree, s.boxes);
  const manifest = { clicks: [{ t: 1.6, nodeId: s.view.childNodes[0].id, x: 400, y: 318, screen: 0 }, { t: 5, nodeId: s.link.id, x: 1040, y: 30, screen: 0 }] };
  const checks = clicksAgainst(gs, manifest, { 0: { tree: s.tree, boxes: s.boxes } });
  assert.deepEqual(checks.map((c) => [c.what, c.rest, c.sweep]), [['button "View API Key"', true, true], ['link "Sign out"', false, false]]);
});

// ---- the real recording (skipped where it is not on this machine): counts only

test('tutorial 1\'s pointer path: at least one gesture, no circle wider than 400 px', { skip: !fs.existsSync(path.join(os.homedir(), 'Videos', 'Rostrum', 'user-api-key', 'film', 'clean', 'pointer.json')) }, () => {
  const dir = path.join(os.homedir(), 'Videos', 'Rostrum', 'user-api-key', 'film', 'clean');
  const { points } = JSON.parse(fs.readFileSync(path.join(dir, 'pointer.json'), 'utf8')), manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  const gs = findGestures(points, { cuts: manifest.screens.map((x) => x.t) });
  const count = (k) => gs.filter((g) => g.kind === k).length;
  console.log(`tutorial 1: ${points.length} positions; ${count('circle')} circles, ${count('rest')} rests, ${count('sweep')} sweeps`);
  assert.ok(gs.length >= 1);
  assert.ok(gs.filter((g) => g.kind === 'circle').every((g) => g.radius <= 400));
  assert.ok(gs.every((g) => g.t1 >= g.t0 && g.strength > 0 && g.strength <= 1));
});
