import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { bundled, ffbin, noFull } from './bin.mjs';
import { fadeWav } from './make-timing.mjs';

test('bin: the bundled program is the compositor package\'s, by platform; none for a platform Remotion has no package for', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-bin-')), dir = path.join(root, 'node_modules', '@remotion', 'compositor-win32-x64-msvc');
  fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'ffmpeg.exe'), '');
  assert.equal(bundled('ffmpeg', { platform: 'win32', arch: 'x64', root }), path.join(dir, 'ffmpeg.exe'));
  assert.equal(bundled('ffprobe', { platform: 'win32', arch: 'x64', root }), null, 'not installed');
  assert.equal(bundled('ffmpeg', { platform: 'darwin', arch: 'arm64', root }), null);
  assert.equal(bundled('ffmpeg', { platform: 'sunos', arch: 'x64', root }), null);
  fs.rmSync(root, { recursive: true, force: true });
});

test('bin: a full build is only ever the one on PATH, and a tool says so when it is not there', () => {
  assert.equal(ffbin('ffmpeg', { full: true }), 'ffmpeg');
  assert.equal(ffbin('ffprobe'), bundled('ffprobe') ?? 'ffprobe');
  assert.match(noFull({ error: { code: 'ENOENT' } }, 'frame-diff'), /^frame-diff needs a full ffmpeg on PATH/);
  assert.match(noFull({ status: 8, stderr: "[AVFilterGraph] No such filter: 'select'" }, 'frame-diff'), /full ffmpeg/);
  assert.equal(noFull({ status: 0, stderr: '' }, 'frame-diff'), null);
  assert.equal(noFull({ status: 1, stderr: 'No such file or directory' }, 'frame-diff'), null);
});

// What the user's path asks of the bundled build. A Remotion upgrade that drops one of these fails here, not on a
// user's machine. (afade, select, tile, drawbox and gradients are known to be missing: nothing on the user's path uses them.)
test('bin: the bundled build holds what the pipeline uses', { skip: bundled('ffmpeg') ? false : 'no bundled ffmpeg (npm ci has not run)' }, () => {
  const list = (flag) => spawnSync(bundled('ffmpeg'), ['-hide_banner', flag], { encoding: 'utf8' }).stdout.split(/\r?\n/).map((l) => l.trim().split(/\s+/)[1]);
  const lacks = (have, want) => want.filter((w) => !have.includes(w));
  assert.deepEqual(lacks(list('-filters'), ['loudnorm', 'silencedetect', 'volume', 'scale', 'aresample']), []);
  assert.deepEqual(lacks(list('-encoders'), ['libmp3lame', 'pcm_s16le', 'pcm_s24le', 'png']), []);
  assert.deepEqual(lacks(list('-decoders'), ['mp3', 'aac', 'opus', 'vorbis', 'flac', 'pcm_s16le', 'pcm_s24le', 'h264']), []);
  assert.deepEqual(lacks(list('-muxers'), ['mp3', 'wav', 'image2pipe', 'null']), []);
  assert.ok(bundled('ffprobe'), 'ffprobe is beside it');
});

/** A 24-bit mono WAV of `n` samples, all `value`, as ffmpeg writes one to a pipe (a LIST chunk before the data, sizes unknown). */
function wav(n, value, rate = 1000) {
  const fmt = Buffer.alloc(24); fmt.write('fmt ', 0, 'latin1'); fmt.writeUInt32LE(16, 4); fmt.writeUInt16LE(1, 8); fmt.writeUInt16LE(1, 10); fmt.writeUInt32LE(rate, 12); fmt.writeUInt32LE(rate * 3, 16); fmt.writeUInt16LE(3, 20); fmt.writeUInt16LE(24, 22);
  const list = Buffer.from('LIST\x05\x00\x00\x00INFOx\x00', 'latin1'), head = Buffer.from('RIFF\xff\xff\xff\xffWAVE', 'latin1'), data = Buffer.alloc(8 + 3 * n);
  data.write('data', 0, 'latin1'); data.writeUInt32LE(0xffffffff, 4);
  for (let i = 0; i < n; i++) data.writeIntLE(value, 8 + 3 * i, 3);
  return { buf: Buffer.concat([head, fmt, list, data]), at: head.length + fmt.length + list.length + 8 };
}

test('timing: a clip rises from nothing over its first 0.02 s and falls to nothing over its last 0.08 s, in straight lines', () => {
  const { buf, at } = wav(1000, -8000), out = fadeWav(buf, 1.0), s = (n) => out.readIntLE(at + 3 * n, 3);
  assert.deepEqual([s(0), s(10), s(20), s(500), s(920), s(960), s(999)], [0, -4000, -8000, -8000, -8000, -4000, -100]);
  assert.equal(out.length, buf.length, 'no sample is added or dropped');
  assert.throws(() => fadeWav(Buffer.from('RIFF0000WAVEjunk'), 1), /not a WAV file/);
});
