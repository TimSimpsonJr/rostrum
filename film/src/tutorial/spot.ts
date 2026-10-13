// Where a cursor's tip can sit without lying on letters. Pure: boxes in, a place out; node can load it.
// Used twice: for the spot inside a control the cursor clicks (Measure.tsx hands it the control's own ink), and for
// where the cursor waits on a page when it is not pointing at anything (beats.ts hands it the page's elements).
import type { Box } from './cameraAt.ts';

/** The arrow hangs down and right of its tip: this much of it must stay off the ink (px, in the ink's own units when
 *  `k` is 1; `k` scales it for boxes measured at another size than the arrow is drawn at). */
const ARROW = { left: 7, right: 16, up: 6, down: 20, air: 2 };

/** Is a tip at (x, y) clear of every box in `ink`, the arrow's body included? */
export const clearOf = (x: number, y: number, ink: Box[], k = 1) =>
  ink.every((b) => x + ARROW.right * k < b.x - ARROW.air * k || x - ARROW.left * k > b.x + b.w || y + ARROW.down * k < b.y - ARROW.air * k || y - ARROW.up * k > b.y + b.h);

const FILLS = 0.6;   // content wider than this share of its control fills it: the control's middle is as near as anywhere
const PAST = 16;     // the tip sits about this far past the end of a label

/** A spot for the cursor's tip on a control it clicks, as shares of the control's box. `size`: the control;
 *  `ink`: where its text and icons are, relative to the control's top left.
 *  The clear spot nearest the control's CONTENT: just past the end of its label on the reading side (a wide row whose
 *  label is at its left is clicked beside the label, not in its empty middle). When the content fills the control (a
 *  button), that is the clear spot nearest its middle: just under a short label, right of it before left of it. */
export function spotFor(size: { w: number; h: number }, ink: Box[]): [number, number] | undefined {
  if (size.w < 8 || size.h < 8) return undefined;
  const middle = { x: 0.5 * size.w, y: 0.6 * size.h };
  let aim = middle;
  if (ink.length) {
    const left = Math.min(...ink.map((b) => b.x)), right = Math.max(...ink.map((b) => b.x + b.w));
    if (right - left < FILLS * size.w && right + PAST < size.w) aim = { x: right + PAST, y: middle.y };
  }
  const far = ([fx, fy]: [number, number]) => Math.hypot(fx * size.w - aim.x, fy * size.h - aim.y) + (fx * size.w < aim.x ? 0.5 : 0); // of two as near, the right one
  const spots = [0.6, 0.82, 0.7, 0.5].flatMap((fy) => [0.5, 0.6, 0.7, 0.8, 0.88, 0.4, 0.3, 0.2, 0.12].map((fx): [number, number] => [fx, fy]));
  const whole = spots.sort((a, b) => far(a) - far(b)).find(([fx, fy]) => clearOf(fx * size.w, fy * size.h, ink));
  if (whole || !ink.length) return whole;
  // A control that is all label (a small button) has no place for the whole arrow. The tip alone, then, on the
  // control and off its letters: in the band under the label (right of its middle), else in the padding past its end.
  const left = Math.min(...ink.map((b) => b.x)), right = Math.max(...ink.map((b) => b.x + b.w)), bottom = Math.max(...ink.map((b) => b.y + b.h));
  const tip = (x: number, y: number) => x >= 2 && y >= 2 && x <= size.w - 2 && y <= size.h - 2 && ink.every((b) => x < b.x - 1.5 || x > b.x + b.w + 1.5 || y < b.y - 1.5 || y > b.y + b.h + 1.5);
  const under: [number, number][] = [0.62, 0.72, 0.5, 0.82].map((f) => [left + f * (right - left), (bottom + size.h) / 2]);
  const at = [...under, [(right + size.w) / 2, middle.y] as [number, number]].find(([x, y]) => tip(x, y));
  return at && [+(at[0] / size.w).toFixed(3), +(at[1] / size.h).toFixed(3)];
}

/** The clear place nearest `from` (same units as `ink`), looked for on rings around it out to `reach`; `from` itself
 *  when it is clear already, or when nothing nearer than `reach` is. `inside`: where it must stay. */
export function clearNear(from: { x: number; y: number }, ink: Box[], inside: Box, k = 1, reach = 400 * k) {
  const ok = (p: { x: number; y: number }) => p.x >= inside.x && p.y >= inside.y && p.x <= inside.x + inside.w && p.y <= inside.y + inside.h && clearOf(p.x, p.y, ink, k);
  if (ok(from)) return from;
  for (let r = 12 * k; r <= reach; r += 12 * k) {
    // right and below first: the arrow's body hangs that way, so a spot found there leaves the thing readable
    for (const a of [0, 90, 45, 315, 135, 180, 270, 225, 22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5]) {
      const p = { x: from.x + r * Math.cos((a * Math.PI) / 180), y: from.y + r * Math.sin((a * Math.PI) / 180) };
      if (ok(p)) return p;
    }
  }
  return from;
}
