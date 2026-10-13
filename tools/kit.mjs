// What of the kit (film/public/kit/) one tutorial's film needs in its own film/kit/: the font and the sounds'
// attribution, the engine's own two click sounds, and every take of each sound family that a move its beat file
// names can play. The whole pack is 13 MB; a how-to with no library move needs none of it.
// Which families a move can play is read from its code: every family name (kit/sfx.ts) that stands as a quoted
// string in a file of the move's folder. A superset is harmless; a move that computed a family's name would be
// missed, and tools/kit.test.mjs fails on a drawing that plays sound without naming a family.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SFX } from '../film/src/kit/sfx.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const KIT = path.join(ROOT, 'film', 'public', 'kit'), LIB = path.join(ROOT, 'film', 'src', 'moves');
/** the sounds the template itself plays (kit/sound.tsx `Click`) */
export const ENGINE = ['click-down-1.wav', 'click-up-1.wav'];

/** The sound families named, as quoted strings, in a source text. */
export const familiesIn = (text) => Object.keys(SFX).filter((f) => ['\'', '"', '`'].some((q) => text.includes(q + f + q)));
/** The moves a beat file names: on its beats, and as the way into a shot. */
export const movesNamed = (file) => [...new Set((file?.beats ?? []).flatMap((b) => [...(b.moves ?? []).map((u) => u?.move), b.cut?.move]).filter((n) => typeof n === 'string'))];
/** The families the moves in these folders can play (a folder that is not there plays nothing). */
export function familiesOf(dirs) {
  const out = new Set();
  for (const dir of dirs) if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) if (/\.tsx?$/.test(f)) for (const fam of familiesIn(fs.readFileSync(path.join(dir, f), 'utf8'))) out.add(fam);
  return [...out].sort();
}
/** What every film has: all of the kit that is not a sound of a family, and the engine's clicks. */
export const baseKit = () => [...fs.readdirSync(KIT).filter((f) => !f.endsWith('.wav')), ...ENGINE];
/** The kit files the film in `publicDir` needs: the base, and the takes of the families of the moves its beats.json
 *  names (library moves, and its own one-offs in moves/), and of `also` (move names: a move looked at alone). */
export function kitFor(publicDir, also = []) {
  let file = null;
  try { file = JSON.parse(fs.readFileSync(path.join(publicDir, 'beats.json'), 'utf8')); } catch { /* no beat file yet: the base only */ }
  const names = [...movesNamed(file), ...also].filter((n) => /^[a-z][a-z0-9-]*$/.test(n));
  const families = familiesOf(names.flatMap((n) => [path.join(LIB, n), path.join(publicDir, 'moves', n)]));
  return [...baseKit(), ...families.flatMap((f) => Array.from({ length: SFX[f].n }, (_, i) => `${f}-${i + 1}.wav`))];
}
/** Copies into the tutorial's film/kit/ what its film needs and lacks. Never over a file it has (its approved clicks
 *  stay), and nothing there is ever removed. Returns the names copied. */
export function topUpKit(publicDir, also = []) {
  const to = path.join(publicDir, 'kit'), copied = [];
  fs.mkdirSync(to, { recursive: true });
  for (const f of kitFor(publicDir, also)) if (!fs.existsSync(path.join(to, f)) && fs.existsSync(path.join(KIT, f))) { fs.copyFileSync(path.join(KIT, f), path.join(to, f)); copied.push(f); }
  return copied;
}
