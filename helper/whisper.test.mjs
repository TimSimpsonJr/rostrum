import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run as spawnRun } from './run.mjs';
import { cppArgs, findTranscriber, fromCpp, onPath, transcribe, whisperArgs } from './whisper.mjs';
import { repairWords } from '../tools/make-timing.mjs';
import { NEEDS_RUNTIME, NO_RUNTIME } from '../tools/fetch.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rt-whisper-'));
const SHA = 'a'.repeat(64), PIN = { url: 'https://github.com/x/y/releases/download/v1/w.zip', size: 10, sha256: SHA, exe: 'Release/whisper-cli.exe' };

test('whisper.cpp\'s JSON becomes the shape the pipeline reads: one segment, a word per run of tokens, timed from the tokens\' ends', () => {
  // the shape v1.9.2 writes with `-dtw small.en -nfa -oj -ojf` (other fields left out): `t_dtw` in hundredths of a second
  const item = (text, ...tokens) => ({ offsets: { from: 0, to: 0 }, text, tokens: tokens.map(([t, t_dtw]) => ({ text: t, offsets: { from: 0, to: 0 }, id: 1, p: 0.9, t_dtw })) });
  const heard = { transcription: [
    item(' Open the settings page, then save.', ['[_BEG_]', -1], [' Open', 20], [' the', 44], [' set', 62], ['tings', 96], [' page', 172], [',', 208], [' then', 220], [' save', 300], ['.', 380], ['[_TT_190]', -1]),
    item(' Now Ctrl+C -', [' Now', 400], [' Ctrl', 420], ['+', 430], ['C', 470], [' -', 480], ['[_TT_240]', -1])] };
  const out = fromCpp(heard);
  assert.deepEqual(out.segments, [{ start: 0, end: 4.7, words: [
    { word: ' Open', start: 0, end: 0.2 }, { word: ' the', start: 0.2, end: 0.44 }, { word: ' settings', start: 0.44, end: 0.96 },
    { word: ' page,', start: 0.96, end: 1.72 }, // (the comma is written onto the word; the time it took is not)
    { word: ' then', start: 2.08, end: 2.2 }, { word: ' save.', start: 2.2, end: 3 },
    { word: ' Now', start: 3.8, end: 4 }, { word: ' Ctrl+C', start: 4, end: 4.7 }] }]); // (punctuation alone is no word)
  assert.deepEqual(repairWords(out.segments.flatMap((s) => s.words), []).map((w) => w.w), ['open', 'the', 'settings', 'page', 'then', 'save', 'now', 'ctrlc'], 'what the timing reads of it');
  assert.deepEqual(fromCpp({ transcription: [item(' Open', [' Open', -1])] }).segments, [], 'tokens with no time (flash attention was on) are not words');
  assert.deepEqual(fromCpp({ transcription: [] }).segments, []);
  assert.deepEqual(fromCpp({}).segments, []);
});

