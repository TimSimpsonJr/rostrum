// Local transcription, run on one audio file into a folder of its own. Two programs can do it:
//   whisper.cpp (`kind: 'cpp'`): the one Rostrum's setup puts in the data folder (tools/fetch.mjs: fetched against a
//     pinned checksum), or one already on the machine (whisper-cli / whisper-cpp on PATH); it needs the model file.
//   Python whisper (`kind: 'python'`): `whisper` on PATH, as before; it fetches its own model.
// Both leave the same file: <outDir>/<input's name>.json = { segments: [{ start, end, words: [{ word, start, end }] }] },
// seconds (what tools/make-timing.mjs and tools/compare-lines.mjs read).
// Whisper names its output after the input (`mic.webm` -> `mic.json`), so the output folder is never the folder the
// input is in when that would overwrite something (the recorder's own `recording/mic.json` holds the take's start time).
// The transcript is the user's speech: this module never prints it. Python whisper's printing is switched off;
// whisper.cpp prints what it heard on standard output whatever it is told, and the helper keeps no program's output
// unless asked (helper/run.mjs: no `save` here).
import fs from 'node:fs';
import path from 'node:path';
import { StageError } from './run.mjs';
import { ffbin } from '../tools/bin.mjs';
import { dataDir } from '../tools/data.mjs';
import { PINS } from '../tools/pins.mjs';
import { NEEDS_RUNTIME, NO_RUNTIME, canStart, installedProgram, whisperHome } from '../tools/fetch.mjs';

export const MODEL = 'small.en';
export const whisperArgs = (input, outDir) => [input, '--model', MODEL, '--word_timestamps', 'True', '--language', 'en', '--output_format', 'json', '--output_dir', outDir, '--fp16', 'False', '--verbose', 'False'];
/** whisper.cpp: its JSON with every token in it (`-oj -ojf`) into `<base>.json`, each token timed from the model's
 *  attention (`-dtw`: what Python whisper's word times are made from; it gives no times with flash attention on, so
 *  `-nfa`). The program's other word times (`-ml 1 -sow`) run every word on to the start of the next, pauses
 *  included: measured Oct 13 2026 on v1.9.2, a line's length came out up to 1.6 s longer than Python whisper's. */
export const cppArgs = (model, wav, base) => ['-m', model, '-f', wav, '-l', 'en', '-dtw', MODEL, '-nfa', '-oj', '-ojf', '-of', base, '-np'];

/** A program by name in the folders of PATH (and, on a Mac, Homebrew's: an app started from the Dock does not have
 *  the shell's PATH). The full path, or null. */
export function onPath(name, { env = process.env, platform = process.platform, exists = fs.existsSync } = {}) {
  const win = platform === 'win32';
  const dirs = String(env.PATH ?? env.Path ?? '').split(win ? ';' : ':').filter(Boolean);
  if (platform === 'darwin') dirs.push('/opt/homebrew/bin', '/usr/local/bin');
  for (const dir of dirs) { const file = (win ? path.win32 : path.posix).join(dir, name + (win ? '.exe' : '')); if (exists(file)) return file; }
  return null;
}

const isCpp = (program) => /^(whisper-cli|whisper-cpp|main)(\.exe)?$/i.test(path.basename(String(program).replace(/\\/g, '/')));

// The programs seen to start while this helper has been running: one that started is not tried again, one that did
// not is tried every time it would be chosen (what it lacked may have been installed since).
const started = new Set();
const startsHere = (exe) => started.has(exe) || (canStart(exe) && !!started.add(exe));

/** The transcriber, in order: `ROSTRUM_WHISPER` (a path; whisper.cpp when it is named as whisper.cpp's programs
 *  are); the whisper.cpp a finished setup put in the data folder, with its model, when it can start on this computer
 *  (`probe`: tools/fetch.mjs canStart, once); whisper.cpp on PATH, when the model is in the data folder; else Python
 *  whisper by name, as it always was (not there: the stage says "transcriber not found").
 *  { kind: 'cpp' | 'python', cmd, model?, why? }. `why: 'runtime'`: Rostrum's own whisper.cpp is here and cannot
 *  start, so this is what is left; if that is not there either, the stage says what whisper.cpp needs. */
