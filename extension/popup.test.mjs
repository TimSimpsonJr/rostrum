// The popup's page against its script and the state table: ids are unique (an icon symbol once shared a button's id,
// and the script found the symbol), every part and every element the script asks for is on the page, and every part
// starts hidden so a state shows only what state.mjs `shows` names for it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PARTS } from './state.mjs';

const read = (name) => fs.readFileSync(new URL(name, import.meta.url), 'utf8');
const html = read('popup.html').replace(/<!--[\s\S]*?-->/g, ''), js = read('popup.js'), css = read('popup.css');
const tags = [...html.matchAll(/<[a-z][^>]*\sid="([\w-]+)"[^>]*>/g)].map((m) => ({ id: m[1], tag: m[0] }));
const ids = tags.map((t) => t.id);

test('every id on the page is there once', () => {
  assert.deepEqual(ids.filter((id, i) => ids.indexOf(id) !== i), []);
});

test('every part of the state table is on the page, and starts hidden', () => {
  for (const part of PARTS) {
    const found = tags.find((t) => t.id === part);
    assert.ok(found, `#${part} is on the page`);
    assert.match(found.tag, /\shidden[\s>]/, `#${part} starts hidden`);
  }
  // nothing else hides by the attribute but the microphone menu, which is closed until its button opens it
  assert.deepEqual(tags.filter((t) => /\shidden[\s>]/.test(t.tag)).map((t) => t.id).sort(), [...PARTS, 'mic-menu'].sort());
  assert.match(css, /\[hidden\] \{ display: none !important; \}/);
});

test('the script asks only for elements the page has, and every icon it draws is defined', () => {
  const asked = [...js.matchAll(/\$\('([\w-]+)'\)/g)].map((m) => m[1]);
  assert.ok(asked.length > 20);
  assert.deepEqual([...new Set(asked)].filter((id) => !ids.includes(id)), []);
  const used = [...html.matchAll(/<use href="#([\w-]+)"/g)].map((m) => m[1]);
  assert.deepEqual(used.filter((id) => !new RegExp(`<symbol id="${id}"`).test(html)), []);
  assert.ok(used.includes('sym-pause')); // the Pause pill has its icon
});

test('the buttons live where their state is: Pause and Send to Rostrum are their own parts, Cancel and Allow are inside theirs', () => {
  // each part is written on one line of the page, with what it holds
  const inside = (outer, inner) => html.split('\n').some((line) => line.indexOf(`id="${outer}"`) >= 0 && line.indexOf(`id="${inner}"`) > line.indexOf(`id="${outer}"`));
  assert.ok(inside('s1', 'cancel'));
  assert.ok(inside('foot-mic', 'allow'));
  assert.ok(inside('meter', 'mic'));
  for (const id of ['pause', 'stop', 'again']) assert.match(tags.find((t) => t.id === id).tag, /^<button /);
  // the picker: one button (name and chevron inside it, so the whole of it opens the menu) and a menu of the popup's
  // own inside the meter's part, so it exists only where the meter does; no native list
  const trigger = tags.find((t) => t.id === 'mic').tag;
  assert.match(trigger, /^<button /);
  assert.match(trigger, /aria-haspopup="listbox"/);
  assert.match(trigger, /aria-expanded="false"/);
  assert.match(trigger, /aria-controls="mic-menu"/);
  assert.match(tags.find((t) => t.id === 'mic-menu').tag, /role="listbox"/);
  assert.ok(inside('meter', 'mic-menu') && inside('mic', 'mic-name'));
  assert.ok(!html.includes('<select'));
  // the menu is built when it opens or the devices change, never in the drawing of a frame
  const drawing = js.slice(js.indexOf('function draw('), js.indexOf('async function load()'));
  assert.ok(drawing.length > 1000);
  for (const call of ['build(', 'devices(', 'replaceChildren']) assert.ok(!drawing.includes(call), call);
  for (const key of ['ArrowDown', 'ArrowUp', 'Enter', 'Escape']) assert.ok(js.includes(key), key);
});

test('every icon the manifest and the worker name is a file in the extension', () => {
  const manifest = JSON.parse(read('manifest.json'));
  const named = [...Object.values(manifest.icons), ...Object.values(manifest.action.default_icon), ...[16, 32].flatMap((s) => [`icons/icon-${s}.png`, `icons/icon-rec-${s}.png`])];
  for (const f of named) assert.ok(fs.existsSync(new URL(f, import.meta.url)), f);
  assert.match(read('worker.js'), /icons\/\$\{mark\}-16\.png/);
});

test('each toolbar icon is the size its name says; the idle one is one flat blue with a hole, and its drawings are kept', () => {
  const png = (f) => fs.readFileSync(new URL(f, import.meta.url));
  for (const s of [16, 32, 48, 128]) for (const mark of ['icon', 'icon-rec']) {
    const b = png(`icons/${mark}-${s}.png`);
    assert.deepEqual([b.readUInt32BE(16), b.readUInt32BE(20), b[25]], [s, s, 6], `${mark}-${s}`); // IHDR: width, height, RGBA (so it can be see-through)
  }
  assert.ok(!png('icons/icon-16.png').equals(png('icons/icon-rec-16.png'))); // idle and recording are different pictures
  for (const f of ['icons/icon.svg', 'icons/icon-16.svg']) { // what make-idle-icon.py exports the idle icon from
    const svg = read(f);
    assert.equal((svg.match(/<path/g) || []).length, 1, f);
    assert.match(svg, /fill="#2C84FF" fill-rule="evenodd"/, f);
  }
});

test('the popup names no command and shouts nothing', () => {
  const words = html.replace(/<[^>]+>/g, ' ');
  for (const bad of ['npm', 'terminal', 'ROSTRUM_', '!', 'please', 'Please']) assert.ok(!words.includes(bad), bad);
});

test('ending a recording is its own button: the big control\'s press never sends "stop"', () => {
  const handler = js.slice(js.indexOf("$('rec').addEventListener('click'"), js.indexOf("$('cancel').addEventListener"));
  assert.ok(handler.includes('press(') && !handler.includes("'stop'"));
  assert.match(js, /\$\('stop'\)\.addEventListener\('click', \(\) => send\(\{ ct: 'stop' \}\)\)/);
  assert.match(html, /id="stop" hidden>Send to Rostrum</);
  assert.match(html, /id="s2" hidden>Press to stop</);
  assert.match(html, /id="sub-paused" hidden>Stopped\. Send it to Rostrum, or press play to carry on\.</);
});
