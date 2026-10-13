#!/usr/bin/env node
// tools/review/server.mjs: the Rostrum review store. Notes pinned to moments of a tutorial's rendered versions
// (<tutorial>/out/v<n>.mp4), one JSON per video file plus a regenerated NOTES.md and a frame per note, and the routes
// the review page (index.html, review.css, review.js, model.mjs beside this file) talks to.
//
// The Rostrum helper serves it per tutorial under /review/<id>/ (createReview: root = the tutorial folder, notes = its
// review/ folder) and adds the routes that know of tutorials: api/tutorial, api/send, api/approve.
// Lineage: the review tool of the explainer film (Oct 2026), without its chapter context and sidebar.
// No dependencies. ffprobe / ffmpeg (tools/bin.mjs: the bundled build, else PATH) are optional: without them
// durations and frame PNGs are skipped.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { statusLabel, versionsOf, cleanRegion } from './model.mjs';
import { ffbin } from '../bin.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const VIDEO_DIRS = ['out']; // top level only: the rendered versions (out/v<n>.mp4)
const VIDEO_TYPES = { '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime' };
const PAGE_FILES = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/review.css': ['review.css', 'text/css; charset=utf-8'],
  '/review.js': ['review.js', 'text/javascript; charset=utf-8'],
  '/model.mjs': ['model.mjs', 'text/javascript; charset=utf-8'], // review.js imports it: the page's tested parts
};

/** One review tool over one folder: `root` holds the video directories (`out`), `notes` is where its notes live
 *  (default <root>/review-notes/user-api-key, as when run on the repo). Returns { handle(req, res) }: the whole
 *  request handler, which the Rostrum helper serves per tutorial (root = the tutorial folder, notes = its review/
 *  folder). */
