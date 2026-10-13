// State changes, generic: what changed between two snapshots (findChange, for proposing a beat file's `change`
// entries), and how a screen stages what the recording did not capture as motion (stage: something opening, a page
// assembling after a cut, a control answering the cursor, a value becoming selected). Keyed by node id; no film has
// code of its own. No imports beyond the kit's math, so node can load it.
//
// The rule for anything that opens over other content: it is OPAQUE from its first visible frame and is uncovered
// into place (from the edge it hangs from, or outward from its centre, with a small scale), so two layers of text
// are never seen through each other and nothing pops. Opacity is only ever ramped on things that set over a blank
// surface (the parts of a new page on their card) or that hold no text (a dialog's backdrop).
import { EASE, clamp01, pressEnv, rnd, tw } from '../kit/ease.ts';
import { scrollAt } from './cameraAt.ts';
import type { Scroll } from './cameraAt.ts';

// ───────────────────────── what changed between two snapshots ─────────────────────────

type Tree = { id: number; type?: number; tagName?: string; attributes?: Record<string, unknown>; childNodes?: Tree[] };
type Snapshot = Tree | { node: Tree; href?: string };
export type Found = { kind: 'opens'; node: number; anchor: number | null } | { kind: 'page' } | null;

const SHOWN = /^(show|shown|open|opened|visible|active|in|is-open|is-active|is-visible|expanded)$/, HIDDEN = /^(hidden|hide|d-none|closed|collapsed|is-hidden|invisible)$/;
const count = (n: Tree): number => 1 + (n.childNodes ?? []).reduce((s, c) => s + count(c), 0);
const named = (n: Tree) => !!(n.attributes && (n.attributes.class || n.attributes.role || n.attributes.id));
/** Does this element read as shown in `after` where it read as hidden in `before`? (the same node, restyled) */
function revealed(a: Tree, b: Tree) {
  const cls = (n: Tree) => String(n.attributes?.class ?? '').split(/\s+/).filter(Boolean), was = cls(b), is = cls(a);
  const attr = (n: Tree, k: string) => n.attributes?.[k], none = (n: Tree) => /display:\s*none/.test(String(attr(n, 'style') ?? ''));
  return is.some((c) => SHOWN.test(c) && !was.includes(c)) || was.some((c) => HIDDEN.test(c) && !is.includes(c)) || (none(b) && !none(a))
    || (attr(b, 'hidden') != null && attr(a, 'hidden') == null) || (attr(b, 'aria-hidden') === 'true' && attr(a, 'aria-hidden') !== 'true') || (attr(b, 'open') == null && attr(a, 'open') != null);
}

/** `before`, `after`: the serialized trees either side of a click (a screen file, or its `node`; a screen's `href`
 *  rides along when given). `click`: the clicked node's id. Returns what happened:
 *  the page changed; something opened (the largest subtree that is new, or that went from hidden to shown, whose root
 *  carries a class, role or id), anchored to the click; or nothing to stage. */
export function findChange(before: Snapshot, after: Snapshot, click: number | null = null): Found {
  const tree = (s: Snapshot) => ('node' in s ? s.node : s), href = (s: Snapshot) => ('node' in s ? s.href : undefined);
  if (href(before) && href(after) && href(before) !== href(after)) return { kind: 'page' };
  const was = new Map<number, Tree>();
  (function walk(n: Tree) { was.set(n.id, n); n.childNodes?.forEach(walk); })(tree(before));
  const roots: Tree[] = [], shown: Tree[] = [];
  (function walk(n: Tree) {
    const old = was.get(n.id);
    if (!old) { if (n.type === 2 || n.tagName) roots.push(n); return; }   // new: the topmost new ancestor stands for its subtree
    if (n.tagName && revealed(n, old)) { shown.push(n); return; }
    n.childNodes?.forEach(walk);
  })(tree(after));
  const best = (list: Tree[]) => list.filter(named).map((n) => ({ n, size: count(n) })).sort((a, b) => b.size - a.size)[0];
  // the larger of the two: a dialog that is only shown often comes with a new backdrop of one node, which opened nothing
  const opened = [best(roots), best(shown)].filter((o) => !!o).sort((a, b) => b!.size - a!.size)[0];
  return opened && opened.size > 1 ? { kind: 'opens', node: opened.n.id, anchor: click } : null;
}

// ───────────────────────── staging, inside a rebuilt document ─────────────────────────

