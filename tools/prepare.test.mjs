import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { rewriteUrls, buildManifest, prepare, viewportRuns, MISSING } from './prepare-recording.mjs';
import { MORE, ORIGINALS, el, more, page, tx } from '../fixtures/scrub/leak-set.mjs';

const BASE = 'https://site.test/css/app.css';
const map = {
  'https://site.test/fonts/a.woff2': 'assets/1.woff2',
  'https://site.test/css/img/bg.png': 'assets/2.png',
  'https://cdn.test/more.css': 'assets/3.css',
  'https://site.test/css/print.css': 'assets/4.css',
};

test('rewriteUrls maps url() and @import targets and blanks the unknown ones', () => {
  const r = (css) => rewriteUrls(css, BASE, map);
  assert.equal(r('a{background:url("/fonts/a.woff2")}'), 'a{background:url("assets/1.woff2")}');          // quoted, root-relative
  assert.equal(r("a{background:url('img/bg.png')}"), 'a{background:url("assets/2.png")}');                // single quotes, relative
  assert.equal(r('a{background:url( img/bg.png )}'), 'a{background:url("assets/2.png")}');                // unquoted
  assert.equal(r('@import url(https://cdn.test/more.css);'), '@import url("assets/3.css");');             // @import url()
  assert.equal(r('@import "print.css" screen;'), '@import "assets/4.css" screen;');                       // @import "x"
  assert.equal(r('a{src:url(../fonts/a.woff2?v=1#iefix)}'), `a{src:url("${MISSING}")}`);                  // a different URL (query): unknown
  assert.equal(r('a{src:url(../fonts/a.woff2#iefix)}'), 'a{src:url("assets/1.woff2#iefix")}');            // fragment is not part of the file
  assert.equal(r('a{background:url(https://other.test/x.png)}'), `a{background:url("${MISSING}")}`);      // unknown URL
});

test('rewriteUrls leaves data URIs, fragments and namespace names alone, and reports what is missing', () => {
  const data = `a{background:url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg'/%3e")}`;
  assert.equal(rewriteUrls(data, BASE, map), data);
  assert.equal(rewriteUrls('a{clip-path:url(#clip)}', BASE, map), 'a{clip-path:url(#clip)}');
  assert.equal(rewriteUrls('@namespace svg url(http://www.w3.org/2000/svg);', BASE, map), '@namespace svg url(http://www.w3.org/2000/svg);');
  const missing = [];
  rewriteUrls('a{src:url(x.woff),url(/fonts/a.woff2)}', BASE, map, (u) => missing.push(u));
  assert.deepEqual(missing, ['https://site.test/css/x.woff']);
  assert.equal(rewriteUrls('a{b:url(x.png)}', BASE, (u) => 'L:' + new URL(u).pathname), 'a{b:url("L:/css/x.png")}'); // a function works as the map
});

