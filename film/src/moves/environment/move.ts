// A wall and a floor: a sense of place behind the film, in the stage's own colours by tone. The wall is lit from one
// side; the floor is a plane low in the frame with a soft band where the two meet. Nothing of the content is mirrored
// in the floor (no reflection: it would be every screen rebuilt once more, and it would move with nothing).
import { toneFault } from '../../kit/media.ts';
export type Light = 'left' | 'right' | 'top';
export type Inputs = { light?: Light; floor?: boolean; tone?: 'light' | 'dark' };
export const about = {
  name: 'environment', use: 'stage',
  for: 'A wall and a floor: a wall lit from one side, a floor plane at 0.62 of the frame\'s height with a soft band where they meet; windows keep their shadow. A sense of place, with no reflection of the content.',
  inputs: { light: 'left (default) | right | top: the side the light is on', floor: 'false: the wall alone (default: the floor is there)', tone: 'light (default) | dark: a pale room or a dark one, and which ink and cards go in it' },
  takes: 'the film, or a scene. It does not move', text: [], reads: ['nothing of the screen'],
  example: { stage: { move: 'environment', light: 'left' } },
};
export function check(i: Inputs) {
  if (i.light != null && !['left', 'right', 'top'].includes(i.light)) return 'light is left, right or top';
  if (i.floor != null && typeof i.floor !== 'boolean') return 'floor is true or false';
  return toneFault(i.tone);
}
/** where the floor starts, as a share of the frame's height; px of the band above its edge */
export const FLOOR = 0.62, BAND = 40;
/** the way the wall's light falls off: the CSS direction it runs in, from the lit side */
export const wallOf = (light: Light = 'left') => ({ left: 'to right', right: 'to left', top: 'to bottom' })[light];
