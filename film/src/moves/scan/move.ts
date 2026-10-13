// A light passes over an element (or the whole frame): everything dims a little and a soft band, or a soft round
// window, crosses it from left to right once. "It is being read", "it is being checked". The explainer's scan
// (library-study.md 1.2).
import { EASE, clamp01 } from '../../kit/ease.ts';

export type Inputs = { target?: string; kind?: 'line' | 'cone' };

export const about = {
  name: 'scan', use: 'moves',
  for: 'A light passes once, left to right, over an element or the whole frame while the rest dims a little: something is being read or checked.',
  inputs: {
    target: 'a name in `nodes`: the element it passes over (optional: without it, the whole frame)',
    kind: 'line (default: a soft upright band) | cone (a soft round window)',
    at: 'the cue the pass starts on (default: the line start)', until: 'the cue it has crossed by (default: 1.4 s later, or the line end; never slower than 2.4 s)',
  },
  takes: '1.4 s (up to 2.4 s when the line is longer)', text: [], reads: ['the named element'],
  example: { line: 5, moves: [{ move: 'scan', target: 'report', at: 'checks' }] },
};
const KINDS = ['line', 'cone'];
export function check(i: Inputs) {
  if (i.target != null && !(typeof i.target === 'string' && i.target.trim())) return 'target is a name in `nodes`';
  if (i.kind != null && !KINDS.includes(i.kind)) return 'kind is line or cone';
  return null;
}
export const takes = () => 1.4;
export const SLOWEST = 2.4;
/** the pass at t: `k` 0..1 how far across the light is (steady, with soft ends), `dim` 0..1 how far the rest has
 *  dimmed (up over the first 0.25 s, back as the light leaves). The pass runs from `from` to `to`, but never takes
 *  longer than SLOWEST. */
export function scanAt(from: number, to: number, t: number): { k: number; dim: number } {
  const end = Math.min(to, from + SLOWEST), k = EASE.draw(clamp01((t - from) / (end - from)));
  return { k, dim: Math.min(EASE.settle(clamp01((t - from) / 0.25)), 1 - EASE.settle(clamp01((t - (end - 0.25)) / 0.3))) };
}
