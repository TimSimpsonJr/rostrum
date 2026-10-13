// A burst of short strokes off the edge of an element at the moment something lands on it: a click that matters, a
// thing that arrives. Over in a third of a second. The explainer's impact lines (library-study.md 1.2).
import { EASE, clamp01, rnd } from '../../kit/ease.ts';

export type Inputs = { target?: string };
type Box = { x: number; y: number; w: number; h: number };

export const about = {
  name: 'impact-lines', use: 'moves',
  for: 'Six to eight short strokes burst outward from the edge of an element (or from the middle of the frame) and are gone in a third of a second: the moment something lands.',
  inputs: {
    target: 'a name in `nodes`: the element they burst from (optional: without it, the middle of the frame)',
    at: 'the cue they burst on (default: the line start)',
  },
  takes: '0.35 s', text: [], reads: ['the named element'],
  example: { line: 2, moves: [{ move: 'impact-lines', target: 'save', at: 'saved' }] },
};
export const check = (i: Inputs) => (i.target == null || (typeof i.target === 'string' && i.target.trim()) ? null : 'target is a name in `nodes`');
export const takes = () => 0.35;
/** the strokes when the burst is k (0..1) through: for each, its heading (radians), how far beyond the edge its tail
 *  and its head are (0..1 of the burst's reach; the head leads off fast and the tail follows), and its opacity (it
 *  fades over the last third). Six to eight of them by the seed, spread round with a little unevenness. */
export function strokesAt(k: number, seed = 0): { a: number; tail: number; head: number; o: number }[] {
  const n = 6 + Math.floor(rnd(seed, 5) * 3), u = clamp01(k), turn = rnd(seed, 6);
  return Array.from({ length: n }, (_, j) => {
    const late = 0.12 * rnd(seed * 13 + j, 7), v = clamp01((u - late) / (1 - late));
    return { a: ((j + turn + 0.5 * (rnd(seed * 13 + j, 8) - 0.5)) / n) * Math.PI * 2, tail: EASE.stroke(clamp01(v * 1.6 - 0.6)), head: EASE.stroke(v), o: 1 - clamp01((v - 2 / 3) * 3) };
  });
}
/** where the ray from the middle of `b` at heading `a` leaves it, and the unit vector along it */
export function edgeOf(b: Box, a: number) {
  const dx = Math.cos(a), dy = Math.sin(a), d = Math.min(Math.abs(dx) > 1e-9 ? b.w / 2 / Math.abs(dx) : Infinity, Math.abs(dy) > 1e-9 ? b.h / 2 / Math.abs(dy) : Infinity);
  return { x: b.x + b.w / 2 + dx * d, y: b.y + b.h / 2 + dy * d, dx, dy };
}