/** What one screen stages, in film seconds (written by makeBeats). */
export type Staging = {
  /** after a cut to this screen: the parts of this node (null: of the page) set in place one after another from `at` */
  assemble?: { at: number; node: number | null; /** further nodes whose parts set with them (a framing that holds several things) */ also?: number[] };
  /** shut until `at`, then uncovered from its top edge (it hangs from what was clicked), set in place whole (`centre`),
   *  slid down to its place from above the page's top edge (`above`: from under the browser bar), or slid in a short
   *  way from the window's right edge with its opacity coming up (`right`: a bar's `arrives`) */
  opens: { node: number; at: number; from: 'top' | 'centre' | 'above' | 'right' }[];
  /** something open goes the way it came, from `at` (the open, mirrored in time; a dialog's backdrop dims out as it
   *  came), and is hidden until `until`: the next open of the same node, else for good */
  closes?: { node: number; at: number; from: Staging['opens'][number]['from']; until: number }[];
  /** a control clicked at `at`: it takes the page's own hover look as the cursor comes over it, gives on the press,
   *  and lets go of the hover when the cursor moves on (`until`) */
  presses: { node: number; at: number; until: number }[];
  /** a control the cursor rests on from `at` to `until` without clicking (a `hover`): the same hover look, no press */
  hovers?: { node: number; at: number; until: number }[];
  /** the value of this node shows as selected from `at`. With `until` it is a block (a table) selected by dragging:
   *  each line of its text is selected once `edge(t)` (how far down the page the cursor's tip is, px) has passed it,
   *  and all of it from `until` */
  selects: { node: number; at: number; until?: number; edge?: (t: number) => number }[];
  /** a field the film fills: empty until `at`, then its value whole (a paste: `until` = `at`) or letter by letter
   *  until `until` (typing). `text`: authored words shown instead of the value the clean copy holds */
  fills?: { node: number; at: number; until: number; text?: string }[];
  /** an element whose box changed when the screen became its next capture at `at`: it starts where it was (moved by
   *  dx, dy; what it gained on its right and bottom still covered) and is carried to its place, uncovered as it goes */
  grows?: { node: number; at: number; dx: number; dy: number; right: number; bottom: number }[];
  /** scroll boxes kept at their end (a list the page is adding to: what came last is in view) */
  follows?: number[];
  /** what a capture added to the one before it (a row to a list): of these new nodes, each topmost one that is in the
   *  page's flow sets in from `at` over ADD seconds: uncovered from its top to its own height as it comes up, what is
   *  below it moving down with it. Made only for a capture that takes nothing away (makeBeats) */
  adds?: { at: number; nodes: number[] }[];
  /** not drawn from `at` until `until`: something dragged, while its copy rides with the pointer (Template) */
  hides?: { node: number; at: number; until: number }[];
  /** a whole screen whose page scrolls: its own document, down from where the capture has it (cameraAt.ts `scrollAt`) */
  scroll?: Scroll[];
  /** this node is the film's end glyph, alone on the stage from `at`: its parts slide a little apart from its middle
   *  and back, in one move over `over` seconds */
  glyph?: { node: number; at: number; over: number };
};

type Mirror = { getNode(id: number): Node | null };
type Look = { bg: string; color: string; border: string };
type Overlay = { host: HTMLElement | null; hostBg: string | null; backdrops: { el: HTMLElement; opacity: number }[] };
type Memo = { looks: Map<number, { rest: Look; hover: Look } | null>; overlays: Map<number, Overlay>; parts: Map<number, HTMLElement[]>; sels: Map<number, HTMLElement | null>;
  values: Map<number, string>; drops: Map<number, number>; blocks: Map<number, { y: number; el: HTMLElement }[]>; ways: Map<number, { x: number; y: number }[]>; adds: Map<number, Added>; top?: number };
const memos = new WeakMap<Document, Memo>();
const memoOf = (doc: Document) => { let m = memos.get(doc); if (!m) memos.set(doc, (m = { looks: new Map(), overlays: new Map(), parts: new Map(), sels: new Map(), values: new Map(), drops: new Map(), blocks: new Map(), ways: new Map(), adds: new Map() })); return m; };
const transparent = (c: string) => !c || c === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(c);
const mix = (a: string, b: string, k: number) => `color-mix(in srgb, ${a} ${(k * 100).toFixed(1)}%, ${b})`;

/** A control under the cursor's press: it gives a little and darkens, then comes back softly. */
function press(e: HTMLElement, p: number) {
  // 3.5% of a button; of something wide (a field across a panel) never more than 14 px in all, or it would be seen to slide
  const give = Math.min(0.035, 14 / Math.max(1, e.offsetWidth));
  e.style.scale = p > 0.0005 ? (1 - give * p).toFixed(4) : '';
  e.style.filter = p > 0.001 ? `brightness(${(1 - 0.06 * p).toFixed(4)})` : '';
}

/** The page's own hover look for `e`, read once. rrweb rebuilds every `:hover` rule with a `.\:hover` twin, so the
 *  class shows what the page shows under a pointer; it is read and taken off again, and the film eases between the two. */
