// What the pointer did, as evidence for the understand stage: circles first (how the narrator points), then the weaker
// signals, rests and sweeps, each with a strength. The pointer is evidence, read together with what is being said at
// that moment; it is never choreography, and the recorded movement is never reproduced in a film.
//   node --experimental-strip-types tools/gestures.mjs <tutorial folder>
// Reads  <tutorial>/film/clean/pointer.json   { points: [{ t, x, y, screen }], scrolls: [{ t, id, x, y, screen }] }
//        <tutorial>/film/clean/manifest.json, screen-<i>.json     (the CLEAN copy: every label below is scrubbed text)
// Writes <tutorial>/film/clean/gestures.json
//   { clock: { zero: 'the first recorded event', micStartsAt: seconds | null },
//     gestures: [{ kind: 'circle' | 'rest' | 'sweep', t0, t1, screen, strength, centre: { x, y }, radius, box: { x, y, w, h },
//                  turns?, from?, to?, scrolled?: { x, y }, more?: n,
//                  encloses: [{ node, tag, role, text, label?, how: 'inside' | 'under' | 'crossed', row? }] }] }
// Times are seconds from the first recorded event: the clock of the manifest's screens and clicks. The microphone
// started `micStartsAt` seconds into it, so a transcript word at w seconds was said at w + micStartsAt.
// `encloses` is what a circle ENCLOSES (the elements whose boxes lie inside the loop, not merely what is under the
// pointer), what a rest sits on, what a sweep crosses: node ids of the clean screen, with tag, role and the text of the
// clean copy (40 characters at most). Nothing here is read from the raw recording; pointer coordinates are not sensitive.
// Boxes come from the `Probe` still (film/src/Probe.tsx), which reports ids and boxes only.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { elementsIn, labelOf, walk } from './scrub.mjs';
import { paths, publicDirOf, removeBundle } from './paths.mjs';
import { ensureOneOffIndex } from './moves.mjs';
import { extendsIn, unhidesIn, windowsIn } from './measure-boxes.mjs';

