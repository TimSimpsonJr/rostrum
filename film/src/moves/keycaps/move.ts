// The keys of a shortcut as plain keycaps in a row near the frame's bottom, set on the cue and gone a second later;
// the page's own response plays as recorded (library-study.md 3.2 item 6). Authored text only.
import { EASE, clamp01 } from '../../kit/ease.ts';
export type Inputs = { caps: string[] };
export const about = {
  name: 'keycaps', use: 'moves',
  for: 'The keys of a shortcut as plain keycaps in a row near the frame\'s bottom, set on the cue and gone 1.2 s later: or press these keys.',
  inputs: { caps: 'one to four key names (authored): Ctrl, Shift, K, Enter, each 6 letters at most', at: 'the cue they set on (default: the line start)', until: 'the cue they leave on (default: 1.2 s after they set, or the line end)' },
  takes: '1.5 s: 0.2 s to set, 1.2 s held, 0.25 s to leave', text: ['caps'], reads: ['nothing of the screen'],
  example: { line: 3, moves: [{ move: 'keycaps', caps: ['Ctrl', 'K'], at: 'press' }] },
};
export function check(i: Inputs) {
  if (!Array.isArray(i.caps) || i.caps.length < 1 || i.caps.length > 4 || !i.caps.every((c) => typeof c === 'string' && c.trim() && c.length <= 6)) return 'caps: one to four key names of 6 letters at most';
  return null;
}
export const text = (i: Inputs) => i.caps;
export const takes = () => 1.5;
export const CAP = 72, GAP = 14, TYPE = 36, BOTTOM = 90, SET = 0.2, LEAVE = 0.25;
export const capW = (s: string) => Math.max(CAP, Math.round(28 + 0.6 * TYPE * s.length));
/** each cap's left edge and width, the row centred on the frame */
export function rowOf(caps: string[]): { x: number; w: number }[] {
  const ws = caps.map(capW), total = ws.reduce((a, b) => a + b, 0) + GAP * (caps.length - 1);
  let x = 960 - total / 2;
  return ws.map((w) => { const at = { x, w }; x += w + GAP; return at; });
}
/** the row at second t of a run that sets at `from` and leaves at `to`: how far set, how far gone (over LEAVE after `to`) */
export const capsAt = (from: number, to: number, t: number) => ({ set: EASE.settle(clamp01((t - from) / SET)), out: EASE.settle(clamp01((t - to) / LEAVE)) });
