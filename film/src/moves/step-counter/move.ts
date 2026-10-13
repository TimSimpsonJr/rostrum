// "2 of 5", quiet, at the frame's top right over the line that starts a step: where you are in a long procedure
// (library-study.md 3.2). Plain type, no box, no bar; once per step, a film opts in.
import { EASE, clamp01 } from '../../kit/ease.ts';
export type Inputs = { step: number; of: number };
export const about = {
  name: 'step-counter', use: 'moves',
  for: 'A quiet "2 of 5" at the frame\'s top right corner over the line that starts a step: where you are in a procedure of five steps or more. Once per step, opt in per film; plain type, no box.',
  inputs: { step: 'which step this is (a number, from 1)', of: 'how many steps there are (2 to 12)', at: 'the cue it sets on (default: the line start)', until: 'the cue it clears on (default: the line end)' },
  takes: '0.3 s to set; stays to `until` (the line end); 0.3 s to clear', text: [], reads: ['nothing of the screen'],
  example: { line: 2, moves: [{ move: 'step-counter', step: 2, of: 5 }] },
};
export function check(i: Partial<Inputs>) {
  return Number.isInteger(i.step) && Number.isInteger(i.of) && i.of! >= 2 && i.of! <= 12 && i.step! >= 1 && i.step! <= i.of! ? null : 'step and of are whole numbers: of from 2 to 12, step from 1 to of';
}
/** (its inputs are numbers: the phrase the frames show reaches the sweep from here) */
export const text = (i: Inputs) => [`${i.step} of ${i.of}`];
export const takes = () => 1.2;
export const SIZE = 26, EDGE = 48, SET = 0.3;
/** at second t of a run from `from` to `to`: how far it has set, and how far it has cleared (over SET seconds after `to`) */
export const countAt = (from: number, to: number, t: number) => ({ k: EASE.settle(clamp01((t - from) / SET)), out: EASE.settle(clamp01((t - to) / SET)) });
