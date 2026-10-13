import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { writeTutorial } from './tutorial.mjs';
import { EXTENSION_ID } from './extension-id.mjs';
import { STAGE_FILES, applyBrand, brandFile, resolveBrand } from './pipeline.mjs';
import { paths } from '../tools/paths.mjs';
import { CLIPS, IMAGES } from '../film/src/kit/media.ts';
import { withHelper, fakeRunner, record } from './test-helpers.mjs';

const RECORDER = `chrome-extension://${EXTENSION_ID}`, STRANGER = 'chrome-extension://abcdefghabcdefghabcdefghabcdefgh';

test('a recording arrives in <tutorials>/<id>/recording and the tutorial appears as recorded', () => withHelper({}, async ({ home, base, get }) => {
  assert.equal((await fetch(`${base}/health`)).status, 200);
  const post = (body) => fetch(`${base}/session/rec-1/events`, { method: 'POST', body: JSON.stringify(body) });
  assert.equal((await post([{ type: 4, data: { href: 'https://app.site.test/a/b?c=d', width: 800, height: 600 }, timestamp: 1 }])).status, 200);
  assert.equal((await post([{ type: 2, timestamp: 2 }, { type: 3, timestamp: 3 }])).status, 200);
  const lines = fs.readFileSync(path.join(home, 'rec-1', 'recording', 'events.ndjson'), 'utf8').trim().split('\n');
  assert.deepEqual(lines.map((l) => JSON.parse(l).timestamp), [1, 2, 3]);
  // a recording with pauses: its segments, sent at stop
  assert.equal((await fetch(`${base}/session/rec-1/segments`, { method: 'POST', body: JSON.stringify({ segments: [{ from: 1, to: 2 }, { from: 5, to: null }] }) })).status, 200);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(home, 'rec-1', 'recording', 'segments.json'), 'utf8')).segments, [{ from: 1, to: 2 }, { from: 5, to: null }]);
  assert.equal((await fetch(`${base}/session/rec-1/segments`, { method: 'POST', body: JSON.stringify({ segments: [{ from: 'x' }] }) })).status, 400);
  assert.equal((await fetch(`${base}/session/..%2Fx/events`, { method: 'POST', body: '[]' })).status, 400);
  assert.equal((await fetch(`${base}/session/Brands/events`, { method: 'POST', body: '[]' })).status, 400); // reserved
  const from = (origin) => fetch(`${base}/session/rec-1/events`, { method: 'POST', headers: { origin }, body: '[]' });
  assert.equal((await from('https://evil.test')).status, 403); // another web page may not write
  assert.equal((await from('chrome-extension://abcdefghabcdefghabcdefghabcdefgh')).status, 403); // nor may another extension
  assert.equal((await from(RECORDER)).status, 200);
  const list = (await get('/tutorials')).json;
  assert.equal(list.tutorials.length, 1);
  const t = list.tutorials[0];
  assert.deepEqual([t.id, t.state, t.site, t.busy, t.error, t.flags.noMic], ['rec-1', 'recorded', 'app.site.test', null, null, true]);
  assert.ok(typeof list.recorder.lastSeen === 'number'); // the recorder was just heard from
  assert.deepEqual(list.brands, []);
  assert.ok(!fs.existsSync(path.join(home, '..', 'x')));
}));

test('stores an asset once under its hash and maps the url to it', () => withHelper({}, async ({ home, base }) => {
  const put = (url, body, type) => fetch(`${base}/session/abc/asset?url=${encodeURIComponent(url)}`, { method: 'POST', headers: { 'content-type': type }, body });
  assert.equal((await put('https://x.test/a.woff2', 'FONT', 'font/woff2')).status, 200);
  assert.equal((await put('https://x.test/b.woff2', 'FONT', 'font/woff2')).status, 200); // same bytes, second url
  const rec = path.join(home, 'abc', 'recording'), map = JSON.parse(fs.readFileSync(path.join(rec, 'assets.json'), 'utf8'));
  assert.equal(map['https://x.test/a.woff2'].file, map['https://x.test/b.woff2'].file);
  assert.equal(map['https://x.test/a.woff2'].type, 'font/woff2');
  assert.equal(fs.readdirSync(path.join(rec, 'assets')).length, 1);
  assert.equal(fs.readFileSync(path.join(rec, 'assets', map['https://x.test/a.woff2'].file), 'utf8'), 'FONT');
}));

test('asset route: bytes survive, odd extensions become .bin, bad input is refused', () => withHelper({}, async ({ home, base }) => {
  const put = (id, url, body) => fetch(`${base}/session/${id}/asset?url=${encodeURIComponent(url)}`, { method: 'POST', body });
  const bytes = Buffer.from([0, 255, 128, 10, 13, 0xc3, 0x28]); // not valid UTF-8
  assert.equal((await put('abc', 'https://x.test/font?family=A/../../x', bytes)).status, 200);
  const rec = path.join(home, 'abc', 'recording');
  const { file } = JSON.parse(fs.readFileSync(path.join(rec, 'assets.json'), 'utf8'))['https://x.test/font?family=A/../../x'];
  assert.match(file, /^[0-9a-f]{16}\.bin$/);
  assert.deepEqual(fs.readFileSync(path.join(rec, 'assets', file)), bytes);
  assert.equal((await put('abc', 'file:///c:/secret.txt', 'x')).status, 400);
  assert.equal((await put('abc', 'not a url', 'x')).status, 400);
  assert.equal((await put('..%2Fx', 'https://x.test/a.css', 'x')).status, 400);
  assert.equal((await put('abc', 'https://x.test/big.png', Buffer.alloc(20 * 1024 * 1024 + 1))).status, 413);
  assert.equal(fs.readdirSync(path.join(rec, 'assets')).length, 1);
}));

test('appends microphone chunks in order and keeps the first t0', () => withHelper({}, async ({ home, base }) => {
  const put = (q, body) => fetch(`${base}/session/abc/audio?${q}`, { method: 'POST', headers: { 'content-type': 'audio/webm' }, body });
  assert.equal((await put('seq=0&t0=1700000000123', Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))).status, 200);
  assert.equal((await put('seq=1&t0=1700000009999', Buffer.from([0xff, 0x00, 0x80]))).status, 200);
  const rec = path.join(home, 'abc', 'recording');
  assert.deepEqual(fs.readFileSync(path.join(rec, 'mic.webm')), Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0xff, 0x00, 0x80]));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(rec, 'mic.json'), 'utf8')), { t0: 1700000000123 });
  assert.equal((await put('seq=x&t0=1', 'a')).status, 400);
  assert.equal((await put('seq=0&t0=soon', 'a')).status, 400);
}));

test('who may ask: this machine by name, the extension, the helper\'s own pages; never another site', () => withHelper({}, async ({ home, base, srv, get, post }) => {
  record(home, 'rec-1');
  assert.equal((await get('/tutorials')).status, 200);
  assert.equal((await get('/tutorials', { origin: 'https://evil.test' })).status, 403);
  assert.equal((await get('/tutorials', { origin: 'https://evil.test' })).headers.get('access-control-allow-origin'), null);
  assert.equal((await get('/tutorials', { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'no-cors' })).status, 403); // an <img> or <script> on another site
  assert.equal((await get('/tutorials', { 'sec-fetch-site': 'same-origin' })).status, 200);
  assert.equal((await get('/tutorials', { origin: base })).status, 200);
  assert.equal((await post('/tutorials/rec-1/state', { title: 'T' }, { origin: 'https://evil.test' })).status, 403);
  assert.equal((await get('/tutorials')).headers.get('x-content-type-options'), 'nosniff');
  // a name that was pointed at 127.0.0.1 (DNS rebinding): the Host header is not ours
  const status = await new Promise((resolve, reject) => http.get({ host: '127.0.0.1', port: srv.port, path: '/tutorials', headers: { host: 'evil.test' } }, (r) => { r.resume(); resolve(r.statusCode); }).on('error', reject));
  assert.equal(status, 403);
}));

test('ids: a bad one, a reserved one and one that is not there', () => withHelper({}, async ({ home, get, post }) => {
  record(home, 'rec-1');
  for (const bad of ['..%2Fx', '%2e%2e%2f%2e%2e', 'a%2Fb', 'a.b', 'x'.repeat(65), 'Brands', 'brands', '%00']) assert.equal((await get(`/tutorials/${bad}`)).status, 400, bad);
  assert.equal((await get('/tutorials/rec-404')).status, 404);
  assert.equal((await post('/tutorials/rec-404/prepare')).status, 404);
  assert.equal((await get('/tutorials/rec-1/nothing')).status, 404);
  const one = (await get('/tutorials/rec-1')).json;
  assert.equal(one.state, 'recorded');
  assert.equal(one.dir, path.join(home, 'rec-1'));
}));

test('state route: an event with a title; an unknown event, a helper-only event and a wrong-state event are refused', () => withHelper({}, async ({ home, post, get }) => {
  record(home, 'rec-1');
  const r = await post('/tutorials/rec-1/state', { event: 'scripted', title: '  Find your key\n' });
  assert.equal(r.status, 200);
  assert.deepEqual([r.json.state, r.json.title], ['scripted', 'Find your key']);
  assert.equal(JSON.parse(fs.readFileSync(path.join(home, 'rec-1', 'tutorial.json'), 'utf8')).state, 'scripted');
  const unknown = await post('/tutorials/rec-1/state', { event: 'publish' });
  assert.deepEqual([unknown.status, unknown.json.error], [400, 'unknown event publish']);
  assert.equal((await post('/tutorials/rec-1/state', { event: 'voiced' })).status, 400);           // only a narration that compares well does that
  const wrong = await post('/tutorials/rec-1/state', { event: 'done' });
  assert.deepEqual([wrong.status, wrong.json.error], [400, 'done from scripted']);
  assert.equal((await post('/tutorials/rec-1/state', { event: 'retry' })).json.error, 'nothing to retry');
  assert.equal((await post('/tutorials/rec-1/state', {})).status, 400);
  assert.equal((await post('/tutorials/rec-1/state', { title: 'x'.repeat(121) })).status, 400);
  assert.equal((await post('/tutorials/rec-1/state', { brand: 'nobody' })).status, 400);
  assert.equal((await post('/tutorials/rec-1/state', 'not json')).status, 400);
  assert.equal((await post('/tutorials/rec-1/state', '{"title":"' + 'x'.repeat(300 * 1024) + '"}')).status, 413);
  assert.equal((await post('/tutorials/rec-1/state', { event: 'approved' })).json.state, 'approved');
  assert.equal((await post('/tutorials/rec-1/state', { event: 'editScript' })).json.state, 'scripted');
  assert.equal((await get('/tutorials/rec-1')).json.title, 'Find your key');
}));

