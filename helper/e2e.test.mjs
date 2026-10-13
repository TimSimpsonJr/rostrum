// End to end, over HTTP, with the plugin's real tools: a fixture recording of invented data (recordings/fixture-keys,
// made by the recorder on fixtures/site/keys.html; `npm run vendor` prepares the fixtures) goes from `recorded` to a
// rendered film. Only the judgement steps are played by this test (the script, the beat file), and the transcriber is
// a stub (fixtures/whisper-stub.mjs), so no model and no Whisper are needed. It renders with Remotion and takes a few
// minutes, so it runs only when asked:  ROSTRUM_E2E=1 npm test   (ROSTRUM_E2E_KEEP=1 keeps the folder and says where)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { start } from './server.mjs';
import { ffbin } from '../tools/bin.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url)), SOURCE = path.join(ROOT, 'recordings', 'fixture-keys');
const LINES = ['Your keys are on the API Keys page.', 'To copy your user key, select Copy.', 'And that is how you copy your user key.'];
const skip = process.env.ROSTRUM_E2E !== '1' ? 'set ROSTRUM_E2E=1 to run (renders; a few minutes)' : !fs.existsSync(path.join(SOURCE, 'events.ndjson')) ? 'no fixture recording (recordings/fixture-keys)' : false;

test('a fixture recording goes from recorded to a rendered film through the helper', { skip, timeout: 20 * 60 * 1000 }, async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-e2e-')), dir = path.join(home, 'rec-fixture'), T = '/tutorials/rec-fixture';
  fs.cpSync(SOURCE, path.join(dir, 'recording'), { recursive: true });
  for (const f of ['mic.webm', 'mic.json', 'originals.json']) fs.rmSync(path.join(dir, 'recording', f), { force: true }); // no microphone: the transcript is the empty one
  process.env.ROSTRUM_STUB_TEXT = LINES.join(' ');
  const srv = await start({ port: 0, home, whisper: [process.execPath, path.join(ROOT, 'fixtures', 'whisper-stub.mjs')] });
  const base = `http://127.0.0.1:${srv.port}`, took = {};
  const call = async (method, url, body, headers) => { const r = await fetch(base + url, { method, headers, body: body == null ? undefined : Buffer.isBuffer(body) ? body : JSON.stringify(body) }); const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* not json */ } return { status: r.status, json, text }; };
  const get = (u) => call('GET', u), post = (u, b, h) => call('POST', u, b, h);
  /** runs a stage and waits for it over HTTP, as the panel does */
  const stage = async (name, url, body, headers) => {
    const t0 = Date.now(), r = await post(url, body, headers);
    assert.equal(r.status, 202, `${name}: ${r.text}`);
    for (;;) { const t = (await get(T)).json; if (!t.busy) { took[name] = +((Date.now() - t0) / 1000).toFixed(1); return t; } await new Promise((s) => setTimeout(s, 300)); }
  };
  const bundles = () => fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith('remotion-webpack-bundle-') || f.startsWith('rostrum-render-')).length, before = bundles();
  try {
    // 1. the recording is there: the tutorial appears, recorded, flagged as having no microphone
    let t = (await get('/tutorials')).json.tutorials[0];
    assert.deepEqual([t.id, t.state, t.flags.noMic], ['rec-fixture', 'recorded', true]);

    // 2. prepare: clean copy, gestures, layout, kit, transcript
    t = await stage('prepare', `${T}/prepare`);
    assert.deepEqual([t.state, t.error], ['recorded', null]);
    for (const f of ['film/clean/manifest.json', 'film/clean/screen-0.json', 'film/clean/changed.json', 'film/clean/pointer.json', 'film/clean/gestures.json', 'film/clean/layout.json', 'film/clean/site.json', 'film/kit/GeistVF.woff2', 'transcript/mic.json']) assert.ok(fs.existsSync(path.join(dir, f)), f);
    assert.ok(!fs.existsSync(path.join(dir, 'film', 'recording')));
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'transcript', 'mic.json'), 'utf8')), { segments: [] });

    // 3. understand (the skill's part): what is on the screen, from the clean copy
    const els = (await get(`${T}/elements?screen=0`)).json;
    assert.equal(els.measured, true);
    const copy = els.elements.filter((e) => e.role === 'button' && e.text === 'Copy')[1], heading = els.elements.find((e) => e.tag === 'h1');
    assert.ok(copy?.box && heading?.box);
    const near = (await get(`${T}/elements?screen=0&x=${copy.box.x - 20}&y=${copy.box.y - 20}&w=${copy.box.w + 40}&h=${copy.box.h + 40}`)).json;
    assert.deepEqual(near.elements.map((e) => e.node), [copy.node]);

    // 4. the script, approved
    fs.writeFileSync(path.join(dir, 'script.md'), ['# Copy your user key: script', '', '| # | Narration | On screen |', '|---|---|---|', '| 0 | (no narration) | The title |', ...LINES.map((l, i) => `| ${i + 1} | ${l} | |`), ''].join('\n'));
    assert.equal((await post(`${T}/state`, { event: 'scripted', title: 'Copy your user key' })).json.state, 'scripted');
    assert.equal((await post(`${T}/state`, { event: 'approved' })).json.state, 'approved');
    assert.deepEqual((await get(`${T}/narration`)).json.lines, LINES);

    // 5. narration: a generated audio file (a tone with gaps, long enough for the stub's words), uploaded as the page does
    const take = path.join(home, 'take.wav');
    const ff = spawnSync(ffbin('ffmpeg'), ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=11', '-af', 'volume=0.3', take]);
    assert.equal(ff.status, 0, 'ffmpeg made the take');
    t = await stage('narration', `${T}/narration`, fs.readFileSync(take), { 'content-type': 'audio/wav' });
    assert.deepEqual([t.state, t.error], ['voiced', null]);
    for (const f of ['upload.wav', 'narration.mp3', 'narration.json', 'compare.json', 'timing.json', 'vo-0.mp3', 'vo-2.mp3']) assert.ok(fs.existsSync(path.join(dir, 'film', 'narration', f)), f);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'film', 'narration', 'compare.json'), 'utf8')).ok, true);
    const gaps0 = JSON.parse(fs.readFileSync(path.join(dir, 'film', 'narration', 'timing.json'), 'utf8')).gaps;
    assert.deepEqual(gaps0, [0, 0.8, 0.8]); // no beat file yet

    // 6. build (the skill's part): a blind rule, the brand, a tiny beat file
    const rules = await post(`${T}/rules`, { blind: [{ screen: 0, node: heading.node, as: 'series', label: 'Page' }] });
    assert.deepEqual(rules.json, { applied: [{ screen: 0, node: heading.node, tag: 'h1', length: 8, ok: true }] });
    assert.deepEqual((await post('/brands/resolve', { id: 'rec-fixture' })).json, { brand: null });
    fs.writeFileSync(path.join(dir, 'film', 'beats.json'), JSON.stringify({ version: 1, title: 'Copy your user key', viewport: { width: 1280, height: 720 }, nodes: { copy: [0, copy.node] },
      beats: [{ line: 0, screen: 0, frame: { whole: true }, cursor: 'enter' }, { line: 1, screen: 0, frame: { target: 'copy', with: 'row' }, cursor: 'click', target: 'copy', cue: 'copy' }, { line: 2, cursor: 'leave' }], chalk: [] }, null, 1));
    t = await stage('measure + timing', `${T}/measure`);
    assert.equal(t.error, null);
    assert.ok(JSON.parse(fs.readFileSync(path.join(dir, 'film', 'clean', 'boxes.json'), 'utf8')).copy);
    const timing = JSON.parse(fs.readFileSync(path.join(dir, 'film', 'narration', 'timing.json'), 'utf8'));
    assert.notDeepEqual(timing.gaps, gaps0); // timed again, from the beat file's moves

    // 7. stills, sweep, render
    t = await stage('stills', `${T}/stills`, { frames: [0], moments: true });
    assert.equal(t.error, null);
    const frames = fs.readdirSync(path.join(dir, 'out', 'frames'));
    assert.ok(frames.includes('f0000.png') && frames.length >= 5, `${frames.length} stills`);
    assert.equal((await post(`${T}/render`)).status, 409); // not before the sweep
    t = await stage('sweep', `${T}/sweep`);
    assert.deepEqual([t.sweep.ok, t.error], [true, null], fs.readFileSync(path.join(dir, 'out', 'sweep.txt'), 'utf8'));
    t = await stage('render', `${T}/render`);
    assert.deepEqual([t.state, t.renders, t.error], ['built', ['v1.mp4'], null]);
    const film = path.join(dir, 'out', 'v1.mp4');
    const seconds = Number(spawnSync(ffbin('ffprobe'), ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', film], { encoding: 'utf8' }).stdout);
    assert.ok(seconds > 8 && seconds < 40, `${seconds} s`);

    // 8. the local page and the review player see it
    assert.equal((await get(`${T}/page`)).status, 200);
    assert.deepEqual((await get('/review/rec-fixture/api/videos')).json.groups[0].videos.map((v) => v.path), ['out/v1.mp4']);
    assert.equal((await post(`${T}/state`, { event: 'reviewed' })).json.state, 'reviewed');
    assert.equal((await post(`${T}/state`, { event: 'done' })).json.state, 'done');
    assert.equal(bundles(), before, 'no bundle or render folder left in the temp folder');
    console.log(`e2e timings (s): ${JSON.stringify(took)}; film ${seconds.toFixed(1)} s, ${frames.length} stills`);
  } finally {
    await srv.close();
    if (process.env.ROSTRUM_E2E_KEEP === '1') console.log(`kept: ${home}`); else fs.rmSync(home, { recursive: true, force: true });
  }
});
