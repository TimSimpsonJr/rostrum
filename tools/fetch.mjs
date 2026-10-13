// Downloads, checked: a file named by a pin (tools/pins.mjs) is fetched over https into the data folder
// (tools/data.mjs), its size and SHA-256 are checked, and only then is it given its name, unpacked or run.
// A download with no checksum recorded is refused. A file that does not match is removed. A download that stopped
// early is kept as `<name>.part` and carried on from there the next time. Imports `node:` modules and our own only.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { PINS, isPinned } from './pins.mjs';
import { dataDir } from './data.mjs';

/** A download's failure, in words safe to show a user. */
export class FetchError extends Error {}

export const NOT_PINNED = 'no checksum is recorded for this download yet, so it is not fetched';
export const MISMATCH = 'the download did not match its checksum and was removed';

export function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    fs.createReadStream(file).on('data', (c) => hash.update(c)).on('error', reject).on('end', () => resolve(hash.digest('hex')));
  });
}

const sizeOf = (file) => { try { return fs.statSync(file).size; } catch { return -1; } };

/** `pin` -> `dest`, checked. Resolves `dest` (also when it was already there and matches). `fetcher`: fetch;
 *  `say(fraction)`: progress, 0 to 1. Throws a FetchError; nothing is ever left under the name `dest` unchecked. */
export async function fetchPinned(pin, dest, { fetcher = globalThis.fetch, say = () => {} } = {}) {
  if (!isPinned(pin)) throw new FetchError(NOT_PINNED);
  if (sizeOf(dest) === pin.size && (await sha256File(dest)) === pin.sha256) return dest;
  fs.rmSync(dest, { force: true }); // (there, and not what the pin says: never used)
  const part = dest + '.part';
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  let have = Math.max(0, sizeOf(part));
  if (have >= pin.size) { fs.rmSync(part, { force: true }); have = 0; }
  let res;
  try { res = await fetcher(pin.url, { redirect: 'follow', headers: have ? { range: `bytes=${have}-` } : {} }); } catch { throw new FetchError('the download could not start: check the connection and try again'); }
  if (!res.ok) throw new FetchError(`the download failed (the server answered ${res.status}): try again`);
  if (have && res.status !== 206) have = 0; // the server sent the whole file again
  const file = await fs.promises.open(part, have ? 'a' : 'w');
  let stopped = false;
  try {
    for await (const chunk of res.body) {
      have += chunk.length;
      if (have > pin.size) break; // more than the pin says: not the file
      await file.write(chunk);
      say(have / pin.size);
    }
  } catch { stopped = true; } finally { await file.close(); }
  if (have > pin.size) { fs.rmSync(part, { force: true }); throw new FetchError(MISMATCH); }
  if (stopped || have < pin.size) throw new FetchError('the download stopped early: try again and it carries on from where it stopped');
  if ((await sha256File(part)) !== pin.sha256) { fs.rmSync(part, { force: true }); throw new FetchError(MISMATCH); }
  fs.renameSync(part, dest);
  return dest;
}

/** Unpacks an archive (already checked) into a folder, with the system's tar and no shell. On Windows that is
 *  System32's tar (bsdtar, which reads zip); a `tar` earlier on PATH may be one that does not. */
export function unpack(archive, into) {
  const tar = process.platform === 'win32' ? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
  fs.mkdirSync(into, { recursive: true });
  const r = spawnSync(tar, ['-xf', archive, '-C', into], { windowsHide: true });
  if (r.status !== 0) throw new FetchError('the download could not be unpacked');
}

/** Leaves under `dir` only the files that `patterns` name (paths from `dir` with `/`; `*` is any run of characters
 *  inside one name) and removes every other file. { kept (sorted), missing: the patterns that named no file }. */
