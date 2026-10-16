// The mechanical stages of one tutorial, each a list of the plugin's own tools run in order (helper/run.mjs).
// A stage is given `ctx`: { dir (the tutorial folder), P (its paths), run, whisper, setStage(name), setProgress(p) } and throws a
// StageError whose message is safe to store: names, exit codes and counts, never page text.
// What a tool prints goes to <tutorial>/out/log/<step>.txt (structure, counts, labels of the clean copy).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { StageError } from './run.mjs';
import { transcribe } from './whisper.mjs';
import { noMic } from './tutorial.mjs';
import { progressOf } from './progress.mjs';
import { pausesMissing } from '../tools/segments.mjs';
import { KIT, baseKit } from '../tools/kit.mjs';
import { ffbin } from '../tools/bin.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MINUTE = 60 * 1000;

/** One of the plugin's tools, as a command: node with type stripping on, from the plugin's root. */
export const tool = (script, ...args) => ({ cmd: process.execPath, args: ['--experimental-strip-types', path.join(ROOT, script), ...args], cwd: ROOT });

/** Runs one step of a stage and throws when it did not end well. */
export async function step(ctx, name, spec, { timeout = 10 * MINUTE, save = true, onLine = null } = {}) {
  const r = await ctx.run({ name, ...spec, timeout, save: save ? path.join(ctx.P.out, 'log', `${name}.txt`) : null, onLine });
  if (r.missing) throw new StageError(`${name}: program not found`);
  if (r.code !== 0) throw new StageError(`${name} failed (exit ${r.code})`);
  return r;
}

const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };

/** Tells the panel where a long stage is (helper/progress.mjs); a ctx without `setProgress` reports nothing. */
const report = (ctx, phase, extra) => ctx.setProgress?.(progressOf(phase, extra));

/** The clean copy from the raw recording (tools/prepare-recording.mjs: scrubbed, with the pointer path). Returns what
 *  the tool reports: { screens, clicks, user, mic, applied: [{ screen, ok, node, tag, length }] }: places and lengths. */
export async function scrubStep(ctx) {
  // Fail closed on a pause: a recording that was paused, whose segments (where the pauses were) did not arrive
  // whole, is not prepared, since read as one stretch it would keep what was meant to be left out. The recorder
  // goes on sending them until the helper has them, so trying again later works.
  const kept = (name) => readJson(path.join(ctx.P.recording, name));
  if (pausesMissing(kept('pauses.json')?.pauses, kept('segments.json')?.segments)) throw new StageError('This recording was paused, and where the pauses were has not arrived from the recorder yet. Open Chrome, give it a minute, then try again.');
  const report =path.join(ctx.P.out, 'log', 'prepare.json');
  fs.rmSync(report, { force: true });
  await step(ctx, 'prepare', tool('tools/prepare-recording.mjs', ctx.dir, '--report', report));
  return readJson(report) ?? { screens: 0, clicks: 0, user: false, mic: false, applied: [] };
}

/** The kit every film needs (font, click sounds), copied into the tutorial so its film/ folder is whole on its own.
 *  The sounds of the moves its beat file comes to name are added before each render (tools/kit.mjs). */
export function copyKit(P) {
  fs.mkdirSync(P.kit, { recursive: true });
  for (const f of baseKit()) fs.copyFileSync(path.join(KIT, f), path.join(P.kit, f));
}

/** The microphone take -> <tutorial>/transcript/mic.json. A recording with no microphone gets an empty transcript. */
export async function transcribeStage(ctx) {
  ctx.setStage('transcribe');
  report(ctx, 'transcribe');
  fs.mkdirSync(ctx.P.transcript, { recursive: true });
  if (noMic(ctx.dir)) { fs.writeFileSync(path.join(ctx.P.transcript, 'mic.json'), JSON.stringify({ segments: [] }) + '\n'); return { words: 0, noMic: true }; }
  const { words } = await transcribe(ctx, path.join(ctx.P.recording, 'mic.webm'), ctx.P.transcript);
  return { words, noMic: false };
}

/** Recorded -> ready for the script: clean copy (scrub, pointer), gestures and what they enclose, the kit, the transcript. */
export async function prepareStage(ctx) {
  ctx.setStage('prepare');
  report(ctx, 'scrub');
  const scrubbed = await scrubStep(ctx);
  report(ctx, 'gestures');
  await step(ctx, 'gestures', tool('tools/gestures.mjs', ctx.dir));
  copyKit(ctx.P);
  const said = await transcribeStage(ctx);
  return { ...scrubbed, ...said };
}

// ── narration ──

