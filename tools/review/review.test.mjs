import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { withHelper, record } from '../../helper/test-helpers.mjs';

const JSONH = { 'content-type': 'application/json' };

test('versions, notes across versions, fixedIn, the three statuses, and the tutorial route', () => withHelper({}, async ({ home, get, call }) => {
  let dir = record(home, 'rec-1');
  fs.mkdirSync(path.join(dir, 'out'), { recursive: true });
  for (const v of ['v1', 'v2']) fs.writeFileSync(path.join(dir, 'out', `${v}.mp4`), `film ${v}`);
  fs.writeFileSync(path.join(dir, 'out', 'sweep.txt'), 'SWEEP PASSED');
  dir = (await call('POST', '/tutorials/rec-1/state', { event: 'scripted', title: 'Find your API credentials' }, JSONH)).json.dir; // the folder takes the title; the review routes keep the id
  const videos = (await get('/review/rec-1/api/videos')).json;
  assert.deepEqual(videos.versions.map((v) => [v.name, v.path]), [['v1', 'out/v1.mp4'], ['v2', 'out/v2.mp4']]);
  assert.ok(typeof videos.versions[0].mtime === 'number');
  const a = (await call('POST', '/review/rec-1/api/notes', { video: 'out/v1.mp4', time: 31, text: 'Hold on the key a little longer' }, JSONH)).json;
  const b = (await call('POST', '/review/rec-1/api/notes', { video: 'out/v2.mp4', time: 7, text: 'The second item comes in a beat late' }, JSONH)).json;
  assert.deepEqual([a.status, a.region, a.fixedIn], ['open', null, undefined]);
  const all = (await get('/review/rec-1/api/notes')).json.notes;
  assert.deepEqual(all.map((n) => [n.id, n.video]), [[b.id, 'out/v2.mp4'], [a.id, 'out/v1.mp4']]); // by time, across versions
  assert.deepEqual((await get('/review/rec-1/api/notes?video=out%2Fv1.mp4')).json.notes.map((n) => n.id), [a.id]);
  const fixed = (await call('PUT', `/review/rec-1/api/notes/${a.id}`, { status: 'done', reply: 'The key now stays on screen longer.', fixedIn: 'v2' }, JSONH)).json;
  assert.deepEqual([fixed.status, fixed.fixedIn, fixed.reply], ['done', 'v2', 'The key now stays on screen longer.']);
  assert.equal((await call('PUT', `/review/rec-1/api/notes/${a.id}`, { fixedIn: '../x' }, JSONH)).status, 400);
  assert.equal((await call('PUT', `/review/rec-1/api/notes/${b.id}`, { status: 'wontfix', reply: 'Good as it is.' }, JSONH)).json.status, 'wontfix');
  assert.equal((await call('PUT', `/review/rec-1/api/notes/${b.id}`, { status: 'open' }, JSONH)).json.status, 'open');
  assert.equal((await call('PUT', `/review/rec-1/api/notes/${b.id}`, { status: 'maybe' }, JSONH)).status, 400);
  // a note's region: stored as fractions of the frame, clamped to it, set, replaced and taken away; a note without one is as before
  const note = async (id) => (await get('/review/rec-1/api/notes')).json.notes.find((n) => n.id === id);
  const c = (await call('POST', '/review/rec-1/api/notes', { video: 'out/v1.mp4', time: 1, text: 'x', region: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } }, JSONH)).json;
  assert.deepEqual(c.region, { x: 0.1, y: 0.1, w: 0.2, h: 0.2 });
  assert.deepEqual((await note(c.id)).region, c.region);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'review', 'out__v1.mp4.json'), 'utf8')).notes.find((n) => n.id === c.id).region, c.region);
  assert.deepEqual((await call('POST', '/review/rec-1/api/notes', { video: 'out/v1.mp4', time: 2, text: 'y', region: { x: 0.8, y: -0.5, w: 0.9, h: 1 } }, JSONH)).json.region, { x: 0.8, y: 0, w: 0.2, h: 0.5 });
  for (const bad of ['the left half', { x: 0.1, y: 0.1 }, { x: '0.1', y: 0.1, w: 0.2, h: 0.2 }]) assert.equal((await call('POST', '/review/rec-1/api/notes', { video: 'out/v1.mp4', time: 3, text: 'z', region: bad }, JSONH)).status, 400);
  assert.deepEqual((await call('PUT', `/review/rec-1/api/notes/${a.id}`, { region: { x: 0.5, y: 0.25, w: 0.25, h: 0.5 } }, JSONH)).json.region, { x: 0.5, y: 0.25, w: 0.25, h: 0.5 });
  const answered = (await call('PUT', `/review/rec-1/api/notes/${a.id}`, { reply: 'Held longer.' }, JSONH)).json;
  assert.deepEqual([answered.region, answered.status, answered.fixedIn], [{ x: 0.5, y: 0.25, w: 0.25, h: 0.5 }, 'done', 'v2']); // a reply leaves it be
  assert.equal((await call('PUT', `/review/rec-1/api/notes/${a.id}`, { region: [1, 2, 3, 4] }, JSONH)).status, 400);
  assert.equal((await call('PUT', `/review/rec-1/api/notes/${c.id}`, { region: null }, JSONH)).json.region, null);
  assert.equal((await note(b.id)).region, null);
  // a note's text is edited: its reply, status and region stay, and NOTES.md has the new words in place of the old
  const notesMd = () => fs.readFileSync(path.join(dir, 'review', 'NOTES.md'), 'utf8');
  const edited = (await call('PUT', `/review/rec-1/api/notes/${a.id}`, { text: 'Hold on the key two seconds longer' }, JSONH)).json;
  assert.deepEqual([edited.text, edited.reply, edited.status, edited.fixedIn, edited.region], ['Hold on the key two seconds longer', 'Held longer.', 'done', 'v2', { x: 0.5, y: 0.25, w: 0.25, h: 0.5 }]);
  assert.match(notesMd(), /> Hold on the key two seconds longer/); assert.doesNotMatch(notesMd(), /a little longer/);
  assert.equal((await call('PUT', `/review/rec-1/api/notes/${a.id}`, { text: '   ' }, JSONH)).status, 400);
  assert.equal((await note(a.id)).text, 'Hold on the key two seconds longer');
  // a note is deleted, reply and all: gone from the list, from its file, from NOTES.md, and its saved frame with it
  const gone = (await call('POST', '/review/rec-1/api/notes', { video: 'out/v2.mp4', time: 40, text: 'Delete me, answered and fixed' }, JSONH)).json;
  await call('PUT', `/review/rec-1/api/notes/${gone.id}`, { status: 'done', reply: 'Done.', fixedIn: 'v2' }, JSONH);
  const frame = path.join(dir, 'review', 'frames', `${gone.id}.png`);
  fs.mkdirSync(path.dirname(frame), { recursive: true }); fs.writeFileSync(frame, 'a frame');
  assert.match(notesMd(), /Delete me, answered and fixed/);
  assert.deepEqual((await call('DELETE', `/review/rec-1/api/notes/${gone.id}`)).json, { ok: true, id: gone.id });
  assert.equal(await note(gone.id), undefined);
  assert.equal(fs.existsSync(frame), false);
  assert.doesNotMatch(notesMd(), /Delete me, answered and fixed/); assert.doesNotMatch(notesMd(), new RegExp(`id ${gone.id}`));
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'review', 'out__v2.mp4.json'), 'utf8')).notes.some((n) => n.id === gone.id), false);
  assert.equal((await call('DELETE', `/review/rec-1/api/notes/${gone.id}`)).status, 404);
  assert.equal((await note(b.id)).text, 'The second item comes in a beat late');   // the others are as they were
  const md = notesMd();
  assert.match(md, /\[done\]/); assert.match(md, /Fixed in: v2/);
  assert.deepEqual(md.match(/^- Region: .*$/gm), [                                             // only the notes that have one, in order of time
    '- Region: x 80%, y 0%, width 20%, height 50% (of the frame, from its top-left corner)',
    '- Region: x 50%, y 25%, width 25%, height 50% (of the frame, from its top-left corner)',
  ]);
  const t = (await get('/review/rec-1/api/tutorial')).json;
  assert.deepEqual([t.id, t.title, t.state], ['rec-1', 'Find your API credentials', 'scripted']);
  assert.equal((await get('/review/rec-1/api/cues')).status, 404);
  const page = await get('/review/rec-1/');
  assert.match(page.headers.get('content-security-policy'), /font-src 'self'/);
  assert.equal((await get('/kit/GeistVF.woff2')).status, 200);
  assert.equal((await get('/kit/../helper/server.mjs')).status, 404);
}));

