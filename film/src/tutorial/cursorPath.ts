// The cursor's path, as a pure function of the frame. One cursor for the whole film: it starts at `start`, makes each
// move on one eased, bowed curve (never a straight line, never a stop mid-path) and rests on the move's stop until
// the next. Stops are functions of the frame, in frame px, because a control moves on the frame while the camera does:
// the cursor leaves from where the last stop IS and lands where the next one IS.
import { EASE } from '../kit/ease.ts';

export type Pt = { x: number; y: number };
export type Stop = (frame: number) => Pt;
/** Travel to `stop` over frames [from, to]. `bow`: how far the path swings off the straight line, as a share of its length (sign = side). */
export type Move = { from: number; to: number; stop: Stop; bow?: number };

export function cursorAt(start: Stop, moves: Move[], frame: number): Pt {
  let prev = start;
  for (const m of moves) {
    if (frame < m.from) break;
    if (frame < m.to) {
      const a = prev(frame), b = m.stop(frame), e = EASE.heavy((frame - m.from) / (m.to - m.from));
      const dx = b.x - a.x, dy = b.y - a.y, bow = (m.bow ?? 0.12) * Math.sin(Math.PI * e);
      return { x: a.x + dx * e - dy * bow, y: a.y + dy * e + dx * bow };
    }
    prev = m.stop;
  }
  return prev(frame);
}