test('transcribe with whisper.cpp: a 16 kHz wav is made, the program is given the model and the wav, and its transcript is rewritten in place', async () => {
  const dir = temp(), input = path.join(dir, 'narration.mp3'), outDir = path.join(dir, 'out'), ran = [];
  fs.writeFileSync(input, 'sound');
  const run = async (spec) => {
    ran.push([spec.name, spec.cmd, ...spec.args]);
    if (spec.name === 'ffmpeg') { fs.writeFileSync(spec.args.at(-1), 'wav'); return { code: 0, stdout: '', missing: false }; }
    return spawnRun({ cmd: process.execPath, args: [path.join(ROOT, 'fixtures', 'whisper-cpp-stub.mjs'), ...spec.args], env: { ...process.env, ROSTRUM_STUB_TEXT: 'Open your user menu.' } });
  };
  const r = await transcribe({ run, whisper: { kind: 'cpp', cmd: 'C:\\data\\whisper\\bin\\Release\\whisper-cli.exe', model: 'M.bin' } }, input, outDir);
  assert.deepEqual([r.file, r.words], [path.join(outDir, 'narration.json'), 4]);
  const wav = path.join(outDir, 'narration.16k.wav');
  assert.deepEqual(ran[0].slice(-7), ['-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wav]);
  assert.deepEqual(ran[1], ['whisper', 'C:\\data\\whisper\\bin\\Release\\whisper-cli.exe', ...cppArgs('M.bin', wav, path.join(outDir, 'narration'))]);
  const json = JSON.parse(fs.readFileSync(r.file, 'utf8'));
  assert.deepEqual(json.segments[0].words.map((w) => [w.word, w.start, w.end]), [[' Open', 0, 0.4], [' your', 0.4, 0.8], [' user', 0.8, 1.2], [' menu.', 1.2, 1.6]]);
  assert.equal(fs.existsSync(wav), false, 'the wav is removed');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('transcribe: what goes wrong is said in the stage\'s words; Python whisper is run as it always was', async () => {
  const dir = temp(), input = path.join(dir, 'mic.webm'), outDir = path.join(dir, 'transcript');
  fs.writeFileSync(input, 'sound');
  const fails = (ctx, re) => assert.rejects(transcribe(ctx, input, outDir), re);
  const ffmpegOk = (then) => async (spec) => (spec.name === 'ffmpeg' ? { code: 0, stdout: '' } : then);
  await fails({ run: async () => ({ code: 0 }), whisper: { kind: 'cpp', cmd: 'whisper-cli.exe', model: null } }, /^Error: transcriber model not found$/);
  await fails({ run: ffmpegOk({ code: null, missing: true }), whisper: { kind: 'cpp', cmd: 'whisper-cli.exe', model: 'm' } }, /transcriber not found/);
  await fails({ run: ffmpegOk({ code: 3 }), whisper: { kind: 'cpp', cmd: 'whisper-cli.exe', model: 'm' } }, /transcriber failed \(exit 3\)/);
  await fails({ run: ffmpegOk({ code: 0 }), whisper: { kind: 'cpp', cmd: 'whisper-cli.exe', model: 'm' } }, /wrote no transcript/);
  await fails({ run: async () => ({ code: 1 }), whisper: { kind: 'cpp', cmd: 'whisper-cli.exe', model: 'm' } }, /audio could not be read/);
  await fails({ run: async () => ({ code: null, missing: true }), whisper: 'whisper' }, /transcriber not found/);
  // whisper.cpp without the Visual C++ runtime: said plainly, whether it was found out before (Python whisper was what was left, and is not there) or only now
  await fails({ run: async () => ({ code: null, missing: true }), whisper: { kind: 'python', cmd: 'whisper', why: 'runtime' } }, new RegExp(`^Error: ${NEEDS_RUNTIME.replace(/[+]/g, '\\+')}$`));
  await fails({ run: ffmpegOk({ code: NO_RUNTIME }), whisper: { kind: 'cpp', cmd: 'whisper-cli.exe', model: 'm' } }, /needs Microsoft's Visual C\+\+ runtime/);
  await fails({ run: async () => ({ code: NO_RUNTIME }), whisper: 'whisper' }, /transcriber failed \(exit 3221225781\)/);
  await assert.rejects(transcribe({ run: async () => ({ code: 0 }), whisper: 'whisper' }, input, path.join(dir, 'recording')), /never written into the recording folder/);
  for (const [whisper, cmd, first] of [['whisper', 'whisper', []], [['node', 'stub.mjs'], 'node', ['stub.mjs']], [{ kind: 'python', cmd: 'C:\\py\\whisper.exe' }, 'C:\\py\\whisper.exe', []]]) {
    const seen = [];
    const run = async (spec) => { seen.push(spec); fs.writeFileSync(path.join(outDir, 'mic.json'), JSON.stringify({ segments: [{ words: [{ word: ' hi', start: 0, end: 0.2 }] }] })); return { code: 0 }; };
    assert.equal((await transcribe({ run, whisper }, input, outDir)).words, 1);
    assert.deepEqual([seen.length, seen[0].name, seen[0].cmd, seen[0].args], [1, 'whisper', cmd, [...first, ...whisperArgs(input, outDir)]]);
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

test('which transcriber: ROSTRUM_WHISPER; the one a finished setup put in the data folder; whisper.cpp on PATH with the model; else Python whisper by name', () => {
  const data = temp(), bin = temp(), home = path.join(data, 'whisper'), pins = { 'whisper-win32-x64': PIN };
  const probed = [], find = (env = {}, more = {}) => findTranscriber({ env, platform: 'win32', arch: 'x64', data, pins, probe: (exe) => { probed.push(exe); return true; }, ...more });
  const PY = { kind: 'python', cmd: 'whisper' };
  assert.deepEqual(find(), PY, 'nothing set up: as it always was');
  assert.deepEqual(find({ ROSTRUM_WHISPER: 'C:\\py\\Scripts\\whisper.exe' }), { kind: 'python', cmd: 'C:\\py\\Scripts\\whisper.exe' });
  assert.deepEqual(find({ ROSTRUM_WHISPER: 'D:\\tools\\whisper-cli.exe' }), { kind: 'cpp', cmd: 'D:\\tools\\whisper-cli.exe', model: null });

  // the program is in the data folder, but no setup finished: it is not run
  const own = path.join(home, 'bin', PIN.exe); // (the pinned archive holds its programs in a folder)
  fs.mkdirSync(path.dirname(own), { recursive: true });
  fs.writeFileSync(own, '');
  fs.writeFileSync(path.join(home, 'ggml-small.en.bin'), '');
  const model = path.join(home, 'ggml-small.en.bin');
  assert.deepEqual(find(), PY);
  fs.writeFileSync(path.join(home, 'installed.json'), JSON.stringify({ sha256: 'b'.repeat(64), exe: PIN.exe }));
  assert.deepEqual(find(), PY, 'set up from another download than the one pinned');
  fs.writeFileSync(path.join(home, 'installed.json'), JSON.stringify({ sha256: SHA, exe: PIN.exe }));
  assert.deepEqual(find(), { kind: 'cpp', cmd: own, model });
  assert.ok(probed.length > 0 && probed.every((exe) => exe === own), 'only the program a finished setup put there is ever started to see if it can');
  // it is there and cannot start on this computer (no Visual C++ runtime): Python whisper, and why is kept
  assert.deepEqual(find({}, { probe: () => false }), { ...PY, why: 'runtime' });
  assert.deepEqual(find({ ROSTRUM_WHISPER: 'D:\\tools\\whisper-cli.exe' }, { probe: () => assert.fail('the user\'s own is not tried') }).cmd, 'D:\\tools\\whisper-cli.exe');
  assert.deepEqual(find({}, { pins: { 'whisper-win32-x64': { ...PIN, sha256: null } } }), PY, 'no checksum recorded: the program in the data folder is not run');
  assert.deepEqual(find({ ROSTRUM_WHISPER: 'C:\\py\\whisper.exe' }), { kind: 'python', cmd: 'C:\\py\\whisper.exe' }, 'the variable outranks it');

  // whisper.cpp of the machine's own, on PATH: only with the model
  fs.rmSync(path.join(home, 'installed.json'));
  fs.writeFileSync(path.join(bin, 'whisper-cli.exe'), '');
  assert.deepEqual(find({ PATH: `C:\\nowhere;${bin}` }), { kind: 'cpp', cmd: path.win32.join(bin, 'whisper-cli.exe'), model });
  fs.rmSync(model);
  assert.deepEqual(find({ PATH: `C:\\nowhere;${bin}` }), PY);

  assert.equal(onPath('whisper-cli', { env: { PATH: '/usr/bin' }, platform: 'darwin', exists: (f) => f === '/opt/homebrew/bin/whisper-cli' }), '/opt/homebrew/bin/whisper-cli');
  assert.equal(onPath('whisper-cli', { env: {}, platform: 'linux', exists: () => true }), null, 'no PATH at all');
  for (const d of [data, bin]) fs.rmSync(d, { recursive: true, force: true });
});
