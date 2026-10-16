// The privacy check before anyone sees a film: nothing original reached a frame. That is all that fails it; style
// (camera, staging) is never its business. No OCR: it reads the rebuilt documents, built exactly as the film builds
// them: from the clean copy, with no rules (the stand-ins are already in it: tools/scrub.mjs).
//   node --experimental-strip-types tools/sweep.mjs --tutorial <tutorial folder> [--drop-blind <i>] [--drop-default <i>]
// Reads  <tutorial folder>/film/clean/ (manifest.json, the screens, changed.json: which nodes the scrub wrote, as what),
//        <tutorial folder>/recording/originals.json (read, never printed) and rules.json (its `keep` words);
//        it reads text, form values, every attribute that is not structure, CSS values, and the manifest's page addresses;
//        <tutorial folder>/film/beats.json (the film: which screens it shows, which nodes it names), film/clean/boxes.json
//        (tools/measure-boxes.mjs, compared as a note). Before there is a beat file, every screen of the clean copy
//        is read for originals.
// Prints counts and node ids only. NEVER a value: neither an original nor what a frame shows.
// --drop-blind i    leaves out blind rule i of rules.json; --drop-default i leaves out default rule i (DEFAULT_RULES):
//                   to prove the sweep fails when a rule is missing. Such a run scrubs the raw recording again into a
//                   temporary folder, reads that, and deletes it: the tutorial's clean copy is never made unclean, and
//                   no still of the unclean screens is kept.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { cellJudge, keptByWord, setUiText, staysAsRecorded } from './scrub.mjs';
import { assertPublicDir, paths, publicDirOf } from './paths.mjs';
import { extendsIn, unhidesIn, windowsIn } from './measure-boxes.mjs';

export { setUiText, staysAsRecorded }; // "counts, percentages, dates and UI text stay as recorded": the scrub's rule (tools/scrub.mjs), used here too
const norm = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();

/** letters and digits only, lower case: how a value reads once its punctuation and spacing are gone */
const squash = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

/** Where any original (4 characters or more) shows in what a screen would display. `seen`: [{ id, kind, s, hidden? }]
 *  from film/src/Sweep.tsx; `originals`: [{ kind, value }]. Text is checked node by node AND across the page's
 *  visible text nodes run together (a value split over several nodes), whitespace collapsed, case ignored.
 *  An original made only of letters counts where it stands as whole words, not inside a longer word (a short name in a
 *  hidden table must not fail every heading that happens to contain those letters); anything with a digit or a symbol
 *  counts wherever it appears, and is also looked for with everything but letters and digits stripped from both sides
 *  (6 characters or more after stripping), so it is caught when it comes back with other punctuation or spacing, or
 *  inside a generated label. A text is let through as "stays as recorded" only when EVERY original with that text is
 *  of an exempt kind. Returns [{ ids, where, original: kind, kinds, length, hidden }]: no values (`kinds`: every kind
 *  an original with that text has). */
