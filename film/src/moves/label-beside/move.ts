// A short label in the free part of the stage beside a window framed to one side (a framing's `side`), its words
// changing on each cue with the word swap's motion: the feature label beside the device, the step counter without a
// step counter (the showcase study's "feature label beside device"). It is the stage's own type, the voice of the
// title that an open sets beside its window (light, large), not an annotation on the page: `labels` is that.
import { columnBeside } from '../../kit/beside.ts';
export { swapAt } from '../../kit/swap.ts';

export type Inputs = { words: string[]; each?: (string | number)[]; side?: 'left' | 'right' };

export const about = {
  name: 'label-beside', use: 'moves',
  for: 'A short label beside a window held to one side (frame.side) whose words change on each cue with the word swap\'s motion: a feature label beside the device, the step counter without a step counter.',
  inputs: {
    words: 'one to six short labels, in the order they show (authored, 24 letters at most)',
    each: 'a cue word per change (one fewer than `words`; default: one every 0.9 s)',
    side: 'left (default) | right: the side the WINDOW is framed to (the same word as the framing\'s `side`); the label stands on the other',
    at: 'the cue the label sets on (default: the line start)', until: 'the cue it clears on (default: the line end)',
  },
  takes: '0.4 s to set, 0.21 s a swap; stays to `until`. It names no element: it stands at a fixed place in the column a side framing leaves free, level with the middle of the frame, so the beat\'s framing has `side`',
  text: ['words'], cues: ['each'], reads: ['nothing of the screen'],
  example: { line: 3, frame: { whole: true, side: 'left' }, moves: [{ move: 'label-beside', words: ['Open the menu', 'Choose Profile'], each: ['profile'] }] },
};
export function check(i: Inputs) {
  if (!Array.isArray(i.words) || i.words.length < 1 || i.words.length > 6 || !i.words.every((w) => typeof w === 'string' && w.trim() && w.length <= 24)) return 'words: one to six, each 24 letters at most';
  if (i.each && (!Array.isArray(i.each) || i.each.length !== i.words.length - 1)) return 'each: one cue per change (one fewer than the words)';
  if (i.side != null && i.side !== 'left' && i.side !== 'right') return 'side is left or right: the side the window is framed to';
  return null;
}
export const text = (i: Inputs) => i.words;
export const takes = (i: Inputs) => (i.each ? 0.6 : 0.9 * (i.words.length - 1) + 0.6);
/** when each change happens with no cues: one every 0.9 s, the first 0.9 s in */
export const swapsOf = (i: Inputs, from: number) => (i.each as number[] | undefined) ?? i.words.slice(1).map((_, j) => from + 0.9 * (j + 1));
/** the type's size: 64 px (the size of a title beside its window), less when the longest label would not fit the column */
export const sizeOf = (i: Inputs) => Math.min(64, columnBeside(i.side).w / (0.52 * Math.max(...i.words.map((w) => w.length))));
export const columnOf = (i: Inputs) => columnBeside(i.side);
