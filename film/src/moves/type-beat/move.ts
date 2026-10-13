// Two to four words alone on the stage in the title's type, rising into place through a mask and clearing upward: a
// breath between two parts of a long film (library-study.md 3.2 item 14). On a scene; never a slogan or a status.
import { EASE, clamp01 } from '../../kit/ease.ts';
export type Inputs = { text: string };
export const about = {
  name: 'type-beat', use: 'moves',
  for: 'Two to four words alone on the stage in the title\'s type, rising into place and clearing upward: a breath between two parts of a long film.',
  inputs: { text: 'two to four words (authored); never a slogan or a status word', at: 'the cue it rises on (default: the line start)', until: 'the cue it has cleared by (default: the line end, or 1.6 s after)' },
  takes: '1.6 s at least: 0.8 s to rise, 0.4 s to clear. On a scene (`scene: {}`): the cursor is off meanwhile', text: ['text'], reads: ['nothing of the screen'],
  example: { line: 6, scene: {}, moves: [{ move: 'type-beat', text: 'Now the webhook' }] },
};
export function check(i: Partial<Inputs>) {
  const words = typeof i.text === 'string' ? i.text.trim().split(/\s+/).filter(Boolean) : [];
  return words.length >= 2 && words.length <= 4 && i.text!.length <= 40 ? null : 'text is two to four words, 40 letters at most';
}
export const text = (i: Inputs) => [i.text];
export const takes = () => 1.6;
export const SIZE = 96, UP = 0.8, OUT = 0.4;
/** at second t of a run from `from` to `to`: how far the words have risen into place, how far they have cleared (gone by `to`) */
export const beatAt = (from: number, to: number, t: number) => ({ rise: 1 - (1 - clamp01((t - from) / UP)) ** 3, out: EASE.settle(clamp01((t - (to - OUT)) / OUT)) });
