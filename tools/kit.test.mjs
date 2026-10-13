// tools/kit.mjs: a tutorial's film/kit/ gets what its film can play, not the whole sound pack.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ENGINE, KIT, LIB, baseKit, familiesIn, familiesOf, kitFor, movesNamed, topUpKit } from './kit.mjs';

const temp = (beats) => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rostrum-kit-')); if (beats) fs.writeFileSync(path.join(dir, 'beats.json'), JSON.stringify(beats)); return dir; };
const FILM = { beats: [{ line: 0, screen: 0 }, { line: 1, moves: [{ move: 'cards', items: [] }, { move: 'cards' }] }, { line: 2, screen: 1, cut: { move: 'stage-push' } }] };

test('kit: the families a source names, and the moves a beat file names', () => {
  assert.deepEqual(familiesIn('<Sfx name="whoosh-pass" at={1} /> <Sfx name={build ? \'pencil-short\' : \'pat-medium\'} />'), ['pat-medium', 'pencil-short', 'whoosh-pass']);
  assert.deepEqual(familiesIn('a whoosh in a comment, and "whooshing"'), []);
  assert.deepEqual(movesNamed(FILM), ['cards', 'stage-push']);
  assert.deepEqual(movesNamed(null), []);
});

test('kit: every library drawing that plays a sound names its family as a plain string', () => {
  for (const dir of fs.readdirSync(LIB, { withFileTypes: true }).filter((e) => e.isDirectory())) for (const f of fs.readdirSync(path.join(LIB, dir.name)).filter((x) => x.endsWith('.tsx'))) {
    const text = fs.readFileSync(path.join(LIB, dir.name, f), 'utf8'), plays = (text.match(/<Sfx\b/g) ?? []).length;
    if (plays) assert.ok(familiesIn(text).length >= 1 && !/<Sfx\s+name=\{(?![^}]*['"`])/.test(text), `${dir.name}/${f}: a family named some other way would not be copied into a tutorial`);
  }
  assert.deepEqual(familiesOf([path.join(LIB, 'stage-push')]), ['whoosh']);
});

test('kit: a film with no library move needs the font, the attribution and the two clicks; one with moves, their families\' takes as well', () => {
  const bare = temp({ beats: [{ line: 0, screen: 0 }] }), film = temp(FILM), none = temp();
  try {
    assert.deepEqual(kitFor(bare).sort(), baseKit().sort());
    assert.deepEqual(kitFor(none).sort(), baseKit().sort(), 'no beat file yet: the base');
    assert.ok(baseKit().includes('GeistVF.woff2') && baseKit().includes('SOUNDS.md') && ENGINE.every((f) => baseKit().includes(f)) && baseKit().length === 4);
    const want = kitFor(film);
    for (const f of ['pencil-short-1.wav', 'pencil-short-5.wav', 'pat-small-8.wav', 'whoosh-1.wav', 'whoosh-5.wav']) assert.ok(want.includes(f), f);
    for (const f of ['riffle-1.wav', 'whoosh-pass-1.wav', 'whoosh-cut-1.wav', 'tick-fixed-1.wav']) assert.ok(!want.includes(f), f);
    for (const f of want) assert.ok(fs.existsSync(path.join(KIT, f)), `${f} is in the kit`);
    assert.ok(kitFor(bare, ['scan']).includes('whoosh-pass-1.wav'), 'a move looked at alone brings its own');
    // a one-off of the tutorial's own, and a name that is no folder
    fs.mkdirSync(path.join(bare, 'moves', 'mine'), { recursive: true });
    fs.writeFileSync(path.join(bare, 'moves', 'mine', 'Move.tsx'), 'export default () => <Sfx name="riffle" at={0} />;');
    fs.writeFileSync(path.join(bare, 'beats.json'), JSON.stringify({ beats: [{ line: 0, moves: [{ move: 'mine' }, { move: '../../x' }, { move: 'no-such-move' }] }] }));
    assert.deepEqual(kitFor(bare).filter((f) => !baseKit().includes(f)), ['riffle-1.wav', 'riffle-2.wav', 'riffle-3.wav', 'riffle-4.wav']);
  } finally { for (const d of [bare, film, none]) fs.rmSync(d, { recursive: true, force: true }); }
});

test('kit: topping up copies what is needed and lacking, never over a file that is there, and removes nothing', () => {
  const film = temp(FILM), kit = path.join(film, 'kit');
  try {
    fs.mkdirSync(kit);
    fs.writeFileSync(path.join(kit, 'click-down-1.wav'), 'the approved one');
    fs.writeFileSync(path.join(kit, 'riffle-1.wav'), 'left from before');
    const copied = topUpKit(film);
    assert.equal(fs.readFileSync(path.join(kit, 'click-down-1.wav'), 'utf8'), 'the approved one');
    assert.ok(fs.existsSync(path.join(kit, 'riffle-1.wav')) && !copied.includes('riffle-1.wav') && !copied.includes('click-down-1.wav'));
    assert.deepEqual(fs.readdirSync(kit).sort(), [...new Set([...kitFor(film), 'riffle-1.wav'])].sort());
    assert.ok(fs.readdirSync(kit).length < 50, 'not the whole pack (110 files)');
    assert.deepEqual(topUpKit(film), [], 'nothing more the second time');
  } finally { fs.rmSync(film, { recursive: true, force: true }); }
});
