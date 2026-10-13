// A thing taken from one shot to the next: a small capsule with one plain word sets beside an element as it is clicked
// and travels on one curve to an element of the next shot, in flight as the cut lands, and rests beside it. The
// explainer's Carry (library-study.md 1.2): what you took here goes there.
import { beside } from '../../kit/beside.ts';
import { EASE, bezier, clamp01 } from '../../kit/ease.ts';

export type Inputs = { text: string; from?: string; to?: string };
type Pt = { x: number; y: number };

export const about = {
  name: 'carry', use: 'moves',
  for: 'A small capsule with one word sets beside an element and travels on one curve to an element of the next shot, in flight as the page changes, and rests beside that one: the thing you took here goes there.',
  inputs: {
    text: 'one or two words for what is carried (authored): a name for it, never the value itself',
    from: 'a name in `nodes`: the element it sets beside (above it when the frame has room, else below; never over it), on this beat\'s shot (optional: top centre of the frame)',
    to: 'a name in `nodes`: the element it comes to rest beside, the same way, on the NEXT shot (optional: top centre of the frame)',
    at: 'the cue it sets on: the click that changes the page, or a word in the last half second of the line (default: the line start)',
    until: 'the cue it clears on (default: 2.2 s after it set, or the line end)',
  },
  takes: '2.2 s. It goes on the last beat before the cut: it leaves 0.2 s after it sets and lands 1.2 s later, so the cut should come within a second of `at` (a page change follows its click by 0.3 s); it rests where it landed until `until`',
  text: ['text'], reads: ['the named element', 'two screens'],
  example: { line: 3, moves: [{ move: 'carry', text: 'API key', from: 'copyButton', to: 'keyBox', at: 'copy' }] },
};
const name = (v: unknown) => v == null || (typeof v === 'string' && !!v.trim());
export function check(i: Partial<Inputs>) {
  if (typeof i.text !== 'string' || !i.text.trim() || i.text.length > 24) return 'text is one or two words';
  if (!name(i.from) || !name(i.to)) return 'the elements it sets on and lands on are names in `nodes`';
  return null;
}
export const text = (i: Inputs) => [i.text];
export const takes = () => 2.2;

/** seconds: the capsule comes into being; it leaves this long after it started to; the flight; it clears */
export const SET = 0.35, LEAVE = 0.2, FLIGHT = 1.2, CLEAR = 0.3;
/** where it waits when no element is named: top centre of the frame */
export const HELD: Pt = { x: 960, y: 88 };
/** half the capsule's width on the frame, about: its word in the Pill's type (kit/atoms.tsx) and its padding */
export const halfOf = (word: string, h: number) => h * 0.42 * (1 + 0.275 * word.length);
/** Where the capsule's middle rests for an element whose box on the frame is `box`: beside it and clear of it, never
 *  over it (it would cover what it names). Above it when the frame has room there, else below it, else to its right,
 *  else to its left (kit/beside.ts). `h`, `half`: the capsule's height and half its width. No box: top centre of the frame. */
export const besideOf = (box: { x: number; y: number; w: number; h: number } | null, h: number, half: number): Pt => (box ? beside(box, 2 * half, h) : HELD);
/** The capsule at second t of a run from `from` to `to`, between the points a and b on the frame: where it is,
 *  how far along its curve (`k`: one eased flight on a cubic whose control points are pulled up by 0.3 of the way),
 *  how far it has come into being (`set`) and gone (`out`: over the CLEAR seconds after `to`). */
export function carryAt(from: number, to: number, a: Pt, b: Pt, t: number): Pt & { k: number; set: number; out: number } {
  const k = EASE.heavy((t - from - LEAVE) / FLIGHT), up = 0.3 * Math.hypot(b.x - a.x, b.y - a.y);
  const along = (f: number): Pt => ({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f - up });
  return { ...bezier(a, along(0.3), along(0.7), b, k), k, set: EASE.settle(clamp01((t - from) / SET)), out: EASE.settle(clamp01((t - to) / CLEAR)) };
}
