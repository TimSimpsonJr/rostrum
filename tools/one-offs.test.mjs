import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { aboutOf, loadMoves, textAt, write } from './moves.mjs';
import { scan, syncOneOffs } from './one-offs.mjs';

const ABOUT = `export const about = { name: 'fresh', use: 'moves', for: 'A one-off.', inputs: { text: 'a word (authored)' }, takes: '1 s', text: ['text', 'items[].label'], reads: [] };\n`;
// (it throws when run: a sync that succeeds has not run it)
const MOVE = `${ABOUT}export const takes = () => 1;\nthrow new Error('a one-off\\'s move.ts was run in node');\n`;
const DRAW = `import React from 'react';\nimport type { MoveProps } from '../../moves/contract';\nconst Fresh: React.FC<MoveProps> = ({ t }) => <div>{t.toFixed(1)}</div>;\nexport default Fresh;\n`;
const INDEX = new URL('../film/src/moves/index.ts', import.meta.url), ONE = new URL('../film/src/oneoffs/', import.meta.url), ONE_INDEX = new URL('index.ts', ONE), DOC = new URL('../skills/rostrum/references/moves.md', import.meta.url);
/** what git says is changed among tracked files (untracked lines left out) */
const tracked = () => spawnSync('git', ['status', '--porcelain'], { cwd: new URL('..', import.meta.url), encoding: 'utf8' }).stdout.split('\n').filter((l) => l && !l.startsWith('??')).join('\n');

