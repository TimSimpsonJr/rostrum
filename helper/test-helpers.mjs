// What the helper's tests share: a helper on a temporary tutorials folder, a stand-in for its child processes, and a
// made-up recording. Not a test file: importing a test file would run its tests again.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { start } from './server.mjs';

// Every test runs against a temporary tutorials folder (never the user's) and closes its server whatever happens.
export async function withHelper(opts, fn) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-helper-'));
  // (`whisper` is named: the stand-in below answers Python whisper's arguments, whatever transcriber this machine has)
  const srv = await start({ port: 0, home, runner: fakeRunner(), whisper: 'whisper', ...opts });
  const base = `http://127.0.0.1:${srv.port}`;
  const call = async (method, url, body, headers = {}) => {
    const r = await fetch(base + url, { method, headers, body: body == null ? undefined : typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body) });
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: r.status, text, json, headers: r.headers };
  };
  try { return await fn({ srv, home, base, call, get: (u, h) => call('GET', u, null, h), post: (u, b, h) => call('POST', u, b, h) }); }
  // (a note's frame is grabbed in the background, by ffprobe and ffmpeg, after the request has answered: on Windows
  // such a child still has the video open for a moment after the test is done, and removing the folder then fails
  // with EBUSY; rmSync waits and tries again)
  finally { await srv.close(); fs.rmSync(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
}

/** A stand-in for the helper's child processes: records what was run and plays each program's part with files.
 *  `parts`: { <step name>: (spec) => result } to override one. Every text in it is made up. */
export function fakeRunner(parts = {}, ran = []) {
  const after = (args, flag) => args[args.indexOf(flag) + 1];
  const base = {
    prepare: ({ args }) => {
      const dir = args[2], clean = path.join(dir, 'film', 'clean');
      const rules = fs.existsSync(path.join(dir, 'rules.json')) ? JSON.parse(fs.readFileSync(path.join(dir, 'rules.json'), 'utf8')) : {};
      fs.mkdirSync(clean, { recursive: true });
      fs.writeFileSync(path.join(clean, 'manifest.json'), JSON.stringify({ t0: 0, viewport: { width: 1280, height: 720 }, screens: [{ i: 0, t: 0, path: 'screen-0.json', href: 'https://app.site.test/' }], clicks: [], mic: null }));
      const el = (id, tagName, attributes, ...childNodes) => ({ type: 2, id, tagName, attributes, childNodes });
      const tx = (id, textContent) => ({ type: 3, id, textContent });
      fs.writeFileSync(path.join(clean, 'screen-0.json'), JSON.stringify({ node: { type: 0, id: 1, childNodes: [el(2, 'html', {}, el(3, 'body', {},
        el(4, 'h1', {}, tx(5, 'API Keys')), el(6, 'button', {}, tx(7, 'Copy')), el(8, 'input', { type: 'text', value: 'UserAPIKey-123456' }), el(9, 'p', {}, tx(10, 'A paragraph that is longer than forty characters, so it is cut.'))))] }, initialOffset: { left: 0, top: 0 } }));
      fs.mkdirSync(path.dirname(after(args, '--report')), { recursive: true });
      fs.writeFileSync(after(args, '--report'), JSON.stringify({ screens: 1, clicks: 0, user: false, mic: false, applied: (rules.blind ?? []).map((b) => (b.node === 8 ? { screen: b.screen, ok: true, node: b.node, tag: 'input', length: 17 } : { screen: b.screen, ok: false, node: b.node })),
        kept: (rules.keepColumns ?? []).flatMap((k) => k.columns.map((column) => ({ screen: 0, ok: true, table: 4, column, cells: 2 }))),
        users: (rules.user ?? []).map((u) => ({ host: u.host ?? '', by: u.off ? 'off' : 'rule', ...(u.off ? {} : { screen: 0, node: 5 }), replacements: u.off ? 0 : 3, screens: u.off ? 0 : 1 })),
        blindAll: (rules.blindAll ?? []).map((b, rule) => ({ screen: 0, rule, selector: b.selector, matched: 3, replaced: 2 })),
        blindedColumns: (rules.blindColumns ?? []).flatMap((k) => k.columns.map((column) => ({ screen: 0, rule: 0, ok: true, table: 4, column, cells: 2 }))),
        only: (rules.only ?? []).map((o) => ({ screen: 0, texts: 12, attributes: 3, pictures: 1, keeps: o.keep.map((keep) => ({ rule: 0, keep, ok: true, matched: 1 })) })) }));
      return { code: 0 };
    },
    gestures: ({ args }) => {
      const clean = path.join(args[2], 'film', 'clean');
      fs.writeFileSync(path.join(clean, 'gestures.json'), JSON.stringify({ clock: { zero: 'the first recorded event', micStartsAt: null }, gestures: [] }));
      fs.writeFileSync(path.join(clean, 'layout.json'), JSON.stringify({ 0: { boxes: { 4: { x: 40, y: 20, w: 300, h: 40 }, 6: { x: 600, y: 100, w: 80, h: 30 }, 8: { x: 40, y: 100, w: 400, h: 30 }, 9: { x: 40, y: 300, w: 900, h: 24 } } } }));
      fs.writeFileSync(path.join(clean, 'site.json'), JSON.stringify({ host: 'app.site.test', accent: '#2456c9', font: 'Inter' }));
      return { code: 0 };
    },
    whisper: ({ args }) => {
      const out = after(args, '--output_dir'), input = args.find((a) => /\.(webm|mp3)$/.test(a));
      fs.mkdirSync(out, { recursive: true });
      fs.writeFileSync(path.join(out, path.basename(input, path.extname(input)) + '.json'), JSON.stringify({ segments: [{ words: [{ word: ' hello', start: 0, end: 0.4 }, { word: ' there', start: 0.5, end: 0.9 }] }] }));
      return { code: 0 };
    },
  };
  base.ffprobe = ({ args }) => ({ stdout: args.at(-1).endsWith('.mp3') ? 'mp3\n' : 'pcm_s16le\n' });
  base.ffmpeg = ({ args }) => { fs.copyFileSync(after(args, '-i'), args.at(-1)); return { code: 0 }; };
  base.timing = ({ args }) => {
    const dir = args[2], lines = fs.readFileSync(path.join(dir, 'script.md'), 'utf8').split('\n').filter((l) => /^\| \d/.test(l) && !l.includes('(no narration)')).map((l) => l.split('|')[2].trim());
    fs.writeFileSync(path.join(dir, 'film', 'narration', 'timing.json'), JSON.stringify({ fps: 30, dir: 'narration', sentences: lines.map((text, i) => ({ i, text, file: `vo-${i}.mp3`, clipAt: 4 + 3 * i, clipDur: 2, start: 4 + 3 * i, end: 6 + 3 * i, words: [] })) }));
    return { code: 0 };
  };
  base.measure = ({ args }) => { fs.writeFileSync(path.join(args[2], 'film', 'clean', 'boxes.json'), '{}'); return { code: 0 }; };
  base.stills = () => ({ stdout: 'film: 300 frames at 30 fps (10.0 s); notes: none\nstills: 2 in out/frames: f0000.png f0090.png\n' });
  base.sweep = () => ({ code: 0, stdout: 'sweep rec-1: 0 blind rules\nSWEEP PASSED\n' });
  base.render = ({ args }) => { fs.writeFileSync(args[5], 'a film'); return { code: 0 }; };
  return async (spec) => {
    ran.push(spec.name);
    const part = parts[spec.name] ?? base[spec.name];
    const r = { code: 0, stdout: '', missing: false, ...(part ? await part(spec) : {}) };
    if (spec.save) { fs.mkdirSync(path.dirname(spec.save), { recursive: true }); fs.writeFileSync(spec.save, r.stdout); } // as helper/run.mjs does
    return r;
  };
}

/** A recording as the extension leaves it, of made-up data. */
export function record(home, id, { mic = false } = {}) {
  const dir = path.join(home, id, 'recording');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'events.ndjson'), JSON.stringify({ type: 4, data: { href: 'https://app.site.test/keys?session=abc', width: 1280, height: 720 }, timestamp: 1 }) + '\n');
  if (mic) { fs.writeFileSync(path.join(dir, 'mic.webm'), Buffer.alloc(32 * 1024, 7)); fs.writeFileSync(path.join(dir, 'mic.json'), JSON.stringify({ t0: 1 })); }
  return path.join(home, id);
}