test('progress: the skill reports a phase, a pass and a note; a state change clears it', () => withHelper({}, async ({ home, post, get }) => {
  record(home, 'rec-1');
  let r = await post('/tutorials/rec-1/progress', { phase: 'checking', pass: 2, note: 'Fixed a shot that cut off the tab list.' });
  assert.deepEqual(r.json.progress, { phase: 'checking', label: 'Checking frames 2/3', pct: 56, note: 'Fixed a shot that cut off the tab list.', at: r.json.progress.at });
  assert.equal((await post('/tutorials/rec-1/progress', { phase: 'nope' })).status, 400);
  assert.equal((await post('/tutorials/rec-1/progress', { phase: 'constructor' })).status, 400); // a name every object has is not a phase
  r = await post('/tutorials/rec-1/progress', { phase: 'render', fraction: 0.5, note: 'x'.repeat(500) });
  assert.deepEqual([r.json.progress.pct, r.json.progress.note.length], [88, 120]);
  assert.equal((await get('/tutorials')).json.tutorials[0].progress.pct, 88);
  assert.equal((await post('/tutorials/rec-1/state', { event: 'scripted', title: 'T' })).json.progress, null);
  await post('/tutorials/rec-1/progress', { phase: 'staging' });
  assert.equal((await post('/tutorials/rec-1/progress', { clear: true })).json.progress, null);
  // new pieces being made in the chat, before staging: a phase like the others, with the builder's note, and no stage busy
  r = await post('/tutorials/rec-1/progress', { phase: 'making', note: 'Building the browser bar' });
  assert.deepEqual([r.status, r.json.busy ?? null, r.json.progress], [200, null, { phase: 'making', label: 'Making new pieces', pct: 3, note: 'Building the browser bar', at: r.json.progress.at }]);
  assert.ok(Number.isFinite(Date.parse(r.json.progress.at)));
  r = await post('/tutorials/rec-1/progress', { phase: 'making', note: 'Building the address field' });
  assert.equal((await get('/tutorials/rec-1')).json.progress.note, 'Building the address field');
  assert.equal((await post('/tutorials/rec-1/progress', { phase: 'shotlist' })).json.progress.pct, 5);
  assert.equal((await post('/tutorials/rec-1/progress', { clear: true })).json.progress, null);
}));

test('archive, reopen and delete: a flag on the state file; delete takes the folder out of the list and refuses while busy', async () => {
  let release;
  const slow = { prepare: () => new Promise((r) => { release = () => r({ code: 0 }); }) };
  await withHelper({ runner: fakeRunner(slow) }, async ({ home, srv, post, get, call }) => {
    const dir = record(home, 'rec-1');
    assert.equal((await post('/tutorials/rec-1/state', { archived: true })).json.archived, true);
    assert.equal((await get('/tutorials')).json.tutorials[0].archived, true);
    assert.equal((await post('/tutorials/rec-1/state', { archived: false })).json.archived, false);
    assert.equal((await post('/tutorials/rec-1/state', { archived: 'yes' })).status, 400);
    // a finished tutorial is hidden like an archived one: reopening it is an event, back to reviewed
    writeTutorial(dir, { ...(await get('/tutorials/rec-1')).json, dir: undefined, state: 'done', archived: true });
    const back = (await post('/tutorials/rec-1/state', { event: 'reopen', archived: false })).json;
    assert.deepEqual([back.state, back.archived], ['reviewed', false]);
    assert.equal((await post('/tutorials/rec-1/state', { event: 'reopen' })).status, 400); // reopen from reviewed
    writeTutorial(dir, { ...back, state: 'recorded' });
    assert.equal((await post('/tutorials/rec-1/state', { title: 'Reset a password' })).json.title, 'Reset a password');
    await post('/tutorials/rec-1/prepare');
    assert.equal((await call('DELETE', '/tutorials/rec-1')).status, 409);
    release(); await srv.idle('rec-1');
    assert.equal((await call('DELETE', '/tutorials/rec-1')).status, 200);
    assert.ok(!fs.existsSync(dir));
    assert.equal((await call('DELETE', '/tutorials/rec-1')).status, 404);
    assert.equal((await call('DELETE', '/tutorials/Brands')).status, 400);
    assert.deepEqual((await get('/tutorials')).json.tutorials, []);
  });
});

test('prepare: answers 202, refuses a second while busy, runs the steps in order and ends recorded with a transcript', async () => {
  const ran = [];
  let release;
  const held = new Promise((r) => { release = r; });
  const runner = fakeRunner({ gestures: async () => { await held; return { code: 0 }; } }, ran);
  await withHelper({ runner }, async ({ home, srv, post, get }) => {
    record(home, 'rec-1', { mic: true });
    assert.equal((await post('/tutorials/rec-1/prepare')).status, 202);
    assert.equal((await get('/tutorials/rec-1')).json.busy, 'prepare');
    const again = await post('/tutorials/rec-1/prepare');
    assert.deepEqual([again.status, again.json.error], [409, 'busy: prepare']);
    assert.equal((await post('/tutorials/rec-1/state', { event: 'scripted' })).status, 409); // nothing moves under a running stage
    release();
    await srv.idle('rec-1');
    const t = (await get('/tutorials/rec-1')).json;
    assert.deepEqual([t.state, t.busy, t.error, t.flags.noMic], ['recorded', null, null, false]);
    assert.deepEqual(ran, ['prepare', 'gestures', 'whisper']);
    const dir = path.join(home, 'rec-1');
    assert.ok(fs.existsSync(path.join(dir, 'transcript', 'mic.json')));                    // in its own folder,
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'recording', 'mic.json'), 'utf8')), { t0: 1 }); // never over the take's start time
    assert.ok(fs.existsSync(path.join(dir, 'film', 'kit', 'GeistVF.woff2')));
    await post('/tutorials/rec-1/state', { event: 'scripted' });
    assert.equal((await post('/tutorials/rec-1/prepare')).status, 409);                      // prepare is for a recording
  });
});

test('prepare with no microphone: an empty transcript and no transcriber run', async () => {
  const ran = [];
  await withHelper({ runner: fakeRunner({}, ran) }, async ({ home, srv, post, get }) => {
    record(home, 'rec-1');
    assert.equal((await post('/tutorials/rec-1/prepare')).status, 202);
    await srv.idle('rec-1');
    assert.deepEqual(ran, ['prepare', 'gestures']);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(home, 'rec-1', 'transcript', 'mic.json'), 'utf8')), { segments: [] });
    assert.equal((await get('/tutorials/rec-1')).json.flags.noMic, true);
  });
});

test('a recording that was paused is not prepared until where the pauses were has arrived', async () => {
  const ran = [];
  await withHelper({ runner: fakeRunner({}, ran) }, async ({ home, base, srv, post, get }) => {
    record(home, 'rec-1');
    const session = (what, body) => fetch(`${base}/session/rec-1/${what}`, { method: 'POST', headers: { origin: RECORDER }, body: JSON.stringify(body) });
    // the recorder's events say it was resumed from one pause; the segments have not come
    assert.equal((await session('events?pauses=1', [{ type: 3, timestamp: 9 }])).status, 200);
    assert.equal((await session('events?pauses=nonsense', [{ type: 3, timestamp: 10 }])).status, 200); // a bad count changes nothing
    assert.equal((await post('/tutorials/rec-1/prepare')).status, 202);
    await srv.idle('rec-1');
    let t = (await get('/tutorials/rec-1')).json;
    assert.deepEqual([t.state, t.error.stage, ran.length], ['recorded', 'prepare', 0]); // nothing was run on it
    assert.match(t.error.message, /^This recording was paused, and where the pauses were has not arrived/);
    assert.ok(!fs.existsSync(path.join(home, 'rec-1', 'film', 'clean')));
    // segments that do not account for the pause (one stretch) are no better
    await session('segments', { segments: [{ from: 1, to: 20 }] });
    await post('/tutorials/rec-1/state', { event: 'retry' });
    await post('/tutorials/rec-1/prepare');
    await srv.idle('rec-1');
    assert.equal((await get('/tutorials/rec-1')).json.error.stage, 'prepare');
    // the recorder gets them through: now it is prepared
    await session('segments', { segments: [{ from: 1, to: 5 }, { from: 8, to: 20 }] });
    await post('/tutorials/rec-1/state', { event: 'retry' });
    await post('/tutorials/rec-1/prepare');
    await srv.idle('rec-1');
    t = (await get('/tutorials/rec-1')).json;
    assert.deepEqual([t.error, ran], [null, ['prepare', 'gestures']]);
  });
});