/** The audio types an upload may claim, and the extension each is stored under. */
export const AUDIO = { 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav', 'audio/vnd.wave': 'wav', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/m4a': 'm4a',
  'audio/aac': 'aac', 'audio/ogg': 'ogg', 'audio/webm': 'webm', 'audio/flac': 'flac', 'audio/x-flac': 'flac' };
export const NARRATION_CAP = 50 * 1024 * 1024;

/** The script's narration lines (the "Narration" column of script.md's table), or [] when there is no script. */
export async function scriptOf(P) {
  if (!fs.existsSync(P.script)) return [];
  const { scriptLines } = await import('../tools/compare-lines.mjs');
  return scriptLines(fs.readFileSync(P.script, 'utf8'));
}

/** The take against the script: film/narration/compare.json = { ok, lines, differs: [{ line, text, heard, wer }],
 *  missing: [line], extra: [heard] }. `ok`: every line was said as written (near enough: tools/compare-lines.mjs). */
export async function compareTake(P) {
  const lines = await scriptOf(P);
  if (!lines.length) throw new StageError('script.md has no narration lines');
  const take = readJson(path.join(P.narration, 'narration.json'));
  if (!take) throw new StageError('the narration has no transcript');
  const { compareLines } = await import('../tools/compare-lines.mjs');
  const { differs, missing, extra } = compareLines(lines, (take.segments ?? []).flatMap((s) => s.words ?? []));
  const out = { ok: differs.length + missing.length === 0, lines: lines.length, differs, missing, extra };
  fs.writeFileSync(path.join(P.narration, 'compare.json'), JSON.stringify(out, null, 1) + '\n');
  return out;
}

/** The narration cut per script line and laid out in film time (tools/make-timing.mjs): vo-<i>.mp3 + timing.json.
 *  With a beat file and its boxes the air between lines is sized to the film's moves; without, 0.8 s: so this runs
 *  again once there is a beat file. */
export async function timeStage(ctx) {
  ctx.setStage('time');
  for (const f of ['narration.mp3', 'narration.json']) if (!fs.existsSync(path.join(ctx.P.narration, f))) throw new StageError('no narration yet');
  if (!fs.existsSync(ctx.P.script)) throw new StageError('no script yet');
  await step(ctx, 'timing', tool('tools/make-timing.mjs', ctx.dir));
  return { ok: true };
}

/** An uploaded take (`upload`, already inside film/narration/ under a fixed name) -> narration.mp3, its transcript,
 *  the comparison with the script, and, when every line was said as written, the timing.
 *  Returns { ok, differs, missing }: counts. A take that differs is left untimed for the author to see first. */
