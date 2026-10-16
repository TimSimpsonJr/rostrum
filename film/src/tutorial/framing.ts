// Where the camera goes for a beat, from measured boxes (recorded-viewport px). Pure: node can load it.
// "The window" is what the shot shows of its screen: the whole viewport, or (a beat file's `window`) one node's box.
// The house rules it keeps: the whole screen first, then in; a small control is never framed alone but with its row
// or group; the scale never decreases within a screen (frameFor is given the scale the camera already has and never
// answers with less); nothing is framed so tight that it touches the frame's edge; the frame's edge falls in a gap
// between the screen's elements when the screen was measured (`settle`), and what a click opens is whole in the frame
// the click is seen in (`also`).
import type { Box, CamKey, Size } from './cameraAt.ts';
import { ASIDE } from '../kit/beside.ts';

export const FRAME: Size = { width: 1920, height: 1080 };

/** A beat's framing in the beat file: the whole screen, or a named target `with` its row, its group, the screen's
 *  corner it sits in, or (`self`, the default) alone. */
export type FrameSpec = {
  whole?: boolean; target?: string; with?: 'self' | 'row' | 'group' | 'corner';
  /** two or more named things held in one frame: the union of their boxes, framed like a group */
  targets?: string[];
  /** the camera may pull back to this framing: it is as wide as it asks, whatever the shot has been framed at */
  back?: boolean;
  /** false: the framing is left exactly as asked, its edges not moved into the gaps between the screen's elements */
  settle?: boolean;
  /** the camera cuts to this framing (a hard cut, no travel): as wide or as tight as it asks, like `back` */
  cut?: boolean;
  /** on a shot's first framing: the camera does not drift at all for the shot; all change is inside the screen */
  hold?: boolean;
  /** what is framed stands to this side of the stage, at half the frame's width at most, the other side left free for
   *  type (kit/beside.ts ASIDE). Smaller than a framing in the middle: a shot's first framing, or one with `back` or `cut` */
  side?: 'left' | 'right';
};
/** What else a framing is told: `also`, boxes that must be whole in the frame with it (what a click seen in this
 *  framing opens); `pieces`, the boxes of the screen's elements (clean/layout.json), so the frame's edge can be put in
 *  a gap between them. */
export type Around = { also?: Box[]; pieces?: Box[] };
/** A measured node (clean/boxes.json). `row`, `group`: the boxes of its row and of its nearest group, when the
 *  measuring found them. `spot`: where in the box (shares of its width and height) a cursor's tip can rest without
 *  sitting on the control's letters. */
/** `pageY`: the document scroll its screen was measured at, when not its capture's own (a `becomes` anchor: Measure) */
export type Measured = Box & { screen: number; node: number; row?: Box; group?: Box; spot?: [number, number]; pageY?: number };
export type Boxes = Record<string, Measured>;
export type Framing = { box: Box; fill: number; scale: number };

const WHOLE = 0.8;        // the whole screen, met at 80% of the frame's width
const SELF = 0.7;         // a target alone
const GROUP = 0.78;       // a row, a group, or a target that is a group in its own right (a card, a panel)
const TALL = 0.93;        // the most of the frame's height a framed box may take
const WIDE = 0.92;        // the most of its width, when the camera is pushed past the natural framing
const SMALL = 0.12;       // a box narrower than this share of the viewport is a small control: framed with its row
const LARGE = 0.25;       // a box wider than this is a group in its own right
const LONG = 0.86;         // a window that is one node of a page, taller than the frame: the share of the frame's height it stands
const CORNER = 0.375;     // the corner framing holds this share of the viewport's width...
const CORNER_PAST = { x: 20, y: 30 }; // ...and runs this far past the window's edges, so the window's corner shows

export const union = (...b: Box[]): Box => {
  const x = Math.min(...b.map((r) => r.x)), y = Math.min(...b.map((r) => r.y));
  return { x, y, w: Math.max(...b.map((r) => r.x + r.w)) - x, h: Math.max(...b.map((r) => r.y + r.h)) - y };
};
const scaleOf = (box: Box, fill: number) => (fill * FRAME.width) / box.w;
/** The height a window of this width is given when its content is taller than the frame can show at the film's
 *  width: the content scrolls inside it (beats.ts `scrolls`). */
export const windowHeight = (w: number) => (w * LONG * FRAME.height) / (WHOLE * FRAME.width);
/** The largest scale at which `box` still sits inside the frame with air around it. */
export const mostScale = (box: Box) => Math.min(scaleOf(box, WIDE), (TALL * FRAME.height) / box.h);

/** The box and fill for a framing, never below `prevScale` (the scale the camera has on this screen already) and,
 *  when it can be helped, never above `maxScale` (what a later framing on the same screen can still take).
 *  `toward`: where the camera goes next on this screen (the middle of the next framing), when it goes anywhere: a row
 *  is framed leaning that way, so the camera does not swing out to the row and back.
 *  `win`: the shot's window, a box on its screen; a bare size is a window at the screen's origin (the viewport). */
