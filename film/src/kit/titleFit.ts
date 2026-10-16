// A title that fits the frame: never wider than FIT of it. One line at the card's size when it fits; else two lines,
// broken at the space nearest the middle; and if a line is still too wide, the type comes down until it fits.
// Text is measured here, not in the page: Geist's advance widths at weight 300 (film/public/kit/GeistVF.woff2, read
// once with fontTools), so the layout is the same on every render. Pure, no imports.
/** the share of the frame's width a title may take */
export const FIT = 0.84;
const ASCII = ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~';
// (thousandths of an em, in the order of ASCII above)
const ADV = [250, 198, 316, 478, 624, 760, 608, 165, 252, 252, 434, 558, 188, 411, 187, 464, 655, 373, 618, 612, 610, 622, 622, 512, 603, 622, 282, 284, 541, 533, 541, 545, 913,
  649, 666, 694, 691, 593, 580, 692, 701, 255, 588, 632, 570, 868, 732, 731, 639, 725, 658, 634, 549, 680, 659, 935, 603, 564, 537, 327, 452, 327, 407, 549, 234,
  547, 587, 541, 587, 557, 385, 586, 573, 229, 250, 583, 257, 867, 573, 565, 587, 587, 367, 519, 379, 569, 518, 805, 569, 524, 545, 379, 250, 379, 509];
/** a character outside ASCII (an accented letter, a curly quote) is taken as wide as the widest lowercase letters */
const OTHER = 0.6;

/** the width of `s` in ems, with `tracking` (the CSS letter-spacing, in ems) after every character */
export function emWidth(s: string, tracking = 0): number {
  let w = 0;
  for (const c of s) { const i = ASCII.indexOf(c); w += (i < 0 ? OTHER : ADV[i] / 1000) + tracking; }
  return w;
}

/** The title's lines and its type size: `size` px at most, no line wider than `max` px. */
export function fitTitle(title: string, size: number, max: number, tracking = 0): { lines: string[]; size: number } {
  if (emWidth(title, tracking) * size <= max) return { lines: [title], size };
  const spaces = [...title.matchAll(/ /g)].map((m) => m.index!), mid = title.length / 2;
  const at = spaces.reduce((best, i) => (Math.abs(i - mid) < Math.abs(best - mid) ? i : best), spaces[0] ?? -1);
  const lines = at < 0 ? [title] : [title.slice(0, at), title.slice(at + 1)];
  const widest = Math.max(...lines.map((l) => emWidth(l, tracking)));
  return { lines, size: Math.min(size, Math.floor(max / widest)) };
}