// A circle: within 0.4-3 s the pointer turns about one centre through at least 300 degrees in one direction, at a
// radius that stays within 35% of its mean, between 12 and 400 px. Strength: how closed and how round.
// The plan's geometry, with one change (Oct 10 2026): the loop is judged in the frame of its own bounding box, so a
// loop drawn round a wide control (an ellipse, as hand-drawn loops round buttons and rows are) is a circle like any
// other, up to 5 times as long as it is wide. The centre is the middle of that box (the mean of the positions leans
// towards wherever the pointer dwelt, or where a closed loop's two ends meet), and `box` is the box itself: the region
// the loop encloses. `radius` is the mean distance from the centre, in px.
export function findCircles(points, { minArc = 300, maxCv = 0.35, minR = 12, maxR = 400, minDur = 0.4, maxDur = 3, minAspect = 0.2 } = {}) {
  const out = [];
  let i = 0;
  while (i < points.length - 5) {
    let best = null;
    for (let j = i + 5; j < points.length && points[j].t - points[i].t <= maxDur; j++) {
      if (points[j].screen !== points[i].screen) break; // a loop does not cross a page change
      if (points[j].t - points[i].t < minDur) continue;
      const w = points.slice(i, j + 1);
      const x0 = Math.min(...w.map((p) => p.x)), x1 = Math.max(...w.map((p) => p.x)), y0 = Math.min(...w.map((p) => p.y)), y1 = Math.max(...w.map((p) => p.y));
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, a = (x1 - x0) / 2, b = (y1 - y0) / 2;
      if (Math.min(a, b) < minR || Math.max(a, b) > maxR || Math.min(a, b) / Math.max(a, b) < minAspect) continue;
      const u = w.map((p) => ({ x: (p.x - cx) / a, y: (p.y - cy) / b }));       // the loop in its box's frame: an ellipse there is a circle here
      const rs = u.map((p) => Math.hypot(p.x, p.y)), r = rs.reduce((s, v) => s + v, 0) / rs.length;
      const cv = Math.sqrt(rs.reduce((s, v) => s + (v - r) ** 2, 0) / rs.length) / r;
      if (cv > maxCv) continue;
      let arc = 0, same = 0;                                   // signed sweep about the centre, in degrees
      for (let k = 1; k < u.length; k++) {
        let d = Math.atan2(u[k].y, u[k].x) - Math.atan2(u[k - 1].y, u[k - 1].x);
        if (d > Math.PI) d -= 2 * Math.PI; else if (d < -Math.PI) d += 2 * Math.PI;
        arc += d; if (Math.sign(d) === Math.sign(arc) || d === 0) same++;
      }
      const deg = Math.abs(arc) * 180 / Math.PI;
      if (deg < minArc || same / (u.length - 1) < 0.85) continue;
      const strength = Math.min(1, deg / 360) * (1 - cv);
      const radius = w.reduce((s, p) => s + Math.hypot(p.x - cx, p.y - cy), 0) / w.length;
      if (!best || strength > best.strength) best = { kind: 'circle', t0: w[0].t, t1: w.at(-1).t, screen: w[0].screen, strength: +strength.toFixed(3), centre: { x: cx, y: cy }, radius, box: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, turns: +(deg / 360).toFixed(2), encloses: [], end: j };
    }
    if (best) { out.push(best); i = best.end + 1; delete best.end; } else i++;
  }
  // A target circled twice (or a loop that runs on past its start) is one gesture: circles that follow each other
  // within 0.4 s about the same spot are joined. The strength is the best of them; `turns` adds up.
  const joined = [];
  for (const c of out) {
    const p = joined.at(-1);
    if (p && p.screen === c.screen && c.t0 - p.t1 <= 0.4 && Math.hypot(c.centre.x - p.centre.x, c.centre.y - p.centre.y) <= 0.6 * Math.max(p.radius, c.radius)) {
      const x0 = Math.min(p.box.x, c.box.x), y0 = Math.min(p.box.y, c.box.y), x1 = Math.max(p.box.x + p.box.w, c.box.x + c.box.w), y1 = Math.max(p.box.y + p.box.h, c.box.y + c.box.h);
      Object.assign(p, { t1: c.t1, strength: Math.max(p.strength, c.strength), centre: { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }, radius: Math.max(p.radius, c.radius), box: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, turns: +(p.turns + c.turns).toFixed(2) });
    } else joined.push(c);
  }
  return joined;
}

/** A rest: the pointer stays within 24 px of one spot for 0.7 s or more. Strength grows with the stay, 1 at 2 s.
 *  A still pointer sends no positions, so a stay also shows as a gap: when the next position comes more than `gap`
 *  seconds after the last one near the spot, the pointer was there until then (or until the page changed: `cuts`,
 *  the times at which screens begin). */
export function findRests(points, { radius = 24, minDur = 0.7, gap = 0.3, cuts = [] } = {}) {
  const out = [];
  let i = 0;
  while (i < points.length) {
    let j = i;
    while (j + 1 < points.length && points[j + 1].screen === points[i].screen && Math.hypot(points[j + 1].x - points[i].x, points[j + 1].y - points[i].y) <= radius) j++;
    const last = points[j], next = points[j + 1];
    let t1 = last.t;
    if (next && next.t - last.t > gap) t1 = next.t;
    const cut = cuts.find((c) => c > last.t);
    if (cut != null && t1 > cut) t1 = cut;
    if (t1 - points[i].t >= minDur) {
      const w = points.slice(i, j + 1), cx = w.reduce((s, p) => s + p.x, 0) / w.length, cy = w.reduce((s, p) => s + p.y, 0) / w.length, dur = t1 - points[i].t;
      out.push({ kind: 'rest', t0: points[i].t, t1, screen: points[i].screen, strength: +Math.min(1, dur / 2).toFixed(3), centre: { x: cx, y: cy }, radius, box: { x: cx - radius, y: cy - radius, w: 2 * radius, h: 2 * radius }, encloses: [] });
      i = j + 1;
    } else i++;
  }
  return out;
}

/** A sweep: a pass of 300 px or more in 0.3-1.5 s whose path length is within 10% of its chord. Strength 0.3 (weak by
 *  design: any straight trip across the page is one). The longest such pass from each start. */
