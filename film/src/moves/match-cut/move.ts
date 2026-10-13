// The way into a shot on one object that is in both: the shot before travels so that the object goes to where, and
// grows to the size, it has on the new shot; it gathers speed all the way, brakes hard, and the cut lands on the
// arrival, the new shot taking the impact (one small overshoot, no second swing). Only for the SAME thing on both
// shots (a row that becomes its page, a document that becomes a dialog): between two different things it jars.
// The motion is the explainer's "cutting the curve" (its motion/cutCurve.ts, the rectangle), as plain math.
import { lerp } from '../../kit/ease.ts';

export type Inputs = { hero: [string, string] };
type Box = { x: number; y: number; w: number; h: number };

export const about = {
  name: 'match-cut', use: 'cut',
  for: 'One object that is on both shots carries the cut: the shot before travels until the object is where, and as large as, it is on the new shot, and the cut lands as it arrives. Only for the same thing on both sides.',
  inputs: { hero: 'two names in `nodes`: the object on the shot before, and the same object on the new shot' },
  takes: '1.6 s: it gathers speed slowly, so most of the travel is in the half second before the cut, which lands 1.16 s in', text: [], reads: ['the named element', 'two screens'],
  example: { line: 4, screen: 2, cut: { move: 'match-cut', hero: ['row', 'page'] } },
};
export const check = (i: Partial<Inputs>) => (Array.isArray(i.hero) && i.hero.length === 2 && i.hero.every((n) => typeof n === 'string' && n.trim()) ? null : 'hero is two names in `nodes`: the object before the cut, and after it');
export const takes = () => 1.6;

// ---- the curve (frames of the explainer's test, where the move was approved) ----
// Three pieces, joined with equal position and speed (the force is what jumps, which is the point):
//   travel   an exponential ease in, fastest on its last frame
//   brake    constant deceleration for BRAKE frames, down to V_HIT on the arrival frame
//   impact   1 + V_HIT s e^(-W s): critically damped, so it passes the rest place once and never comes back under
const K = 5;
const TRAVEL = 44; // frames of ease in
const BRAKE = 3;
const V_HIT = 0.027; // progress per frame left on the arrival frame; the overshoot is V_HIT / (W e)
const W = 0.5; // per frame: the overshoot peaks 1 / W frames after the arrival
const G = Math.exp(K) - 1;
const V_END = (K * Math.exp(K)) / G / TRAVEL; // the ease in's last slope, per unit of its own height
const P_BRAKE = (1 - (V_HIT * BRAKE) / 2) / (1 + (V_END * BRAKE) / 2); // where the brake comes on
const DECEL = (P_BRAKE * V_END - V_HIT) / BRAKE;
const R_START = 16;
/** `stop` is the arrival frame: the cut is on it. */
export const RECT = { start: R_START, brake: R_START + TRAVEL, stop: R_START + TRAVEL + BRAKE };
export function rectCurve(f: number) {
  const s = f - RECT.stop;
  if (s >= 0) return 1 + V_HIT * s * Math.exp(-W * s);
  if (s >= -BRAKE) return 1 + V_HIT * s - 0.5 * DECEL * s * s;
  const u = (f - RECT.start) / TRAVEL;
  return P_BRAKE * (u < 0 ? (K / G) * u : (Math.exp(K * u) - 1) / G);
}
/** frames of the curve the cut move plays, from its start: the travel, the brake, and 18 frames of impact */
const SPAN = RECT.stop + 18 - RECT.start;
/** when (of the cut, 0..1) the new shot takes the old one's place: on the arrival */
export const CUT = (RECT.stop - RECT.start) / SPAN;

const mid = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 }), size = (b: Box) => Math.sqrt(b.w * b.h);
/** The cut k (0..1) through, for an object whose box on the frame is `a` on the shot before and `b` on the new one.
 *  `p`: how far the object has gone (past 1 for a moment after the arrival); `shot`: which shot is drawn, and the
 *  transform (about the frame's top left: a scale, then x and y) that puts that shot's own object on the path. */
export function matchAt(k: number, a: Box, b: Box) {
  const p = rectCurve(RECT.start + Math.min(1, Math.max(0, k)) * SPAN), cut = k >= CUT;
  const ma = mid(a), mb = mid(b), at = { x: lerp(ma.x, mb.x, p), y: lerp(ma.y, mb.y, p) }, big = size(a) * (size(b) / size(a)) ** p;
  const own = cut ? b : a, m = cut ? mb : ma, scale = big / size(own);
  return { p, cut, scale, x: at.x - scale * m.x, y: at.y - scale * m.y };
}
