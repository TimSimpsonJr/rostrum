// The frame dims around one element for a beat, through a soft-edged window, then lifts: only this part, when a
// lift-out is too much (library-study.md 3.2 item 12). No ring, no glow, no sound.
import { EASE, clamp01 } from '../../kit/ease.ts';
export type Inputs = { target: string; tight?: boolean };
type Box = { x: number; y: number; w: number; h: number };
export const about = {
  name: 'spotlight', use: 'moves',
  for: 'The frame dims around a soft-edged window on one element for a beat, then lifts: only this part.',
  inputs: { target: 'a name in `nodes`: the element kept lit', tight: 'true: the lit window is the element\'s box exactly, with a 4 px feather (a table row lit and nothing past it; default: grown a tenth each way, a 12 px feather)', at: 'the cue the dim comes on (default: the line start)', until: 'the cue it lifts by (default: the line end, or 1.2 s after)' },
  takes: '1.2 s at least: 0.3 s in, 0.3 s out. One spotlight at a time', text: [], reads: ['the named element'],
  example: { line: 5, moves: [{ move: 'spotlight', target: 'keyField', at: 'key' }] },
};
export const check = (i: Partial<Inputs>) => (typeof i.target !== 'string' || !i.target.trim() ? 'target is a name in `nodes`' : i.tight != null && typeof i.tight !== 'boolean' ? 'tight is true or false' : null);
export const takes = () => 1.2;
export const IN = 0.3, DIM = 0.35, FEATHER = 12, GROW = 0.1, TIGHT_FEATHER = 4;
export const dimAt = (from: number, to: number, t: number) => EASE.settle(clamp01((t - from) / IN)) * (1 - EASE.settle(clamp01((t - (to - IN)) / IN)));
/** the lit window: the element's box grown a tenth each way, or (`tight`) the box itself; and its feather */
export const featherOf = (tight?: boolean) => (tight ? TIGHT_FEATHER : FEATHER);
export const windowOf = (b: Box, tight?: boolean): Box => (tight ? { ...b } : { x: b.x - GROW * b.w, y: b.y - GROW * b.h, w: b.w * (1 + 2 * GROW), h: b.h * (1 + 2 * GROW) });
