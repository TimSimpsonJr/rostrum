// One clock for the understand stage: what was said, what was clicked, what the pointer did and when the screen
// changed, in order, in seconds from the first recorded event.
//   node --experimental-strip-types timeline.mjs <tutorial folder> [--no-speech]
// Reads  <tutorial>/transcript/mic.json            the author's own speech (Whisper words); left out with --no-speech
//        <tutorial>/film/clean/manifest.json, gestures.json, screen-<i>.json      the CLEAN copy only
// Never reads <tutorial>/recording/. Every label printed is text of the clean copy (stand-ins already applied).
// Per click it names the control (the nearest button, link or field around the clicked node, with its node id) and
// proposes what the click did, from the snapshots either side of it (film/src/tutorial/changes.ts findChange):
// the page changed, or something opened (its node id). A proposal, to be checked against the elements of the screen.
import fs from 'node:fs';
import path from 'node:path';
import { elementsIn, walk } from '../../../tools/scrub.mjs';
import { paths } from '../../../tools/paths.mjs';
import { findChange } from '../../../film/src/tutorial/changes.ts';

const dir = process.argv[2], speech = !process.argv.includes('--no-speech');
if (!dir || dir.startsWith('--')) { console.log('usage: timeline.mjs <tutorial folder> [--no-speech]'); process.exit(1); }
const P = paths(dir), read = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const manifest = read(P.manifest), gestures = read(P.gestures);
if (!manifest) { console.log('not prepared yet: no film/clean/manifest.json'); process.exit(1); }
const screen = (i) => read(path.join(P.clean, `screen-${i}.json`));
const shut = (s) => s.replace(/\s+/g, ' ').trim();
const rows = [];

// ── screens ──
manifest.screens.forEach((s, k) => {
  const before = manifest.screens[k - 1];
  // (the address itself is not printed: a path can carry an id)
  rows.push({ t: s.t, text: `SCREEN ${s.i}  ${!before ? 'the recording starts' : before.href !== s.href ? 'a new page' : 'the same page, captured again'}` });
});

// What opened is often a wrapper as large as the window (an overlay) around the panel one sees. Where the screen was
// measured (film/clean/layout.json), go down through such wrappers to the panel: the node a film frames and opens.
const layout = read(P.layout) ?? {};
function panelOf(tree, i, id) {
  const vp = manifest.screens.find((x) => x.i === i)?.viewport ?? manifest.viewport; // the screen's own window
  const boxes = layout[i]?.boxes, size = (n) => (boxes?.[n] ? `${Math.round(boxes[n].w)}x${Math.round(boxes[n].h)}` : 'not measured');
  if (!boxes?.[id]) return `node ${id} (${size(id)}: check which node inside it is the panel)`;
  let at = null; walk(tree, (n) => { if (n.id === id) at = n; });
  const first = id;
  for (;;) {
    const b = boxes[at.id], kids = (at.childNodes ?? []).filter((c) => c.tagName && boxes[c.id] && boxes[c.id].w * boxes[c.id].h > 0);
    if (!(b.w > 0.6 * vp.width || b.h > 0.6 * vp.height) || kids.length !== 1) break;
    at = kids[0];
  }
  return at.id === first ? `node ${first} (${size(first)})` : `node ${at.id} (${size(at.id)}; the panel inside node ${first}, which is ${size(first)})`;
}

