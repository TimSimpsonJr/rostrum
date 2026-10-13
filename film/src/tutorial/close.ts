// The close, the same in every tutorial (Tim, Oct 10: "The closing line should always be during the logo reveal").
// The narration's last sentence is the closer. The end card is timed to it, not the other way round: the brand's mark is
// setting as the line starts, the gradient sweep crosses while it is spoken, and the card
// holds after it. The last screen has left the stage by the time the card sets.
export type Timing = {
  fps: number; dir: string;
  sentences: { i: number; text?: string; file: string | null; clipAt: number; clipDur: number; start: number; end: number; words: { w: string; start: number; end: number }[] }[];
};

const LEAD = 0.35, WINDOW_OUT = 0.5, HOLD = 2.2, REVEAL = 1.85; // seconds: card before the line; the window's exit; held after the line; mark set + sweep done
/** The logo lift (a beat file's `end`): the camera starts its push toward the site's own logo `lead` seconds before
 *  the window would start to leave, pushes for `push` (so it arrives as the end card starts to set), and the window is
 *  gone over the push's last `fade` seconds. The close's own times do not change. */
export const LIFT = { lead: 0.6, push: 1.1, fade: 0.3 };
/** The end glyph (a beat file's `end`): the last shot is cut away `lead` seconds before its window would have started
 *  to leave, to one element alone in the middle of the stage, `size` of the frame's width (`tall` of its height at
 *  most); its parts slide apart and back over `apart`, and it goes over `fade`, gone when the brand's mark starts to
 *  come up in its place (`rise` before the end card starts to set): the two are never seen through each other. The
 *  close's own times do not change. */
export const GLYPH = { lead: 1.5, size: 0.3, tall: 0.5, apart: 1.5, rise: 0.3, fade: 0.2 };
const REVEAL_BUILT = 2.75; // the same for a mark that is built on (kit/markTiming.ts: built by 1.8, swept from 2.05 for 0.66)

/** `built`: the brand's mark builds on (brand.json `mark.build`) instead of setting: its reveal takes longer. */
export function closeOf(timing: Timing, built = false) {
  const closer = timing.sentences.at(-1)!, endCard = closer.start - LEAD, reveal = built ? REVEAL_BUILT : REVEAL;
  return {
    closer,
    /** the last screen starts to leave */
    windowOut: endCard - WINDOW_OUT,
    /** the end card starts to set */
    endCard,
    /** the reveal (mark set, sweep crossed) is complete */
    revealed: endCard + reveal,
    total: Math.max(closer.end, endCard + reveal) + HOLD,
  };
}
