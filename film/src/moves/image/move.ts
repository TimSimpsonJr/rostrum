// A picture the user supplied as the ground: it covers the frame, under a scrim of the stage's own colour so that
// type and cards can be read on it. The file is the user's (the tutorial's film/media/, or the brand's folder); the
// plugin ships none, and nothing is fetched.
import { IMAGES, SCRIM, mediaFault, scrimFault, toneFault } from '../../kit/media.ts';
export type Inputs = { file: string; fit?: 'cover' | 'contain'; scrim?: number; tone?: 'light' | 'dark' };
export const about = {
  name: 'image', use: 'stage',
  for: 'A picture the user supplied as the ground, covering the frame under a scrim of the stage\'s own colour (pale on light, deep on dark) so type and cards read on it.',
  inputs: {
    file: 'a plain file name (png, jpg, jpeg, webp) in the tutorial\'s film/media/, or brand/<file name> for a picture in the brand\'s folder',
    scrim: '0 to 1: how much of the stage\'s colour lies over the picture (default 0.6; 0: the picture as it is, for a film with no type on the stage)',
    fit: 'cover (default) | contain', tone: 'light (default) | dark: the scrim\'s colour, and which ink and cards go on it',
  },
  takes: 'the film, or a scene. It does not move. A recorded window stands on it with its own ground and shadow; a `bare` shot\'s elements stand on it on the page\'s own colour',
  text: [], reads: ['a supplied file'],
  example: { stage: { move: 'image', file: 'texture.png', tone: 'dark' } },
};
export function check(i: Inputs) {
  if (i.fit != null && i.fit !== 'cover' && i.fit !== 'contain') return 'fit is cover or contain';
  return mediaFault(i.file, IMAGES) ?? scrimFault(i.scrim) ?? toneFault(i.tone);
}
export const scrimOf = (i: Inputs) => i.scrim ?? SCRIM;