export function frameFor(frame: FrameSpec, boxes: Boxes, win: Box | Size, prevScale = 0, maxScale = Infinity, toward?: { x: number; y: number }, around: Around = {}): Framing {
  const done = (box: Box, fill: number): Framing => {
    const natural = Math.min(scaleOf(box, frame.side ? Math.min(fill, ASIDE.fill) : fill), (TALL * FRAME.height) / box.h);
    const scale = Math.max(prevScale, Math.min(natural, maxScale)); // never less than before, whatever comes later
    return { box, fill: (scale * box.w) / FRAME.width, scale };
  };
  const window: Box = 'w' in win ? win : { x: 0, y: 0, w: win.width, h: win.height };
  let f = plain(frame, boxes, window, prevScale, toward, done);
  // what a click seen in this framing opens is whole in the frame when it appears: the framing holds both
  const lost = (around.also ?? []).filter((b) => !within(b, seenBy(f), AIR / f.scale));
  if (lost.length) f = done(union(f.box, ...lost), GROUP);
  // to one side: the camera's middle is put that far to the other side of what it frames (left as asked: no settling)
  if (frame.side) return { ...f, box: { ...f.box, x: f.box.x + ((frame.side === 'left' ? ASIDE.off : -ASIDE.off) * FRAME.width) / f.scale } };
  // the whole screen has no neighbours to cut; a corner is a fixed share of the window by definition
  const fixed = frame.whole || frame.settle === false || (!frame.target && !frame.targets?.length) || (frame.with === 'corner' && !lost.length);
  return fixed || !around.pieces?.length ? f : settle(f, around.pieces, prevScale);
}

const AIR = 24;           // frame px between the frame's edge and something that must be whole inside it
const EDGE = 8;           // frame px: an element nearer the frame's edge than this, or across it, is cut by it
const NUDGE = 0.13;        // the most a framing is shifted for its edges' sake, as a share of the frame: what it frames stays about the middle
const WIDEN = [1, 0.97, 0.94, 0.91, 0.88, 0.85]; // when no shift clears the edges, how far a framing may widen

/** What the frame shows of the recorded screen under a framing (recorded-viewport px). */
export const seenBy = (f: Framing): Box => {
  const w = FRAME.width / f.scale, h = FRAME.height / f.scale;
  return { x: f.box.x + f.box.w / 2 - w / 2, y: f.box.y + f.box.h / 2 - h / 2, w, h };
};
const within = (b: Box, v: Box, air = 0) => b.x >= v.x + air && b.y >= v.y + air && b.x + b.w <= v.x + v.w - air && b.y + b.h <= v.y + v.h - air;
const apart = (b: Box, v: Box) => b.x >= v.x + v.w || b.x + b.w <= v.x || b.y >= v.y + v.h || b.y + b.h <= v.y;

/** How many of `pieces` the frame's edge cuts under `f`: those partly in the frame, or nearer its edge than EDGE.
 *  One that is at least half in the frame counts double (it reads as something the shot is showing); one too large
 *  ever to be whole in the frame (a band across the page, a panel) does not count. */
export function cutBy(f: Framing, pieces: Box[]) {
  const v = seenBy(f), m = EDGE / f.scale;
  let n = 0;
  for (const p of pieces) {
    if (p.w > 0.5 * v.w || p.h > 0.5 * v.h || apart(p, v) || within(p, v, m)) continue;
    const ix = Math.min(p.x + p.w, v.x + v.w) - Math.max(p.x, v.x), iy = Math.min(p.y + p.h, v.y + v.h) - Math.max(p.y, v.y);
    n += ix * iy >= 0.5 * p.w * p.h ? 2 : 1;
  }
  return n;
}

/** The framing nudged so its edges fall in gaps between elements: shifted first (the framed box stays whole in the
 *  frame, and the shift stays a nudge), and only when no shift does better, widened a little (never looser than
 *  `prevScale`). The same framing comes back when nothing is cut, or when nothing tried cuts less. */