export function findHits(seen, originals) {
  const byText = new Map();
  for (const o of originals) byText.set(norm(o.value), [...(byText.get(norm(o.value)) ?? []), o]);
  const needles = [...byText].filter(([v, all]) => v.length >= 4 && !all.every(staysAsRecorded)).map(([v, all]) => ({ v, kind: all.find((o) => !staysAsRecorded(o)).kind, kinds: [...new Set(all.map((o) => o.kind))].sort(), q: squash(v) }));
  const hits = [];
  const letter = /[\p{L}\p{N}]/u, wordy = (n) => /^[\p{L} ]+$/u.test(n.v);
  /** every place needle n occurs in s (both normalised) */
  const places = (s, n) => {
    const at = [];
    for (let i = s.indexOf(n.v); i >= 0; i = s.indexOf(n.v, i + 1)) if (!wordy(n) || (!letter.test(s[i - 1] ?? ' ') && !letter.test(s[i + n.v.length] ?? ' '))) at.push(i);
    return at;
  };
  // Stand-in sums are round figures ($100.00, $200.00, ...), and a recording may hold a real sum of the same figure.
  // Text the money rule itself wrote is a stand-in whatever it reads, so it is not counted against an original SUM.
  const money = (n) => /^-?[$€£] ?[\d,]*\.?\d*$/.test(n.v), text = new Map(seen.filter((e) => e.kind === 'text').map((e) => [e.id, e]));
  const FIGURES = ['money', 'fill', 'chart'], ours = (id) => FIGURES.includes(text.get(id)?.via); // a figure the money rule, a fill or a chart redraw wrote
  const standInMoney = (n, ids) => money(n) && ids.some(ours) && ids.every((id) => ours(id) || !(text.get(id)?.s ?? 'x').trim());
  const scan = (entries, hidden) => {
    // text: one string of all the nodes, with each node's place in it
    let page = '';
    const spans = [];
    for (const e of entries) if (e.kind === 'text') { const from = page.length; page += e.s.replace(/\s+/g, ' ').toLowerCase(); spans.push({ id: e.id, from, to: page.length }); }
    page = page.replace(/ {2,}/g, (m) => ' ' + '\u0000'.repeat(m.length - 1)); // keep the offsets: doubled spaces from node joins become fillers
    const flat = page.replaceAll('\u0000', ''), back = []; // flat index -> page index
    for (let i = 0; i < page.length; i++) if (page[i] !== '\u0000') back.push(i);
    for (const n of needles) {
      for (const at of places(flat, n)) {
        const a = back[at], b = back[at + n.v.length - 1];
        const ids = spans.filter((s) => s.from <= b && s.to > a).map((s) => s.id);
        if (!standInMoney(n, ids)) hits.push({ ids, where: 'text', original: n.kind, kinds: n.kinds, length: n.v.length, hidden });
      }
      for (const e of entries) if (e.kind !== 'text' && places(norm(e.s), n).length && !(money(n) && FIGURES.includes(e.via))) hits.push({ ids: [e.id], where: e.kind, original: n.kind, kinds: n.kinds, length: n.v.length, hidden });
    }
    // the same again with punctuation and spacing stripped from both sides (not for letters-only originals: stripped
    // of their spaces they would match inside any longer word)
    let run = '';
    const parts = [];
    for (const e of entries) if (e.kind === 'text') { const from = run.length; run += squash(e.s); if (run.length > from) parts.push({ id: e.id, from, to: run.length }); }
    for (const n of needles) {
      if (wordy(n) || n.q.length < 6) continue;
      for (let at = run.indexOf(n.q); at >= 0; at = run.indexOf(n.q, at + 1)) {
        const ids = parts.filter((p) => p.from < at + n.q.length && p.to > at).map((p) => p.id);
        if (!standInMoney(n, ids)) hits.push({ ids, where: 'text', original: n.kind, kinds: n.kinds, length: n.v.length, hidden });
      }
      // (a stylesheet is stripped one declaration at a time (`parts`: film/src/css.ts `cssParts`): stripped whole, the
      // numbers of unrelated declarations run together into digits no declaration holds. One without parts: whole.)
      for (const e of entries) if (e.kind !== 'text' && (e.kind === 'css' && Array.isArray(e.parts) ? e.parts : [e.s]).some((part) => squash(String(part)).includes(n.q)) && !(money(n) && FIGURES.includes(e.via))) hits.push({ ids: [e.id], where: e.kind, original: n.kind, kinds: n.kinds, length: n.v.length, hidden });
    }
  };
  scan(seen.filter((e) => !e.hidden), false);
  scan(seen.filter((e) => e.hidden), true);
  return [...new Map(hits.map((h) => [`${h.ids.join('+')} ${h.where} ${h.original} ${h.length} ${h.hidden}`, h])).values()]; // one per place, however it was found
}

/** The originals findHits does not look for because their whole value is a `keep` word (rules.json; set with
 *  setUiText): how many, by kind. Only where EVERY original with that text is let through, as findHits has it: a word
 *  that is also a key, a card, an account or tax number, a sum or a field's value is still looked for, and is not
 *  counted here. Returns { <kind>: count }: never a word. */
export function keptWords(originals) {
  const byText = new Map(), out = {};
  for (const o of originals) byText.set(norm(o.value), [...(byText.get(norm(o.value)) ?? []), o]);
  for (const all of byText.values()) if (all.every(staysAsRecorded)) for (const o of all) if (keptByWord(o)) out[o.kind] = (out[o.kind] ?? 0) + 1;
  return out;
}

