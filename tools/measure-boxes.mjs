// node tools/measure-boxes.mjs <tutorial folder>
// Measures the nodes that <tutorial>/film/beats.json names (`nodes`: name -> [screen, node id]) in the rebuilt screens and
// writes <tutorial>/film/clean/boxes.json: per name its box in recorded px, with its row, its group and a spot for the
// cursor where the page gives them (film/src/tutorial/Measure.tsx). Prints names and sizes only, never page text.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { paths, publicDirOf, removeBundle } from './paths.mjs';
import { ensureOneOffIndex } from './moves.mjs';

/** screen -> node ids, for every screen a beat file shows as a window of some of its nodes (`window` on a beat): the film lays
 *  such a screen out unclipped (RecordedScreen `unclip`), so it is measured, probed and swept the same way. */
export function windowsIn(file) {
  const out = {};
  let screen;
  for (const b of file?.beats ?? []) { screen = b.screen ?? screen; const ids = (b.window == null ? [] : [b.window].flat()).map((name) => file.nodes?.[name]?.[1]).filter((id) => id != null); if (ids.length) out[screen] = ids; }
  return out;
}

/** The film's browser bar, when a beat has one (`bar`): which screen it is over, how wide that screen is, and its spec.
 *  Its hero bookmark is measured with the nodes, as "bar:hero". */
export function barIn(file, manifest) {
  let screen;
  for (const b of file?.beats ?? []) {
    screen = b.screen ?? screen;
    if (b.bar && screen != null) return { screen, width: (manifest?.screens?.find((s) => s.i === screen)?.viewport ?? manifest?.viewport ?? file.viewport).width, spec: b.bar };
  }
  return null;
}

export async function measureBoxes(tutorial) {
  const P = paths(tutorial), publicDir = publicDirOf(tutorial);
  const file = JSON.parse(fs.readFileSync(P.beats, 'utf8')), nodes = file.nodes;
  const bar = barIn(file, fs.existsSync(P.manifest) ? JSON.parse(fs.readFileSync(P.manifest, 'utf8')) : null);
  const { bundle } = await import('@remotion/bundler');
  const { selectComposition, renderStill } = await import('@remotion/renderer');
  const root = fileURLToPath(new URL('..', import.meta.url)), inputProps = { nodes, windows: windowsIn(file), bar };
  let boxes;
  ensureOneOffIndex();   // (film/src/oneoffs/index.ts must be there for the bundle to resolve)
  const serveUrl = await bundle({ entryPoint: path.join(root, 'film/src/index.ts'), publicDir });
  try {
  const composition = await selectComposition({ serveUrl, id: 'Measure', inputProps, logLevel: 'error' });
  fs.mkdirSync(P.out, { recursive: true });
  // the renderer echoes the page's console; nothing of the page goes to the terminal
  const out = process.stdout.write, err = process.stderr.write;
  process.stdout.write = process.stderr.write = () => true;
  try { await renderStill({ composition, serveUrl, output: path.join(P.out, 'measure.png'), inputProps, logLevel: 'error', onBrowserLog: (log) => { if (log.text.startsWith('RT-BOXES:')) boxes = JSON.parse(log.text.slice(9)); } }); }
  finally { process.stdout.write = out; process.stderr.write = err; }
  } finally { removeBundle(serveUrl); } // the bundle holds a copy of the public dir: not left behind
  if (!boxes) throw new Error('the Measure still did not report');
  const lost = Object.keys(nodes).filter((n) => !boxes[n]);
  if (lost.length) throw new Error(`not found in their screens: ${lost.join(', ')}`);
  fs.writeFileSync(P.boxes, JSON.stringify(boxes, null, 1) + '\n');
  return boxes;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) { console.log('usage: measure-boxes.mjs <tutorial folder>'); process.exit(1); }
  const boxes = await measureBoxes(path.resolve(process.argv[2]));
  for (const [name, b] of Object.entries(boxes)) console.log(`  ${name.padEnd(14)} screen ${b.screen}  ${Math.round(b.w)} x ${Math.round(b.h)} at ${Math.round(b.x)}, ${Math.round(b.y)}${b.row ? `  row ${Math.round(b.row.w)} wide` : ''}${b.group ? `  group ${Math.round(b.group.w)} x ${Math.round(b.group.h)}` : ''}${b.spot ? `  spot ${b.spot.join(', ')}` : ''}`);
  process.exit(0);
}
