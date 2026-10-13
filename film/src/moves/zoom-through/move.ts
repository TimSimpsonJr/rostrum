// The way into a shot through an element of the shot before: the picture travels into what was clicked until that
// element is all there is, and the new shot comes out of it, a little large, and settles. Use it once in a film, into
// a page the click opened (library-study.md: zoom-through, toned down).
import { EASE, clamp01, lerp } from '../../kit/ease.ts';

export type Inputs = { through: string };
type Box = { x: number; y: number; w: number; h: number };

export const about = {
  name: 'zoom-through', use: 'cut',
  for: 'The picture travels into the element that was clicked until it fills the frame, and the new shot comes out of it and settles: going into the thing you chose.',
  inputs: { through: 'a name in `nodes`: the element on the shot before that the picture travels into (the one the cursor clicked)' },
  takes: '1 s; cue the click a second before the line that follows, or the shot before holds meanwhile', text: [], reads: ['the named element', 'two screens'],
  cursor: 'fades',   // (the shot before grows many times over about what was clicked, where the cursor is: it would fill the frame)
  example: { line: 3, screen: 1, cut: { move: 'zoom-through', through: 'profileItem' } },
};
export const check = (i: Partial<Inputs>) => (typeof i.through === 'string' && i.through.trim() ? null : 'through is a name in `nodes`');
export const takes = () => 1;

const FRAME = { w: 1920, h: 1080 };
/** of the cut: the element fills the frame (FILL), the new shot starts to show (SHOW), the old one is gone (GONE) */
export const FILL = 0.6, SHOW = 0.55, GONE = 0.7;
const BLUR = 8, LARGE = 1.12;
/** The cut k (0..1) through, into an element whose box on the frame is `box`.
 *  `out`: the shot before: its scale, where the element's middle now is on the frame (it goes to the frame's middle
 *  as it grows), its blur (up over the last third of the way in), and whether it is still drawn. It gathers speed
 *  all the way and is fastest as it goes.
 *  `into`: the new shot: its scale about the frame's middle and its opacity (it shows while the old one is past reading). */
export function zoomAt(k: number, box: Box) {
  const u = clamp01(k), p = (u / FILL) ** 2.4;                       // 1 when the element fills the frame; on past it until the shot is gone
  const most = Math.max(FRAME.w / box.w, FRAME.h / box.h) * 1.1, q = Math.min(1, p);
  return {
    out: { scale: most ** p, cx: lerp(box.x + box.w / 2, FRAME.w / 2, q), cy: lerp(box.y + box.h / 2, FRAME.h / 2, q), blur: BLUR * clamp01((u - (2 * FILL) / 3) / (FILL / 3)), on: u < GONE },
    into: { scale: lerp(LARGE, 1, EASE.settle((u - SHOW) / (1 - SHOW))), opacity: clamp01((u - SHOW) / (GONE - SHOW)), on: u >= SHOW },
    swap: u >= FILL,
  };
}
