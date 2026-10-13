// The script's lines against what a narration take says (Whisper's words, in order): which words of the take belong
// to which line, and which lines differ. Used twice: the narration page names the lines that differ, and
// tools/make-timing.mjs cuts the take per script line from the same windows.
//
// One alignment of the whole script against the whole take (word edit distance), not a search per line: a line that
// was never spoken, or a sentence that is not in the script, then costs its own words and nothing else, and the lines
// after it keep theirs.

/** A word as it is compared: lower case, no punctuation ("A.P.I." is "api"). */
export const norm = (w) => String(w).toLowerCase().replace(/[^a-z0-9']/g, '');
const wordsOf = (text) => text.split(/\s+/).map(norm).filter(Boolean);
const r2 = (x) => +x.toFixed(2);

/** The narration lines of a script.md: the "Narration" column of its table, without the rows that have none
 *  (an empty cell, or a note in brackets such as "(no narration)"). */
export function scriptLines(md) {
  const rows = md.split(/\r?\n/).filter((l) => l.trim().startsWith('|')).map((l) => l.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim().replaceAll('\\|', '|')));
  const head = rows.findIndex((r) => r.some((c) => /^narration$/i.test(c)));
  if (head < 0) return [];
  const col = rows[head].findIndex((c) => /^narration$/i.test(c));
  return rows.slice(head + 1).filter((r) => !r.every((c) => /^:?-+:?$/.test(c))).map((r) => r[col] ?? '').filter((c) => c && !/^\(.*\)$/.test(c));
}

/** `lines`: the script's narration lines. `words`: Whisper words { word, start, end } in order.
 *  Returns, per line, the window of `words` that is that line: [{ line, from, to (exclusive), wer, heard }].
 *  A window runs from the first to the last word of the take that the alignment gives to the line; a line with none
 *  is empty (from = to = where it would have been). `wer`: words wrong, missing or added inside the window, over the
 *  line's length. */
export function alignLines(lines, words) {
  const said = words.map((w) => norm(w.word ?? w.w)), script = [];
  lines.forEach((text, line) => { for (const w of wordsOf(text)) script.push({ w, line }); });
  const n = script.length, m = said.length, W = m + 1;
  // cost[i][j]: the cheapest way to say script[0..i) with said[0..j)
  const cost = new Float64Array((n + 1) * W);
  for (let j = 0; j <= m; j++) cost[j] = j;
  for (let i = 1; i <= n; i++) {
    cost[i * W] = i;
    for (let j = 1; j <= m; j++) cost[i * W + j] = Math.min(cost[(i - 1) * W + j - 1] + (script[i - 1].w === said[j - 1] ? 0 : 1), cost[(i - 1) * W + j] + 1, cost[i * W + j - 1] + 1);
  }
  // back along the cheapest path. `pair[i]`: the take's word that script word i was heard as (or -1: not said)
  const pair = new Array(n).fill(-1);
  for (let i = n, j = m; i > 0 || j > 0;) {
    const c = cost[i * W + j];
    if (i && j && script[i - 1].w === said[j - 1] && c === cost[(i - 1) * W + j - 1]) { pair[--i] = --j; continue; }
    if (j && c === cost[i * W + j - 1] + 1) { j--; continue; }           // a word of the take that is not in the script
    if (i && c === cost[(i - 1) * W + j] + 1) { i--; continue; }         // a script word that was not said
    pair[--i] = --j;                                                     // said as another word
  }
  let at = 0, k = 0;
  return lines.map((text, line) => {
    const mine = [];
    while (k < n && script[k].line === line) mine.push(pair[k++]);
    const hit = mine.filter((j) => j >= 0), exact = mine.filter((j, q) => j >= 0 && said[j] === wordsOf(text)[q]).length;
    if (!hit.length) return { line, from: at, to: at, wer: mine.length ? 1 : 0, heard: '' };
    const from = hit[0], to = hit.at(-1) + 1;
    at = to;
    const wrong = (mine.length - exact) + (to - from - hit.length);       // not said or said otherwise, plus words added inside
    return { line, from, to, wer: r2(wrong / mine.length), heard: said.slice(from, to).join(' ') };
  });
}

/** What to tell the author about a take: lines that differ (more than a quarter of their words), lines not spoken at
 *  all, and anything of four words or more that was said between two lines and is in neither. */
export function compareLines(lines, words) {
  const a = alignLines(lines, words), said = words.map((w) => norm(w.word ?? w.w));
  const differs = [], missing = [], extra = [];
  let at = 0;
  const between = (to) => { if (to - at >= 4) extra.push(said.slice(at, to).join(' ')); };
  for (const w of a) {
    if (w.wer >= 0.8) { missing.push(w.line); continue; }
    between(w.from);
    at = w.to;
    if (w.wer > 0.25) differs.push({ line: w.line, text: lines[w.line], heard: w.heard, wer: w.wer });
  }
  between(said.length);
  return { differs, missing, extra };
}