export function createReview({ root, notes }) {
const ROOT = path.resolve(root);
const NOTES_DIR = notes ? path.resolve(notes) : path.join(ROOT, 'review-notes', 'user-api-key');
const FRAMES_DIR = path.join(NOTES_DIR, 'frames');
const FILM_FPS = 30;
const MAX_BODY = 64 * 1024;
const MAX_TEXT = 5000;
const STATUSES = ['open', 'done', 'wontfix'];
const FIXED_IN = /^v\d{1,4}$/;

// ─── paths ────────────────────────────────────────────────────────────────────────────────────────

class HttpError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

/** A request's `video` value -> { rel, abs, stat }, or throws 400/404. Only <allowed dir>/<file>.<video ext>. */
function resolveVideo(input) {
  if (typeof input !== 'string' || !input || input.length > 300 || input.includes('\0')) throw new HttpError(400, 'bad video path');
  const rel = input.replace(/\\/g, '/');
  if (rel.startsWith('/') || /^[a-zA-Z]:/.test(rel) || path.isAbsolute(rel)) throw new HttpError(400, 'bad video path');
  const parts = rel.split('/');
  if (parts.some((p) => p === '' || p === '.' || p === '..')) throw new HttpError(400, 'bad video path');
  const dir = parts.slice(0, -1).join('/');
  if (!VIDEO_DIRS.includes(dir)) throw new HttpError(400, 'not an allowed directory');
  if (!VIDEO_TYPES[path.extname(rel).toLowerCase()]) throw new HttpError(400, 'not a video file');
  const abs = path.join(ROOT, ...parts);
  const back = path.relative(ROOT, abs);
  if (back.startsWith('..') || path.isAbsolute(back)) throw new HttpError(400, 'bad video path');
  let stat;
  try {
    stat = fs.statSync(abs);
    // a link inside an allowed directory must not lead out of the repo
    const real = path.relative(fs.realpathSync(ROOT), fs.realpathSync(abs));
    if (real.startsWith('..') || path.isAbsolute(real)) throw new HttpError(400, 'bad video path');
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(404, 'no such video');
  }
  if (!stat.isFile()) throw new HttpError(404, 'no such video');
  return { rel, abs, stat };
}

const noteFileFor = (rel) => path.join(NOTES_DIR, rel.replace(/\//g, '__') + '.json');

// ─── ffprobe / ffmpeg ─────────────────────────────────────────────────────────────────────────────

/** Runs a program with an argument list (no shell) and resolves its stdout, or null on any failure. */
function run(cmd, args, { timeout = 20000, maxOut = 64 * 1024 * 1024 } = {}) {
  return new Promise((resolve) => {
    let child;
    try { child = spawn(cmd, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return resolve(null); }
    const chunks = [];
    let size = 0;
    const timer = setTimeout(() => child.kill(), timeout);
    child.stdout.on('data', (c) => { size += c.length; if (size <= maxOut) chunks.push(c); else child.kill(); });
    child.on('error', () => { clearTimeout(timer); resolve(null); });
    child.on('close', (code) => { clearTimeout(timer); resolve(code === 0 && size <= maxOut ? Buffer.concat(chunks) : null); });
  });
}

/** Runs at most `limit` of the queued jobs at once (ffprobe over a directory, ffmpeg frame grabs). */
function limiter(limit) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= limit || !queue.length) return;
    active++;
    const { job, resolve } = queue.shift();
    job().then(resolve, () => resolve(null)).finally(() => { active--; next(); });
  };
  return (job) => new Promise((resolve) => { queue.push({ job, resolve }); next(); });
}
const probeSlot = limiter(6);
const frameSlot = limiter(2);

const probeCache = new Map(); // rel -> { key, duration, fps, start }
function probe(rel, abs, stat) {
  const key = stat.mtimeMs + ':' + stat.size;
  const hit = probeCache.get(rel);
  if (hit && hit.key === key) return Promise.resolve(hit);
  return probeSlot(async () => {
    const out = await run(ffbin('ffprobe'), ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=r_frame_rate,start_time:format=duration', '-of', 'json', abs], { timeout: 8000 });
    let duration = null;
    let fps = null;
    let start = 0; // when the first video frame shows: some encodes do not start the picture at 0
    try {
      const j = JSON.parse(out.toString('utf8'));
      const d = Number(j.format?.duration);
      if (Number.isFinite(d) && d > 0) duration = d;
      const [n, m] = String(j.streams?.[0]?.r_frame_rate ?? '').split('/').map(Number);
      if (n > 0 && m > 0 && n / m <= 240) fps = Math.round((n / m) * 1000) / 1000;
      const st = Number(j.streams?.[0]?.start_time);
      if (st > 0 && st < 1) start = st;
    } catch { /* ffprobe missing, or the file is still being written: try again when it changes */ }
    const entry = { key, duration, fps, start };
    if (duration !== null) probeCache.set(rel, entry);
    return entry;
  });
}

/**
 * PNG of frame round(time * fps), optionally with a region outlined. `time` counts from the first video frame
 * (`start` = that frame's timestamp in the file); ffmpeg gives the first frame at or after -ss, so aim half a frame early.
 */
function grabFrame(abs, time, fps, region, start = 0) {
  const ss = Math.max(0, start + time - 0.5 / fps);
  const args = (box) => ['-v', 'error', '-ss', ss.toFixed(5), '-i', abs, '-frames:v', '1', ...box, '-f', 'image2pipe', '-vcodec', 'png', '-'];
  const outline = region ? ['-vf', `drawbox=x=iw*${region.x}:y=ih*${region.y}:w=iw*${region.w}:h=ih*${region.h}:color=0xFFB020@0.95:t=5`] : null;
  // the outline needs drawbox, which only a full ffmpeg (PATH) has: where there is none the frame is grabbed plain
  // by the bundled build, and the note's `region` still says where
  return frameSlot(async () => (outline && (await run('ffmpeg', args(outline), { timeout: 30000 }))) || run(ffbin('ffmpeg'), args([]), { timeout: 30000 }));
}

function saveNoteFrame(note) {
  Promise.resolve()
    .then(() => {
      const { rel, abs, stat } = resolveVideo(note.video);
      return probe(rel, abs, stat).then((p) => grabFrame(abs, note.time, note.fps, note.region, p?.start ?? 0));
    })
    .then((png) => {
      if (!png || !png.length) return;
      fs.mkdirSync(FRAMES_DIR, { recursive: true });
      const file = path.join(FRAMES_DIR, note.id + '.png');
      atomicWrite(file, png);
      return serial(() => {
        if (readNotes(note.video).some((n) => n.id === note.id)) regenerateNotesMd(); // so NOTES.md lists the frame file
        else fs.unlinkSync(file); // the note was deleted while ffmpeg ran
      });
    })
    .catch(() => {}); // a frame grab must never matter to the note
}

// ─── notes store ──────────────────────────────────────────────────────────────────────────────────

function atomicWrite(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tmp, data);
  for (let attempt = 0; ; attempt++) {
    try { fs.renameSync(tmp, file); return; } catch (e) {
      // Windows: an editor or scanner can hold the target for a moment
      if (attempt >= 5 || !['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) { try { fs.unlinkSync(tmp); } catch { /* leave it */ } throw e; }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 40 * (attempt + 1));
    }
  }
}

/** Notes of one video. A missing file is an empty list; an unreadable one THROWS (never overwrite what we can't parse). */
function readNotes(rel) {
  let raw;
  try { raw = fs.readFileSync(noteFileFor(rel), 'utf8'); } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
  let j;
  try { j = JSON.parse(raw); } catch { throw new HttpError(500, `notes file for ${rel} is not valid JSON; fix it by hand: ${noteFileFor(rel)}`); }
  if (!j || !Array.isArray(j.notes)) throw new HttpError(500, `notes file for ${rel} has no "notes" list: ${noteFileFor(rel)}`);
  return j.notes;
}

function writeNotes(rel, notes) {
  notes.sort((a, b) => a.time - b.time || String(a.createdAt).localeCompare(String(b.createdAt)));
  atomicWrite(noteFileFor(rel), JSON.stringify({ video: rel, notes }, null, 2) + '\n');
}

/** Every note file: [{ rel, notes }]. Unreadable files are skipped here (they still block writes to themselves). */
function readAllNotes() {
  let names = [];
  try { names = fs.readdirSync(NOTES_DIR); } catch { return []; }
  const all = [];
  for (const name of names) {
    if (!name.endsWith('.json') || name.startsWith('.')) continue;
    try {
      const j = JSON.parse(fs.readFileSync(path.join(NOTES_DIR, name), 'utf8'));
      if (j && typeof j.video === 'string' && Array.isArray(j.notes)) all.push({ rel: j.video, notes: j.notes });
    } catch { /* skip */ }
  }
  return all;
}

function newId(taken) {
  for (;;) {
    const id = Math.random().toString(36).slice(2, 8).padEnd(6, '0');
    if (!taken.has(id)) return id;
  }
}

function cleanText(v, name, { required = false } = {}) {
  if (typeof v !== 'string') throw new HttpError(400, `${name} must be a string`);
  const text = v.replace(/\r\n/g, '\n').trim();
  if (text.length > MAX_TEXT) throw new HttpError(400, `${name} is too long (max ${MAX_TEXT} characters)`);
  if (required && !text) throw new HttpError(400, `${name} is empty`);
  return text;
}
const regionFrom = (v) => { try { return cleanRegion(v); } catch (e) { throw new HttpError(400, e.message); } };
const pct = (n) => `${Math.round(n * 1000) / 10}%`;

// ─── NOTES.md ─────────────────────────────────────────────────────────────────────────────────────

/** m:ss.ff, ff = frame within the second. */
function timecode(time, fps) {
  const f = Math.round(time * fps);
  const perSec = Math.round(fps);
  const s = Math.floor(f / perSec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}.${String(f % perSec).padStart(2, '0')}`;
}
const quote = (text, indent = '') => text.split('\n').map((l) => indent + '> ' + l).join('\n');

function regenerateNotesMd() {
  const all = readAllNotes().filter((v) => v.notes.length);
  all.sort((a, b) => a.rel.localeCompare(b.rel, 'en', { numeric: true }));
  const total = all.reduce((n, v) => n + v.notes.length, 0);
  const open = all.reduce((n, v) => n + v.notes.filter((x) => x.status === 'open').length, 0);
  const lines = [
    '# Review notes',
    '',
    `Generated by tools/review/server.mjs on ${new Date().toISOString()}. Do not edit: it is rewritten on every change.`,
    'The source of truth is the JSON file per video in this folder (see tools/review/README.md).',
    '',
    `${total} note${total === 1 ? '' : 's'}, ${open} open. In brackets is the stored status; after it, the words the page shows. Times are m:ss.ff in the named video file (ff = frame within the second).`,
    '',
  ];
  if (!all.length) lines.push('No notes yet.', '');
  for (const { rel, notes } of all) {
    let mtime = null;
    try { mtime = fs.statSync(path.join(ROOT, ...rel.split('/'))).mtimeMs; } catch { /* video gone */ }
    const sorted = [...notes].sort((a, b) => a.time - b.time);
    lines.push(`## ${rel}`, '', `${sorted.length} note${sorted.length === 1 ? '' : 's'}, ${sorted.filter((n) => n.status === 'open').length} open.${mtime === null ? ' The video file no longer exists.' : ''}`, '');
    for (const n of sorted) {
      const fps = n.fps || FILM_FPS;
      lines.push(`### ${timecode(n.time, fps)} (frame ${n.frame}) [${n.status}] ${statusLabel(n)}, id ${n.id}`, '', quote(n.text || '(no text)'), '');
      if (n.fixedIn) lines.push(`- Fixed in: ${n.fixedIn}`);
      if (n.region) lines.push(`- Region: x ${pct(n.region.x)}, y ${pct(n.region.y)}, width ${pct(n.region.w)}, height ${pct(n.region.h)} (of the frame, from its top-left corner)`);
      if (fs.existsSync(path.join(FRAMES_DIR, n.id + '.png'))) lines.push(`- Frame: frames/${n.id}.png${n.region ? ' (the region is outlined)' : ''}`);
      if (mtime !== null && typeof n.videoMtime === 'number' && mtime > n.videoMtime + 1) lines.push('- Stale: the video file was re-rendered after this note was made; check it still applies.');
      if (n.reply) lines.push('- Reply:', '', quote(n.reply, '  '));
      lines.push('');
    }
  }
  atomicWrite(path.join(NOTES_DIR, 'NOTES.md'), lines.join('\n'));
}

/** NOTES.md is rewritten on every API change; this also catches JSON edited by hand (an assistant setting `reply`). */
function refreshNotesMdIfStale() {
  try {
    let md = -1;
    try { md = fs.statSync(path.join(NOTES_DIR, 'NOTES.md')).mtimeMs; } catch { /* none yet */ }
    const names = fs.readdirSync(NOTES_DIR).filter((n) => n.endsWith('.json') && !n.startsWith('.'));
    if (md < 0 ? names.length : names.some((n) => fs.statSync(path.join(NOTES_DIR, n)).mtimeMs > md)) regenerateNotesMd();
  } catch { /* no notes folder yet */ }
}

// ─── API ──────────────────────────────────────────────────────────────────────────────────────────

/** The tutorial's versions (out/v<n>.mp4, by n), each with its size, when it was built, its length and its note counts. */
async function listVideos() {
  const counts = new Map(readAllNotes().map((v) => [v.rel, v.notes]));
  const videos = [];
  for (const dir of VIDEO_DIRS) {
    let names = [];
    try { names = fs.readdirSync(path.join(ROOT, ...dir.split('/'))); } catch { continue; }
    for (const name of names) {
      if (!VIDEO_TYPES[path.extname(name).toLowerCase()]) continue;
      const rel = dir + '/' + name;
      const abs = path.join(ROOT, ...rel.split('/'));
      let stat;
      try { stat = fs.statSync(abs); } catch { continue; }
      if (stat.isFile()) videos.push({ rel, abs, stat });
    }
  }
  const versions = versionsOf(videos.map((v) => ({ ...v, path: v.rel })));
  const probed = await Promise.all(versions.map((v) => probe(v.rel, v.abs, v.stat)));
  return {
    versions: versions.map((v, i) => {
      const notes = counts.get(v.rel) ?? [];
      return {
        name: v.name, path: v.rel, size: v.stat.size, mtime: v.stat.mtimeMs,
        duration: probed[i]?.duration ?? null, fps: probed[i]?.fps ?? FILM_FPS, start: probed[i]?.start ?? 0,
        notes: notes.length, open: notes.filter((n) => n.status === 'open').length,
      };
    }),
  };
}

// one write at a time, so two requests can't interleave read-modify-write on a notes file
let writeChain = Promise.resolve();
function serial(fn) {
  const p = writeChain.then(fn);
  writeChain = p.catch(() => {});
  return p;
}

function findNote(id) {
  if (!/^[a-z0-9]{4,12}$/.test(id)) throw new HttpError(404, 'no such note');
  for (const { rel } of readAllNotes()) {
    const notes = readNotes(rel);
    const note = notes.find((n) => n.id === id);
    if (note) return { rel, notes, note };
  }
  throw new HttpError(404, 'no such note');
}

async function createNote(body) {
  const { rel, abs, stat } = resolveVideo(body.video);
  const text = cleanText(body.text, 'text', { required: true });
  const region = regionFrom(body.region);
  if (typeof body.time !== 'number' || !Number.isFinite(body.time) || body.time < 0 || body.time > 86400) throw new HttpError(400, 'time must be seconds, 0 or more');
  const probed = await probe(rel, abs, stat);
  const fps = probed?.fps ?? (typeof body.fps === 'number' && body.fps >= 1 && body.fps <= 240 ? body.fps : FILM_FPS);
  return serial(() => {
    const notes = readNotes(rel);
    if (notes.length >= 2000) throw new HttpError(400, 'too many notes on this video');
    const taken = new Set(readAllNotes().flatMap((v) => v.notes.map((n) => n.id)));
    const now = new Date().toISOString();
    const time = Math.round(body.time * 1e5) / 1e5;
    const note = {
      id: newId(taken), video: rel, videoMtime: stat.mtimeMs, time, frame: Math.round(time * fps), fps,
      text, region, status: 'open', reply: '', createdAt: now, updatedAt: now,
    };
    notes.push(note);
    writeNotes(rel, notes);
    regenerateNotesMd();
    saveNoteFrame(note);
    return note;
  });
}

function updateNote(id, body) {
  return serial(() => {
    const { rel, notes, note } = findNote(id);
    const before = JSON.stringify(note.region ?? null);
    if ('text' in body) note.text = cleanText(body.text, 'text', { required: true });
    if ('region' in body) note.region = regionFrom(body.region); // null takes it away
    if ('status' in body) {
      if (!STATUSES.includes(body.status)) throw new HttpError(400, `status must be one of ${STATUSES.join(', ')}`);
      note.status = body.status;
    }
    if ('reply' in body) note.reply = cleanText(body.reply, 'reply');
    if ('fixedIn' in body) { // the version a fix is in (Claude's reply sets it); null takes it away
      if (body.fixedIn === null) delete note.fixedIn;
      else if (typeof body.fixedIn === 'string' && FIXED_IN.test(body.fixedIn)) note.fixedIn = body.fixedIn;
      else throw new HttpError(400, 'fixedIn must be a version (v1, v2, ...) or null');
    }
    note.updatedAt = new Date().toISOString();
    writeNotes(rel, notes);
    regenerateNotesMd();
    if (JSON.stringify(note.region ?? null) !== before || !fs.existsSync(path.join(FRAMES_DIR, id + '.png'))) saveNoteFrame(note); // the frame shows the region
    return note;
  });
}

function deleteNote(id) {
  return serial(() => {
    const { rel, notes, note } = findNote(id);
    writeNotes(rel, notes.filter((n) => n !== note));
    try { fs.unlinkSync(path.join(FRAMES_DIR, id + '.png')); } catch { /* none */ }
    regenerateNotesMd();
    return { ok: true, id };
  });
}

// ─── http ─────────────────────────────────────────────────────────────────────────────────────────

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    if (!/^application\/json\b/i.test(req.headers['content-type'] ?? '')) return reject(new HttpError(415, 'send application/json'));
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new HttpError(413, 'request too large')); req.destroy(); } else chunks.push(c);
    });
    req.on('error', () => reject(new HttpError(400, 'bad request')));
    req.on('end', () => {
      try {
        const j = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!j || typeof j !== 'object' || Array.isArray(j)) throw new Error('not an object');
        resolve(j);
      } catch { reject(new HttpError(400, 'body is not a JSON object')); }
    });
  });
}

