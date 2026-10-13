// What a screen is made of: two to four of its elements lift apart in depth, parallel to the page (nothing tilts),
// each alone on its own ground with its own shadow, the nearer the larger; they hold with a slow parallax and close
// again while the screen under them draws back half way (library-study.md 1.2 item 23, depth lift / unstack).
// The depth is a plain perspective worked out here: an element z px nearer, seen from EYE px away, is
// EYE / (EYE - z) of its size. So every layer is placed by a 2D transform and moves by sub-pixels.
// (The plan had steps of 28 px: with nothing tilted that is a hundredth of the size a layer, and cannot be seen.)
import { EASE, clamp01, wander } from '../../kit/ease.ts';

export type Inputs = { nodes: string[] };
type Box = { x: number; y: number; w: number; h: number };

export const about = {
  name: 'depth-lift', use: 'moves',
  for: 'Two to four elements of the screen lift apart in depth, parallel to the page, each on its own ground with its own shadow, hold with a slow parallax and close again: what this screen is made of.',
  inputs: {
    nodes: 'two to four names in `nodes`, the farthest first (a card, then a field in it, then its button): each stands a step nearer than the one before it',
    at: 'the cue they lift apart on (default: the line start)', until: 'the cue by which they are back in the page (default: the line end, or 2 s after they lifted)',
  },
  takes: '2 s at least: 0.7 s apart and 0.7 s to close, and what is between is the time to see them. The camera holds meanwhile. Each element is one more screen rebuilt per frame while they are up',
  text: [], lifts: ['nodes[]'], reads: ['the named element'],
  example: { line: 4, moves: [{ move: 'depth-lift', nodes: ['dialog', 'keyField', 'done'], at: 'made' }] },
};
export function check(i: Partial<Inputs>) {
  const n = i.nodes;
  if (!Array.isArray(n) || n.length < 2 || n.length > 4 || !n.every((x) => typeof x === 'string' && x.trim()) || new Set(n).size !== n.length) return 'nodes is two to four different names in `nodes`, the farthest first';
  return null;
}
export const takes = () => 2;

/** seconds to lift apart, and to close; px nearer per layer; px the eye is from the page */
export const APART = 0.7, STEP = 90, EYE = 2600;
/** how far apart (0..1) the layers are at second t of a run from `from` to `to` */
export const depthAt = (from: number, to: number, t: number) => EASE.heavy(clamp01((t - from) / APART)) * (1 - EASE.heavy(clamp01((t - (to - APART)) / APART)));
/** the screen under them draws back half as far as under a lift-out */
export const recedes = (t: number, from: number, to: number) => 0.5 * depthAt(from, to, t);
/** Layer i (0: the farthest), k of the way apart, at film second t, for an element whose box on the frame is `box`:
 *  its box now (its own shape, larger by its depth) and how near it is (`z`, px). The eye stands in front of each
 *  element (so a layer rises over its own place and covers it: seen from the frame's middle, a field near an edge
 *  would stand beside the copy of itself in the layer below) and wanders a little, so the nearer a layer is the more
 *  it shifts: the parallax. At k = 0 it is its own box. */
export function layerAt(i: number, k: number, t: number, box: Box): Box & { z: number; scale: number } {
  const z = STEP * i * k, scale = EYE / (EYE - z), eye = wander(t, 5, 70), more = scale - 1;
  return { x: box.x - (box.w / 2 + eye.x) * more, y: box.y - (box.h / 2 + eye.y) * more, w: box.w * scale, h: box.h * scale, z, scale };
}
/** what a layer z px off the page casts on the one below: nearer, lower and softer (a box-shadow; none at 0) */
export const castAt = (z: number) => `0 ${(0.16 * z).toFixed(2)}px ${(0.4 * z).toFixed(2)}px ${(-0.05 * z).toFixed(2)}px oklch(0.3 0.08 272 / 0.3)`;
