// The pointer evidence proved end to end on invented data: recording -> prepare -> probe -> gestures.json.
//   node --experimental-strip-types tools/make-fixture-gestures.mjs
// Takes the fixture recording of fixtures/site/keys.html (recordings/fixture-keys, made by the recorder on the fixture
// page; `npm run vendor` needs it too), and adds a pointer path nobody moved: a loop round the second "Copy" button, a
// rest on the heading, a straight pass across the password field. The result is a tutorial folder like any other,
// fixtures/tutorials/fixture-gestures/ (gitignored). Then it checks that gestures.json names those three controls.
// Exit 1 when it does not. Every value on the fixture page is made up.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepare } from './prepare-recording.mjs';
import { describe, makeGestures, probe } from './gestures.mjs';
import { elementsIn } from './scrub.mjs';
import { paths } from './paths.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url)), SOURCE = path.join(ROOT, 'recordings', 'fixture-keys', 'events.ndjson');
const P = paths(path.join(ROOT, 'fixtures', 'tutorials', 'fixture-gestures'));
if (!fs.existsSync(SOURCE)) { console.log('no fixture recording (recordings/fixture-keys): record fixtures/site/keys.html with the extension first'); process.exit(1); }

// 1. the fixture recording without any pointer of its own
const base = fs.readFileSync(SOURCE, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((e) => !(e.type === 3 && [1, 2, 3].includes(e.data?.source)));
const write = (events) => { fs.mkdirSync(P.recording, { recursive: true }); fs.writeFileSync(path.join(P.recording, 'events.ndjson'), events.map((e) => JSON.stringify(e)).join('\n')); };
write(base);
prepare(P.root, { log: () => {} });

// 2. where the three controls are, from the clean copy as it rebuilds
const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const tree = read(path.join(P.clean, 'screen-0.json')).node, boxes = (await probe(P.root, [0]))[0].boxes;
const all = elementsIn(tree, boxes, null).filter((e) => e.box);
const copy = all.filter((e) => e.role === 'button' && e.text === 'Copy')[1], heading = all.find((e) => e.tag === 'h1'), field = all.find((e) => e.tag === 'input' && e.role === 'field');
if (!copy || !heading || !field) { console.log('the fixture page is not what this expects (two Copy buttons, a heading, a field)'); process.exit(1); }
const mid = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

// 3. the pointer path: positions as the recorder sends them (batches every half second, about seven positions a second)
const snap = base.find((e) => e.type === 2).timestamp, pts = [];
let at = snap + 1000;
const go = (x, y, ms) => { at += ms; pts.push({ x: Math.round(x), y: Math.round(y), ts: at }); };
const c = mid(copy.box), rx = copy.box.w / 2 + 26, ry = copy.box.h / 2 + 22;
go(c.x - 300, c.y + 200, 0);
for (let i = 1; i <= 3; i++) go(c.x - 300 + (300 + rx) * i / 3, c.y + 200 - 200 * i / 3, 140);                         // arrive at the loop's right edge
for (let i = 1; i <= 10; i++) { const a = 2 * Math.PI * 1.05 * i / 10; go(c.x + rx * Math.cos(a), c.y + ry * Math.sin(a), 140); } // once round the button, a little past closed
const h = mid(heading.box), from = pts.at(-1);
for (let i = 1; i <= 4; i++) go(from.x + (h.x - from.x) * i / 4, from.y + (h.y - from.y) * i / 4, 140);                   // over to the heading
at += 1400;                                                                                                              // and stay: a still pointer sends nothing
const f = mid(field.box), y = f.y + 2, x0 = field.box.x - 180, x1 = field.box.x + field.box.w + 180;
go(h.x + 6, h.y + 3, 0);
for (let i = 1; i <= 3; i++) go(h.x + (x0 - h.x) * i / 3, h.y + (y - h.y) * i / 3, 150);                                  // down to the left of the field
at += 500;
for (let i = 0; i <= 5; i++) go(x0 + (x1 - x0) * i / 5, y + i, i ? 120 : 0);                                              // straight across it
const moves = [];
for (let i = 0; i < pts.length; i += 4) { const batch = pts.slice(i, i + 4), ts = batch.at(-1).ts; moves.push({ type: 3, timestamp: ts, data: { source: 1, positions: batch.map((p) => ({ x: p.x, y: p.y, id: 1, timeOffset: p.ts - ts })) } }); }
write([...base, ...moves].sort((a, b) => a.timestamp - b.timestamp));

// 4. the whole path again, as a tutorial would run it
prepare(P.root, { log: () => {} });
const { gestures, points } = await makeGestures(P.root);
console.log(`fixture-gestures: ${points} positions -> ${gestures.length} gestures`);
for (const g of gestures) console.log('  ' + describe(g));
const first = (kind) => gestures.filter((g) => g.kind === kind);
const checks = [
  ['one circle, and it encloses the second Copy button (and nothing else with a name)', first('circle').length === 1 && first('circle')[0].encloses.filter((e) => e.role !== 'text').map((e) => e.node).join() === String(copy.node) && first('circle')[0].encloses[0].how === 'inside'],
  ['a rest on the heading', first('rest').some((g) => g.encloses[0]?.node === heading.node && g.strength >= 0.5)],
  ['a sweep that crosses the password field', first('sweep').some((g) => g.encloses.some((e) => e.node === field.node && e.how === 'crossed'))],
  ['the circle is the strongest gesture', first('circle')[0]?.strength >= 0.7],
];
for (const [what, ok] of checks) console.log(`${ok ? 'ok  ' : 'FAIL'}  ${what}`);
process.exit(checks.every(([, ok]) => ok) ? 0 : 1);