function lookOf(e: HTMLElement, id: number, memo: Memo) {
  if (memo.looks.has(id)) return memo.looks.get(id)!;
  const view = e.ownerDocument.defaultView!, read = (): Look => { const cs = view.getComputedStyle(e); return { bg: cs.backgroundColor, color: cs.color, border: cs.borderTopColor }; };
  const chain: Element[] = [];
  for (let n: Element | null = e; n && n !== e.ownerDocument.documentElement; n = n.parentElement) chain.push(n);
  const rest = read();
  for (const n of chain) n.classList.add(':hover');
  const hover = read();
  for (const n of chain) { n.classList.remove(':hover'); if (!n.classList.length) n.removeAttribute('class'); }
  const look = rest.bg === hover.bg && rest.color === hover.color && rest.border === hover.border ? null : { rest, hover };
  memo.looks.set(id, look);
  return look;
}

/** `e` takes `over` (0..1) of the page's own hover look; at 0 it is as the page has it. */
function hoverLook(e: HTMLElement, id: number, memo: Memo, over: number) {
  const look = lookOf(e, id, memo), on = over > 0.001;
  if (!look) return;
  e.style.backgroundColor = on && look.rest.bg !== look.hover.bg ? mix(look.hover.bg, look.rest.bg, over) : '';
  e.style.color = on && look.rest.color !== look.hover.color ? mix(look.hover.color, look.rest.color, over) : '';
  e.style.borderColor = on && look.rest.border !== look.hover.border ? mix(look.hover.border, look.rest.border, over) : '';
}

const RIGHT = 0.28;   // seconds: what comes in from the right has settled 0.34 s after the press (it opens 0.06 s after)
/** How far what comes from `above` or from the `right` travels: from wholly above the page's top, or from just past
 *  the window's right edge (its own width at most), to where it sits. Read once, with nothing moving it. */
function travelOf(e: HTMLElement, id: number, from: 'above' | 'right', memo: Memo) {
  if (!memo.drops.has(id)) {
    e.style.translate = ''; e.style.scale = '';
    const r = e.getBoundingClientRect();
    memo.drops.set(id, Math.max(0, from === 'above' ? r.bottom : Math.min(r.width, e.ownerDocument.defaultView!.innerWidth - r.left)));
  }
  return memo.drops.get(id)!;
}

/** Opens `e` from `at`, opaque throughout (but for what comes in from the right: below). Something that hangs from what was clicked (a menu) is uncovered from its
 *  top edge in 7 frames, growing from 96%; the uncovering runs 40 px past the box, so its shadow shows. Anything else
 *  (a dialog) is one whole shape from its first visible frame: it sets in place over 9 frames, growing from 88% and
 *  settling a few px, never cropped (uncovered from its centre it showed as a strip of its middle, then a slab).
 *  `reverse`: it closes from `at` instead, the same motion mirrored in time, and is hidden when that is done. */
function open(e: HTMLElement, t: number, at: number, from: Staging['opens'][number]['from'], drop = 0, reverse = false) {
  const dur = from === 'above' ? 0.45 + drop / 2600 : from === 'right' ? RIGHT : 0.3;
  if (reverse) t = 2 * at + dur - t;
  const on = reverse ? t > at : t >= at;
  if (from === 'above' || from === 'right') {
    // from under the browser bar: it starts wholly above the page's top edge, where the window clips it, and comes
    // down to its place in one move (longer the further it has to come), opaque and whole all the way.
    // from the right: it starts just past the window's right edge and slides in, a short way, its opacity coming up
    // over the first of it (it is off the window, or all but, while it is faint)
    const k = tw(t, at, at + dur, EASE.settle);
    e.style.visibility = on ? 'visible' : 'hidden';
    e.style.opacity = from === 'right' ? tw(t, at, at + 0.6 * dur, EASE.linear).toFixed(4) : '1';
    e.style.scale = '';
    e.style.clipPath = '';
    e.style.translate = k >= 1 ? '' : from === 'right' ? `${(drop * (1 - k)).toFixed(3)}px 0` : `0 ${(-drop * (1 - k)).toFixed(3)}px`;
    return;
  }
  const k = tw(t, at, at + 0.3, EASE.settle), w = tw(t, at, at + 0.23, EASE.settle);
  const cut = (share: number) => `calc(${(share * (1 - w) * 100).toFixed(3)}% - ${(40 * w).toFixed(2)}px)`; // how much of the box is still covered, from one side
  e.style.visibility = on ? 'visible' : 'hidden';
  e.style.opacity = '1';
  e.style.transformOrigin = from === 'top' ? '50% 0' : '50% 50%';
  e.style.scale = from === 'top' ? (0.96 + 0.04 * k).toFixed(5) : (0.88 + 0.12 * k).toFixed(5);
  e.style.translate = from === 'top' || k >= 1 ? '' : `0 ${(12 * (1 - k)).toFixed(3)}px`;
  e.style.clipPath = from === 'top' && w < 1 ? `inset(-40px -40px ${cut(1)} -40px)` : '';
}