test('a failed stage keeps the state with the error; a missing transcriber says so; the transcript alone can be run again', async () => {
  let installed = false;
  const base = fakeRunner();
  const runner = async (spec) => (spec.name === 'whisper' && !installed ? { code: null, stdout: '', missing: true } : base(spec));
  await withHelper({ runner }, async ({ home, srv, post, get }) => {
    record(home, 'rec-1', { mic: true });
    await post('/tutorials/rec-1/prepare');
    await srv.idle('rec-1');
    let t = (await get('/tutorials/rec-1')).json;
    assert.deepEqual([t.state, t.busy, t.error], ['recorded', null, { stage: 'transcribe', message: 'transcriber not found' }]);
    assert.ok(fs.existsSync(path.join(home, 'rec-1', 'film', 'clean', 'manifest.json'))); // nothing lost
    installed = true;
    assert.equal((await post('/tutorials/rec-1/state', { event: 'retry' })).json.error, null);
    assert.equal((await post('/tutorials/rec-1/transcribe')).status, 202);
    await srv.idle('rec-1');
    t = (await get('/tutorials/rec-1')).json;
    assert.deepEqual([t.state, t.busy, t.error], ['recorded', null, null]);
  });
  // a step that exits badly: its name and exit code, nothing else
  await withHelper({ runner: fakeRunner({ prepare: () => ({ code: 1, stdout: 'SECRET-PAGE-TEXT' }) }) }, async ({ home, srv, post, get }) => {
    record(home, 'rec-2');
    await post('/tutorials/rec-2/prepare');
    await srv.idle('rec-2');
    const t = (await get('/tutorials/rec-2')).json;
    assert.deepEqual(t.error, { stage: 'prepare', message: 'prepare failed (exit 1)' });
    assert.equal((await post('/tutorials/rec-2/transcribe')).status, 409); // there is no clean copy yet
  });
  // a stage that throws something else: its kind only, never its words
  await withHelper({ runner: async () => { throw new Error('SECRET-PAGE-TEXT'); } }, async ({ home, srv, post, get }) => {
    record(home, 'rec-3');
    await post('/tutorials/rec-3/prepare');
    await srv.idle('rec-3');
    const t = (await get('/tutorials/rec-3')).json;
    assert.equal(t.error.message, 'internal error (Error)');
  });
});

test('a stage left running by a helper that stopped shows as failed', () => withHelper({}, async ({ home, get }) => {
  writeTutorial(record(home, 'rec-1'), { id: 'rec-1', title: null, site: 'app.site.test', brand: null, state: 'voiced', busy: 'render', error: null, flags: { noMic: false }, renders: [], updatedAt: 'x' });
  const t = (await get('/tutorials')).json.tutorials[0];
  assert.deepEqual([t.state, t.busy, t.error], ['voiced', null, { stage: 'render', message: 'the helper stopped during render' }]);
}));

test('rules: a blind rule is written, the scrub runs again, and the answer is the place and the length, never text', async () => {
  const ran = [];
  await withHelper({ runner: fakeRunner({}, ran) }, async ({ home, srv, post, get }) => {
    const dir = record(home, 'rec-1');
    assert.equal((await post('/tutorials/rec-1/rules', { blind: [{ screen: 0, node: 8, as: 'key' }] })).status, 409); // not prepared yet
    await post('/tutorials/rec-1/prepare');
    await srv.idle('rec-1');
    fs.writeFileSync(path.join(dir, 'rules.json'), JSON.stringify({ blind: [{ screen: 0, node: 8, as: 'name' }], keep: ['Paid'], note: 'kept' }));
    ran.length = 0;
    const r = await post('/tutorials/rec-1/rules', { blind: [{ screen: 0, node: 8, as: 'key', label: 'User API Key' }, { screen: 0, node: 77, as: 'name' }], keep: ['Paid', 'Pending'] });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, { applied: [{ screen: 0, node: 8, tag: 'input', length: 17, ok: true }, { screen: 0, node: 77, tag: null, length: null, ok: false }] });
    assert.deepEqual(ran, ['prepare']);
    const rules = JSON.parse(fs.readFileSync(path.join(dir, 'rules.json'), 'utf8'));
    assert.deepEqual(rules.blind, [{ screen: 0, node: 8, as: 'key', label: 'User API Key' }, { screen: 0, node: 77, as: 'name' }]); // the rule for node 8 replaced
    assert.deepEqual(rules.keep, ['Paid', 'Pending']);
    assert.equal(rules.note, 'kept');
    assert.equal((await get('/tutorials/rec-1')).json.busy, null);
    for (const bad of [{ blind: [{ screen: 0, node: 8, as: 'password' }] }, { blind: [{ screen: '0', node: 8, as: 'key' }] }, { blind: 'all' }, { fill: [{ value: '$1.00' }] }, { chart: [{ selector: 'svg', values: ['1'] }] }, { keep: [5] }]) {
      assert.equal((await post('/tutorials/rec-1/rules', bad)).status, 400, JSON.stringify(bad));
    }
    assert.equal((await post('/tutorials/rec-1/rules', '{"keep":["' + 'x'.repeat(300 * 1024) + '"]}')).status, 413);
    // confirmed interface text: an entry must name an element of its screen; it is written, and nothing is scrubbed again
    fs.writeFileSync(path.join(dir, 'film', 'clean', 'screen-0.json'), JSON.stringify({ node: { type: 0, id: 1, childNodes: [{ type: 2, id: 2, tagName: 'body', attributes: {}, childNodes: [{ type: 2, id: 5, tagName: 'label', attributes: {}, childNodes: [{ type: 3, id: 6, textContent: 'Amount' }] }] }] } }));
    ran.length = 0;
    const a = await post('/tutorials/rec-1/rules', { allow: [{ screen: 0, node: 5 }, { screen: 0, node: 6 }, { screen: 0, node: 999 }, { screen: 4, node: 5 }, { screen: 0, node: 5 }] });
    assert.equal(a.status, 200);
    assert.deepEqual(a.json.allowed, [{ screen: 0, node: 5, ok: true, tag: 'label' }, { screen: 0, node: 6, ok: false, tag: null }, { screen: 0, node: 999, ok: false, tag: null }, { screen: 4, node: 5, ok: false, tag: null }, { screen: 0, node: 5, ok: true, tag: 'label' }]);
    assert.deepEqual(ran, [], 'an allowance changes nothing the scrub writes: the scrub is not run for it');
    const after = JSON.parse(fs.readFileSync(path.join(dir, 'rules.json'), 'utf8'));
    assert.deepEqual(after.allow, [{ screen: 0, node: 5 }], 'only the entry that names an element is written, once');
    assert.deepEqual([after.blind, after.keep], [rules.blind, rules.keep]);
    for (const bad of [{ allow: [{ screen: 0, node: 5, kind: 'name' }] }, { allow: [{ screen: 0 }] }, { allow: [{ screen: 0, node: '5' }] }, { allow: 'labels' }]) {
      assert.equal((await post('/tutorials/rec-1/rules', bad)).status, 400, JSON.stringify(bad));
    }
    // pages of other people's text: written, the scrub runs again, and the answer says per screen how much was hidden and what was kept
    ran.length = 0;
    const only = [{ screens: { from: 0, to: 14 }, host: 'mail.site.test', keep: ['.reading', 12] }, { screens: [3, 4], keep: [], all: true }];
    const o = await post('/tutorials/rec-1/rules', { only });
    assert.equal(o.status, 200);
    assert.deepEqual(o.json.only, [{ screen: 0, texts: 12, attributes: 3, pictures: 1, keeps: [{ keep: '.reading', ok: true, matched: 1 }, { keep: 12, ok: true, matched: 1 }] }, { screen: 0, texts: 12, attributes: 3, pictures: 1, keeps: [] }]);
    assert.deepEqual(ran, ['prepare']);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'rules.json'), 'utf8')).only, only);
    for (const bad of [{ only: [{ keep: '.reading' }] }, { only: [{ screens: [0, 14.5], keep: [] }] }, { only: [{ screens: { from: 5, to: 1 }, keep: [] }] }, { only: [{ screens: 3, keep: [] }] }, { only: [{ host: 'mail site', keep: [] }] },
      { only: [{ keep: [], all: 'yes' }] }, { only: [{ keep: [{}] }] }, { only: [{ keep: [], except: ['.x'] }] }, { only: [{}] }]) {
      assert.equal((await post('/tutorials/rec-1/rules', bad)).status, 400, JSON.stringify(bad));
    }
    // rules a tutorial switches on by name, who is signed in, columns to replace: checked, written, the scrub runs again
    ran.length = 0;
    const sw = await post('/tutorials/rec-1/rules', { use: ['cells', 'emails', 'cells'], user: [{ host: 'mail.site.test', off: true }, { host: 'app.site.test', selector: '#user .name' }], blindColumns: [{ table: '#map', columns: ['ID'], as: 'series', label: 'ID' }] });
    assert.equal(sw.status, 200);
    assert.deepEqual(sw.json.users, [{ host: 'mail.site.test', by: 'off', replacements: 0, screens: 0 }, { host: 'app.site.test', by: 'rule', screen: 0, node: 5, replacements: 3, screens: 1 }]);
    assert.deepEqual(sw.json.blindedColumns, [{ screen: 0, ok: true, table: 4, column: 'ID', cells: 2 }]);
    assert.deepEqual(ran, ['prepare']);
    await post('/tutorials/rec-1/rules', { user: { host: 'APP.site.test', screen: 0, node: 5 } }); // one entry per site: the new one replaces the old
    const switched = JSON.parse(fs.readFileSync(path.join(dir, 'rules.json'), 'utf8'));
    assert.deepEqual([switched.use, switched.user, switched.blindColumns], [['cells', 'emails'], [{ off: true, host: 'mail.site.test' }, { host: 'APP.site.test', screen: 0, node: 5 }], [{ table: '#map', columns: ['ID'], as: 'series', label: 'ID' }]]);
    for (const bad of [{ use: ['everything'] }, { use: 'cells' }, { user: { selector: '.who', node: 3 } }, { user: { node: 3 } }, { user: { off: 'yes' } }, { user: { off: true, selector: '.who' } }, { user: [{ name: 'Rita Quill' }] },
      { blindColumns: [{ table: '#map', columns: ['ID'] }] }, { blindColumns: [{ table: { near: 'ID' }, columns: ['ID'], as: 'series' }] }, { blindColumns: [{ table: '#map', columns: ['ID'], as: 'password' }] }]) {
      assert.equal((await post('/tutorials/rec-1/rules', bad)).status, 400, JSON.stringify(bad));
    }
    const all = [{ host: 'mail.site.test', screens: { from: 0, to: 14 }, selector: '.row .from', as: 'series', label: 'Sender' }, { selector: '.face', as: 'picture' }];
    const ba = await post('/tutorials/rec-1/rules', { blindAll: all });
    assert.deepEqual([ba.status, ba.json.blindAll, JSON.parse(fs.readFileSync(path.join(dir, 'rules.json'), 'utf8')).blindAll], [200, [{ screen: 0, selector: '.row .from', matched: 3, replaced: 2 }, { screen: 0, selector: '.face', matched: 3, replaced: 2 }], all]);
    for (const bad of [{ blindAll: [{ selector: '.x' }] }, { blindAll: [{ selector: '.x', as: 'everything' }] }, { blindAll: [{ as: 'name' }] }, { blindAll: [{ selector: '.x', as: 'name', screens: 3 }] }, { blindAll: [{ selector: '.x', as: 'name', node: 4 }] }])
      assert.equal((await post('/tutorials/rec-1/rules', bad)).status, 400, JSON.stringify(bad));
    const { OPT_IN } = await import('../tools/scrub.mjs');
    for (const name of Object.keys(OPT_IN)) assert.equal((await post('/tutorials/rec-1/rules', { use: [name] })).status, 200, name); // the helper knows every name the scrub does
    // columns kept on purpose: written, the scrub runs again, and the answer says which columns of which table were kept
    ran.length = 0;
    const columns = [{ screen: 0, table: { near: 'Title' }, columns: ['Title', 'API name'] }, { table: '#map', columns: ['Title'] }, { table: 12, columns: ['Title'] }];
    const k = await post('/tutorials/rec-1/rules', { keepColumns: columns });
    assert.equal(k.status, 200);
    assert.deepEqual(k.json.kept, [{ screen: 0, ok: true, table: 4, column: 'Title', cells: 2 }, { screen: 0, ok: true, table: 4, column: 'API name', cells: 2 }, { screen: 0, ok: true, table: 4, column: 'Title', cells: 2 }, { screen: 0, ok: true, table: 4, column: 'Title', cells: 2 }]);
    assert.deepEqual(ran, ['prepare']);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'rules.json'), 'utf8')).keepColumns, columns);
    for (const bad of [{ keepColumns: [{ table: '#map' }] }, { keepColumns: [{ table: '#map', columns: [] }] }, { keepColumns: [{ table: {}, columns: ['Title'] }] }, { keepColumns: [{ columns: ['Title'] }] },
      { keepColumns: [{ table: '#map', columns: ['Title'], all: true }] }, { keepColumns: [{ screen: '0', table: '#map', columns: ['Title'] }] }, { keepColumns: [{ table: '#map', columns: [5] }] }, { keepColumns: [{ table: { near: 'Title' }, columns: ['Title'] }] }]) {
      assert.equal((await post('/tutorials/rec-1/rules', bad)).status, 400, JSON.stringify(bad));
    }
  });
});