function sendVideo(req, res, { abs, stat }) {
  const size = stat.size;
  const headers = {
    'Content-Type': VIDEO_TYPES[path.extname(abs).toLowerCase()],
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
    'Last-Modified': stat.mtime.toUTCString(),
  };
  let start = 0;
  let end = size - 1;
  let code = 200;
  const range = req.headers.range;
  if (range) {
    const m = range.trim().match(/^bytes=(\d*)-(\d*)$/);
    const unsatisfiable = () => { res.writeHead(416, { 'Content-Range': `bytes */${size}`, 'Accept-Ranges': 'bytes' }); res.end(); };
    if (!m || (m[1] === '' && m[2] === '')) return unsatisfiable();
    if (m[1] === '') { // last N bytes
      const n = Number(m[2]);
      if (!n) return unsatisfiable();
      start = Math.max(0, size - n);
    } else {
      start = Number(m[1]);
      if (m[2] !== '') end = Math.min(Number(m[2]), size - 1);
    }
    if (start >= size || start > end) return unsatisfiable();
    code = 206;
    headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
  }
  headers['Content-Length'] = size === 0 ? 0 : end - start + 1;
  res.writeHead(code, headers);
  if (req.method === 'HEAD' || size === 0) return res.end();
  const stream = fs.createReadStream(abs, { start, end });
  stream.on('error', () => res.destroy());
  res.on('close', () => stream.destroy());
  stream.pipe(res);
}

