// When a brand's mark BUILDS on the end card instead of fading in (brand.json `mark.build`, MarkBuild.tsx): the
// timing, as pure functions of the seconds since the end card began. Ported from the sizzle's ending (the logo only):
//   the line   a hidden centreline standing in for one filled part: drawn as ONE stroke (fast off the mark, a long
//              soft tail), swelling from a hairline to its own width; whole at LINE, where the filled part replaces it.
//   the parts  build outward from part `from`, by rank = distance in parts from it: a hairline is drawn along each,
//              the full stroke chases it (30% in), and the part drifts in from a small fixed offset of its own,
//              settling to zero as it lands. A landed part is the unmodified file.
// Node tests load this file: no imports but ease.ts.
import { EASE, clamp01, rnd } from './ease.ts';

/** seconds from the end card's start: every part has landed by BUILD (the plain mark takes over); the sweep starts at SWEEP_AT */
export const BUILD = 1.8, SWEEP_AT = 2.05;
const LINE = 0.6, LINE_DRAWN = 17 / 30, SWELL = 1 / 3; // the line: whole; its stroke closed; its width starts to swell
const FIRST = 23.5 / 30, STEP = 3.3 / 30, LEN = 11.5 / 30; // rank 1 lands; the next ranks, this far apart at most; what one part takes

/** A draw: soft start, soft stop, near-steady between. */
const draw = (x: number) => { const u = clamp01(x); return u * u * (3 - 2 * u) * 0.5 + u * 0.5; };
const settle = (x: number) => 1 - (1 - clamp01(x)) ** 3;

/** When each of `n` parts starts and lands. With a line, part `from` is the line's (0 to LINE) and the others start
 *  while it is still closing; with none, part `from` is drawn like the rest, first. Many parts land closer together,
 *  so that all are down by BUILD. */
export function buildPlan(n: number, from: number, hasLine: boolean) {
  const r0 = hasLine ? 1 : 0, first = hasLine ? FIRST : LEN, ranks = Math.max(from, n - 1 - from);
  const step = Math.min(STEP, (BUILD - first) / Math.max(1, ranks - r0));
  const land = (i: number) => (hasLine && i === from ? LINE : first + (Math.abs(i - from) - r0) * step);
  const start = (i: number) => (hasLine && i === from ? 0 : land(i) - LEN);
  return { land, start, end: Math.max(...Array.from({ length: n }, (_, i) => land(i))) };
}

/** Part `i` at `u` seconds: how much of its hairline and of its full stroke is drawn (0..1), and its drift in px. */
export function partAt(u: number, i: number, plan: { start: (i: number) => number }) {
  const x = (u - plan.start(i)) / LEN, rest = 1 - settle(x);
  return { thin: draw(x / 0.62), full: draw((x - 0.3) / 0.7), dx: (rnd(i, 7) - 0.5) * 22.5 * rest, dy: (rnd(i, 8) - 0.5) * 18 * rest };
}

/** The line at `u` seconds: how much is drawn, how far its width has swollen (0 hairline, 1 its own), and whether the filled part has taken its place. */
export const lineAt = (u: number) => ({ k: EASE.stroke(u / LINE_DRAWN), swell: EASE.heavy((u - SWELL) / (LINE - SWELL)), whole: u >= LINE });