test('elements: what is in a screen or a region of it, from the clean copy, cut at 40 characters', () => withHelper({}, async ({ home, srv, post, get }) => {
  record(home, 'rec-1');
  assert.equal((await get('/tutorials/rec-1/elements?screen=0')).status, 409); // not prepared yet
  await post('/tutorials/rec-1/prepare');
  await srv.idle('rec-1');
  const all = (await get('/tutorials/rec-1/elements?screen=0')).json;
  assert.equal(all.measured, true);
  assert.deepEqual(all.elements.map((e) => [e.node, e.tag, e.role, e.text]), [[4, 'h1', 'heading', 'API Keys'], [6, 'button', 'button', 'Copy'], [8, 'input', 'field', 'UserAPIKey-123456'], [9, 'p', 'text', 'A paragraph that is longer than forty ch']]);
  assert.deepEqual(all.elements[1].box, { x: 600, y: 100, w: 80, h: 30 });
  const some = (await get('/tutorials/rec-1/elements?screen=0&x=0&y=90&w=700&h=50')).json;
  assert.deepEqual(some.elements.map((e) => e.node), [6, 8]);
  assert.equal((await get('/tutorials/rec-1/elements?screen=5')).status, 404);
  for (const bad of ['screen=..%2F..%2Frecording%2Fevents', 'screen=0.5', 'screen=-1', 'screen=0&x=1', 'screen=0&x=a&y=0&w=1&h=1', '']) assert.equal((await get(`/tutorials/rec-1/elements?${bad}`)).status, 400, bad);
  fs.rmSync(path.join(home, 'rec-1', 'film', 'clean', 'layout.json'));
  assert.equal((await get('/tutorials/rec-1/elements?screen=0&x=0&y=0&w=10&h=10')).status, 409); // nothing measured to judge a region by
  assert.equal((await get('/tutorials/rec-1/elements?screen=0')).json.measured, false);
}));

test('the recorder\'s heartbeat is remembered', () => withHelper({}, async ({ post, get }) => {
  assert.equal((await get('/tutorials')).json.recorder.lastSeen, null);
  const before = Date.now();
  assert.equal((await post('/recorder/ping', null, { origin: RECORDER })).status, 200);
  assert.ok((await get('/tutorials')).json.recorder.lastSeen >= before);
}));

test('the recorder files are copied into <tutorials>/Recorder, whole, and the folder is reserved', () => withHelper({}, async ({ home, post, get }) => {
  const r = await post('/recorder/install');
  assert.equal(r.status, 200);
  assert.equal(r.json.dir, path.join(home, 'Recorder'));
  for (const f of ['manifest.json', 'popup.html', 'popup.css', 'state.mjs', 'worker.js', 'bridge.js', 'mic.html', 'icons/icon-16.png', 'icons/icon-32.png', 'icons/icon-48.png', 'icons/icon-128.png', 'icons/icon-rec-16.png', 'icons/icon-rec-32.png']) assert.ok(fs.existsSync(path.join(home, 'Recorder', f)), f);
  assert.ok(!fs.existsSync(path.join(home, 'Recorder', 'state.test.mjs')));
  assert.equal((await post('/recorder/install')).status, 200); // again: replaced whole
  fs.mkdirSync(path.join(home, 'Recorder', 'recording'), { recursive: true });
  assert.ok(!(await get('/tutorials')).json.tutorials.some((t) => t.id === 'Recorder'));
  assert.equal((await post('/tutorials/Recorder/state', { title: 'x' })).status, 400);
}));

test('the plugin\'s own pages are served from their folders and nothing outside them', () => withHelper({}, async ({ get }) => {
  assert.equal((await get('/fixture/keys.html')).status, 200);
  assert.equal((await get('/recorder/page.js')).status, 200);
  for (const out of ['/fixture/..%2F..%2Fpackage.json', '/fixture/%2e%2e/%2e%2e/package.json', '/fixture/..%5C..%5Cpackage.json', '/recorder/..%2Fhelper%2Fserver.mjs', '/fixture/', '/fixture/nothing.html', '/fixture/%00']) {
    assert.equal((await get(out)).status, 404, out);
  }
}));

// ── who is asking (security review of the first helper commit) ──

test('the recorder is one extension, by id: it may use its own routes and nothing else; any other extension or site is refused everywhere', () => withHelper({}, async ({ home, srv, base, call }) => {
  record(home, 'rec-1');
  await call('POST', '/tutorials/rec-1/prepare');
  await srv.idle('rec-1');
  fs.mkdirSync(path.join(home, 'rec-1', 'out'), { recursive: true });
  const recorderRoutes = [['GET', '/health'], ['POST', '/recorder/ping'], ['POST', '/session/rec-9/events', '[]'], ['POST', '/session/rec-9/audio?seq=0&t0=1', 'a'], ['POST', '/session/rec-9/asset?url=https%3A%2F%2Fx.test%2Fa.css', 'a'], ['POST', '/session/rec-9/segments', '{"segments":[{"from":1,"to":2}]}']];
  const others = [['GET', '/tutorials'], ['GET', '/tutorials/rec-1'], ['POST', '/tutorials/rec-1/state', '{"title":"T"}'], ['POST', '/tutorials/rec-1/prepare'], ['POST', '/tutorials/rec-1/rules', '{}'],
    ['GET', '/tutorials/rec-1/elements?screen=0'], ['GET', '/tutorials/rec-1/narration'], ['POST', '/tutorials/rec-1/narration', 'a', { 'content-type': 'audio/mpeg' }], ['POST', '/tutorials/rec-1/time'],
    ['GET', '/tutorials/rec-1/page'], ['GET', '/page/narration.js'], ['GET', '/review/rec-1/'], ['GET', '/review/rec-1/api/videos'], ['POST', '/review/rec-1/api/notes', '{}', { 'content-type': 'application/json' }],
    ['GET', '/fixture/keys.html'], ['GET', '/recorder/page.js'], ['POST', '/tutorials/rec-1/measure'], ['POST', '/tutorials/rec-1/stills', '{}'], ['POST', '/tutorials/rec-1/sweep'], ['POST', '/tutorials/rec-1/render'], ['GET', '/brands'], ['POST', '/brands/resolve', '{"id":"rec-1"}'],
    ['POST', '/tutorials/rec-1/progress', '{"phase":"staging"}'], ['DELETE', '/tutorials/rec-1'], ['POST', '/recorder/install'],
    ['POST', '/review/rec-1/api/send'], ['POST', '/review/rec-1/api/approve'], ['POST', '/requests/1/done']];
  const ask = (origin, [method, url, body, headers = {}]) => call(method, url, body ?? null, { ...headers, ...(origin ? { origin } : {}) });
  for (const route of [...recorderRoutes, ...others]) {
    for (const origin of [STRANGER, 'https://evil.test', 'chrome-extension://' + EXTENSION_ID + 'x', 'null']) {
      const r = await ask(origin, route);
      assert.equal(r.status, 403, `${origin} ${route[0]} ${route[1]}`);
      assert.equal(r.headers.get('access-control-allow-origin'), null);
    }
  }
  for (const route of recorderRoutes) {
    const r = await ask(RECORDER, route);
    assert.equal(r.status, 200, `recorder ${route[0]} ${route[1]}`);
    assert.equal(r.headers.get('access-control-allow-origin'), RECORDER);
  }
  for (const route of others) {
    const r = await ask(RECORDER, route);
    assert.equal(r.status, 403, `recorder ${route[0]} ${route[1]}`);
    assert.equal(r.headers.get('access-control-allow-origin'), null);
  }
  // the helper's own pages and a caller with no Origin (the panel, the skill, tools) reach the rest
  for (const origin of [base, null]) for (const route of [['GET', '/tutorials'], ['GET', '/tutorials/rec-1'], ['GET', '/tutorials/rec-1/page'], ['GET', '/review/rec-1/api/videos']]) assert.equal((await ask(origin, route)).status, 200, `${origin} ${route[1]}`);
  assert.equal(JSON.parse(fs.readFileSync(path.join(home, 'rec-1', 'tutorial.json'), 'utf8')).title, null); // nothing a stranger sent was done
}));