// ── clicks: the control, and what the click did ──
const NAMED = ['button', 'link', 'field'];
const cache = new Map(), treeOf = (i) => { if (!cache.has(i)) cache.set(i, screen(i)); return cache.get(i); };
manifest.clicks.forEach((c, k) => {
  const data = treeOf(c.screen);
  let what = 'a node that is not in the clean screen', control = c.nodeId;
  if (data?.node) {
    const parent = new Map(); walk(data.node, (n) => { for (const ch of n.childNodes ?? []) parent.set(ch.id, n.id); });
    const line = [c.nodeId]; for (let p = parent.get(c.nodeId); p != null; p = parent.get(p)) line.push(p);
    const named = elementsIn(data.node, null, null).filter((e) => line.includes(e.node) && NAMED.includes(e.role)).sort((a, b) => line.indexOf(a.node) - line.indexOf(b.node))[0];
    const own = elementsIn(data.node, null, null).find((e) => e.node === c.nodeId);
    if (named) { control = named.node; what = `${named.role} ${named.node} <${named.tag}> "${named.text}"`; }
    else what = own ? `${own.role} ${own.node} <${own.tag}> "${own.text}" (no button, link or field around it)` : `node ${c.nodeId} (nothing with a name around it)`;
  }
  // the snapshot in force at the click against the next one captured after it
  const next = manifest.screens.find((s) => s.t > c.t + 0.05), after = next && treeOf(next.i);
  let did = 'nothing captured after it';
  if (data?.node && after?.node) {
    const found = findChange({ node: data.node, href: manifest.screens[c.screen].href }, { node: after.node, href: next.href }, control);
    did = !found ? `no change found by screen ${next.i}` : found.kind === 'page' ? `the page changes: screen ${next.i}` : `opens ${panelOf(after.node, next.i, found.node)} (in screen ${next.i}; hidden until this click)`;
  }
  const again = manifest.clicks[k - 1] && manifest.clicks[k - 1].nodeId === c.nodeId && c.t - manifest.clicks[k - 1].t < 0.5;
  rows.push({ t: c.t, text: `CLICK ${k}  screen ${c.screen}  ${what}${again ? '  (again at once: a double or triple click, which selects)' : `  ->  ${did}`}` });
});

// ── gestures ──
const HOW = { inside: 'encloses', under: 'on', crossed: 'crosses' };
for (const g of gestures?.gestures ?? []) {
  const on = g.encloses.length ? `${HOW[g.encloses[0].how]} ${g.encloses.slice(0, 6).map((e) => `${e.role} ${e.node} "${e.label ? e.label + ': ' : ''}${e.text}"`).join(', ')}${g.encloses.length + (g.more ?? 0) > 6 ? `, and ${g.encloses.length + (g.more ?? 0) - 6} more` : ''}` : 'nothing with a name there';
  rows.push({ t: g.t0, text: `${g.kind.toUpperCase()} to ${g.t1.toFixed(1)}  screen ${g.screen}  strength ${g.strength.toFixed(2)}${g.turns ? `  ${g.turns} turns` : ''}  box ${g.box.x},${g.box.y} ${g.box.w}x${g.box.h}  ${on}` });
}

// ── speech: Whisper's words on the same clock, in phrases (a new one after 0.6 s of silence or at any event) ──
const starts = gestures?.clock?.micStartsAt ?? (manifest.mic ? (manifest.mic.t0 - manifest.t0) / 1000 : null);
if (speech) {
  const words = (read(path.join(P.transcript, 'mic.json'))?.segments ?? []).flatMap((s) => s.words ?? []).map((w) => ({ t: w.start + (starts ?? 0), end: w.end + (starts ?? 0), w: shut(String(w.word ?? '')) })).filter((w) => w.w);
  const marks = rows.map((r) => r.t).sort((a, b) => a - b);
  let phrase = null;
  const close = () => { if (phrase) rows.push({ t: phrase.t, text: `SAID to ${phrase.end.toFixed(1)}  "${phrase.words.join(' ')}"`, said: true }); phrase = null; };
  for (const w of words) {
    if (phrase && (w.t - phrase.end > 0.6 || marks.some((m) => m > phrase.end && m <= w.t))) close();
    if (!phrase) phrase = { t: w.t, end: w.end, words: [] };
    phrase.words.push(w.w); phrase.end = w.end;
  }
  close();
  if (!words.length) console.log('no speech in the transcript (no microphone, or silence): work from the clicks and gestures, and ask the author what each step is for');
}

console.log(`tutorial ${P.name}: ${manifest.screens.length} screens, ${manifest.clicks.length} clicks, ${(gestures?.gestures ?? []).length} gestures; viewport ${manifest.viewport.width}x${manifest.viewport.height}; the microphone starts at ${starts ?? 'no microphone'} s (already added to the speech times below)`);
for (const r of rows.sort((a, b) => a.t - b.t || (a.said ? 1 : -1))) console.log(`${r.t.toFixed(1).padStart(6)}  ${r.text}`);