export function keepOnly(dir, patterns) {
  const res = patterns.map((p) => new RegExp('^' + p.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*') + '$'));
  const kept = [];
  for (const name of fs.readdirSync(dir, { recursive: true })) {
    const file = path.join(dir, name), rel = name.replaceAll('\\', '/');
    if (fs.lstatSync(file).isDirectory()) continue;
    if (res.some((r) => r.test(rel))) kept.push(rel); else fs.rmSync(file, { force: true });
  }
  return { kept: kept.sort(), missing: patterns.filter((_, i) => !kept.some((f) => res[i].test(f))) };
}

/** Windows' exit code of a program that could not start because a library it needs is not on the computer
 *  (STATUS_DLL_NOT_FOUND). For whisper.cpp's Windows build that is Microsoft's Visual C++ runtime (msvcp140.dll,
 *  vcruntime140.dll, vcruntime140_1.dll, vcomp140.dll), which its archive does not hold. */
export const NO_RUNTIME = 0xC0000135;
export const NEEDS_RUNTIME = "the transcriber needs Microsoft's Visual C++ runtime, which most PCs already have: Claude can help install it";

/** Can this program be started at all? It is run once with `--help` (fixed arguments, no shell, fifteen seconds).
 *  False when it could not be spawned, did not end in time, or ended with NO_RUNTIME. Nothing it prints is kept. */
export function canStart(exe, { args = ['--help'], spawn = spawnSync } = {}) {
  const r = spawn(exe, args, { windowsHide: true, timeout: 15000, stdio: 'ignore' });
  return !(r.error || r.status === NO_RUNTIME);
}

/** Where the transcriber setup puts things: <data>/whisper/{ggml-small.en.bin, bin/<program>, installed.json}. */
export function whisperHome(data = dataDir()) {
  const dir = path.join(data, 'whisper');
  return { dir, model: path.join(dir, 'ggml-small.en.bin'), bin: path.join(dir, 'bin'), installed: path.join(dir, 'installed.json') };
}

/** The program a finished setup put in the data folder for this pin, or null: `installed.json` must name the pin's
 *  checksum (a half-done setup, or one made from another download, is not run). */
export function installedProgram(data, pin) {
  if (!pin || !isPinned(pin)) return null;
  const home = whisperHome(data), exe = path.join(home.bin, pin.exe);
  let done = null;
  try { done = JSON.parse(fs.readFileSync(home.installed, 'utf8')); } catch { /* no setup yet */ }
  return done?.sha256 === pin.sha256 && fs.existsSync(exe) ? exe : null;
}

/** Did the last setup find that the program in the data folder cannot start? (`installed.json`: `starts: false`) */
export function cannotStart(data) {
  try { return JSON.parse(fs.readFileSync(whisperHome(data).installed, 'utf8')).starts === false; } catch { return false; }
}

/** Puts whisper.cpp and its model in the data folder. Resolves { exe (null on a platform with no pinned program:
 *  whisper.cpp from the system is used there), model }. The program is fetched first: with no checksum recorded for
 *  it nothing at all is downloaded. It is unpacked beside its place, everything the pin does not name is removed
 *  (`keepOnly`: the program and the libraries it loads stay), and it is swapped in only when everything the pin names
 *  is there; `installed.json` (written after the swap) names the checksum it came from and the files kept, and the
 *  helper runs no program from the data folder without it (helper/whisper.mjs). Then the program is started once
 *  (`start`: canStart): one that cannot start is left in place and marked (`starts: false`), the model is not
 *  fetched, and the failure says what is missing; the next run tries it again. `say({ step, fraction })`: progress. */
export async function installTranscriber({ data = dataDir(), pins = PINS, platform = process.platform, arch = process.arch, fetcher = globalThis.fetch, extract = unpack, start = canStart, say = () => {} } = {}) {
  const home = whisperHome(data), pin = pins[`whisper-${platform}-${arch}`];
  if (pin && !isPinned(pin)) throw new FetchError(`${NOT_PINNED}: the transcriber stays Python whisper, if that is installed`);
  const names = pin ? [pin.exe, ...(pin.keep ?? [])] : [];
  let exe = installedProgram(data, pin), kept = exe ? keepOnly(home.bin, names).kept : []; // (a setup from before the list: pruned now)
  if (pin && !exe) {
    const zip = path.join(home.dir, 'download.zip'), fresh = home.bin + '.new';
    await fetchPinned(pin, zip, { fetcher, say: (fraction) => say({ step: 'program', fraction }) });
    fs.rmSync(fresh, { recursive: true, force: true });
    fs.rmSync(home.installed, { force: true });
    extract(zip, fresh);
    const left = keepOnly(fresh, names);
    if (left.missing.length) { fs.rmSync(fresh, { recursive: true, force: true }); throw new FetchError('the transcriber download does not hold the program it should'); }
    fs.rmSync(home.bin, { recursive: true, force: true });
    fs.renameSync(fresh, home.bin);
    fs.rmSync(zip, { force: true });
    kept = left.kept;
    exe = path.join(home.bin, pin.exe);
  }
  if (exe) {
    const starts = start(exe);
    fs.writeFileSync(home.installed, JSON.stringify({ sha256: pin.sha256, exe: pin.exe, kept, starts }) + '\n');
    if (!starts) throw new FetchError(NEEDS_RUNTIME);
  }
  await fetchPinned(pins.model, home.model, { fetcher, say: (fraction) => say({ step: 'model', fraction }) });
  return { exe, model: home.model };
}