test('a developer\'s own build of the recorder is trusted by its id when the helper is told it', () => withHelper({ extensionId: 'abcdefghabcdefghabcdefghabcdefgh' }, async ({ post }) => {
  assert.equal((await post('/recorder/ping', null, { origin: STRANGER })).status, 200);
  assert.equal((await post('/recorder/ping', null, { origin: RECORDER })).status, 403);
}));

// ── narration ──

const SCRIPT = ['# T: script', '', '| # | Narration | On screen |', '|---|---|---|', '| 0 | (no narration) | The title |', '| 1 | Your key is on the Keys page. | |', '| 2 | Select Copy to copy it. | |', '| 3 | And that is how you copy your key. | |', ''].join('\n');
const heard = (text) => ({ args }) => {
  const out = args[args.indexOf('--output_dir') + 1], input = args.find((a) => /\.(webm|mp3)$/.test(a));
  let at = 0;
  fs.writeFileSync(path.join(out, path.basename(input, path.extname(input)) + '.json'), JSON.stringify({ segments: [{ words: text.split(' ').map((word) => ({ word: ' ' + word, start: (at += 0.3) - 0.3, end: at - 0.05 })) }] }));
  return { code: 0 };
};
const AS_WRITTEN = 'Your key is on the Keys page. Select Copy to copy it. And that is how you copy your key.';
/** a tutorial with an approved script */
async function approved(home, post) {
  const dir = record(home, 'rec-1');
  fs.writeFileSync(path.join(dir, 'script.md'), SCRIPT);
  await post('/tutorials/rec-1/state', { event: 'scripted', title: 'Copy your key' });
  await post('/tutorials/rec-1/state', { event: 'approved' });
  return dir;
}
const audio = (post, body = Buffer.from('ID3 not really audio'), type = 'audio/mpeg') => post('/tutorials/rec-1/narration', body, { 'content-type': type });

test('narration: a take that says the script is transcribed, compared, timed, and the tutorial is voiced', async () => {
  const ran = [];
  await withHelper({ runner: fakeRunner({ whisper: heard(AS_WRITTEN) }, ran) }, async ({ home, srv, post, get }) => {
    const dir = await approved(home, post);
    const r = await audio(post, Buffer.from('take one'), 'audio/mpeg; codecs=mp3');
    assert.deepEqual([r.status, r.json.busy], [202, 'transcribe']);
    await srv.idle('rec-1');
    const t = (await get('/tutorials/rec-1')).json;
    assert.deepEqual([t.state, t.busy, t.error], ['voiced', null, null]);
    assert.deepEqual(ran, ['ffprobe', 'whisper', 'timing']);
    const nar = path.join(dir, 'film', 'narration');
    assert.equal(fs.readFileSync(path.join(nar, 'upload.mp3'), 'utf8'), 'take one');           // a fixed name, inside film/narration
    assert.equal(fs.readFileSync(path.join(nar, 'narration.mp3'), 'utf8'), 'take one');
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(nar, 'compare.json'), 'utf8')), { ok: true, lines: 3, differs: [], missing: [], extra: [] });
    const view = (await get('/tutorials/rec-1/narration')).json;
    assert.deepEqual(view.lines, ['Your key is on the Keys page.', 'Select Copy to copy it.', 'And that is how you copy your key.']);
    assert.deepEqual([view.narration, view.compare.ok, view.timing.length, view.brand], [true, true, 3, null]);
    // a new take on a voiced tutorial: another type is converted, and it is voiced again
    ran.length = 0;
    assert.equal((await audio(post, Buffer.from('take two'), 'audio/wav')).status, 202);
    await srv.idle('rec-1');
    assert.deepEqual(ran, ['ffprobe', 'ffmpeg', 'whisper', 'timing']);
    assert.ok(!fs.existsSync(path.join(nar, 'upload.mp3')));
    assert.equal(fs.readFileSync(path.join(nar, 'upload.wav'), 'utf8'), 'take two');
  });
});

test('narration: a line said differently is named, the tutorial stays approved, and the take can be used anyway', async () => {
  const said = 'Your key is on the Keys page. Select Copy and then paste it. And that is how you copy your key.';
  await withHelper({ runner: fakeRunner({ whisper: heard(said) }) }, async ({ home, srv, post, get }) => {
    const dir = await approved(home, post);
    assert.equal((await audio(post)).status, 202);
    await srv.idle('rec-1');
    const t = (await get('/tutorials/rec-1')).json;
    assert.deepEqual([t.state, t.busy, t.error], ['approved', null, { stage: 'time', message: '1 line differs from the script' }]);
    assert.ok(!fs.existsSync(path.join(dir, 'film', 'narration', 'timing.json')));               // named before timing
    const view = (await get('/tutorials/rec-1/narration')).json;
    assert.equal(view.compare.ok, false);
    assert.deepEqual(view.compare.differs.map((d) => [d.line, d.text]), [[1, 'Select Copy to copy it.']]);
    assert.match(view.compare.differs[0].heard, /then paste/);
    assert.equal((await post('/tutorials/rec-1/time')).status, 202);
    await srv.idle('rec-1');
    const after = (await get('/tutorials/rec-1')).json;
    assert.deepEqual([after.state, after.error], ['voiced', null]);
    assert.ok(fs.existsSync(path.join(dir, 'film', 'narration', 'timing.json')));
  });
});

test('narration: what is refused', async () => {
  await withHelper({ runner: fakeRunner({ ffprobe: () => ({ code: 1, stdout: '' }) }) }, async ({ home, srv, post, get }) => {
    record(home, 'rec-1');
    assert.equal((await audio(post)).status, 409);                                                  // recorded: no script approved
    const dir = await approved(home, post);
    for (const type of ['application/octet-stream', 'video/mp4', 'text/html', 'multipart/form-data; boundary=x', '']) assert.equal((await audio(post, Buffer.from('x'), type)).status, 415, type);
    assert.equal((await audio(post, Buffer.alloc(0))).status, 400);
    assert.equal((await audio(post, Buffer.alloc(50 * 1024 * 1024 + 1))).status, 413);
    assert.equal((await post('/tutorials/rec-1/time')).status, 409);                                // nothing to time
    assert.deepEqual(fs.existsSync(path.join(dir, 'film', 'narration')) ? fs.readdirSync(path.join(dir, 'film', 'narration')) : [], []);
    assert.equal((await audio(post, Buffer.from('<html>not audio</html>'))).status, 202);           // claims to be audio, is not
    await srv.idle('rec-1');
    const t = (await get('/tutorials/rec-1')).json;
    assert.deepEqual([t.state, t.error], ['approved', { stage: 'transcribe', message: 'not an audio file' }]);
    assert.ok(!fs.existsSync(path.join(dir, 'film', 'narration', 'narration.mp3')));
    assert.equal((await post('/tutorials/..%2Frec-1/narration', 'x', { 'content-type': 'audio/mpeg' })).status, 400);
  });
});

test('the local page: the narration section, its files, and the voice of the tutorial\'s brand', () => withHelper({}, async ({ home, post, get }) => {
  await approved(home, post);
  fs.mkdirSync(path.join(home, 'Brands', 'fixture-co'), { recursive: true });
  fs.writeFileSync(path.join(home, 'Brands', 'fixture-co', 'brand.json'), JSON.stringify({ name: 'Fixture Co', mark: null, voice: { name: 'A Voice', model: 'v0', speed: 1, stability: 50, similarity: 75 }, sites: ['app.site.test'] }));
  const page = await get('/tutorials/rec-1/page');
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /text\/html/);
  assert.match(page.headers.get('content-security-policy'), /default-src 'none'/);
  for (const part of ['id="copy"', 'https://elevenlabs.io/app/speech-synthesis/text-to-speech', 'id="voice"', 'type="file"', '/page/narration.js']) assert.ok(page.text.includes(part), part);
  assert.equal((await get('/page/narration.js')).status, 200);
  assert.equal((await get('/page/narration.css')).status, 200);
  for (const out of ['/page/..%2Fserver.mjs', '/page/%2e%2e/tutorial.mjs', '/page/..%5Cserver.mjs', '/page/']) assert.equal((await get(out)).status, 404, out);
  const view = (await get('/tutorials/rec-1/narration')).json;
  assert.deepEqual(view.brand, { name: 'Fixture Co', voice: { name: 'A Voice', model: 'v0', speed: 1, stability: 50, similarity: 75 } });
  assert.deepEqual([view.narration, view.compare, view.timing, view.title], [false, null, null, 'Copy your key']);
  assert.equal((await get('/tutorials/rec-404/page')).status, 404);
}));

test('which brand: the one set, else the only one, else none; the site a tutorial was recorded on picks nothing', () => {
  const a = { id: 'a', sites: ['one.test'] }, b = { id: 'b', sites: ['two.test'] };
  const t = (site, brand = null) => ({ site, brand });
  assert.equal(resolveBrand(t('two.test', 'a'), [a, b]), a);                       // set wins
  assert.equal(resolveBrand(t('two.test'), [a, b]), null);                         // a brand that lists the site (an older brand.json) is not picked: asked for in chat
  assert.equal(resolveBrand(t('two.test'), [a, b], { 'two.test': 'a' }), null);    // nor one "last used for the site"
  assert.equal(resolveBrand(t('other.test'), [a]), a);                             // exactly one brand
  assert.equal(resolveBrand(t('two.test', 'gone'), [a, b]), null);                 // a brand that is no longer there: falls through
  assert.equal(resolveBrand(t('two.test', 'gone'), [a]), a);
  assert.equal(resolveBrand(t('x.test'), []), null);                               // no brand at all: a film still builds
});

