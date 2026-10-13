// node tools/frame-diff.mjs <a.mp4> <b.mp4> <frame,frame,...> [--max 2.5]
// Mean absolute difference per channel (0..255) of the two videos' frames, decoded by ffmpeg as raw RGB. Exit 1 past --max.
import { spawnSync } from 'node:child_process';
import { ffbin, noFull } from './bin.mjs';
const [a, b, list] = process.argv.slice(2), max = Number(process.argv[process.argv.indexOf('--max') + 1] || 2.5);
const frame = (file, n) => {
  const r = spawnSync(ffbin('ffmpeg', { full: true }), ['-hide_banner', '-loglevel', 'error', '-i', file, '-vf', `select=eq(n\\,${n})`, '-vframes', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 64 * 1024 * 1024 });
  if (noFull(r, 'frame-diff')) { console.log(noFull(r, 'frame-diff')); process.exit(1); }
  if (r.status || !r.stdout.length) throw new Error(`frame ${n} of ${file}: ${r.stderr}`);
  return r.stdout;
};
let worst = 0;
for (const n of list.split(',').map(Number)) {
  const x = frame(a, n), y = frame(b, n);
  if (x.length !== y.length) throw new Error(`frame ${n}: sizes differ`);
  let sum = 0;
  for (let i = 0; i < x.length; i++) sum += Math.abs(x[i] - y[i]);
  const mean = sum / x.length;
  worst = Math.max(worst, mean);
  console.log(`frame ${n}: mean abs diff ${mean.toFixed(3)}`);
}
console.log(worst <= max ? `PASS (worst ${worst.toFixed(3)} <= ${max})` : `FAIL (worst ${worst.toFixed(3)} > ${max})`);
process.exit(worst <= max ? 0 : 1);
