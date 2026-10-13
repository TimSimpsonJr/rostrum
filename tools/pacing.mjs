// Seconds of air before each line, from the move that precedes it. `moves[i]`: what the film does between line i-1 and
// line i: { cursorPx | glide, zoom, cut } (cursor travel on the frame in px, or a `move` that travels under the line; camera scale ratio >= 1; a page change), or null
// for nothing. The moves come from the beat file (film/src/tutorial/beats.ts `movesFrom`); there is no pacing file.
// `list`: the line before showed a narrated list, which clears (and the screen comes back) before anything moves.
export const LEAD = 3.6;                                  // the title alone, then the first line
const LIST = 0.7;                                         // a list clearing: film/src/tutorial/list.ts LIST_CLEARS
const READ = 0.9;                                         // `read`: what the line before left open is read before the film closes on it
const GLIDE = 0.95;                                       // `glide`: the line's first action is a `move`: the cursor sets off as the line starts and covers its distance under the words, so the air is a breath and its start, however far it goes
export function pacing(moves) {
  return moves.map((m, i) => {
    if (i === 0) return 0;
    if (!m) return 0.5;                                   // breath between two lines over the same shot
    const cursor = m.glide ? GLIDE : m.cursorPx ? 0.45 + m.cursorPx / 1800 : 0;
    const camera = m.zoom > 1.001 ? 0.6 + 0.5 * Math.log2(m.zoom) : 0;
    const cut = m.cut ? 0.3 : 0;
    // (`wait`: seconds the page took to answer before what is read came: a `becomes` that waits)
    return +(Math.min(1.6, Math.max(0.5, Math.max(cursor, camera) + cut)) + (m.list ? LIST : 0) + (m.read ? READ : 0) + (m.wait ?? 0)).toFixed(2);
  });
}