export function findSweeps(points, { minChord = 300, minDur = 0.3, maxDur = 1.5, straight = 0.9, pad = 16 } = {}) {
  const out = [];
  let i = 0;
  while (i < points.length - 1) {
    if (Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y) < 3) { i++; continue; } // a pass starts where the pointer starts moving
    let best = null, len = 0;
    for (let j = i + 1; j < points.length && points[j].screen === points[i].screen && points[j].t - points[i].t <= maxDur; j++) {
      len += Math.hypot(points[j].x - points[j - 1].x, points[j].y - points[j - 1].y);
      const chord = Math.hypot(points[j].x - points[i].x, points[j].y - points[i].y);
      if (len > 0 && chord / len < straight) break;            // it has bent: a pass ends here
      if (chord >= minChord && points[j].t - points[i].t >= minDur) best = { j, chord };
    }
    if (best) {
      const a = points[i], b = points[best.j], x = Math.min(a.x, b.x) - pad, y = Math.min(a.y, b.y) - pad;
      out.push({ kind: 'sweep', t0: a.t, t1: b.t, screen: a.screen, strength: 0.3, centre: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, radius: best.chord / 2,
        box: { x, y, w: Math.abs(a.x - b.x) + 2 * pad, h: Math.abs(a.y - b.y) + 2 * pad }, from: { x: a.x, y: a.y }, to: { x: b.x, y: b.y }, encloses: [] });
      i = best.j;
    } else i++;
  }
  return out;
}

/** Every gesture of a pointer path, in time order. A rest or a sweep that is only part of a circle is not listed. */
export const findGestures = (points, { cuts = [] } = {}) => {
  const circles = findCircles(points), within = (g) => circles.some((c) => c.screen === g.screen && g.t0 >= c.t0 - 0.05 && g.t1 <= c.t1 + 0.05);
  return [...circles, ...findRests(points, { cuts }).filter((g) => !within(g)), ...findSweeps(points).filter((g) => !within(g))].sort((a, b) => a.t0 - b.t0);
};

// ---- what a gesture points at