export function findTranscriber({ env = process.env, platform = process.platform, arch = process.arch, data = dataDir({ env, platform }), pins = PINS, probe = startsHere } = {}) {
  const home = whisperHome(data), model = fs.existsSync(home.model) ? home.model : null;
  if (env.ROSTRUM_WHISPER) return isCpp(env.ROSTRUM_WHISPER) ? { kind: 'cpp', cmd: env.ROSTRUM_WHISPER, model } : { kind: 'python', cmd: env.ROSTRUM_WHISPER };
  const own = installedProgram(data, pins[`whisper-${platform}-${arch}`]), stuck = !!own && !probe(own);
  if (own && model && !stuck) return { kind: 'cpp', cmd: own, model };
  for (const name of model ? ['whisper-cli', 'whisper-cpp'] : []) { const found = onPath(name, { env, platform }); if (found) return { kind: 'cpp', cmd: found, model }; }
  return { kind: 'python', cmd: 'whisper', ...(stuck ? { why: 'runtime' } : {}) };
}

/** whisper.cpp's JSON (`transcription[].tokens[]`: { text, t_dtw: when the token ends, in hundredths of a second })
 *  -> the shape the pipeline reads. A token that begins with a space begins a word. A word starts where the token
 *  before it ended and ends where its last token with a letter or digit in it ended, as Python whisper has it:
 *  punctuation is written onto its word and the pause after it is not. Markers (`[_BEG_]`, `[_TT_452]`) have no time. */
export function fromCpp(json) {
  const all = []; let at = 0, open = null;
  for (const item of json?.transcription ?? []) for (const t of item.tokens ?? []) {
    const text = String(t.text ?? '');
    if (!text || /^\[_.*\]$/.test(text) || !(t.t_dtw >= 0)) continue;
    const end = t.t_dtw / 100;
    if (!open || (text.startsWith(' ') && open.said)) all.push(open = { word: text, start: at, end: at, said: false }); else open.word += text;
    if (/[a-z0-9]/i.test(text)) { open.end = end; open.said = true; }
    at = end;
  }
  const words = all.filter((w) => w.said).map(({ word, start, end }) => ({ word, start, end }));
  return { text: '', segments: words.length ? [{ start: words[0].start, end: words.at(-1).end, words }] : [], language: 'en' };
}

/** Transcribes `input` into `<outDir>/<input's name>.json`. `ctx`: { run, whisper } (helper/run.mjs; `whisper` is
 *  what findTranscriber gives, or the older form: a program, or [program, ...first arguments], taken as Python
 *  whisper). Returns { file, words }: a count, never the words. */
export async function transcribe(ctx, input, outDir) {
  const name = path.basename(input, path.extname(input)), out = path.join(outDir, name + '.json');
  if (path.basename(path.resolve(outDir)).toLowerCase() === 'recording') throw new StageError('a transcript is never written into the recording folder');
  fs.mkdirSync(outDir, { recursive: true });
  const w = ctx.whisper, timeout = 10 * 60 * 1000;
  const ran = (r) => {
    if (r.missing) throw new StageError(w?.why === 'runtime' ? NEEDS_RUNTIME : 'transcriber not found');
    if (r.code === NO_RUNTIME && w?.kind === 'cpp') throw new StageError(NEEDS_RUNTIME);
    if (r.code !== 0) throw new StageError(`transcriber failed (exit ${r.code})`);
  };
  if (w && typeof w === 'object' && !Array.isArray(w) && w.kind === 'cpp') {
    if (!w.model) throw new StageError('transcriber model not found');
    const wav = path.join(outDir, name + '.16k.wav'); // whisper.cpp reads 16 kHz mono 16-bit WAV and nothing else
    try {
      const made = await ctx.run({ name: 'ffmpeg', cmd: ffbin('ffmpeg'), args: ['-hide_banner', '-nostdin', '-y', '-i', input, '-vn', '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wav], timeout });
      if (made.missing) throw new StageError('ffmpeg not found');
      if (made.code !== 0) throw new StageError(`the audio could not be read (ffmpeg exit ${made.code})`);
      fs.rmSync(out, { force: true });
      ran(await ctx.run({ name: 'whisper', cmd: w.cmd, args: cppArgs(w.model, wav, path.join(outDir, name)), timeout }));
      let heard;
      try { heard = JSON.parse(fs.readFileSync(out, 'utf8')); } catch { throw new StageError('the transcriber wrote no transcript'); }
      fs.writeFileSync(out, JSON.stringify(fromCpp(heard)));
    } finally { fs.rmSync(wav, { force: true }); }
  } else {
    const [cmd, ...first] = Array.isArray(w) ? w : [w?.cmd ?? w];
    ran(await ctx.run({ name: 'whisper', cmd, args: [...first, ...whisperArgs(input, outDir)], timeout }));
  }
  let json;
  try { json = JSON.parse(fs.readFileSync(out, 'utf8')); } catch { throw new StageError('the transcriber wrote no transcript'); }
  return { file: out, words: (json.segments ?? []).reduce((n, s) => n + (s.words ?? []).length, 0) };
}
