// The sound families (film/public/kit/<family>-<n>.wav; sources: film/public/kit/SOUNDS.md) and which take plays.
// Pure, so node tests load it; the component that plays one is `Sfx` in sound.tsx.

/** The families and how many takes each has, with the approved per-family trim (dB, never above 0). */
export const SFX: Record<string, { n: number; trim: number }> = {
  'pat-small': { n: 8, trim: -3 }, 'pat-medium': { n: 6, trim: 0 }, 'pat-large': { n: 4, trim: 0 }, 'settle-final': { n: 5, trim: 0 },
  'pencil-short': { n: 5, trim: 0 }, 'pencil-med': { n: 5, trim: 0 }, 'brush-dab': { n: 4, trim: 0 }, 'brush-fill': { n: 6, trim: 0 }, rub: { n: 2, trim: 0 },
  'paper-slide': { n: 6, trim: -4 }, 'sheet-slide': { n: 3, trim: -5 }, 'page-turn': { n: 6, trim: -3 }, riffle: { n: 4, trim: -2 },
  'pin-place': { n: 8, trim: -2 }, 'tick-fixed': { n: 5, trim: 0 }, 'wordswap-tick': { n: 7, trim: -6 },
  'click-tick': { n: 4, trim: 0 }, 'click-snap': { n: 5, trim: 0 }, 'click-down': { n: 2, trim: 0 }, 'click-up': { n: 2, trim: 0 },
  whoosh: { n: 5, trim: -3 }, 'whoosh-pass': { n: 3, trim: -4 }, 'whoosh-cut': { n: 3, trim: -3 },
};
/** Which take of a family plays at `at` seconds: fixed by the time, so it is the same on every render and varies
 *  along a stretch. `variant`: that take, whatever the time. */
export const takeOf = (family: string, at: number, variant?: number) => variant ?? (1 + (Math.floor(Math.abs(at) * 7.3) % (SFX[family]?.n ?? 1)));
