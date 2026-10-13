// Frames of a tutorial's film, many at once: the bundle is made once and one browser renders them all.
//   node tools/stills.mjs <tutorial folder> [--frames 0,90,300] [--moments] [--every 30]
// Writes <tutorial>/out/frames/f<n>.png (n = the frame number, four digits) and prints what the film came to: its
// length, the faults the beat file has, and the frames written. `--moments`: the frames worth looking at, as the film
// itself names them (each line's start, each cue and click, each cut and opening, a list's blur, items and clearing;
// film/src/tutorial/beats.ts).
// `--every n`: every nth frame as well. The public dir is <tutorial>/film (tools/paths.mjs); the bundle is removed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { paths, publicDirOf, removeBundle } from './paths.mjs';
import { syncOneOffs } from './one-offs.mjs';
import { topUpKit } from './kit.mjs';

export const MAX = 240;
const name = (n) => `f${String(n).padStart(4, '0')}.png`;

/** The frames to render: the ones asked for, the film's own moments, every nth. Inside the film, in order, no repeats. */
export function framesFor({ frames = [], moments = null, every = 0 }, { total, fps }) {
  const want = new Set(frames);
  if (moments) for (const t of [moments.enter, ...moments.cuts, ...moments.lines, ...moments.actions.map((a) => a.t), ...moments.opens.flatMap((t) => [t, t + 0.3]), ...moments.selects, ...(moments.list ?? []).flatMap((l) => [l.blur, ...l.items, ...l.items.map((t) => t + 0.2), l.out, l.sharp]),
    // a field filling, a screen becoming its next capture (just before and after), the browser bar coming and going
    ...(moments.fills ?? []), ...(moments.swaps ?? []).flatMap((t) => [t - 1 / fps, t, t + 0.25]), ...(moments.bar ?? []).flatMap((t, i, all) => (i % 2 ? [t] : [t, (t + all[i + 1]) / 2])),
    // a library move or a one-off setting and clearing (0.4 s in, 0.2 s before it goes); a cut move's start, middle and end
    ...(moments.moves ?? []).flatMap((t, i) => (i % 2 ? [t - 0.2] : [t + 0.4])), ...(moments.cutMoves ?? [])]) want.add(Math.round(t * fps));
  if (every > 0) for (let n = 0; n < total; n += every) want.add(n);
  if (moments || every > 0) want.add(total - 1);
  return [...want].filter((n) => Number.isInteger(n) && n >= 0 && n < total).sort((a, b) => a - b);
}

export async function renderStills(tutorial, ask) {
  await syncOneOffs(tutorial); // the tutorial's own moves, into the bundle (a one-off that reads outside itself stops here)
  const P = paths(tutorial), publicDir = publicDirOf(tutorial), root = fileURLToPath(new URL('..', import.meta.url));
  topUpKit(publicDir); // the sounds of the moves its beat file names (tools/kit.mjs)
  const { bundle } = await import('@remotion/bundler');
  const { openBrowser, renderStill, selectComposition } = await import('@remotion/renderer');
  const serveUrl = await bundle({ entryPoint: path.join(root, 'film/src/index.ts'), publicDir });
  let browser;
  try {
    browser = await openBrowser('chrome');
    let film;
    // the renderer echoes the page's console; nothing of the page goes to the terminal
    const out = process.stdout.write, err = process.stderr.write;
    process.stdout.write = process.stderr.write = () => true;
    let written;
    try {
      const composition = await selectComposition({ serveUrl, id: 'Tutorial', inputProps: {}, puppeteerInstance: browser, logLevel: 'error', onBrowserLog: (log) => { if (log.text.startsWith('RT-BEATS:')) film = JSON.parse(log.text.slice(9)); } });
      if (composition.props?.missing) throw new Error(composition.props.missing);
      const total = composition.durationInFrames, fps = composition.fps;
      written = framesFor({ ...ask, moments: ask.moments ? film?.moments : null }, { total, fps });
      if (written.length > MAX) throw new Error(`${written.length} frames asked for; ${MAX} at most`);
      fs.mkdirSync(path.join(P.out, 'frames'), { recursive: true });
      for (const n of written) await renderStill({ composition, serveUrl, output: path.join(P.out, 'frames', name(n)), frame: n, inputProps: {}, puppeteerInstance: browser, logLevel: 'error' });
      return { total, fps, faults: film?.faults ?? [], frames: written, moments: film?.moments ?? null };
    } finally { process.stdout.write = out; process.stderr.write = err; }
  } finally {
    try { await browser?.close({ silent: true }); } catch { /* already gone */ }
    removeBundle(serveUrl); // the bundle holds a copy of the public dir: not left behind
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), opt = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : undefined);
  if (!args[0] || args[0].startsWith('--')) { console.log('usage: stills.mjs <tutorial folder> [--frames 0,90,300] [--moments] [--every 30]'); process.exit(1); }
  const ask = { frames: (opt('--frames') ?? '').split(',').filter(Boolean).map(Number), moments: args.includes('--moments'), every: Number(opt('--every') ?? 0) };
  try {
    const r = await renderStills(path.resolve(args[0]), ask);
    console.log(`film: ${r.total} frames at ${r.fps} fps (${(r.total / r.fps).toFixed(1)} s); notes: ${r.faults.length ? r.faults.join('; ') : 'none'}`);
    if (r.moments) console.log(`moments (seconds): lines ${r.moments.lines.map((t) => t.toFixed(2)).join(', ')}; actions ${r.moments.actions.map((a) => `${a.cursor} ${a.target ?? ''} ${a.t.toFixed(2)}`).join(', ')}; cuts ${r.moments.cuts.map((t) => t.toFixed(2)).join(', ') || 'none'}${(r.moments.list ?? []).map((l) => `; list blur ${l.blur.toFixed(2)}, items ${l.items.map((t) => t.toFixed(2)).join(' ')}, out ${l.out.toFixed(2)}, sharp ${l.sharp.toFixed(2)}`).join('')}`);
    console.log(`stills: ${r.frames.length} in out/frames: ${r.frames.map(name).join(' ')}`);
    process.exit(0);
  } catch (e) { console.log(`stills failed: ${String(e?.message ?? e).slice(0, 200)}`); process.exit(1); }
}
