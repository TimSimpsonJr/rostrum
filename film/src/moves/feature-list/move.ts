// Short nouns appear line by line in the free part of the stage beside a window framed to one side, each on its
// cue, a check mark before each when asked: the recap beside the thing (the showcase study's "feature list"). Quiet
// type: the kit label's plain weight in ink, not a heading.
import { EASE, clamp01 } from '../../kit/ease.ts';
import { columnBeside } from '../../kit/beside.ts';

export type Inputs = { items: string[]; each?: (string | number)[]; checks?: boolean; side?: 'left' | 'right' };

export const about = {
  name: 'feature-list', use: 'moves',
  for: 'Short nouns appear line by line beside a window held to one side (frame.side), each on its cue, a check mark before each when asked: the recap beside the thing.',
  inputs: {
    items: 'two to six short nouns (authored, 28 letters at most)',
    each: 'a cue word per item (default: one every 0.5 s)',
    checks: 'true: a check mark in the accent before each',
    side: 'left (default) | right: the side the WINDOW is framed to; the list stands on the other',
    at: 'the cue the first sets on (default: the line start)', until: 'the cue all clear on (default: the line end)',
  },
  takes: '0.4 s an item; they stay to `until` and clear together in 0.4 s. It names no element: it stands at a fixed place in the column a side framing leaves free, so the beat\'s framing has `side`',
  text: ['items'], cues: ['each'], reads: ['nothing of the screen'],
  example: { line: 7, frame: { whole: true, side: 'left' }, moves: [{ move: 'feature-list', items: ['Name', 'Email', 'Username'], each: ['name', 'email', 'username'], checks: true }] },
};
export function check(i: Inputs) {
  if (!Array.isArray(i.items) || i.items.length < 2 || i.items.length > 6 || !i.items.every((s) => typeof s === 'string' && s.trim() && s.length <= 28)) return 'items: two to six, each 28 letters at most';
  if (i.each && (!Array.isArray(i.each) || i.each.length !== i.items.length)) return 'each: one cue per item';
  if (i.checks != null && typeof i.checks !== 'boolean') return 'checks is true or false';
  if (i.side != null && i.side !== 'left' && i.side !== 'right') return 'side is left or right: the side the window is framed to';
  return null;
}
export const text = (i: Inputs) => i.items;
export const takes = (i: Inputs) => (i.each ? 0.6 : 0.5 * (i.items.length - 1) + 0.6);
export const SIZE = 36, LINE = 64, MARK = 52, LEAD = 0.1, RISE = 0.4, CLEAR = 0.4;
export const columnOf = (i: Inputs) => columnBeside(i.side);
export const startsOf = (n: number, from: number, cues?: number[]) => cues ?? Array.from({ length: n }, (_, k) => from + 0.5 * k);
/** the top of line i of n (frame px): the block is centred on the frame's height */
export const yOf = (n: number, i: number) => 540 - ((n - 1) * LINE) / 2 + i * LINE - (SIZE * 1.25) / 2;
/** item at second t: how far it has set (it leads its cue a little, so it is there on the word) and how far all have cleared */
export const itemAt = (start: number, to: number, t: number) => ({ k: EASE.settle(clamp01((t - start + LEAD) / RISE)), out: EASE.settle(clamp01((t - to) / CLEAR)) });
