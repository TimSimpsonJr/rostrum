// One tutorial's state file (<tutorial>/tutorial.json) and the pure state machine over it. The helper owns the file:
// nothing else writes it while the helper runs.
//   { id, title: string|null, site: string (host only), brand: string|null, state, busy: Stage|null,
//     error: { stage, message }|null, flags: { noMic }, renders: string[], sweep: { ok, at, fails }|null,
//     progress: { phase, label, pct, note, at }|null (a long step's place on the panel's bar: helper/progress.mjs),
//     archived: boolean, length: number|null (seconds of the last render),
//     exported: string|null (the approved film's file name in the tutorial folder: helper/pipeline.mjs exportFilm), updatedAt }
//   state: recorded -> scripted -> approved -> voiced -> built -> reviewed -> done
//   Stage: prepare | transcribe | time | measure | stills | sweep | render
// A failed stage keeps the state and records the error; the error never carries page text (stage names, exit codes
// and counts only: helper/pipeline.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { paths } from '../tools/paths.mjs';

export const STATES = ['recorded', 'scripted', 'approved', 'voiced', 'built', 'reviewed', 'done'];
export const ID = /^[\w-]{1,64}$/;
/** Folder names in the tutorials folder that are never a tutorial. */
export const RESERVED = new Set(['brands', 'recorder', '.trash']); // .trash: where deleted tutorials are kept (helper/server.mjs)

const NEXT = { prepared: ['recorded', 'recorded'], scripted: ['recorded', 'scripted'], approved: ['scripted', 'approved'], voiced: ['approved', 'voiced'],
  built: ['voiced', 'built'], rebuilt: ['built', 'built'], reviewed: ['built', 'reviewed'], done: ['reviewed', 'done'] };
const REOPEN = { editScript: ['approved', 'scripted'], revoice: ['voiced', 'approved'], notes: ['reviewed', 'built'], reopen: ['done', 'reviewed'] };
/** The events a caller may raise over HTTP. The rest (`prepared`, `voiced`, `built`, `rebuilt`, `failed`, `busy`) are
 *  raised by the helper's own stages when they end. */
export const CALLER_EVENTS = new Set(['scripted', 'approved', 'reviewed', 'done', 'editScript', 'revoice', 'notes', 'reopen', 'retry']);

/** The next state file for `event`. A failure keeps the state and records the error; retry clears it. Anything else throws. */
export function transition(t, event, extra = {}) {
  const at = (s) => ({ ...t, ...extra, state: s, busy: null, error: null, progress: null, updatedAt: new Date().toISOString() });
  if (event === 'failed') return { ...t, busy: null, progress: null, error: { stage: extra.stage, message: String(extra.message).slice(0, 400) }, updatedAt: new Date().toISOString() };
  if (event === 'retry') { if (!t.error) throw new Error('nothing to retry'); return { ...t, error: null, updatedAt: new Date().toISOString() }; }
  if (event === 'busy') return { ...t, busy: extra.stage };
  const rule = NEXT[event] ?? REOPEN[event];
  if (!rule) throw new Error(`unknown event ${event}`);
  if (t.state !== rule[0]) throw new Error(`${event} from ${t.state}`);
  return at(rule[1]);
}

const fresh = (id) => ({ id, title: null, site: '', brand: null, state: 'recorded', busy: null, error: null, flags: { noMic: false }, renders: [], sweep: null, progress: null, archived: false, length: null, exported: null, updatedAt: new Date().toISOString() });

/** The state file of a tutorial folder, or null when it has none (or one that cannot be read). The id is the one the
 *  state file keeps (the recording's name, given when it arrived); a file without one is named by its folder. A titled
 *  tutorial's folder is named after its title, not its id (helper/server.mjs `nameFolder`). */
