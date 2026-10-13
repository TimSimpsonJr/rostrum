import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cameraAt, cameraFaults, project } from './cameraAt.ts';
import { cursorAt } from './cursorPath.ts';
import { elementIn, findHits, sortAllowed } from '../../../tools/sweep.mjs';
import { rulesFor, scrub } from '../../../tools/scrub.mjs';
import { layOut, repairWords } from '../../../tools/make-timing.mjs';

const VP = { width: 1920, height: 1080 };
const screen = { x: 0, y: 0, w: 2560, h: 1351 }, corner = { x: 2000, y: 0, w: 560, h: 315 }, field = { x: 1047, y: 651, w: 466, h: 37 };
const keys = [
  { frame: 10, box: screen, fill: 0.8 },
  { frame: 60, box: screen, fill: 0.81, ease: 'linear' },
  { frame: 160, box: corner, fill: 1 },
  { frame: 200, box: corner, fill: 1.04, ease: 'linear' },
];

test('camera: exact at its keys', () => {
  for (const k of keys) {
    const cam = cameraAt(keys, k.frame, VP);
    assert.ok(Math.abs(cam.s * k.box.w - k.fill * VP.width) < 1e-6, 'the box fills what the key says');
    const c = project(cam, { x: k.box.x + k.box.w / 2, y: k.box.y + k.box.h / 2 }, VP);
    assert.ok(Math.abs(c.x - 960) < 1e-6 && Math.abs(c.y - 540) < 1e-6, 'the box is centred');
  }
  assert.deepEqual(cameraAt(keys, 0, VP), cameraAt(keys, 10, VP)); // before the first key it waits there
});

test('camera: scale never decreases, no frame equals the last, no jump', () => {
  assert.deepEqual(cameraFaults(keys, 10, 200, VP), []);
  let most = 0;
  for (let f = 11; f <= 200; f++) most = Math.max(most, cameraAt(keys, f, VP).s / cameraAt(keys, f - 1, VP).s);
  assert.ok(most < 1.08, `largest zoom step ${most}`); // a 5.7x push in 100 frames stays under 8% a frame
});

test('camera: the faults are found when they are there', () => {
  const back = [{ frame: 0, box: corner, fill: 1 }, { frame: 30, box: screen, fill: 0.8 }]; // pulls back
  assert.match(cameraFaults(back, 0, 30, VP)[0], /scale decreases/);
  const held = [{ frame: 0, box: field, fill: 0.6 }, { frame: 30, box: field, fill: 0.6 }]; // a dead hold
  assert.match(cameraFaults(held, 0, 30, VP)[0], /identical/);
  const snap = [{ frame: 0, box: screen, fill: 0.8 }, { frame: 3, box: corner, fill: 1 }]; // too fast
  assert.ok(cameraFaults(snap, 0, 3, VP).some((f) => /moves/.test(f)));
});

test('camera: on the way in, the destination travels straight to the centre of the frame', () => {
  const target = { x: corner.x + corner.w / 2, y: corner.y + corner.h / 2 };
  const a = project(cameraAt(keys, 60, VP), target, VP);
  for (let f = 61; f < 160; f++) {
    const p = project(cameraAt(keys, f, VP), target, VP);
    const cross = (p.x - 960) * (a.y - 540) - (p.y - 540) * (a.x - 960); // 0 when p is on the line from a to the centre
    assert.ok(Math.abs(cross) < 1e-3, `off the line at frame ${f}`);
  }
});

const still = (x, y) => () => ({ x, y });
const moves = [
  { from: 20, to: 60, stop: still(1200, 300), bow: 0.12 },
  { from: 90, to: 110, stop: (f) => ({ x: 400 + f, y: 700 }) }, // a target that itself moves (the camera is moving)
];
const start = still(2040, 1230);

test('cursor: ends each move on its target, and rests there', () => {
  assert.deepEqual(cursorAt(start, moves, 0), { x: 2040, y: 1230 });
  assert.deepEqual(cursorAt(start, moves, 60), { x: 1200, y: 300 });
  assert.deepEqual(cursorAt(start, moves, 75), { x: 1200, y: 300 });
  assert.deepEqual(cursorAt(start, moves, 110), { x: 510, y: 700 });
  assert.deepEqual(cursorAt(start, moves, 150), { x: 550, y: 700 }); // it stays on the moving target
});

test('cursor: continuous, never stalls mid-move, and the path is a curve', () => {
  let prev = cursorAt(start, moves, 0), bowed = 0;
  for (let f = 1; f <= 150; f++) {
    const p = cursorAt(start, moves, f), step = Math.hypot(p.x - prev.x, p.y - prev.y);
    assert.ok(step < 80, `jumps ${step.toFixed(1)} px at frame ${f}`);
    if (f > 22 && f < 58) assert.ok(step > 0.5, `stalls at frame ${f}`);
    if (f > 20 && f < 60) { // distance from the straight line start -> target
      const d = Math.abs((p.x - 2040) * (300 - 1230) - (p.y - 1230) * (1200 - 2040)) / Math.hypot(1200 - 2040, 300 - 1230);
      bowed = Math.max(bowed, d);
    }
    prev = p;
  }
  assert.ok(bowed > 60, `the path bows ${bowed.toFixed(0)} px off the straight line`);
});