/** What a film's narrated lists put on its frames (beats.json: a beat's `list.items[].text`), as `seen` entries for
 *  findHits. The text is authored, not recorded, but it is shown, so it is read like anything shown: an original
 *  typed into an item by mistake fails the sweep. `id`: the entry's place in this list of entries. */
export const listSeen = (beatFile) => (beatFile?.beats ?? []).flatMap((b) => (b.list?.items ?? []).map((it, item) => ({ line: b.line, item, kind: 'list', s: String(it?.text ?? '') }))).map((e, id) => ({ id, ...e }));

/** Confirmed interface text (rules.json `allow`: [{ screen, node }], `node` an ELEMENT of that screen): a person has
 *  read the clean screen and says the text this element shows is the interface's own label, heading or column name.
 *  Sorts one screen's showing hits into what still fails and what is allowed. A hit is at an allowed element when it
 *  is in text that stands directly in it (every text node of the hit) or in one of its attributes; never in a form
 *  value or a stylesheet. Only an original that is nothing but a table cell elsewhere on the page can be allowed: a
 *  hit of any other kind at an allowed element still fails, and is marked `refused` so the report can say so.
 *  `allow`: the element ids allowed in this screen. Returns { fails, allowed }: hits as findHits gives them. */
export function sortAllowed(hits, seen, allow = []) {
  const ok = new Set(allow), parent = new Map(seen.filter((e) => e.kind === 'text').map((e) => [e.id, e.p]));
  const fails = [], allowed = [];
  for (const h of hits) {
    const at = h.where === 'text' ? h.ids.length > 0 && h.ids.every((id) => ok.has(parent.get(id))) : h.where.startsWith('attr:') && ok.has(h.ids[0]);
    if (!at) fails.push(h);
    else if ((h.kinds ?? [h.original]).every((k) => ALLOWABLE.includes(k))) allowed.push(h);
    else fails.push({ ...h, refused: true });
  }
  return { fails, allowed };
}
/** The kinds of original an `allow` entry can cover: what a table cell held, a control's label inside one, and text
 *  an `only` rule hid on another screen (a mail client's "Search" is on the list; the product's own "Search" is not a leak). */
export const ALLOWABLE = ['cell', 'control', 'greeked', 'option']; // (and a select's option: every option is on the list, and an option's word is often the interface's)

/** Columns kept on purpose (rules.json `keepColumns`): the scrub left the TEXT of their cells as recorded because the
 *  user asked, and marked those text nodes `kept` (clean/changed.json), and an element whose `title` reads exactly as
 *  its kept text. Sorts one screen's showing hits into what still fails and what stands wholly in kept text: text
 *  whose every node is kept, or such a title. Nothing else: any other attribute, a field's value and a stylesheet
 *  fail as anywhere. Whatever the kind: the column was kept knowingly. The same value anywhere else still fails.
 *  `seen` entries carry `kept: true` only when this tutorial's own rules.json has `keepColumns`. Returns { fails, kept }. */
export function sortKept(hits, seen) {
  const text = new Set(seen.filter((e) => e.kept && e.kind === 'text').map((e) => e.id)), titled = new Set(seen.filter((e) => e.kept && e.kind === 'attr:title').map((e) => e.id));
  const fails = [], kept = [];
  for (const h of hits) ((h.where === 'text' ? h.ids.length > 0 && h.ids.every((id) => text.has(id)) : h.where === 'attr:title' && titled.has(h.ids[0])) ? kept : fails).push(h);
  return { fails, kept };
}

/** Interface text inside table cells (tools/scrub.mjs `cellJudge`): a control's label the scrub left on evidence is
 *  an original of kind `control`. Sorts one screen's showing hits into what still fails and what is such a label
 *  standing where the SAME judgement holds on the clean copy: text whose every node (blank ones aside) is in `labels`,
 *  the text nodes cellJudge calls interface in this clean screen, and whose originals are a control's label or what a
 *  cell held, as prepare's own look lists it (a text that is also a name, a company, an email or a number fails). Returns { fails, labels }. */
export function sortInterface(hits, seen, labels) {
  const blank = new Set(seen.filter((e) => e.kind === 'text' && !e.s.trim()).map((e) => e.id)), fails = [], ok = [];
  for (const h of hits) (h.where === 'text' && h.ids.some((id) => labels.has(id)) && h.ids.every((id) => labels.has(id) || blank.has(id)) && (h.kinds ?? [h.original]).every((k) => k === 'control' || k === 'cell') ? ok : fails).push(h);
  return { fails, labels: ok };
}

