// A phrase on the stage whose last word is replaced by the next, each on its cue: the old word goes up and out
// through a feathered edge, the new one follows it in, over 0.21 s; nothing else on the line moves. The explainer's
// word swap (library-study.md 1.2).
export type Inputs = { before?: string; words: string[]; each?: (string | number)[] };

export const about = {
  name: 'word-swap', use: 'moves',
  for: 'A short phrase in large type whose last word swaps for the next on each cue: a status that changes, a name that becomes another.',
  inputs: {
    before: 'the words that stay, before the one that swaps (authored, optional)',
    words: 'two to five words or short phrases, in the order they show (authored)',
    each: 'a cue word per swap (one fewer than `words`): the next word comes on it (default: one swap every 0.9 s)',
    at: 'the cue the phrase sets on (default: the line start)', until: 'the cue it clears on (default: the line end)',
  },
  takes: '0.4 s to set, 0.21 s a swap, 0.3 s to clear', text: ['before', 'words'], cues: ['each'], reads: ['nothing of the screen'],
  example: { line: 4, moves: [{ move: 'word-swap', before: 'Status', words: ['In review', 'Approved'], at: 'status', each: ['approved'] }] },
};
export { SWAP, swapAt } from '../../kit/swap.ts';
/** the type's size: 96 px, less for a long line (about 0.52 em a character), so the line keeps inside the frame */
export const sizeOf = (i: Inputs) => Math.min(96, 1650 / (0.52 * ((i.before?.length ?? 0) + 1 + Math.max(...i.words.map((w) => w.length)))));
export function check(i: Inputs) {
  if (!Array.isArray(i.words) || i.words.length < 2 || i.words.length > 5 || !i.words.every((w) => typeof w === 'string' && w.trim() && w.length <= 24)) return 'words: two to five, each 24 characters at most';
  if (i.before != null && (typeof i.before !== 'string' || i.before.length > 40)) return 'before: the words that stay, 40 characters at most';
  if (i.each && (!Array.isArray(i.each) || i.each.length !== i.words.length - 1)) return 'each: one cue per swap (one fewer than the words)';
  if (sizeOf(i) < 56) return 'the line is too long to read: shorten `before` or the words';
  return null;
}
export const text = (i: Inputs) => [...(i.before ? [i.before] : []), ...i.words];
/** when each swap happens with no cues: one every 0.9 s, the first 0.9 s in */
export const swapsOf = (i: Inputs, from: number) => (i.each as number[] | undefined) ?? i.words.slice(1).map((_, j) => from + 0.9 * (j + 1));
export const takes = (i: Inputs) => (i.each ? 0.6 : 0.9 * (i.words.length - 1) + 0.6);