test('sweep: finds an original in a node, across nodes, in a value and in an attribute; reports no values', () => {
  const originals = [{ kind: 'email', value: 'Real.Person@corp.test' }, { kind: 'cell', value: 'Acme Holdings' }, { kind: 'digits', value: '123' }];
  const seen = [
    { id: 1, kind: 'text', s: 'Hello ' }, { id: 2, kind: 'text', s: 'real.person@' }, { id: 3, kind: 'text', s: 'corp.test' }, // split over two nodes
    { id: 4, kind: 'text', s: ' Acme\n   Holdings ' },                                                                      // whitespace as in markup
    { id: 5, kind: 'value', s: 'ACME HOLDINGS' }, { id: 6, kind: 'attr:title', s: 'for Acme Holdings only' },
    { id: 7, kind: 'text', s: 'Acme Holdings', hidden: true }, { id: 8, kind: 'text', s: 'Total 123' },                    // hidden; too short to count
  ];
  const hits = findHits(seen, originals);
  assert.deepEqual(hits.filter((h) => !h.hidden).map((h) => `${h.ids.join('+')} ${h.where}`).sort(), ['2+3 text', '4 text', '5 value', '6 attr:title']);
  assert.deepEqual(hits.filter((h) => h.hidden).map((h) => h.ids), [[7]]);
  assert.ok(!JSON.stringify(hits).toLowerCase().includes('acme') && !JSON.stringify(hits).includes('corp'));
  // letters only: whole words count, the inside of a longer word does not; a value with digits counts anywhere
  const short = [{ kind: 'cell', value: 'Tran' }, { kind: 'digits', value: '987650' }];
  assert.deepEqual(findHits([{ id: 1, kind: 'text', s: 'Transaction Type' }], short), []);
  assert.equal(findHits([{ id: 1, kind: 'text', s: 'Paid to Tran today' }, { id: 2, kind: 'text', s: 'REF00987650X' }], short).length, 2);
  // a stand-in sum that reads like some original sum is still a stand-in; the same text NOT written by the money rule is a leak
  const sums = [{ kind: 'amount', value: '$100.00' }];
  assert.deepEqual(findHits([{ id: 1, kind: 'text', s: '$', via: 'money' }, { id: 2, kind: 'text', s: '100.00', via: 'money' }], sums), []);
  assert.equal(findHits([{ id: 1, kind: 'text', s: 'Total $100.00' }], sums).length, 1);
  // an exemption needs EVERY original of that text to be exempt: a date-shaped cell that is also a phone is checked
  const both = [{ kind: 'cell', value: '09/23/2026' }, { kind: 'phone', value: '09/23/2026' }];
  assert.deepEqual(findHits([{ id: 1, kind: 'text', s: 'on 09/23/2026' }], [both[0]]), []);
  assert.equal(findHits([{ id: 1, kind: 'text', s: 'on 09/23/2026' }], both).length >= 1, true);
  // only real dates are dates: an SSN-shaped or account-shaped cell is checked
  for (const value of ['123-45-6789', '99/99/9999', '13/01/2026', '1234-56-7890']) assert.ok(findHits([{ id: 1, kind: 'text', s: `x ${value} y` }], [{ kind: 'cell', value }]).length, value);
  for (const value of ['9/1/26', '09-01-2026', '2026-09-01', '09/01/2026 3:15 PM']) assert.deepEqual(findHits([{ id: 1, kind: 'text', s: `x ${value} y` }], [{ kind: 'cell', value }]), [], value);
  // punctuation and spacing stripped from both sides: the same value written another way, or inside a label
  const acct = [{ kind: 'digits', value: '4401-2298-17' }, { kind: 'token', value: 'sk_live_Ab3dEf6h' }];
  assert.equal(findHits([{ id: 1, kind: 'text', s: 'Acct 4401 2298 17' }], acct).length, 1);
  assert.equal(findHits([{ id: 1, kind: 'text', s: '44012' }, { id: 2, kind: 'text', s: '29817' }], acct)[0].ids.join('+'), '1+2');
  assert.equal(findHits([{ id: 1, kind: 'value', s: 'SkLiveAb3dEf6h-123456' }], acct).length, 1);
  assert.equal(findHits([{ id: 1, kind: 'attr:title', s: 'key: SK-LIVE-AB3D-EF6H' }], acct).length, 1);
  assert.deepEqual(findHits([{ id: 1, kind: 'text', s: 'Acct 4401 2298 18' }], acct), []);
  assert.deepEqual(findHits([{ id: 1, kind: 'text', s: 'Transaction 1' }, { id: 2, kind: 'value', s: 'UserAPIKey-123456' }], originals), []);
});

