// A hero tile moves left from the middle of the stage and a row of small tiles appears to its right, left to right:
// these are the options (the showcase study's "chip row fills in"). On a scene.
import { EASE, clamp01 } from '../../kit/ease.ts';

export type Inputs = { hero: string; items: string[]; each?: (string | number)[] };
type Box = { x: number; y: number; w: number; h: number };

export const about = {
  name: 'chip-row', use: 'moves',
  for: 'A hero tile moves left from the middle of the stage and a row of small tiles appears to its right, left to right, each on its cue: these are the options.',
  inputs: {
    hero: 'the hero tile\'s label (authored, two to four words, 40 letters at most)',
    items: 'two to five labels (authored, 16 letters at most)',
    each: 'a cue word per item (default: 4 frames apart once the hero has moved)',
    at: 'the cue the hero moves on (default: the line start; it stands in the middle from the line start until then)', until: 'the cue all clear on (default: the line end)',
  },
  takes: '10 frames for the hero to move, then the items; all stay to `until` and clear in 0.4 s. On a scene: it names no element and stands in the middle of the stage',
  text: ['hero', 'items'], cues: ['each'], reads: ['nothing of the screen'],
  example: { line: 5, scene: {}, moves: [{ move: 'chip-row', hero: 'Webhook events', items: ['Created', 'Updated', 'Deleted'] }] },
};
export function check(i: Inputs) {
  if (typeof i.hero !== 'string' || !i.hero.trim() || i.hero.length > 40) return 'hero: two to four words, 40 letters at most';
  if (!Array.isArray(i.items) || i.items.length < 2 || i.items.length > 5 || !i.items.every((s) => typeof s === 'string' && s.trim() && s.length <= 16)) return 'items: two to five labels of 16 letters at most';
  if (i.each && (!Array.isArray(i.each) || i.each.length !== i.items.length)) return 'each: one cue per item';
  return null;
}
export const text = (i: Inputs) => [i.hero, ...i.items];
export const takes = (i: Inputs) => (i.each ? 0.8 : 0.33 + 0.1 + (i.items.length * 4) / 30 + 0.4);
export const HERO = { w: 300, h: 300 }, CHIP = { h: 64, size: 26, pad: 20 }, GAP = 24, MOVE = 10 / 30, CLEAR = 0.4;
/** how wide every chip of a row stands: as wide as its longest label needs (Geist semibold at about 0.56 em a letter;
 *  five chips of 16 letters still stand inside the frame) */
export const chipWidth = (items: string[]) => Math.max(140, Math.round(0.56 * CHIP.size * Math.max(...items.map((s) => s.length))) + 2 * CHIP.pad);
/** the hero's slot and the chips' for n chips `w` wide, the row centred on the stage; the hero starts at the stage's middle */
export function slotsOf(n: number, w = 200): { start: Box; hero: Box; chips: Box[] } {
  const total = HERO.w + GAP + n * w + (n - 1) * GAP, x0 = 960 - total / 2, y = 540 - HERO.h / 2;
  return { start: { x: 960 - HERO.w / 2, y, w: HERO.w, h: HERO.h }, hero: { x: x0, y, w: HERO.w, h: HERO.h }, chips: Array.from({ length: n }, (_, k) => ({ x: x0 + HERO.w + GAP + k * (w + GAP), y: 540 - CHIP.h / 2, w, h: CHIP.h })) };
}
export const heroAt = (from: number, t: number) => EASE.settle(clamp01((t - from) / MOVE));
export const startsOf = (n: number, from: number, cues?: number[]) => cues ?? Array.from({ length: n }, (_, k) => from + MOVE + 0.1 + (k * 4) / 30);
export const chipAt = (start: number, to: number, t: number) => ({ k: EASE.settle(clamp01((t - start) / 0.3)), out: EASE.settle(clamp01((t - to) / CLEAR)) });
