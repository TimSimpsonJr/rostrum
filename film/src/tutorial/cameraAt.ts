// The camera over one recorded screen, as a pure function of the frame. No imports beyond the kit's math, so node can test it.
// Rules it keeps by construction (explainer KIT.md): one continuous move per screen, scale never decreases, no pause
// inside a move. A "hold" is itself a slow move (two keys, the second a little tighter, `ease: 'linear'`), so no two
// frames are the same.
import { EASE } from '../kit/ease.ts';

export type Box = { x: number; y: number; w: number; h: number };
export type Size = { width: number; height: number };
/** The content of a shot's window moves up by y0 to y1 screen px over film seconds [from, to]: one eased move. */
export type Scroll = { from: number; to: number; y0: number; y1: number };
/** How far the window's content has scrolled at second t (screen px): a pure function of time. */
export const scrollAt = (moves: Scroll[] | undefined, t: number) => {
  let y = 0;
  for (const m of moves ?? []) { if (t < m.from) break; y = m.y0 + (m.y1 - m.y0) * EASE.heavy((t - m.from) / (m.to - m.from)); }
  return y;
};
/** At `frame` the camera frames `box` (recorded-viewport px) at `fill` of the frame's width, centred. `ease`: how the
 *  camera arrives here from the key before (heavy: a move; linear: a slow push during a hold; out: already at speed on
 *  its first frame and settling, for the first move after a cut, so the cut lands on motion). */
export type CamKey = { frame: number; box: Box; fill: number; ease?: 'heavy' | 'linear' | 'out';
  /** the arrival of a framing by cut (the key before is one frame earlier): the step into it is the film's choice, not a fault */
  cut?: true;
  /** a key of a held shot: the camera does not drift from it, and frames that equal the last are what was asked for */
  hold?: true };
/** Scale, and the recorded-viewport point that sits at the centre of the frame. */
export type Cam = { s: number; cx: number; cy: number };

const rest = (k: CamKey, vp: Size): Cam => ({ s: (k.fill * vp.width) / k.box.w, cx: k.box.x + k.box.w / 2, cy: k.box.y + k.box.h / 2 });

export function cameraAt(keys: CamKey[], frame: number, viewport: Size): Cam {
  const i = keys.findLastIndex((k) => k.frame <= frame);
  if (i < 0) return rest(keys[0], viewport);
  if (i === keys.length - 1) return rest(keys[i], viewport);
  const a = rest(keys[i], viewport), b = rest(keys[i + 1], viewport);
  const u = (frame - keys[i].frame) / (keys[i + 1].frame - keys[i].frame);
  const ease = keys[i + 1].ease, k = ease === 'linear' ? u : ease === 'out' ? 1 - (1 - u) ** 3 : EASE.heavy(u);
  // An even zoom (geometric), and the destination glides in a straight line to the centre of the FRAME while it grows:
  // its distance from the centre, measured on the frame, falls off as 1 - k.
  const s = a.s * (b.s / a.s) ** k, pull = (a.s / s) * (1 - k);
  return { s, cx: b.cx - (b.cx - a.cx) * pull, cy: b.cy - (b.cy - a.cy) * pull };
}

/** Where a recorded-viewport point lands on the frame. */
export const project = (cam: Cam, p: { x: number; y: number }, viewport: Size) => ({ x: viewport.width / 2 + cam.s * (p.x - cam.cx), y: viewport.height / 2 + cam.s * (p.y - cam.cy) });

/** The computable camera rules over frames [from, to]: the list of what breaks them (empty = passes). */
export function cameraFaults(keys: CamKey[], from: number, to: number, viewport: Size, maxStep = 70): string[] {
  const faults: string[] = [];
  for (let f = from + 1; f <= to; f++) {
    if (keys.some((k) => k.cut && k.frame === f)) continue;   // a framing by cut: wider or tighter, however far
    const a = cameraAt(keys, f - 1, viewport), b = cameraAt(keys, f, viewport);
    if (b.s < a.s - 1e-12) faults.push(`frame ${f}: scale decreases`);
    if (a.s === b.s && a.cx === b.cx && a.cy === b.cy && !keys.findLast((k) => k.frame < f)?.hold) faults.push(`frame ${f}: camera identical to frame ${f - 1}`);
    // how far the picture moves on the frame: the old centre's shift, plus the growth at the frame's edge
    const step = Math.hypot(b.s * (a.cx - b.cx), b.s * (a.cy - b.cy)) + (b.s / a.s - 1) * (viewport.width / 2);
    if (step > maxStep) faults.push(`frame ${f}: moves ${step.toFixed(1)} px in one frame`);
  }
  return faults;
}