test('timing: a word Whisper starts inside a silence starts when the silence ends; sentences are spaced by the pacing', () => {
  const silences = [{ start: 0, end: 0.16 }, { start: 2.58, end: 3.12 }, { start: 4.3, end: 4.8 }];
  const w = repairWords([{ word: ' Your', start: 0, end: 0.32 }, { word: ' key.', start: 0.4, end: 2.5 }, { word: ' user', start: 5.06, end: 5.06 }, { word: ' menu,', start: 5.06, end: 5.4 }], silences);
  assert.deepEqual(w.map((x) => [x.w, x.start]), [['your', 0.16], ['key', 0.4], ['user', 4.8], ['menu', 5.06]]);
  const laid = layOut([{ words: [{ w: 'a', start: 0.2, end: 1.2 }] }, { words: [{ w: 'b', start: 1.5, end: 2.5 }, { w: 'c', start: 2.6, end: 3 }] }], { lead: 3, gaps: [0, 0.8] });
  assert.deepEqual(laid.map((s) => [s.start, s.end]), [[3, 4], [4.8, 6.3]]);
  assert.deepEqual(laid[1].words.map((x) => x.start), [4.8, 5.9]);
});

test('sweep: confirmed interface text (`allow`) lets a table cell\'s text show at the element named, and nothing else', () => {
  // a table cell elsewhere reads "Amount"; a stat card's label, a column heading and a field's placeholder read it too
  const originals = [{ kind: 'cell', value: 'Amount' }, { kind: 'name', value: 'Dana Example' }, { kind: 'cell', value: 'Zip Code' }, { kind: 'company', value: 'Zip Code' }];
  const seen = [
    { id: 11, p: 10, kind: 'text', s: 'Average Amount ' }, { id: 21, p: 20, kind: 'text', s: 'Amount ' }, { id: 31, p: 30, kind: 'text', s: 'Amount due ' },
    { id: 40, kind: 'attr:placeholder', s: 'Amount' }, { id: 40, kind: 'value', s: 'Amount' }, { id: 51, p: 50, kind: 'text', s: 'Dana Example ' },
    { id: 61, p: 60, kind: 'text', s: 'Zip Code ' }, { id: 71, p: 70, kind: 'text', s: 'Amo' }, { id: 72, p: 79, kind: 'text', s: 'unt ' },
  ];
  const hits = findHits(seen, originals), at = (hs) => hs.map((h) => `${h.ids.join('+')} ${h.where}`).sort();
  assert.deepEqual(sortAllowed(hits, seen, []).allowed, [], 'with nothing allowed, nothing is');
  assert.equal(sortAllowed(hits, seen, []).fails.length, hits.length);
  const { fails, allowed } = sortAllowed(hits, seen, [10, 20, 40, 50, 60, 70]);
  assert.deepEqual(at(allowed), ['11 text', '21 text', '40 attr:placeholder'], 'the label, the heading and the placeholder');
  // not named: fails as before. A form value is never allowed. Text split over an element that is not allowed: fails.
  assert.deepEqual(at(fails), ['31 text', '40 value', '51 text', '61 text', '71+72 text']);
  // any kind but a table cell still fails at an allowed element, and says so: a name; a text that is a cell AND a company
  assert.deepEqual(fails.filter((h) => h.refused).map((h) => [h.ids[0], h.kinds.filter((k) => k !== 'cell')]), [[51, ['name']], [61, ['company']]]);
  assert.ok(!JSON.stringify({ fails, allowed }).includes('Amount') && !JSON.stringify(fails).includes('Dana'), 'no values in what is reported');
  // an entry names an element of the screen: a text node, or an id that is not there, is not one
  const tree = { type: 0, id: 1, childNodes: [{ type: 2, id: 2, tagName: 'body', attributes: {}, childNodes: [{ type: 2, id: 10, tagName: 'p', attributes: {}, childNodes: [{ type: 3, id: 11, textContent: 'Average Amount' }] }] }] };
  assert.deepEqual([elementIn(tree, 10), elementIn(tree, 11), elementIn(tree, 99)], ['p', null, null]);
  // and it never changes what the scrub does: the same tree comes out with and without it
  const scrubbed = (json) => { const t = structuredClone(tree); scrub(t, rulesFor(json)); return JSON.stringify(t); };
  assert.equal(scrubbed({ allow: [{ screen: 0, node: 10 }] }), scrubbed({}));
  assert.deepEqual(rulesFor({ allow: [{ screen: 0, node: 10 }] }, 0), rulesFor({}, 0));
});

