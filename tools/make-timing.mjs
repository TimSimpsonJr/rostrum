// A narration take -> one clip per script line and the film's timing file. A new take needs only this run:
//   node --experimental-strip-types tools/make-timing.mjs <tutorial folder>
// (<tutorial>/film is the public dir; where things live: tools/paths.mjs)
// Reads  <tutorial>/film/narration/narration.mp3 + narration.json (Whisper: segments[].words[].start/end)
//        <tutorial>/script.md                the narration lines (the table's "Narration" column)
//        <tutorial>/film/beats.json + film/clean/boxes.json  what the film does between the lines: the air before each line is
//                                            sized to it (tools/pacing.mjs). Before there is a beat file, every gap is 0.8 s;
//                                            run this again once there is one.
// Writes <tutorial>/film/narration/vo-<i>.mp3    (one per line, cut at the silences, levelled to -20 LUFS)
//        <tutorial>/film/narration/timing.json   (every time in FILM seconds)
// The take is cut per SCRIPT LINE, by lining its words up with the script (tools/compare-lines.mjs), not per Whisper
// segment. A line that was said differently is still cut from its own words; a line that was not said keeps its
// place in the film as a silent slot.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ffbin } from './bin.mjs';
import { alignLines, scriptLines } from './compare-lines.mjs';
import { LEAD, pacing } from './pacing.mjs';
import { paths } from './paths.mjs';

const TARGET_LUFS = -20, PRE = 0.06, TAIL = 0.3, FPS = 30;
const SILENT_PER_WORD = 0.35, GAP_WITHOUT_BEATS = 0.8;

/** Word starts as Whisper gives them, repaired from the silences: a word that "starts" inside a silence starts when
 *  the silence ends, and a zero-length word starts where the sound before it began. */
