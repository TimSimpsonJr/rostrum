// First-run setup: what a fresh copy of the plugin lacks, put in place after one press in the panel. The helper owns it
// (helper/server.mjs: GET and POST /setup) and runs it inside its own process, so this file and everything it imports
// are `node:` modules and our own files only: it has to work before any npm package is there.
// A step is done when the disk says so (`plan` reads it every time), a step that is done is skipped, and a run that
// failed is simply started again. Every program is started without a shell, from a fixed argument list.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PINS, isPinned } from './pins.mjs';
import { dataDir } from './data.mjs';
import { FetchError, cannotStart, installTranscriber, installedProgram, whisperHome } from './fetch.mjs';
import { run as spawnRun } from '../helper/run.mjs';
import { onPath } from '../helper/whisper.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const LONG = 30 * 60 * 1000; // the packages and the browser on a slow line

/** A step's failure, in words safe to show a user. */
export class SetupError extends Error {}

const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };
const sizeOf = (file) => { try { return fs.statSync(file).size; } catch { return -1; } };
const mb = (bytes) => Math.round(bytes / 1e6);

/** npm's own program beside the Node that is running this (a portable Node, an installer's, Homebrew's), else `npm`
 *  on PATH where that can be started without a shell (not on Windows: npm.cmd cannot). { cmd, args } or null. */
export function npmOf({ execPath = process.execPath, platform = process.platform, env = process.env, exists = fs.existsSync } = {}) {
  const p = platform === 'win32' ? path.win32 : path.posix, dir = p.dirname(execPath);
  const beside = platform === 'win32' ? [p.join(dir, 'node_modules')] : [p.join(dir, '..', 'lib', 'node_modules'), p.join(dir, '..', 'libexec', 'lib', 'node_modules')];
  for (const modules of beside) { const cli = p.join(modules, 'npm', 'bin', 'npm-cli.js'); if (exists(cli)) return { cmd: execPath, args: [cli] }; }
  const found = platform === 'win32' ? null : onPath('npm', { env, platform, exists });
  return found ? { cmd: found, args: [] } : null;
}

/** Where the transcriber stands. `state`:
 *    own      ROSTRUM_WHISPER names one: the user's, nothing is fetched
 *    offered  setup fetches it (the program when it has a checksum in tools/pins.mjs, and the model); `done` says if it has
 *    python   nothing to fetch, and Python whisper is on this computer: that is the transcriber
 *    none     nothing to fetch and none here: the panel says so and Claude sets one up in chat
 *  A program whose pin has no checksum yet is not fetched (tools/fetch.mjs refuses it); the day its checksum is
 *  recorded it is `offered`, with no change here. Where no program is pinned for the platform (a Mac), whisper.cpp
 *  already on the computer is used and only the model is fetched. */
export function transcriberPlan({ env = process.env, platform = process.platform, arch = process.arch, data = dataDir({ env, platform }), pins = PINS, exists = fs.existsSync } = {}) {
  const pin = pins[`whisper-${platform}-${arch}`], home = whisperHome(data);
  const program = pin ? (isPinned(pin) ? 'fetch' : null) : ['whisper-cli', 'whisper-cpp'].some((name) => onPath(name, { env, platform, exists })) ? 'system' : null;
  const hasModel = sizeOf(home.model) === pins.model.size, hasProgram = program === 'system' || !!installedProgram(data, pin);
  if (env.ROSTRUM_WHISPER) return { state: 'own', offered: false, done: true, what: null };
  if (!program) return { state: onPath('whisper', { env, platform, exists }) ? 'python' : 'none', offered: false, done: true, what: null };
  const model = `English model (${mb(pins.model.size)} MB, from Hugging Face)`;
  // (the last run put the program in place and it could not start, tools/fetch.mjs: not done, and the next run tries it again)
  if (program === 'fetch' && hasProgram && cannotStart(data)) return { state: 'offered', offered: true, done: false, what: "the transcriber's English model, once Microsoft's Visual C++ runtime is installed (the transcriber cannot start without it: Claude can help)" };
  return { state: 'offered', offered: true, done: hasModel && hasProgram, what: program === 'fetch' && !hasProgram ? `the transcriber (whisper.cpp, ${mb(pin.size)} MB, from GitHub) and its ${model}` : `the transcriber's ${model}` };
}

/** The steps, in order, each with whether it is done now. `ctx` (all optional): { root, data, env, platform, arch,
 *  pins, run (helper/run.mjs), fetcher, execPath }. A step: { name, label (what the bar says while it runs), what
 *  (what the panel says it will fetch), weight (its share of the bar), done, run(say(fraction)) }. */
