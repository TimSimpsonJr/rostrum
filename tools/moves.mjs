// The moves library's catalogue and registry, from each move's pure side (film/src/moves/<name>/move.ts, and the
// engine's list in moves/engine/move.ts). Both list the library only and are tracked. A tutorial's one-offs
// (film/src/oneoffs/ when synced: tools/one-offs.mjs) get a registry of their own, film/src/oneoffs/index.ts,
// gitignored like the folder; the film joins the two (film/src/moves/all.ts). A one-off never touches a tracked file.
//   node --experimental-strip-types tools/moves.mjs            writes skills/rostrum/references/moves.md and film/src/moves/index.ts
//   node --experimental-strip-types tools/moves.mjs --check    exit 1 when either file is stale
//   node --experimental-strip-types tools/moves.mjs --list     every move: name, use, for
// `loadMoves()` is what the sweep and the tests use: name -> module (about, check, text, takes).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const LIB = path.join(ROOT, 'film', 'src', 'moves'), ONE = path.join(ROOT, 'film', 'src', 'oneoffs');
export const DOC = path.join(ROOT, 'skills', 'rostrum', 'references', 'moves.md'), INDEX = path.join(LIB, 'index.ts'), ONE_INDEX = path.join(ONE, 'index.ts');

const USES = ['moves', 'cut', 'stage'];
/** What is wrong with an about, or null. */
export function checkAbout(a) {
  if (!a || typeof a !== 'object') return 'no about';
  if (!/^[a-z][a-z0-9-]*$/.test(String(a.name ?? ''))) return `name "${a.name}" is not lower-case words and hyphens`;
  for (const k of ['for', 'takes', 'use']) if (typeof a[k] !== 'string' || !a[k].trim()) return `${a.name}: "${k}" is a sentence`;
  if (!a.inputs || typeof a.inputs !== 'object') return `${a.name}: inputs is an object of sentences`;
  for (const k of ['text', 'reads']) if (!Array.isArray(a[k]) || !a[k].every((s) => typeof s === 'string')) return `${a.name}: "${k}" is a list of strings`;
  for (const k of ['cues', 'lifts']) if (a[k] != null && !(Array.isArray(a[k]) && a[k].every((s) => typeof s === 'string'))) return `${a.name}: "${k}" is a list of input names`;
  if (a.cursor != null && !['rides', 'fades'].includes(a.cursor)) return `${a.name}: "cursor" (a cut's) is rides or fades`;
  if (a.toneAt != null && !(typeof a.toneAt === 'number' && a.toneAt >= 0 && a.toneAt <= 1)) return `${a.name}: "toneAt" (a cut's) is a share of its length, 0 to 1`;
  if (a.example != null && typeof a.example !== 'object') return `${a.name}: example is a beat, or the part of one`;
  return null;
}

/** The `about` of a move.ts, read from its text without running it: `export const about = { ... }` as a plain literal
 *  (strings, numbers, true, false, null, lists and objects of those). Anything else throws, naming `where`. */
export function aboutOf(src, where = 'move.ts') {
  const no = (why) => { throw new Error(`${where}: \`about\` must be a plain literal (${why}): it is read without running the file`); };
  const head = /export\s+const\s+about\s*(?::\s*[A-Za-z_.]+\s*)?=\s*/.exec(src);
  if (!head) no('no `export const about = {`');
  let i = head.index + head[0].length;
  const skip = () => { for (;;) { const m = /^(\s+|\/\/[^\n]*|\/\*[\s\S]*?\*\/)/.exec(src.slice(i, i + 4000)); if (!m) return; i += m[0].length; } };
  const value = () => {
    skip();
    const c = src[i];
    if (c === '{' || c === '[') {
      const list = c === '[', out = list ? [] : {}, end = list ? ']' : '}';
      i++;
      for (;;) {
        skip();
        if (src[i] === end) { i++; return out; }
        if (list) out.push(value());
        else {
          const id = /^[A-Za-z_$][\w$]*/.exec(src.slice(i, i + 200)), key = id ? (i += id[0].length, id[0]) : (src[i] === '\'' || src[i] === '"') ? value() : no(`a key at character ${i}`);
          if (key === '__proto__') no('a key named __proto__');
          skip();
          if (src[i] !== ':') no(`a key without a value at character ${i}`);
          i++;
          out[key] = value();
        }
        skip();
        if (src[i] === ',') i++; else if (src[i] !== end) no(`unexpected text at character ${i}`);
      }
    }
    if (c === '\'' || c === '"' || c === '`') {
      let s = '';
      for (i++; src[i] !== c; i++) {
        if (i >= src.length || (c !== '`' && src[i] === '\n')) no('a string that does not end');
        if (c === '`' && src[i] === '$' && src[i + 1] === '{') no('a template with ${}');
        if (src[i] === '\\') { i++; s += { n: '\n', t: '\t', r: '\r' }[src[i]] ?? src[i]; } else s += src[i];
      }
      i++;
      return s;
    }
    const word = /^(-?\d+(\.\d+)?|true|false|null)\b/.exec(src.slice(i, i + 40));
    if (!word) no(`not a literal at character ${i}`);
    i += word[0].length;
    return JSON.parse(word[0]);
  };
  const about = value();
  if (!about || typeof about !== 'object' || Array.isArray(about)) no('not an object');
  return about;
}
/** The authored strings among `inputs`, by the paths an about's `text` lists ('text', 'items[].text'). */
export function textAt(inputs, paths = []) {
  const walk = (v, parts) => (v == null ? [] : !parts.length ? [v].flat().filter((s) => typeof s === 'string') : parts[0].endsWith('[]') ? (Array.isArray(v[parts[0].slice(0, -2)]) ? v[parts[0].slice(0, -2)] : []).flatMap((x) => walk(x, parts.slice(1))) : walk(v[parts[0]], parts.slice(1)));
  return paths.flatMap((p) => walk(inputs, String(p).split('.')));
}

