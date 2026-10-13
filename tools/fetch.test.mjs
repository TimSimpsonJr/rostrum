import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { FetchError, MISMATCH, NEEDS_RUNTIME, NOT_PINNED, NO_RUNTIME, canStart, cannotStart, fetchPinned, installTranscriber, installedProgram, whisperHome } from './fetch.mjs';
import { HOSTS, PINS, isPinned } from './pins.mjs';
import { dataDir } from './data.mjs';

const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rt-fetch-'));
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const pinOf = (buf, more = {}) => ({ url: 'https://github.com/owner/project/releases/download/v1/file.zip', size: buf.length, sha256: sha(buf), ...more });
/** A server of local bytes: answers a Range as a server does, in chunks; `cut`: stop after this many bytes, as a dropped connection does. */
function serving(files, { cut = Infinity, ranges = true } = {}) {
  const calls = [];
  const fetcher = async (url, init = {}) => {
    calls.push({ url, range: init.headers?.range ?? null });
    const buf = files[url];
    if (!buf) return { ok: false, status: 404, body: [] };
    const from = ranges && init.headers?.range ? Number(/bytes=(\d+)-/.exec(init.headers.range)[1]) : 0;
    const body = (async function* () { let sent = 0; for (let i = from; i < buf.length; i += 7) { if (sent >= cut) throw new Error('connection reset'); const c = buf.subarray(i, Math.min(buf.length, i + 7)); sent += c.length; yield c; } })();
    return { ok: true, status: from ? 206 : 200, body };
  };
  return { fetcher, calls };
}
const says = async (promise, message) => assert.rejects(promise, (e) => e instanceof FetchError && e.message.startsWith(message));

test('pins: every download is https on a named host; a checksum is 64 hex digits or not there yet; the model is pinned', () => {
  for (const [name, pin] of Object.entries(PINS)) {
    const url = new URL(pin.url);
    assert.ok(url.protocol === 'https:' && HOSTS.includes(url.hostname), name);
    assert.ok(pin.sha256 === null || /^[0-9a-f]{64}$/.test(pin.sha256), `${name}: a checksum or null`);
    assert.ok(Number.isInteger(pin.size) && pin.size > 0, name);
  }
  assert.ok(isPinned(PINS.model));
  const cli = PINS['whisper-win32-x64'];
  assert.ok(isPinned(cli), 'the Windows transcriber is pinned: a checksum of 64 hex digits');
  assert.match(cli.url, /^https:\/\/github\.com\/ggml-org\/whisper\.cpp\/releases\/download\/v[\d.]+\/whisper-bin-x64\.zip$/, 'the project\'s own release file');
  assert.ok(cli.url.includes(`/${cli.version}/`) && /^[\w.-]+(\/[\w.-]+)*\.exe$/.test(cli.exe), 'its version, and a program at a path inside the archive');
  assert.ok(cli.keep.length > 0 && cli.keep.every((k) => /^[\w.*-]+(\/[\w.*-]+)*\.dll$/.test(k)), 'what else stays of the archive: libraries, by path inside it');
  const good = pinOf(Buffer.from('x'));
  for (const bad of [{ sha256: null }, { sha256: 'ABC' }, { sha256: good.sha256.toUpperCase() }, { url: 'http://github.com/a.zip' }, { url: 'https://github.com.evil.example/a.zip' }, { url: 'file:///c:/a.zip' }, { url: 'nonsense' }, { size: 0 }]) assert.equal(isPinned({ ...good, ...bad }), false, JSON.stringify(bad));
  assert.equal(isPinned(good), true);
});