test('brands/resolve: with two brands and none set the film gets none; the one set on the tutorial is the one copied', () => withHelper({}, async ({ home, post }) => {
  await approved(home, post);
  for (const id of ['one-co', 'two-co']) { fs.mkdirSync(path.join(home, 'Brands', id), { recursive: true }); fs.writeFileSync(path.join(home, 'Brands', id, 'brand.json'), JSON.stringify({ name: id, mark: null, sites: ['app.site.test'] })); }
  assert.equal((await post('/brands/resolve', { id: 'rec-1', lastBySite: { 'app.site.test': 'one-co' } })).json.brand, null);
  assert.equal((await post('/tutorials/rec-1/state', { brand: 'two-co' })).status, 200);
  assert.equal((await post('/brands/resolve', { id: 'rec-1' })).json.brand, 'two-co');
}));

test('a brand\'s own stage: its picture or clip is copied with the brand, and only a plain file of the brand\'s folder is', () => withHelper({}, async ({ home }) => {
  const brands = path.join(home, 'Brands'), dir = path.join(brands, 'fixture-co'), P = paths(path.join(home, 'rec-9'));
  fs.mkdirSync(path.join(dir, 'sub'), { recursive: true });
  for (const f of ['wall.png', 'loop.mp4', 'notes.txt', 'mark.svg', 'sub/deep.png']) fs.writeFileSync(path.join(dir, f), f);
  fs.writeFileSync(path.join(brands, 'outside.png'), 'not the brand\'s');
  const brand = (stage) => ({ id: 'fixture-co', name: 'Fixture Co', mark: null, stage });
  assert.equal(brandFile(dir, 'wall.png'), path.join(dir, 'wall.png')); assert.equal(brandFile(dir, 'loop.mp4'), path.join(dir, 'loop.mp4'));
  // each way out of the folder, each kind of address, each file the film cannot show
  const refused = { '../outside.png': /leaves/, '..\\outside.png': /leaves/, 'sub/../../outside.png': /leaves/, 'sub/deep.png': /plain file name/, [path.join(brands, 'outside.png')]: /address|absolute/, '/etc/wall.png': /absolute/, '\\wall.png': /absolute/,
    'C:\\Users\\wall.png': /drive/, 'C:wall.png': /drive/, 'https://x.test/wall.png': /address/, 'file:///wall.png': /address/, '//x.test/wall.png': /address/, '\\\\host\\share\\wall.png': /address/, 'data:image/png;base64,AAAA': /address/,
    'wall..png': /plain file name/, '.wall.png': /plain file name/, 'wall.png ': /plain file name/, 'notes.txt': /a picture or a clip/, 'mark.svg': /a picture or a clip/, 'wall.gif': /a picture or a clip/, 'gone.png': /missing/, sub: /a picture or a clip/, '': /not a file name/ };
  for (const [name, why] of Object.entries(refused)) assert.throws(() => brandFile(dir, name), (e) => why.test(e.message) && !e.message.includes('x.test'), name);
  for (const bad of [null, 7, ['wall.png'], { file: 'wall.png' }]) assert.throws(() => brandFile(dir, bad), /not a file name/);
  // a link out of the folder is not followed (where the machine lets a test make one)
  let linked = false;
  try { fs.symlinkSync(path.join(brands, 'outside.png'), path.join(dir, 'link.png')); linked = true; } catch { /* no right to make links here */ }
  if (linked) assert.throws(() => brandFile(dir, 'link.png'), /not a file/);
  // applied: the file is in the film's brand folder beside brand.json, which still names it plainly
  assert.deepEqual(applyBrand(P, brands, brand({ move: 'image', file: 'wall.png', tone: 'dark' })), { brand: 'fixture-co' });
  assert.deepEqual(fs.readdirSync(P.brand).sort(), ['brand.json', 'wall.png']);
  assert.equal(JSON.parse(fs.readFileSync(path.join(P.brand, 'brand.json'), 'utf8')).stage.file, 'wall.png');
  // a stage with no file copies none; a refused one leaves the film's brand as it was
  applyBrand(P, brands, brand({ move: 'field', colour: '#102040', tone: 'dark' }));
  assert.deepEqual(fs.readdirSync(P.brand), ['brand.json']);
  assert.throws(() => applyBrand(P, brands, brand({ move: 'image', file: '../outside.png' })), /leaves the brand's folder/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(P.brand, 'brand.json'), 'utf8')).stage.move, 'field');
  // the film's own check allows the same kinds of file and no others
  assert.deepEqual([...IMAGES, ...CLIPS], STAGE_FILES);
}));

// ── build ──

/** a voiced tutorial with a beat file */
async function voiced(home, srv, post) {
  const dir = record(home, 'rec-1');
  fs.writeFileSync(path.join(dir, 'script.md'), SCRIPT);
  await post('/tutorials/rec-1/prepare');
  await srv.idle('rec-1');
  await post('/tutorials/rec-1/state', { event: 'scripted', title: 'Copy your key' });
  await post('/tutorials/rec-1/state', { event: 'approved' });
  await audio(post);
  await srv.idle('rec-1');
  fs.writeFileSync(path.join(dir, 'film', 'beats.json'), JSON.stringify({ version: 1, title: 'Copy your key', nodes: {}, beats: [] }));
  return dir;
}

test('build: measure (and time again), stills, sweep, then render to the next free name; the first render makes it built', async () => {
  const ran = [];
  await withHelper({ runner: fakeRunner({ whisper: heard(AS_WRITTEN) }, ran) }, async ({ home, srv, post, get }) => {
    const dir = record(home, 'rec-1');
    fs.writeFileSync(path.join(dir, 'script.md'), SCRIPT);
    await post('/tutorials/rec-1/prepare');
    await srv.idle('rec-1');
    for (const what of ['measure', 'sweep', 'render']) assert.equal((await post(`/tutorials/rec-1/${what}`)).status, 409, what); // recorded: nothing to build
    await post('/tutorials/rec-1/state', { event: 'scripted', title: 'Copy your key' });
    await post('/tutorials/rec-1/state', { event: 'approved' });
    await audio(post);
    await srv.idle('rec-1');
    assert.equal((await get('/tutorials/rec-1')).json.state, 'voiced');
    assert.equal((await post('/tutorials/rec-1/measure')).json.error, 'no beat file yet');
    fs.writeFileSync(path.join(dir, 'film', 'beats.json'), JSON.stringify({ version: 1, title: 'Copy your key', nodes: {}, beats: [] }));
    ran.length = 0;
    assert.equal((await post('/tutorials/rec-1/measure')).status, 202);
    await srv.idle('rec-1');
    assert.deepEqual(ran, ['measure', 'timing']);                                   // timed again now that there is a beat file
    for (const bad of [{}, { frames: 'all' }, { frames: [1.5] }, { frames: [-1] }, { frames: [0], every: 2 }, { frames: Array.from({ length: 241 }, (_, i) => i) }]) assert.equal((await post('/tutorials/rec-1/stills', bad)).status, 400, JSON.stringify(bad));
    assert.equal((await post('/tutorials/rec-1/stills', { frames: [0, 90], moments: true })).status, 202);
    await srv.idle('rec-1');
    assert.deepEqual(ran.slice(2), ['stills']);
    assert.equal((await post('/tutorials/rec-1/render')).json.error, 'sweep first');
    assert.equal((await post('/tutorials/rec-1/sweep')).status, 202);
    await srv.idle('rec-1');
    let t = (await get('/tutorials/rec-1')).json;
    assert.deepEqual([t.sweep.ok, t.sweep.fails, t.error], [true, 0, null]);
    assert.match(fs.readFileSync(path.join(dir, 'out', 'sweep.txt'), 'utf8'), /SWEEP PASSED/);
    fs.writeFileSync(path.join(dir, 'out', 'v3.mp4'), 'an older film');
    fs.writeFileSync(path.join(dir, 'out', 'v7-first.mp4'), 'another');
    assert.equal((await post('/tutorials/rec-1/render')).status, 202);
    await srv.idle('rec-1');
    t = (await get('/tutorials/rec-1')).json;
    assert.deepEqual([t.state, t.renders, t.error], ['built', ['v8.mp4'], null]);     // one past the highest number in use
    assert.equal(fs.readFileSync(path.join(dir, 'out', 'v3.mp4'), 'utf8'), 'an older film');
    assert.equal((await post('/tutorials/rec-1/render')).status, 202);                // again: it stays built
    await srv.idle('rec-1');
    t = (await get('/tutorials/rec-1')).json;
    assert.deepEqual([t.state, t.renders], ['built', ['v8.mp4', 'v9.mp4']]);
    // the film changed since the sweep passed: sweep again before a render
    const later = new Date(Date.now() + 60 * 1000);
    fs.utimesSync(path.join(dir, 'film', 'beats.json'), later, later);
    assert.equal((await post('/tutorials/rec-1/render')).json.error, 'sweep again: the film changed since it passed');
  });
});

test('build: a sweep that fails is recorded with its count and blocks the render', async () => {
  const runner = fakeRunner({ whisper: heard(AS_WRITTEN), sweep: () => ({ code: 1, stdout: 'FAIL  screen 0: an original value would show in a frame:\n      node 8  value  (a token, 24 characters)\nSWEEP FAILED\n' }) });
  await withHelper({ runner }, async ({ home, srv, post, get }) => {
    await voiced(home, srv, post);
    assert.equal((await post('/tutorials/rec-1/sweep')).status, 202);
    await srv.idle('rec-1');
    const t = (await get('/tutorials/rec-1')).json;
    assert.deepEqual([t.state, t.sweep.ok, t.sweep.fails, t.error], ['voiced', false, 1, { stage: 'sweep', message: 'sweep failed: 1 place (out/sweep.txt names them by node)' }]);
    const r = await post('/tutorials/rec-1/render');
    assert.deepEqual([r.status, r.json.error], [409, 'sweep failed']);
  });
  // a sweep that did not get as far as a verdict is a broken stage, not a result
  await withHelper({ runner: fakeRunner({ whisper: heard(AS_WRITTEN), sweep: () => ({ code: 1, stdout: 'FAIL  could not rebuild the screens: Error\n' }) }) }, async ({ home, srv, post, get }) => {
    await voiced(home, srv, post);
    await post('/tutorials/rec-1/sweep');
    await srv.idle('rec-1');
    const t = (await get('/tutorials/rec-1')).json;
    assert.deepEqual([t.sweep ?? null, t.error], [null, { stage: 'sweep', message: 'sweep did not finish (exit 1)' }]);
  });
});

test('prepare and render write their phases; render takes its fraction from the lines Remotion prints and records the length', async () => {
  const seen = [];
  const lines = ['Bundling 50%', 'Copying public dir 1 MB', 'Getting composition', 'Rendered 150/300', 'Rendered 300/300', 'Encoded 300/300'];
  let dir;
  const parts = {
    whisper: heard(AS_WRITTEN),
    // each line as it arrives: what the state file says after it (the panel reads the same file)
    render: async ({ args, onLine }) => { for (const l of lines) { onLine?.(l); seen.push(JSON.parse(fs.readFileSync(path.join(dir, 'tutorial.json'), 'utf8')).progress?.pct); } fs.writeFileSync(args[5], 'a film'); return { code: 0 }; },
    ffprobe: ({ args }) => ({ stdout: args.at(-1).endsWith('.mp4') ? '54.600000\n' : 'mp3\n' }),
  };
  await withHelper({ runner: fakeRunner(parts) }, async ({ home, srv, post, get }) => {
    dir = record(home, 'rec-1');
    fs.writeFileSync(path.join(dir, 'script.md'), SCRIPT);
    // a progress poll while prepare runs: the first phase is written before the first step runs
    const started = post('/tutorials/rec-1/prepare');
    await started;
    const during = (await get('/tutorials/rec-1')).json;
    assert.ok(['scrub', 'gestures', 'transcribe'].includes(during.progress?.phase ?? 'scrub'));
    await srv.idle('rec-1');
    assert.equal((await get('/tutorials/rec-1')).json.progress, null);
    await post('/tutorials/rec-1/state', { event: 'scripted', title: 'T' });
    await post('/tutorials/rec-1/state', { event: 'approved' });
    await audio(post);
    await srv.idle('rec-1');
    fs.writeFileSync(path.join(dir, 'film', 'beats.json'), JSON.stringify({ version: 1, title: 'T', nodes: {}, beats: [] }));
    await post('/tutorials/rec-1/measure'); await srv.idle('rec-1');
    await post('/tutorials/rec-1/sweep'); await srv.idle('rec-1');
    await post('/tutorials/rec-1/render'); await srv.idle('rec-1');
    const t = (await get('/tutorials/rec-1')).json;
    assert.deepEqual([t.state, t.progress, t.length, t.renders], ['built', null, 54.6, ['v1.mp4']]);
    assert.deepEqual(seen, [76, 76, 76, 87, 98, 100]); // frames are nine tenths of the render, the encode the last tenth
  });
});

test('brands: listed by folder; resolving copies the brand and its mark into film/brand, or writes the no-brand file', () => withHelper({}, async ({ home, srv, post, get }) => {
  const dir = record(home, 'rec-1');
  await post('/tutorials/rec-1/prepare');
  await srv.idle('rec-1');
  assert.deepEqual((await get('/brands')).json, { brands: [] });
  let r = await post('/brands/resolve', { id: 'rec-1' });
  assert.deepEqual([r.status, r.json], [200, { brand: null }]);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'film', 'brand', 'brand.json'), 'utf8')), { name: null, mark: null, colours: { accent: '#2456c9' }, font: 'Inter' }); // the site's own look
  const brand = path.join(home, 'Brands', 'fixture-co');
  fs.mkdirSync(brand, { recursive: true });
  fs.writeFileSync(path.join(brand, 'mark.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  fs.writeFileSync(path.join(brand, 'brand.json'), JSON.stringify({ name: 'Fixture Co', mark: { file: 'mark.svg', aspect: 0.2, width: 600 }, sites: ['app.site.test'] }));
  fs.mkdirSync(path.join(home, 'Brands', 'not-a-brand'));
  assert.deepEqual((await get('/brands')).json, { brands: ['fixture-co'] });
  assert.deepEqual((await get('/tutorials')).json.brands, ['fixture-co']);
  assert.deepEqual((await get('/tutorials')).json.tutorials.map((t) => t.id), ['rec-1']);   // the brands folder is not a tutorial
  r = await post('/brands/resolve', { id: 'rec-1' });
  assert.deepEqual(r.json, { brand: 'fixture-co' });
  assert.deepEqual(fs.readdirSync(path.join(dir, 'film', 'brand')).sort(), ['brand.json', 'mark.svg']);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'film', 'brand', 'brand.json'), 'utf8')).name, 'Fixture Co');
  assert.equal((await post('/tutorials/rec-1/state', { brand: 'fixture-co' })).json.brand, 'fixture-co');
  assert.equal((await post('/tutorials/rec-1/state', { brand: null })).json.brand, null);
  // a brand file may not name a mark outside its own folder
  fs.writeFileSync(path.join(brand, 'brand.json'), JSON.stringify({ name: 'Fixture Co', mark: { file: '../../rec-1/recording/events.ndjson', aspect: 1, width: 10 }, sites: ['app.site.test'] }));
  r = await post('/brands/resolve', { id: 'rec-1' });
  assert.equal(r.status, 409);
  assert.deepEqual(fs.readdirSync(path.join(dir, 'film', 'brand')), []);
  for (const bad of [{}, { id: '../x' }, { id: 'Brands' }]) assert.equal((await post('/brands/resolve', bad)).status, 400);
  assert.equal((await post('/brands/resolve', { id: 'rec-404' })).status, 404);
}));

