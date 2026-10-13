// Local helper: 127.0.0.1 only. It receives recordings from the extension, owns each tutorial's state file, runs the
// mechanical stages (helper/pipeline.mjs) and answers the panel and the skill.
//   node --experimental-strip-types helper/server.mjs [--tutorials <dir>] [--brands <dir>] [--port 4600] [--whisper <program>]
//   (npm run helper)   env: ROSTRUM_HOME (the tutorials folder), ROSTRUM_WHISPER (the transcriber; without it:
//   helper/whisper.mjs findTranscriber), ROSTRUM_DATA (where setup keeps the transcriber), ROSTRUM_PORT
// The tutorials folder is ROSTRUM_HOME, else <home>/Videos/Rostrum (Movies on a Mac: tools/data.mjs); one tutorial is <tutorials>/<id>/ (tools/paths.mjs),
// a recording arrives in <tutorials>/<id>/recording/. Brands are in <tutorials>/Brands/.
//
// What it will and will not do:
//   - bound to 127.0.0.1; a request must be addressed to it by that name (no DNS rebinding)
//   - a request from a web page is refused unless the page is this helper's own or the extension's
//   - an id is [\w-]{1,64}, never "Brands" or "Recorder" (where POST /recorder/install copies the recorder's files),
//     and names a folder directly inside the tutorials folder
//   - DELETE /tutorials/:id removes nothing: it moves the tutorial's folder whole (raw recording included) into
//     <tutorials>/.trash/<id>-<time>/, never while a stage runs on it. Nothing empties the trash, nothing reads or
//     serves what is in it (only each copy's title, from its state file, for the list), and
//     POST /tutorials/:id/restore (a caller with no Origin only) moves the newest copy back
//   - request bodies are capped; nothing is ever served from a tutorial's recording/ or transcript/, and no answer
//     or log line carries raw recording content: answers are states, counts, node ids, and text of the CLEAN copy
//   - it starts and answers the panel before any npm package is installed: this file and all it imports at the top
//     are `node:` modules and our own (tools/setup.test.mjs holds it to that); POST /setup (a caller with no Origin
//     only) is how the packages get there (tools/setup.mjs)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { paths } from '../tools/paths.mjs';
import { run as spawnRun, StageError } from './run.mjs';
import { CALLER_EVENTS, ID, RESERVED, adopt, listTutorials, noMic, readTutorial, transition, writeTutorial } from './tutorial.mjs';
import * as pipeline from './pipeline.mjs';
import { progressOf } from './progress.mjs';
import { EXTENSION_ID } from './extension-id.mjs';
import { findTranscriber } from './whisper.mjs';
import { runSetup, setupState } from '../tools/setup.mjs';
import { tutorialsHome } from '../tools/data.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.woff2': 'font/woff2' };
const CORS = { 'access-control-allow-headers': '*', vary: 'origin' };
// On every response: never shown inside a frame on any page (a navigation carries no Origin to refuse it by), never
// sniffed into another type, never loaded as a resource by another site, and no address of ours sent on as a referrer.
const SAFE = { 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY', 'content-security-policy': "frame-ancestors 'none'", 'referrer-policy': 'no-referrer', 'cross-origin-resource-policy': 'same-origin', 'cache-control': 'no-store' };
// The helper's HTML pages run their own files only. The review player (tools/review, served as it is) sets `style`
// attributes from its script (positions on the timeline), hence style-src-attr; it has no inline script or handler.
// Its font is the film kit's own file, served from /kit/ below (font-src 'self'): nothing comes from the network.
const PAGE_CSP = "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const REVIEW_CSP = "default-src 'none'; script-src 'self'; style-src 'self'; style-src-attr 'unsafe-inline'; connect-src 'self'; media-src 'self'; img-src 'self' data: blob:; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const CAP = 20 * 1024 * 1024;          // per asset, and per microphone chunk (about 1 s of audio, a few KB)
const EVENTS_CAP = 256 * 1024 * 1024;  // one batch of events (half a second; a full snapshot with its pictures inlined can be large)
const JSON_CAP = 256 * 1024;

/** Where deleted tutorials go, inside the tutorials folder (helper/tutorial.mjs RESERVED), and a copy's name there:
 *  <id>-<time in ms>, with .<n> after it when that name is taken. */
const TRASH = '.trash', TRASHED = /^([\w-]{1,64})-(\d{13})(?:\.(\d+))?$/;

export const defaultHome = () => tutorialsHome();

export class HttpError extends Error { constructor(code, message) { super(message); this.code = code; } }

// Whole request body as a Buffer (assets are binary), or null when it is larger than `cap`.
// Over the cap the rest is read and thrown away, so the client still gets a clean 413.
const readBody = (req, cap = Infinity) => new Promise((resolve) => {
  const chunks = [];
  let size = 0;
  req.on('data', (c) => { size += c.length; if (size <= cap) chunks.push(c); else chunks.length = 0; });
  req.on('end', () => resolve(size <= cap ? Buffer.concat(chunks) : null));
  req.on('error', () => resolve(null));
});

/** A JSON object body ({} when there is none). */
async function jsonBody(req, cap = JSON_CAP) {
  const body = await readBody(req, cap);
  if (!body) throw new HttpError(413, 'too big');
  if (!body.length) return {};
  let j;
  try { j = JSON.parse(body.toString('utf8')); } catch { throw new HttpError(400, 'bad json'); }
  if (!j || typeof j !== 'object' || Array.isArray(j)) throw new HttpError(400, 'the body must be a JSON object');
  return j;
}

/** The file `rel` names inside `base`, or null: the path is decoded, resolved and must stay inside (links included). */
export function fileInside(base, rel) {
  let name;
  try { name = decodeURIComponent(rel); } catch { return null; }
  if (!name || name.includes('\0')) return null;
  const root = path.resolve(base), file = path.resolve(root, name.replace(/^[/\\]+/, ''));
  const out = (from, to) => { const back = path.relative(from, to); return !back || back.startsWith('..') || path.isAbsolute(back); };
  if (out(root, file)) return null;
  try {
    if (!fs.statSync(file).isFile() || out(fs.realpathSync(root), fs.realpathSync(file))) return null;
  } catch { return null; }
  return file;
}

const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };

