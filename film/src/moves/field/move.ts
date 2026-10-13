// A solid or two-colour gradient ground: a brand's own colour behind the film, under the kit's dither, the gradient's
// angle drifting a degree or two so it never rests (spec, "Stages").
import { toneFault } from '../../kit/media.ts';
export type Inputs = { colour?: string; from?: string; to?: string; angle?: number; tone?: 'light' | 'dark' };
export const about = {
  name: 'field', use: 'stage',
  for: 'A solid or two-colour gradient ground with the kit\'s dither, its angle drifting a little: a brand\'s own colour behind the film.',
  inputs: { colour: 'one CSS colour: a solid field; or', from: 'the gradient\'s first colour, and', to: 'its second (the word accent, in any of the three, is the brand\'s accent)', angle: 'degrees, 0 to 359 (default 160)', tone: 'light (default) | dark: which ink and cards go on it. Say dark for a deep colour' },
  takes: 'the film, or a scene', text: [], reads: ['the brand'],
  example: { stage: { move: 'field', from: 'accent', to: '#102040', tone: 'dark' } },
};
export const COLOUR = /^(#[0-9a-f]{3,8}|(oklch|oklab|rgb|rgba|hsl)\([^()]*\)|[a-z]{3,20})$/i;
export function check(i: Inputs) {
  const named = [i.colour, i.from, i.to].filter((c) => c != null);
  if (!(i.colour != null ? i.from == null && i.to == null : i.from != null && i.to != null)) return 'one colour, or from and to';
  if (!named.every((c) => typeof c === 'string' && COLOUR.test(c))) return 'a colour is #hex, oklch(...), rgb(...), a named colour, or accent';
  if (i.angle != null && !(Number.isInteger(i.angle) && i.angle >= 0 && i.angle < 360)) return 'angle is 0 to 359';
  return toneFault(i.tone);
}
export const angleAt = (base = 160, t = 0) => base + 2 * Math.sin(t * 0.07);
