// A move alone, as stills: node --experimental-strip-types tools/move-still.mjs <name> [--t 0.3,1.2] [--inputs '<json>'] [--tone dark] [--out <folder>] [--tutorial <folder>] [--on <folder>] [--with type]
// (`--tutorial`: a one-off of that tutorial's film/moves/; it is still drawn on the fixture film, never on the tutorial's screens)
// Renders the `Move` still (film/src/MoveLook.tsx) on the fixture film at each second given (default: a third, two
// thirds and the end of the move's own length), to <out>/<name>-<t>.png. <out> defaults to <tutorials home>/.moves
// (ROSTRUM_TUTORIALS, else the tutorials folder: tools/data.mjs): the cache the spec names; nothing is packaged. Inputs default to the
// move's own example (its `about.example`: the first of `moves`, or `cut`, with `move`, `at` and `until` dropped).
import fs from 'node:fs';
import path from 'node:path';
import { tutorialsHome } from './data.mjs';
import { fileURLToPath } from 'node:url';
import { loadMoves } from './moves.mjs';
import { syncOneOffs } from './one-offs.mjs';
import { render } from './render.mjs';

const args = process.argv.slice(2), name = args[0], opt = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : undefined);
// (`--on <folder>`: a copy of the fixture film to draw on instead, one that holds a supplied picture or clip for an
// image or footage stage in its film/media/ or film/brand/. `--with type`: a stage with a title and cards on it; else a window)
const ROOT = fileURLToPath(new URL('..', import.meta.url)), FIXTURE = opt('--on') ? path.resolve(opt('--on')) : path.join(ROOT, 'fixtures', 'tutorials', 'fixture-film');
if (!name || name.startsWith('--')) { console.log('usage: move-still.mjs <name> [--t s,s] [--inputs json] [--tone light|dark] [--out folder]'); process.exit(1); }
if (!fs.existsSync(path.join(FIXTURE, 'film', 'clean', 'boxes.json'))) { console.log('the fixture film is not made: node tools/make-fixture-film.mjs && node tools/measure-boxes.mjs fixtures/tutorials/fixture-film'); process.exit(1); }
// the fixture film has no one-offs; `--tutorial <folder>` syncs that tutorial's, so one of its own can be looked at
await syncOneOffs(opt('--tutorial') ?? null);
const move = (await loadMoves()).find((m) => m.name === name);
if (!move) { console.log(`no move "${name}" (npm run moves -- --list)`); process.exit(1); }
if (!move.draws) { console.log(`"${name}" is staged by the engine (its key: ${move.module.about.use}): look at it in a film (tools/stills.mjs)`); process.exit(1); }
const ex = move.module.about.example ?? {}, use = ex.moves?.[0] ?? ex.cut ?? ex.stage ?? ex;
const { move: _m, at: _a, until: _u, line: _l, ...fromExample } = use;
const inputs = opt('--inputs') ? JSON.parse(opt('--inputs')) : fromExample;
const bad = move.module.check?.(inputs); if (bad) { console.log(`${name}: ${bad}`); process.exit(1); }
// (a one-off's `check` and `takes` are not run in node: the still uses its own `takes` in the browser; give `--t` for its moments)
const own = move.module.takes?.(inputs), takes = own ?? (move.draws === 'Cut' ? 0.7 : 2);
const ts = opt('--t') ? opt('--t').split(',').map(Number) : [takes / 3, (2 * takes) / 3, takes].map((x) => +x.toFixed(2));
const out = path.resolve(opt('--out') ?? path.join(process.env.ROSTRUM_TUTORIALS ?? tutorialsHome(), '.moves'));
fs.mkdirSync(out, { recursive: true });
for (const t of ts) {
  const file = path.join(out, `${name}-${t}.png`);
  const code = render('still', FIXTURE, 'Move', file, ['--props', JSON.stringify({ move: name, inputs, t, tone: opt('--tone') ?? inputs.tone ?? 'light', ...(own != null ? { takes: own } : {}), ...(opt('--with') ? { show: opt('--with') } : {}) }), '--frame', '0'], [name]);
  if (code) process.exit(code);
  console.log(file);
}