test('sweep: a column kept on purpose (`keepColumns`) may show its originals in the kept cells, and nowhere else', async () => {
  const { sortKept } = await import('../../../tools/sweep.mjs');
  const originals = [{ kind: 'cell', value: 'payee_name' }, { kind: 'token', value: 'payment_reference_number_external' }];
  const seen = [
    { id: 11, p: 10, kind: 'text', s: 'payee_name ', kept: true }, { id: 10, kind: 'attr:title', s: 'payee_name', kept: true },                    // a kept cell's text and its tooltip
    { id: 21, p: 20, kind: 'text', s: 'payment_reference_', kept: true }, { id: 22, p: 20, kind: 'text', s: 'number_external ', kept: true },      // split over two kept nodes
    { id: 31, p: 30, kind: 'text', s: 'see payee_name here ' },                                                                                    // the same value outside the kept cells
    { id: 41, p: 40, kind: 'text', s: 'payment_reference_', kept: true }, { id: 42, p: 49, kind: 'text', s: 'number_external ' },                  // half in a kept cell, half not
    { id: 50, kind: 'css', s: '.x::after { content: "payee_name" }', kept: true },                                                                 // a stylesheet is never a kept cell
  ];
  const hits = findHits(seen, originals), at = (hs) => [...new Set(hs.map((h) => `${h.ids.join('+')} ${h.where}`))].sort();
  const { fails, kept } = sortKept(hits, seen);
  assert.deepEqual(at(kept), ['10 attr:title', '11 text', '21+22 text']);
  assert.deepEqual(at(fails), ['31 text', '41+42 text', '50 css']);
  assert.deepEqual(sortKept(hits, seen.map(({ kept: _, ...e }) => e)).kept, [], 'with nothing kept, nothing is let through');
  // only text is kept (security review): another attribute or a field of an element in a kept cell fails like anywhere
  const more = [{ id: 60, kind: 'attr:aria-label', s: 'payee_name', kept: true }, { id: 61, kind: 'attr:data-x', s: 'payee_name', kept: true }, { id: 62, kind: 'value', s: 'payee_name', kept: true }];
  assert.deepEqual(sortKept(findHits(more, originals), more).kept, []);
});

test('sweep: a control\'s label kept as interface text is still an original (`control`): it may show only where the judgement holds on the clean copy', async () => {
  const { sortInterface, interfaceLabels } = await import('../../../tools/sweep.mjs');
  // a clean screen: two rows, the same button and the same menu in each; and a link that differs per row (data)
  let id = 1;
  const el = (tagName, attributes, ...childNodes) => ({ type: 2, id: id++, tagName, attributes, childNodes }), tx = (textContent) => ({ type: 3, id: id++, textContent });
  const row = (name) => el('tr', {}, el('td', {}, el('a', {}, tx(name))), el('td', {}, el('button', {}, tx('View')), tx(' '), el('div', { class: 'dropdown-menu' }, el('a', { class: 'dropdown-item' }, tx('Edit')))));
  const tree = el('html', {}, el('body', {}, el('table', {}, el('tbody', {}, row('Company 1'), row('Company 2'))), el('h2', {}, tx('View Edit'))));
  const { ids, tables } = interfaceLabels(tree);
  assert.deepEqual([ids.size, tables], [4, 1]);
  const texts = []; (function go(n, p) { if (n.type === 3) texts.push({ id: n.id, p: p.id, kind: 'text', s: n.textContent + (p.tagName === 'h2' || p.tagName === 'a' ? ' ' : '') }); n.childNodes?.forEach((c) => go(c, n)); })(tree, null);
  const at = (hs) => [...new Set(hs.map((h) => h.ids.join('+')))].sort();
  const heading = texts.at(-1).id, inRow = (i) => texts.filter((t) => ids.has(t.id) || !t.s.trim()).slice(i * 3, i * 3 + 3).map((t) => t.id).join('+');
  const { fails, labels } = sortInterface(findHits(texts, [{ kind: 'control', value: 'View Edit' }]), texts, ids);
  assert.deepEqual(at(labels), [inRow(0), inRow(1)].sort());      // in the two cells: let through, and listed
  assert.deepEqual(at(fails), [String(heading)]);                 // the same words in a heading: not where the judgement holds
  // a text that is a control's label AND something else (a name, a cell) is not let through anywhere
  const both = sortInterface(findHits(texts, [{ kind: 'control', value: 'View Edit' }, { kind: 'name', value: 'View Edit' }]), texts, ids);
  assert.deepEqual([both.labels.length, at(both.fails).length], [0, 3]);
  // when the judgement does not hold on the clean copy (no labels found), nothing is let through
  assert.deepEqual(sortInterface(findHits(texts, [{ kind: 'control', value: 'View Edit' }]), texts, new Set()).labels, []);
});