// The play button once shared its id with the sprite's play icon: getElementById gave the script the icon, so the
// button's own click did nothing, only a press on the drawn glyph played, and the picture never changed.
test('the page: every id is one element, the script holds controls and never icons, and the button follows the film', () => {
  const read = (f) => fs.readFileSync(path.join(import.meta.dirname, f), 'utf8');
  const html = read('index.html'), js = read('review.js');
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(ids.filter((id, i) => ids.indexOf(id) !== i), []);
  const icons = [...html.matchAll(/<symbol id="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(icons.length && icons.every((id) => id.startsWith('i-')));
  const held = [...js.matchAll(/\$\('([^']+)'\)/g)].map((m) => m[1]);
  assert.ok(held.includes('play'));
  for (const id of held) assert.ok(ids.includes(id) && !icons.includes(id), `$('${id}') is a control of the page`);
  for (const [, id] of [...html.matchAll(/<use href="#([^"]+)"/g), ...js.matchAll(/'#(i-[a-z]+)'/g)]) assert.ok(icons.includes(id), `#${id} is an icon`);
  assert.match(html, /<button[^>]* id="play"/);
  // the sign of a selection is an icon of the sprite, on the row and the pin of a note that has one
  assert.ok(icons.includes('i-area'));
  assert.match(js, /p\.hasRegion \? el\('span', \{ class: 'has-area'[^\n]*icon\('i-area'\)/);
  assert.match(js, /p\.hasRegion \? ' area' : ''/);
  // a note's Edit and Delete are on the open note only; Delete asks in the row (no browser dialog) and Escape in the edit field drops the edit
  assert.match(js, /!open \|\| editing === n\.id \? null : asking === n\.id/);
  assert.match(js, /deleteQuestion\(n\)[^\n]*text: 'Delete', onclick: \(\) => remove\(n\.id\)[^\n]*text: 'Keep'/);
  assert.match(js, /api\('DELETE', `\/api\/notes\/\$\{id\}`\)/);
  assert.match(js, /saveEdit\(id\) \{[^\n]*change\(id, \{ text \}\)/);
  assert.match(js, /e\.key === 'Escape' && [^\n]*closest\('\.edit'\)\) return cancelEdit\(\)/);
  assert.doesNotMatch(js, /\b(confirm|alert|prompt)\(/);
  // the picture is set from the film's own state on its own events, and a source swap pauses without a `pause` event
  for (const ev of ['play', 'pause', 'emptied']) assert.match(js, new RegExp(`video\\.addEventListener\\('${ev}', [^;]*showPlay`));
  assert.match(js, /const showPlay = [^;]*video\.paused \? '#i-play' : '#i-pause'/);
  // one way to play: togglePlay reads the film's own state, a rejected play() is caught, and the button, the film and Space all go through it
  assert.equal(js.match(/video\.play\(/g).length, 1);
  assert.match(js, /const togglePlay = [^\n]*video\.paused\) video\.play\(\)\.catch\(/);
  assert.match(js, /\$\('play'\)\.addEventListener\('click', togglePlay\)/);
  assert.match(js, /' ': togglePlay/);
  assert.doesNotMatch(js, /video\.addEventListener\('click'/);                 // the film's press is the pointer handler: a click toggles, a drag selects
  assert.doesNotMatch(js, /e\.key === ' ' [^\n]*closest\('button'\)\) return/); // Space is not left to whichever button holds the focus
  assert.match(js, /addEventListener\('keyup', [^\n]*e\.key === ' ' [^\n]*preventDefault/);
});

test('the page: a module that imports its tested parts, its own files only, nothing inline, nothing from the network', () => withHelper({}, async ({ home, get }) => {
  record(home, 'rec-1');
  const html = (await get('/review/rec-1/')).text, js = await get('/review/rec-1/review.js'), model = await get('/review/rec-1/model.mjs'), css = (await get('/review/rec-1/review.css')).text;
  assert.match(html, /<script type="module" src="review\.js"><\/script>/);
  assert.match(js.text, /from '\.\/model\.mjs'/);
  assert.deepEqual([model.status, model.headers.get('content-type')], [200, 'text/javascript; charset=utf-8']);
  assert.doesNotMatch(html, / on[a-z]+=|style=|<script>|<style/);                         // the CSP allows none of it
  for (const text of [html, js.text, css]) assert.doesNotMatch(text.replaceAll('http://www.w3.org/2000/svg', ''), /https?:\/\//);
  assert.match(html, /<video id="video"[^>]* disableremoteplayback x-webkit-airplay="deny">/); // no AirPlay or cast control from the browser
  assert.doesNotMatch(html, /<video[^>]* controls/);                                           // and none of its own controls to carry one
  assert.match(css, /url\("\/kit\/GeistVF\.woff2"\)/);
  assert.match(css, /prefers-color-scheme: dark/);
}));
