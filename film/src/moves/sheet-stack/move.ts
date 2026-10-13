// A stack of sheets with numbered tabs, riffling in from below one after another: rounds, versions, pages, a pile
// of the same kind of thing (library-study.md 1.2 item 12: the stack with numbered tabs, without the drawing-sheet
// look). Each sheet stands a little up and right of the one in front of it, so every tab shows.
import { buildOrder } from '../../kit/build.ts';
import { EASE, clamp01 } from '../../kit/ease.ts';

export type Inputs = { count: number; labels?: string[] };

export const about = {
  name: 'sheet-stack', use: 'moves',
  for: 'Two to thirteen sheets riffle in from below into one stack, each with a numbered tab at its top edge: rounds, versions, pages, a pile of the same kind of thing.',
  inputs: {
    count: 'how many sheets, 2 to 13 (a count the film shows)',
    labels: 'optional: a short word per tab in place of its number (authored), the back sheet first; the more sheets, the shorter they must be',
    at: 'the cue the first sheet comes on (default: the line start)', until: 'the cue the stack clears on (default: the line end, or 1.8 s after it started)',
  },
  takes: '1.8 s at least: the sheets come over 1.2 s, the last has set 0.5 s later; the stack stays to `until` and clears in 0.4 s',
  text: ['labels[]'], reads: ['nothing of the screen'],
  example: { line: 2, moves: [{ move: 'sheet-stack', count: 5, at: 'rounds' }] },
};
/** the sheet, how far each stands up and right of the one in front, and a tab's height and type */
export const SHEET = { w: 720, h: 440 }, OFFSET = 10, TAB = { h: 40, type: 22 };
/** how wide a tab is among `count` (they share the sheet's top edge), and the letters one holds */
export const tabW = (count: number) => (SHEET.w - 48) / count;
export const lettersIn = (count: number) => Math.floor((tabW(count) - 14) / (0.56 * TAB.type));
export function check(i: Partial<Inputs>) {
  if (!Number.isInteger(i.count) || i.count! < 2 || i.count! > 13) return 'count is a whole number of sheets, 2 to 13';
  if (i.labels != null) {
    if (!Array.isArray(i.labels) || i.labels.length !== i.count || !i.labels.every((s) => typeof s === 'string' && s.trim())) return 'labels: one short word per sheet';
    const most = lettersIn(i.count!);
    if (i.labels.some((s) => s.length > most)) return `labels: with ${i.count} sheets a tab holds ${most} letters`;
  }
  return null;
}
/** the words on the tabs: the labels, or the numbers 1 to count */
export const tabsOf = (i: Inputs) => i.labels ?? Array.from({ length: i.count }, (_, k) => String(k + 1));
export const text = (i: Inputs) => tabsOf(i);
export const takes = () => 1.8;

const FRAME = { w: 1920, h: 1080 }, SPREAD = 1.2, SET = 0.5, RISE = 150;
/** when each sheet starts (seconds), the back one first: spread unevenly over 1.2 s from `from`, never two at once */
export const startsOf = (count: number, from: number) => buildOrder(count, from, from + SPREAD, 9).sort((a, b) => a - b).reduce<number[]>((out, s, i) => [...out, i ? Math.max(s, out[i - 1] + 0.04) : from], []);
/** Sheet i of `count` (0: the back one) at second t of a run from `from`: where its top left is on the frame, how far
 *  it has come (`k`), and where its tab starts along its top edge. At rest the stack is centred in the frame, tabs and all. */
export function sheetAt(i: number, count: number, from: number, t: number) {
  const back = count - 1 - i, span = OFFSET * (count - 1), k = EASE.settle(clamp01((t - startsOf(count, from)[i]) / SET));
  const x = (FRAME.w - SHEET.w - span) / 2 + OFFSET * back, y = (FRAME.h - SHEET.h + span + TAB.h) / 2 - OFFSET * back;
  return { x, y: y + RISE * (1 - k), k, tab: 24 + tabW(count) * i };
}