export function settle(f: Framing, pieces: Box[], prevScale = 0): Framing {
  const base = cutBy(f, pieces);
  if (!base) return f;
  let best = { f, cost: base, effort: 0 };
  for (const k of WIDEN) {
    const scale = f.scale * k;
    if (scale < prevScale - 1e-9) break;
    const at = (dx: number, dy: number): Framing => ({ box: { ...f.box, x: f.box.x + dx, y: f.box.y + dy }, fill: (scale * f.box.w) / FRAME.width, scale });
    const v = seenBy(at(0, 0)), m = EDGE / scale;
    // the shifts worth trying on one axis: those that bring a cut element's far side just inside the frame's edge, or
    // put its near side just outside it; never so far that the framed box leaves the frame or the shift stops being a nudge
    const tries = (axis: 'x' | 'y') => {
      const size = axis === 'x' ? 'w' : 'h', lo = v[axis], hi = v[axis] + v[size], most = Math.min(NUDGE * v[size], Math.max(0, (v[size] - f.box[size]) / 2 - m));
      const out = new Set<number>([0]);
      for (const p of pieces) {
        const a = p[axis], b = p[axis] + p[size];
        for (const d of [a - m - lo - 0.01, b - lo + 0.01, b + m - hi + 0.01, a - hi - 0.01]) if (Math.abs(d) <= most) out.add(d);
      }
      return [...out].sort((p, q) => Math.abs(p) - Math.abs(q) || p - q);
    };
    let dx = 0, dy = 0;
    const cost = (x: number, y: number) => cutBy(at(x, y), pieces);
    for (let pass = 0; pass < 2; pass++) {
      for (const d of tries('x')) if (cost(d, dy) < cost(dx, dy)) dx = d;
      for (const d of tries('y')) if (cost(dx, d) < cost(dx, dy)) dy = d;
    }
    const c = cost(dx, dy), effort = (1 - k) * FRAME.width + (Math.abs(dx) + Math.abs(dy)) * scale;
    if (c < best.cost) best = { f: at(dx, dy), cost: c, effort };
    if (!best.cost) break;
  }
  return best.f;
}

/** The framing as the beat file asks for it, before its surroundings are looked at. */
function plain(frame: FrameSpec, boxes: Boxes, window: Box, prevScale: number, toward: { x: number; y: number } | undefined, done: (box: Box, fill: number) => Framing): Framing {
  if (frame.targets?.length) {
    const all = frame.targets.map((name) => { const t = boxes[name]; if (!t) throw new Error(`framing: no measured box named "${name}"`); return { x: t.x, y: t.y, w: t.w, h: t.h }; });
    return done(union(...all), GROUP);
  }
  if (frame.whole || !frame.target) return done({ ...window }, WHOLE);
  const b = boxes[frame.target];
  if (!b) throw new Error(`framing: no measured box named "${frame.target}"`);
  const own: Box = { x: b.x, y: b.y, w: b.w, h: b.h };
  const small = own.w < SMALL * window.w;
  let how = frame.with ?? 'self';
  if (how === 'self' && small) how = 'row';
  if (how === 'corner') {
    // the corner of the window the target sits in: a fixed share of the window, running a little past its edges
    const s = FRAME.width / (CORNER * window.w), w = FRAME.width / s, h = FRAME.height / s;
    const right = own.x + own.w / 2 > window.x + window.w / 2, low = own.y + own.h / 2 > window.y + window.h / 2;
    const box = { x: right ? window.x + window.w + CORNER_PAST.x - w : window.x - CORNER_PAST.x, y: low ? window.y + window.h + CORNER_PAST.y - h : window.y - CORNER_PAST.y, w, h };
    const holds = own.x >= box.x && own.y >= box.y && own.x + own.w <= box.x + box.w && own.y + own.h <= box.y + box.h;
    if (holds) { const scale = Math.max(prevScale, s); return { box, fill: (scale * box.w) / FRAME.width, scale }; }
    how = 'group';
  }
  if (how === 'row') {
    // the row as measured; without one, the control with as much to either side as makes it a row's width
    const w = Math.max(own.w, 0.22 * window.w);
    const row = b.row ? union(own, b.row) : { x: own.x + own.w / 2 - w / 2, y: own.y, w, h: own.h };
    // the row is not centred on nothing: the frame leans toward where the camera goes next on this screen, or (when
    // it goes nowhere) toward the rest of the row's group; the row stays whole and in the frame's middle part
    const mid = { x: row.x + row.w / 2, y: row.y + row.h / 2 };
    // (half the way to the next framing: the row keeps the larger part of its own shot)
    const to = toward ? { x: (mid.x + toward.x) / 2, y: (mid.y + toward.y) / 2 } : b.group ? { x: mid.x, y: b.group.y + b.group.h / 2 } : null;
    if (!to) return done(row, GROUP);
    const s = scaleOf(row, GROUP), lean = { x: Math.max(0, ((WIDE * FRAME.width) / s - row.w) / 2), y: (0.22 * FRAME.height) / s };
    const by = (d: number, most: number) => Math.max(-most, Math.min(most, d));
    return done({ ...row, x: row.x + by(to.x - mid.x, lean.x), y: row.y + by(to.y - mid.y, lean.y) }, GROUP);
  }
  if (how === 'group') return done(b.group ? union(own, b.group) : b.row ? union(own, b.row) : own, GROUP);
  return done(own, own.w > LARGE * window.w ? GROUP : SELF);
}

/** A hold is itself a slow push, so no frame equals the last: the fill `seconds` after a key was reached. */
export const drifted = (fill: number, seconds: number) => fill * Math.min(1.06, Math.max(1.002, 1.007 ** seconds));
/** How long a move takes, from how far in it goes (the ratio of the scales). */
export const moveSeconds = (zoom: number) => 1.2 + 0.85 * Math.log2(Math.max(1, zoom));
/** A new framing on the same screen is at least this much tighter than where the camera is: a move always goes in. */
export const STEP = 1.03;

export type { Box, CamKey, Size };
