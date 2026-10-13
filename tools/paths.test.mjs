import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { assertPublicDir, holds, paths, privateOf, publicDirOf } from './paths.mjs';

test('the public dir never is, and never holds, the raw recording or anything else private', () => {
  for (const dir of ['C:/Users/someone/Videos/Rostrum/rec-1', 'fixtures/tutorials/fixture-keys', '.']) {
    const p = paths(dir);
    assert.equal(p.publicDir, p.film);
    for (const x of privateOf(p)) assert.ok(!holds(p.publicDir, x), `${path.relative(p.root, x)} is inside the public dir`);
    assert.ok(!holds(p.publicDir, p.root), 'the tutorial folder itself is the public dir');
    // and nothing private holds the public dir either (a raw folder is never served as part of it)
    for (const x of [p.recording, p.transcript, p.out]) assert.ok(!holds(x, p.publicDir));
    // what a film reads is inside it
    for (const x of [p.clean, p.narration, p.brand, p.kit, p.beats, p.manifest, p.boxes, p.gestures, p.pointer]) assert.ok(holds(p.publicDir, x));
  }
});

test('holds: same folder and ancestors only', () => {
  assert.ok(holds('a/b', 'a/b') && holds('a', 'a/b/c') && !holds('a/b', 'a') && !holds('a/b', 'a/bc') && !holds('a/b', 'a/c'));
});

test('a render refuses a public dir with anything raw in it', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-paths-'));
  try {
    const p = paths(dir);
    assert.throws(() => publicDirOf(dir), /no film folder/);
    fs.mkdirSync(p.clean, { recursive: true });
    fs.mkdirSync(p.recording);
    assert.equal(publicDirOf(dir), p.film);
    assert.throws(() => assertPublicDir(dir), /refusing to render/);            // the tutorial folder itself, as it used to be
    assert.throws(() => assertPublicDir(p.recording), /refusing to render/);
    fs.writeFileSync(path.join(p.film, 'originals.json'), '{}');
    assert.throws(() => publicDirOf(dir), /originals\.json/);
    fs.rmSync(path.join(p.film, 'originals.json'));
    fs.mkdirSync(path.join(p.film, 'recording'));
    assert.throws(() => publicDirOf(dir), /recording/);
    fs.rmSync(path.join(p.film, 'recording'), { recursive: true });
    fs.mkdirSync(path.join(p.film, 'transcript'));
    assert.throws(() => publicDirOf(dir), /transcript/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
