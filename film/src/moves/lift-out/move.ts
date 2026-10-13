// One element of the screen lifted out of it: it rises off the page to the middle of the frame and grows, on its own
// ground with the stage's lift shadow, while the screen draws back, dims and softens under it; before its run ends
// it is set down again where it came from. The one emphasis move of a how-to: the thing the viewer came for
// (library-study.md: Lift-Off and Set-Down; the macro push on one control).
import { EASE, clamp01 } from '../../kit/ease.ts';

export type Inputs = { node: string; strength?: 1 | 2 | 3 };
type Box = { x: number; y: number; w: number; h: number };

export const about = {
  name: 'lift-out', use: 'moves',
  for: 'One element rises off the page to the middle of the frame and grows while the screen draws back and softens under it, then is set down again: the one thing this line is about, large enough to read.',
  inputs: {
    node: 'a name in `nodes`: the element that is lifted out (a field, a row, a card, a dialog)',
    strength: '1 | 2 (default) | 3: how large it stands, 0.6, 0.72 or 0.85 of the frame\'s width (less when it is tall)',
    at: 'the cue it rises on (default: the line start)', until: 'the cue by which it is back in its place (default: the line end, or 1.5 s after it rose)',
  },
  takes: '1.5 s at least: 0.6 s up and 0.6 s down, and what is between is the time to read it. The camera holds meanwhile (keep the framing over its beat), and twice in a row is a second lift, not a longer one. Each lift is one more screen rebuilt per frame while it is up',
  text: [], lifts: ['node'], reads: ['the named element'],
  example: { line: 3, moves: [{ move: 'lift-out', node: 'keyField', at: 'key' }] },
};
const SHARE = { 1: 0.6, 2: 0.72, 3: 0.85 };
export function check(i: Partial<Inputs>) {
  if (typeof i.node !== 'string' || !i.node.trim()) return 'node is a name in `nodes`';
  if (i.strength != null && !(i.strength in SHARE)) return 'strength is 1, 2 or 3';
  return null;
}
export const takes = () => 1.5;

const FRAME = { w: 1920, h: 1080 }, RISE = 0.6, TALLEST = 0.78;
/** how far out (0..1) the element is at second t of a run from `from` to `to`: up over RISE seconds, down over the
 *  last RISE seconds, each one heavy move */
export const liftAt = (from: number, to: number, t: number) => EASE.heavy(clamp01((t - from) / RISE)) * (1 - EASE.heavy(clamp01((t - (to - RISE)) / RISE)));
/** the screen under it recedes as far as the element is out */
export const recedes = (t: number, from: number, to: number) => liftAt(from, to, t);
/** where the element stands when it is out: its own shape, `strength` of the frame's width (or as tall as the frame
 *  allows), in the middle of the frame */
export function heroOf(box: Box, strength: Inputs['strength'] = 2): Box {
  const k = Math.min((SHARE[strength] * FRAME.w) / box.w, (TALLEST * FRAME.h) / box.h), w = box.w * k, h = box.h * k;
  return { x: (FRAME.w - w) / 2, y: (FRAME.h - h) / 2, w, h };
}
