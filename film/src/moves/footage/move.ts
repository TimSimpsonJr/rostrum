// A clip the user supplied as the ground: it plays behind the film from the film's first frame, muted, under the
// same scrim as a picture. Used as given: no trimming. A clip shorter than the film holds its last frame, or, told
// its length (`loop`), plays again from its start. The file is the user's; the plugin ships none; nothing is fetched.
import { CLIPS, SCRIM, mediaFault, scrimFault, toneFault } from '../../kit/media.ts';
export type Inputs = { file: string; loop?: number; scrim?: number; tone?: 'light' | 'dark' };
export const about = {
  name: 'footage', use: 'stage',
  for: 'A clip the user supplied playing behind the film, muted, covering the frame under a scrim of the stage\'s own colour so type and cards read on it.',
  inputs: {
    file: 'a plain file name (mp4, webm) in the tutorial\'s film/media/, or brand/<file name> for a clip in the brand\'s folder',
    loop: 'the clip\'s length in seconds: it plays again from its start each time it ends (without it a clip shorter than the film holds its last frame)',
    scrim: '0 to 1: how much of the stage\'s colour lies over the clip (default 0.6)', tone: 'light (default) | dark: the scrim\'s colour, and which ink and cards go on it',
  },
  takes: 'the film, or a scene. The clip runs on the film\'s clock (a scene sees it where the film has got to), is never trimmed and never heard. Each frame of it is one more picture to decode: a render is slower',
  text: [], reads: ['a supplied file'],
  example: { stage: { move: 'footage', file: 'brand/loop.mp4', loop: 6, tone: 'dark' } },
};
export function check(i: Inputs) {
  if (i.loop != null && !(typeof i.loop === 'number' && i.loop >= 0.5 && i.loop <= 600)) return 'loop is the clip\'s length in seconds (0.5 to 600)';
  return mediaFault(i.file, CLIPS) ?? scrimFault(i.scrim) ?? toneFault(i.tone);
}
export const scrimOf = (i: Inputs) => i.scrim ?? SCRIM;