export function plan(ctx = {}) {
  const { root = ROOT, env = process.env, platform = process.platform, arch = process.arch, pins = PINS, run = spawnRun, fetcher = globalThis.fetch, execPath = process.execPath } = ctx;
  const data = ctx.data ?? dataDir({ env, platform }), at = (...parts) => path.join(root, ...parts);
  const node = (name, args, more = {}) => run({ name, cmd: execPath, args, cwd: root, timeout: LONG, env, ...more });
  const ended = (r, what) => { if (r.missing) throw new SetupError(`${what} could not be started`); if (r.code !== 0) throw new SetupError(`${what} stopped ${r.code === 'timeout' ? 'after half an hour' : `with code ${r.code}`}: check the connection`); };
  const want = readJson(at('package.json'))?.dependencies?.remotion;
  const transcriber = transcriberPlan({ env, platform, arch, data, pins });
  const steps = [
    { name: 'deps', label: 'Installing the video engine', what: 'the video engine (npm packages, about 650 MB on disk)', weight: 45,
      // (npm writes .package-lock.json when an install has finished: a half-made node_modules is not "done")
      done: !!want && fs.existsSync(at('node_modules', '.package-lock.json')) && readJson(at('node_modules', 'remotion', 'package.json'))?.version === want,
      run: async () => {
        const npm = npmOf({ execPath, platform, env });
        if (!npm) throw new SetupError('npm was not found beside Node on this computer');
        ended(await run({ name: 'npm', cmd: npm.cmd, args: [...npm.args, 'ci', '--no-audit', '--no-fund'], cwd: root, timeout: LONG, env }), 'npm');
      } },
    { name: 'vendor', label: "Putting the recorder's files together", what: "the recorder's files, made on this computer from those packages", weight: 1,
      done: ['rrweb.js', 'GeistVF.woff2', 'page.js'].every((f) => fs.existsSync(at('extension', 'vendor', f))),
      run: async () => ended(await node('vendor', ['--experimental-strip-types', at('tools', 'copy-vendor.mjs')]), "the recorder's files") },
    { name: 'browser', label: 'Fetching the browser that renders films', what: 'a browser for rendering films (Chrome Headless Shell, about 270 MB on disk, fetched by Remotion)', weight: 20,
      // (Remotion's own record of the browser it fetched; it checks the version itself before every render)
      done: fs.existsSync(at('node_modules', '.remotion', 'chrome-headless-shell', 'VERSION')),
      run: async (say) => ended(await node('browser', [at('tools', 'ensure-browser.mjs')], { onLine: (line) => { const pct = readLine(line)?.pct; if (Number.isFinite(pct)) say(pct / 100); } }), 'the browser download') },
    ...(transcriber.offered ? [{ name: 'transcriber', label: 'Fetching the transcriber', what: transcriber.what, weight: 34, done: transcriber.done,
      // (tools/fetch.mjs: https, a checksum from tools/pins.mjs checked before anything is named, unpacked or run)
      run: async (say) => { await installTranscriber({ data, pins, platform, arch, fetcher, say: ({ step, fraction }) => say(step === 'model' ? 0.02 + 0.98 * fraction : 0.02 * fraction) }); } }] : []),
  ];
  return { data, transcriber: transcriber.state, steps };
}
const readLine = (line) => { try { return JSON.parse(line); } catch { return null; } };

/** What the panel is told (GET /setup, and `setup` in GET /tutorials). `job`: the helper's { running, last }. */
export function setupState(ctx = {}, job = { running: false, last: null }) {
  const p = plan(ctx);
  return { needed: p.steps.some((s) => !s.done), running: job.running, data: p.data, transcriber: p.transcriber, steps: p.steps.map(({ name, done, what }) => ({ name, done, what })), last: job.last };
}

/** Runs every step that is not done, in order, and stops at the first that fails. `say({ step, state: 'running' |
 *  'failed' | 'done', label, pct, note })`: where it is, for the panel's bar (pct: of the whole run), and a failure
 *  in plain words. Resolves { ok } and never throws. */
export async function runSetup(ctx = {}, say = () => {}) {
  const todo = plan(ctx).steps.filter((s) => !s.done), total = todo.reduce((n, s) => n + s.weight, 0) || 1;
  let before = 0, told = '';
  const tell = (s) => { const key = JSON.stringify(s); if (key !== told) { told = key; say(s); } };
  for (const step of todo) {
    const pct = (fraction = 0) => Math.min(99, Math.round(100 * (before + step.weight * Math.min(1, Math.max(0, fraction))) / total));
    tell({ step: step.name, state: 'running', label: step.label, pct: pct(), note: null });
    try {
      await step.run((fraction) => tell({ step: step.name, state: 'running', label: step.label, pct: pct(fraction), note: null }));
      if (!plan(ctx).steps.find((s) => s.name === step.name)?.done) throw new SetupError('it ended without what it should have left');
    } catch (e) {
      // only our own errors' words are shown: any other exception may quote a path or a page
      const why = e instanceof SetupError || e instanceof FetchError ? e.message : `an unexpected fault (${e?.name ?? 'Error'}${e?.code ? ' ' + e.code : ''})`;
      tell({ step: step.name, state: 'failed', label: step.label, pct: pct(), note: `${step.label} did not finish: ${why}.` });
      return { ok: false, step: step.name };
    }
    before += step.weight;
  }
  tell({ step: null, state: 'done', label: 'Set up', pct: 100, note: null });
  return { ok: true };
}