/** The text nodes of a clean screen that cellJudge calls interface text on evidence, and how many tables hold them. */
export function interfaceLabels(tree) {
  const judge = cellJudge(tree), ids = new Set(), tables = new Set();
  (function go(n, table) {
    if (n.type === 2 && n.tagName === 'table') table = n;
    if (n.type === 2 && n.tagName === 'td') { const found = judge(n).labels; for (const t of found) ids.add(t.id); if (found.length && table) tables.add(table); }
    n.childNodes?.forEach((c) => go(c, table));
  })(tree, null);
  return { ids, tables: tables.size };
}

/** The screens a film shows ONLY as a window of some of their nodes, and what shows of each: screen -> node ids. The
 *  film draws a windowed shot with everything outside the window's nodes hidden (Camera: `isolate`, RecordedScreen:
 *  `visibility:hidden`), so the sweep rebuilds such a screen the same way and counts the rest of the page as hidden.
 *  It errs on showing: a screen is left out, and so read whole, when any shot shows it without a window or with other
 *  nodes, when a shot becomes it or runs it in a sequence, when a window is named after its shot's first beat, or
 *  when a window's name is not a node of that screen. And every node the beat file names on a windowed screen is
 *  counted as showing with the window's own, inside it or not: a move may lift a named node out alone (Camera `Lifted`). */
export function isolatedIn(file) {
  const how = new Map(), add = (screen, key) => how.set(screen, (how.get(screen) ?? new Set()).add(key)); // screen -> the ways it is shown ('': whole)
  const named = file?.nodes ?? {};
  let shot = null; // the screen of the shot the beat is in (a shot: beats in a row on one screen; a scene ends it)
  for (const b of file?.beats ?? []) {
    const screen = b.scene ? null : b.screen ?? shot;
    if (b.scene) shot = null;
    if (screen != null) {
      const names = b.window == null ? [] : [b.window].flat(), at = names.map((name) => (Object.hasOwn(named, name) ? named[name] : null));
      const key = names.length && at.every((p) => Array.isArray(p) && p[0] === screen && Number.isInteger(p[1])) ? [...new Set(at.map((p) => p[1]))].sort((x, y) => x - y).join(',') : '';
      if (shot !== screen) add(screen, key); else if (names.length) add(screen, '');
      shot = screen;
    }
    for (const c of [b.change, ...(Array.isArray(b.then) ? b.then : []).map((a) => a?.change)]) if (c?.kind === 'becomes') add(c.screen, '');
    if (b.sequence) {
      const { from, watch, then } = b.sequence, to = watch ?? from;
      if (!Number.isInteger(from) || !Number.isInteger(to) || to - from > 10000) return {}; // a run that cannot be read: nothing is taken for hidden
      for (let i = from; i <= to; i++) add(i, '');
      for (const i of Array.isArray(then) ? then : []) add(i, '');
    }
  }
  const out = {};
  for (const [screen, keys] of how) {
    const [key] = keys;
    if (keys.size === 1 && key) out[screen] = [...new Set([...key.split(',').map(Number), ...Object.values(named).filter((p) => Array.isArray(p) && p[0] === screen && Number.isInteger(p[1])).map((p) => p[1])])];
  }
  return out;
}