const dirsOf = (base) => (fs.existsSync(base) ? fs.readdirSync(base, { withFileTypes: true }).filter((e) => e.isDirectory() && fs.existsSync(path.join(base, e.name, 'move.ts'))).map((e) => e.name).sort() : []);

/** Every move: [{ name, dir, base, kind, many, module, draws: 'Move' | 'Cut' | 'Stage' | null }]. A module may list
 *  several abouts (`many`: the engine); those have no drawing of their own. */
export async function loadMoves({ oneOffs = true } = {}) {
  const out = [];
  for (const [base, kind] of [[LIB, 'library'], ...(oneOffs ? [[ONE, 'one-off']] : [])]) {
    for (const dir of dirsOf(base)) {
      const file = path.join(base, dir, 'move.ts');
      // A one-off's move.ts is never run in node: its `about` is read from the file's text, and the strings it shows
      // are taken from the inputs its `about.text` names. (Its `check` and `takes` run only in the film's browser.)
      let m;
      if (kind === 'one-off') { const about = aboutOf(fs.readFileSync(file, 'utf8'), path.relative(ROOT, file)); m = { about, text: (inputs) => textAt(inputs, about?.text) }; }
      else m = await import(pathToFileURL(file).href);
      const draws = ['Move', 'Cut', 'Stage'].find((f) => fs.existsSync(path.join(base, dir, `${f}.tsx`))) ?? null;
      for (const about of m.abouts ?? [m.about]) {
        const bad = checkAbout(about);
        if (bad) throw new Error(`${path.relative(ROOT, file)}: ${bad}`);
        out.push({ name: about.name, dir, base, kind, many: !!m.abouts, draws: m.abouts ? null : draws, module: { about, check: m.check, text: m.text, takes: m.takes, recedes: m.recedes } });
      }
    }
  }
  const seen = new Set();
  for (const m of out) { if (seen.has(m.name)) throw new Error(`two moves are named "${m.name}"`); seen.add(m.name); }
  return out;
}
/** name -> module, for makeBeats and the sweep. */
export const moveMap = (moves) => Object.fromEntries(moves.map((m) => [m.name, m.module]));

const esc = (s) => String(s).replace(/\|/g, '\\|');
export function catalogue(moves) {
  const lines = ['# The moves (generated by tools/moves.mjs from film/src/moves/*/move.ts: do not edit)', '',
    'Every move a beat file can name, by its `use`: `moves` goes on a beat as `"moves": [{ "move": "<name>", "at": <cue>, "until": <cue>, ...inputs }]`;',
    '`cut` on the first beat of a new shot as `"cut": { "move": "<name>", ...inputs }`; `stage` as the file\'s `"stage"` or a scene\'s (`"light"`, `"dark"`, or `{ "move": "<name>", "tone": "light" | "dark", ...inputs }`; `references/stages.md`); an engine key is',
    'written as `references/build.md` shows. Inputs that are names must be in `nodes`; cues are words of the beat\'s line; authored text is read by the sweep.',
    'To see one: `node "<skill dir>/scripts/helper.mjs" moves <name> look`. A one-off (a tutorial\'s own film/moves/<name>/) is not listed here: its own `about` describes it.', ''];
  const groups = [['moves', 'On a beat (`moves`)'], ['cut', 'Between shots (`cut`)'], ['stage', 'Stages (`stage`)'], ['engine', 'The engine\'s own (by their keys)']];
  for (const [g, title] of groups) {
    const mine = moves.filter((m) => (g === 'engine' ? !USES.includes(m.module.about.use) : m.module.about.use === g));
    if (!mine.length) continue;
    lines.push(`## ${title}`, '');
    for (const { module: { about: a } } of mine) {
      lines.push(`### ${a.name}`, '', a.for, '', `- use: \`${a.use}\`; takes: ${a.takes}`, `- reads: ${a.reads.join(', ') || 'nothing'}; authored text: ${a.text.join(', ') || 'none'}`, '', '| input | what |', '|---|---|');
      for (const [k, v] of Object.entries(a.inputs)) lines.push(`| \`${k}\` | ${esc(v)} |`);
      if (a.example) lines.push('', '```json', JSON.stringify(a.example), '```');
      lines.push('');
    }
  }
  return lines.join('\n');
}
/** The registry of the library's moves (film/src/moves/index.ts), or with `oneOffs` that of the synced one-offs
 *  (film/src/oneoffs/index.ts): the same four tables, which film/src/moves/all.ts joins. */