/** What a dialog brings with it: the layer that holds it over the page (its topmost fixed ancestor), and whatever
 *  dims the page behind it: that layer's own background, or a separate full-window element with no text. */
function overlayOf(e: HTMLElement, id: number, memo: Memo): Overlay {
  let o = memo.overlays.get(id);
  if (o) return o;
  const doc = e.ownerDocument, view = doc.defaultView!, vw = view.innerWidth, vh = view.innerHeight;
  let host: HTMLElement | null = null;
  for (let n = e.parentElement; n && n !== doc.body; n = n.parentElement) if (view.getComputedStyle(n).position === 'fixed') host = n;
  const covers = (n: Element) => { const r = n.getBoundingClientRect(); return r.width >= 0.9 * vw && r.height >= 0.9 * vh; };
  // The layer and what dims the page are its own only when it IS what the layer shows. A part of something larger in
  // the layer (a tab's pane in a dialog: something else with text shows beside it on the way up) opens by itself, and
  // so does something that floats over a layer that is already up (a panel over an open dialog): that layer and its
  // backdrop belong to what was there first, and stay.
  const shows = (n: Element) => !!(n.textContent ?? '').trim() && (n as any).checkVisibility?.({ checkVisibilityCSS: true }) !== false;
  let part = false;
  for (let n: Element = e; host && n !== host && n.parentElement; n = n.parentElement) if ([...n.parentElement.children].some((c) => c !== n && shows(c))) part = true;
  const over = !host && [...doc.body.querySelectorAll<HTMLElement>('*')].some((n) => n !== e && !n.contains(e) && !e.contains(n) && view.getComputedStyle(n).position === 'fixed' && covers(n) && shows(n));
  if (part || over) { memo.overlays.set(id, (o = { host: null, hostBg: null, backdrops: [] })); return o; }
  // (in a layer of its own over another that is up: only what dims inside its own layer is its own; the page's is the other's)
  const second = !!host && [...doc.body.querySelectorAll<HTMLElement>('*')].some((n) => n !== host && !n.contains(host!) && !host!.contains(n) && view.getComputedStyle(n).position === 'fixed' && covers(n) && shows(n));
  const hostBg = host && covers(host) && !transparent(view.getComputedStyle(host).backgroundColor) ? view.getComputedStyle(host).backgroundColor : null;
  const backdrops = [...(second ? [] : doc.body.children), ...(host ? [...host.children] : [])].filter((n): n is HTMLElement => {
    if (n === host || n.contains(e) || (n.textContent ?? '').trim()) return false;
    const cs = view.getComputedStyle(n);
    // it dims, it does not cover: a see-through layer (a solid full-window element is the page's own background)
    const sheer = parseFloat(cs.opacity) < 1 || cs.backgroundColor.startsWith('rgba(');
    return (cs.position === 'fixed' || cs.position === 'absolute') && cs.display !== 'none' && covers(n) && !transparent(cs.backgroundColor) && sheer;
  }).map((el) => ({ el, opacity: parseFloat(view.getComputedStyle(el).opacity) || 1 }));
  memo.overlays.set(id, (o = { host, hostBg, backdrops }));
  return o;
}

/** The parts of a page that set in place after a cut: the children of the framed node, a large child (a form, a
 *  list) standing for its own children instead. At most twelve; a node with fewer than two parts sets as one. */
function partsOf(root: HTMLElement, id: number, memo: Memo) {
  let p = memo.parts.get(id);
  if (p) return p;
  const view = root.ownerDocument.defaultView!;
  const kids = (e: Element) => [...e.children].filter((c): c is HTMLElement => { const r = c.getBoundingClientRect(), cs = view.getComputedStyle(c); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.position !== 'fixed'; });
  let box: HTMLElement = root, list = kids(box);
  while (list.length === 1) { box = list[0]; list = kids(box); }     // through wrappers that hold one thing
  const h = box.getBoundingClientRect().height;
  for (let pass = 0; pass < 2; pass++) list = list.flatMap((c) => { const inner = kids(c); return c.getBoundingClientRect().height > 0.4 * h && inner.length >= 3 && list.length + inner.length <= 13 ? inner : [c]; });
  memo.parts.set(id, (p = list.length >= 2 ? list.slice(0, 12) : []));
  return p;
}

/** The selection, as the browser paints it in a focused field: the system highlight behind the text, the text in the
 *  system's highlight-text colour. A layer of the same text in the same place, revealed from the left. */