test('buildManifest drops consecutive duplicate screens, ties each click to the screen in force, and keeps each screen\'s own viewport', () => {
  const ev = (type, timestamp, data, href = 'https://site.test/') => ({ type, timestamp, data, href });
  const events = [
    ev(4, 1000, { width: 1280, height: 720, href: 'https://site.test/' }),
    ev(2, 1010, { node: { id: 1 } }),
    ev(2, 1500, { node: { id: 1 } }),                                   // same again: dropped
    ev(3, 2000, { source: 2, type: 2, id: 42, x: 10, y: 20 }),
    ev(2, 2005, { node: { id: 1, later: true } }),
    ev(3, 2600, { source: 2, type: 2, id: 43, x: 1, y: 2 }),
    ev(4, 2990, { width: 2560, height: 1317, href: 'https://site.test/other' }), // another site, another zoom: rrweb's Meta before its snapshot
    ev(2, 3000, { node: { id: 1 } }, 'https://site.test/other'),        // same node, other page: kept
    ev(3, 3500, { source: 4, width: 2560, height: 1200 }),              // the window resized
    ev(2, 3600, { node: { id: 1 } }, 'https://site.test/other'),        // same tree, other size: kept (its layout differs)
  ];
  const { manifest, screens } = buildManifest(events);
  assert.equal(manifest.t0, 1000);
  assert.deepEqual(manifest.viewport, { width: 1280, height: 720 });   // the first screen's, as before
  assert.deepEqual(manifest.screens, [
    { i: 0, t: 0.01, path: 'screen-0.json', href: 'https://site.test/', viewport: { width: 1280, height: 720 } },
    { i: 1, t: 1.005, path: 'screen-1.json', href: 'https://site.test/', viewport: { width: 1280, height: 720 } },
    { i: 2, t: 2, path: 'screen-2.json', href: 'https://site.test/other', viewport: { width: 2560, height: 1317 } },
    { i: 3, t: 2.6, path: 'screen-3.json', href: 'https://site.test/other', viewport: { width: 2560, height: 1200 } },
  ]);
  assert.deepEqual(manifest.clicks, [{ t: 1, nodeId: 42, x: 10, y: 20, screen: 0 }, { t: 1.6, nodeId: 43, x: 1, y: 2, screen: 1 }]);
  assert.equal(screens.length, 4);
  assert.deepEqual(viewportRuns(manifest.screens), [{ from: 0, to: 1, width: 1280, height: 720 }, { from: 2, to: 2, width: 2560, height: 1317 }, { from: 3, to: 3, width: 2560, height: 1200 }]);
  assert.equal(screens[1].node.later, true);
});

test('review: a page address keeps its site and the plain words of its path, judged after decoding; nothing else', async () => {
  const { cleanHref } = await import('./prepare-recording.mjs');
  const { HREFS } = await import('../fixtures/scrub/leak-set.mjs');
  for (const [recorded, kept] of HREFS) assert.equal(cleanHref(recorded, { full: 'Rita Quill', first: 'Rita', last: 'Quill' }), kept);
  assert.equal(cleanHref('https://site.test/Account/Profile'), 'https://site.test/Account/Profile');
  assert.equal(cleanHref('https://site.test/people/quill-rita/edit', { full: 'Rita Quill', first: 'Rita', last: 'Quill' }), 'https://site.test/people/-/edit'); // the user's name, though a plain word
  assert.equal(cleanHref('https://site.test/%50rofile/a%2Fb'), 'https://site.test/Profile/-');   // decoded first: a plain word stays, an encoded slash does not
  assert.equal(cleanHref('not a url'), '');
  assert.equal(cleanHref('javascript:alert(884120)'), '');
});

test('buildPointer: positions from their batches in time order, scrolls, each with the screen in force', async () => {
  const { buildPointer } = await import('./prepare-recording.mjs');
  const ev = (timestamp, data) => ({ type: 3, timestamp, data });
  const events = [
    { type: 4, timestamp: 1000, data: { width: 1280, height: 720, href: 'https://site.test/' } },
    ev(1500, { source: 1, positions: [{ x: 1, y: 1, id: 9, timeOffset: -400 }, { x: 2, y: 2, id: 9, timeOffset: -200 }, { x: 3, y: 3, id: 9, timeOffset: 0 }] }),
    ev(1600, { source: 2, type: 2, id: 42, x: 3, y: 3 }),                                  // a click: not a position
    ev(2000, { source: 1, positions: [{ x: 4, y: 4, id: 9, timeOffset: -450 }, { x: 5, y: 5, id: 9, timeOffset: -250 }, { x: 6, y: 6, id: 9, timeOffset: -50 }] }),
    ev(2100, { source: 3, id: 1, x: 0, y: 240 }),
  ];
  const manifest = { screens: [{ i: 0, t: 0.01 }, { i: 1, t: 0.7 }] };
  const { points, scrolls } = buildPointer(events, manifest);
  assert.deepEqual(points, [{ t: 0.1, x: 1, y: 1, screen: 0 }, { t: 0.3, x: 2, y: 2, screen: 0 }, { t: 0.5, x: 3, y: 3, screen: 0 }, { t: 0.55, x: 4, y: 4, screen: 0 }, { t: 0.75, x: 5, y: 5, screen: 1 }, { t: 0.95, x: 6, y: 6, screen: 1 }]);
  assert.deepEqual(scrolls, [{ t: 1.1, id: 1, x: 0, y: 240, screen: 1 }]);
});

