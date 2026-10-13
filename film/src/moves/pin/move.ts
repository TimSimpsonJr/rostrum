// A finding pinned to an element: a small disc drops onto the element's top right corner and a card with a few plain
// words slides out beside it, clear of the element (library-study.md 1.2 item 12: pin and finding card, the idea
// without the drawing-sheet look). For "note this", "this is the one that matters", a remark on one thing.
import { EASE, clamp01 } from '../../kit/ease.ts';

export type Inputs = { target: string; text: string };
type Box = { x: number; y: number; w: number; h: number };

export const about = {
  name: 'pin', use: 'moves',
  for: 'A small pin drops onto an element\'s top right corner and a card with a few plain words slides out beside it, clear of the element: a remark on one thing.',
  inputs: {
    target: 'a name in `nodes`: the element the pin is put on',
    text: 'the remark (authored): a few plain words, 36 letters at most',
    at: 'the cue the pin drops on (default: the line start)', until: 'the cue both leave on (default: the line end, or 1.4 s after the drop)',
  },
  takes: '1.4 s at least: the pin drops in 0.35 s, the card is out 0.6 s after the cue; both stay to `until` and leave in 0.3 s',
  text: ['text'], reads: ['the named element'],
  example: { line: 4, moves: [{ move: 'pin', target: 'keyField', text: 'Shown once only', at: 'key' }] },
};
export function check(i: Partial<Inputs>) {
  if (typeof i.target !== 'string' || !i.target.trim()) return 'target is a name in `nodes`';
  if (typeof i.text !== 'string' || !i.text.trim() || i.text.length > 36) return 'text is a few plain words, 36 letters at most';
  return null;
}
export const text = (i: Inputs) => [i.text];
export const takes = () => 1.4;

const FRAME = { w: 1920, h: 1080 }, EDGE = 24, GAP = 18;
/** the card: its height, its type, and its width for the words it holds (never narrower than 240) */
export const CARD_H = 64, TYPE = 24;
export const cardW = (words: string) => Math.max(240, Math.round(52 + 0.53 * TYPE * words.length));
/** seconds: the pin's drop; the card starts after the pin; the card's slide; both leave */
export const DROP = 0.35, AFTER = 0.2, SLIDE = 0.4, LEAVE = 0.3;
/** Where the pin and its card stand for an element whose box on the frame is `box`: the pin on its top right corner;
 *  the card (`w` wide) clear of the element: right of the corner when the frame has room, else above the element
 *  ending at the corner, else below it. `side`: which, and so the way the card slides out (1: rightward, -1: leftward). */
export function pinAt(box: Box, w: number): { pin: { x: number; y: number }; card: { x: number; y: number }; way: 1 | -1 } {
  const pin = { x: box.x + box.w, y: box.y }, fit = (y: number) => Math.min(FRAME.h - EDGE - CARD_H, Math.max(EDGE, y));
  if (pin.x + GAP + w <= FRAME.w - EDGE) return { pin, card: { x: pin.x + GAP, y: fit(pin.y - CARD_H / 2) }, way: 1 };
  const x = Math.max(EDGE, Math.min(pin.x - GAP, FRAME.w - EDGE) - w);
  return { pin, card: { x, y: box.y - GAP - CARD_H >= EDGE ? box.y - GAP - CARD_H : fit(box.y + box.h + GAP) }, way: -1 };
}
/** The run at second t, from `from` to `to`: how far the pin has dropped (`drop`), how far the card is out (`out`),
 *  and how far both have gone (`gone`, over the LEAVE seconds after `to`). */
export const runAt = (from: number, to: number, t: number) => ({
  drop: EASE.settle(clamp01((t - from) / DROP)), out: EASE.settle(clamp01((t - from - AFTER) / SLIDE)), gone: EASE.settle(clamp01((t - to) / LEAVE)),
});
