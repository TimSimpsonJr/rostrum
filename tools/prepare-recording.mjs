// Raw recording (<tutorial>/recording/) -> the clean copy (<tutorial>/film/clean/): the only form of a recording that
// an agent opens or a frame is rendered from. Where things live: tools/paths.mjs.
//   manifest.json   { t0, viewport, screens: [{ i, t, path, href }], clicks: [{ t, nodeId, x, y, screen }], mic: { file, t0 } | null }
//                   (`mic.file` names the take in the RAW recording folder; it is not copied here)
//   screen-<i>.json one full snapshot's data ({ node, initialOffset }), every remote URL made local or dead, and every
//                   secret, account number and sum already replaced by its stand-in (tools/scrub.mjs: the default rules, what rules.json switches on, plus
//                   <tutorial>/rules.json = { blind, fill, chart, keep, keepColumns })
//   changed.json    { "<screen>": [{ id, kind }] }: the nodes the scrub wrote and as what (the sweep's `via`), and the
//                   nodes it left as recorded on purpose (`kept`: rules.json keepColumns). No text.
//   pointer.json    { points: [{ t, x, y, screen }], scrolls: [{ t, id, x, y, screen }] }: where the pointer went (buildPointer)
//   assets/<file>   stylesheets, fonts and images the screens point at (stored by the recorder, or cut out of the snapshot)
// and, beside the raw recording, <tutorial>/recording/originals.json = { values: [{ kind, value }] }: what the sweep
// looks for in frames. Never print, open or commit it.
// A recording with pauses has <tutorial>/recording/segments.json = { segments: [{ from, to }] } (wall-clock ms): the time
// between segments is taken out of the clock first (tools/segments.mjs), so every `t` above is on a clock with no gaps.
// Asset URLs inside the screens are written as `rostrum-asset:/<file>`; RecordedScreen swaps that prefix for the real
// static URL when it loads a screen. Prints structure only (counts, hosts, kinds), never values.
// usage: node --experimental-strip-types tools/prepare-recording.mjs <tutorial folder>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { makeLedger } from '../film/src/standins.ts';
import { resolveUser, rulesFor, scrub } from './scrub.mjs';
import { paths } from './paths.mjs';
import { collapse, collapseEvents } from './segments.mjs';