test('prepare with pauses: what happened inside a pause is left out and what came after moves back by it', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-prepare-')), rec = path.join(dir, 'recording');
  try {
    fs.mkdirSync(rec, { recursive: true });
    const ev = (type, timestamp, data) => ({ type, timestamp, data });
    const screen = (words) => ({ node: el('html', {}, el('body', {}, el('h1', {}, tx(words)))) });
    const events = [ev(4, 1000, { width: 1280, height: 720, href: 'https://site.test/keys' }), ev(2, 1000, screen('Keys')), ev(2, 4000, screen('Sign in')), ev(2, 6000, screen('Settings')),
      ev(3, 6500, { source: 2, type: 2, id: 3, x: 5, y: 6 })];
    fs.writeFileSync(path.join(rec, 'events.ndjson'), events.map((e) => JSON.stringify(e)).join('\n'));
    fs.writeFileSync(path.join(rec, 'segments.json'), JSON.stringify({ segments: [{ from: 1000, to: 3000 }, { from: 5000, to: 7000 }] }));
    fs.writeFileSync(path.join(rec, 'mic.webm'), 'voice'); fs.writeFileSync(path.join(rec, 'mic.json'), '{"t0":5500}');
    const lines = [];
    const { manifest } = prepare(dir, { log: (l) => lines.push(l) });
    assert.deepEqual(manifest.screens.map((s) => s.t), [0, 3]);                    // 6000 is 4000 on the gap-free clock: 3 s after the start
    assert.deepEqual(manifest.clicks.map((c) => [c.t, c.screen]), [[3.5, 1]]);
    assert.equal(manifest.mic.t0, 3500);                                           // the take's start, on the same clock
    assert.ok(!fs.existsSync(path.join(dir, 'film', 'clean', 'screen-2.json')));
    assert.ok(!fs.readFileSync(path.join(dir, 'film', 'clean', 'screen-1.json'), 'utf8').includes('Sign in')); // the screen from inside the pause is not in the copy
    assert.ok(lines.includes('segments: 2, 1 events inside pauses dropped'));
    // one segment, or no segments file: the clock is the recording's own
    fs.writeFileSync(path.join(rec, 'segments.json'), JSON.stringify({ segments: [{ from: 1000, to: 7000 }] }));
    assert.deepEqual(prepare(dir, { log: () => {} }).manifest.screens.map((s) => s.t), [0, 3, 5]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('prepare: a control\'s label the scrub leaves as interface text is not an original; with `cells` on, a column kept on purpose is listed', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-prepare-')), rec = path.join(dir, 'recording');
  try {
    fs.mkdirSync(rec, { recursive: true });
    const menu = () => el('div', {}, el('button', {}, tx('View')), el('div', { class: 'dropdown-menu' }, el('a', { class: 'dropdown-item', href: '/e' }, tx('Edit')), el('a', { class: 'dropdown-item', href: '/h' }, tx('History'))));
    const row = (firm, title) => el('tr', {}, el('td', {}, el('a', { href: '/c' }, tx(firm))), el('td', {}, tx(title)), el('td', {}, el('a', { href: '/o' }, tx('Open'))), el('td', {}, menu()));
    const grid = el('table', { id: 'grid' }, el('thead', {}, el('tr', {}, ...['Company', 'DC title', 'Open', 'Actions'].map((h) => el('th', {}, tx(h))))), el('tbody', {}, row('Halvorsen Freight', 'Payee Name'), row('Brightwater Supply', 'Reference')));
    const events = [{ type: 4, timestamp: 1000, data: { width: 1280, height: 720, href: 'https://site.test/' } }, { type: 2, timestamp: 1010, data: { node: el('html', {}, el('body', {}, grid)) } }];
    fs.writeFileSync(path.join(rec, 'events.ndjson'), events.map((e) => JSON.stringify(e)).join('\n'));
    fs.writeFileSync(path.join(dir, 'rules.json'), JSON.stringify({ use: ['cells'], keepColumns: [{ table: '#grid', columns: ['DC title', 'Nothing'] }] }));
    const lines = [];
    const { kept } = prepare(dir, { log: (l) => lines.push(l) });
    assert.deepEqual(kept, [{ screen: 0, rule: 0, ok: true, table: grid.id, column: 'DC title', cells: 2 }, { screen: 0, rule: 0, ok: false, table: grid.id, column: 'Nothing', cells: 0, reason: 'no such header' }]);
    assert.ok(lines.some((l) => l.includes('kept on purpose') && l.includes(`table ${grid.id}`) && l.includes('"DC title"') && l.includes('2 cells')), 'the kept column is said');
    const cells = JSON.parse(fs.readFileSync(path.join(rec, 'originals.json'), 'utf8')).values.filter((o) => o.kind === 'cell').map((o) => o.value).sort();
    assert.deepEqual(cells, ['Brightwater Supply', 'Halvorsen Freight', 'Open', 'Payee Name', 'Reference', 'ViewEditHistory']); // with `cells` on, prepare's own look lists every cell whole, whatever the scrub made of it
    // but they do not leave the list (security review): they are originals of a kind of their own, which the sweep lets show only where the judgement holds
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(rec, 'originals.json'), 'utf8')).values.filter((o) => o.kind === 'control').map((o) => o.value).sort(), ['Open', 'ViewEditHistory']);
    const clean = fs.readFileSync(path.join(dir, 'film', 'clean', 'screen-0.json'), 'utf8');
    for (const ui of ['"View"', '"Edit"', '"History"', '"Open"', '"Payee Name"', '"Reference"', '"Company 1"']) assert.ok(clean.includes(ui), ui + ' is not in the clean copy');
    assert.ok(!clean.includes('Halvorsen') && !clean.includes('Actions 1'));
    assert.ok(JSON.parse(fs.readFileSync(path.join(dir, 'film', 'clean', 'changed.json'), 'utf8'))[0].some((c) => c.kind === 'kept'));
    assert.ok(!lines.join('\n').includes('Payee Name'), 'a kept value is never printed');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('prepare with an `only` rule: the screens of that host are hidden but for what is kept, said per screen, and what was hidden is on the sweep\'s list', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-prepare-')), rec = path.join(dir, 'recording');
  try {
    fs.mkdirSync(rec, { recursive: true });
    const inbox = () => el('html', {}, el('body', {}, el('div', { class: 'list' }, el('span', { title: 'Oskar Lindqvist' }, tx('Oskar Lindqvist')), el('span', {}, tx('Re: the Brightwater contract'))), el('div', { class: 'reading' }, el('p', {}, tx('Your export is ready')))));
    const product = el('html', {}, el('body', {}, el('h1', {}, tx('Import fields')), el('div', { class: 'list' }, tx('Step one'))));
    const ev = (type, timestamp, data, href) => ({ type, timestamp, data, ...(href ? { href } : {}) });
    const events = [ev(4, 1000, { width: 1280, height: 720, href: 'https://mail.site.test/inbox' }), ev(2, 1010, { node: inbox() }, 'https://mail.site.test/inbox'), ev(2, 2000, { node: product }, 'https://app.site.test/import')];
    fs.writeFileSync(path.join(rec, 'events.ndjson'), events.map((e) => JSON.stringify(e)).join('\n'));
    fs.writeFileSync(path.join(dir, 'rules.json'), JSON.stringify({ only: [{ host: 'mail.site.test', keep: ['.reading', '.nope'] }] }));
    const lines = [];
    const { only } = prepare(dir, { log: (l) => lines.push(l) });
    assert.deepEqual(only, [{ screen: 0, texts: 2, attributes: 1, pictures: 0, keeps: [{ rule: 0, keep: '.reading', ok: true, matched: 1 }, { rule: 0, keep: '.nope', ok: false, matched: 0, reason: 'no such element' }] }]);
    const clean = (i) => fs.readFileSync(path.join(dir, 'film', 'clean', `screen-${i}.json`), 'utf8');
    assert.ok(!/oskar|lindqvist|brightwater/i.test(clean(0)) && clean(0).includes('Your export is ready') && clean(1).includes('Step one') && clean(1).includes('Import fields'));
    const said = lines.join('\n');
    assert.ok(said.includes('hidden but for what is kept (only)') && said.includes('screen 0  2 text nodes, 1 attributes, 0 pictures hidden') && said.includes('".nope" NOT KEPT (no such element)') && !/oskar|brightwater/i.test(said));
    const greeked = JSON.parse(fs.readFileSync(path.join(rec, 'originals.json'), 'utf8')).values.filter((o) => o.kind === 'greeked').map((o) => o.value).sort();
    assert.deepEqual(greeked, ['Oskar Lindqvist', 'Re: the Brightwater contract']);
    assert.ok(JSON.parse(fs.readFileSync(path.join(dir, 'film', 'clean', 'changed.json'), 'utf8'))[0].some((c) => c.kind === 'greek'));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the sweep has its own look at the recording (security review): what the scrub misses of the automatic kinds is still on its list', async () => {
  const { collectCandidates } = await import('./prepare-recording.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-prepare-')), rec = path.join(dir, 'recording');
  try {
    fs.mkdirSync(rec, { recursive: true });
    const NEAR_CARD = '4111 1111 1111 1112';  // card-shaped, fails the Luhn check: the scrub (rightly or not) leaves it; the sweep's own look lists it
    const tree = () => el('html', {}, el('body', {}, el('p', { id: 'near' }, tx(`Card ${NEAR_CARD}`)), el('p', {}, tx('Key 3f9a1c7e5b2d8046af13c9e7b5d2a8f04c6e1b9d')), el('p', {}, el('span', {}, tx('$')), tx('50.25')),
      el('p', { title: 'acct 000123456789' }, tx('Write to ines.marlow@harbor-freight.example about order 884120')),
      el('select', {}, el('option', {}, tx('Halvorsen Freight')), el('option', {}, tx('Brightwater Supply'))), el('input', { id: 'memo', value: 'not masked by the recorder' }),
      el('span', { id: 'clientSecretValue' }, tx('correct horse battery')),
      el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, tx('Customer')), el('th', {}, tx('Balance')))), el('tbody', {}, el('tr', {}, el('td', {}, tx('Oskar Lindqvist')), el('td', {}, tx('1,204.50')))))));
    const listed = (use) => { const got = []; collectCandidates(tree(), (kind, value) => { if (value) got.push(`${kind}: ${value}`); }, use); return got; };
    const mine = listed([]);
    for (const v of [`card: ${NEAR_CARD}`, 'key: 3f9a1c7e5b2d8046af13c9e7b5d2a8f04c6e1b9d', 'amount: $50.25', 'account: 000123456789', 'option: Halvorsen Freight', 'option: Brightwater Supply', 'field: not masked by the recorder', 'key: correct horse battery', 'cell: 1,204.50']) assert.ok(mine.includes(v), 'not listed: a ' + v.split(':')[0]);
    assert.ok(!mine.some((v) => /marlow|884120|Lindqvist/.test(v)), 'a kind nobody asked to replace is listed');
    assert.ok(listed(['emails', 'numbers', 'cells']).some((v) => v.startsWith('email: ines.marlow')) && listed(['numbers']).includes('digits: 884120') && listed(['cells']).includes('cell: Oskar Lindqvist'));
    // through prepare: the near-card is still in the clean copy (no rule took it), and it is on the sweep's list all the same
    const events = [{ type: 4, timestamp: 1000, data: { width: 1280, height: 720, href: 'https://site.test/' } }, { type: 2, timestamp: 1010, data: { node: tree() } }];
    fs.writeFileSync(path.join(rec, 'events.ndjson'), events.map((e) => JSON.stringify(e)).join('\n'));
    prepare(dir, { rules: {}, log: () => {} });
    const originals = JSON.parse(fs.readFileSync(path.join(rec, 'originals.json'), 'utf8')).values;
    assert.ok(fs.readFileSync(path.join(dir, 'film', 'clean', 'screen-0.json'), 'utf8').includes(NEAR_CARD) && originals.some((o) => o.kind === 'card' && o.value === NEAR_CARD));
    assert.ok(!originals.some((o) => /marlow|Lindqvist/.test(o.value)));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the sweep\'s own look: the fraction of a decimal is not a card candidate; the same digits anywhere else are, card check or not', async () => {
  const { collectCandidates } = await import('./prepare-recording.mjs');
  const CARD = '4111111111111111', NEAR = '4111111111111112'; // (the second fails the card check: this look lists it all the same)
  const cards = (...kids) => { const got = []; collectCandidates(el('html', {}, el('body', {}, ...kids)), (kind, value) => { if (kind === 'card') got.push(value); }); return got; };
  assert.deepEqual(cards(el('button', {}, el('div', { class: 'waves-ripple', 'data-scale': `scale(0.${CARD})`, style: `transform: scale(0.${CARD})` }), tx(`Ratio 12.${NEAR}`))), []);
  assert.deepEqual(cards(el('p', { 'data-scale': CARD, title: `Card: ${NEAR}` }, tx(`0. ${CARD} and 4111 1111 1111 1111, 4111-1111-1111-1111, No.${NEAR}`))), [CARD, NEAR, CARD, '4111 1111 1111 1111', '4111-1111-1111-1111', NEAR]);
});

