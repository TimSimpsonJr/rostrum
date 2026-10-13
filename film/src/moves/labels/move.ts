// Plain labels beside elements of the screen, each on its cue, all clearing together: "these three fields: A, B, C",
// seen in place (library-study.md 3.2 item 5; the narrated list's mechanism on the screen, no blur). A label sits
// beside what it names and never over it (kit/beside.ts).
import { EASE, clamp01 } from '../../kit/ease.ts';
export { beside } from '../../kit/beside.ts';

export type Inputs = { items: { target: string; text: string }[]; each?: (string | number)[] };

export const about = {
  name: 'labels', use: 'moves',
  for: 'Plain labels set beside one to four elements of the screen, each on its cue word, and clear together: these fields, named in place.',
  inputs: {
    items: '[{ target: a name in `nodes`, text: its label (authored, 30 letters at most) }], one to four',
    each: 'a cue word per item: its label sets on it (default: spread over 1.2 s from `at`)',
    at: 'the cue the first label sets on (default: the line start)', until: 'the cue all clear on (default: the line end)',
  },
  takes: '0.3 s a label, 0.3 s to clear; they stay to `until`. Beside a screen framed close a label may stand over a neighbour (a move knows no layout): frame the group',
  text: ['items[].text'], cues: ['each'], reads: ['the named element'],
  example: { line: 2, moves: [{ move: 'labels', items: [{ target: 'firstName', text: 'Your name' }, { target: 'username', text: 'Your sign-in name' }], each: ['name', 'username'] }] },
};
export function check(i: Inputs) {
  if (!Array.isArray(i.items) || i.items.length < 1 || i.items.length > 4) return 'items: one to four labels';
  for (const it of i.items) if (typeof it?.target !== 'string' || !it.target.trim() || typeof it.text !== 'string' || !it.text.trim() || it.text.length > 30) return 'each item is { target: a name, text: 30 letters at most }';
  if (i.each && (!Array.isArray(i.each) || i.each.length !== i.items.length)) return 'each: one cue per item';
  return null;
}
export const text = (i: Inputs) => i.items.map((it) => it.text);
export const takes = (i: Inputs) => (i.each ? 0.6 : 1.5);
export const SET = 0.3, CLEAR = 0.3, SIZE = 24, RISE = 10, APART = 12;
type Rect = { x: number; y: number; w: number; h: number };
/** Labels never touch: each rect (top left, in order) that would stand within APART px of one before it is shifted
 *  sideways past it, to its right when the frame has room there, else to its left. */
export function apart(rects: Rect[], frameW = 1920): Rect[] {
  const out: Rect[] = [];
  for (const r of rects) {
    let at = { ...r };
    for (const o of out) {
      const near = at.x < o.x + o.w + APART && o.x < at.x + at.w + APART && at.y < o.y + o.h + APART && o.y < at.y + at.h + APART;
      if (near) at = { ...at, x: o.x + o.w + APART + at.w <= frameW - 20 ? o.x + o.w + APART : o.x - APART - at.w };
    }
    out.push(at);
  }
  return out;
}
/** when each label sets: its own cue, else spread over 1.2 s from `from` */
export const startsOf = (n: number, from: number, cues?: number[]) => cues ?? Array.from({ length: n }, (_, k) => from + (n > 1 ? (1.2 * k) / (n - 1) : 0));
/** label i at second t: how far it has set (`k`) and how far all have cleared (`out`, over CLEAR seconds after `to`) */
export const labelAt = (start: number, to: number, t: number) => ({ k: EASE.settle(clamp01((t - start) / SET)), out: EASE.settle(clamp01((t - to) / CLEAR)) });
/** about how wide a label of `s` stands at SIZE px (Geist at 0.56 em a letter) */
export const widthOf = (s: string) => Math.round(0.56 * SIZE * s.length + 8);
