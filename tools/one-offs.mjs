// A tutorial's one-off moves (<tutorial>/film/moves/<name>/{move.ts, Move.tsx | Cut.tsx | Stage.tsx}, the same shape as
// the library's) copied into film/src/oneoffs/ (gitignored) so the bundle can import them, and their registry written
// beside them (film/src/oneoffs/index.ts, gitignored too; film/src/moves/all.ts joins it to the library's). Nothing
// tracked is written: the library's catalogue and registry list the library only. Call syncOneOffs(tutorial) before
// every bundle (render, stills, sweep, move-still); syncOneOffs(null) leaves the folder with an empty registry.
//
// Before the copy every source file is scanned. The scan is a guard against accidents, not a sandbox: a one-off is
// code written in the user's own session and is as trusted as any other film code that gets bundled. What the scan
// catches is a one-off that reads a file, the network, time or state, which would put unscrubbed data or frames that
// differ from run to run into a film; such a one-off is refused and the build stops. A one-off's move.ts is never run
// in node: its `about` is read from the file's text (tools/moves.mjs `aboutOf`), and must be a plain literal.
//   node --experimental-strip-types tools/one-offs.mjs [<tutorial folder>]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { paths } from './paths.mjs';
import { aboutOf, loadMoves, writeOneOffIndex } from './moves.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url)), SRC = path.join(ROOT, 'film', 'src'), ONE = path.join(SRC, 'oneoffs');
const KIT = path.join(SRC, 'kit'), CONTRACT = path.join(SRC, 'moves', 'contract');
const FORBIDDEN = [/\bfetch\s*\(/, /XMLHttpRequest/, /\bimport\s*\(/, /\brequire\b/, /getBuiltinModule/, /\beval\b/, /\bFunction\s*\(/, /\bprocess\s*[.[?]/, /\bglobalThis\b/, /\b(window|self)\s*(\[|\?\.\s*\[)/,
  /\buseState\b/, /\buseRef\b/, /\buseEffect\b/, /\buseCurrentFrame\b/, /Math\.random/, /Date\.now|new Date\b/, /setTimeout|setInterval|requestAnimationFrame/, /localStorage|indexedDB|document\.cookie/];
const inside = (dir, p) => { const rel = path.relative(dir, p); return !rel.startsWith('..') && !path.isAbsolute(rel); };
/** What an import of `spec` from a move in `dir` may not be, or null: a move imports from its own folder, the kit
 *  (film/src/kit/), the contract, react and remotion. A relative specifier is resolved, so `../../kit/../x` is what it is. */
function badImport(spec, dir) {
  if (!spec.startsWith('.')) return spec === 'react' || spec === 'remotion' ? null : `imports "${spec}"`;
  const to = path.resolve(dir, spec);
  return inside(dir, to) || inside(KIT, to) || to.replace(/\.ts$/, '') === CONTRACT ? null : `imports "${spec}" (outside its folder, the kit and the contract)`;
}
/** The source scan: what in `text` a move may not do (empty = clean). `dir`: the folder the file is bundled from
 *  (a one-off's: film/src/oneoffs/<name>/), against which its imports are resolved. */
export function scan(text, dir = path.join(ONE, 'x')) {
  const specs = [...text.matchAll(/\b(?:from|import)\s*(['"])([^'"\n]*)\1/g)].map((m) => m[2]);
  return [...FORBIDDEN.filter((re) => re.test(text)).map(String), ...specs.map((s) => badImport(s, dir)).filter(Boolean)];
}

export async function syncOneOffs(tutorial) {
  fs.rmSync(ONE, { recursive: true, force: true });
  fs.mkdirSync(ONE, { recursive: true });
  const from = tutorial ? paths(tutorial).moves : null, refused = [];
  if (from && fs.existsSync(from)) for (const dir of fs.readdirSync(from, { withFileTypes: true }).filter((e) => e.isDirectory())) {
    const src = path.join(from, dir.name), to = path.join(ONE, dir.name), before = refused.length;
    if (!fs.existsSync(path.join(src, 'move.ts'))) continue;
    if (!/^[a-z][a-z0-9-]*$/.test(dir.name)) refused.push(`${dir.name}: a one-off's folder is named in lower-case words and hyphens`);
    for (const f of fs.readdirSync(src)) {
      if (!/\.(ts|tsx)$/.test(f)) continue;
      const text = fs.readFileSync(path.join(src, f), 'utf8'), hits = scan(text, to);
      if (hits.length) refused.push(`${dir.name}/${f}: ${hits.join(' ')}`);
      if (f === 'move.ts') try { aboutOf(text, `${dir.name}/move.ts`); } catch (e) { refused.push(e.message); }
    }
    // (only its .ts and .tsx files are copied: they are what was scanned, and all a move is)
    if (refused.length === before) fs.cpSync(src, to, { recursive: true, filter: (p) => p === src || /\.(ts|tsx)$/.test(p) });
  }
  if (refused.length) { fs.rmSync(ONE, { recursive: true, force: true }); writeOneOffIndex(); throw new Error(`a one-off is refused (it reads a file, the network, time or state, imports from outside its folder and the kit, or its \`about\` is not a plain literal):\n  ${refused.join('\n  ')}`); }
  // (loadMoves throws when a one-off takes a library move's name: nothing of it is left then)
  try { writeOneOffIndex(await loadMoves()); } catch (e) { fs.rmSync(ONE, { recursive: true, force: true }); writeOneOffIndex(); throw e; }
  return fs.readdirSync(ONE).filter((d) => d !== 'index.ts');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { const synced = await syncOneOffs(process.argv[2] ?? null); console.log(synced.length ? `one-offs: ${synced.join(', ')}` : 'no one-offs'); }
  catch (e) { console.log(String(e?.message ?? e)); process.exit(1); }
}