test('the data folder is the user\'s own, by platform, or ROSTRUM_DATA', () => {
  assert.equal(dataDir({ env: { LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local' }, platform: 'win32', home: 'C:\\Users\\u' }), path.join('C:\\Users\\u\\AppData\\Local', 'Rostrum'));
  assert.equal(dataDir({ env: {}, platform: 'darwin', home: '/Users/u' }), path.join('/Users/u', 'Library', 'Application Support', 'Rostrum'));
  assert.equal(dataDir({ env: { XDG_DATA_HOME: '/x' }, platform: 'linux', home: '/home/u' }), path.join('/x', 'rostrum'));
  assert.equal(dataDir({ env: { ROSTRUM_DATA: os.tmpdir() }, platform: 'win32', home: 'C:\\Users\\u' }), path.resolve(os.tmpdir()));
});

test('fetch: a download that matches its pin is given its name; one already there is not fetched again', async () => {
  const dir = temp(), buf = crypto.randomBytes(100), pin = pinOf(buf), dest = path.join(dir, 'sub', 'file.zip'), { fetcher, calls } = serving({ [pin.url]: buf });
  const seen = [];
  assert.equal(await fetchPinned(pin, dest, { fetcher, say: (f) => seen.push(f) }), dest);
  assert.ok(fs.readFileSync(dest).equals(buf));
  assert.equal(seen.at(-1), 1);
  assert.equal(fs.existsSync(dest + '.part'), false);
  await fetchPinned(pin, dest, { fetcher });
  assert.equal(calls.length, 1);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('fetch: no checksum recorded, or an address that is not https on a named host: nothing is asked of the network', async () => {
  const dir = temp(), buf = Buffer.from('program'), { fetcher, calls } = serving({});
  for (const pin of [pinOf(buf, { sha256: null }), pinOf(buf, { url: 'http://github.com/a.zip' }), pinOf(buf, { url: 'https://example.com/a.zip' }), undefined]) await says(fetchPinned(pin, path.join(dir, 'a.zip'), { fetcher }), NOT_PINNED);
  assert.deepEqual([calls.length, fs.readdirSync(dir)], [0, []]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('fetch: bytes that do not match the checksum are removed and never given the name: other bytes, too many, a changed file already there', async () => {
  const dir = temp(), buf = crypto.randomBytes(64), pin = pinOf(buf), dest = path.join(dir, 'file.zip');
  const other = Buffer.from(buf); other[10] ^= 1;
  await says(fetchPinned(pin, dest, { fetcher: serving({ [pin.url]: other }).fetcher }), MISMATCH);
  assert.deepEqual(fs.readdirSync(dir), []);
  await says(fetchPinned(pin, dest, { fetcher: serving({ [pin.url]: Buffer.concat([buf, buf]) }).fetcher }), MISMATCH);
  assert.deepEqual(fs.readdirSync(dir), []);
  fs.writeFileSync(dest, other); // (as if changed on disk since)
  await says(fetchPinned(pin, dest, { fetcher: serving({}).fetcher }), 'the download failed (the server answered 404)');
  assert.deepEqual(fs.readdirSync(dir), [], 'the changed file is gone');
  await says(fetchPinned(pin, dest, { fetcher: async () => { throw new Error('offline'); } }), 'the download could not start');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('fetch: a download that stopped early is kept as .part and carried on from there; a server that sends the whole file again is taken from the start', async () => {
  const dir = temp(), buf = crypto.randomBytes(100), pin = pinOf(buf), dest = path.join(dir, 'file.zip');
  await says(fetchPinned(pin, dest, { fetcher: serving({ [pin.url]: buf }, { cut: 35 }).fetcher }), 'the download stopped early');
  assert.deepEqual([fs.readdirSync(dir), fs.statSync(dest + '.part').size], [['file.zip.part'], 35]);
  const again = serving({ [pin.url]: buf });
  await fetchPinned(pin, dest, { fetcher: again.fetcher });
  assert.deepEqual(again.calls, [{ url: pin.url, range: 'bytes=35-' }]);
  assert.ok(fs.readFileSync(dest).equals(buf));

  fs.rmSync(dest); fs.writeFileSync(dest + '.part', buf.subarray(0, 20));
  await fetchPinned(pin, dest, { fetcher: serving({ [pin.url]: buf }, { ranges: false }).fetcher });
  assert.ok(fs.readFileSync(dest).equals(buf));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('setup of the transcriber: the program is unpacked only after its checksum matched, swapped in only when it holds the program, and marked; then the model', async () => {
  const data = temp(), zip = crypto.randomBytes(80), model = crypto.randomBytes(120);
  // (as the pinned archive is: the program and the libraries it loads, in a folder)
  const pins = { 'whisper-win32-x64': pinOf(zip, { exe: 'Release/whisper-cli.exe', keep: PINS['whisper-win32-x64'].keep }), model: pinOf(model, { url: 'https://huggingface.co/owner/models/resolve/abc/model.bin' }) };
  const files = { [pins['whisper-win32-x64'].url]: zip, [pins.model.url]: model }, home = whisperHome(data);
  const unpacked = [];
  const extract = (holds) => (archive, into) => { unpacked.push(sha(fs.readFileSync(archive))); for (const f of holds) { fs.mkdirSync(path.dirname(path.join(into, f)), { recursive: true }); fs.writeFileSync(path.join(into, f), 'MZ'); } };
  const KEPT = ['Release/ggml-base.dll', 'Release/ggml-cpu-haswell.dll', 'Release/ggml-cpu-x64.dll', 'Release/ggml.dll', 'Release/whisper-cli.exe', 'Release/whisper.dll'];
  // (what else the real archive holds, a file a later release might add, and names that only look like kept ones)
  const OTHERS = ['Release/main.exe', 'Release/whisper-server.exe', 'Release/whisper-stream.exe', 'Release/SDL2.dll', 'Release/parakeet.dll', 'Release/new-in-a-later-release.dll', 'Release/sub/ggml-cpu-x64.dll', 'whisper.dll', 'readme.txt'];
  const go = (more) => installTranscriber({ data, pins, platform: 'win32', arch: 'x64', fetcher: serving(files).fetcher, extract: extract([...KEPT, ...OTHERS]), start: () => true, ...more });

  // a program that is not the pinned one is never unpacked
  const tampered = Buffer.from(zip); tampered[0] ^= 1;
  await says(go({ fetcher: serving({ ...files, [pins['whisper-win32-x64'].url]: tampered }).fetcher }), MISMATCH);
  assert.deepEqual([unpacked, fs.readdirSync(home.dir)], [[], []]);
  // no checksum recorded for the program: nothing is fetched at all, the model included
  const none = serving(files);
  await says(go({ pins: { ...pins, 'whisper-win32-x64': { ...pins['whisper-win32-x64'], sha256: null } }, fetcher: none.fetcher }), NOT_PINNED);
  assert.equal(none.calls.length, 0);
  // the archive does not hold the program the pin names: nothing is put in place
  await says(go({ extract: extract(['whisper-cli.exe', 'Release/other.exe']) }), 'the transcriber download does not hold the program it should');
  assert.equal(installedProgram(data, pins['whisper-win32-x64']), null);
  assert.equal(fs.existsSync(home.bin), false);
  // nor when a library the pin names is not in it (each: a name, and the pattern with nothing to match)
  for (const gone of ['Release/whisper.dll', 'Release/ggml-base.dll', 'Release/ggml-cpu-']) {
    await says(go({ extract: extract([...KEPT, ...OTHERS].filter((f) => !f.startsWith(gone))) }), 'the transcriber download does not hold the program it should');
    assert.deepEqual([installedProgram(data, pins['whisper-win32-x64']), fs.existsSync(home.bin), fs.existsSync(home.bin + '.new'), fs.existsSync(home.installed)], [null, false, false, false], gone);
  }

  const steps = new Set(), done = await go({ say: (s) => steps.add(s.step) });
  assert.deepEqual(done, { exe: path.join(home.bin, 'Release', 'whisper-cli.exe'), model: home.model });
  const inBin = () => fs.readdirSync(home.bin, { recursive: true }).map((f) => f.replaceAll('\\', '/')).filter((f) => fs.statSync(path.join(home.bin, f)).isFile()).sort();
  assert.deepEqual(inBin(), KEPT, 'the program and the libraries it loads, and nothing else of the archive');
  assert.deepEqual(JSON.parse(fs.readFileSync(home.installed, 'utf8')), { sha256: pins['whisper-win32-x64'].sha256, exe: 'Release/whisper-cli.exe', kept: KEPT, starts: true });
  assert.deepEqual([...steps], ['model'], 'the program\'s archive was fetched and checked a moment ago: it is checked again, not fetched again');
  assert.deepEqual(unpacked.at(-1), pins['whisper-win32-x64'].sha256, 'what was unpacked is what was pinned');
  assert.deepEqual(fs.readdirSync(home.dir).sort(), ['bin', 'ggml-small.en.bin', 'installed.json']);
  assert.equal(installedProgram(data, pins['whisper-win32-x64']), done.exe);
  assert.equal(installedProgram(data, { ...pins['whisper-win32-x64'], sha256: 'c'.repeat(64) }), null, 'another pin: this program is not its');

  // again: nothing is fetched; a platform with no pinned program gets the model alone
  const quiet = serving(files);
  assert.deepEqual(await go({ fetcher: quiet.fetcher }), done);
  assert.equal(quiet.calls.length, 0);
  // a setup made before the list (other programs still beside it) is pruned by the next run
  fs.writeFileSync(path.join(home.bin, 'Release', 'whisper-server.exe'), 'MZ');
  await go({ fetcher: quiet.fetcher });
  assert.deepEqual([inBin(), quiet.calls.length], [KEPT, 0]);
  const mac = temp();
  assert.deepEqual(await go({ data: mac, platform: 'darwin', arch: 'arm64' }), { exe: null, model: whisperHome(mac).model });
  for (const d of [data, mac]) fs.rmSync(d, { recursive: true, force: true });
});

test('a program that cannot start (no Visual C++ runtime): told from its exit code or a failed spawn; setup leaves it in place, marks it, fetches no model and says what it needs; the next run tries again', async () => {
  const seen = [], spawn = (r) => (...call) => { seen.push(call); return r; };
  assert.equal(canStart('C:\\w\\whisper-cli.exe', { spawn: spawn({ status: 0 }) }), true);
  assert.deepEqual([seen[0][0], seen[0][1], seen[0][2].stdio, seen[0][2].timeout > 0], ['C:\\w\\whisper-cli.exe', ['--help'], 'ignore', true], 'fixed arguments, nothing it prints is kept, a time limit');
  assert.equal(canStart('x', { spawn: spawn({ status: 1 }) }), true, 'it started: what it then made of its arguments is not the question');
  assert.equal(canStart('x', { spawn: spawn({ status: NO_RUNTIME }) }), false);
  assert.equal(canStart('x', { spawn: spawn({ status: null, error: new Error('ETIMEDOUT') }) }), false);
  assert.equal(NO_RUNTIME, 3221225781);
  // for real: a program that is not there, one that starts, and (where the whole code survives) one that ends with that code
  assert.equal(canStart(path.join(os.tmpdir(), 'rt-no-such-program.exe')), false);
  assert.equal(canStart(process.execPath, { args: ['--version'] }), true);
  if (process.platform === 'win32') assert.equal(canStart(process.execPath, { args: [fileURLToPath(new URL('../fixtures/no-runtime-stub.mjs', import.meta.url))] }), false);

  const data = temp(), zip = crypto.randomBytes(80), model = crypto.randomBytes(120), home = whisperHome(data);
  const pins = { 'whisper-win32-x64': pinOf(zip, { exe: 'Release/whisper-cli.exe', keep: ['Release/whisper.dll'] }), model: pinOf(model, { url: 'https://huggingface.co/owner/models/resolve/abc/model.bin' }) };
  const extract = (archive, into) => { for (const f of ['whisper-cli.exe', 'whisper.dll']) { fs.mkdirSync(path.join(into, 'Release'), { recursive: true }); fs.writeFileSync(path.join(into, 'Release', f), 'MZ'); } };
  const net = serving({ [pins['whisper-win32-x64'].url]: zip, [pins.model.url]: model }), tried = [];
  const go = (starts) => installTranscriber({ data, pins, platform: 'win32', arch: 'x64', fetcher: net.fetcher, extract, start: (exe) => { tried.push(exe); return starts; } });
  await says(go(false), NEEDS_RUNTIME);
  assert.match(NEEDS_RUNTIME, /Microsoft's Visual C\+\+ runtime.*most PCs already have.*Claude can help/);
  const exe = path.join(home.bin, 'Release', 'whisper-cli.exe');
  assert.deepEqual([tried, net.calls.map((c) => c.url), fs.existsSync(home.model)], [[exe], [pins['whisper-win32-x64'].url], false], 'the model is not fetched for a program that cannot run');
  assert.deepEqual([installedProgram(data, pins['whisper-win32-x64']), cannotStart(data), JSON.parse(fs.readFileSync(home.installed, 'utf8')).starts], [exe, true, false]);
  // the runtime has been installed since: the same press finishes the job, and nothing is fetched twice
  assert.deepEqual(await go(true), { exe, model: home.model });
  assert.deepEqual([cannotStart(data), net.calls.map((c) => c.url)], [false, [pins['whisper-win32-x64'].url, pins.model.url]]);
  assert.equal(cannotStart(temp()), false, 'no setup yet: nothing is known to be wrong');
  fs.rmSync(data, { recursive: true, force: true });
});