function selectionOf(e: HTMLElement, id: number, memo: Memo) {
  if (memo.sels.has(id)) return memo.sels.get(id)!;
  const doc = e.ownerDocument, view = doc.defaultView!, cs = view.getComputedStyle(e), field = 'value' in e && typeof (e as HTMLInputElement).value === 'string';
  const text = field ? (e as HTMLInputElement).value : e.textContent ?? '';
  let sel: HTMLElement | null = null;
  if (text.trim()) {
    // A twin of the element's own box, laid over it: the same place, size, border widths, padding, font and
    // alignment, so the browser lays the text out in it where it lays the value out in the element (below a floating
    // label, inside the padding, centred, wrapped in a textarea). The twin takes the element's own transform on each
    // frame (stage), so the highlight gives with a press exactly as the field does.
    sel = doc.createElement('div');
    const mark = doc.createElement('span'), area = e.tagName === 'TEXTAREA';
    mark.textContent = text;
    mark.style.cssText = 'background:Highlight;color:HighlightText';
    const edge = (side: string) => `${cs.getPropertyValue(`border-${side}-width`)} solid transparent`;
    sel.style.cssText = `position:absolute;box-sizing:border-box;margin:0;pointer-events:none;overflow:hidden;visibility:hidden;z-index:1;background:none;`
      + `left:${e.offsetLeft}px;top:${e.offsetTop}px;width:${e.offsetWidth}px;height:${e.offsetHeight}px;`
      + `border-top:${edge('top')};border-right:${edge('right')};border-bottom:${edge('bottom')};border-left:${edge('left')};`
      + `padding:${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft};`
      + `font:${cs.font};letter-spacing:${cs.letterSpacing};text-align:${cs.textAlign};text-indent:${cs.textIndent};text-transform:${cs.textTransform};`
      + `transform-origin:${cs.transformOrigin}`;
    const line = doc.createElement('div');
    line.appendChild(mark);
    sel.appendChild(line);
    const host = (e.offsetParent as HTMLElement | null) ?? doc.body;
    // (on a screen that shows only some nodes, the twin of a value inside one of them is shown with it: the element
    // itself may be all that is kept, and its twin is laid beside it, not in it)
    if (e.closest('[data-ct-keep]')) sel.setAttribute('data-ct-keep', '');
    if (field && !area) {
      // a one-line field centres its line in its content box, whatever the padding above and below it
      sel.style.display = 'flex';
      sel.style.alignItems = 'center';
      line.style.cssText = `flex:1 1 auto;min-width:0;white-space:pre;line-height:${cs.lineHeight}`;
    } else if (area) line.style.cssText = `white-space:pre-wrap;overflow-wrap:break-word;line-height:${cs.lineHeight}`;
    else {
      // an element's own text: the twin holds the text where the element's text is, measured from the element's box
      // as laid out (whatever transform is on it this frame is divided out)
      const range = doc.createRange(), er = e.getBoundingClientRect(), sx = e.offsetWidth ? er.width / e.offsetWidth : 1, sy = e.offsetHeight ? er.height / e.offsetHeight : 1;
      range.selectNodeContents(e);
      const r = range.getBoundingClientRect();
      sel.style.padding = '0';
      sel.style.border = '0';
      sel.style.overflow = 'visible';
      line.style.cssText = `position:absolute;white-space:pre;line-height:1.35;left:${((r.left - er.left) / (sx || 1)).toFixed(2)}px;top:${((r.top + r.height / 2 - er.top) / (sy || 1)).toFixed(2)}px;translate:0 -50%`;
    }
    host.appendChild(sel);
  }
  memo.sels.set(id, sel);
  return sel;
}

/** A block's selection (a table, a list of lines): one highlight per line of its text, laid over the text where the
 *  browser laid it out, in the system highlight's colour let through (the text under it stays as it is, as a browser
 *  shows a selection on a page of any colour). `y`: the line's middle, in the page's px. No text is copied. */
function blockOf(e: HTMLElement, id: number, memo: Memo) {
  let lines = memo.blocks.get(id);
  if (lines) return lines;
  lines = [];
  const doc = e.ownerDocument, view = doc.defaultView!, layer = doc.createElement('div'), walker = doc.createTreeWalker(e, 4 /* NodeFilter.SHOW_TEXT */);
  layer.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;z-index:2147483000';
  doc.body.appendChild(layer);
  const at = layer.getBoundingClientRect();
  while (walker.nextNode()) {
    if (!(walker.currentNode as Text).data.trim()) continue;
    const range = doc.createRange();
    range.selectNodeContents(walker.currentNode);
    for (const r of range.getClientRects()) {
      if (r.width < 1 || r.height < 1) continue;
      const mark = doc.createElement('div');
      mark.style.cssText = `position:absolute;left:${(r.left - at.left - 2).toFixed(2)}px;top:${(r.top - at.top).toFixed(2)}px;width:${(r.width + 4).toFixed(2)}px;height:${r.height.toFixed(2)}px;background:color-mix(in srgb, Highlight 45%, transparent)`;
      mark.style.setProperty('visibility', 'hidden', 'important');
      layer.appendChild(mark);
      // (a row of a table, an item of a list is selected whole once the tip has come down to it: no cell is left half done)
      const row = (walker.currentNode as Text).parentElement?.closest('tr,li');
      lines.push({ y: row ? row.getBoundingClientRect().top + 2 : r.top + r.height / 2, el: mark });
    }
  }
  memo.blocks.set(id, lines);
  return lines;
}