const round = (v) => +v.toFixed(1);
const NAMED = ['button', 'link', 'field', 'heading', 'cell'];
/** does the segment a-b pass through the box? (Liang-Barsky) */
function crosses(a, b, box) {
  let t0 = 0, t1 = 1;
  const dx = b.x - a.x, dy = b.y - a.y;
  for (const [p, q] of [[-dx, a.x - box.x], [dx, box.x + box.w - a.x], [-dy, a.y - box.y], [dy, box.y + box.h - a.y]]) {
    if (p === 0) { if (q < 0) return false; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return true;
}

/** How far the page had been scrolled at time `t`, relative to how screen `screen` was captured: the pointer is given
 *  in window px, the boxes in the captured screen's. `root`: the node id of the document (a window scroll is a scroll
 *  of it); `initial`: the screen's { left, top } when captured; `from`: when the screen began. */
export function scrollAt(scrolls, t, { screen, root, initial = { left: 0, top: 0 }, from = 0 }) {
  const last = scrolls.filter((s) => s.screen === screen && s.id === root && s.t <= t && s.t >= from).at(-1);
  return last ? { x: last.x - (initial.left ?? 0), y: last.y - (initial.top ?? 0) } : { x: 0, y: 0 };
}

/** Fills `encloses` of each gesture of ONE screen. `tree`: the screen's CLEAN tree (every text below comes from it);
 *  `boxes`: { <node id>: { x, y, w, h } } of the elements that show in the rebuilt screen; `scroll(g)`: how far the page
 *  was scrolled during the gesture (default: not at all).
 *    circle: the elements whose boxes lie inside the loop (its box, a tenth of its radius wider: loops are loose);
 *            when it holds none, the loop was drawn ON something larger: the smallest element around its centre ('under')
 *    rest:   the smallest element under the spot
 *    sweep:  the elements the pass crosses, in the order it meets them
 *  An element's own parts are not listed beside it (the caption inside a button), nor is plain text that sits inside a
 *  listed control. `row`: the table row or list item it belongs to, as a node id. At most `max` are listed; `more` counts the rest. */
export function enclose(gestures, tree, boxes, { scroll = () => ({ x: 0, y: 0 }), max = 12 } = {}) {
  const parent = new Map();
  walk(tree, (n) => { for (const c of n.childNodes ?? []) parent.set(c, n); });
  const byId = new Map(); walk(tree, (n) => { if (n.id != null) byId.set(n.id, n); });
  const up = (n) => { const out = []; for (let p = parent.get(n); p; p = parent.get(p)) out.push(p); return out; };
  const all = elementsIn(tree, boxes, null).filter((e) => e.box && e.box.w > 0 && e.box.h > 0);
  const listed = new Set(all.filter((e) => NAMED.includes(e.role)).map((e) => e.node));
  const entry = (e, how) => {
    const n = byId.get(e.node), row = up(n).find((a) => a.tagName === 'tr' || a.tagName === 'li');
    const label = e.role === 'field' ? labelOf(n, tree).replace(/\s+/g, ' ').trim().slice(0, 40) : '';
    return { node: e.node, tag: e.tag, role: e.role, text: e.text, ...(label && label !== 'Value' ? { label } : {}), how, ...(row?.id != null ? { row: row.id } : {}) };
  };
  /** drop what is only a part of something else in the list: plain text inside a listed control, a control's inner controls */
  const outermost = (list) => list.filter((e) => !up(byId.get(e.node)).some((a) => a.id !== e.node && list.some((o) => o.node === a.id) && (e.role === 'text' || listed.has(a.id))));
  const area = (e) => e.box.w * e.box.h, holds = (b, p) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
  const under = (p) => all.filter((e) => holds(e.box, p)).sort((a, b) => (NAMED.includes(b.role) - NAMED.includes(a.role)) || area(a) - area(b))[0];
  for (const g of gestures) {
    const s = scroll(g), c = { x: g.centre.x + s.x, y: g.centre.y + s.y }, dist = (e) => Math.hypot(e.box.x + e.box.w / 2 - c.x, e.box.y + e.box.h / 2 - c.y);
    let found = [], how = 'inside';
    if (g.kind === 'circle') {
      const pad = 0.1 * g.radius, region = { x: g.box.x + s.x - pad, y: g.box.y + s.y - pad, w: g.box.w + 2 * pad, h: g.box.h + 2 * pad };
      found = outermost(all.filter((e) => e.box.x >= region.x && e.box.y >= region.y && e.box.x + e.box.w <= region.x + region.w && e.box.y + e.box.h <= region.y + region.h)).sort((a, b) => dist(a) - dist(b));
      if (!found.length) { const u = under(c); found = u ? [u] : []; how = 'under'; }
    } else if (g.kind === 'rest') { const u = under(c); found = u ? [u] : []; how = 'under'; }
    else {
      const a = { x: g.from.x + s.x, y: g.from.y + s.y }, b = { x: g.to.x + s.x, y: g.to.y + s.y }, along = (e) => (e.box.x + e.box.w / 2 - a.x) * (b.x - a.x) + (e.box.y + e.box.h / 2 - a.y) * (b.y - a.y);
      found = outermost(all.filter((e) => crosses(a, b, e.box))).sort((x, y) => along(x) - along(y)); how = 'crossed';
    }
    g.encloses = found.slice(0, max).map((e) => entry(e, how));
    if (found.length > max) g.more = found.length - max;
    if (s.x || s.y) g.scrolled = { x: round(s.x), y: round(s.y) };
  }
  return gestures;
}

const tidy = (g) => ({ ...g, t0: +g.t0.toFixed(3), t1: +g.t1.toFixed(3), centre: { x: round(g.centre.x), y: round(g.centre.y) }, radius: round(g.radius), box: { x: round(g.box.x), y: round(g.box.y), w: round(g.box.w), h: round(g.box.h) },
  ...(g.from ? { from: { x: round(g.from.x), y: round(g.from.y) }, to: { x: round(g.to.x), y: round(g.to.y) } } : {}) });
/** one gesture as a line: kind, time, screen, strength and what it points at (text of the clean copy) */
export const describe = (g) => `${g.kind.padEnd(6)} ${g.t0.toFixed(1)}-${g.t1.toFixed(1)} s  screen ${g.screen}  strength ${g.strength.toFixed(2)}  ${g.encloses.length ? `${{ inside: 'encloses', under: 'on', crossed: 'crosses' }[g.encloses[0].how]} ${g.encloses.length + (g.more ?? 0)}: ${g.encloses.slice(0, 4).map((e) => `${e.role} "${e.label ? e.label + ': ' : ''}${e.text}"`).join(', ')}${g.encloses.length + (g.more ?? 0) > 4 ? ', ...' : ''}` : 'nothing with a name there'}`;

/** Measures every shown element of `screens` in the rebuilt clean screens: { <screen>: { boxes: { <id>: box }, root } }. */
export async function probe(tutorial, screens) {
  const { bundle } = await import('@remotion/bundler');
  const { selectComposition, renderStill } = await import('@remotion/renderer');
  const P = paths(tutorial), publicDir = publicDirOf(tutorial), root = fileURLToPath(new URL('..', import.meta.url));
  // once a beat file shows a screen as one node's window, that screen is laid out unclipped here too (measure again after writing it)
  const beatFile = fs.existsSync(P.beats) ? JSON.parse(fs.readFileSync(P.beats, 'utf8')) : null;
  const inputProps = { screens, windows: windowsIn(beatFile), unhides: unhidesIn(beatFile), extend: extendsIn(beatFile) };
  let report;
  ensureOneOffIndex();   // (film/src/oneoffs/index.ts must be there for the bundle to resolve)
  const serveUrl = await bundle({ entryPoint: path.join(root, 'film/src/index.ts'), publicDir });
  try {
    const composition = await selectComposition({ serveUrl, id: 'Probe', inputProps, logLevel: 'error' });
    fs.mkdirSync(P.out, { recursive: true });
    const out = process.stdout.write, err = process.stderr.write; // the renderer echoes the page's console: muted
    process.stdout.write = process.stderr.write = () => true;
    try { await renderStill({ composition, serveUrl, output: path.join(P.out, 'probe.png'), inputProps, logLevel: 'error', onBrowserLog: (log) => { if (log.text.startsWith('RT-PROBE:')) report = JSON.parse(log.text.slice(9)); } }); }
    finally { process.stdout.write = out; process.stderr.write = err; }
  } finally { removeBundle(serveUrl); } // the bundle holds a copy of the public dir: not left behind
  if (!report) throw new Error('the Probe still did not report');
  return report;
}

/** pointer.json -> gestures.json for a tutorial folder. `measure(screens)`: the probe, or a stand-in for it in tests. */
export async function makeGestures(tutorial, { measure = (screens) => probe(tutorial, screens) } = {}) {
  const P = paths(tutorial), read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
  if (!fs.existsSync(P.pointer)) throw new Error(`no pointer path in ${P.clean}: run prepare first`);
  const pointer = read(P.pointer), manifest = read(P.manifest);
  const gestures = findGestures(pointer.points, { cuts: manifest.screens.map((s) => s.t) });
  const screens = [...new Set([...gestures.map((g) => g.screen), ...manifest.clicks.map((c) => c.screen)])].sort((a, b) => a - b);
  const measured = screens.length ? await measure(screens) : {};
  const trees = {};
  for (const i of screens) {
    const data = read(path.join(P.clean, manifest.screens[i].path)), boxes = measured[i]?.boxes ?? {};
    trees[i] = { tree: data.node, boxes };
    const from = manifest.screens[i].t;
    enclose(gestures.filter((g) => g.screen === i), data.node, boxes, { scroll: (g) => scrollAt(pointer.scrolls ?? [], g.t0, { screen: i, root: data.node.id, initial: data.initialOffset, from }) });
  }
  const out = { clock: { zero: 'the first recorded event', micStartsAt: manifest.mic ? +((manifest.mic.t0 - manifest.t0) / 1000).toFixed(3) : null }, gestures: gestures.map(tidy) };
  fs.writeFileSync(P.gestures, JSON.stringify(out, null, 1) + '\n');
  // what the probe measured is kept for whoever asks what is in a region of a screen (the helper's elements route):
  // layout.json = { <screen>: { boxes: { <node id>: box } } }, ids and boxes only; and the site's own look, for a film
  // with no brand: site.json = { host, accent, font } (the look most of the measured screens agree on)
  fs.writeFileSync(P.layout, JSON.stringify(Object.fromEntries(screens.map((i) => [i, { boxes: measured[i]?.boxes ?? {} }]))) + '\n');
  const most = (k) => { const n = new Map(); for (const i of screens) { const v = measured[i]?.look?.[k]; if (v) n.set(v, (n.get(v) ?? 0) + 1); } return [...n].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null; };
  let host = '';
  try { host = new URL(manifest.screens[0]?.href ?? '').host; } catch { /* no address */ }
  fs.writeFileSync(P.site, JSON.stringify({ host, accent: most('accent'), font: most('font') }) + '\n');
  return { ...out, manifest, trees, points: pointer.points.length };
}

/** A sanity check, not a result: does the pointer evidence agree with the clicks? Per click: what was clicked (clean
 *  text), and whether a rest sat on it or a sweep ended at it just before. */
export function clicksAgainst(gestures, manifest, trees) {
  return manifest.clicks.map((c) => {
    const { tree, boxes } = trees[c.screen] ?? {}, lines = { t: c.t, screen: c.screen, what: 'not in the clean screen', rest: false, sweep: false, circle: false };
    if (!tree) return lines;
    const parent = new Map(); walk(tree, (n) => { for (const k of n.childNodes ?? []) parent.set(k.id, n.id); });
    const line = (id) => { const out = [id]; for (let p = parent.get(id); p != null; p = parent.get(p)) out.push(p); return out; };
    const mine = line(c.nodeId), related = (id) => mine.includes(id) || line(id).includes(c.nodeId);
    const named = elementsIn(tree, boxes, null).filter((e) => mine.includes(e.node) && NAMED.includes(e.role)).sort((a, b) => mine.indexOf(a.node) - mine.indexOf(b.node))[0];
    if (named) lines.what = `${named.role} "${named.text}"`; else if (mine.length > 1) lines.what = 'an element with no name of its own';
    const near = (g) => Math.hypot((g.to?.x ?? g.centre.x) - c.x, (g.to?.y ?? g.centre.y) - c.y);
    for (const g of gestures) {
      // a click that changes the page is filed under the new screen, the rest that led to it under the old one: there
      // only the place can be compared (node ids are per screen)
      if (g.screen === c.screen - 1 && g.kind === 'rest' && g.t1 >= c.t - 0.3 && g.t0 <= c.t && near(g) <= 30) lines.rest = true;
      if (g.screen !== c.screen) continue;
      if (g.kind === 'rest' && g.t0 <= c.t + 0.1 && g.t1 >= c.t - 1.5 && (g.encloses.some((e) => related(e.node)) || near(g) <= 30)) lines.rest = true;
      if (g.kind === 'sweep' && g.t1 <= c.t + 0.1 && g.t1 >= c.t - 2.5 && near(g) <= 80) lines.sweep = true;
      if (g.kind === 'circle' && g.t1 <= c.t + 0.1 && g.t1 >= c.t - 4 && g.encloses.some((e) => related(e.node))) lines.circle = true;
    }
    return lines;
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) { console.log('usage: gestures.mjs <tutorial folder>'); process.exit(1); }
  const { gestures, clock, manifest, trees, points } = await makeGestures(process.argv[2]);
  const count = (k) => gestures.filter((g) => g.kind === k).length;
  console.log(`gestures: ${points} pointer positions; ${count('circle')} circles, ${count('rest')} rests, ${count('sweep')} sweeps; microphone starts at ${clock.micStartsAt ?? 'no microphone'} s`);
  for (const g of gestures) console.log('  ' + describe(g));
  const checks = clicksAgainst(gestures, manifest, trees);
  console.log(`clicks: ${checks.length}; with a rest on what was clicked: ${checks.filter((c) => c.rest).length}; with a sweep arriving there: ${checks.filter((c) => c.sweep).length}; circled first: ${checks.filter((c) => c.circle).length}`);
  for (const c of checks) console.log(`  click ${c.t.toFixed(1)} s  screen ${c.screen}  ${c.what}  ${[c.circle && 'circle', c.rest && 'rest', c.sweep && 'sweep'].filter(Boolean).join(' + ') || 'no gesture'}`);
  process.exit(0);
}
