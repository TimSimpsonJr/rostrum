// First-run setup against folders of its own and a stand-in for every program: nothing here installs or downloads.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { npmOf, plan, runSetup, setupState, transcriberPlan } from './setup.mjs';
import { PINS } from './pins.mjs';
import { whisperHome } from './fetch.mjs';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rt-setup-'));
const put = (file, text = '') => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };
/** The pins with no checksum for the Windows transcriber (as they were before it was pinned): it is not offered. */
const UNPINNED = { ...PINS, 'whisper-win32-x64': { ...PINS['whisper-win32-x64'], sha256: null } };
/** A plugin folder as a fresh copy has it: its package.json, a Node with npm beside it, and nothing installed. */
function fresh() {
  const root = temp(), data = temp(), execPath = path.join(root, 'nodehome', 'node.exe');
  put(path.join(root, 'package.json'), JSON.stringify({ dependencies: { remotion: '4.0.532' } }));
  put(path.join(root, 'nodehome', 'node_modules', 'npm', 'bin', 'npm-cli.js'));
  return { root, data, execPath, platform: 'win32', arch: 'x64', env: { PATH: '' }, pins: UNPINNED };
}
/** What each program leaves behind when it works; `fail`: the step names that end with code 1. */
function runner(root, ran, fail = []) {
  return async (spec) => {
    ran.push(spec);
    assert.ok(Array.isArray(spec.args) && typeof spec.cmd === 'string', 'a program and an argument list, never a shell line');
    if (fail.includes(spec.name)) return { code: 1, stdout: '', missing: false };
    if (spec.name === 'npm') { put(path.join(root, 'node_modules', '.package-lock.json'), '{}'); put(path.join(root, 'node_modules', 'remotion', 'package.json'), JSON.stringify({ version: '4.0.532' })); }
    if (spec.name === 'vendor') for (const f of ['rrweb.js', 'GeistVF.woff2', 'page.js']) put(path.join(root, 'extension', 'vendor', f));
    if (spec.name === 'browser') { spec.onLine?.('{"pct":50}'); spec.onLine?.('not json'); put(path.join(root, 'node_modules', '.remotion', 'chrome-headless-shell', 'VERSION'), '1'); }
    return { code: 0, stdout: '', missing: false };
  };
}
const noFetch = async () => { throw new Error('nothing may be downloaded here'); };

test('a fresh copy: the packages, the recorder files and the browser are missing, in that order; the unpinned transcriber is not offered', () => {
  const ctx = fresh(), state = setupState(ctx);
  assert.equal(state.needed, true);
  assert.deepEqual(state.steps.map((s) => [s.name, s.done]), [['deps', false], ['vendor', false], ['browser', false]]);
  assert.equal(state.transcriber, 'none');
  assert.equal(state.data, ctx.data);
  assert.equal(state.running, false);
  for (const s of state.steps) assert.ok(s.what.length > 10 && s.what.length < 120, s.what);
  // Python whisper on PATH: that is the transcriber, and still nothing is offered
  const bin = temp(); put(path.join(bin, 'whisper.exe'));
  assert.equal(setupState({ ...ctx, env: { PATH: bin } }).transcriber, 'python');
  assert.equal(setupState({ ...ctx, env: { PATH: '', ROSTRUM_WHISPER: 'C:\\x\\whisper.exe' } }).transcriber, 'own');
});

test('a run: npm ci by the npm beside Node, then the recorder files, then the browser; progress only grows; nothing is downloaded for the transcriber', async () => {
  const ctx = fresh(), ran = [], said = [];
  const r = await runSetup({ ...ctx, run: runner(ctx.root, ran), fetcher: noFetch }, (s) => said.push(s));
  assert.deepEqual(r, { ok: true });
  assert.deepEqual(ran.map((s) => s.name), ['npm', 'vendor', 'browser']);
  assert.equal(ran[0].cmd, ctx.execPath);
  assert.deepEqual(ran[0].args, [path.join(ctx.root, 'nodehome', 'node_modules', 'npm', 'bin', 'npm-cli.js'), 'ci', '--no-audit', '--no-fund']);
  assert.equal(ran[0].cwd, ctx.root);
  assert.deepEqual(ran[1].args, ['--experimental-strip-types', path.join(ctx.root, 'tools', 'copy-vendor.mjs')]);
  assert.deepEqual(ran[2].args, [path.join(ctx.root, 'tools', 'ensure-browser.mjs')]);
  assert.deepEqual(said.map((s) => s.step), ['deps', 'vendor', 'browser', 'browser', null]);
  assert.deepEqual(said.map((s) => s.pct), [...said.map((s) => s.pct)].sort((a, b) => a - b));
  assert.deepEqual(said.at(-1), { step: null, state: 'done', label: 'Set up', pct: 100, note: null });
  assert.equal(setupState(ctx).needed, false);
  // again: everything is there, so nothing runs
  const again = [];
  assert.deepEqual(await runSetup({ ...ctx, run: runner(ctx.root, again), fetcher: noFetch }), { ok: true });
  assert.deepEqual(again, []);
});