/** Does `node` name an element of this clean screen (a serialized tree)? Returns its tag, or null. */
export function elementIn(tree, node) {
  let tag = null;
  (function walk(n) { if (tag) return; if (n.id === node && n.type === 2) { tag = n.tagName; return; } n.childNodes?.forEach(walk); })(tree);
  return tag;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const flag = (f) => args.includes(f), opt = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : undefined);
  if (!opt('--tutorial')) { console.log('usage: sweep.mjs --tutorial <tutorial folder> [--drop-blind <i>] [--drop-default <i>]'); process.exit(1); }
  const P = paths(opt('--tutorial')), tutorial = P.root, name = P.name;
  const num = (f) => (opt(f) != null ? Number(opt(f)) : undefined), dropBlind = num('--drop-blind'), dropDefault = num('--drop-default'), dropping = dropBlind != null || dropDefault != null;
  // a drop run reads a copy scrubbed without that rule, made in a temporary folder that is deleted whatever happens
  const temp = dropping ? fs.mkdtempSync(path.join(os.tmpdir(), 'ct-sweep-')) : null, publicDir = temp ? path.join(temp, 'film') : publicDirOf(tutorial), rec = path.join(publicDir, 'clean');
  const outDir = temp ? path.join(temp, 'out') : P.out; // stills are never written into the public dir
  const tidy = []; // folders to delete on the way out
  if (temp) {
    tidy.push(temp);
    const { prepare } = await import('./prepare-recording.mjs');
    prepare(tutorial, { out: rec, dropBlind, dropDefault, keepOriginals: true, log: () => {} });
    console.log(`drop run: ${dropBlind != null ? `blind rule ${dropBlind}` : ''}${dropBlind != null && dropDefault != null ? ' and ' : ''}${dropDefault != null ? `default rule ${dropDefault}` : ''} left out; reading a temporary copy`);
  }
  const leave = (code) => { for (const d of tidy) fs.rmSync(d, { recursive: true, force: true }); process.exit(code); };
  const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
  const manifest = read(`${rec}/manifest.json`), beatFile = fs.existsSync(P.beats) ? read(P.beats) : null, nodes = beatFile?.nodes ?? {};
  // the screens the film shows or measures; with no beat file yet, every screen of the clean copy
  // (every capture a shot becomes and every screen of a sequence is a screen the film shows: beats.ts `screensShown`)
  const shownBy = beatFile ? (await import(pathToFileURL(path.resolve('film/src/tutorial/beats.ts')).href)).screensShown(beatFile, manifest.screens.map((s) => s.i)) : [];
  const screens = (beatFile ? [...new Set([...shownBy,...Object.values(nodes).map(([s]) => s)])] : manifest.screens.map((s) => s.i)).sort((a, b) => a - b);
  let failed = false;
  const fail = (msg) => { failed = true; console.log('FAIL  ' + msg); };

  // 1. rebuild the screens as the film does and read them
  // The page reports through its console, which the renderer hands us whole (the CLI's own log wraps and cuts long
  // lines). @remotion/bundler and @remotion/renderer are what @remotion/cli itself runs on, at the same version.
  fs.mkdirSync(outDir, { recursive: true });
  assertPublicDir(publicDir);
  const { bundle } = await import('@remotion/bundler');
  const { selectComposition, renderStill } = await import('@remotion/renderer');
  // a windowed screen is read as the film lays it out (`windows`) and, when the film shows it no other way, as the
  // film draws it: only the window's nodes showing (`isolate`: isolatedIn, above)
  const isolate = isolatedIn(beatFile);
  const inputProps = { screens, nodes, windows: windowsIn(beatFile), unhides: unhidesIn(beatFile), isolate, extend: extendsIn(beatFile) };
  let report;
  // the tutorial's one-off moves go into the bundle first; one that reads outside itself fails the sweep (file names and the patterns hit: no page text)
  try { await (await import('./one-offs.mjs')).syncOneOffs(tutorial); } catch (e) { console.log(`FAIL  ${String(e?.message ?? e)}`); leave(1); }
  try {
    const serveUrl = await bundle({ entryPoint: path.resolve('film/src/index.ts'), publicDir });
    if (path.resolve(serveUrl).toLowerCase().startsWith(fs.realpathSync(os.tmpdir()).toLowerCase()) || /remotion-webpack-bundle-/.test(path.basename(serveUrl))) tidy.push(serveUrl); // the bundle holds a copy of the public dir: not left behind
    const composition = await selectComposition({ serveUrl, id: 'Sweep', inputProps, logLevel: 'error' });
    // the renderer also echoes the page's console; that would put page text on the terminal, so it is muted meanwhile
    const out = process.stdout.write, err = process.stderr.write;
    process.stdout.write = process.stderr.write = () => true;
    try { await renderStill({ composition, serveUrl, output: path.join(outDir, 'sweep.png'), inputProps, logLevel: 'error', onBrowserLog: (log) => { if (log.text.startsWith('RT-SWEEP:')) report = JSON.parse(log.text.slice(9)); } }); }
    finally { process.stdout.write = out; process.stderr.write = err; }
  } catch (e) { console.log(`FAIL  could not rebuild the screens: ${String(e?.name ?? 'error')}`); leave(1); } // the message may hold page text: not echoed
  if (!report) { console.log('FAIL  the Sweep composition did not report'); leave(1); }

  // which nodes the scrub wrote, and as what (clean/changed.json): a figure it wrote is a stand-in whatever it reads
  // (and which it left as recorded on purpose: `kept`, honoured only when THIS tutorial's rules.json names columns to keep)
  const rules = fs.existsSync(P.rules) ? read(P.rules) : {};
  const keeps = (Array.isArray(rules.keepColumns) ? rules.keepColumns : []).filter((k) => Array.isArray(k?.columns));
  const changed = read(path.join(rec, 'changed.json'));
  for (const s of report.screens) {
    const via = new Map();
    for (const c of changed[s.screen] ?? []) via.set(c.id, [...(via.get(c.id) ?? []), c.kind]);
    for (const e of s.seen) { const k = via.get(e.id); if (k) { e.via = k.find((x) => ['money', 'fill', 'chart'].includes(x)) ?? k[0]; if (keeps.length && k.includes('kept')) e.kept = true; } }
  }

  // 2. originals
  const originals = read(P.originals).values;
  setUiText(rules.keep ?? []);
  const kept = originals.filter((o) => ['cell', 'greeked', 'option'].includes(o.kind) && staysAsRecorded(o)).length;
  console.log(`sweep ${name}: ${(rules.blind ?? []).length} blind rules, ${(rules.fill ?? []).length + (rules.chart ?? []).length} fills, ${originals.filter((o) => norm(o.value).length >= 4 && !staysAsRecorded(o)).length} originals of 4+ characters, screens ${screens.join(', ')}; ${kept} table cells stay as recorded (dates, zero sums, percentages, UI text) and are not counted`);
  // `keep` words (rules.json): an original that is exactly one is not looked for, unless it is of a secret kind. Counted
  // by kind on every run, so what the words let through stays in sight (the words themselves are in rules.json)
  if ((rules.keep ?? []).length) {
    const by = keptWords(originals), kinds = Object.keys(by).sort();
    console.log(`  keep (words that may show): ${rules.keep.length} word${rules.keep.length === 1 ? '' : 's'} in rules.json; originals that are exactly one of them and are not looked for: ${kinds.length ? kinds.map((k) => `${by[k]} ${k}`).join(', ') : 'none'}. A key, a card, account or tax number, a sum or a field's value is looked for whatever the words say.`);
  }
  // confirmed interface text (rules.json `allow`): listed on every run, so what was let through stays in sight
  const allow = (Array.isArray(rules.allow) ? rules.allow : []).filter((a) => Number.isInteger(a?.screen) && Number.isInteger(a?.node));
  if (allow.length) {
    console.log(`  allow (confirmed interface text): ${allow.length} element${allow.length === 1 ? '' : 's'}; an original that is only a table cell elsewhere may show in their text or attributes`);
    for (const a of allow) {
      const file = path.join(rec, `screen-${a.screen}.json`), tag = fs.existsSync(file) ? elementIn(read(file).node, a.node) : null;
      console.log(`      screen ${a.screen}  node ${a.node}  ${tag ? `<${tag}>` : 'NOT FOUND in that screen: allows nothing'}${screens.includes(a.screen) ? '' : '  (a screen the film does not show)'}`);
    }
  }
  // columns kept on purpose (rules.json `keepColumns`): listed on every run, like the allowances
  if (keeps.length) {
    console.log(`  keepColumns (kept on purpose, as recorded): ${keeps.length} rule${keeps.length === 1 ? '' : 's'}; an original may show inside the kept cells of these columns, and nowhere else`);
    for (const k of keeps) console.log(`      ${k.screen == null ? 'every screen' : `screen ${k.screen}`}  table ${typeof k.table === 'object' ? `near "${k.table?.near}"` : k.table}  columns: ${k.columns.map((c) => `"${c}"`).join(', ')}`);
  }
  // what was looked for is what was replaced: the automatic kinds (secrets, account numbers, money), and whatever this tutorial switched on
  console.log(`  replaced by rule: secrets, account numbers and money (always)${Array.isArray(rules.use) && rules.use.length ? `; switched on for this tutorial: ${rules.use.join(', ')}` : '; nothing else switched on'}${(rules.blindColumns ?? []).length ? `; ${rules.blindColumns.length} blindColumns rule${rules.blindColumns.length === 1 ? '' : 's'}` : ''}. Text no rule replaced is not looked for.`);
  // pages hidden but for what is kept (rules.json `only`): listed on every run; what they hid is on the originals list (`greeked`)
  const onlys = Array.isArray(rules.only) ? rules.only : [];
  if (onlys.length) {
    console.log(`  only (pages of other people's text, hidden but for what is kept): ${onlys.length} rule${onlys.length === 1 ? '' : 's'}; ${originals.filter((o) => o.kind === 'greeked').length} hidden texts are looked for in every frame`);
    for (const o of onlys) console.log(`      ${o?.screens == null ? 'every screen' : Array.isArray(o.screens) ? `screens ${o.screens.join(', ')}` : `screens ${o.screens.from} to ${o.screens.to}`}${o?.host ? `  host ${o.host}` : ''}  keeps: ${(o?.keep ?? []).map((k) => (typeof k === 'number' ? `node ${k}` : `"${k}"`)).join(', ') || 'nothing'}${o?.all ? '  (every match)' : ''}`);
  }
  let labelCount = 0, labelTables = 0;
  for (const s of report.screens) {
    const hits = findHits(s.seen, originals), hid = hits.filter((h) => h.hidden);
    const { fails: notKept, kept: keptHits } = sortKept(hits.filter((h) => !h.hidden), s.seen);
    // interface text in table cells: the judgement is made again, on this clean screen; a `control` original may show only there
    const file = path.join(rec, `screen-${s.screen}.json`), ui = fs.existsSync(file) ? interfaceLabels(read(file).node) : { ids: new Set(), tables: 0 };
    labelCount += ui.ids.size; labelTables += ui.tables;
    const { fails: notLabels, labels: labelHits } = sortInterface(notKept, s.seen, ui.ids);
    const { fails: shown, allowed } = sortAllowed(notLabels, s.seen, allow.filter((a) => a.screen === s.screen).map((a) => a.node));
    const count = (k) => s.seen.filter((e) => (k === 'attr' ? e.kind.startsWith('attr:') : e.kind === k)).length;
    console.log(`  screen ${s.screen}: ${count('text')} text nodes, ${count('value')} form values, ${count('attr')} attributes, ${count('css')} stylesheets checked; ${shown.length} originals showing, ${hid.length} in hidden parts${allowed.length ? `, ${allowed.length} allowed` : ''}${keptHits.length ? `, ${keptHits.length} in columns kept on purpose` : ''}`);
    if (isolate[s.screen]) console.log(`    read as the film's window: only nodes ${isolate[s.screen].join(', ')} and what is in them show (the window's and every node the beat file names here); the rest of the page is hidden`);
    if (ui.ids.size) console.log(`    kept as interface text: ${ui.ids.size} labels in ${ui.tables} table${ui.tables === 1 ? '' : 's'} (a menu's items, a control's label that repeats down its column); look at them in a frame`);
    const chart = s.seen.filter((e) => e.svg && e.s.trim());
    console.log(`    chart (SVG) text: ${chart.length} nodes read, ${chart.filter((e) => e.via).length} replaced by stand-ins${chart.some((e) => e.via) ? ` (${[...new Set(chart.filter((e) => e.via).map((e) => e.via))].join(', ')})` : ''}`);
    const kindsOf = (h) => (h.refused ? (h.kinds ?? [h.original]).filter((k) => !ALLOWABLE.includes(k)).join(', ') : h.original);
    const list = (hs) => [...new Map(hs.map((h) => [`${h.ids.join('+')} ${h.where} ${h.original}`, h])).values()].map((h) => `      node ${h.ids.join('+')}  ${h.where}  (a ${kindsOf(h)}, ${h.length} characters)${h.refused ? '  at an allowed element, but the allowance covers table cells and their controls only, not this kind' : ''}`).join('\n');
    if (allowed.length) console.log(`    allowed (confirmed interface text):\n${list(allowed)}`);
    if (keptHits.length) console.log(`    kept on purpose (keepColumns), shown as recorded:\n${list(keptHits)}`);
    if (labelHits.length) console.log(`    kept as interface text, shown as recorded:\n${list(labelHits)}`);
    if (shown.length) fail(`screen ${s.screen}: an original value would show in a frame:\n${list(shown)}`);
    if (hid.length) console.log(`    hidden, so not in a frame as recorded (the film must not reveal them):\n${list(hid)}`);
  }
  console.log(`  kept as interface text: ${labelCount} labels in ${labelTables} tables, over the screens read`);

  // the manifest is part of the clean copy: its page addresses are checked like any attribute
  const addresses = manifest.screens.map((s) => { let href = s.href ?? ''; try { href = decodeURIComponent(href); } catch {} return { id: s.i, kind: 'href', s: href }; });
  const inAddresses = findHits(addresses, originals);
  console.log(`  manifest: ${addresses.length} page addresses checked; ${inAddresses.length} originals in them`);
  if (inAddresses.length) fail(`an original value is in a page address of the clean copy's manifest:\n${inAddresses.map((h) => `      screen ${h.ids.join('+')}  (a ${h.original}, ${h.length} characters)`).join('\n')}`);

  // a narrated list's text is authored, but it is on the frames: checked like any text shown (nothing is allowed here)
  const { loadMoves, moveMap } = await import('./moves.mjs');
  const moves = moveMap(await loadMoves()), moveOf = (n) => moves[n] ?? null; // the library and the synced one-offs
  const listed = listSeen(beatFile), inLists = findHits(listed, originals);
  if (listed.length) console.log(`  lists: ${listed.length} item texts checked; ${inLists.length} originals in them`);
  // so is what a browser bar shows, what a library move or a one-off says it shows, and what a `fills` draws into a field (film/src/tutorial/beats.ts `authoredText`)
  const authored = beatFile ? (await import(pathToFileURL(path.resolve('film/src/tutorial/beats.ts')).href)).authoredText(beatFile, moveOf).map((a, id) => ({ id, kind: 'authored', ...a })) : [];
  const inAuthored = findHits(authored, originals);
  if (authored.length) console.log(`  authored text (a bar, a field the film fills, a move's words): ${authored.length} strings checked; ${inAuthored.length} originals in them`);
  if (inAuthored.length) fail(`an original value is in text the beat file authors (film/beats.json):\n${[...new Map(inAuthored.map((h) => [`${h.ids[0]} ${h.original}`, h])).values()].map((h) => `      line ${authored[h.ids[0]].line}, a ${authored[h.ids[0]].what}  (a ${h.original}, ${h.length} characters)`).join('\n')}`);
  if (inLists.length) fail(`an original value is in a list's text (film/beats.json):\n${[...new Map(inLists.map((h) => [`${h.ids[0]} ${h.original}`, h])).values()].map((h) => `      line ${listed[h.ids[0]].line}, item ${listed[h.ids[0]].item}  (a ${h.original}, ${h.length} characters)`).join('\n')}`);

  // 3. boxes: notes only. Stale boxes misplace a cursor or a framing; they show nobody anything original, so they
  //    never fail the sweep. (How the film came out, the camera included, is the stills' `notes:` line, not this check.)
  const measured = Object.assign({}, ...report.screens.map((s) => s.boxes));
  for (const b of Object.values(measured)) for (const k of ['x', 'y', 'w', 'h']) b[k] = +b[k].toFixed(2);
  const missing = Object.keys(nodes).filter((k) => !measured[k]);
  if (missing.length) console.log(`  note: nodes not found in the rebuilt screens: ${missing.join(', ')}`);
  if (beatFile) {
    const boxes = fs.existsSync(P.boxes) ? read(P.boxes) : {};
    const off = Object.keys(nodes).filter((k) => !boxes[k] || !measured[k] || ['x', 'y', 'w', 'h'].some((d) => Math.abs(boxes[k][d] - measured[k][d]) > 0.5));
    if (off.length) console.log(`  note: clean/boxes.json differs from the rebuilt screens for: ${off.join(', ')} (measure again: npm run measure -- <tutorial folder>)`);
    else console.log(`  boxes: ${Object.keys(nodes).length} match the rebuilt screens`);
  }
  console.log(failed ? 'SWEEP FAILED' : 'SWEEP PASSED');
  leave(failed ? 1 : 0);
}
