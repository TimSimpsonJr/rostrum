// The way into a shot under cover: the window of the shot before grows about its middle until it covers the frame,
// the new shot takes its place at that size in one frame, and settles back to where it stands. What is behind the
// window (the stage, and its tone) can change while it is covered. The explainer's covered swap (library-study.md
// 1.2 item 20), with the page changing as well as the stage.
import { clamp01 } from '../../kit/ease.ts';

export type Inputs = Record<string, never>;

export const about = {
  name: 'covered-swap', use: 'cut',
  for: 'The window grows until it covers the frame, becomes the new shot while nothing else can be seen, and settles back: a page change, or a change of stage, hidden under the window itself.',
  inputs: {},
  takes: '0.9 s; both shots are framed on their whole window (a window that stands smaller than 0.75 of the frame does not cover it)', text: [], reads: ['two screens'],
  example: { line: 2, screen: 1, cut: { move: 'covered-swap' } },
};
export const check = (i: Record<string, unknown>) => (Object.keys(i ?? {}).length ? 'covered-swap takes no inputs' : null);
export const takes = () => 0.9;

/** the size at the swap: a window standing at 0.8 of the frame covers it, corners and all */
export const PEAK = 1.36;
/** when (of the cut, 0..1) the new shot takes the old one's place */
export const SWAP = 0.5;
/** the window's scale about the middle of the frame when the cut is k through: it gathers speed into the swap and
 *  is at speed again straight after it, so the swap lands on motion; 1 at both ends */
export function coverAt(k: number): number {
  const u = clamp01(k);
  return 1 + (PEAK - 1) * (u < SWAP ? (u / SWAP) ** 2 : ((1 - u) / (1 - SWAP)) ** 3);
}
