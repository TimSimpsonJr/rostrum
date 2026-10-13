// A number that rolls up (or down) like an odometer, large on the stage, with a plain label under it. It moves on
// every frame of the roll, never stepped. The explainer's counter (library-study.md 1.2).
import { EASE, clamp01 } from '../../kit/ease.ts';

export type Inputs = { to: number; from?: number; label?: string };

export const about = {
  name: 'counter', use: 'moves',
  for: 'A large number rolls like an odometer to a count the line says, with a plain label under it: how many of something.',
  inputs: {
    to: 'the count it lands on: a whole number the narration says (the sweep reads it as authored text)',
    from: 'the count it starts from (default 0)',
    label: 'what is counted, two to four words (authored, optional)',
    at: 'the cue the roll starts on (default: the line start)', until: 'the cue it clears on (default: the line end)',
  },
  takes: '1.6 s to roll and settle; 0.3 s to clear', text: ['label'], reads: ['nothing of the screen'],
  example: { line: 3, moves: [{ move: 'counter', to: 77, label: 'programs', at: 'seventy' }] },
};
const count = (n: unknown) => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= 999999;
export function check(i: Inputs) {
  if (!count(i.to)) return 'to: a whole number from 0 to 999999';
  if (i.from != null && !count(i.from)) return 'from: a whole number from 0 to 999999';
  if (i.label != null && (typeof i.label !== 'string' || !i.label.trim() || i.label.length > 40)) return 'label: two to four words';
  return null;
}
/** the numbers it shows at rest and its label: a quantity is authored text like any other, and the sweep reads it */
export const text = (i: Inputs) => [String(i.to), ...(i.from != null ? [String(i.from)] : []), ...(i.label ? [i.label] : [])];
export const takes = () => 1.6;
/** how many digit columns the roll needs */
export const digitsOf = (i: Inputs) => String(Math.max(i.to, i.from ?? 0)).length;
/** the value showing at t for a roll from `from` to `to` over seconds [a, b]: eased, exact at both ends */
export const valueAt = (from: number, to: number, a: number, b: number, t: number) => from + (to - from) * EASE.heavy(clamp01((t - a) / (b - a)));
