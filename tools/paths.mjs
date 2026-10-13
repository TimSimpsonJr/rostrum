// Where everything of one tutorial lives. The ONE place that knows the layout: no tool builds these paths by hand.
//
//   <tutorial>/
//     tutorial.json   rules.json   script.md          state, scrub additions, the script          (not public)
//     recording/      raw: events, assets, microphone, originals.json     NEVER opened by an agent  (not public)
//     transcript/     Whisper output of the microphone                                              (not public)
//     out/            renders, frames, sweep and measure stills                                     (not public)
//     review/         review notes                                                                  (not public)
//     film/           THE PUBLIC DIR: the only folder a render is given (--public-dir), so the only one Remotion
//       clean/        copies into its bundle and serves to its browser. It holds what a film needs and nothing raw:
//       narration/    the scrubbed screens, the narration, the brand, the kit, the beat file.
//       brand/  kit/  beats.json
//
// Why `film/` (Oct 10 2026): Remotion copies the whole public dir into a bundle folder under the temp folder and
// serves it. With the tutorial folder itself as the public dir, every render copied the raw recording and the
// originals list there and made them fetchable by the composition.
import fs from 'node:fs';
import path from 'node:path';

/** Every path of a tutorial folder. `film` is the public dir. */
export function paths(tutorialDir) {
  const root = path.resolve(tutorialDir), film = path.join(root, 'film'), recording = path.join(root, 'recording'), clean = path.join(film, 'clean');
  return {
    root, name: path.basename(root),
    state: path.join(root, 'tutorial.json'), rules: path.join(root, 'rules.json'), script: path.join(root, 'script.md'),
    recording, originals: path.join(recording, 'originals.json'),
    transcript: path.join(root, 'transcript'), out: path.join(root, 'out'), review: path.join(root, 'review'),
    film, publicDir: film,
    clean, manifest: path.join(clean, 'manifest.json'), changed: path.join(clean, 'changed.json'), boxes: path.join(clean, 'boxes.json'),
    pointer: path.join(clean, 'pointer.json'), gestures: path.join(clean, 'gestures.json'),
    layout: path.join(clean, 'layout.json'), site: path.join(clean, 'site.json'),
    narration: path.join(film, 'narration'), timing: path.join(film, 'narration', 'timing.json'),
    brand: path.join(film, 'brand'), kit: path.join(film, 'kit'), beats: path.join(film, 'beats.json'),
    moves: path.join(film, 'moves'), // the tutorial's one-off moves (tools/one-offs.mjs): code the film shows, so public
    media: path.join(film, 'media'), // pictures and clips the user supplied for this film (an image or footage stage names one by its file name)
  };
}

/** The folders and files that must never be inside (or be) a public dir. */
export const privateOf = (p) => [p.recording, p.originals, p.transcript, p.out, p.review, p.state, p.rules, p.script];

const inside = (child, parent) => { const rel = path.relative(parent, child); return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel)); };
/** Is `dir` the same folder as `other`, or an ancestor of it? */
export const holds = (dir, other) => inside(path.resolve(other), path.resolve(dir));

/** Refuses a public dir that holds anything raw. Every tool that hands Remotion a public dir calls this first. */
export function assertPublicDir(dir) {
  const d = path.resolve(dir);
  for (const bad of ['recording', 'originals.json', 'transcript', 'events.ndjson']) {
    if (fs.existsSync(path.join(d, bad))) throw new Error(`refusing to render: the public dir holds "${bad}". A render is given <tutorial>/film, never the tutorial folder or a recording (tools/paths.mjs).`);
  }
  if (path.basename(d) === 'recording') throw new Error('refusing to render: the public dir is a recording folder');
  return d;
}

/** The public dir of a tutorial folder, checked. Given a `film` folder by mistake, says so rather than rendering nothing. */
export function publicDirOf(tutorialDir) {
  const p = paths(tutorialDir);
  if (!fs.existsSync(p.film)) throw new Error(`no film folder in ${p.root} (expected ${p.film}; give the tutorial folder, not its film/ folder)`);
  if (privateOf(p).some((x) => holds(p.film, x))) throw new Error('the public dir would hold a private path');
  return assertPublicDir(p.film);
}

/** Removes a Remotion bundle folder (it holds a copy of the public dir), when it is one. */
export function removeBundle(serveUrl) {
  if (serveUrl && /remotion-webpack-bundle-/.test(path.basename(serveUrl)) && fs.existsSync(serveUrl)) fs.rmSync(serveUrl, { recursive: true, force: true });
}
