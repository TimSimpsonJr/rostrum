// "Assembling" in the house assembly language, its pure side (the drawing: build.tsx `BuildBox`). A thing is BUILT IN
// PLACE: its outline is drawn round its perimeter, two echo outlines close down onto it, the fill chases the stroke,
// its contents rise in behind the fill, and all the while it drifts the last few px to its slot. The parts overlap on
// soft curves over 0.6 to 1.1 s; nothing steps, overshoots, tilts or flies in. Ported from the explainer's kit.
import { EASE, lerp, rnd, seg } from './ease.ts';

/** Where a build has got to at time t. Use it directly to drive something BuildBox cannot draw. */
export function buildAt(t: number, at: number, dur = 0.9, seed = 0) {
  const k = (t - at) / dur;
  const land = seg(k, 0.1, 1.15, EASE.settle); // the drift to its slot outlasts the build a little
  const a = rnd(seed, 1) * Math.PI * 2, d = lerp(8, 26, rnd(seed, 2));
  return {
    k, started: k > 0, done: k >= 1.15,
    /** share of the perimeter drawn */
    outline: seg(k, 0, 0.75),
    /** share of the fill wiped in (it starts while the outline is still drawing) */
    fill: seg(k, 0.2, 1),
    /** the contents (they start while the fill is still wiping) */
    content: seg(k, 0.5, 1.05),
    /** px off its slot, in the frame's plane */
    dx: Math.cos(a) * d * (1 - land), dy: Math.sin(a) * d * (1 - land) - 6 * (1 - land),
    land,
    /** where on the perimeter the stroke starts (0..1) */
    start: rnd(seed, 3),
  };
}

/** n start times spread at random over [from, to] (seconds), more of them starting as it goes on: the "chaotic, not
 *  orderly" order of the assembly. The same on every frame. Containers first: call it once for containers and once,
 *  a little later, for their contents. */
export const buildOrder = (n: number, from: number, to: number, seed = 1) => Array.from({ length: n }, (_, i) => lerp(from, to, Math.pow(rnd(i + seed * 17, 21), 0.8)));