export function start({ port = 4600, home = defaultHome(), brands = path.join(home, 'Brands'), runner = spawnRun, whisper = null, extensionId = process.env.ROSTRUM_EXTENSION_ID || EXTENSION_ID, setup = {} } = {}) {
  home = path.resolve(home);
  const reviews = new Map(); // tutorial folder -> its review tool (tools/review/server.mjs, as it is)
  const reviewOf = async (dir) => {
    if (!reviews.has(dir)) { const { createReview } = await import('../tools/review/server.mjs'); reviews.set(dir, createReview({ root: dir, notes: paths(dir).review })); }
    return reviews.get(dir);
  };
  const jobs = new Map(); // tutorial id -> the stage running on it
  const recorder = { lastSeen: null };
  // First-run setup (tools/setup.mjs; `setup`: its context, the tests' own folders): one run at a time, its latest word kept.
  const setupCtx = { run: (spec) => runner(spec), ...setup }, setupJob = { running: false, last: null, ended: Promise.resolve() };
  // What a page of this helper asks of the session ("send notes to Claude"): a web page cannot reach the session, so
  // the request waits here, GET /tutorials carries the list, and the panel submits the prompt and marks it done.
  const requests = []; // [{ n, id, kind }]
  let requestN = 0;

  /** The folder of tutorial `id`: directly inside the tutorials folder, or a 400. */
  const dirOf = (raw) => {
    let id = '';
    try { id = decodeURIComponent(raw); } catch { /* bad escape */ }
    if (!ID.test(id) || RESERVED.has(id.toLowerCase())) throw new HttpError(400, 'bad id');
    const dir = path.resolve(home, id);
    if (path.dirname(dir) !== home || path.basename(dir) !== id) throw new HttpError(400, 'bad id');
    return dir;
  };
  const trashDir = path.join(home, TRASH);
  /** What is in the trash, newest first: { id, name (its title, when it had one), at, dir }. Only state files are read. */
  const trashed = () => {
    let names = [];
    try { names = fs.readdirSync(trashDir, { withFileTypes: true }); } catch { return []; }
    return names.map((d) => ({ d, m: d.isDirectory() && TRASHED.exec(d.name) })).filter((x) => x.m)
      .sort((a, b) => Number(b.m[2]) - Number(a.m[2]) || Number(b.m[3] ?? 1) - Number(a.m[3] ?? 1))
      .map(({ d, m }) => ({ id: m[1], name: readTutorial(path.join(trashDir, d.name))?.title || undefined, at: new Date(Number(m[2])).toISOString(), dir: path.join(trashDir, d.name) }));
  };
  /** Moves a folder within the tutorials folder (one volume: a rename, whole or not at all). Windows may hold a
   *  file in it for a moment: tried again a few times, then refused with the folder where it was. */
  const move = async (from, to) => {
    for (let attempt = 0; ; attempt++) {
      try { return fs.renameSync(from, to); } catch (e) {
        if (attempt >= 5 || !['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) throw new HttpError(500, `the folder could not be moved (${e.code ?? e.name}); it is where it was`);
        await new Promise((r) => setTimeout(r, 200));
      }
    }
  };
  const save = (dir, t) => writeTutorial(dir, t);
  /** The state of a tutorial that exists (404 otherwise). A stage left marked as running by a helper that has since
   *  stopped is turned into its failure. */
  const load = (dir) => {
    const t = readTutorial(dir) ?? adopt(dir);
    if (!t) throw new HttpError(404, 'no such tutorial');
    if (t.busy && !jobs.has(t.id)) return save(dir, transition(t, 'failed', { stage: t.busy, message: `the helper stopped during ${t.busy}` }));
    return t;
  };

  /** Starts a stage on a tutorial: marks it busy, runs `work(ctx)` in the background, and on its end writes
   *  `done(state, result)` or the failure. One stage at a time per tutorial (409). Resolves { ok, result | message }. */
  const begin = (dir, stage, work, done) => {
    const t = load(dir), id = t.id;
    if (t.busy || jobs.has(id)) throw new HttpError(409, `busy: ${t.busy ?? 'a stage is running'}`);
    let at = stage;
    save(dir, { ...transition(t, 'busy', { stage }), error: null });
    // (the transcriber is looked for when a stage starts, not when the helper did: setup may have put one in place since)
    const ctx = { dir, P: paths(dir), whisper: whisper ?? findTranscriber(), run: (spec) => runner(spec), setStage: (s) => { at = s; save(dir, transition(readTutorial(dir), 'busy', { stage: s })); },
      // where a long stage is, for the panel's bar; a note survives within one phase
      setProgress: (p) => { const now = readTutorial(dir); if (now) save(dir, { ...now, progress: { ...p, note: now.progress?.phase === p.phase ? now.progress.note : null, at: new Date().toISOString() } }); } };
    const job = (async () => {
      try {
        const result = await work(ctx);
        save(dir, done(readTutorial(dir), result));
        return { ok: true, result };
      } catch (e) {
        // only a StageError's words are kept: any other exception may quote what it was reading
        const message = e instanceof StageError ? e.message : `internal error (${e?.name ?? 'Error'}${e?.code ? ' ' + e.code : ''})`;
        try { save(dir, transition(readTutorial(dir), 'failed', { stage: at, message })); } catch { /* the folder is gone */ }
        return { ok: false, message };
      } finally { jobs.delete(id); }
    })();
    jobs.set(id, job);
    return job;
  };

  const server = http.createServer((req, res) => {
    handle(req, res).catch((e) => {
      const code = e instanceof HttpError ? e.code : 500;
      if (res.headersSent) return res.destroy();
      const body = JSON.stringify({ error: e instanceof HttpError ? e.message : `internal error (${e?.name ?? 'Error'})` });
      res.writeHead(code, { ...SAFE, 'content-type': 'application/json; charset=utf-8' }).end(body);
    });
  });

  async function handle(req, res) {
    const url = new URL(req.url, 'http://x'), me = server.address().port;
    // Addressed to this machine by name: a page on another site whose name was pointed at 127.0.0.1 is refused.
    if (![`127.0.0.1:${me}`, `localhost:${me}`].includes(String(req.headers.host ?? ''))) { req.resume(); return res.writeHead(403, SAFE).end('host'); }
    // Nothing of the helper is ever the content of a frame or an embedded object.
    if (['iframe', 'frame', 'embed', 'object'].includes(req.headers['sec-fetch-dest'])) { req.resume(); return res.writeHead(403, SAFE).end('frame'); }
    // Writes come only from the extension, from pages this helper serves, or from tools with no Origin (the panel,
    // the skill, tests). Any other web page is refused, and gets no CORS header to read a response with.
    // An Origin with no say here is refused and gets no CORS header to read a response with.
    //   - the recorder (the ONE extension whose id is ours, helper/extension-id.mjs; any other extension is a stranger):
    //     its own routes only: the health check, the heartbeat, and posting events, assets, microphone chunks and segments
    //   - this helper's own pages (the local page, the review player, the fixture): everything
    //   - no Origin at all (the panel's host-side fetch, the skill, command-line tools, tests): everything. Any program
    //     on this machine can do that; a 127.0.0.1 helper trusts the machine it runs on.
    const origin = req.headers.origin, extension = origin === `chrome-extension://${extensionId}`;
    const own = origin === `http://127.0.0.1:${me}` || origin === `http://localhost:${me}`;
    const recorderRoute = url.pathname === '/health' || url.pathname === '/recorder/ping' || /^\/session\/[^/]+\/(events|asset|audio|segments)$/.test(url.pathname);
    const allowed = !origin || own || (extension && recorderRoute);
    const head = (extra = {}) => ({ ...SAFE, ...(allowed && origin ? { ...CORS, 'access-control-allow-origin': origin } : {}), ...extra });
    const end = (code, text) => res.writeHead(code, head()).end(text);
    const json = (code, obj) => res.writeHead(code, head({ 'content-type': 'application/json; charset=utf-8' })).end(JSON.stringify(obj));
    if (!allowed) { req.resume(); return end(403, 'origin'); }
    if (req.method === 'OPTIONS') return end(204);
    if (url.pathname === '/health') return end(200, 'ok');
    // A page of another site that reaches here without an Origin (an image, a script tag, a plain GET) is refused
    // too; following a link to one of this helper's pages is not.
    const site = req.headers['sec-fetch-site'];
    if (site && site !== 'same-origin' && site !== 'none' && !(extension && recorderRoute) &&!(req.method === 'GET' && req.headers['sec-fetch-mode'] === 'navigate')) { req.resume(); return end(403, 'origin'); }
    const GET = req.method === 'GET', POST = req.method === 'POST', DELETE = req.method === 'DELETE';

    // ── the recorder ──
    const m = url.pathname.match(/^\/session\/([^/]+)\/(events|asset|audio|segments)$/);
    if (m && POST) {
      const body = await readBody(req, m[2] === 'events' ? EVENTS_CAP : m[2] === 'segments' ? JSON_CAP : CAP);
      const sdir = path.join(dirOf(m[1]), 'recording');
      if (!body) return end(413, 'too big');
      recorder.lastSeen = Date.now();
      if (m[2] === 'events') {
        try {
          const events = JSON.parse(body);
          fs.mkdirSync(sdir, { recursive: true });
          fs.appendFileSync(path.join(sdir, 'events.ndjson'), events.map((e) => JSON.stringify(e) + '\n').join(''));
          // the recorder says, with its events, how many pauses the recording has been resumed from: kept, so a
          // recording whose segments never arrive is not prepared as one stretch (pipeline.mjs scrubStep)
          const pauses = Number(url.searchParams.get('pauses'));
          if (Number.isInteger(pauses) && pauses > 0 && pauses <= 500) fs.writeFileSync(path.join(sdir, 'pauses.json'), JSON.stringify({ pauses }));
          return end(200, 'ok');
        } catch { return end(400, 'bad json'); }
      }
      if (m[2] === 'audio') {
        // chunks arrive in order (the mic page sends one at a time); seq 0 starts the file and records its clock time
        const seq = Number(url.searchParams.get('seq') ?? NaN);
        const t0 = Number(url.searchParams.get('t0') ?? NaN);
        if (!Number.isInteger(seq) || seq < 0 || (seq === 0 && !Number.isFinite(t0))) return end(400, 'bad seq or t0');
        fs.mkdirSync(sdir, { recursive: true });
        if (seq === 0) {
          fs.writeFileSync(path.join(sdir, 'mic.webm'), body);
          fs.writeFileSync(path.join(sdir, 'mic.json'), JSON.stringify({ t0 }));
        } else fs.appendFileSync(path.join(sdir, 'mic.webm'), body);
        return end(200, 'ok');
      }
      if (m[2] === 'segments') {
        // a recording with pauses: the stretches of wall-clock time it was running, sent at stop (tools/segments.mjs)
        let j;
        try { j = JSON.parse(body.toString('utf8')); } catch { return end(400, 'bad json'); }
        const list = Array.isArray(j?.segments) ? j.segments : null;
        if (!list || list.length > 500 || !list.every((s) => s && Number.isFinite(s.from) && (s.to === null || Number.isFinite(s.to)))) return end(400, 'segments: a list of { from, to }');
        fs.mkdirSync(sdir, { recursive: true });
        fs.writeFileSync(path.join(sdir, 'segments.json'), JSON.stringify({ segments: list.map((s) => ({ from: s.from, to: s.to })) }));
        return end(200, 'ok');
      }
      // asset: the url is only a map key and the source of the file extension; it never becomes a path
      const src = url.searchParams.get('url') ?? '';
      let ext;
      try {
        const u = new URL(src);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('scheme');
        ext = path.posix.extname(u.pathname).toLowerCase();
      } catch { return end(400, 'bad url'); }
      const file = crypto.createHash('sha1').update(body).digest('hex').slice(0, 16) + (/^\.[a-z0-9]{1,5}$/.test(ext) ? ext : '.bin');
      fs.mkdirSync(path.join(sdir, 'assets'), { recursive: true });
      if (!fs.existsSync(path.join(sdir, 'assets', file))) fs.writeFileSync(path.join(sdir, 'assets', file), body);
      const mapFile = path.join(sdir, 'assets.json');
      const map = fs.existsSync(mapFile) ? JSON.parse(fs.readFileSync(mapFile, 'utf8')) : {};
      map[src] = { file, type: req.headers['content-type'] ?? 'application/octet-stream' };
      fs.writeFileSync(mapFile, JSON.stringify(map, null, 1));
      return end(200, 'ok');
    }
    if (url.pathname === '/recorder/ping' && POST) { req.resume(); recorder.lastSeen = Date.now(); return json(200, { ok: true }); }
    if (url.pathname === '/recorder/install' && POST) {
      // the extension folder, copied whole (vendor included) so Chrome's "Load unpacked" is pointed at a plain folder
      req.resume();
      const from = path.join(ROOT, 'extension'), to = path.join(home, 'Recorder');
      if (!fs.existsSync(path.join(from, 'manifest.json'))) throw new HttpError(500, 'the recorder files are missing from the plugin');
      fs.rmSync(to, { recursive: true, force: true });
      fs.cpSync(from, to, { recursive: true, filter: (p) => !/\.test\.mjs$/.test(p) });
      return json(200, { ok: true, dir: to, hasVendor: fs.existsSync(path.join(to, 'vendor', 'rrweb.js')) });
    }

    // ── first-run setup: what is missing, and the one press that fetches it ──
    // ponytail: the state is read from the disk at every poll (a few dozen file checks); cache it if a poll ever shows in a profile
    if (url.pathname === '/setup' && GET) return json(200, setupState(setupCtx, setupJob));
    if (url.pathname === '/setup' && POST) {
      // asked by the panel only: no page, ours included, starts downloads
      req.resume();
      if (origin) throw new HttpError(403, 'origin');
      if (setupJob.running) throw new HttpError(409, 'setup is running');
      setupJob.running = true;
      setupJob.last = null;
      setupJob.ended = runSetup(setupCtx, (s) => { setupJob.last = s; })
        .catch(() => { setupJob.last = { step: null, state: 'failed', label: 'Set up', pct: 0, note: 'Setup stopped on an unexpected fault.' }; })
        .finally(() => { setupJob.running = false; });
      return json(202, { ok: true, running: true });
    }

    // ── tutorials ──
    if (url.pathname === '/tutorials' && GET) {
      const tutorials = listTutorials(home).map((t) => (t.busy && !jobs.has(t.id) ? load(path.join(home, t.id)) : t));
      return json(200, { tutorials, recorder, brands: pipeline.brandNames(brands), home, requests, trashed: trashed().map(({ id, name, at }) => ({ id, name, at })), setup: setupState(setupCtx, setupJob) });
    }
    const done = url.pathname.match(/^\/requests\/(\d+)\/done$/);
    if (done && POST) {
      req.resume();
      const i = requests.findIndex((r) => r.n === Number(done[1]));
      if (i < 0) throw new HttpError(404, 'no such request');
      requests.splice(i, 1);
      return json(200, { ok: true });
    }
    const one = url.pathname.match(/^\/tutorials\/([^/]+)(?:\/([a-z]+))?$/);
    if (one) {
      const dir = dirOf(one[1]), what = one[2] ?? '', P = paths(dir);
      if (!what && GET) return json(200, { ...load(dir), dir });
      if (!what && DELETE) {
        // the whole folder, raw recording included, into the trash: nothing is read and nothing removed. Refused while a stage runs.
        req.resume();
        const t = load(dir);
        if (t.busy || jobs.has(t.id)) throw new HttpError(409, `busy: ${t.busy ?? 'a stage is running'}`);
        fs.mkdirSync(trashDir, { recursive: true });
        const stamp = `${t.id}-${Date.now()}`;
        let to = path.join(trashDir, stamp);
        for (let n = 2; fs.existsSync(to); n++) to = path.join(trashDir, `${stamp}.${n}`);
        await move(dir, to);
        reviews.delete(dir);
        for (let i = requests.length; i--;) if (requests[i].id === t.id) requests.splice(i, 1); // nothing is asked for a tutorial that is gone
        return json(200, { ok: true, id: t.id, trashed: path.basename(to) });
      }
      if (what === 'restore' && POST) {
        // the newest copy in the trash, back where it was. Asked by the panel or the skill only: no page, ours included.
        req.resume();
        if (origin) throw new HttpError(403, 'origin');
        if (fs.existsSync(dir)) throw new HttpError(409, 'a tutorial with this id is there already');
        const copy = trashed().find((x) => x.id === path.basename(dir));
        if (!copy) throw new HttpError(404, 'nothing in the trash under this id');
        await move(copy.dir, dir);
        return json(200, { ...load(dir), dir });
      }

      if (what === 'state' && POST) {
        const body = await jsonBody(req);
        let t = load(dir);
        if (t.busy) throw new HttpError(409, `busy: ${t.busy}`);
        const extra = {};
        if (body.title !== undefined) {
          if (typeof body.title !== 'string' || !body.title.trim() || body.title.length > 120) throw new HttpError(400, 'title: a string of 120 characters at most');
          extra.title = body.title.replace(/[\u0000-\u001f]/g, ' ').trim();
        }
        if (body.brand !== undefined) {
          if (body.brand !== null && !pipeline.brandNames(brands).includes(body.brand)) throw new HttpError(400, 'no such brand');
          extra.brand = body.brand;
        }
        if (body.archived !== undefined) { // put away, or brought back: a flag, so a tutorial at any step keeps its place
          if (typeof body.archived !== 'boolean') throw new HttpError(400, 'archived: true or false');
          extra.archived = body.archived;
        }
        if (body.event !== undefined) {
          if (!CALLER_EVENTS.has(body.event)) throw new HttpError(400, `unknown event ${String(body.event).slice(0, 40)}`);
          try { t = { ...transition(t, body.event), ...extra }; } catch (e) { throw new HttpError(400, e.message); }
        } else if (Object.keys(extra).length) t = { ...t, ...extra, updatedAt: new Date().toISOString() };
        else throw new HttpError(400, 'nothing to do: give an event, a title, a brand or archived');
        return json(200, save(dir, t));
      }

      if (what === 'prepare' && POST) {
        req.resume();
        const t = load(dir);
        if (t.state !== 'recorded') throw new HttpError(409, `prepare from ${t.state}`);
        save(dir, { ...t, flags: { ...t.flags, noMic: noMic(dir) }, sweep: null });
        begin(dir, 'prepare', (ctx) => pipeline.prepareStage(ctx), (s) => transition(s, 'prepared'));
        return json(202, { ok: true, busy: 'prepare' });
      }
      if (what === 'transcribe' && POST) { // the transcript alone: after "transcriber not found", once it is installed
        req.resume();
        const t = load(dir);
        if (t.state !== 'recorded') throw new HttpError(409, `transcribe from ${t.state}`);
        if (!fs.existsSync(P.manifest)) throw new HttpError(409, 'not prepared yet');
        begin(dir, 'transcribe', (ctx) => pipeline.transcribeStage(ctx), (s) => transition(s, 'prepared'));
        return json(202, { ok: true, busy: 'transcribe' });
      }
      if (what === 'rules' && POST) {
        const body = await jsonBody(req);
        load(dir);
        if (!fs.existsSync(P.manifest)) throw new HttpError(409, 'not prepared yet');
        let add;
        try { add = pipeline.checkRules(body); } catch (e) { throw new HttpError(400, e.message); }
        // the scrub runs again over the whole recording; what was measured from the old clean copy is stale after it
        const r = await begin(dir, 'prepare', (ctx) => pipeline.rulesStage(ctx, add), (s) => ({ ...s, busy: null, error: null, sweep: null, updatedAt: new Date().toISOString() }));
        if (!r.ok) throw new HttpError(500, r.message);
        return json(200, r.result);
      }
      if (what === 'elements' && GET) {
        load(dir);
        const q = (k) => (url.searchParams.has(k) ? Number(url.searchParams.get(k)) : undefined), screen = q('screen');
        if (!Number.isInteger(screen) || screen < 0 || screen > 9999) throw new HttpError(400, 'screen: a number');
        const data = readJson(path.join(P.clean, `screen-${screen}.json`));
        if (!data?.node) throw new HttpError(fs.existsSync(P.manifest) ? 404 : 409, fs.existsSync(P.manifest) ? 'no such screen' : 'not prepared yet');
        const boxes = readJson(P.layout)?.[screen]?.boxes ?? null, r = { x: q('x'), y: q('y'), w: q('w'), h: q('h') };
        const region = Object.values(r).some((v) => v !== undefined) ? r : null;
        if (region && !Object.values(region).every(Number.isFinite)) throw new HttpError(400, 'region: x, y, w and h, all numbers');
        if (region && !boxes) throw new HttpError(409, 'this screen was not measured (no click or gesture on it): ask without a region');
        // text comes from the CLEAN tree only (tools/scrub.mjs elementsIn), 40 characters at most per element
        const { elementsIn } = await import('../tools/scrub.mjs');
        const all = elementsIn(data.node, boxes, region);
        return json(200, { screen, measured: !!boxes, count: all.length, elements: all.slice(0, 500) });
      }

      // ── narration: the local page, the upload, the comparison and the timing ──
      if (what === 'page' && GET) {
        load(dir);
        const page = fs.readFileSync(path.join(ROOT, 'helper', 'page', 'narration.html'));
        return res.writeHead(200, head({ 'content-type': TYPES['.html'], 'content-security-policy': PAGE_CSP })).end(page);
      }
      if (what === 'narration' && GET) {
        const t = load(dir);
        return json(200, await pipeline.narrationView(P, t, pipeline.resolveBrand(t, pipeline.readBrands(brands))));
      }
      if (what === 'narration' && POST) {
        // the audio itself is the body; its type is the Content-Type header. Nothing of the request names a file.
        const refuse = (code, message) => { req.resume(); throw new HttpError(code, message); };
        const ext = pipeline.AUDIO[String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase()];
        if (!ext) refuse(415, 'send the audio file as the body, with its audio type as Content-Type');
        if (Number(req.headers['content-length']) > pipeline.NARRATION_CAP) refuse(413, 'too big (50 MB at most)');
        const t = load(dir);
        if (t.busy) refuse(409, `busy: ${t.busy}`);
        if (!['approved', 'voiced'].includes(t.state)) refuse(409, `narration from ${t.state}`);
        if (!(await pipeline.scriptOf(P)).length) refuse(409, 'no script yet');
        const body = await readBody(req, pipeline.NARRATION_CAP);
        if (!body) throw new HttpError(413, 'too big (50 MB at most)');
        if (!body.length) throw new HttpError(400, 'empty');
        if (t.state === 'voiced') save(dir, transition(t, 'revoice')); // a new take: voiced again only if it compares well
        fs.mkdirSync(P.narration, { recursive: true });
        for (const f of fs.readdirSync(P.narration)) if (/^upload\.[a-z0-9]+$/.test(f)) fs.rmSync(path.join(P.narration, f), { force: true });
        const upload = path.join(P.narration, `upload.${ext}`);
        fs.writeFileSync(upload, body);
        begin(dir, 'transcribe', (ctx) => pipeline.narrationStage(ctx, upload), (s, r) => (r.ok ? transition(s, 'voiced')
          : transition(s, 'failed', { stage: 'time', message: [r.differs && `${r.differs} line${r.differs === 1 ? '' : 's'} differ${r.differs === 1 ? 's' : ''} from the script`, r.missing && `${r.missing} not spoken`].filter(Boolean).join(', ') })));
        return json(202, { ok: true, busy: 'transcribe' });
      }
      if (what === 'time' && POST) { // time the take there is: after the author accepts a take that differs, and again once there is a beat file
        req.resume();
        const t = load(dir);
        if (!['approved', 'voiced', 'built'].includes(t.state)) throw new HttpError(409, `time from ${t.state}`);
        if (!fs.existsSync(path.join(P.narration, 'narration.json'))) throw new HttpError(409, 'no narration yet');
        begin(dir, 'time', (ctx) => pipeline.timeStage(ctx), (s) => (s.state === 'approved' ? transition(s, 'voiced') : { ...s, busy: null, error: null, updatedAt: new Date().toISOString() }));
        return json(202, { ok: true, busy: 'time' });
      }

      // ── build: measure, stills, sweep, render (each a stage in the background; the result is in the state file) ──
      if (['measure', 'stills', 'sweep', 'render'].includes(what) && POST) {
        const body = what === 'stills' ? await jsonBody(req) : (req.resume(), {});
        const t = load(dir);
        if (!['voiced', 'built'].includes(t.state)) throw new HttpError(409, `${what} from ${t.state}`);
        if (!fs.existsSync(P.manifest)) throw new HttpError(409, 'not prepared yet');
        if (what !== 'sweep' && !fs.existsSync(P.beats)) throw new HttpError(409, 'no beat file yet');
        const keep = (s, more = {}) => ({ ...s, ...more, busy: null, error: null, updatedAt: new Date().toISOString() });
        if (what === 'measure') begin(dir, 'measure', (ctx) => pipeline.measureStage(ctx), (s) => keep(s, { sweep: null }));
        if (what === 'stills') {
          const frames = body.frames ?? [], every = body.every ?? 0;
          if (!Array.isArray(frames) || frames.length > 240 || !frames.every((n) => Number.isInteger(n) && n >= 0 && n < 1e6)) throw new HttpError(400, 'frames: a list of frame numbers (240 at most)');
          if (!Number.isInteger(every) || every < 0 || (every > 0 && every < 5)) throw new HttpError(400, 'every: a whole number of frames, 5 or more');
          if (!frames.length && !body.moments && !every) throw new HttpError(400, 'which frames: give frames, moments: true, or every');
          begin(dir, 'stills', (ctx) => pipeline.stillsStage(ctx, { frames, moments: body.moments === true, every }), (s) => keep(s));
        }
        if (what === 'sweep') {
          begin(dir, 'sweep', (ctx) => pipeline.sweepStage(ctx), (s, r) => {
            const sweep = { ok: r.ok, fails: r.fails, at: new Date().toISOString() };
            return r.ok ? keep(s, { sweep }) : { ...transition(s, 'failed', { stage: 'sweep', message: `sweep failed: ${r.fails} place${r.fails === 1 ? '' : 's'} (out/sweep.txt names them by node)` }), sweep };
          });
        }
        if (what === 'render') {
          // nothing is rendered that the sweep has not passed as it stands
          if (!t.sweep) throw new HttpError(409, 'sweep first');
          if (!t.sweep.ok) throw new HttpError(409, 'sweep failed');
          if (pipeline.sweepIsStale(P, t.sweep)) throw new HttpError(409, 'sweep again: the film changed since it passed');
          begin(dir, 'render', (ctx) => pipeline.renderStage(ctx), (s, r) => ({ ...transition(s, s.state === 'voiced' ? 'built' : 'rebuilt'), renders: [...s.renders.filter((f) => f !== r.file), r.file], length: r.seconds ?? s.length }));
        }
        return json(202, { ok: true, busy: what });
      }
      if (what === 'progress' && POST) {
        // the skill and the stager report the build's phases; the helper's own stages write this field themselves
        const body = await jsonBody(req);
        const t = load(dir);
        if (body.clear === true) return json(200, save(dir, { ...t, progress: null, updatedAt: new Date().toISOString() }));
        let p;
        try { p = progressOf(body.phase, { pass: body.pass, fraction: body.fraction }); } catch (e) { throw new HttpError(400, e.message); }
        const note = body.note == null ? null : String(body.note).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 120) || null;
        return json(200, save(dir, { ...t, progress: { ...p, note, at: new Date().toISOString() }, updatedAt: new Date().toISOString() }));
      }
      throw new HttpError(404, 'not found');
    }

    // ── brands (a folder each under the brands folder; the plugin itself holds none) ──
    if (url.pathname === '/brands' && GET) return json(200, { brands: pipeline.brandNames(brands) });
    if (url.pathname === '/brands/resolve' && POST) {
      const body = await jsonBody(req);
      const dir = dirOf(encodeURIComponent(String(body.id ?? ''))), t = load(dir);
      if (t.busy) throw new HttpError(409, `busy: ${t.busy}`);
      let done; // (a `lastBySite` key in the body, as older callers sent, is ignored: a site picks no brand)
      try { done = pipeline.applyBrand(paths(dir), brands, pipeline.resolveBrand(t, pipeline.readBrands(brands))); } catch (e) { throw new HttpError(e instanceof StageError ? 409 : 500, e instanceof StageError ? e.message : 'could not copy the brand'); }
      return json(200, done);
    }

    // ── the local page's own files, and the review player (tools/review, as it is), one per tutorial ──
    const pageFile = GET && url.pathname.match(/^\/page\/(.+)$/);
    if (pageFile) {
      const file = fileInside(path.join(ROOT, 'helper', 'page'), pageFile[1]);
      if (!file || !TYPES[path.extname(file)]) return end(404);
      return res.writeHead(200, head({ 'content-type': TYPES[path.extname(file)] })).end(fs.readFileSync(file));
    }
    if (url.pathname === '/review/' || url.pathname === '/review') {
      const dir = dirOf(encodeURIComponent(url.searchParams.get('tutorial') ?? ''));
      load(dir);
      req.resume();
      return res.writeHead(302, head({ location: `/review/${path.basename(dir)}/` })).end();
    }
    const rev = url.pathname.match(/^\/review\/([^/]+)(\/.*)?$/);
    if (rev) {
      const dir = dirOf(rev[1]);
      load(dir);
      if (!rev[2]) { req.resume(); return res.writeHead(302, head({ location: `/review/${path.basename(dir)}/` })).end(); }
      // the page's two buttons, answered here (the tool itself knows nothing of tutorials or the session)
      if (rev[2] === '/api/send' && POST) {
        req.resume();
        const t = load(dir);
        let r = requests.find((x) => x.id === t.id && x.kind === 'notes');
        if (!r) { r = { n: ++requestN, id: t.id, kind: 'notes' }; requests.push(r); }
        return json(200, { ok: true, request: r });
      }
      if (rev[2] === '/api/approve' && POST) {
        req.resume();
        let t = load(dir);
        try { t = transition(t, 'reviewed'); } catch (e) { throw new HttpError(400, e.message); }
        return json(200, save(dir, t));
      }
      if (rev[2] === '/api/tutorial' && GET) { // what the page says of the tutorial: its title, its state, the film's length
        req.resume();
        const t = load(dir);
        return json(200, { id: t.id, title: t.title, state: t.state, length: t.length ?? null, renders: t.renders });
      }
      // the tool sees its own paths (/, /api/..., /video); it serves videos from <tutorial>/out and notes from <tutorial>/review only
      req.url = rev[2] + url.search;
      // set before handing over: the tool's own writeHead adds its headers to these and takes none away
      for (const [k, v] of Object.entries({ ...SAFE, 'content-security-policy': REVIEW_CSP })) if (k !== 'cache-control') res.setHeader(k, v);
      return (await reviewOf(dir)).handle(req, res);
    }

    // ── the plugin's own pages (the fixture site the recorder is tested on, the recorder's scripts, the kit's font) ──
    const stat = GET && url.pathname.match(/^\/(fixture|recorder|vendor|kit)\/(.+)$/);
    if (stat) {
      const base = { fixture: path.join(ROOT, 'fixtures', 'site'), recorder: path.join(ROOT, 'recorder'), vendor: path.join(ROOT, 'extension', 'vendor'), kit: path.join(ROOT, 'film', 'public', 'kit') }[stat[1]];
      const file = fileInside(base, stat[2]);
      if (!file) return end(404);
      return res.writeHead(200, head({ 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' })).end(fs.readFileSync(file));
    }
    req.resume();
    return end(404);
  }

  return new Promise((resolve, reject) => server.once('error', reject).listen(port, '127.0.0.1', () => resolve({
    port: server.address().port, home,
    /** resolves when no stage is running on `id` (tests) */
    idle: (id) => jobs.get(id) ?? Promise.resolve(),
    close: async () => { await Promise.all([...jobs.values(), setupJob.ended]); server.closeAllConnections?.(); await new Promise((r) => server.close(r)); },
  })));
}

// Compared as real paths: Node resolves this module's own address through links, but not the path it was started
// with, so a plugin folder reached through a link (a linked install, a dev folder) would otherwise start nothing.
const real = (p) => { try { return fs.realpathSync(p); } catch { return p; } };
if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) {
  // tools/prepare-recording.mjs and tools/scrub.mjs import a .ts file: the helper needs Node's type stripping
  if (!process.features?.typescript && !process.execArgv.includes('--experimental-strip-types')) {
    console.error('rostrum helper: start it with type stripping on:\n  node --experimental-strip-types helper/server.mjs   (or: npm run helper)');
    process.exit(1);
  }
  const arg = (name) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : undefined; };
  const home = arg('--tutorials') ?? defaultHome();
  const server = await start({ port: Number(arg('--port') ?? process.env.ROSTRUM_PORT ?? 4600), home, brands: arg('--brands') ?? path.join(home, 'Brands'), whisper: arg('--whisper') ?? null });
  console.log(`rostrum helper on http://127.0.0.1:${server.port}\n  tutorials: ${server.home}`);
}
