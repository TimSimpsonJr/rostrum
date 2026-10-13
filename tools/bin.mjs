// Where ffmpeg and ffprobe are. The bundled build (Remotion's @remotion/compositor-<platform>) first: every user has
// it once the packages are installed, and it holds what the pipeline uses (probe, mp3, loudnorm, silencedetect,
// volume, scale, png, wav). `full` asks for a complete build, which is only ever the one on PATH: the developer
// tools' filters (select, tile, drawbox, gradients) and the rawvideo muxer are not in the bundled one.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PLATFORM = { 'win32-x64': 'win32-x64-msvc', 'darwin-arm64': 'darwin-arm64', 'darwin-x64': 'darwin-x64', 'linux-x64': 'linux-x64-gnu', 'linux-arm64': 'linux-arm64-gnu' };

/** The bundled program's path, or null when the compositor package for this platform is not installed. */
export function bundled(name, { platform = process.platform, arch = process.arch, root = ROOT } = {}) {
  const pkg = PLATFORM[`${platform}-${arch}`];
  if (!pkg) return null;
  const file = path.join(root, 'node_modules', '@remotion', `compositor-${pkg}`, name + (platform === 'win32' ? '.exe' : ''));
  return fs.existsSync(file) ? file : null;
}

/** `ffmpeg` or `ffprobe` to run: the bundled one, else the name (PATH). With `{ full: true }`: the name (PATH) only. */
export const ffbin = (name, { full = false } = {}) => (full ? name : bundled(name) ?? name);

/** What a developer tool says when its full ffmpeg is not there (`r`: a spawnSync result), else null. */
export const noFull = (r, tool) => (r.error?.code === 'ENOENT' || /No such filter|Unknown input format|Requested output format/.test(String(r.stderr ?? ''))
  ? `${tool} needs a full ffmpeg on PATH (the one that comes with Rostrum has no select, tile, drawbox or gradients filter)` : null);
