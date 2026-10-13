// One element grows in its place while what is around it dims a little, holds, and comes back: the one focus move of
// the showcase that is not a cut (STUDY.md: scale of one item). No blur, no travel, no sound. The dim is the move's
// own (the screen does not recede): a soft oval round the element, not the frame, so on a `bare` shot, where
// no window stands under it, the stage is not dimmed from edge to edge.
import { EASE, clamp01 } from '../../kit/ease.ts';
export type Inputs = { target: string };
type Box = { x: number; y: number; w: number; h: number };
export const about = {
  name: 'icon-lift', use: 'moves',
  for: 'One element grows to one and a half times its size in its place over ten frames while what is around it dims a fifth, holds, and comes back: the one focus move that is not a cut. No blur, no travel.',
  inputs: { target: 'a name in `nodes`: the element that grows (an icon, a button, a field)', at: 'the cue it grows on (default: the line start)', until: 'the cue by which it is back (default: the line end, or 1.2 s after)' },
  takes: '1.2 s at least: 10 frames up and 10 down. What dims is the element\'s surroundings, an oval round it that falls away to nothing, not the whole frame: the same on a whole screen, in a window and on a bare shot. One more screen rebuilt per frame while it is up',
  text: [], lifts: ['target'], reads: ['the named element'],
  example: { line: 4, moves: [{ move: 'icon-lift', target: 'viewKey', at: 'view' }] },
};
export const check = (i: Partial<Inputs>) => (typeof i.target === 'string' && i.target.trim() ? null : 'target is a name in `nodes`');
export const takes = () => 1.2;
export const GROW = 1.5, UP = 10 / 30, DIM = 0.2, CORE = 0.3;
/** how far up (0..1) the element is at second t of a run: up over UP, down over the last UP, one stroke each */
export const liftAt = (from: number, to: number, t: number) => EASE.stroke(clamp01((t - from) / UP)) * (1 - EASE.stroke(clamp01((t - (to - UP)) / UP)));
export const scaleAt = (k: number) => 1 + (GROW - 1) * k;
/** what dims: an oval in the element's box (frame px) grown by its own longer side and a little, each way: full over
 *  its inner CORE, falling away to nothing at its edge */
export const patchOf = (b: Box): Box => { const m = Math.max(b.w, b.h) + 160; return { x: b.x - m, y: b.y - m, w: b.w + 2 * m, h: b.h + 2 * m }; };