export function readTutorial(dir) {
  const P = paths(dir);
  let t;
  try { t = JSON.parse(fs.readFileSync(P.state, 'utf8')); } catch { return null; }
  if (!t || typeof t !== 'object' || !STATES.includes(t.state)) return null;
  const id = ID.test(String(t.id ?? '')) ? t.id : P.name;
  if (!ID.test(id)) return null;
  return { ...fresh(id), ...t, id, flags: { noMic: false, ...(t.flags ?? {}) }, renders: Array.isArray(t.renders) ? t.renders : [],
    progress: t.progress && typeof t.progress === 'object' ? t.progress : null, archived: t.archived === true, length: Number.isFinite(t.length) ? t.length : null,
    exported: typeof t.exported === 'string' ? t.exported : null };
}

/** Writes the state file whole: a temp file beside it, then a rename (Windows may hold the target for a moment). */
export function writeTutorial(dir, t) {
  const P = paths(dir), tmp = P.state + '.tmp';
  fs.mkdirSync(P.root, { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(t, null, 1) + '\n');
  for (let attempt = 0; ; attempt++) {
    try { fs.renameSync(tmp, P.state); return t; } catch (e) {
      if (attempt >= 5 || !['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 40 * (attempt + 1));
    }
  }
}

/** Is the microphone take missing or too small to hold speech (under 10 KB)? Reads the file's size, nothing else. */
export function noMic(dir) {
  try { return fs.statSync(path.join(paths(dir).recording, 'mic.webm')).size < 10 * 1024; } catch { return true; }
}

/** The host of the page a recording starts on: read from the head of the raw events by this program, never shown
 *  beyond the host (no path, no query). '' when there is none. */
export function siteOf(dir) {
  let head = '';
  try {
    const fd = fs.openSync(path.join(paths(dir).recording, 'events.ndjson'), 'r'), buf = Buffer.alloc(256 * 1024);
    try { head = buf.subarray(0, fs.readSync(fd, buf, 0, buf.length, 0)).toString('utf8'); } finally { fs.closeSync(fd); }
  } catch { return ''; }
  const m = /"href":"(https?:[^"\\]+)"/.exec(head);
  try { return m ? new URL(m[1]).host : ''; } catch { return ''; }
}

/** A recording whose page never arrived: the recorder sent the voice or the pauses but not one batch of the page
 *  (its files are looked at by name and time only). Once nothing has changed for two minutes it is over, and it is
 *  shown, with what happened, rather than being a folder nobody can see. */
export const NO_PAGE = 'The page was not captured in this recording, only your narration. Record it again; reload the page first if the recorder was just updated.';
const SETTLED_MS = 2 * 60 * 1000;
function pageless(P, now) {
  const times = ['mic.webm', 'mic.json', 'segments.json', 'pauses.json'].map((f) => { try { return fs.statSync(path.join(P.recording, f)).mtimeMs; } catch { return null; } }).filter((t) => t !== null);
  return times.length > 0 && times.every((t) => now - t >= SETTLED_MS);
}

/** A recording that has no state file yet becomes a tutorial in state `recorded`; one with no page in it (above), the
 *  same with an error saying so. */
export function adopt(dir, now = Date.now()) {
  const P = paths(dir);
  if (!fs.existsSync(path.join(P.recording, 'events.ndjson'))) return pageless(P, now) ? writeTutorial(dir, { ...fresh(P.name), flags: { noMic: noMic(dir) }, error: { stage: 'record', message: NO_PAGE } }) : null;
  return writeTutorial(dir, { ...fresh(P.name), site: siteOf(dir), flags: { noMic: noMic(dir) } });
}

/** Every tutorial of the tutorials folder: each folder with a state file (named by its id, or by its title), and each
 *  folder named as an id with a recording and no state file (adopted). */
export function listTutorials(home) {
  let names = [];
  try { names = fs.readdirSync(home, { withFileTypes: true }); } catch { return []; }
  const out = [];
  for (const d of names) {
    if (!d.isDirectory() || d.name.startsWith('.') || RESERVED.has(d.name.toLowerCase())) continue;
    const dir = path.join(home, d.name), t = readTutorial(dir) ?? (ID.test(d.name) ? adopt(dir) : null);
    if (t) out.push({ ...t, dir });
  }
  return out.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}