const hostOf = (href) => { try { return new URL(href).host; } catch { return undefined; } };
export const MISSING = 'about:blank#missing';
export const ASSET = 'rostrum-asset:/';
const META = 4, FULL = 2, INCR = 3, MOUSE_SOURCE = 2, CLICK = 2, MOVE_SOURCE = 1, SCROLL_SOURCE = 3, RESIZE_SOURCE = 4; // per docs/spike/api-notes.md
// Never fetched, so left as they are: inline data, fragments, already-local assets, XML namespace names.
const INERT = /^(data:|blob:|about:|#|rostrum-asset:|https?:\/\/www\.w3\.org\/)/i;

/** Replaces every `url(...)` and `@import "..."` target in a CSS string, resolved against `baseUrl`, with its entry in
 *  `map` (an object, or a function of the absolute URL) or with MISSING. `onMissing(absoluteUrl)` hears about each miss. */
export function rewriteUrls(text, baseUrl, map, onMissing) {
  const get = typeof map === 'function' ? map : (u) => map[u];
  const swap = (raw) => {
    const u = raw.trim();
    if (!u || INERT.test(u)) return null;
    let abs;
    try { abs = new URL(u, baseUrl); } catch { onMissing?.(u); return MISSING; }
    const full = abs.href;
    abs.hash = '';
    let hit = get(full);
    if (hit == null && abs.href !== full) { const h = get(abs.href); if (h != null) hit = h + full.slice(abs.href.length); } // x.svg#icon
    if (hit == null) { onMissing?.(full); return MISSING; }
    return hit;
  };
  return text
    .replace(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)"']*))\s*\)/gi, (m, a, b, c) => { const r = swap(a ?? b ?? c); return r == null ? m : `url("${r}")`; })
    .replace(/@import\s+(?:"([^"]*)"|'([^']*)')/gi, (m, a, b) => { const r = swap(a ?? b); return r == null ? m : `@import "${r}"`; });
}

/** Screens (consecutive identical snapshots of one page at one size collapse into the first) and clicks, in seconds
 *  from the first event. Each screen carries the window's CSS size when it was taken (`viewport`): rrweb sends a Meta
 *  event before every full snapshot and a ViewportResize when the window or its zoom changes, so a recording that
 *  crosses two sites at two zoom levels has screens of two sizes. `manifest.viewport` stays the first screen's. */
export function buildManifest(events) {
  const t0 = events[0].timestamp, sec = (ts) => (ts - t0) / 1000;
  const meta = events.find((e) => e.type === META);
  let viewport = { width: meta?.data.width ?? 1280, height: meta?.data.height ?? 720 };
  const size = (d) => (d && d.width > 0 && d.height > 0 ? { width: d.width, height: d.height } : null);
  const entries = [], screens = [];
  let last;
  for (const e of events) {
    if (e.type === META) viewport = size(e.data) ?? viewport;
    if (e.type === INCR && e.data.source === RESIZE_SOURCE) viewport = size(e.data) ?? viewport;
    if (e.type !== FULL) continue;
    const href = e.href ?? meta?.data.href ?? '';
    const key = href + '\n' + viewport.width + 'x' + viewport.height + '\n' + JSON.stringify(e.data.node);
    if (key === last) continue;
    last = key;
    entries.push({ i: entries.length, t: sec(e.timestamp), path: `screen-${entries.length}.json`, href, viewport: { ...viewport } });
    screens.push(e.data);
  }
  const clicks = events.filter((e) => e.type === INCR && e.data.source === MOUSE_SOURCE && e.data.type === CLICK).map((e) => {
    const t = sec(e.timestamp);
    return { t, nodeId: e.data.id, x: e.data.x, y: e.data.y, screen: ([...entries].reverse().find((s) => s.t <= t) ?? entries[0]).i };
  });
  return { manifest: { t0, viewport: entries[0]?.viewport ?? viewport, screens: entries, clicks }, screens };
}

/** The screens grouped by size, in order: [{ from, to, width, height }]. For the log and the understand stage. */
export function viewportRuns(screens) {
  const out = [];
  for (const s of screens) {
    const v = s.viewport, p = out.at(-1);
    if (p && p.width === v.width && p.height === v.height) p.to = s.i;
    else out.push({ from: s.i, to: s.i, width: v.width, height: v.height });
  }
  return out;
}

/** The pointer's path and the scrolls, in seconds from the first event, each with the screen in force:
 *  { points: [{ t, x, y, screen }], scrolls: [{ t, id, x, y, screen }] }. rrweb sends positions in batches (source 1,
 *  `positions[].timeOffset` back from the event's time) and scrolls one by one (source 3; `id` is the node scrolled,
 *  the document's for the page itself). Coordinates are window px. Evidence for tools/gestures.mjs, never choreography. */
export function buildPointer(events, manifest) {
  const t0 = events[0].timestamp, sec = (ts) => +((ts - t0) / 1000).toFixed(3);
  const screenAt = (t) => ([...manifest.screens].reverse().find((s) => s.t <= t) ?? manifest.screens[0])?.i ?? 0;
  const points = [], scrolls = [];
  for (const e of events) {
    if (e.type !== INCR) continue;
    if (e.data.source === MOVE_SOURCE) for (const p of e.data.positions ?? []) { const t = sec(e.timestamp + (p.timeOffset ?? 0)); points.push({ t, x: p.x, y: p.y, screen: screenAt(t) }); }
    else if (e.data.source === SCROLL_SOURCE) { const t = sec(e.timestamp); scrolls.push({ t, id: e.data.id, x: e.data.x, y: e.data.y, screen: screenAt(t) }); }
  }
  points.sort((a, b) => a.t - b.t);
  return { points, scrolls };
}

/** A page's address as the clean copy may keep it: its site, and of its path only the segments that are plain words
 *  (letters, hyphens and underscores; no digits, no dots; 30 characters at most). Every other segment becomes `-`: an
 *  id, an email, a token, a file name, anything percent-encoded that does not decode to a plain word, and any segment
 *  holding the signed-in user's first or last name. The path is DECODED before it is judged. No query, no fragment. */
export function cleanHref(href, user = null) {
  let u;
  try { u = new URL(href); } catch { return ''; }
  if (!/^https?:$/.test(u.protocol)) return '';
  const names = user ? [user.first, user.last].filter((w) => w && w.length >= 3).map((w) => w.toLowerCase()) : [];
  const plain = (seg) => {
    let s;
    try { s = decodeURIComponent(seg); } catch { return null; }
    return /^[A-Za-z_-]{1,30}$/.test(s) && !names.some((w) => s.toLowerCase().includes(w)) ? s : null;
  };
  return u.origin + u.pathname.split('/').map((seg) => (seg === '' ? '' : plain(seg) ?? '-')).join('/');
}

// What the sweep must never find in a frame (originals.json) comes from two places: what each rule of the scrub
// hands over as it replaces it (tools/scrub.mjs `opts.originals`: blind rules, hidden text, the kinds switched on),
// and this file's own look at the recording for the kinds that are replaced unasked (collectCandidates, below).
// Text of a kind nobody asked to replace is not on the list.
const URL_ATTRS = new Set(['src', 'href', 'poster', 'data', 'background', 'xlink:href', 'rr_src']);

// THE SWEEP'S OWN LOOK at the recording, made before the scrub and without asking it (security review, Oct 12 2026).
// If the list of originals were only what the scrub replaced, a secret the scrub MISSED would be missed by the sweep
// too: one judgement, twice. So every candidate of the kinds that are replaced unasked is collected here, by this
// file's own, looser shapes and by what the page calls things: keys and tokens, card, tax and account numbers, sums of
// money (also split over nodes), unmasked field values, every select's options, cells under a heading that says
// secret or money, elements whose id says secret; and the kinds a tutorial switched on (`use`). The sweep then proves
// none of them is on a frame whether or not a rule fired. Looser on purpose: what is listed here and was rightly
// left alone fails the sweep once, and is cleared by a blind rule, a `keep` word or an `allow`.
const AMOUNT = /[$€£]\s?(?:\d[\d,]*(?:\.\d+)?|\.\d+)/g;
// (a card, like an account number, is never the fraction of a decimal: not a run with a digit and a point right before
// it, "scale(0.4111111111111111)". Any other run of 13 to 19 digits is a candidate, whether or not it passes the card check.)
const WATCHED = { key: /eyJ[\w-]{5,}\.[\w-]{5,}\.[\w-]*|[\w+/=-]{20,}/g, card: /(?<![\d-])(?<!\d\.)\d(?:[ -]?\d){12,18}(?![\d-])/g, taxid: /(?<![\d-])(?:\d{3}-\d{2}-\d{4}|\d{2}-\d{7})(?![\d-])/g, account: /(?<!\d)(?<!\d\.)\d{8,}(?!\d)/g };
const SWITCHED = { emails: ['email', /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g], phones: ['phone', /\+?\d[\d\s().-]{8,}\d/g], numbers: ['digits', /\d{6,}/g] };
// a long token is a candidate key unless it is plainly words: no digit, no base64 sign, and vowels the way words have them
const maybeKey = (t) => /^eyJ/.test(t) || /[\d+/=]/.test(t) || (() => { const letters = t.replace(/[^A-Za-z]/g, '').toLowerCase(), v = (letters.match(/[aeiouy]/g) ?? []).length / (letters.length || 1); return v < 0.2 || v > 0.7 || /[^aeiouy]{5}/.test(letters); })();
const VALUE_ATTRS = /^(value|placeholder|alt|title|aria-label|content|data-.*)$/;
const SECRET_HEAD = /\b(?:api[ _-]?key|keys?|tokens?|secret|password|passcode|pin|bearer|account|acct|routing|iban|swift|card|cvv|cvc|tin|ssn|ein|tax|balance|amount|subtotal|fees?|price|charges?|cost|salary|revenue)\b/i;
const SECRET_NAME = /api[-_ ]?key|secret|token|passw(?:or)?d|bearer|private[-_ ]?key|access[-_ ]?key|(?:account|acct|card)[-_ ]?(?:number|no|num)|routing|tax[-_ ]?id/i;
/** Every candidate of one recorded screen: calls note(kind, value). `use`: the kinds this tutorial switched on. */
export function collectCandidates(tree, note, use = []) {
  const text = (n) => (n.type === 3 ? n.textContent ?? '' : (n.childNodes ?? []).map(text).join(''));
  const flat = (s) => s.replace(/\s+/g, ' ').trim();
  const shapes = (s) => {
    for (const [kind, re] of Object.entries(WATCHED)) for (const m of s.match(re) ?? []) if (kind !== 'key' || maybeKey(m)) note(kind, m);
    for (const m of s.match(AMOUNT) ?? []) if (/[1-9]/.test(m)) note('amount', m);
    for (const name of use) if (SWITCHED[name]) for (const m of s.match(SWITCHED[name][1]) ?? []) note(SWITCHED[name][0], m);
  };
  // column headings by position (a thead's first row), for the cells under them
  const headings = new Map();
  (function tables(n) {
    if (n.type === 2 && n.tagName === 'table') {
      let head = null; (function find(x) { if (!head && x.tagName === 'thead') head = x; else if (x === n || x.tagName !== 'table') x.childNodes?.forEach(find); })(n);
      const row = head && (function tr(x) { return x.tagName === 'tr' ? x : (x.childNodes ?? []).map(tr).find(Boolean); })(head);
      const names = []; for (const c of row?.childNodes ?? []) if (c.tagName === 'th' || c.tagName === 'td') for (let k = Math.max(1, parseInt(c.attributes?.colspan ?? '1', 10) || 1); k > 0; k--) names.push(flat(text(c)));
      (function rows(x) { if (x !== n && x.tagName === 'table') return; if (x.tagName === 'tr' && x !== row) { let at = 0; for (const c of x.childNodes ?? []) if (c.tagName === 'td' || c.tagName === 'th') { headings.set(c, names[at] ?? ''); at += Math.max(1, parseInt(c.attributes?.colspan ?? '1', 10) || 1); } } x.childNodes?.forEach(rows); })(n);
    }
    n.childNodes?.forEach(tables);
  })(tree);
  (function go(n, inert) {
    if (n.type === 3) { if (!inert && !n.isStyle) shapes(n.textContent ?? ''); return; }
    const a = n.attributes;
    if (n.type === 2 && a && !inert) {
      const tag = n.tagName, kids = n.childNodes ?? [];
      if (kids.length > 1 && kids.length < 6) for (const m of flat(text(n)).slice(0, 40).match(AMOUNT) ?? []) if (/[1-9]/.test(m)) note('amount', m); // a sum split over nodes: <td><span>$</span>50.00</td>
      for (const [k, v] of Object.entries(a)) if (typeof v === 'string' && VALUE_ATTRS.test(k)) shapes(v);
      if ((tag === 'input' || tag === 'textarea') && !['hidden', 'checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'image', 'file'].includes(String(a.type ?? 'text').toLowerCase())) { note('field', flat(String(a.value ?? ''))); if (tag === 'textarea') note('field', flat(text(n))); }
      if (tag === 'option') note('option', flat(text(n)));
      if (tag === 'td' && (use.includes('cells') || SECRET_HEAD.test(headings.get(n) ?? ''))) note('cell', flat(text(n)));
      if (SECRET_NAME.test(`${a.id ?? ''} ${a.name ?? ''} ${a['data-testid'] ?? ''}`) && !['input', 'textarea', 'select', 'label', 'button', 'a', 'form', 'table'].includes(tag) && !/^h[1-6]$/.test(tag) && !kids.some((c) => c.type === 2 && !['span', 'b', 'i', 'em', 'strong', 'code', 'small'].includes(c.tagName)) && flat(text(n)).length <= 120) note('key', flat(text(n)));
    }
    for (const c of n.childNodes ?? []) go(c, inert || n.tagName === 'script' || n.tagName === 'style' || n.tagName === 'noscript');
  })(tree, false);
}

/** Writes `<tutorialDir>/clean/` from `<tutorialDir>/recording/`, scrubbed. Options:
 *  `from`: the raw recording, when it is not in the tutorial folder (the fixtures); the originals file is written there.
 *  `out`: where the clean copy goes, when not `<tutorialDir>/clean` (the sweep's drop-a-rule runs write to a temp folder).
 *  `rules`: the tutorial's rules instead of `<tutorialDir>/rules.json`. `dropBlind` / `dropDefault`: leave out that
 *  blind rule (index in rules.blind) or that default rule (index in DEFAULT_RULES); such a copy is NOT clean.
 *  `keepOriginals`: do not rewrite the originals file (drop runs: the list of a full prepare stands).
 *  Returns { manifest, applied: [{ screen, ok, node, tag, length }], user: boolean, kept: [{ screen, rule, ok, table,
 *  column, cells }] }: places and lengths, and every column kept on purpose (keepColumns); never text. */
/** The events of a recording, one JSON value a line. Read as bytes and cut at the newlines: a long recording of a
 *  heavy page is more than Node's longest string (about 512 MB), so the file is never one string. */
export function readEvents(file) {
  const buf = fs.readFileSync(file), events = [];
  for (let from = 0; from < buf.length;) {
    let to = buf.indexOf(10, from);
    if (to < 0) to = buf.length;
    if (to > from) events.push(JSON.parse(buf.toString('utf8', from, to)));
    from = to + 1;
  }
  return events;
}

export function prepare(tutorialDir, { from, out, rules, dropBlind, dropDefault, keepOriginals = false, log = console.log } = {}) {
  const P = paths(tutorialDir), src = from ?? P.recording, name = P.name;
  out ??= P.clean;
  if (!fs.existsSync(path.join(src, 'events.ndjson'))) throw new Error(`no recording in ${src}`);
  const events = readEvents(path.join(src, 'events.ndjson'));
  // a recording with pauses: the gaps are taken out of the clock before anything reads it (tools/segments.mjs)
  const segFile = path.join(src, 'segments.json');
  const segments = fs.existsSync(segFile) ? (JSON.parse(fs.readFileSync(segFile, 'utf8')).segments ?? []) : [];
  const clock = collapse(segments), kept = segments.length > 1 ? collapseEvents(events, segments) : events;
  if (!kept.length) throw new Error('no events outside the pauses');
  log(`segments: ${segments.length || 1}, ${events.length - kept.length} events inside pauses dropped`);
  const assets = fs.existsSync(path.join(src, 'assets.json')) ? JSON.parse(fs.readFileSync(path.join(src, 'assets.json'), 'utf8')) : {};
  const rulesFile = P.rules;
  rules ??= fs.existsSync(rulesFile) ? JSON.parse(fs.readFileSync(rulesFile, 'utf8')) : {};
  // this tool's own output, rebuilt whole; whatever else lives in clean/ (pointer path, gestures, boxes) is left alone
  fs.mkdirSync(out, { recursive: true });
  for (const f of fs.readdirSync(out)) if (f === 'assets' || f === 'manifest.json' || f === 'changed.json' || f === 'pointer.json' || f === 'mic.webm' || /^screen-\d+\.json$/.test(f)) fs.rmSync(path.join(out, f), { recursive: true, force: true });
  fs.mkdirSync(path.join(out, 'assets'), { recursive: true });

  const written = new Set(), missing = new Map(), originals = new Map();
  let misses = 0;
  const miss = (u) => {
    misses++;
    let host = 'unparsed', ext = '';
    try { const x = new URL(u); host = x.host; ext = path.posix.extname(x.pathname).toLowerCase(); } catch {}
    missing.set(`${host} ${ext || '(no extension)'}`, (missing.get(`${host} ${ext || '(no extension)'}`) ?? 0) + 1);
  };
  const cssCache = new Map();
  /** A stylesheet the recorder stored, with its own url()s made local; null when it was not stored. */
  const cssOf = (url) => {
    if (!assets[url]) return null;
    if (!cssCache.has(url)) {
      cssCache.set(url, ''); // an @import cycle ends here
      const raw = fs.readFileSync(path.join(src, 'assets', assets[url].file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      cssCache.set(url, rewriteUrls(raw, url, use, miss));
    }
    return cssCache.get(url);
  };
  /** The local name for a stored asset (copied on first use), or undefined. */
  function use(url) {
    const ent = assets[url];
    if (!ent) return undefined;
    const css = /^text\/css/i.test(ent.type);
    const file = css ? ent.file.replace(/\.[a-z0-9]+$/, '') + '.css' : ent.file; // served by extension, so a stylesheet must be .css
    if (!written.has(file)) {
      written.add(file);
      if (css) fs.writeFileSync(path.join(out, 'assets', file), cssOf(url).replaceAll(ASSET, './')); // a file's url()s are relative to it: its neighbours
      else fs.copyFileSync(path.join(src, 'assets', ent.file), path.join(out, 'assets', file));
    }
    return ASSET + file;
  }
  /** An inlined image (rrweb's rr_dataURL) written once by hash. */
  const dataAsset = (dataUrl) => {
    const m = /^data:image\/([a-z0-9]+)[^,]*;base64,(.*)$/is.exec(dataUrl);
    if (!m) return dataUrl;
    const bytes = Buffer.from(m[2], 'base64');
    const file = crypto.createHash('sha1').update(bytes).digest('hex').slice(0, 16) + '.' + m[1].toLowerCase().replace('jpeg', 'jpg');
    if (!written.has(file)) { written.add(file); fs.writeFileSync(path.join(out, 'assets', file), bytes); }
    return ASSET + file;
  };
  const local = (abs) => use(abs) ?? (abs.includes('#') ? use(abs.split('#')[0]) : undefined) ?? (miss(abs), MISSING);
  const note = (kind, value) => { if (value && !/^\*+$/.test(value)) originals.set(kind + '\n' + value, { kind, value }); };

  const localize = (n, page, inert) => {
    if (n.type === 3 && n.isStyle) n.textContent = rewriteUrls(n.textContent ?? '', page, use, miss);
    const a = n.attributes;
    if (n.type === 2 && a) {
      const tag = n.tagName;
      if (tag === 'input' && a.type === 'hidden' && a.value) a.value = ''; // rrweb does not mask these; no frame needs them
      if (tag === 'script') delete a.src;                                    // rebuilt as an inert <noscript>
      if (tag === 'link' && /stylesheet/i.test(a.rel ?? '') && a.href && !a._cssText) {
        // left external by rrweb (cross-origin rules are unreadable in the page): inline the stored copy, the way rrweb does
        const css = cssOf(a.href);
        if (css != null) { a._cssText = css; delete a.rel; delete a.href; }
      } else if (typeof a._cssText === 'string') a._cssText = rewriteUrls(a._cssText, a.href ?? page, use, miss);
      if (tag === 'img' || tag === 'source') { delete a.srcset; delete a.sizes; }
      if (tag === 'img' && a.rr_dataURL) {
        if (!(a.src && assets[new URL(a.src, page).href])) a.src = dataAsset(a.rr_dataURL); // prefer the file as served
        delete a.rr_dataURL;
      }
      for (const [k, v] of Object.entries(a)) {
        if (typeof v !== 'string' || !v || k === '_cssText' || k === 'rr_dataURL' || k.startsWith('xmlns')) continue;
        if ((tag === 'a' && k === 'href') || (tag === 'form' && k === 'action')) continue; // where a link goes is not a fetch
        if (k === 'style') a.style = rewriteUrls(v, page, use, miss);
        else if (URL_ATTRS.has(k)) { if (!INERT.test(v)) { try { a[k] = local(new URL(v, page).href); } catch { a[k] = (miss(v), MISSING); } } }
        else if (/https?:\/\//i.test(v)) a[k] = v.replace(/https?:\/\/[^\s"'<>)]+/gi, (u) => (INERT.test(u) ? u : local(u)));
      }
    }
    for (const c of n.childNodes ?? []) localize(c, page, inert || n.tagName === 'script' || n.tagName === 'style' || n.tagName === 'noscript');
  };

  const { manifest, screens } = buildManifest(kept);
  // the sweep's own look, before anything is replaced (collectCandidates, above)
  for (const data of screens) collectCandidates(data.node, note, Array.isArray(rules.use) ? rules.use : []);
  const missed = screens.map((data, i) => { const before = misses; localize(data.node, manifest.screens[i].href, false); return misses - before; });

  // The signed-in user, per SITE of the recording, and only when asked: a `user` rule for that site (the element that
  // holds the name, or `off`), or `use: ["user"]` (detection). Never unasked: tools/scrub.mjs `resolveUser`.
  const hosts = [...new Set(manifest.screens.map((s) => hostOf(s.href) ?? ''))];
  const userRules = (Array.isArray(rules.user) ? rules.user : rules.user ? [rules.user] : []).filter((u) => u && typeof u === 'object');
  const detect = Array.isArray(rules.use) && rules.use.includes('user');
  const who = new Map(hosts.map((host) => {
    const mine = userRules.filter((u) => u.host == null || String(u.host).toLowerCase() === host.toLowerCase());
    const asked = mine.length > 0 || detect;
    return [host, { host, asked, ...(asked ? resolveUser(manifest.screens.filter((s) => (hostOf(s.href) ?? '') === host).map((s) => ({ i: s.i, tree: screens[s.i].node })), mine, detect) : { user: null, by: 'none' }), replacements: 0, screens: 0 }];
  }));
  for (const { user } of who.values()) if (user) for (const value of new Set([user.full, user.first, user.last])) note('name', value);
  const anyUser = [...who.values()].some((w) => w.user);
  // The scrub: every screen, one ledger (so screens agree).
  const ledger = makeLedger(), changed = {}, applied = [], dropped = new Set(), blinded = [], blindAllDone = [], asked = [], keptHeaders = [], hid = [], blindedColumns = [];
  screens.forEach((data, i) => {
    const host = hostOf(manifest.screens[i].href), mine = who.get(host ?? '');
    const did = scrub(data.node, rulesFor(rules, i, { dropBlind, dropDefault, host }), ledger, { user: mine.user, originals: blinded });
    const swapped = did.changed.filter((c) => c.kind === 'user').length;
    if (mine.user && swapped) { mine.replacements += swapped; mine.screens++; }
    blindedColumns.push(...did.blindedColumns.map((b) => ({ screen: i, ...b })));
    blindAllDone.push(...did.blindedAll.map((b) => ({ screen: i, ...b })));
    changed[i] = did.changed;
    applied.push(...did.applied.map((a) => ({ screen: i, ...a })));
    asked.push(...did.kept.map((k) => ({ screen: i, ...k })));
    keptHeaders.push(...did.headers.map((h) => ({ screen: i, ...h })));
    if (did.only) hid.push({ screen: i, ...did.only });
    for (const f of did.dropped) dropped.add(f);
    fs.writeFileSync(path.join(out, manifest.screens[i].path), JSON.stringify(data));
    const kinds = {};
    for (const c of did.changed) kinds[c.kind] = (kinds[c.kind] ?? 0) + 1;
    log(`screen ${i}  t=${manifest.screens[i].t.toFixed(2)}s  missing urls: ${missed[i]}  stand-ins: ${Object.entries(kinds).map(([k, n]) => `${k} ${n}`).join(', ') || 'none'}`);
  });
  for (const o of blinded) note(o.kind, o.value);
  fs.writeFileSync(path.join(out, 'changed.json'), JSON.stringify(changed));
  // a picture the scrub took off every screen (an avatar) is not kept in the clean copy either
  const still = screens.map((s) => JSON.stringify(s)).join('') + fs.readdirSync(path.join(out, 'assets')).filter((f) => f.endsWith('.css')).map((f) => fs.readFileSync(path.join(out, 'assets', f), 'utf8')).join('');
  let pruned = 0;
  for (const f of dropped) if (!still.includes(ASSET + f) && !still.includes('./' + f) && fs.existsSync(path.join(out, 'assets', f))) { fs.rmSync(path.join(out, 'assets', f)); written.delete(f); pruned++; }
  const bad = applied.filter((a) => !a.ok);
  // who was signed in, per site that was asked about: how it was found and how much was replaced; never the name
  const users = [...who.values()].filter((w) => w.asked).map((w) => ({ host: w.host, by: w.by, ...(w.screen != null ? { screen: w.screen } : {}), ...(w.node != null ? { node: w.node } : {}), ...(w.reason ? { reason: w.reason } : {}), replacements: w.replacements, screens: w.screens }));
  for (const u of users) log(`signed-in user on ${u.host || '(no host)'}: ${u.by === 'off' ? 'not looked for (off)' : u.by === 'none' ? `NOT FOUND${u.reason ? ` (${u.reason})` : ''}: nothing replaced` : `found by ${u.by} at screen ${u.screen}${u.node != null ? ` node ${u.node}` : ''}; ${u.replacements} replacements on ${u.screens} screens`}`);
  // columns replaced on purpose (rules.json `blindColumns`): listed like the kept ones (a rule with no screen says nothing of the screens that lack its table, unless none has it)
  const wantsBlind = Array.isArray(rules.blindColumns) ? rules.blindColumns : [];
  const blindedCols = blindedColumns.filter((k) => k.table != null || wantsBlind[k.rule]?.screen != null || k.reason !== 'no table');
  wantsBlind.forEach((r, i) => {
    if (r?.screen != null || blindedColumns.some((k) => k.rule === i && (k.table != null || k.reason !== 'no table'))) return;
    for (const column of new Set(blindedColumns.filter((k) => k.rule === i).map((k) => k.column))) blindedCols.push({ screen: null, rule: i, ok: false, table: null, column, cells: 0, reason: 'no table' });
  });
  // every element a selector matched (rules.json `blindAll`): per rule, the screens it matched on and how many it replaced; no match is said too
  if (blindAllDone.length) {
    const byRule = new Map();
    for (const b of blindAllDone) (byRule.get(b.rule) ?? byRule.set(b.rule, []).get(b.rule)).push(b);
    log('replaced wherever a selector matched (blindAll):\n' + [...byRule.values()].map((all) => `  "${all[0].selector}"${all[0].reason ? `  ${all[0].reason.toUpperCase()}` : ''}  ${all.reduce((n, b) => n + b.replaced, 0)} elements on ${all.filter((b) => b.replaced).length} screens${all.some((b) => !b.matched) ? `; no match on screens ${all.filter((b) => !b.matched).map((b) => b.screen).join(', ')}` : ''}`).join('\n'));
  }
  if (blindedCols.length) {
    const lines = new Map(); // one line per table and column, with the screens it was found on
    for (const k of blindedCols) { const key = `${k.table == null ? 'no table' : `table ${k.table}`}  "${k.column}"  ${k.ok ? `${k.cells} cells` : `NOTHING REPLACED (${k.reason})`}`; lines.set(key, [...(lines.get(key) ?? []), k.screen]); }
    log('columns replaced on purpose (blindColumns):\n' + [...lines].map(([key, on]) => `  ${key}  on ${on[0] == null ? 'no screen' : `screens ${on.join(', ')}`}`).join('\n'));
  }
  log(`scrub: signed-in user ${anyUser ? 'found and replaced' : users.length ? 'not found' : 'not looked for'}; blind rules applied: ${applied.length - bad.length}${bad.length ? `, NOT applied (no such node): ${bad.map((a) => `screen ${a.screen} node ${a.node}`).join(', ')}` : ''}; pictures removed: ${pruned}`);
  // Columns kept on purpose (rules.json `keepColumns`): every one is said, here and in the report, so the user can be
  // told exactly what was left as recorded. A rule with no `screen` is asked of every screen: the screens that do not
  // have its table are not listed, unless no screen has it.
  // Pages full of other people's text (rules.json `only`): per screen, how much was hidden and which kept subtrees
  // were found, so the user can be told what was hidden and what was kept, by place.
  if (hid.length) log('hidden but for what is kept (only):\n' + hid.map((h) => `  screen ${h.screen}  ${h.texts} text nodes, ${h.attributes} attributes, ${h.pictures} pictures hidden; kept: ${h.keeps.map((k) => `${typeof k.keep === 'number' ? `node ${k.keep}` : `"${k.keep}"`} ${k.ok ? `(${k.matched})` : `NOT KEPT (${k.reason})`}`).join(', ') || 'nothing'}`).join('\n'));
  const wants = Array.isArray(rules.keepColumns) ? rules.keepColumns : [];
  const keptColumns = asked.filter((k) => k.table != null || wants[k.rule]?.screen != null || k.reason !== 'no table');
  wants.forEach((r, i) => {
    if (r?.screen != null || asked.some((k) => k.rule === i && (k.table != null || k.reason !== 'no table'))) return;
    for (const column of new Set(asked.filter((k) => k.rule === i).map((k) => k.column))) keptColumns.push({ screen: null, rule: i, ok: false, table: null, column, cells: 0, reason: 'no table' });
  });
  if (keptColumns.length) log('kept on purpose (keepColumns), left as recorded:\n' + keptColumns.map((k) => `  ${k.screen == null ? 'no screen' : `screen ${k.screen}`}  ${k.table == null ? 'no table' : `table ${k.table}`}  "${k.column}"  ${k.ok ? `${k.cells} cells` : `NOTHING KEPT (${k.reason})`}`).join('\n'));
  // the other header cells of those tables that a rule rewrote (a column name that looked like data): by cell node, to keep by name
  const rewritten = keptHeaders.filter((h) => h.replaced.length);
  if (rewritten.length) log('column names of those tables that were replaced (rules.json `keep` keeps one by its word):\n' + rewritten.map((h) => `  screen ${h.screen}  table ${h.table}  header cells ${h.replaced.join(', ')}`).join('\n'));
  // the manifest is part of the clean copy: a page's address keeps its site and the plain words of its path (cleanHref)
  for (const s of manifest.screens) s.href = cleanHref(s.href, who.get(hostOf(s.href) ?? '')?.user ?? null);
  manifest.mic = null;
  // The microphone take stays in the raw recording (it is not scrubbed, and no film plays it): the manifest says only
  // that there is one and when it started on the events' clock. A copy left in clean/ by an older prepare was removed above.
  if (fs.existsSync(path.join(src, 'mic.webm')) && fs.existsSync(path.join(src, 'mic.json'))) {
    const { t0 } = JSON.parse(fs.readFileSync(path.join(src, 'mic.json'), 'utf8'));
    manifest.mic = { file: 'mic.webm', t0: clock(t0) ?? t0 }; // on the gap-free clock, like the events
  }
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 1));
  const pointer = buildPointer(kept, manifest);
  fs.writeFileSync(path.join(out, 'pointer.json'), JSON.stringify(pointer));
  log(`pointer: ${pointer.points.length} positions, ${pointer.scrolls.length} scrolls`);
  if (!keepOriginals) fs.writeFileSync(path.join(src, 'originals.json'), JSON.stringify({ values: [...originals.values()] }));
  const size = (dir) => fs.readdirSync(dir, { withFileTypes: true }).reduce((s, f) => s + (f.isDirectory() ? size(path.join(dir, f.name)) : fs.statSync(path.join(dir, f.name)).size), 0);
  log(`${name}: ${screens.length} screens, ${manifest.clicks.length} clicks, ${written.size} assets, ${(size(out) / 1e6).toFixed(1)} MB, mic ${manifest.mic ? 'yes' : 'no'}`);
  log(`viewports: ${viewportRuns(manifest.screens).map((r) => `${r.width}x${r.height} (screens ${r.from}${r.to > r.from ? ` to ${r.to}` : ''})`).join(', ')}`);
  if (missing.size) log('missing (host, extension, count):\n' + [...missing].sort().map(([k, c]) => `  ${k}  x${c}`).join('\n'));
  return { manifest, applied, user: anyUser, users, kept: keptColumns, keptHeaders: rewritten, only: hid, blindedColumns: blindedCols, blindAll: blindAllDone };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // --report <file>: what was done, as JSON, for the helper: counts, and per blind rule its place and the length of
  // what it replaced ({ screen, ok, node, tag, length }), and every column kept on purpose (`kept`). Never text.
  const args = process.argv.slice(2), at = args.indexOf('--report'), report = at >= 0 ? args.splice(at, 2)[1] : null;
  const [tutorial] = args;
  if (!tutorial || (at >= 0 && !report)) throw new Error('usage: node --experimental-strip-types tools/prepare-recording.mjs <tutorial folder> [--report <file>]');
  const { manifest, applied, user, users, kept, keptHeaders, only, blindedColumns, blindAll } = prepare(tutorial);
  if (report) {
    fs.mkdirSync(path.dirname(report), { recursive: true });
    fs.writeFileSync(report, JSON.stringify({ screens: manifest.screens.length, clicks: manifest.clicks.length, user, mic: !!manifest.mic, applied: applied.map(({ screen, ok, node, tag, length }) => ({ screen, ok, node, tag, length })), users, kept, keptHeaders, only, blindedColumns, blindAll }) + '\n');
  }
}
