// A stand-in for whisper.cpp's command line (`whisper-cli`, v1.9.2), for tests that must not need it: takes its
// arguments (-m <model> -f <wav> ... -oj -ojf -of <base>) and writes <base>.json in the shape the real one was seen
// to write with `-dtw <model> -nfa -oj -ojf` (Oct 13 2026): one `transcription` item for the text, holding its
// `tokens`; a token's `t_dtw` is when it ends, in hundredths of a second (-1 on the markers `[_BEG_]` and
// `[_TT_n]`); a comma or full stop is a token of its own, and so is the tail of a long word. Here: each word of
// ROSTRUM_STUB_TEXT ends 0.4 s after the one before it began, a word of more than six letters is two tokens, and
// punctuation takes another 0.1 s. Like the real one it prints what it heard.
import fs from 'node:fs';

const args = process.argv.slice(2), after = (flag) => args[args.indexOf(flag) + 1];
if (!fs.existsSync(after('-f'))) { console.error('error: input file not found'); process.exit(2); }
const stamp = (ms) => new Date(ms).toISOString().slice(11, 23).replace('.', ',');
const span = (from, to) => ({ timestamps: { from: stamp(from), to: stamp(to) }, offsets: { from, to } });
let at = 0, id = 1000;
const token = (text, cs) => { const from = at * 10; if (cs >= 0) at = cs; return { text, ...span(from, cs >= 0 ? cs * 10 : from), id: id++, p: 0.99, t_dtw: cs }; };
const tokens = [token('[_BEG_]', -1)], text = (process.env.ROSTRUM_STUB_TEXT ?? '').split(/\s+/).filter(Boolean);
for (const word of text) {
  const [, body, mark] = /^(.*?)([.,!?;:]*)$/.exec(word), cut = body.length > 6 ? 3 : body.length;
  if (cut < body.length) tokens.push(token(' ' + body.slice(0, cut), at + 20), token(body.slice(cut), at + 20)); else tokens.push(token(' ' + body, at + 40));
  if (mark) tokens.push(token(mark, at + 10));
}
tokens.push(token(`[_TT_${at}]`, -1));
const transcription = [{ ...span(0, at * 10), text: text.map((w) => ' ' + w).join(''), tokens }];
fs.writeFileSync(after('-of') + '.json', JSON.stringify({ systeminfo: 'stub', model: { type: 'small', multilingual: false }, params: { model: after('-m'), language: 'en', translate: false }, result: { language: 'en' }, transcription }, null, '\t'));
for (const item of transcription) console.log(`[${item.timestamps.from} --> ${item.timestamps.to}]  ${item.text}`);