async function handle(req, res) {
  // Only this machine's browser, addressed by loopback (no DNS-rebinding, no cross-site form posts).
  const host = String(req.headers.host ?? '').replace(/:\d+$/, '');
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(host)) throw new HttpError(403, 'forbidden');
  const url = new URL(req.url, 'http://127.0.0.1');
  const route = url.pathname;
  const method = req.method;
  const read = method === 'GET' || method === 'HEAD';

  if (read && PAGE_FILES[route]) {
    const [file, type] = PAGE_FILES[route];
    const body = fs.readFileSync(path.join(HERE, file));
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store', 'Content-Length': body.length });
    return res.end(method === 'HEAD' ? undefined : body);
  }
  if (read && route === '/favicon.ico') { res.writeHead(204); return res.end(); }
  if (read && route === '/video') return sendVideo(req, res, resolveVideo(url.searchParams.get('path')));
  if (method === 'GET' && route === '/api/videos') return sendJson(res, 200, await listVideos());
  if (method === 'GET' && route === '/api/notes' && !url.searchParams.has('video')) { // the tutorial's notes: every version's, by time
    refreshNotesMdIfStale();
    return sendJson(res, 200, { notes: readAllNotes().flatMap((v) => v.notes).sort((a, b) => a.time - b.time || String(a.createdAt).localeCompare(String(b.createdAt))) });
  }
  if (method === 'GET' && route === '/api/notes') {
    const { rel, stat } = resolveVideo(url.searchParams.get('video'));
    refreshNotesMdIfStale();
    return sendJson(res, 200, { video: rel, videoMtime: stat.mtimeMs, notes: readNotes(rel).sort((a, b) => a.time - b.time) });
  }
  if (method === 'GET' && route === '/api/frame') {
    const { rel, abs, stat } = resolveVideo(url.searchParams.get('video'));
    const t = Number(url.searchParams.get('t'));
    if (!Number.isFinite(t) || t < 0 || t > 86400) throw new HttpError(400, 't must be seconds, 0 or more');
    const probed = await probe(rel, abs, stat);
    const png = await grabFrame(abs, t, probed?.fps ?? FILM_FPS, null, probed?.start ?? 0);
    if (!png || !png.length) throw new HttpError(502, 'could not extract that frame (is ffmpeg on PATH, and t inside the video?)');
    res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store', 'Content-Length': png.length });
    return res.end(png);
  }
  if (method === 'POST' && route === '/api/notes') return sendJson(res, 201, await createNote(await readJsonBody(req)));
  const one = route.match(/^\/api\/notes\/([^/]+)$/);
  if (one && method === 'PUT') return sendJson(res, 200, await updateNote(one[1], await readJsonBody(req)));
  if (one && method === 'DELETE') return sendJson(res, 200, await deleteNote(one[1]));
  throw new HttpError(404, 'not found');
}

return {
  root: ROOT, notes: NOTES_DIR, refresh: refreshNotesMdIfStale,
  handle: (req, res) => handle(req, res).catch((e) => {
    const code = e instanceof HttpError ? e.code : 500;
    if (code === 500) console.error(e?.name ?? 'error', e?.code ?? '');
    if (res.headersSent) return res.destroy();
    sendJson(res, code, { error: e instanceof HttpError ? e.message : 'server error' });
  }),
};
} // createReview

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const PORT = Number(arg('--port', 4518));
  const review = createReview({ root: path.resolve(process.cwd(), arg('--root', path.resolve(HERE, '..', '..'))) });
  const server = http.createServer(review.handle);
  server.on('error', (e) => {
    console.error(e.code === 'EADDRINUSE' ? `Port ${PORT} is in use (is the review tool already running?). Try --port <n>.` : e);
    process.exit(1);
  });
  server.listen(PORT, '127.0.0.1', () => {
    review.refresh();
    console.log(`Video review: http://127.0.0.1:${PORT}\n  repo:  ${review.root}\n  notes: ${review.notes}`);
  });
}