test('a step that fails says so in plain words and stops; the next run carries on from it', async () => {
  const ctx = fresh(), ran = [], said = [];
  const r = await runSetup({ ...ctx, run: runner(ctx.root, ran, ['browser']), fetcher: noFetch }, (s) => said.push(s));
  assert.deepEqual(r, { ok: false, step: 'browser' });
  assert.deepEqual(ran.map((s) => s.name), ['npm', 'vendor', 'browser']);
  assert.equal(said.at(-1).state, 'failed');
  assert.equal(said.at(-1).note, 'Fetching the browser that renders films did not finish: the browser download stopped with code 1: check the connection.');
  const again = [];
  assert.deepEqual(await runSetup({ ...ctx, run: runner(ctx.root, again), fetcher: noFetch }), { ok: true });
  assert.deepEqual(again.map((s) => s.name), ['browser']);
  // a program that ends well but leaves nothing is a failure too, and one that cannot be started says that
  const b = fresh();
  const nothing = []; await runSetup({ ...b, run: async () => ({ code: 0, stdout: '', missing: false }) }, (s) => nothing.push(s));
  assert.match(nothing.at(-1).note, /^Installing the video engine did not finish: it ended without what it should have left\.$/);
  const gone = []; await runSetup({ ...b, run: async () => ({ code: null, stdout: '', missing: true }) }, (s) => gone.push(s));
  assert.match(gone.at(-1).note, /npm could not be started\.$/);
  const noNpm = []; await runSetup({ ...b, execPath: path.join(b.root, 'elsewhere', 'node.exe'), run: async () => assert.fail('nothing to run') }, (s) => noNpm.push(s));
  assert.match(noNpm.at(-1).note, /npm was not found beside Node on this computer\.$/);
});

test('npm is the one beside the running Node, by platform; on PATH only where it can be started without a shell', () => {
  const has = (...files) => (f) => files.includes(f);
  assert.deepEqual(npmOf({ execPath: 'C:\\n\\node.exe', platform: 'win32', env: {}, exists: has('C:\\n\\node_modules\\npm\\bin\\npm-cli.js') }), { cmd: 'C:\\n\\node.exe', args: ['C:\\n\\node_modules\\npm\\bin\\npm-cli.js'] });
  assert.deepEqual(npmOf({ execPath: '/d/node/bin/node', platform: 'darwin', env: {}, exists: has('/d/node/lib/node_modules/npm/bin/npm-cli.js') }), { cmd: '/d/node/bin/node', args: ['/d/node/lib/node_modules/npm/bin/npm-cli.js'] });
  assert.deepEqual(npmOf({ execPath: '/opt/homebrew/Cellar/node/22/bin/node', platform: 'darwin', env: {}, exists: has('/opt/homebrew/Cellar/node/22/libexec/lib/node_modules/npm/bin/npm-cli.js') }).args, ['/opt/homebrew/Cellar/node/22/libexec/lib/node_modules/npm/bin/npm-cli.js']);
  assert.deepEqual(npmOf({ execPath: '/x/node', platform: 'darwin', env: { PATH: '/usr/bin' }, exists: has('/opt/homebrew/bin/npm') }), { cmd: '/opt/homebrew/bin/npm', args: [] });
  assert.equal(npmOf({ execPath: 'C:\\x\\node.exe', platform: 'win32', env: { PATH: 'C:\\n' }, exists: has('C:\\n\\npm.exe', 'C:\\n\\npm.cmd') }), null);
  assert.ok(npmOf(), 'the Node running these tests has npm beside it');
});