export function repairWords(words, silences) {
  return words.map((w, i) => {
    let start = w.start;
    const inside = silences.find((s) => start >= s.start - 0.02 && start < s.end);
    if (inside) start = inside.end;
    else if (w.end - w.start < 0.05) {
      const before = silences.filter((s) => s.end <= w.start).pop();
      start = Math.max(i ? words[i - 1].end : 0, before ? before.end : 0);
    }
    return { w: w.word.trim().toLowerCase().replace(/[^a-z0-9']/g, ''), start, end: Math.max(w.end, start) };
  });
}

/** The take, line by line: each script line with the words of the take that are it (times still the take's).
 *  A line the take does not have is a silent slot, as long as it would take to say. `words`: repaired words. */
export function spokenLines(lines, words) {
  const windows = alignLines(lines, words);
  return lines.map((text, i) => {
    const mine = windows[i].wer >= 0.8 ? [] : words.slice(windows[i].from, windows[i].to).filter((w) => w.w);
    return mine.length ? { text, words: mine } : { text, silent: +(SILENT_PER_WORD * text.split(/\s+/).filter(Boolean).length).toFixed(2), words: [] };
  });
}

/** Where each sentence sits in the film: sentence i starts `gaps[i]` after the one before ends (the first after `lead`). */
export function layOut(sentences, { lead, gaps }) {
  let at = lead;
  return sentences.map((s, i) => {
    const start = i ? at + (gaps[i] ?? 0.5) : lead;
    if (s.silent != null) { at = start + s.silent; return { ...s, shift: 0, start, end: at, words: [] }; }
    const shift = start - s.words[0].start;
    at = start + (s.words.at(-1).end - s.words[0].start);
    return { ...s, shift, start, end: at, words: s.words.map((w) => ({ w: w.w, start: +(w.start + shift).toFixed(3), end: +(w.end + shift).toFixed(3) })) };
  });
}

/** A clip's ends faded, in place: `wav` is a 24-bit PCM WAV file as ffmpeg writes it to a pipe; the first `fadeIn`
 *  seconds rise from nothing and the sound falls to nothing over `fadeOut` seconds, ending `dur` seconds in (both
 *  straight lines, sample by sample: what ffmpeg's afade does, which the bundled build does not have). */
export function fadeWav(wav, dur, fadeIn = 0.02, fadeOut = 0.08) {
  let at = 12, rate = 0, block = 0, data = -1;
  while (at + 8 <= wav.length && data < 0) {
    const id = wav.toString('latin1', at, at + 4), size = wav.readUInt32LE(at + 4);
    if (id === 'fmt ') { rate = wav.readUInt32LE(at + 12); block = wav.readUInt16LE(at + 20); if (wav.readUInt16LE(at + 22) !== 24) throw new Error('fadeWav: not 24-bit PCM'); }
    if (id === 'data') data = at + 8; else at += 8 + size + (size & 1);
  }
  if (data < 0 || !rate || !block) throw new Error('fadeWav: not a WAV file');
  const up = fadeIn * rate, down = fadeOut * rate, from = (dur - fadeOut) * rate;
  for (let n = 0, i = data; i + block <= wav.length; n++, i += block) {
    const g = Math.min(1, n / up) * Math.max(0, Math.min(1, 1 - (n - from) / down));
    if (g < 1) for (let c = i; c < i + block; c += 3) wav.writeIntLE(Math.round(wav.readIntLE(c, 3) * g), c, 3);
  }
  return wav;
}

/** The air before each line: from the beat file's moves when the tutorial has one. */
export async function gapsFor(tutorial, lines) {
  const { beats, boxes, layout, manifest } = paths(tutorial);
  if (!fs.existsSync(beats) || !fs.existsSync(boxes)) return { gaps: lines.map((_, i) => (i ? GAP_WITHOUT_BEATS : 0)), from: 'no beat file yet' };
  const { movesFrom } = await import('../film/src/tutorial/beats.ts');
  // (when each screen was taken, as the film is told it: a `becomes` that waits is paced by it)
  const screens = fs.existsSync(manifest) ? JSON.parse(fs.readFileSync(manifest, 'utf8')).screens?.map((s) => ({ i: s.i, t: s.t })) : undefined;
  // (the screens' measured elements, when there are any: the framings the film will use are the ones settled by them)
  const moves = movesFrom({ ...JSON.parse(fs.readFileSync(beats, 'utf8')), screens }, JSON.parse(fs.readFileSync(boxes, 'utf8')), fs.existsSync(layout) ? JSON.parse(fs.readFileSync(layout, 'utf8')) : undefined);
  return { gaps: pacing(lines.map((_, i) => moves[i] ?? null)), from: 'the beat file' };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) { console.log('usage: make-timing.mjs <tutorial folder>'); process.exit(1); }
  const P = paths(process.argv[2]), tutorial = P.root, dir = P.narration, mp3 = path.join(dir, 'narration.mp3');
  const ffRun = (args, more) => { const r = spawnSync(ffbin('ffmpeg'), ['-hide_banner', ...args], { maxBuffer: 1 << 30, ...more }); if (r.error) throw new Error(`ffmpeg did not run (${r.error.code})`); if (r.status) throw new Error(String(r.stderr).slice(-800)); return r; };
  const ff = (args) => ffRun(['-nostdin', ...args], { encoding: 'utf8' }).stderr;
  const lines = scriptLines(fs.readFileSync(P.script, 'utf8'));
  if (!lines.length) throw new Error('script.md has no narration lines (a table with a "Narration" column)');
  const loud = JSON.parse(ff(['-i', mp3, '-af', `loudnorm=I=${TARGET_LUFS}:print_format=json`, '-f', 'null', '-']).match(/\{[^{}]*"input_i"[^{}]*\}/)[0]);
  const gain = TARGET_LUFS - Number(loud.input_i);
  const sil = [...ff(['-i', mp3, '-af', 'silencedetect=noise=-35dB:d=0.15', '-f', 'null', '-']).matchAll(/silence_start: ([\d.]+)[\s\S]*?silence_end: ([\d.]+)/g)].map((m) => ({ start: +m[1], end: +m[2] }));
  const total = Number(spawnSync(ffbin('ffprobe'), ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp3], { encoding: 'utf8' }).stdout);
  const words = repairWords(JSON.parse(fs.readFileSync(path.join(dir, 'narration.json'), 'utf8')).segments.flatMap((s) => s.words), sil);
  const { gaps, from } = await gapsFor(tutorial, lines);
  const sentences = layOut(spokenLines(lines, words), { lead: LEAD, gaps });
  const voiced = (j) => sentences.slice(j).find((x) => x.silent == null);
  const out = sentences.map((s, i) => {
    if (s.silent != null) return { i, text: s.text, file: null, clipAt: +s.start.toFixed(3), clipDur: s.silent, start: +s.start.toFixed(3), end: +s.end.toFixed(3), words: [] };
    const first = s.start - s.shift, last = s.end - s.shift; // in the take
    const after = voiced(i + 1), next = after ? after.start - after.shift : total;
    const a = Math.max(0, first - PRE), b = Math.min(last + TAIL, Math.max(last + 0.05, next - PRE), total);
    const file = `vo-${i}.mp3`;
    // the clip is cut and levelled, its ends faded here (fadeWav), then it is made an mp3: two ffmpeg runs, no file between
    const cut = ffRun(['-nostdin', '-ss', a.toFixed(3), '-to', b.toFixed(3), '-i', mp3, '-af', `volume=${gain.toFixed(2)}dB`, '-c:a', 'pcm_s24le', '-f', 'wav', '-']).stdout;
    ffRun(['-y', '-f', 'wav', '-i', '-', '-ar', '48000', '-c:a', 'libmp3lame', '-q:a', '2', path.join(dir, file)], { input: fadeWav(cut, b - a) });
    return { i, text: s.text, file, clipAt: +(a + s.shift).toFixed(3), clipDur: +(b - a).toFixed(3), start: +s.start.toFixed(3), end: +s.end.toFixed(3), words: s.words };
  });
  fs.writeFileSync(path.join(dir, 'timing.json'), JSON.stringify({ fps: FPS, dir: 'narration', take: 'narration', lufs: TARGET_LUFS, gainDb: +gain.toFixed(2), gaps, sentences: out }, null, 1) + '\n');
  console.log(`timing: ${out.length} lines, take at ${loud.input_i} LUFS, gain ${gain.toFixed(2)} dB, gaps from ${from}: ${gaps.join(', ')}`);
  for (const s of out) console.log(`  ${s.i}  ${s.start.toFixed(2)} to ${s.end.toFixed(2)}  ${s.file ? '' : '(silent slot) '}${s.text}`);
}
