// The review page's pure parts: words for a note's status, the count line, the versions, pins, the time kept on a switch.
export const statusLabel = (n) => (n.status === 'done' ? (n.fixedIn ? `Fixed in ${n.fixedIn}` : 'Fixed') : n.status === 'wontfix' ? 'No change needed' : 'To fix');
export function countLine(notes) {
  if (!notes.length) return 'No notes yet';
  const c = (s) => notes.filter((n) => n.status === s).length, open = c('open'), done = c('done'), none = c('wontfix');
  return [open && `${open} to fix`, done && `${done} fixed`, none && `${none} no change`].filter(Boolean).join(', ');
}
/** The versions among the listed videos: out/v<n>.mp4 by n. */
export function versionsOf(videos) {
  return videos.map((v) => ({ ...v, n: Number(/\/v(\d+)\.mp4$/.exec(v.path)?.[1]) })).filter((v) => Number.isFinite(v.n)).sort((a, b) => a.n - b.n).map(({ n, ...v }) => ({ ...v, name: `v${n}` }));
}
export const keepTime = (time, duration) => Math.max(0, duration ? Math.min(time, duration) : time);
export const timecode = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// ── a note's region: a rectangle of the film's frame, as fractions of it from its top-left corner ──
/** A press on the film that travels further than this (in pixels) before release is a drag; less is a click. */
export const DRAG = 5;
export const isDrag = (a, b) => Math.hypot(b.x - a.x, b.y - a.y) > DRAG;
/** Where the picture sits in its element (object-fit: contain): bars above and below, or left and right, are not the frame. */
export function pictureBox(w, h, videoW, videoH) {
  if (!(videoW > 0 && videoH > 0)) return { x: 0, y: 0, w, h };
  const s = Math.min(w / videoW, h / videoH);
  return { x: (w - videoW * s) / 2, y: (h - videoH * s) / 2, w: videoW * s, h: videoH * s };
}
/** A region as it is stored: null, or { x, y, w, h } inside the frame (0..1, four decimals). Too thin to mean anything
 *  is null; anything else that is not four numbers throws. */
export function cleanRegion(v) {
  if (v == null) return null;
  if (typeof v !== 'object' || !['x', 'y', 'w', 'h'].every((k) => Number.isFinite(v[k]))) throw new TypeError('region must be null or { x, y, w, h } as fractions of the frame');
  const c = (n) => Math.min(1, Math.max(0, n)), r4 = (n) => Math.round(n * 1e4) / 1e4;
  const x = c(v.x), y = c(v.y), r = { x: r4(x), y: r4(y), w: r4(c(v.x + v.w) - x), h: r4(c(v.y + v.h) - y) };
  return r.w < 0.005 || r.h < 0.005 ? null : r;
}
/** The region a drag from a to b marks (points in the element's pixels; `box` is its pictureBox). */
export const regionOf = (a, b, box) => cleanRegion({ x: (Math.min(a.x, b.x) - box.x) / box.w, y: (Math.min(a.y, b.y) - box.y) / box.h, w: Math.abs(b.x - a.x) / box.w, h: Math.abs(b.y - a.y) / box.h });

/** The pins on the timeline: every note, by time, numbered from 1; `left` is the fraction of the track. */
export const pinsOf = (notes, duration) => [...notes].sort((a, b) => a.time - b.time).map((n, i) => ({ n: i + 1, id: n.id, time: n.time, left: duration ? Math.min(1, n.time / duration) : 0, isOpen: n.status === 'open', hasRegion: !!n.region }));
/** What the page asks, once, before a note is deleted: it says what state the note is in and what goes with it. */
export const deleteQuestion = (n) => `Delete this comment?${n.status === 'open' ? '' : ` It is marked "${statusLabel(n)}".`}${n.reply ? ' Claude\'s reply goes with it.' : ''}`;