test('the transcriber: offered once its program has a checksum (no change of code), fetched checked, and done by installed.json and the model', async () => {
  const ctx = fresh(), sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
  assert.equal(transcriberPlan({ ...ctx }).offered, false);
  assert.equal(transcriberPlan({ ...ctx, pins: PINS }).offered, true, 'as shipped the Windows program is pinned: a Windows machine is offered whisper.cpp');
  const zip = Buffer.from('a zip'), model = Buffer.from('a model');
  const pins = { 'whisper-win32-x64': { url: 'https://github.com/o/p/releases/download/v1/w.zip', size: zip.length, sha256: sha(zip), exe: 'main.exe' }, model: { url: 'https://huggingface.co/o/p/resolve/abc/m.bin', size: model.length, sha256: sha(model) } };
  const offered = transcriberPlan({ ...ctx, pins });
  assert.deepEqual([offered.state, offered.offered, offered.done], ['offered', true, false]);
  assert.match(offered.what, /whisper\.cpp.*from GitHub.*model.*from Hugging Face/);
  assert.deepEqual(plan({ ...ctx, pins }).steps.map((s) => s.name), ['deps', 'vendor', 'browser', 'transcriber']);
  // the run: both files come through the checked fetch (a stand-in for the network and for tar)
  const files = { [pins['whisper-win32-x64'].url]: zip, [pins.model.url]: model }, asked = [];
  const fetcher = async (url) => { asked.push(url); return { ok: true, status: 200, body: (async function* () { yield files[url]; })() }; };
  const ran = [];
  // (tools/fetch.mjs unpacks with the system's tar: a text file is no archive, so the program step fails as it must)
  const r = await runSetup({ ...ctx, pins, run: runner(ctx.root, ran), fetcher }, () => {});
  assert.deepEqual(r, { ok: false, step: 'transcriber' });
  assert.deepEqual(asked, [pins['whisper-win32-x64'].url]);
  assert.equal(fs.existsSync(whisperHome(ctx.data).installed), false, 'nothing is marked installed');
  // a Mac has no pinned program: whisper.cpp already there is used, and only the model is fetched
  const mac = { ...ctx, platform: 'darwin', arch: 'arm64', pins };
  assert.equal(transcriberPlan({ ...mac, env: { PATH: '' }, exists: () => false }).state, 'none');
  const withCli = transcriberPlan({ ...mac, env: { PATH: '' }, exists: (f) => f === '/opt/homebrew/bin/whisper-cli' });
  assert.deepEqual([withCli.state, withCli.done], ['offered', false]);
  assert.match(withCli.what, /^the transcriber's English model/);
  put(whisperHome(ctx.data).model, model);
  assert.equal(transcriberPlan({ ...mac, env: { PATH: '' }, exists: (f) => f === '/opt/homebrew/bin/whisper-cli' }).done, true);
  // Windows: the program is in place with its model, but the last run found it cannot start (no Visual C++ runtime):
  // the step is not done, the list says what is needed, and a run that finds it starts makes it done
  const home = whisperHome(ctx.data), mark = (starts) => put(home.installed, JSON.stringify({ sha256: pins['whisper-win32-x64'].sha256, exe: 'main.exe', starts }));
  put(path.join(home.bin, 'main.exe')); mark(false);
  const stuck = transcriberPlan({ ...ctx, pins });
  assert.deepEqual([stuck.state, stuck.offered, stuck.done], ['offered', true, false]);
  assert.match(stuck.what, /Microsoft's Visual C\+\+ runtime.*Claude can help/);
  assert.ok(stuck.what.length <= 160, 'the panel shows 160 characters of it');
  mark(true);
  assert.equal(transcriberPlan({ ...ctx, pins }).done, true);
});

test('this copy of the plugin is set up: the packages are there and are not installed again', async () => {
  const real = setupState({ fetcher: noFetch });
  assert.deepEqual(real.steps.filter((s) => s.name === 'deps').map((s) => s.done), [true]);
  const ran = [];
  await runSetup({ data: temp(), env: { PATH: '' }, fetcher: noFetch, run: async (spec) => { ran.push(spec.name); return { code: 1, stdout: '', missing: false }; } });
  assert.equal(ran.includes('npm'), false);
});

test('the panel and the helper agree on where the data folder is (hooks/node.ts has its own copy of the rule: the panel runs without Node)', async () => {
  const { dataDirOf } = await import('../hooks/node.ts');
  const { dataDir } = await import('./data.mjs');
  const same = (a, b) => assert.equal(a.replace(/\\/g, '/'), b.replace(/\\/g, '/'));
  same(dataDirOf({ localAppData: 'C:\\Users\\u\\AppData\\Local', userProfile: 'C:\\Users\\u' }, 'windows'), dataDir({ env: { LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local' }, platform: 'win32', home: 'C:\\Users\\u' }));
  same(dataDirOf({ userProfile: 'C:\\Users\\u' }, 'windows'), dataDir({ env: {}, platform: 'win32', home: 'C:\\Users\\u' }));
  same(dataDirOf({ home: '/Users/u' }, 'mac'), dataDir({ env: {}, platform: 'darwin', home: '/Users/u' }));
  same(dataDirOf({ home: '/home/u' }, 'linux'), dataDir({ env: {}, platform: 'linux', home: '/home/u' }));
  same(dataDirOf({ home: '/home/u', xdgData: '/x' }, 'linux'), dataDir({ env: { XDG_DATA_HOME: '/x' }, platform: 'linux', home: '/home/u' }));
  same(dataDirOf({ data: os.tmpdir(), home: '/home/u' }, 'linux'), dataDir({ env: { ROSTRUM_DATA: os.tmpdir() }, platform: 'linux', home: '/home/u' }));
});

test('the helper starts with no npm package: what it and setup import at the top is node: or our own files', () => {
  const seen = new Set(), bad = [];
  const walk = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const text = fs.readFileSync(file, 'utf8');
    const named = [...text.matchAll(/^\s*(?:import|export)\b[^'";]*?\bfrom\s*['"]([^'"]+)['"]/gm), ...text.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm)].map((m) => m[1]);
    for (const spec of named) {
      if (spec.startsWith('node:')) continue;
      if (!spec.startsWith('.')) { bad.push(`${path.relative(REPO, file)} imports ${spec}`); continue; }
      walk(path.resolve(path.dirname(file), spec));
    }
  };
  walk(path.join(REPO, 'helper', 'server.mjs'));
  assert.deepEqual(bad, []);
  assert.ok(seen.has(path.join(REPO, 'tools', 'setup.mjs')) && seen.has(path.join(REPO, 'tools', 'fetch.mjs')) && seen.size > 10);
});