// (these tests write film/src/oneoffs/ and its generated registry, so they are the one test file that reads the
// registries: test files run side by side, and a second reader would see one mid-sync)
test('one-offs: a tutorial\'s film/moves/ is synced into the bundle and its own registry without its move.ts being run or a tracked file being touched; one that reads outside itself is refused; none leaves the repo in the shipped state', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rostrum-oneoff-')), m = path.join(dir, 'film', 'moves', 'fresh');
  fs.mkdirSync(m, { recursive: true });
  const put = (move, draw) => { fs.writeFileSync(path.join(m, 'move.ts'), move); fs.writeFileSync(path.join(m, 'Move.tsx'), draw); };
  put(MOVE, DRAW);
  try {
    assert.deepEqual(await write({ check: true }), [], 'the catalogue and the registry are current (else run: npm run moves, and commit what it writes)');
    const before = tracked(), lib = [INDEX, DOC].map((f) => fs.readFileSync(f, 'utf8'));
    assert.deepEqual(await syncOneOffs(dir), ['fresh']);
    assert.match(fs.readFileSync(ONE_INDEX, 'utf8'), /'fresh': Move\d+/);
    // nothing tracked moved: `git status --porcelain` shows no file it did not show before, and the library's
    // registry and catalogue are byte for byte what they were
    assert.equal(tracked(), before, 'the sync modified a tracked file');
    assert.deepEqual([INDEX, DOC].map((f) => fs.readFileSync(f, 'utf8')), lib);
    assert.deepEqual(await write({ check: true }), []);
    // in node its `about` is the file's literal, and its authored strings are the inputs `about.text` names
    const fresh = (await loadMoves()).find((x) => x.name === 'fresh');
    assert.equal(fresh.kind, 'one-off'); assert.equal(fresh.module.about.for, 'A one-off.'); assert.equal(fresh.module.takes, undefined);
    assert.deepEqual(fresh.module.text({ text: 'Step 2', items: [{ label: 'One' }, { label: 'Two', icon: 'x' }], other: 'no' }), ['Step 2', 'One', 'Two']);
    // every one of these is refused, and nothing of the one-off is left in the bundle or the registry
    const refusals = {
      'fetch': [MOVE, DRAW.replace('<div>', '<div onClick={() => fetch("x")}>')],
      'getBuiltinModule': [MOVE, DRAW.replace('export default', 'const fsx = (0, process).getBuiltinModule("fs");\nexport default')],
      'eval': [MOVE, DRAW.replace('export default', 'eval("1");\nexport default')],
      'new Function': [MOVE, DRAW.replace('export default', 'new Function("return 1")();\nexport default')],
      'process': [MOVE, DRAW.replace('export default', 'const e = process.env;\nexport default')],
      'globalThis indexing': [MOVE, DRAW.replace('export default', 'const p = globalThis["pro" + "cess"];\nexport default')],
      'window indexing': [MOVE, DRAW.replace('export default', 'const p = window["fe" + "tch"];\nexport default')],
      'require': [MOVE, DRAW.replace('export default', 'const f = require("fs");\nexport default')],
      'dynamic import': [MOVE, DRAW.replace('export default', 'const f = import("node:fs");\nexport default')],
      'an import that climbs out through the kit': [MOVE, DRAW.replace("'../../moves/contract'", "'../../kit/../tutorial/beats'")],
      'an import that climbs out of its own folder': [MOVE, DRAW.replace("'../../moves/contract'", "'./../../../anything'")],
      'an export from outside': [MOVE, `${DRAW}export { makeBeats } from '../../tutorial/beats';\n`],
      'a package that is not react or remotion': [MOVE, DRAW.replace("from 'react'", "from 'react-dom/server'")],
      'an about that is computed': [MOVE.replace("for: 'A one-off.'", 'for: [1].map(String).join()'), DRAW],
      'an about that is not there': [MOVE.replace('export const about', 'const about'), DRAW],
    };
    for (const [what, [move, draw]] of Object.entries(refusals)) {
      put(move, draw);
      await assert.rejects(syncOneOffs(dir), /refused/, what);
      assert.deepEqual(fs.readdirSync(ONE), ['index.ts'], what);
      assert.doesNotMatch(fs.readFileSync(ONE_INDEX, 'utf8'), /fresh/, what);
    }
    // a one-off may not take a library move's name
    const taken = path.join(dir, 'film', 'moves', 'mark-time');
    fs.renameSync(m, taken); fs.writeFileSync(path.join(taken, 'move.ts'), MOVE.replace("name: 'fresh'", "name: 'mark-time'")); fs.writeFileSync(path.join(taken, 'Move.tsx'), DRAW);
    await assert.rejects(syncOneOffs(dir), /two moves are named/);
    assert.deepEqual(fs.readdirSync(ONE), ['index.ts']);
    assert.deepEqual(await syncOneOffs(null), []);
    assert.doesNotMatch(fs.readFileSync(ONE_INDEX, 'utf8'), /fresh|Move\d/);
    assert.equal(tracked(), before);
  } finally { await syncOneOffs(null); fs.rmSync(dir, { recursive: true, force: true }); }
});
test('scan: the lines it refuses, and the imports it lets through', () => {
  assert.deepEqual(scan('const k = tw(t, a, b);'), []);
  assert.deepEqual(scan("import type { MoveProps } from '../../moves/contract';\nimport { tw } from '../../kit/ease';\nimport React from 'react';\nimport { interpolate } from 'remotion';\nexport { about } from './bar.ts';"), []);
  for (const bad of ['const [s] = useState(0)', 'Math.random()', "import x from '../../tutorial/beats'", "import './effects/../../../x'", "import 'node:fs'", "import x from 'fs'", "import x from '../../kit/../RecordedScreen'", "export * from '../../moves/index'", "import x from '/abs/path'"]) assert.ok(scan(bad).length, bad);
});
test('aboutOf: a plain literal is read from the text; anything computed is refused; textAt follows the paths', () => {
  assert.deepEqual(aboutOf("// c\nexport const about: About = {\n  name: 'x', 'for': \"it's\", n: [1, -2.5, true, null], /* c */ deep: { a: `b`, },\n};\nexport const takes = () => 1;"), { name: 'x', for: "it's", n: [1, -2.5, true, null], deep: { a: 'b' } });
  for (const bad of ['export const about = make();', 'export const about = { name: NAME };', 'export const about = { name: `a${1}` };', 'export const about = { ...base };', 'export const about = { name: "x" + "y" };', 'export const about = { __proto__: {} };', 'const about = {};']) assert.throws(() => aboutOf(bad), /plain literal/, bad);
  assert.deepEqual(textAt({ a: 'x', b: [{ c: 'y' }, { c: 3 }], d: ['p', 'q'] }, ['a', 'b[].c', 'd', 'nope', 'b[].nope']), ['x', 'y', 'p', 'q']);
});
