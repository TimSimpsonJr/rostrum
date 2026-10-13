// Test grounds for the image and footage stages, made here from nothing (no file is downloaded, none is shipped):
//   node tools/make-grounds.mjs <folder>     writes ground-day.png, ground-night.png and, when a full ffmpeg is on PATH, ground-drift.mp4 (3 s)
// The pictures are busy on purpose (bands of light and dark across a gradient): type has to be read over them.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ffbin } from './bin.mjs';

const chunk = (type, data) => { const body = Buffer.concat([Buffer.from(type), data]), out = Buffer.alloc(body.length + 8); out.writeUInt32BE(data.length, 0); body.copy(out, 4); out.writeUInt32BE(zlib.crc32(body), body.length + 4); return out; };
/** A PNG, `w` by `h`, of `rgb(x, y)` (0..1 each way) -> [r, g, b] in 0..255. */
export function png(w, h, rgb) {
  const raw = Buffer.alloc(h * (1 + 3 * w));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) rgb(x / (w - 1), y / (h - 1)).forEach((v, c) => { raw[y * (1 + 3 * w) + 1 + 3 * x + c] = Math.max(0, Math.min(255, Math.round(v))); });
  const head = Buffer.alloc(13); head.writeUInt32BE(w, 0); head.writeUInt32BE(h, 4); head.set([8, 2, 0, 0, 0], 8);   // 8 bits, RGB
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
/** a gradient from `a` to `b` down the diagonal, with slanted bands of light and dark across it */
const banded = (a, b) => (x, y) => { const k = (x + y) / 2, band = 46 * Math.sin(38 * (x - 0.6 * y)) * Math.sin(5 * y + 1); return a.map((v, i) => v + (b[i] - v) * k + band); };

export function makeGrounds(dir) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'ground-day.png'), png(960, 540, banded([250, 214, 170], [120, 170, 235])));
  fs.writeFileSync(path.join(dir, 'ground-night.png'), png(960, 540, banded([24, 30, 74], [120, 40, 110])));
  const made = ['ground-day.png', 'ground-night.png'], clip = path.join(dir, 'ground-drift.mp4');
  const r = spawnSync(ffbin('ffmpeg', { full: true }), ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'gradients=s=1280x720:c0=0x14204a:c1=0x8a3cc8:c2=0x1c7a8a:n=3:duration=3:speed=0.08:rate=30', '-pix_fmt', 'yuv420p', '-an', clip]);
  if (r.status === 0) made.push('ground-drift.mp4');
  return made;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) { console.log('usage: make-grounds.mjs <folder>'); process.exit(1); }
  const made = makeGrounds(path.resolve(process.argv[2]));
  console.log(`${made.join(', ')}${made.length < 3 ? ' (no clip: it needs a full ffmpeg on PATH; the one that comes with Rostrum has no gradients filter)' : ''}`);
}
