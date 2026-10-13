// Cards on the stage, each with a label and greek lines, built in place (kit/build.ts) in a chaotic order from the
// cue, with hairlines drawn between the ones the beat connects. The explainer's abstract idiom (library-study.md 1.2).
import { buildOrder } from '../../kit/build.ts';

export type CardSpec = { label: string; lines?: number };
export type Inputs = { items: CardSpec[]; layout?: 'row' | 'column' | 'grid'; connect?: [number, number][]; arrive?: 'build' | 'fold' | 'slide'; each?: (string | number)[] };
type Box = { x: number; y: number; w: number; h: number };

export const about = {
  name: 'cards', use: 'moves',
  for: 'Two to six labelled cards assemble on the stage in a row, a column or a grid, with hairlines drawn between the ones you connect: a thing, its parts, how they relate.',
  inputs: {
    items: '[{ label (authored, two to four words), lines (greek lines inside, 0 to 4) }]',
    layout: 'row (default) | column | grid',
    connect: 'pairs of item indexes (from 0) to join with a hairline, optional',
    arrive: 'build (default: outline, fill, contents) | fold (each unfolds on a hinge) | slide (each slides to its slot)',
    each: 'a cue word per item: it starts to arrive on it (default: spread over 1.2 s from `at`)',
    at: 'the cue the first arrives on (default: the line start)', until: 'the cue they clear on (default: the line end)',
  },
  takes: 'about 2.4 s for all to land after `at`; they stay to `until`, then clear in 0.4 s', text: ['items[].label'], cues: ['each'], reads: ['nothing of the screen'],
  example: { line: 2, moves: [{ move: 'cards', at: 'three', items: [{ label: 'Your account', lines: 3 }, { label: 'Its keys', lines: 2 }, { label: 'The sandbox', lines: 2 }], connect: [[0, 1], [1, 2]] }] },
};
const LAYOUTS = ['row', 'column', 'grid'], ARRIVALS = ['build', 'fold', 'slide'];
export function check(i: Inputs) {
  if (!Array.isArray(i.items) || i.items.length < 2 || i.items.length > 6) return 'items: two to six cards';
  for (const c of i.items) if (typeof c?.label !== 'string' || !c.label.trim() || c.label.length > 28 || (c.lines != null && !(Number.isInteger(c.lines) && c.lines >= 0 && c.lines <= 4))) return 'each item is { label (two to four words, 28 characters at most), lines 0..4 }';
  if (i.layout != null && !LAYOUTS.includes(i.layout)) return 'layout is row, column or grid';
  if (i.arrive != null && !ARRIVALS.includes(i.arrive)) return 'arrive is build, fold or slide';
  for (const pair of i.connect ?? []) { const [a, b] = Array.isArray(pair) ? pair : []; if (!Number.isInteger(a) || !Number.isInteger(b) || !i.items[a] || !i.items[b] || a === b) return 'connect names two different items by their index'; }
  if (i.each && (!Array.isArray(i.each) || i.each.length !== i.items.length)) return 'each: one cue per item';
  const lines = linesOf(i), slot = layoutOf(i.items.length, i.layout, lines)[0];
  if (slot.h < 92 + 36 * lines) return 'that many cards with that many lines do not fit this layout: use a grid, or fewer lines';
  if (labelSize(i, slot.w) < 22) return 'a label that long does not fit a card this narrow: use a grid, or a shorter label';
  return null;
}
export const text = (i: Inputs) => i.items.map((c) => c.label);
export const takes = () => 2.4;
/** the most greek lines any card holds */
export const linesOf = (i: Inputs) => Math.max(0, ...i.items.map((c) => c.lines ?? 0));
/** the labels' type size on a card `w` wide: 30 px, less when the longest label needs it (about 0.56 em a character at this weight) */
export const labelSize = (i: Inputs, w: number) => Math.min(30, (w - 60) / (0.56 * Math.max(...i.items.map((c) => c.label.length))));

/** where each of n cards sits on the frame and its size (all one size): a row, a column, or a grid as square as it
 *  can be, centred; `lines`: the most greek lines any card holds (the cards are as tall as that needs) */
export function layoutOf(n: number, layout: Inputs['layout'] = 'row', lines = 3): Box[] {
  const cols = layout === 'row' ? n : layout === 'column' ? 1 : Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols);
  const gap = 64, W = 1920 * 0.8, H = 1080 * 0.74;
  const w = Math.min(520, (W - gap * (cols - 1)) / cols), h = Math.min(116 + 36 * lines, (H - gap * (rows - 1)) / rows);
  const x0 = (1920 - (w * cols + gap * (cols - 1))) / 2, y0 = (1080 - (h * rows + gap * (rows - 1))) / 2;
  return Array.from({ length: n }, (_, i) => ({ x: x0 + (i % cols) * (w + gap), y: y0 + Math.floor(i / cols) * (h + gap), w, h }));
}
/** when each card starts to arrive: on its own cue (seconds), else a chaotic spread over 1.2 s from `from` */
export const startsOf = (n: number, from: number, cues?: number[]) => cues ?? buildOrder(n, from, from + 1.2, 4);
/** the hairline between two cards: along the line of their centres, from where it leaves the one to where it meets the other */
export function joinOf(a: Box, b: Box) {
  const ax = a.x + a.w / 2, ay = a.y + a.h / 2, dx = b.x + b.w / 2 - ax, dy = b.y + b.h / 2 - ay;
  const leaves = (r: Box) => Math.min(dx ? r.w / 2 / Math.abs(dx) : Infinity, dy ? r.h / 2 / Math.abs(dy) : Infinity);
  const ka = leaves(a), kb = 1 - leaves(b);
  return { from: { x: ax + dx * ka, y: ay + dy * ka }, to: { x: ax + dx * kb, y: ay + dy * kb } };
}