export async function narrationStage(ctx, upload) {
  const { P } = ctx, mp3 = path.join(P.narration, 'narration.mp3');
  ctx.setStage('transcribe');
  const probe = await ctx.run({ name: 'ffprobe', cmd: ffbin('ffprobe'), args: ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', upload], timeout: MINUTE });
  if (probe.missing) throw new StageError('ffprobe not found');
  const codec = String(probe.stdout ?? '').trim().split(/\r?\n/)[0];
  if (probe.code !== 0 || !/^[a-z0-9_]+$/.test(codec)) throw new StageError('not an audio file');
  if (codec === 'mp3' && upload.endsWith('.mp3')) fs.copyFileSync(upload, mp3);
  else {
    const made = path.join(P.narration, 'narration.new.mp3');
    await step(ctx, 'ffmpeg', { cmd: ffbin('ffmpeg'), args: ['-hide_banner', '-nostdin', '-y', '-i', upload, '-vn', '-c:a', 'libmp3lame', '-q:a', '2', made] }, { timeout: 5 * MINUTE, save: false });
    fs.renameSync(made, mp3);
  }
  for (const f of ['narration.json', 'compare.json']) fs.rmSync(path.join(P.narration, f), { force: true }); // of the take before
  await transcribe(ctx, mp3, P.narration);
  const compare = await compareTake(P);
  if (!compare.ok) return { ok: false, differs: compare.differs.length, missing: compare.missing.length };
  await timeStage(ctx);
  return { ok: true, differs: 0, missing: 0 };
}

/** What the narration page shows: the script, the voice to use, and where the take stands. Everything here is the
 *  author's own script and narration; nothing of the recording. */
export async function narrationView(P, t, brand) {
  const timing = readJson(P.timing), has = fs.existsSync(path.join(P.narration, 'narration.mp3'));
  return {
    id: t.id, title: t.title, state: t.state, busy: t.busy, error: t.error,
    lines: await scriptOf(P),
    brand: brand ? { name: brand.name ?? brand.id, voice: brand.voice ?? null } : null,
    narration: has, compare: has ? readJson(path.join(P.narration, 'compare.json')) : null,
    timing: has && timing ? timing.sentences.map((s) => ({ i: s.i, start: s.start, end: s.end, silent: !s.file })) : null,
  };
}

// ── build: measure, stills, sweep, render ──

const needBeats = (P) => { if (!fs.existsSync(P.beats)) throw new StageError('no beat file yet (film/beats.json)'); };

/** The boxes of the nodes the beat file names (tools/measure-boxes.mjs -> film/clean/boxes.json), then the narration
 *  timed again: with a beat file the air between lines is sized to the film's moves. */
export async function measureStage(ctx) {
  ctx.setStage('measure');
  needBeats(ctx.P);
  await step(ctx, 'measure', tool('tools/measure-boxes.mjs', ctx.dir));
  const timed = fs.existsSync(path.join(ctx.P.narration, 'narration.json')) && fs.existsSync(path.join(ctx.P.narration, 'narration.mp3'));
  if (timed) await timeStage(ctx);
  return { timed };
}

/** Frames of the film into out/frames/ (tools/stills.mjs: one bundle, one browser). `ask`: { frames, moments, every }. */
export async function stillsStage(ctx, ask) {
  ctx.setStage('stills');
  needBeats(ctx.P);
  if (!fs.existsSync(ctx.P.timing) || !fs.existsSync(ctx.P.boxes)) throw new StageError('measure first: the film has no boxes or no timing yet');
  const args = [ctx.dir, ...(ask.frames.length ? ['--frames', ask.frames.join(',')] : []), ...(ask.moments ? ['--moments'] : []), ...(ask.every ? ['--every', String(ask.every)] : [])];
  const r = await step(ctx, 'stills', tool('tools/stills.mjs', ...args), { timeout: 20 * MINUTE });
  return { frames: (/^stills: (\d+)/m.exec(r.stdout ?? '') ?? [])[1] != null ? Number(/^stills: (\d+)/m.exec(r.stdout)[1]) : null };
}

/** The sweep (tools/sweep.mjs): nothing original in a frame; that is all that fails it.
 *  What it prints (counts and node ids, never a value) is kept as out/sweep.txt. Returns { ok, fails }: a sweep that
 *  ran and found something is a result, not a broken stage. */
export async function sweepStage(ctx) {
  ctx.setStage('sweep');
  const r = await ctx.run({ name: 'sweep', ...tool('tools/sweep.mjs', '--tutorial', ctx.dir), timeout: 15 * MINUTE, save: path.join(ctx.P.out, 'sweep.txt') });
  const out = String(r.stdout ?? ''), passed = /^SWEEP PASSED$/m.test(out), failed = /^SWEEP FAILED$/m.test(out);
  if (r.missing || (!passed && !failed)) throw new StageError(`sweep did not finish (exit ${r.code})`);
  return { ok: passed && r.code === 0, fails: (out.match(/^FAIL /gm) ?? []).length };
}

/** The name of the next render: out/v<n>.mp4, one past the highest number any file in out/ already has. Never a name in use. */
export function nextRender(P) {
  let most = 0;
  try { for (const f of fs.readdirSync(P.out)) { const m = /^v(\d+)/.exec(f); if (m) most = Math.max(most, Number(m[1])); } } catch { /* no out/ yet */ }
  return `v${most + 1}.mp4`;
}

/** The film -> out/v<n>.mp4 (tools/render.mjs: the public dir is film/, its temp folder removed). Returns
 *  { file, seconds }: the film's length (ffprobe), or null when it could not be read. */
export async function renderStage(ctx) {
  ctx.setStage('render');
  needBeats(ctx.P);
  fs.mkdirSync(ctx.P.out, { recursive: true });
  const file = nextRender(ctx.P), out = path.join(ctx.P.out, file);
  report(ctx, 'render', { fraction: 0 });
  let frames = 0, encoded = 0, shown = 75;
  const onLine = (line) => {
    // the Remotion CLI without a terminal prints its progress as lines: "Rendered 150/300[, time remaining: 1m]", then "Encoded 150/300"
    let m = /^Rendered (\d+)\/(\d+)/.exec(line); if (m) frames = Number(m[1]) / Math.max(1, Number(m[2]));
    m = /^Encoded (\d+)\/(\d+)/.exec(line); if (m) encoded = Number(m[1]) / Math.max(1, Number(m[2]));
    // one line per frame (a thousand for a half-minute film): the state file is written only when the number moves
    const p = progressOf('render', { fraction: Math.min(0.99, 0.9 * frames + 0.1 * encoded) });
    if (p.pct !== shown) { shown = p.pct; ctx.setProgress?.(p); }
  };
  await step(ctx, 'render', tool('tools/render.mjs', 'render', ctx.dir, 'Tutorial', out), { timeout: 60 * MINUTE, onLine });
  let size = 0;
  try { size = fs.statSync(out).size; } catch { /* not written */ }
  if (!size) throw new StageError('render wrote no film');
  const probe = await ctx.run({ name: 'ffprobe', cmd: ffbin('ffprobe'), args: ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out], timeout: MINUTE });
  const seconds = Number(String(probe.stdout ?? '').trim());
  return { file, seconds: Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 10) / 10 : null };
}

