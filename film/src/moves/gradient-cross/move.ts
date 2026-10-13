// The way from one stage to the other, light to dark or back: the camera pans down (or across) one long gradient
// between the two; the shot before leans back, leaves ahead of the camera and is gone, and the new shot is found
// where the camera comes to rest. A change of world. The explainer's gradient cross (its motion/panCurve.ts: a small
// wind-up back, one lead ahead, on quintic eases), without motion blur, and with a whole shot as the rider: it does
// not return to the middle of the frame as the explainer's card did, because the new shot stands there.
//
// A shot has the film's stage and a scene its own, so this is the way into a scene on the other stage, or out of one:
// on the scene's side there is no shot, and only the gradient and the other shot are seen.
// The stage itself changes under cover: the gradient is clear at both ends (the stage, with its lights, shows
// through) and solid in between, and the film's tone flips while the solid part fills the frame (`toneAt`).
import { EASE } from '../../kit/ease.ts';

export type Tone = 'light' | 'dark';
export type Axis = 'v' | 'h';
export type Inputs = { to: Tone; axis?: Axis };

export const about = {
  name: 'gradient-cross', use: 'cut',
  for: 'The camera pans down (or across) one long gradient from the light stage to the dark, or back; the shot before leans back and leaves ahead of it, and the new shot is where the camera comes to rest: a change of world.',
  inputs: {
    to: 'light | dark: the stage it arrives on. It must be the stage of the shot it leads into (a scene\'s own `stage`, or the film\'s when it leads out of a scene). For a named stage it is that stage\'s `tone`: the stage shows through the gradient\'s clear ends',
    axis: 'v (default): the camera pans down | h: it pans to the right',
  },
  takes: '3.1 s: the shot before has left within two seconds, the new one arrives over the last one. Into or out of a scene, that side is the bare stage',
  text: [], reads: ['two screens'],
  toneAt: 0.613,   // (the film's stage flips here, while the gradient's solid part fills the frame: FLIP below; a test holds the two together)
  example: { line: 3, scene: { stage: 'dark' }, cut: { move: 'gradient-cross', to: 'dark' } },
};
export function check(i: Partial<Inputs>) {
  if (i.to !== 'light' && i.to !== 'dark') return 'to is light or dark: the stage it arrives on';
  if (i.axis != null && i.axis !== 'v' && i.axis !== 'h') return 'axis is v or h';
  return null;
}
export const takes = () => 3.1;

const run = EASE.heavy;
/** seconds of the cut: the shot before leans back; it goes (over OUT seconds); the camera's run, to the cut's end.
 *  (The explainer's clip waited 0.75 s first; a cut follows a click, so here the wind-up starts at once.) */
export const T = { wind: 0.15, go: 0.6, out: 1.3, cam: 0.7, dur: 3.1 };
/** px the shot leans back before it goes; screens the camera travels; screens the shot before gets ahead (out of the frame) */
export const WIND = 34, TRAVEL = 3, AHEAD = 1.3, LEAN = 9;
/** when (0..1 of the cut) the camera is half way: the gradient's solid part fills the frame, and the stage flips */
export const FLIP = (T.cam + (T.dur - T.cam) / 2) / T.dur;
/** one screen along the axis, px */
export const screenOf = (axis: Axis = 'v') => (axis === 'h' ? 1920 : 1080);

const leadAt = (t: number, S: number) => -WIND * (run((t - T.wind) / 0.4) - run((t - T.wind - 0.32) / 0.42)) + AHEAD * S * run((t - T.go) / T.out);
/** The cut k (0..1) through, along `axis`. All px along the axis, ahead being down (v) or right (h):
 *  `cam`: how far the camera has gone along the gradient (TRAVEL screens in all);
 *  `out`: the shot before: its offset in the frame (back a little, then ahead and out), its lean in degrees (by its
 *  speed, 9 at its fastest), and whether any of it is still in the frame;
 *  `into`: the new shot: its offset in the frame (it stands where the camera comes to rest), and whether it is in view. */
export function crossAt(k: number, axis: Axis = 'v') {
  const S = screenOf(axis), t = Math.min(1, Math.max(0, k)) * T.dur, cam = TRAVEL * S * run((t - T.cam) / (T.dur - T.cam));
  const lead = leadAt(t, S), speed = (leadAt(t + 1 / 120, S) - leadAt(t - 1 / 120, S)) * 60, fastest = (1.875 * AHEAD * S) / T.out;
  return { S, cam, out: { offset: lead, lean: LEAN * Math.max(-1, Math.min(1, speed / fastest)), on: lead < 1.1 * S }, into: { offset: TRAVEL * S - cam, on: TRAVEL * S - cam < 1.05 * S } };
}
/** The long gradient, as stops along its length (0..1 of TRAVEL + 1 screens): clear over the first screen (the stage
 *  the film is on shows through), solid from `a` through three colours of the way to `b`, clear again over the last
 *  screen (the stage it has become). `a`, `b`: the two stages' colours, as oklch(...) strings. */
export function stopsOf(a: string, b: string): [string, number][] {
  const clear = (c: string) => c.replace(/\)\s*$/, ' / 0)'), n = TRAVEL + 1, at = (screens: number) => +(screens / n).toFixed(5);
  // (the frame is one screen: solid from 1.3 to 2.7 screens leaves 0.4 of a screen of travel with the stage wholly covered)
  return [[clear(a), 0], [clear(a), at(1)], [a, at(1.3)], ['oklch(0.87 0.055 272)', at(1.65)], ['oklch(0.62 0.16 272)', at(2)], ['oklch(0.34 0.115 274)', at(2.35)], [b, at(2.7)], [clear(b), at(3)], [clear(b), 1]];
}
/** ...with the dark end first when it arrives on the light stage */
export const gradientOf = (to: Tone, light: string, dark: string): [string, number][] => {
  const down = stopsOf(light, dark);
  return to === 'dark' ? down : down.map(([c, p]): [string, number] => [c, +(1 - p).toFixed(5)]).reverse();
};
