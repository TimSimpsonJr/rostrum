// (That the catalogue and the registry are current is checked in one-offs.test.mjs, the one test file that reads and
// writes them: test files run side by side.)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { checkAbout, loadMoves } from './moves.mjs';
import { scan } from './one-offs.mjs';

test('moves: every move.ts has a sound about, and its example passes its own check', async () => {
  const moves = await loadMoves({ oneOffs: false });
  assert.ok(moves.length >= 15, `${moves.length} moves`);
  for (const m of moves) {
    assert.equal(checkAbout(m.module.about), null, m.name);
    const ex = m.module.about.example;
    if (ex && m.module.check && m.module.about.use === 'moves') { const { move: _m, at: _a, until: _u, ...inputs } = ex.moves?.[0] ?? ex; assert.equal(m.module.check(inputs), null, `${m.name}: its example does not pass its own check`); }
  }
});

test('moves: no library move reads a file, the network, time or state', async () => {
  for (const m of await loadMoves({ oneOffs: false })) {
    const dir = path.join(m.base, m.dir);
    for (const f of fs.readdirSync(dir)) if (/\.tsx?$/.test(f) && !/\.test\./.test(f)) {
      const hits = scan(fs.readFileSync(path.join(dir, f), 'utf8'), dir);
      assert.deepEqual(hits, [], `${m.dir}/${f}`);
    }
  }
});

test('moves: the about shape is checked', () => {
  assert.equal(checkAbout({ name: 'x', use: 'moves', for: 'y', takes: 'z', inputs: {}, text: [], reads: [] }), null);
  assert.match(checkAbout({ name: 'Bad Name' }), /lower-case/);
  assert.match(checkAbout({ name: 'x', use: 'moves', for: 'y', takes: 'z', inputs: {}, text: 'no', reads: [] }), /text/);
  // what a cut says of the cursor: it rides with its shot (the default), or is gone from the shot before at once
  const cut = { name: 'x', use: 'cut', for: 'y', takes: 'z', inputs: {}, text: [], reads: [] };
  assert.equal(checkAbout({ ...cut, cursor: 'fades' }), null); assert.equal(checkAbout({ ...cut, cursor: 'rides' }), null);
  assert.match(checkAbout({ ...cut, cursor: 'stays' }), /rides or fades/);
  // ...and of when the stage changes under it
  assert.equal(checkAbout({ ...cut, toneAt: 0.61 }), null); assert.equal(checkAbout({ ...cut, toneAt: 1 }), null);
  assert.match(checkAbout({ ...cut, toneAt: 1.5 }), /0 to 1/); assert.match(checkAbout({ ...cut, toneAt: 'end' }), /0 to 1/);
});