export const ADD = 0.25;   // seconds: what a capture added sets in over this long
const STYLED = ['opacity', 'clipPath', 'translate', 'height', 'overflowY'] as const;
/** What a capture added, as it sets in. `units`: each thing that grows in (`h`: its height), the `box` that holds it
 *  (its parent; a row's table's parent) and what comes `after` it in that box. `boxes`: each such box as the capture
 *  has it: its height, how far its content runs past it (`over`), whether it is a scroll box. `kept`: the inline
 *  styles of everything touched, to put back. */
type Added = { units: { el: HTMLElement; h: number; box: HTMLElement; after: HTMLElement[] }[]; boxes: Map<HTMLElement, { h: number; over: number; scrolls: boolean }>; kept: [HTMLElement, string[]][] };
/** Read once from the capture as it is, with nothing of this applied: the topmost of the new elements (a new cell
 *  stands for its row), less what is not in the page's flow (a dialog, a tip: those appear as they did), what has
 *  no height, and what an `opens` stages (`shut`). */
function addedOf(els: HTMLElement[], shut: HTMLElement[]): Added {
  const view = els[0].ownerDocument.defaultView!, all = new Set(els), css = (e: Element) => view.getComputedStyle(e);
  const inNew = (e: HTMLElement) => { for (let p = e.parentElement; p; p = p.parentElement) if (all.has(p)) return true; return false; };
  const tops = [...new Set(els.filter((e) => !inNew(e)).map((e) => (css(e).display === 'table-cell' && e.parentElement ? e.parentElement : e)))];
  const units: Added['units'] = [], boxes: Added['boxes'] = new Map();
  for (const e of tops) {
    const cs = css(e), h = e.getBoundingClientRect().height, row = /^table-(row|row-group|header-group|footer-group)$/.test(cs.display);
    const inner = row ? e.closest('table') as HTMLElement | null : e, box = inner?.parentElement;
    if (!inner || !box || h < 1 || /^(absolute|fixed)$/.test(cs.position) || /^(inline|contents|none)$/.test(cs.display) || /^(inline$|table|contents)/.test(css(box).display) || shut.some((o) => o.contains(e) || e.contains(o))) continue;
    // what is drawn below it in its box: the rows after it in its table, and whatever follows the table (or it) in the box
    const rows = row ? [...inner.querySelectorAll<HTMLElement>('tr')].filter((r) => r.closest('table') === inner && !e.contains(r) && !!(e.compareDocumentPosition(r) & 4)) : [];
    const next: HTMLElement[] = [];
    for (let n = inner.nextElementSibling; n; n = n.nextElementSibling) next.push(n as HTMLElement);
    units.push({ el: e, h, box, after: [...rows, ...next] });
    if (!boxes.has(box)) { const b = css(box); boxes.set(box, { h: parseFloat(b.height), over: Math.max(0, box.scrollHeight - box.clientHeight), scrolls: /^(auto|scroll)$/.test(b.overflowY) }); }
  }
  const touched = new Set([...units.flatMap((u) => [u.el, ...u.after]), ...boxes.keys()]);
  return { units, boxes, kept: [...touched].map((e) => [e, STYLED.map((p) => e.style[p])]) };
}

