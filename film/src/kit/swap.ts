// A word that swaps for the next on a cue: the old one goes up and out, the new one follows it in, over SWAP seconds.
// Shared by word-swap and label-beside. Pure, no imports.
export const SWAP = 0.21;
/** which word shows at t, and how far the swap into it has got (1: at rest; the first word is always at rest) */
export function swapAt(cues: number[], t: number): { i: number; u: number } {
  let i = 0, u = 1;
  cues.forEach((at, j) => { if (t >= at) { i = j + 1; u = Math.min(1, (t - at) / SWAP); } });
  return { i, u };
}
