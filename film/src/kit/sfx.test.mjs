// The sound families (kit/sfx.ts): every take a family counts is a file in the kit, and the take is fixed by the time.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SFX, takeOf } from './sfx.ts';

const KIT = new URL('../../public/kit/', import.meta.url);

test('sfx: every family has its takes in film/public/kit, and every wav there belongs to a family', () => {
  const want = Object.entries(SFX).flatMap(([name, f]) => Array.from({ length: f.n }, (_, i) => `${name}-${i + 1}.wav`)).sort();
  assert.deepEqual(fs.readdirSync(KIT).filter((f) => f.endsWith('.wav')).sort(), want);
  assert.ok(fs.existsSync(new URL('SOUNDS.md', KIT)), 'the attribution travels with the files');
  for (const [name, f] of Object.entries(SFX)) assert.ok(f.trim <= 0, `${name}: a trim only lowers`);
});

test('sfx: the take is in range, the same for the same time, and varies along a stretch', () => {
  for (const [name, f] of Object.entries(SFX)) {
    const takes = Array.from({ length: 31 }, (_, i) => takeOf(name, i / 10));
    assert.ok(takes.every((n) => Number.isInteger(n) && n >= 1 && n <= f.n), name);
    assert.deepEqual(takes, Array.from({ length: 31 }, (_, i) => takeOf(name, i / 10)), name);
    if (f.n > 1) assert.ok(new Set(takes).size > 1, `${name} never varies`);
  }
  assert.equal(takeOf('pat-small', 1.2, 3), 3, 'a variant asked for is the one played');
  assert.equal(takeOf('nope', 1), 1);
});