test('nothing the helper sends can be put in a frame: the headers are on every kind of answer, and a frame\'s request is refused', () => withHelper({}, async ({ home, get }) => {
  const dir = record(home, 'rec-1');
  fs.mkdirSync(path.join(dir, 'out'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'out', 'v1.mp4'), 'film');
  for (const url of ['/tutorials', '/tutorials/rec-1', '/fixture/keys.html', '/page/narration.js', '/tutorials/rec-1/page', '/review/rec-1/', '/review/rec-1/review.js', '/review/rec-1/api/videos', '/review/rec-1/video?path=out/v1.mp4', '/review/rec-1/api/notes?video=nothing', '/health', '/nothing', '/tutorials/..%2Fx']) {
    const r = await get(url);
    assert.equal(r.headers.get('x-frame-options'), 'DENY', url);
    assert.match(r.headers.get('content-security-policy') ?? '', /frame-ancestors 'none'/, url);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff', url);
    assert.equal(r.headers.get('referrer-policy'), 'no-referrer', url);
  }
  for (const url of ['/tutorials/rec-1/page', '/review/rec-1/']) {
    const csp = (await get(url)).headers.get('content-security-policy');
    assert.match(csp, /default-src 'none'/);
    assert.match(csp, /script-src 'self';/);        // its own files only: no inline script
    assert.match(csp, /connect-src 'self'/);
  }
  for (const dest of ['iframe', 'frame', 'embed', 'object']) for (const url of ['/tutorials/rec-1/page', '/review/rec-1/', '/tutorials', '/fixture/keys.html']) {
    const r = await get(url, { 'sec-fetch-dest': dest, 'sec-fetch-mode': 'navigate', 'sec-fetch-site': 'cross-site' });
    assert.equal(r.status, 403, `${dest} ${url}`);
    assert.equal(r.headers.get('x-frame-options'), 'DENY');
  }
  assert.equal((await get('/tutorials/rec-1/page', { 'sec-fetch-dest': 'document', 'sec-fetch-mode': 'navigate', 'sec-fetch-site': 'none' })).status, 200);
}));

// ── the review player, as it is, per tutorial ──

test('the review page sends notes (a request the panel drains) and approves (the reviewed event)', () => withHelper({}, async ({ home, base, post, get, call }) => {
  const dir = record(home, 'rec-1');
  for (const event of [['scripted', 'T'], ['approved']]) await post('/tutorials/rec-1/state', { event: event[0], ...(event[1] ? { title: event[1] } : {}) });
  fs.writeFileSync(path.join(dir, 'tutorial.json'), JSON.stringify({ ...(await get('/tutorials/rec-1')).json, state: 'built', renders: ['v1.mp4'] }));
  const own = { origin: `http://127.0.0.1:${new URL(base).port}` };
  const sent = await call('POST', '/review/rec-1/api/send', null, own);
  assert.deepEqual([sent.status, sent.json.request.kind, sent.json.request.id], [200, 'notes', 'rec-1']);
  assert.equal((await call('POST', '/review/rec-1/api/send', null, own)).json.request.n, sent.json.request.n); // asked twice: one request
  const list = (await get('/tutorials')).json;
  assert.deepEqual(list.requests, [{ n: sent.json.request.n, id: 'rec-1', kind: 'notes' }]);
  assert.equal((await post(`/requests/${sent.json.request.n}/done`)).status, 200);
  assert.deepEqual((await get('/tutorials')).json.requests, []);
  assert.equal((await post('/requests/99/done')).status, 404);
  assert.equal((await call('POST', '/review/rec-1/api/send', null, { origin: 'https://evil.test' })).status, 403);
  const ok = await call('POST', '/review/rec-1/api/approve', null, own);
  assert.deepEqual([ok.status, ok.json.state], [200, 'reviewed']);
  assert.equal((await call('POST', '/review/rec-1/api/approve', null, own)).status, 400); // reviewed from reviewed
  // a request for a tutorial that is then deleted goes with it
  await call('POST', '/review/rec-1/api/send', null, own);
  await call('DELETE', '/tutorials/rec-1');
  assert.deepEqual((await get('/tutorials')).json.requests, []);
}));

