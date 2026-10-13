// node tools/regress.mjs <tutorial folder> [--max 2.5]
// Renders the tutorial again as out/regress-new.mp4 and frame-diffs it against out/regress-base.mp4 every 45th frame
// and on the last frame (tools/frame-diff.mjs). Run after every engine change: the approved films must not move.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { renderAfterSync } from './render.mjs';
import { ffbin } from './bin.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const [tutorial, ...rest] = process.argv.slice(2), max = rest.includes('--max') ? rest[rest.indexOf('--max') + 1] : '2.5';
if (!tutorial) { console.log('usage: regress.mjs <tutorial folder> [--max 2.5]'); process.exit(1); }
const out = path.join(path.resolve(tutorial), 'out'), base = path.join(out, 'regress-base.mp4'), fresh = path.join(out, 'regress-new.mp4');
if (!fs.existsSync(base)) { console.log(`no ${base}: render the baseline first`); process.exit(1); }
if ((await renderAfterSync('render', tutorial, 'Tutorial', fresh)) !== 0) process.exit(1);
// (counting needs no full build, and a machine with no ffmpeg on PATH has no ffprobe there either; frame-diff says so)
const probe = spawnSync(ffbin('ffprobe'), ['-v', 'error', '-count_packets', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_packets', '-of', 'csv=p=0', base], { encoding: 'utf8' });
const total = Number.parseInt(probe.stdout, 10); // (this ffprobe prints "942," for the count)
if (!(total > 0)) { console.log(`could not count the frames of ${base}: ${probe.stderr}`); process.exit(1); }
const frames = []; for (let n = 0; n < total; n += 45) frames.push(n); frames.push(total - 1);
const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'frame-diff.mjs'), base, fresh, frames.join(','), '--max', max], { stdio: 'inherit' });
process.exit(r.status ?? 1);
