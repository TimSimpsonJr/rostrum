// The way into a shot from close on one of its elements: a hard cut lands twice as close as the shot frames it, and
// the picture pulls back to the shot's framing in one move, off the mark fast and settling long (STUDY.md LG-3, toned
// down from 20x to 2x). The shot before is gone at once. The camera's own keys do not change: the cut scales the
// new shot about the element, where the shot's own camera has it (a framing to one side, a held shot: all the same).
import { EASE, clamp01 } from '../../kit/ease.ts';
export type Inputs = { from: string };
export const about = {
  name: 'pull-back', use: 'cut',
  for: 'A hard cut lands close on one element of the new shot, twice the size the shot frames it, and pulls back to the shot\'s framing in one move, fast off the mark and settling long: from a detail to its place.',
  inputs: { from: 'a name in `nodes`: the element on the NEW shot\'s screen the cut lands on (one the page shows at the cut: not something a later click opens)' },
  takes: '0.8 s; the shot before is gone at once and the new page is there whole (nothing sets in). A cursor on the new shot is enlarged with it. The shot\'s own slow push follows: `hold` on its first framing for a dead stop',
  text: [], reads: ['the named element', 'two screens'],
  cursor: 'fades', toneAt: 0, whole: true,
  example: { line: 3, screen: 1, cut: { move: 'pull-back', from: 'keyField' } },
};
export const check = (i: Partial<Inputs>) => (typeof i.from === 'string' && i.from.trim() ? null : 'from is a name in `nodes`');
export const takes = () => 0.8;
export const START = 2;
/** the new shot's scale about the element's middle, k (0..1) of the way through: START down to 1, geometric, one stroke */
export const pullAt = (k: number) => START ** (1 - EASE.stroke(clamp01(k)));