test('prepare: nobody is looked for unasked; asked, the signed-in user is found per site, by a `user` rule or by detection, and said by place', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-prepare-')), rec = path.join(dir, 'recording');
  try {
    fs.mkdirSync(rec, { recursive: true });
    const mail = () => el('html', {}, el('body', {}, el('header', { class: 'topbar' }, el('span', { id: 'user-name' }, tx('Ines Marlow'))), el('p', {}, tx('Ines Marlow wrote to ODA.'))));
    const app = () => el('html', {}, el('body', {}, el('header', {}, el('button', { id: 'user-dropdown' }, el('span', { class: 'who' }, tx('ODA')))), el('h5', {}, tx('Invoice Settings')), el('div', { id: 'invoiceAccountDetailsDiv' }), el('p', {}, tx('Signed in: ODA. Ines Marlow is a customer.')),
      el('table', { id: 'ids' }, el('thead', {}, el('tr', {}, el('th', {}, tx('Field')), el('th', {}, tx('ID')))), el('tbody', {}, el('tr', {}, el('td', {}, tx('Payee Name')), el('td', {}, tx('7755001')))))));
    const ev = (type, timestamp, data, href) => ({ type, timestamp, data, ...(href ? { href } : {}) });
    const events = [ev(4, 1000, { width: 1280, height: 720, href: 'https://mail.site.test/inbox' }), ev(2, 1010, { node: mail() }, 'https://mail.site.test/inbox'), ev(2, 2000, { node: app() }, 'https://app.site.test/keys'), ev(2, 3000, { node: app() }, 'https://app.site.test/keys/edit')];
    fs.writeFileSync(path.join(rec, 'events.ndjson'), events.map((e) => JSON.stringify(e)).join('\n'));
    const clean = (i) => fs.readFileSync(path.join(dir, 'film', 'clean', `screen-${i}.json`), 'utf8');
    const names = () => JSON.parse(fs.readFileSync(path.join(rec, 'originals.json'), 'utf8')).values.filter((o) => o.kind === 'name').map((o) => o.value).sort();
    // no rule: nothing is looked for, nothing is replaced, nothing is listed
    let out = prepare(dir, { rules: {}, log: () => {} });
    assert.deepEqual([out.user, out.users, names()], [false, [], []]);
    assert.ok(clean(0).includes('Ines Marlow') && clean(1).includes('ODA') && clean(1).includes('Invoice Settings') && clean(1).includes('7755001'));
    // asked by name: detection, per site. The mail site's user is found in its header; the product site has no strong evidence, so no one is (its heading is left alone)
    const lines = [];
    out = prepare(dir, { rules: { use: ['user'] }, log: (l) => lines.push(l) });
    assert.deepEqual(out.users.map((u) => [u.host, u.by, u.screen, u.screens]), [['mail.site.test', 'detection', 0, 1], ['app.site.test', 'none', undefined, 0]]);
    assert.ok(clean(0).includes('Jordan Avery wrote to ODA.') && clean(1).includes('Invoice Settings') && clean(1).includes('Ines Marlow is a customer'), 'one site\'s user is not replaced on another site');
    // by rule: the element named on the product site, detection off on the mail site; a column replaced on purpose is listed too
    out = prepare(dir, { rules: { user: [{ host: 'mail.site.test', off: true }, { host: 'app.site.test', selector: '#user-dropdown .who' }], blindColumns: [{ table: '#ids', columns: ['ID'], as: 'series' }] }, log: (l) => lines.push(l) });
    assert.deepEqual(out.users.map((u) => [u.host, u.by, u.screen, u.replacements, u.screens]), [['mail.site.test', 'off', undefined, 0, 0], ['app.site.test', 'rule', 1, 4, 2]]);
    assert.ok(clean(0).includes('Ines Marlow wrote to ODA.') && clean(1).includes('Signed in: Jordan.') && clean(1).includes('"Jordan"') && clean(1).includes('"ID 1"') && !clean(1).includes('7755001'));
    assert.deepEqual(out.blindedColumns.map((b) => [b.screen, b.ok, b.column, b.cells]), [[1, true, 'ID', 1], [2, true, 'ID', 1]]);
    assert.deepEqual(names(), ['ODA']);
    const said = lines.join('\n');
    assert.ok(said.includes('signed-in user on app.site.test: found by rule at screen 1') && said.includes('signed-in user on mail.site.test: not looked for (off)') && said.includes('columns replaced on purpose (blindColumns)') && !said.includes('ODA') && !said.includes('Marlow'));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('prepare writes a clean copy: stand-ins in every screen, originals beside the raw recording only, nothing printed', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-prepare-')), rec = path.join(dir, 'recording');
  try {
    fs.mkdirSync(path.join(rec, 'assets'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'film', 'clean'), { recursive: true });
    fs.writeFileSync(path.join(rec, 'mic.webm'), 'voice'); fs.writeFileSync(path.join(rec, 'mic.json'), '{"t0":1005}');
    fs.writeFileSync(path.join(dir, 'film', 'clean', 'mic.webm'), 'voice');  // a copy an older prepare left: removed (the take is raw)
    fs.writeFileSync(path.join(dir, 'film', 'clean', 'boxes.json'), '{}');     // another tool's file in clean/: left alone
    fs.writeFileSync(path.join(dir, 'film', 'clean', 'pointer.json'), '[]');   // its own, from an older run: rewritten
    fs.writeFileSync(path.join(dir, 'film', 'clean', 'screen-9.json'), '{}');  // a stale screen: removed
    const face = 'https://site.test/img/face.png', logo = 'https://site.test/img/logo.png';
    fs.writeFileSync(path.join(rec, 'assets', 'a1.png'), 'face'); fs.writeFileSync(path.join(rec, 'assets', 'a2.png'), 'logo');
    fs.writeFileSync(path.join(rec, 'assets.json'), JSON.stringify({ [face]: { file: 'a1.png', type: 'image/png' }, [logo]: { file: 'a2.png', type: 'image/png' } }));
    const withPictures = (tree) => { tree.childNodes.at(-1).childNodes.push(el('img', { class: 'avatar', src: face }), el('img', { class: 'logo', src: logo })); return tree; };
    const ev = (type, timestamp, data) => ({ type, timestamp, data });
    const events = [ev(4, 1000, { width: 1280, height: 720, href: 'https://site.test/customers/884120/view?email=' + ORIGINALS.email + '#' + ORIGINALS.key }), ev(2, 1010, { node: withPictures(page()) }), ev(2, 2000, { node: withPictures(more()) }),
      ev(3, 2200, { source: 1, positions: [{ x: 10, y: 20, id: 5, timeOffset: -700 }, { x: 30, y: 40, id: 5, timeOffset: 0 }] })];
    fs.writeFileSync(path.join(rec, 'events.ndjson'), events.map((e) => JSON.stringify(e)).join('\n'));
    const select = (() => { let s; (function go(n) { if (n.attributes?.id === 'payee') s = n; n.childNodes?.forEach(go); })(events[2].data.node); return s; })();
    fs.writeFileSync(path.join(dir, 'rules.json'), JSON.stringify({ use: ['cells', 'avatars', 'links', 'emails', 'phones', 'numbers', 'user'], blind: [{ screen: 1, node: select.id, as: 'company' }, { screen: 1, node: 987654, as: 'name' }], fill: [], chart: [], keep: ['View Details'] }));
    const lines = [];
    const { manifest, applied, user } = prepare(dir, { log: (l) => lines.push(l) });
    assert.equal(manifest.screens.length, 2);
    assert.equal(manifest.screens[0].href, 'https://site.test/customers/-/view'); // the address in the clean copy: no query, no fragment, no id
    assert.equal(user, true);
    assert.deepEqual(manifest.mic, { file: 'mic.webm', t0: 1005 });              // on the events' clock; the take itself stays raw
    assert.deepEqual(applied.map((a) => [a.screen, a.ok, a.node]), [[1, true, select.id], [1, false, 987654]]);
    assert.deepEqual(fs.readdirSync(path.join(dir, 'film', 'clean')).sort(), ['assets', 'boxes.json', 'changed.json', 'manifest.json', 'pointer.json', 'screen-0.json', 'screen-1.json']);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'film', 'clean', 'pointer.json'), 'utf8')), { points: [{ t: 0.5, x: 10, y: 20, screen: 0 }, { t: 1.2, x: 30, y: 40, screen: 1 }], scrolls: [] });
    assert.deepEqual(fs.readdirSync(path.join(dir, 'film', 'clean', 'assets')), ['a2.png']);     // the avatar's file is not kept; the logo's is
    const clean = fs.readdirSync(path.join(dir, 'film', 'clean')).filter((f) => f.endsWith('.json')).map((f) => fs.readFileSync(path.join(dir, 'film', 'clean', f), 'utf8')).join('\n');
    const said = lines.join('\n') + JSON.stringify(applied);
    for (const v of [...Object.values(ORIGINALS), ...Object.values(MORE)]) { assert.ok(!clean.includes(v), 'an original is in the clean copy'); assert.ok(!said.includes(v), 'an original was printed or returned'); }
    for (const part of ['rita', 'quill', 'lindqvist', 'halvorsen', '4,312']) assert.ok(!(clean + said).toLowerCase().includes(part), part);
    assert.ok(clean.includes('Northwind Mutual') && clean.includes('Jordan Avery') && clean.includes('SecretKey-123456'));
    const changed = JSON.parse(fs.readFileSync(path.join(dir, 'film', 'clean', 'changed.json'), 'utf8'));
    assert.deepEqual(Object.keys(changed), ['0', '1']);
    assert.ok(changed[1].some((c) => c.kind === 'blind') && changed[0].every((c) => Object.keys(c).sort().join() === 'id,kind'));
    assert.ok(!fs.existsSync(path.join(dir, 'film', 'clean', 'originals.json')));
    const originals = JSON.parse(fs.readFileSync(path.join(rec, 'originals.json'), 'utf8')).values;
    const has = (kind, value) => originals.some((o) => o.kind === kind && o.value === value);
    assert.ok(has('name', ORIGINALS.name) && has('email', ORIGINALS.email) && has('cell', ORIGINALS.id) && has('company', MORE.second), 'the sweep is told what to look for');
    // a drop run (the sweep proving it can fail) goes elsewhere and leaves the originals list as it was
    const elsewhere = path.join(dir, 'tmp-clean'), before = fs.readFileSync(path.join(rec, 'originals.json'), 'utf8');
    prepare(dir, { out: elsewhere, dropDefault: 3, keepOriginals: true, log: () => {} });
    assert.ok(fs.readFileSync(path.join(elsewhere, 'screen-0.json'), 'utf8').includes('4,312.77')); // default rule 3 is money: left out, the sum is still there
    assert.equal(fs.readFileSync(path.join(rec, 'originals.json'), 'utf8'), before);
    assert.ok(!fs.readFileSync(path.join(dir, 'film', 'clean', 'screen-0.json'), 'utf8').includes('4,312.77'));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
