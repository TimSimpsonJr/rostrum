// A picture or a clip the user supplied as a stage's ground (the image and footage stages). It is named by a plain
// file name: in the tutorial's film/media/, or, written `brand/<file>`, in the brand's folder as copied into the film.
// Nothing else can be named: no folder, no `..`, no drive, no address. The film reads it from its own public dir and
// never from the network. Pure, no imports.
export const IMAGES = ['png', 'jpg', 'jpeg', 'webp'], CLIPS = ['mp4', 'webm'];
/** what is wrong with `file` as a supplied file of one of these kinds (`exts`), or null */
export function mediaFault(file: unknown, exts: string[]): string | null {
  const kinds = exts.join(', ');
  if (typeof file !== 'string' || !new RegExp(`^(brand/)?[a-z0-9][a-z0-9._-]{0,80}\\.(${exts.join('|')})$`, 'i').test(file) || file.includes('..')) return `file is a plain file name (${kinds}) in the tutorial's film/media/, or brand/<file name> for the brand's own: no folders, no address`;
  return null;
}
/** where the film finds it, in its public dir */
export const mediaSrc = (file: string) => (file.startsWith('brand/') ? file : 'media/' + file);
/** how strong the scrim over a supplied ground is: the stage's own colour (pale on a light stage, deep on a dark
 *  one) laid over the picture so that type and cards in the tone's ink can be read on it. 0.6 unless said; 0: none */
export const SCRIM = 0.6;
export const scrimFault = (scrim: unknown): string | null => (scrim == null || (typeof scrim === 'number' && scrim >= 0 && scrim <= 1) ? null : 'scrim is 0 to 1: how much of the stage\'s own colour lies over the picture (0.6 unless said)');
export const toneFault = (tone: unknown): string | null => (tone == null || tone === 'light' || tone === 'dark' ? null : 'tone is light or dark');