export function registry(all, oneOffs = false) {
  const moves = all.filter((m) => (m.kind === 'one-off') === oneOffs);
  const rel = (m) => `./${m.dir}`;
  const mods = [...new Set(moves.map(rel))], p = (m) => `p${mods.indexOf(rel(m))}`;   // one import per folder (the engine's lists many)
  const drawn = moves.filter((m) => m.draws), id = (m) => `${m.draws}${drawn.indexOf(m)}`;
  const lines = [oneOffs ? '// GENERATED by tools/one-offs.mjs from the synced tutorial\'s film/moves/ (gitignored; empty when none is synced): do not edit.' : '// GENERATED by tools/moves.mjs from film/src/moves/*/move.ts (the library only; one-offs: ../oneoffs/index.ts, joined in all.ts): do not edit.',
    '// eslint-disable', 'import type React from \'react\';', `import type { MoveModule } from '${oneOffs ? '../moves/contract' : './contract'}';`];
  mods.forEach((r, i) => lines.push(`import * as p${i} from '${r}/move.ts';`));   // (the extensions are written out: on a file system that ignores case, './x/Move' finds move.ts)
  for (const m of drawn) lines.push(`import ${id(m)} from '${rel(m)}/${m.draws}.tsx';`);
  lines.push('/** the pure side of every move, by name (the engine\'s have no component) */', 'export const PURE: Record<string, MoveModule> = {');
  for (const m of moves) lines.push(m.many ? `  '${m.name}': { about: ${p(m)}.abouts.find((a) => a.name === '${m.name}')! },` : `  '${m.name}': { about: ${p(m)}.about, check: (${p(m)} as any).check, text: (${p(m)} as any).text, takes: (${p(m)} as any).takes, recedes: (${p(m)} as any).recedes },`);
  lines.push('};');
  for (const kind of ['Move', 'Cut', 'Stage']) lines.push(`export const ${kind.toUpperCase()}S: Record<string, React.FC<any>> = {`, ...drawn.filter((m) => m.draws === kind).map((m) => `  '${m.name}': ${id(m)},`), '};');
  lines.push('');
  return lines.join('\n');
}
const same = (f, s) => fs.existsSync(f) && fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n') === s;   // (a checkout on Windows may have given the files CRLF: that is not stale)
/** The one-offs' registry, written when it is not what `moves` gives (no moves: the empty one). Never a tracked file. */
export function writeOneOffIndex(moves = []) {
  const idx = registry(moves, true);
  if (!same(ONE_INDEX, idx)) { fs.mkdirSync(ONE, { recursive: true }); fs.writeFileSync(ONE_INDEX, idx); }
}
/** Before a bundle that did not sync a tutorial (measure, gestures): the one-offs' registry must be there for
 *  film/src/moves/all.ts to resolve, and a fresh checkout has none. */
export const ensureOneOffIndex = () => { if (!fs.existsSync(ONE_INDEX)) writeOneOffIndex(); };

/** Writes the tracked catalogue and registry from the library (returns which were stale; `check`: writes nothing),
 *  and the one-offs' own registry from whatever is synced. */
export async function write({ check = false } = {}) {
  const moves = await loadMoves(), lib = moves.filter((m) => m.kind === 'library');
  const files = [[DOC, catalogue(lib)], [INDEX, registry(lib)]];
  const stale = files.filter(([f, s]) => !same(f, s)).map(([f]) => path.relative(ROOT, f));
  if (check) return stale;
  for (const [f, s] of files) if (stale.includes(path.relative(ROOT, f))) fs.writeFileSync(f, s);   // (only what changed)
  writeOneOffIndex(moves);
  return stale;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes('--list')) { for (const m of await loadMoves()) console.log(`${m.name} (${m.module.about.use}${m.kind === 'one-off' ? ', one-off' : ''}): ${m.module.about.for}`); process.exit(0); }
  const stale = await write({ check: args.includes('--check') });
  if (args.includes('--check')) { console.log(stale.length ? `stale: ${stale.join(', ')} (run: npm run moves)` : 'moves.md and index.ts are current'); process.exit(stale.length ? 1 : 0); }
  console.log(`wrote ${path.relative(ROOT, DOC)} and ${path.relative(ROOT, INDEX)}${stale.length ? ` (changed: ${stale.join(', ')})` : ' (unchanged)'}`);
}
