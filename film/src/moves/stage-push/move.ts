// The way into a shot as a push: the shot before slides off one side, shrinking and softening as it goes, while the
// new one follows it in from the other side on the same eased move. The explainer's Stage Push (library-study.md 1.2),
// with the travel lengthened: there a ghost stayed at the edge, here the outgoing shot must be off the frame when the
// cut ends, and the two are never over one another (text is not seen through text).
import { EASE, clamp01, lerp } from '../../kit/ease.ts';

export type Direction = 'left' | 'right' | 'up' | 'down';
export type Inputs = { direction?: Direction };

export const about = {
  name: 'stage-push', use: 'cut',
  for: 'The shot before slides off one side, shrinking and softening, while the new one follows it in on the same move: a step sideways to another place of the same standing.',
  inputs: { direction: 'left (default) | right | up | down: the way the outgoing shot leaves; the new one comes in after it' },
  takes: '0.8 s', text: [], reads: ['two screens'],
  example: { line: 2, screen: 1, cut: { move: 'stage-push', direction: 'left' } },
};
const AXIS: Record<Direction, [number, number]> = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
export const check = (i: Inputs) => (i.direction == null || i.direction in AXIS ? null : 'direction is left, right, up or down');
export const takes = () => 0.8;

/** how far a shot travels (frame px): far enough that, shrunk, it is wholly off the frame at the end */
export const REACH = { x: 1720, y: 970 };
export const GHOST = { scale: 0.78, opacity: 0.3, blur: 6 };
export type Slot = { x: number; y: number; scale: number; opacity: number; blur: number; a: number };
/** one shot `g` of the way off: 0 at rest in the frame, 1 gone the way of `direction`, -1 as far the other way */
export function slotAt(g: number, direction: Direction = 'left'): Slot {
  const a = Math.min(1, Math.abs(g)), [dx, dy] = AXIS[direction];
  return { x: g * dx * REACH.x + 0, y: g * dy * REACH.y + 0, scale: lerp(1, GHOST.scale, a), opacity: lerp(1, GHOST.opacity, a), blur: GHOST.blur * a, a };
}
/** the two shots when the cut is k (0..1) through: one eased move for both */
export function pushAt(k: number, direction: Direction = 'left'): { outgoing: Slot; incoming: Slot } {
  const p = EASE.heavy(clamp01(k));
  return { outgoing: slotAt(p, direction), incoming: slotAt(p - 1, direction) };
}
