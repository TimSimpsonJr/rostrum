// Where something rests beside an element it names, never over it (it would cover what it names): above the element
// when the frame has room there, else below it, else to its right, else to its left; kept inside the frame. Shared
// by carry (its capsule) and labels. And where a window stands when it is framed to one side, with the column that
// leaves free (label-beside, feature-list). Pure, no imports.
/** A window framed to one side of the stage (a framing's `side`): it takes at most `fill` of the frame's width and its
 *  middle stands `off` of the width from the frame's middle, which leaves the other part of the stage free for type. */
export const ASIDE = { fill: 0.5, off: 0.2 };
/** The free column beside a window framed to `side` (default: the window on the left, the column on the right): its
 *  left edge and its width, frame px. Type in it is flush left and centred on the frame's height. */
export const columnBeside = (side: 'left' | 'right' = 'left') => ({ x: side === 'right' ? 96 : 1171, w: 669 });
export type Pt = { x: number; y: number };
type Box = { x: number; y: number; w: number; h: number };
const FRAME = { w: 1920, h: 1080 }, EDGE = 20;
const within = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
/** The CENTRE of a thing `w` by `h` frame px set beside `box` (frame px), `gap` px clear of it. `side`: at its right
 *  first, else its left, and only then above or below (things named in a column: above one is over the next). */
export function beside(box: Box, w: number, h: number, gap = 14, side = false): Pt {
  const x = within(box.x + box.w / 2, EDGE + w / 2, FRAME.w - EDGE - w / 2), y = within(box.y + box.h / 2, EDGE + h / 2, FRAME.h - EDGE - h / 2);
  if (side && box.x + box.w + gap + w <= FRAME.w - EDGE) return { x: box.x + box.w + gap + w / 2, y };
  if (side && box.x - gap - w >= EDGE) return { x: box.x - gap - w / 2, y };
  if (box.y - gap - h >= EDGE) return { x, y: box.y - gap - h / 2 };
  if (box.y + box.h + gap + h <= FRAME.h - EDGE) return { x, y: box.y + box.h + gap + h / 2 };
  return box.x + box.w + gap + w <= FRAME.w - EDGE ? { x: box.x + box.w + gap + w / 2, y } : { x: box.x - gap - w / 2, y };
}
