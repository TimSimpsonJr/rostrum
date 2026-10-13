// The way into a shot along a line: a ribbon runs in under the shot before and on ahead, the camera rides after it
// in one eased move from that shot to the new one, and the ribbon is gone before the camera has settled. Time passing,
// or a step on to what comes next. The explainer's line pass (its film/kit/linePass.ts and motion/rideCamera.ts, as
// plain math) without its date and tick, without its tilt and without motion blur: a flat ride.
// One clock p = 0..1 and every part a single quintic ease on it, overlapped, so something is always travelling.
import { EASE } from '../../kit/ease.ts';

export type Variant = 'below' | 'side';
export type Inputs = { variant?: Variant };

export const about = {
  name: 'line-pass', use: 'cut',
  for: 'A ribbon runs in under the shot before and on ahead; the camera rides after it in one move to the new shot, and the ribbon has left by the time it settles: time passing, or a step on to what comes next.',
  inputs: { variant: 'below (default): the new shot stands lower, and the camera drops onto it as the ribbon goes by above | side: the camera stays level and the ribbon turns up and away just short of the new shot' },
  takes: '3.3 s, the longest way into a shot but one: leave it a line of its own, or the end of one. Nothing is blurred, so both shots are best framed on their whole window', text: [], reads: ['two screens'],
  example: { line: 2, screen: 1, cut: { move: 'line-pass', variant: 'below' } },
};
export const check = (i: Inputs) => (i.variant == null || i.variant === 'below' || i.variant === 'side' ? null : 'variant is below or side');
export const takes = () => 3.3;

const W = 1920, run = EASE.heavy;
/** Where the new shot's frame rests in the world (the shot before is at 0, 0). Farther along than the explainer's
 *  1500: there a scene was a small thing in a wide frame, here a shot can fill its frame, and the two never overlap. */
export const REST_X = 2240, DROP = 760;
export const restY = (variant: Variant = 'below') => (variant === 'below' ? DROP : 0);
/** the ribbon's height in the world, and (side) the radius of its quarter turn upward */
export const LY = 770, R = 170;
/** fractions of the pass: the ribbon's head runs; the camera drops (below); the ribbon leaves */
export const PASS = { head: [0.02, 0.62], drop: [0.2, 1], leave: [0.7, 1] } as const;
const FROM = -200;
/** the ribbon's path: `bend` where the turn starts (side: in the gap before the new shot), `end` where its head stops */
export function geo(variant: Variant = 'below') {
  const below = variant === 'below', bend = below ? 1e9 : REST_X - R - 50, turn = (R * Math.PI) / 2;
  return { bend, turn, end: below ? REST_X + 1.4 * W : bend + turn + (LY - R) + 420 };
}
/** The point s px along the ribbon (world px): level, and in `side` a quarter turn upward, then straight up. */
export function point(s: number, variant: Variant = 'below') {
  const { bend, turn } = geo(variant);
  if (s <= bend) return { x: s, y: LY };
  if (s <= bend + turn) return { x: bend + R * Math.sin((s - bend) / R), y: LY - R + R * Math.cos((s - bend) / R) };
  return { x: bend + R, y: LY - R - (s - bend - turn) };
}
const part = (p: number, [a, b]: readonly [number, number]) => run((p - a) / (b - a));
/** Everything that moves, p (0..1) through the pass: the camera's top left in the world (`cx`, `cy`: it never holds),
 *  how far along its path the ribbon's head is (`from` is its tail), and how far the ribbon has lifted off (px). */
export function passAt(p: number, variant: Variant = 'below') {
  const g = geo(variant);
  return { cx: REST_X * run(p), cy: restY(variant) * part(p, PASS.drop), from: FROM, head: FROM + (g.end - FROM) * part(p, PASS.head), lift: (variant === 'below' ? 160 : 950) * part(p, PASS.leave) };
}
/** The ribbon drawn from its tail to `head`: its middle line, and the line `off` px to its left hand (above it,
 *  where it runs level), as SVG paths in world px. */
export function ribbon(head: number, variant: Variant = 'below', off = 0, step = 16): string {
  const pts: string[] = [];
  for (let s = FROM; ; s = Math.min(head, s + step)) {
    const a = point(s, variant), b = point(s + 1, variant), nx = b.y - a.y, ny = -(b.x - a.x);
    pts.push(`${(a.x + nx * off).toFixed(2)} ${(a.y + ny * off).toFixed(2)}`);
    if (s >= head) break;
  }
  return `M${pts.join('L')}`;
}
