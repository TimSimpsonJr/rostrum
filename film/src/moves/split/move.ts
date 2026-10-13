// The same element from two screens side by side: before on the left, after on the right, each alone on its own
// ground in a card, a hairline between, the after pane settling last; the screen recedes under them (library-study.md
// 3.2 item 2: see what changed). Each pane is one more rebuilt screen while it is up.
import { EASE, clamp01 } from '../../kit/ease.ts';
export type Inputs = { before: string; after: string };
type Box = { x: number; y: number; w: number; h: number };
// (`text` lists inputs, and the two captions are no input: the sweep reads them through `text()` below)
export const about = {
  name: 'split', use: 'moves',
  for: 'The same element from two screens side by side, before on the left and after on the right, each on its own ground, the after pane settling last: see what changed.',
  inputs: { before: 'a name in `nodes`: the element on the screen before this shot\'s', after: 'a name in `nodes`: the same element on this shot\'s screen', at: 'the cue the panes rise on (default: the line start)', until: 'the cue they set down by (default: the line end, or 2 s after they rose)' },
  takes: '2 s at least: the panes rise over 0.5 s, the after 0.25 s later; both stay to `until` and set down in 0.4 s. Each is captioned, Before and After. Two more screens rebuilt per frame while they are up',
  text: [], lifts: ['before', 'after'], reads: ['the named element', 'two screens'],
  example: { line: 4, moves: [{ move: 'split', before: 'statusBefore', after: 'statusAfter', at: 'changed' }] },
};
export function check(i: Partial<Inputs>) {
  if (typeof i.before !== 'string' || !i.before.trim() || typeof i.after !== 'string' || !i.after.trim()) return 'before and after are names in `nodes`';
  if (i.before === i.after) return 'before and after are two names: the element on each screen';
  return null;
}
export const text = () => ['Before', 'After'];
export const takes = () => 2;
export const PANE = { w: 0.44 * 1920, h: 0.7 * 1080, pad: 36, gap: 0.04 * 1920 }, CAPTION = 26, RISE = 0.5, LAG = 0.25, DOWN = 0.4;
export const paneOf = (i: 0 | 1): Box => ({ x: i ? 960 + PANE.gap / 2 : 960 - PANE.gap / 2 - PANE.w, y: (1080 - PANE.h) / 2, w: PANE.w, h: PANE.h });
/** how wide the element is drawn inside a pane: the pane's inside, or as tall as it allows */
export const fitOf = (box: { w: number; h: number }) => Math.min(PANE.w - 2 * PANE.pad, ((PANE.h - 2 * PANE.pad - CAPTION * 2) * box.w) / box.h);
export const splitAt = (from: number, to: number, t: number) => ({ up: [0, 1].map((i) => EASE.heavy(clamp01((t - from - i * LAG) / RISE))), down: EASE.heavy(clamp01((t - (to - DOWN)) / DOWN)) });
export const recedes = (t: number, from: number, to: number) => { const s = splitAt(from, to, t); return s.up[0] * (1 - s.down); };
