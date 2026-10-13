// A narrated list: while a line enumerates things, the recorded screen recedes behind a blur and the items appear
// one by one as large type, each with an icon, on the word that names it (a beat's `list`). Pure data and math: when
// the blur comes and goes, when each item sets, when they clear. The drawing is kit/List.tsx.
//
// What it keeps by construction: the screen has receded while any list type is up (the blur and wash are most of the
// way in before the first item's first frame, and still most of the way in on the list's last); nothing pops (an
// item rises and settles over frames, opaque on its word); the list is gone before the screen is sharp.
import { EASE, clamp01 } from '../kit/ease.ts';
import type { Cue } from './beats.ts';

export type ListItem = { text: string; icon: string; cue: Cue };
/** `from`: the word at which the screen starts to recede (without it: the first item's word). Item text is AUTHORED,
 *  from the script's own words; it is never read from the screen and never holds a value. */
export type ListSpec = { from?: Cue; items: ListItem[] };
/** One list as played, in film seconds (each on a whole frame). `items[].at`: the item is opaque on this, its word. */
export type ListPlay = {
  line: number; blurIn: number; items: { text: string; icon: string; at: number }[];
  /** the items start to clear together; they are gone; the screen is sharp again */
  out: number; clear: number; sharp: number;
};

// frames at 30 a second
const BLUR = 11;          // the blur's way in, and its way out
const HEAD = 5;           // the blur has run this long before the first item's first frame
const LEAD = 3;           // an item starts this long before its word, and is opaque on it
const RISE = 12;          // ...and has settled this long after it started
const APART = 8;          // two items nearer than this cannot each be read as they come
const HOLD = 24;          // the last item is up at least this long...
const AFTER = 6;          // ...and the list stays this long after its line has been said
const OUT = 8;            // the items clear together over this
/** Seconds from the end of a list's line to a sharp screen: the air the next line needs on top of its own (tools/pacing.mjs). */
export const LIST_CLEARS = (AFTER + OUT / 2 + BLUR) / 30;

/** When a list plays. `said`: when the line says a cue (film seconds; throws when it does not). `end`: the line's end.
 *  `faults` gets what cannot be read as asked: two items too close, or in another order than they are spoken. */
export function playList(spec: ListSpec, line: number, said: (cue: Cue) => number, end: number, fps: number, faults: string[]): ListPlay {
  if (!spec.items?.length) throw new Error(`beats: line ${line}'s list has no items`);
  const k = fps / 30, F = (s: number) => Math.round(s * fps), n = (frames: number) => Math.round(frames * k);
  const at = spec.items.map((it) => {
    if (typeof it.text !== 'string' || !it.text.trim()) throw new Error(`beats: line ${line}'s list has an item with no text`);
    return F(said(it.cue));
  });
  const name = (i: number) => `"${spec.items[i].text}"`;
  for (let i = 1; i < at.length; i++) {
    if (at[i] < at[i - 1]) faults.push(`line ${line}: the list's items are not in the order they are spoken (${name(i)} is said before ${name(i - 1)})`);
    else if (at[i] - at[i - 1] < n(APART)) faults.push(`line ${line}: the list's items ${name(i - 1)} and ${name(i)} are ${at[i] - at[i - 1]} frames apart: too close to read one before the next`);
  }
  // the screen starts to recede on `from`, and in any case early enough to be unreadable when the first item shows
  const blurIn = Math.min(F(said(spec.from ?? spec.items[0].cue)), Math.min(...at) - n(LEAD) - n(HEAD));
  const out = Math.max(F(end) + n(AFTER), Math.max(...at) + n(HOLD));
  return {
    line, blurIn: blurIn / fps, items: spec.items.map((it, i) => ({ text: it.text, icon: it.icon, at: at[i] / fps })),
    out: out / fps, clear: (out + n(OUT)) / fps, sharp: (out + n(OUT / 2) + n(BLUR)) / fps,
  };
}

/** 0 to 1 over `frames` from second `a` (exact on whole frames, whatever the seconds' rounding). */
const ramp = (t: number, a: number, frames: number) => clamp01(Math.round((t - a) * 30 * 1e6) / 1e6 / frames);

/** How far the screen has receded at second t, 0 (sharp) to 1: in fast with a soft tail, out on one eased move that
 *  starts as the items go, so they are gone while the screen is still unreadable. */
export const listBlur = (p: ListPlay, t: number) => EASE.stroke(ramp(t, p.blurIn, BLUR)) * (1 - EASE.heavy(ramp(t, p.sharp - BLUR / 30, BLUR)));

/** Item i at second t: its opacity, and how far below its place it is (a share of the rise; negative: above, leaving).
 *  It starts a little before its word, is opaque on the word and settles just after; all items clear together. */
export function listItem(p: ListPlay, i: number, t: number): { o: number; dy: number } {
  const from = p.items[i].at - LEAD / 30, on = ramp(t, from, LEAD), leave = ramp(t, p.out, OUT);
  if (on <= 0 || leave >= 1) return { o: 0, dy: 1 };
  return { o: on * (1 - leave) ** 1.5, dy: (1 - ramp(t, from, RISE)) ** 3 - leave * leave };
}

/** Is any list type showing at second t? (the cursor is not; the screen is not sharp) */
export const listUp = (p: ListPlay, t: number) => p.items.some((_, i) => listItem(p, i, t).o > 0);