test('the review player is served per tutorial: videos from out/ only, notes into review/', () => withHelper({}, async ({ home, base, get, call }) => {
  const dir = record(home, 'rec-1');
  fs.mkdirSync(path.join(dir, 'out'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'out', 'v1.mp4'), 'not really a film');
  fs.writeFileSync(path.join(dir, 'recording', 'mic.webm'), 'RAW');
  const hop = await fetch(`${base}/review/?tutorial=rec-1`, { redirect: 'manual' });
  assert.deepEqual([hop.status, hop.headers.get('location')], [302, '/review/rec-1/']);
  assert.equal((await fetch(`${base}/review/?tutorial=..%2Fx`, { redirect: 'manual' })).status, 400);
  assert.equal((await fetch(`${base}/review/?tutorial=rec-404`, { redirect: 'manual' })).status, 404);
  assert.match((await get('/review/rec-1/')).text, /review\.js/);
  assert.equal((await get('/review/rec-1/review.js')).status, 200);
  const videos = (await get('/review/rec-1/api/videos')).json;
  assert.deepEqual(videos.versions.map((v) => [v.name, v.path]), [['v1', 'out/v1.mp4']]);
  assert.equal((await get('/review/rec-1/video?path=out/v1.mp4')).text, 'not really a film');
  for (const bad of ['recording/mic.webm', 'out/../recording/mic.webm', 'out%2F..%2Frecording%2Fmic.webm', '../rec-1/out/v1.mp4', 'tutorial.json', 'out/v1.mp4/../../recording/mic.webm', 'transcript/mic.json']) {
    const r = await get(`/review/rec-1/video?path=${bad}`);
    assert.ok([400, 404].includes(r.status), bad);
    assert.ok(!r.text.includes('RAW'));
  }
  const note = await call('POST', '/review/rec-1/api/notes', { video: 'out/v1.mp4', time: 1, text: 'The cursor is late here.' }, { 'content-type': 'application/json' });
  assert.equal(note.status, 201);
  assert.ok(fs.existsSync(path.join(dir, 'review', 'out__v1.mp4.json')));
  assert.ok(fs.existsSync(path.join(dir, 'review', 'NOTES.md')));
  const put = await call('PUT', `/review/rec-1/api/notes/${note.json.id}`, { status: 'done', reply: 'Moved it.' }, { 'content-type': 'application/json' });
  assert.equal(put.json.status, 'done');
  assert.equal((await get('/review/rec-404/')).status, 404);
  assert.equal((await get('/review/Brands/')).status, 400);
}));

test('delete moves the tutorial whole into .trash, never removes it; restore brings the newest copy back', () => withHelper({}, async ({ home, base, get, post, call }) => {
  const dir = record(home, 'rec-1'), trash = path.join(home, '.trash');
  await post('/tutorials/rec-1/state', { title: 'Reset a password' });
  const gone = await call('DELETE', '/tutorials/rec-1');
  assert.equal(gone.status, 200);
  assert.ok(!fs.existsSync(dir));
  // the whole folder, recording included, under <home>/.trash/<id>-<time>
  const kept = fs.readdirSync(trash);
  assert.equal(kept.length, 1);
  assert.match(kept[0], /^rec-1-\d{13}$/);
  assert.equal(gone.json.trashed, kept[0]);
  assert.ok(fs.existsSync(path.join(trash, kept[0], 'recording', 'events.ndjson')));
  // the trash is never a tutorial: not listed, not addressable; what is in it is listed apart, by id, title and time
  const list = (await get('/tutorials')).json;
  assert.deepEqual(list.tutorials, []);
  assert.deepEqual(list.trashed.map((t) => [t.id, t.name]), [['rec-1', 'Reset a password']]);
  assert.ok(Number.isFinite(Date.parse(list.trashed[0].at)));
  for (const id of ['.trash', '%2Etrash']) assert.equal((await get(`/tutorials/${id}`)).status, 400);
  assert.equal((await fetch(`${base}/session/.trash/events`, { method: 'POST', body: '[]' })).status, 400);
  // a second recording of the same id, deleted too: both copies are kept, each under its own name
  record(home, 'rec-1');
  await post('/tutorials/rec-1/state', { title: 'The later one' });
  assert.equal((await call('DELETE', '/tutorials/rec-1')).status, 200);
  assert.equal(fs.readdirSync(trash).length, 2);
  assert.equal((await get('/tutorials')).json.trashed.length, 2);
  // restore: only a caller with no Origin, only an id with something in the trash, never over a folder that exists
  const own = { origin: `http://127.0.0.1:${new URL(base).port}` };
  for (const headers of [own, { origin: RECORDER }, { origin: 'https://evil.test' }]) assert.equal((await post('/tutorials/rec-1/restore', null, headers)).status, 403);
  assert.equal((await post('/tutorials/rec-2/restore')).status, 404);
  const back = await post('/tutorials/rec-1/restore');
  assert.deepEqual([back.status, back.json.id, back.json.title], [200, 'rec-1', 'The later one']); // the newest copy
  assert.ok(fs.existsSync(path.join(dir, 'recording', 'events.ndjson')));
  assert.deepEqual((await get('/tutorials')).json.tutorials.map((t) => t.id), ['rec-1']);
  assert.equal((await post('/tutorials/rec-1/restore')).status, 409);
  assert.deepEqual((await get('/tutorials')).json.trashed.map((t) => t.name), ['Reset a password']);
}));

test('two deletes of one id in the same millisecond: the second copy gets a suffix, and both can be listed', () => withHelper({}, async ({ home, get, call }) => {
  const realNow = Date.now;
  Date.now = () => 1791830000000;
  try {
    for (let i = 0; i < 2; i++) { record(home, 'rec-1'); assert.equal((await call('DELETE', '/tutorials/rec-1')).status, 200); }
  } finally { Date.now = realNow; }
  assert.deepEqual(fs.readdirSync(path.join(home, '.trash')).sort(), ['rec-1-1791830000000', 'rec-1-1791830000000.2']);
  assert.equal((await get('/tutorials')).json.trashed.length, 2);
}));

test('first-run setup: what is missing is listed, one press runs it (no page may), one run at a time, and the list says when it is done', async () => {
  // a plugin folder with nothing installed, a Node with npm beside it, and programs that leave what the real ones do
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-fresh-')), data = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-data-'));
  const put = (file, text = '') => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };
  put(path.join(root, 'package.json'), JSON.stringify({ dependencies: { remotion: '4.0.532' } }));
  put(path.join(root, 'nodehome', 'node_modules', 'npm', 'bin', 'npm-cli.js'));
  let release; const held = new Promise((r) => { release = r; });
  const ran = [];
  const runner = fakeRunner({
    npm: async () => { await held; put(path.join(root, 'node_modules', '.package-lock.json'), '{}'); put(path.join(root, 'node_modules', 'remotion', 'package.json'), JSON.stringify({ version: '4.0.532' })); return { code: 0 }; },
    vendor: () => { for (const f of ['rrweb.js', 'GeistVF.woff2', 'page.js']) put(path.join(root, 'extension', 'vendor', f)); return { code: 0 }; },
    browser: () => ({ code: 1 }),
  }, ran);
  // (pins with no checksum for the transcriber's program: it is not offered, so this run is the three steps alone)
  const pins = { 'whisper-win32-x64': { url: 'https://github.com/o/p/releases/download/v1/w.zip', size: 1, sha256: null, exe: 'w.exe' }, model: { url: 'https://huggingface.co/o/p/resolve/abc/m.bin', size: 1, sha256: 'a'.repeat(64) } };
  const setup = { root, data, platform: 'win32', arch: 'x64', env: { PATH: '' }, execPath: path.join(root, 'nodehome', 'node.exe'), pins, fetcher: async () => assert.fail('nothing is downloaded here') };
  await withHelper({ runner, setup }, async ({ get, post, base }) => {
    const before = (await get('/setup')).json;
    assert.deepEqual([before.needed, before.running, before.last, before.transcriber, before.data], [true, false, null, 'none', data]);
    assert.deepEqual(before.steps.map((s) => [s.name, s.done]), [['deps', false], ['vendor', false], ['browser', false]]);
    assert.deepEqual((await get('/tutorials')).json.setup, before);
    assert.equal((await post('/setup', null, { origin: base })).status, 403); // not even this helper's own pages
    assert.equal((await post('/setup', null, { origin: 'https://evil.test' })).status, 403);
    assert.deepEqual(ran, []);
    assert.equal((await post('/setup')).status, 202);
    assert.equal((await post('/setup')).status, 409);
    const during = (await get('/tutorials')).json.setup;
    assert.deepEqual([during.running, during.last.step, during.last.state, during.last.label], [true, 'deps', 'running', 'Installing the video engine']);
    release();
    for (let i = 0; i < 200 && (await get('/setup')).json.running; i++) await new Promise((r) => setTimeout(r, 10));
    const after = (await get('/setup')).json;
    assert.deepEqual(after.steps.map((s) => [s.name, s.done]), [['deps', true], ['vendor', true], ['browser', false]]);
    assert.deepEqual([after.needed, after.running, after.last.state, after.last.step], [true, false, 'failed', 'browser']);
    assert.match(after.last.note, /^Fetching the browser that renders films did not finish: /);
    assert.deepEqual(ran, ['npm', 'vendor', 'browser']);
    assert.equal((await post('/setup')).status, 202); // again after a failure: only what is left
    for (let i = 0; i < 200 && (await get('/setup')).json.running; i++) await new Promise((r) => setTimeout(r, 10));
    assert.deepEqual(ran, ['npm', 'vendor', 'browser', 'browser']);
  });
  fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(data, { recursive: true, force: true });
});

test('a helper of this copy of the plugin: setup is in the list, and names nothing to install', () => withHelper({ setup: { env: { PATH: '' } } }, async ({ get }) => {
  const { setup } = (await get('/tutorials')).json;
  assert.deepEqual(setup.steps.find((s) => s.name === 'deps'), { name: 'deps', done: true, what: 'the video engine (npm packages, about 650 MB on disk)' });
  assert.equal(setup.running, false);
}));
