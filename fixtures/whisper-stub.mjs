// A stand-in for the Whisper command line, for tests that must not need it: takes Whisper's arguments and writes
// <output_dir>/<input name>.json with the words of ROSTRUM_STUB_TEXT, one every 0.4 s from 0.3 s. Says nothing.
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2), input = args[0], out = args[args.indexOf('--output_dir') + 1];
let at = 0.3;
const words = (process.env.ROSTRUM_STUB_TEXT ?? '').split(/\s+/).filter(Boolean).map((word) => ({ word: ' ' + word, start: +(at).toFixed(2), end: +((at += 0.4) - 0.08).toFixed(2) }));
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, path.basename(input, path.extname(input)) + '.json'), JSON.stringify({ text: '', segments: words.length ? [{ start: 0.3, end: at, words }] : [], language: 'en' }));