/** Sets everything a screen stages, from the time alone (frames render in any order). */
export function stage(doc: Document, mirror: Mirror, t: number, plan: Staging) {
  const memo = memoOf(doc), el = (id: number) => mirror.getNode(id) as HTMLElement | null;
  /** how far (0..1) the cursor is over a control it reaches at `at` and moves on from at `until` */
  const overAt = (p: { at: number; until: number }) => tw(t, p.at - 0.3, p.at - 0.1, EASE.settle) * (1 - tw(t, p.until, p.until + 0.2, EASE.settle));

  // a new page assembles in place after the cut: its frame is there, its parts set one after another, each solid
  // within three frames and settling a few px (order not tidy)
  if (plan.assemble) {
    const from = plan.assemble.at, roots = [plan.assemble.node, ...(plan.assemble.also ?? [])];
    roots.flatMap((id) => { const root = id == null ? doc.body : el(id); return root ? partsOf(root, id ?? -1, memo) : []; }).forEach((part, i) => {
      const at = from + 0.06 + 0.42 * rnd(i, 3), k = tw(t, at, at + 0.45, EASE.settle);
      part.style.opacity = clamp01((t - at) / 0.1).toFixed(4);
      part.style.translate = `0 ${(10 * (1 - k)).toFixed(3)}px`;
    });
  }

  // the end glyph: its parts (as an assembly finds them) part from its middle and come back; which way each goes is
  // read once, with nothing moving them. Small things part less. A thing of one part does not move.
  if (plan.glyph) {
    const g = plan.glyph, root = el(g.node), parts = root ? partsOf(root, g.node, memo) : [];
    if (root && !memo.ways.has(g.node)) {
      for (const p of parts) p.style.translate = '';
      const r = root.getBoundingClientRect(), far = Math.min(14, 0.035 * Math.max(r.width, r.height));
      memo.ways.set(g.node, parts.map((p) => { const q = p.getBoundingClientRect(), dx = q.left + q.width / 2 - (r.left + r.width / 2), dy = q.top + q.height / 2 - (r.top + r.height / 2), d = Math.hypot(dx, dy) || 1; return { x: (far * dx) / d, y: (far * dy) / d }; }));
    }
    const k = Math.sin(Math.PI * clamp01((t - g.at) / g.over)), ways = memo.ways.get(g.node) ?? [];
    parts.forEach((p, i) => { p.style.translate = `${(ways[i].x * k).toFixed(3)}px ${(ways[i].y * k).toFixed(3)}px`; });
  }

  // the control under the cursor: the page's own hover look as the cursor comes over it, a press on the click
  for (const p of plan.presses) {
    const e = el(p.node);
    if (!e) continue;
    hoverLook(e, p.node, memo, overAt(p));
    press(e, pressEnv(t, p.at));
  }
  // ...and one it only rests on (a `hover`); should the shot also click it, the more of the two looks
  for (const h of plan.hovers ?? []) { const e = el(h.node); if (e) hoverLook(e, h.node, memo, Math.max(overAt(h), ...plan.presses.filter((p) => p.node === h.node).map(overAt))); }

  const closes = plan.closes ?? [];
  for (const o of plan.opens) {
    const e = el(o.node);
    // (an open that follows a close of the same node has no say until that close is over: until its own moment)
    if (!e || closes.some((c) => c.node === o.node && c.at < o.at && t < c.until)) continue;
    if (o.from === 'centre') {
      // a dialog: the layer that holds it is not there before it; what dims the page comes up underneath in its own time
      const { host, hostBg, backdrops } = overlayOf(e, o.node, memo), dim = tw(t, o.at - 0.02, o.at + 0.39);
      if (host) { host.style.visibility = t >= o.at - 0.02 ? 'visible' : 'hidden'; if (hostBg) host.style.backgroundColor = mix(hostBg, 'transparent', dim); }
      for (const b of backdrops) { b.el.style.visibility = t >= o.at - 0.02 ? 'visible' : 'hidden'; b.el.style.opacity = (b.opacity * dim).toFixed(4); }
    }
    open(e, t, o.at, o.from, o.from === 'above' || o.from === 'right' ? travelOf(e, o.node, o.from, memo) : 0);
  }

  // what closes goes the way it came. Before its moment it is as the opens above left it (or, never opened by the
  // film, as the capture has it: set here, since frames render in any order); after, hidden until it opens again
  for (const c of closes) {
    const e = el(c.node);
    if (!e || t >= c.until || (t < c.at && plan.opens.some((o) => o.node === c.node && o.at <= c.at))) continue;
    if (c.from === 'centre') {
      // a dialog: what dims the page goes out underneath as it came up, and the layer that held it is gone with it
      const { host, hostBg, backdrops } = overlayOf(e, c.node, memo), dim = 1 - tw(t, c.at, c.at + 0.39), up = t < c.at + 0.39;
      if (host) { host.style.visibility = up ? 'visible' : 'hidden'; if (hostBg) host.style.backgroundColor = mix(hostBg, 'transparent', dim); }
      for (const b of backdrops) { b.el.style.visibility = up ? 'visible' : 'hidden'; b.el.style.opacity = (b.opacity * dim).toFixed(4); }
    }
    open(e, t, c.at, c.from, c.from === 'above' || c.from === 'right' ? travelOf(e, c.node, c.from, memo) : 0, true);
  }

  // what the capture added sets in: it is uncovered from its top as it comes up, what is below it in its box is
  // drawn that much higher, and the box is that much shorter, so everything under the box moves down with it. A box
  // that scrolls (its content already runs past it) keeps its height and is scrolled that much short of its end.
  const lag = new Map<HTMLElement, number>();
  for (const a of plan.adds ?? []) {
    const key = a.nodes[0], k = tw(t, a.at, a.at + ADD, EASE.settle);
    let p = memo.adds.get(key);
    if (k >= 1 || t < a.at) { if (p) { for (const [e, was] of p.kept) STYLED.forEach((s, i) => { e.style[s] = was[i]; }); memo.adds.delete(key); } continue; }
    if (!p) { const els = a.nodes.map(el).filter((e): e is HTMLElement => !!e); if (!els.length) continue; memo.adds.set(key, (p = addedOf(els, plan.opens.map((o) => el(o.node)).filter((e): e is HTMLElement => !!e)))); }
    const less = new Map<HTMLElement, number>(), up = new Map<HTMLElement, number>();
    for (const u of p.units) {
      const d = u.h * (1 - k);
      u.el.style.opacity = k.toFixed(4);
      u.el.style.clipPath = `inset(0 0 ${d.toFixed(2)}px 0)`;
      less.set(u.box, (less.get(u.box) ?? 0) + d);
      for (const r of u.after) up.set(r, (up.get(r) ?? 0) + d);
    }
    for (const [r, d] of up) r.style.translate = `0 ${(-d).toFixed(2)}px`;
    for (const [box, d] of less) {
      const b = p.boxes.get(box)!, short = Math.max(0, d - b.over);
      if (short > 0) box.style.height = `${(b.h - short).toFixed(2)}px`;
      else box.style.height = p.kept.find(([e]) => e === box)![1][STYLED.indexOf('height')];
      // (what runs past a box made shorter is not seen, and gives it no scroll bar it did not have)
      if (!b.scrolls) box.style.overflowY = 'clip'; else if (b.over <= 0) box.style.overflowY = 'hidden';
      if (b.scrolls) lag.set(box, (lag.get(box) ?? 0) + d);
    }
  }

  for (const id of plan.follows ?? []) { const e = el(id); if (e) e.scrollTop = lag.has(e) ? e.scrollHeight - e.clientHeight - lag.get(e)! : e.scrollHeight; }

  for (const h of plan.hides ?? []) { const e = el(h.node); if (e) e.style.visibility = t >= h.at && t < h.until ? 'hidden' : ''; }

  // a whole screen's page scrolls in its window: the document itself, from where the capture left it (read once)
  if (plan.scroll) { const view = doc.defaultView!; memo.top ??= view.scrollY; view.scrollTo(0, memo.top + scrollAt(plan.scroll, t)); }

  // what grew when the screen became its next capture: from the box it had to the box it has
  for (const g of plan.grows ?? []) {
    const e = el(g.node), k = tw(t, g.at, g.at + 0.5, EASE.settle);
    if (!e || t < g.at) continue;
    e.style.translate = k >= 1 ? '' : `${(g.dx * (1 - k)).toFixed(3)}px ${(g.dy * (1 - k)).toFixed(3)}px`;
    e.style.clipPath = k >= 1 ? '' : `inset(-60px ${(g.right * (1 - k) - (g.right ? 0 : 60)).toFixed(2)}px ${(g.bottom * (1 - k) - (g.bottom ? 0 : 60)).toFixed(2)}px -60px)`;
  }

  // a field the film fills: empty until its moment, then its value whole (a paste) or letter by letter (typing)
  for (const f of plan.fills ?? []) {
    const e = el(f.node) as HTMLInputElement | HTMLTextAreaElement | null;
    if (!e || typeof e.value !== 'string') continue;
    if (!memo.values.has(f.node)) memo.values.set(f.node, e.value);
    const full = f.text ?? memo.values.get(f.node)!, k = f.until > f.at ? clamp01((t - f.at) / (f.until - f.at)) : 1;
    e.value = t < f.at ? '' : full.slice(0, Math.round(k * full.length));
  }

  // a value clicked: it shows selected, the selection sweeping on from the left over 8 frames
  for (const s of plan.selects) {
    if (s.until != null) {
      // a block dragged over: each line of its text is selected once the cursor's tip has come down past it
      const e = el(s.node);
      if (!e) continue;
      const y = t < s.at ? -Infinity : t >= s.until ? Infinity : s.edge?.(t) ?? Infinity;
      for (const line of t < s.at && !memo.blocks.has(s.node) ? [] : blockOf(e, s.node, memo)) line.el.style.setProperty('visibility', line.y <= y ? 'visible' : 'hidden', 'important'); // (important: a windowed screen hides all but its nodes)
      continue;
    }
    // (the layer is made on the first frame that shows it: by then whatever opened around the value has settled)
    const k = tw(t, s.at + 0.03, s.at + 0.3, EASE.linear), e = el(s.node), sel = e && (k > 0 || memo.sels.has(s.node)) ? selectionOf(e, s.node, memo) : null;
    if (!sel || !e) continue;
    // (its own visibility would show it through a hidden parent: it goes when what holds the value has closed)
    sel.style.visibility = k > 0 && e.ownerDocument.defaultView!.getComputedStyle(e).visibility !== 'hidden' ? 'visible' : 'hidden';
    sel.style.scale = e.style.scale;       // whatever the press does to the field, the highlight does with it
    sel.style.translate = e.style.translate;
    (sel.firstElementChild!.firstElementChild as HTMLElement).style.clipPath = `inset(0 ${((1 - k) * 100).toFixed(2)}% 0 0)`;
  }
}
