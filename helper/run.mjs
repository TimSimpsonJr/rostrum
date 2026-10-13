// How the helper runs a program: no shell, an argument list, a time limit. The helper never loads Remotion or reads
// a recording itself for a stage: the plugin's tools do, each in a process of its own.
// What a program prints is kept only where a caller asks (`save`: a file under the tutorial's out/), and only its
// standard output: the tools print structure, counts and node ids by their own contract. Standard error is counted and
// dropped (an exception's text may quote what the program was reading).
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

/** A stage's failure, said in words that are safe to store and show: stage names, exit codes, counts. Never page text. */
export class StageError extends Error {}

const KEEP = 4 * 1024 * 1024;

/** A child's environment: the caller's, with the folder of the Node that runs the helper first on PATH. The helper
 *  may have been started with a Node that is not on PATH (the one the panel fetched; Homebrew's, under an app
 *  started from the Dock), and what it runs calls `node` by name: npm does, for a package's install script. */
export function withNode(env = process.env, execPath = process.execPath, platform = process.platform) {
  const p = platform === 'win32' ? path.win32 : path.posix, key = Object.keys(env).find((k) => /^path$/i.test(k)) ?? 'PATH';
  return { ...env, [key]: [p.dirname(execPath), env[key]].filter(Boolean).join(p.delimiter) };
}

/** Runs `cmd args` and resolves { code, stdout, missing }. `missing`: the program was not found. `save`: write the
 *  standard output to this file. `timeout` (ms): the program is stopped and the code is 'timeout'.
 *  `onLine`: each line of standard output as it arrives (progress). */
export function run({ cmd, args = [], cwd, timeout = 10 * 60 * 1000, save = null, env = process.env, onLine = null }) {
  return new Promise((resolve) => {
    let child;
    try { child = spawn(cmd, args, { cwd, env: withNode(env), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); } catch { return resolve({ code: null, stdout: '', missing: true }); }
    const chunks = [];
    let size = 0, timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeout);
    let rest = '';
    child.stdout.on('data', (c) => {
      size += c.length; if (size <= KEEP) chunks.push(c);
      if (!onLine) return;
      rest += c.toString('utf8');
      const parts = rest.split(/\r?\n|\r/); rest = parts.pop() ?? '';
      for (const line of parts) if (line.trim()) { try { onLine(line); } catch { /* a listener must not fail the run */ } }
    });
    child.stderr.on('data', () => {});
    child.on('error', (e) => { clearTimeout(timer); resolve({ code: null, stdout: '', missing: e.code === 'ENOENT' }); });
    child.on('close', (code) => {
      clearTimeout(timer);
      const stdout = Buffer.concat(chunks).toString('utf8');
      if (save) { try { fs.mkdirSync(path.dirname(save), { recursive: true }); fs.writeFileSync(save, stdout); } catch { /* a log that cannot be written must not fail the stage */ } }
      resolve({ code: timedOut ? 'timeout' : code, stdout, missing: false });
    });
  });
}