/** A title as a file or folder name: no <>:"/\|?*, control characters and runs of space as one space, no trailing dots
 *  or spaces, 120 characters at most; '' when nothing is left or the title is a name Windows keeps (CON, NUL, ...). */
export function safeName(title) {
  const s = String(title ?? '').replace(/[<>:"/\\|?*]/g, '').replace(/[\s\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 120).replace(/[. ]+$/, '');
  return s && !/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s) ? s : '';
}
/** A tutorial's title as the approved film's file name (safeName), else its id. */
export const filmName = (t) => (safeName(t.title) || t.id) + '.mp4';

/** The approved film: the newest render copied to <tutorial>/<title>.mp4 (beside out/, so render numbering and the review
 *  page's list are untouched), over one of that name; the file a title before it left is removed first. Returns the
 *  file name, or what was exported before when there is no render to copy. */
export function exportFilm(P, t) {
  const last = t.renders.at(-1), from = last && path.join(P.out, path.basename(last));
  if (!from || !fs.existsSync(from)) return t.exported ?? null;
  const name = filmName(t);
  if (t.exported && t.exported !== name && /\.mp4$/i.test(t.exported)) fs.rmSync(path.join(P.root, path.basename(t.exported)), { force: true });
  fs.copyFileSync(from, path.join(P.root, name));
  return name;
}

/** Has anything the sweep read changed since it passed? (the clean copy, the beat file, the boxes, the timing, the rules) */
export function sweepIsStale(P, sweep) {
  const at = Date.parse(sweep?.at ?? '');
  if (!Number.isFinite(at)) return true;
  return [P.manifest, P.changed, P.beats, P.boxes, P.timing, P.rules].some((f) => { try { return fs.statSync(f).mtimeMs > at + 1000; } catch { return false; } });
}

// ── brands ──

/** Copies the tutorial's brand into its film/brand/ (brand.json + the mark file), or, with no brand, writes the
 *  no-brand file there: no name, no mark, and the recorded site's own accent and font (film/clean/site.json).
 *  Returns { brand: id | null }. The mark file is named by the brand file; it must be a plain file name in the brand's folder. */
export function applyBrand(P, brandsDir, brand) {
  const site = readJson(P.site) ?? {};
  // (a brand's own stage may name a picture or a clip of the brand's folder: found, and refused, before anything is replaced)
  const ground = typeof brand?.stage?.file === 'string' ? brandFile(path.join(brandsDir, brand.id), brand.stage.file) : null;
  fs.mkdirSync(P.brand, { recursive: true });
  for (const f of fs.readdirSync(P.brand)) fs.rmSync(path.join(P.brand, f), { recursive: true, force: true }); // a copy, made again whole
  if (!brand) {
    fs.writeFileSync(path.join(P.brand, 'brand.json'), JSON.stringify({ name: null, mark: null, colours: { accent: site.accent ?? null }, font: site.font ?? null }, null, 1) + '\n');
    return { brand: null };
  }
  const { id, ...file } = brand, mark = file.mark?.file;
  if (mark != null) {
    const from = path.join(brandsDir, id, String(mark));
    if (!/^[\w][\w.-]{0,80}$/.test(String(mark)) || path.dirname(path.resolve(from)) !== path.resolve(brandsDir, id) || !fs.existsSync(from)) throw new StageError('the brand\'s mark file is missing or is not a plain file name');
    fs.copyFileSync(from, path.join(P.brand, mark));
  }
  if (ground) fs.copyFileSync(ground, path.join(P.brand, path.basename(ground)));
  fs.writeFileSync(path.join(P.brand, 'brand.json'), JSON.stringify(file, null, 1) + '\n');
  return { brand: id };
}

/** the kinds of file a brand's stage may name: the pictures and clips the film can show (film/src/kit/media.ts holds the same lists) */
export const STAGE_FILES = ['png', 'jpg', 'jpeg', 'webp', 'mp4', 'webm'];
/** The file a brand's own stage names (brand.json `stage.file`), as a path inside the brand's folder `brandDir`; a
 *  StageError when it is anything but a plain file name of a picture or a clip that is there. Nothing is fetched:
 *  an address is refused like any other name that is not a file of the folder. The message never repeats the name. */
export function brandFile(brandDir, name) {
  const no = (why) => { throw new StageError(`the brand's stage file ${why}`); };
  if (typeof name !== 'string' || !name) no('is not a file name');
  if (/^[a-z][a-z0-9+.-]*:/i.test(name) || /^[\\/]{2}/.test(name)) no('is an address or names a drive: it must be a file in the brand\'s folder');
  if (path.posix.isAbsolute(name) || path.win32.isAbsolute(name)) no('is an absolute path: it must be a file in the brand\'s folder');
  if (name.split(/[\\/]/).includes('..')) no('leaves the brand\'s folder');
  if (!/^[a-z0-9][a-z0-9._-]{0,80}$/i.test(name) || name.includes('..')) no('is not a plain file name (letters, digits, dots, hyphens; no folders)');
  if (!new RegExp(`\\.(${STAGE_FILES.join('|')})$`, 'i').test(name)) no(`is not a picture or a clip the film can show (${STAGE_FILES.join(', ')})`);
  const dir = path.resolve(brandDir), to = path.resolve(dir, name), rel = path.relative(dir, to);
  if (rel.startsWith('..') || path.isAbsolute(rel) || path.dirname(to) !== dir) no('leaves the brand\'s folder');
  let st = null;
  try { st = fs.lstatSync(to); } catch { /* not there */ }
  if (!st) no('is missing from the brand\'s folder');
  if (!st.isFile()) no('is not a file (a link is not followed)');
  return to;
}

/** Every brand of a brands folder: [{ id (the folder's name), name, mark, colours, font, voice }]. */
export function readBrands(brandsDir) {
  return brandNames(brandsDir).map((id) => ({ ...(readJson(path.join(brandsDir, id, 'brand.json')) ?? {}), id })).filter((b) => Object.keys(b).length > 1);
}

/** Which brand a tutorial is made under: the one set on it (the panel's picker, or the skill after asking in chat);
 *  else the only brand there is; else none (null). The site a tutorial was recorded on never picks a brand. */
export function resolveBrand(t, brands) {
  return brands.find((b) => b.id === t.brand) ?? (brands.length === 1 ? brands[0] : null);
}

/** The brands of a brands folder: the names of its folders that hold a brand.json. */
export function brandNames(brandsDir) {
  let names = [];
  try { names = fs.readdirSync(brandsDir, { withFileTypes: true }); } catch { return []; }
  return names.filter((d) => d.isDirectory() && /^[\w-]{1,64}$/.test(d.name) && fs.existsSync(path.join(brandsDir, d.name, 'brand.json'))).map((d) => d.name).sort();
}

const AS = ['name', 'company', 'email', 'key', 'amount', 'series', 'number'];
const USE = ['cells', 'avatars', 'links', 'emails', 'phones', 'numbers', 'user']; // tools/scrub.mjs OPT_IN (checked by a test)
const str = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= max;
const int = (v) => Number.isInteger(v) && v >= 0 && v < 1e7;

/** Additions to rules.json as a caller may send them, checked: { blind, fill, chart, keep, allow, keepColumns }. Throws a StageError naming
 *  the first thing that is wrong. */
export function checkRules(body) {
  const out = { blind: [], fill: [], chart: [], keep: [], allow: [], keepColumns: [], only: [], use: [], user: [], blindColumns: [], blindAll: [] };
  const list = (k) => { const v = body?.[k] ?? []; if (!Array.isArray(v) || v.length > 200) throw new StageError(`rules: "${k}" must be a list (200 at most)`); return v; };
  // the table and columns of a keepColumns or blindColumns entry, checked the one way
  const tableOf = (k) => (k && (str(k.table, 200) || int(k.table)) ? k.table : str(k?.table?.near, 120) && Object.keys(k.table).length === 1 ? { near: k.table.near } : null);
  const columnsOk = (k) => Array.isArray(k?.columns) && k.columns.length > 0 && k.columns.length <= 50 && k.columns.every((c) => str(c, 120)) && (k.screen == null || int(k.screen));
  // rules a tutorial switches on by name (tools/scrub.mjs OPT_IN): nothing but secrets, account numbers and money is replaced unasked
  for (const u of list('use')) { if (!USE.includes(u)) throw new StageError(`rules: use is a list of ${USE.join(' | ')}`); out.use.push(u); }
  // the signed-in user: the element that holds the name (the scrub reads it; nobody types a name), or off, per site
  for (const u of Array.isArray(body?.user) ? list('user') : body?.user != null ? [body.user] : []) {
    const host = u?.host == null || (str(u.host, 200) && /^[\w.:-]+$/.test(u.host));
    const off = u?.off === true && Object.keys(u).every((x) => x === 'off' || x === 'host');
    const named = u && u.off == null && Object.keys(u).every((x) => ['host', 'screen', 'node', 'selector'].includes(x)) && (u.screen == null || int(u.screen)) && ((str(u.selector, 200) && u.node == null) || (int(u.node) && int(u.screen) && u.selector == null));
    if (!host || !(off || named)) throw new StageError('rules: a user entry is { host?, selector, screen? } | { host?, screen, node } | { off: true, host? }');
    out.user.push(off ? { off: true, ...(u.host != null ? { host: u.host } : {}) } : { ...(u.host != null ? { host: u.host } : {}), ...(u.screen != null ? { screen: u.screen } : {}), ...(u.selector != null ? { selector: u.selector } : { node: u.node }) });
  }
  // every element a selector matches, replaced as a kind (tools/scrub.mjs blindAll): a message list's senders, a strip of tabs
  for (const b of list('blindAll')) {
    const s = b?.screens, screens = s == null ? null : Array.isArray(s) ? (s.length > 0 && s.length <= 500 && s.every(int) ? [...s] : undefined) : int(s.from) && int(s.to) && s.from <= s.to && Object.keys(s).length === 2 ? { from: s.from, to: s.to } : undefined;
    if (!b || screens === undefined || (b.host != null && !(str(b.host, 200) && /^[\w.:-]+$/.test(b.host))) || !str(b.selector, 300) || ![...AS, 'picture', 'attributes'].includes(b.as) || (b.label != null && !str(b.label, 60)) || (b.within != null && !(b.within === true && b.as === 'company')) || Object.keys(b).some((x) => !['screens', 'host', 'selector', 'as', 'label', 'within'].includes(x)))
      throw new StageError(`rules: a blindAll entry is { host?, screens?: { from, to } | [numbers], selector, as: ${AS.join('|')}|picture|attributes, label?, within?: true (with as: company) } and nothing else`);
    out.blindAll.push({ ...(b.host != null ? { host: b.host } : {}), ...(screens ? { screens } : {}), selector: b.selector, as: b.as, ...(b.label != null ? { label: b.label } : {}), ...(b.within ? { within: true } : {}) });
  }
  for (const k of list('blindColumns')) {
    const table = tableOf(k);
    if (table == null || !columnsOk(k) || !AS.includes(k.as) || (k.label != null && !str(k.label, 60)) || Object.keys(k).some((x) => !['screen', 'table', 'columns', 'as', 'label'].includes(x)))
      throw new StageError(`rules: a blindColumns entry is { screen?, table: selector | node id | { near: header text }, columns: [header text], as: ${AS.join('|')}, label? } and nothing else`);
    if (typeof table === 'object' && k.screen == null) throw new StageError('rules: a blindColumns entry that finds its table by { near } must name its screen');
    out.blindColumns.push({ ...(k.screen != null ? { screen: k.screen } : {}), table, columns: [...k.columns], as: k.as, ...(k.label != null ? { label: k.label } : {}) });
  }
  for (const b of list('blind')) {
    if (!b || !int(b.screen) || !int(b.node) || !AS.includes(b.as) || (b.label != null && !str(b.label, 60))) throw new StageError(`rules: a blind rule is { screen, node, as: ${AS.join('|')}, label? }`);
    out.blind.push({ screen: b.screen, node: b.node, as: b.as, ...(b.label != null ? { label: b.label } : {}) });
  }
  for (const f of list('fill')) {
    // { screen, node, value }: that one element on that one screen, named as a blind rule names it
    if (f && f.node != null) {
      if (!int(f.screen) || !int(f.node) || !str(f.value, 80) || f.near != null || f.selector != null) throw new StageError('rules: a fill is { near | selector, value } or { screen, node, value }');
      out.fill.push({ screen: f.screen, node: f.node, value: f.value });
      continue;
    }
    if (!f || !str(f.value, 80) || !(str(f.near, 120) || str(f.selector, 200))) throw new StageError('rules: a fill is { near | selector, value } or { screen, node, value }');
    out.fill.push({ ...(f.near ? { near: f.near } : { selector: f.selector }), value: f.value });
  }
  for (const c of list('chart')) {
    if (!c || !str(c.selector, 200) || !Array.isArray(c.values) || c.values.length > 400 || !c.values.every((n) => typeof n === 'number' && Number.isFinite(n))) throw new StageError('rules: a chart is { selector, values: number[] }');
    out.chart.push({ selector: c.selector, values: c.values });
  }
  for (const k of list('keep')) { if (!str(k, 80)) throw new StageError('rules: keep is a list of words'); out.keep.push(k); }
  for (const a of list('allow')) {
    if (!a || !int(a.screen) || !int(a.node) || Object.keys(a).some((k) => k !== 'screen' && k !== 'node')) throw new StageError('rules: an allow entry is { screen, node } and nothing else');
    out.allow.push({ screen: a.screen, node: a.node });
  }
  // columns of a table left as recorded on purpose (tools/scrub.mjs): the table by selector, node id or a header near it
  for (const k of list('keepColumns')) {
    const table = k && (str(k.table, 200) || int(k.table) ? k.table : str(k.table?.near, 120) && Object.keys(k.table).length === 1 ? { near: k.table.near } : null);
    if (table == null || (k.screen != null && !int(k.screen)) || !Array.isArray(k.columns) || !k.columns.length || k.columns.length > 50 || !k.columns.every((c) => str(c, 120)) || Object.keys(k).some((x) => !['screen', 'table', 'columns'].includes(x)))
      throw new StageError('rules: a keepColumns entry is { screen?, table: selector | node id | { near: header text }, columns: [header text] } and nothing else');
    if (typeof table === 'object' && k.screen == null) throw new StageError('rules: a keepColumns entry that finds its table by { near } must name its screen');
    out.keepColumns.push({ ...(k.screen != null ? { screen: k.screen } : {}), table, columns: [...k.columns] });
  }
  // pages full of other people's text (tools/scrub.mjs): only the kept subtrees are read by the rules, the rest is hidden
  for (const o of list('only')) {
    const s = o?.screens, screens = s == null ? null : Array.isArray(s) ? (s.length > 0 && s.length <= 500 && s.every(int) ? [...s] : undefined) : int(s.from) && int(s.to) && s.from <= s.to && Object.keys(s).length === 2 ? { from: s.from, to: s.to } : undefined;
    if (!o || screens === undefined || (o.host != null && !(str(o.host, 200) && /^[\w.:-]+$/.test(o.host))) || !Array.isArray(o.keep) || o.keep.length > 50 || !o.keep.every((k) => str(k, 200) || int(k)) || (o.all != null && o.all !== true)
      || Object.keys(o).some((x) => !['screens', 'host', 'keep', 'all'].includes(x)))
      throw new StageError('rules: an only entry is { screens?: { from, to } | [numbers], host?, keep: [selector | node id], all?: true } and nothing else');
    out.only.push({ ...(screens ? { screens } : {}), ...(o.host != null ? { host: o.host } : {}), keep: [...o.keep], ...(o.all ? { all: true } : {}) });
  }
  return out;
}

/** Each `allow` entry against the clean copy: does it name an element of that screen? [{ screen, node, ok, tag }].
 *  An entry is confirmed interface text (tools/sweep.mjs `sortAllowed`): it changes what the sweep fails on, never
 *  what the scrub writes. */
export async function checkAllow(P, allow) {
  const { elementIn } = await import('../tools/sweep.mjs');
  return allow.map((a) => {
    const tag = elementIn(readJson(path.join(P.clean, `screen-${a.screen}.json`))?.node ?? {}, a.node);
    return { screen: a.screen, node: a.node, ok: !!tag, tag };
  });
}

/** rules.json with `add` folded in: a blind rule (or a fill naming a node) for a node replaces the one already there for it; the same fill,
 *  chart or keep word is not listed twice. Everything else in the file stays as it is. */
export function mergeRules(have = {}, add) {
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const blind = [...(have.blind ?? []).filter((b) => !add.blind.some((n) => n.screen === b.screen && n.node === b.node)), ...add.blind];
  const more = (k) => [...(have[k] ?? []), ...(add[k] ?? []).filter((n, i, all) => !(have[k] ?? []).some((h) => same(h, n)) && all.findIndex((m) => same(m, n)) === i)];
  // a fill naming a node: a later one for the same screen + node replaces the one that was there
  const atNode = (a, b) => a.node != null && a.screen === b.screen && a.node === b.node;
  const fill = more('fill').filter((h, i, all) => !all.some((n, j) => j > i && atNode(n, h)));
  const allow = more('allow'), keepColumns = more('keepColumns'), only = more('only'), use = more('use'), blindColumns = more('blindColumns'), blindAll = more('blindAll');
  // one `user` entry per site: a new one for a site replaces the one that was there
  const users = (v) => (Array.isArray(v) ? v : v ? [v] : []), site = (u) => String(u?.host ?? '').toLowerCase();
  const user = [...users(have.user).filter((h) => !(add.user ?? []).some((n) => site(n) === site(h))), ...(add.user ?? []).filter((n, i, all) => all.findLastIndex((m) => site(m) === site(n)) === i)];
  return { ...have, blind, fill, chart: more('chart'), keep: more('keep'), ...(allow.length ? { allow } : {}), ...(keepColumns.length ? { keepColumns } : {}), ...(only.length ? { only } : {}),
    ...(use.length ? { use } : {}), ...(user.length ? { user } : {}), ...(blindColumns.length ? { blindColumns } : {}), ...(blindAll.length ? { blindAll } : {}) };
}

/** Folds `add` into <tutorial>/rules.json and scrubs again. Answers what the blind rules did: [{ screen, node, tag,
 *  length, ok }]: the place and the length of what was replaced, never the text. */
export async function rulesStage(ctx, add) {
  ctx.setStage('prepare');
  const have = fs.existsSync(ctx.P.rules) ? readJson(ctx.P.rules) : {};
  if (!have) throw new StageError('rules.json is not valid JSON');
  // an allow entry must name an element of its screen: one that does not is answered ok: false and not written
  const allowed = await checkAllow(ctx.P, add.allow ?? []), found = { ...add, allow: allowed.filter((a) => a.ok).map((a) => ({ screen: a.screen, node: a.node })) };
  fs.writeFileSync(ctx.P.rules, JSON.stringify(mergeRules(have, found), null, 1) + '\n');
  // allow entries change nothing the scrub writes: with nothing else sent, the clean copy is left as it is
  const scrubbing = !(add.allow?.length && add.blind.length + add.fill.length + add.chart.length + add.keep.length + (add.keepColumns?.length ?? 0) + (add.only?.length ?? 0) + (add.use?.length ?? 0) + (add.user?.length ?? 0) + (add.blindColumns?.length ?? 0) + (add.blindAll?.length ?? 0) === 0);
  const report = scrubbing ? await scrubStep(ctx) : { applied: [] };
  const mine = (a) => [...add.blind, ...add.fill.filter((f) => f.node != null)].some((b) => b.screen === a.screen && b.node === a.node);
  // `kept`: every column the scrub left as recorded on purpose (all of rules.json's keepColumns, not only this call's),
  // so the caller can tell the user exactly what stayed: { screen, table, column, cells, ok }, the rule's words, no cell text
  // (`reason`: why nothing was kept; `keptHeaders`: the other column names of those tables that a rule replaced, by cell node)
  const kept = (report.kept ?? []).map((k) => ({ screen: k.screen ?? null, ok: !!k.ok, table: k.table ?? null, column: String(k.column), cells: k.cells ?? 0, ...(k.reason ? { reason: String(k.reason) } : {}) }));
  const keptHeaders = (report.keptHeaders ?? []).map((h) => ({ screen: h.screen, table: h.table, replaced: h.replaced }));
  return { applied: (report.applied ?? []).filter(mine).map((a) => ({ screen: a.screen, node: a.node, tag: a.tag ?? null, length: a.length ?? null, ok: !!a.ok })), ...(allowed.length ? { allowed } : {}), ...(kept.length ? { kept } : {}), ...(keptHeaders.length ? { keptHeaders } : {}),
    // `users`: per site that was asked about, how the signed-in user was found and how much was replaced (never the name);
    // `blindedColumns`: every column replaced on purpose, as `kept` lists the kept ones
    ...(report.users?.length ? { users: report.users.map((u) => ({ host: String(u.host ?? ''), by: String(u.by), ...(u.screen != null ? { screen: u.screen } : {}), ...(u.node != null ? { node: u.node } : {}), ...(u.reason ? { reason: String(u.reason) } : {}), replacements: u.replacements ?? 0, screens: u.screens ?? 0 })) } : {}),
    // `blindAll`: per rule, how many elements its selector matched and replaced on each screen (no match is listed too)
    ...(report.blindAll?.length ? { blindAll: report.blindAll.map((b) => ({ screen: b.screen, selector: String(b.selector), matched: b.matched ?? 0, replaced: b.replaced ?? 0, ...(b.within != null ? { within: b.within } : {}), ...(b.reason ? { reason: String(b.reason) } : {}) })) } : {}),
    ...(report.blindedColumns?.length ? { blindedColumns: report.blindedColumns.map((k) => ({ screen: k.screen ?? null, ok: !!k.ok, table: k.table ?? null, column: String(k.column), cells: k.cells ?? 0, ...(k.reason ? { reason: String(k.reason) } : {}) })) } : {}),
    // `only`: per screen, how much was hidden and whether each kept subtree was found: counts and the rule's own selectors, no text
    ...(report.only?.length ? { only: report.only.map((h) => ({ screen: h.screen, texts: h.texts, attributes: h.attributes, pictures: h.pictures, keeps: (h.keeps ?? []).map((k) => ({ keep: k.keep, ok: !!k.ok, matched: k.matched ?? 0, ...(k.reason ? { reason: String(k.reason) } : {}) })) })) } : {}) };
}
