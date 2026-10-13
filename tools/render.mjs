// The one way a film or a still is rendered from a tutorial folder:
//   npm run render -- <tutorial folder> <composition> <output.mp4> [remotion flags]
//   npm run still  -- <tutorial folder> <composition> <output.png> [remotion flags, e.g. --frame 300]
// It hands Remotion the tutorial's film/ folder as the public dir (tools/paths.mjs) and nothing else: Remotion copies
// the whole public dir into a bundle folder and serves it to its browser, so the raw recording must never be in it.
// Refuses to run when the public dir holds anything raw. The bundle (and whatever else Remotion leaves in the temp
// folder) goes into a temp folder of this run's own, removed on the way out, also when the render fails.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { publicDirOf } from './paths.mjs';
import { syncOneOffs } from './one-offs.mjs';
import { topUpKit } from './kit.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Runs `remotion <what>` for a tutorial folder. Returns the exit code. `moves`: moves the render shows that the
 *  tutorial's beat file does not name (a move looked at alone): their sounds are in its kit too.
 *  The tutorial's film/kit/ is topped up first with what its film can play and lacks (tools/kit.mjs: a move's sound
 *  that is not there fails a render; the whole pack is not copied). */
export function render(what, tutorial, composition, output, flags = [], moves = []) {
  if (flags.includes('--public-dir')) throw new Error('--public-dir is not yours to give: the public dir is <tutorial>/film');
  const publicDir = publicDirOf(tutorial); // throws when it holds a recording, an originals file or a transcript
  topUpKit(publicDir, moves);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rostrum-render-'));
  try {
    const cli = path.join(ROOT, 'node_modules', '@remotion', 'cli', 'remotion-cli.js');
    const r = spawnSync(process.execPath, [cli, what, path.join(ROOT, 'film', 'src', 'index.ts'), composition, path.resolve(output), '--public-dir', publicDir, ...flags],
      { cwd: ROOT, stdio: 'inherit', env: { ...process.env, TEMP: temp, TMP: temp, TMPDIR: temp } });
    return r.status ?? 1;
  } finally {
    try { fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch { console.log(`could not remove ${temp}: remove it by hand (it holds a copy of the film's public dir)`); }
  }
}

/** The same, after the tutorial's one-off moves are synced into the bundle (tools/one-offs.mjs: a one-off that reads
 *  outside itself throws here, before anything renders). What the command line and tools/regress.mjs use. */
export const renderAfterSync = async (what, tutorial, composition, output, flags = []) => { await syncOneOffs(tutorial); return render(what, tutorial, composition, output, flags); };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [what, tutorial, composition, output, ...flags] = process.argv.slice(2);
  if (!['render', 'still'].includes(what) || !tutorial || !composition || !output) { console.log('usage: render.mjs <render|still> <tutorial folder> <composition> <output> [remotion flags]'); process.exit(1); }
  try { process.exit(await renderAfterSync(what, tutorial, composition, output, flags)); } catch (e) { console.log(String(e?.message ?? e)); process.exit(1); }
}
