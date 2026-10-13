// The browser bar's numbers and timing, pure (node loads it). The bar is the mockup's D2 ("present",
// docs/moves/mockups/browser-bar) drawn in the WINDOW's own px: every length is the mockup's film px times
// u = window width / 1608 (the mockup's window), so it reads the same on a 1707 px and a 2560 px screen and scales with
// the camera like the page. Arrival A: it grows out of the window's top edge, bookmarks row first, and the window is
// taller by as much as is out. It does not stay: it retracts the same way once its line has been said.
import { EASE, clamp01 } from '../../kit/ease.ts';

export type Bookmark = { label: string; icon: string };
/** What a beat gives: authored text only (the sweep reads it), icon names from the bundled set.
 *  `from`: the word of the beat's line on which it starts to grow (a cue: a word, or { word, nth }).
 *  `arrives`: how what the hero opens comes: `down` from under the bar (the default), in from the window's `right`
 *  edge (a short slide, its opacity coming up), or it is set in place whole (`appear`).
 *  `leaves`: `with-camera`: the bar does not go back in. The next framing of its shot starts as soon as what the hero
 *  opened has arrived, and its push carries the bar out of the frame's top; the bar is taken away once it is out. */
export type BarSpec = { title: string; host: string; bookmarks: Bookmark[]; hero: string; from?: string | { word: string; nth?: number }; arrives?: keyof typeof ARRIVES; leaves?: 'with-camera' };
/** `arrives` -> where the staging has what opens come from (changes.ts `opens`) */
export const ARRIVES = { down: 'above', right: 'right', appear: 'centre' } as const;
/** ...and how long after the press it has arrived, in seconds (changes.ts `open`: it opens 0.06 s after the press) */
export const ARRIVED = { down: 0.7, right: 0.34, appear: 0.36 } as const;
/** Seconds: out over [from, to], back in over [back, gone]. `off` (a bar that leaves with the camera): [back, gone]
 *  is the camera's push, over which the room the bar took is given back, and the bar is drawn whole until `off`, the
 *  second it is wholly above the frame, and not at all after it. */
export type BarPlay = { from: number; to: number; back: number; gone: number; off?: number };

export const BAR = { height: 192, tabs: 58, tools: 66, marks: 68, grow: 0.55, lead: 0.3, settle: 0.25, linger: 0.1 }; // film px on a 1608 window; seconds
/** The name a beat uses for the hero bookmark as a cursor target (measured into clean/boxes.json, never in `nodes`). */
export const HERO = 'bar:hero';

export function barMetrics(width: number) {
  const u = width / 1608;
  return { u, height: BAR.height * u, tabs: BAR.tabs * u, tools: BAR.tools * u, marks: BAR.marks * u };
}

/** A bar has bookmarks, one of them the hero; labels, title and host are short authored strings. Null when it is sound. */
export function checkBar(spec: BarSpec): string | null {
  if (!spec || !Array.isArray(spec.bookmarks) || !spec.bookmarks.length) return 'a bar needs bookmarks';
  for (const b of spec.bookmarks) if (!b || typeof b.label !== 'string' || !b.label.trim() || b.label.length > 40 || typeof b.icon !== 'string') return `a bookmark is { label, icon }: "${String(b?.label ?? '')}"`;
  if (!spec.bookmarks.some((b) => b.label === spec.hero)) return `the hero "${spec.hero}" is not one of the bookmarks`;
  if (typeof spec.title !== 'string' || spec.title.length > 40 || typeof spec.host !== 'string' || spec.host.length > 60) return 'title and host are short authored strings';
  if (spec.arrives != null && !Object.hasOwn(ARRIVES, spec.arrives)) return `arrives is "down", "right" or "appear": "${String(spec.arrives)}"`;
  if (spec.leaves != null && spec.leaves !== 'with-camera') return `leaves is "with-camera", or left out (the bar goes back in): "${String(spec.leaves)}"`;
  return null;
}

/** Every string a bar puts on the frames, for the check of authored text. */
export const barText = (spec: BarSpec): string[] => [String(spec?.title ?? ''), String(spec?.host ?? ''), ...(spec?.bookmarks ?? []).map((b) => String(b?.label ?? ''))];

/** When the bar grows and goes (seconds). It grows from the cue `from` when given, else so that it is whole `lead`
 *  before the click on its hero (else with the line); never before `ready` (the shot has settled). It goes back in
 *  once the line has been said (`lineEnd`), or after the click when that is later. `note`: there was no room. */
export function barPlay({ ready, lineStart, lineEnd, from, click }: { ready: number; lineStart: number; lineEnd: number; from: number | null; click: number | null }, fps: number): BarPlay & { note: string | null } {
  const F = (s: number) => Math.round(s * fps) / fps;
  const start = Math.max(from ?? (click != null ? Math.max(lineStart, click - BAR.lead - BAR.grow) : lineStart), ready + BAR.settle), to = start + BAR.grow;
  const note = click != null && to > click - BAR.lead + 1e-9 ? `the bar has ${Math.max(0, Math.round((click - start) * fps))} frames to grow before the cursor presses its bookmark: cue the click on a later word, or the bar on an earlier one` : null;
  const back = Math.max(lineEnd + BAR.linger, (click ?? -Infinity) + 1.2, to + 0.5);
  return { from: F(start), to: F(to), back: F(back), gone: F(back + BAR.grow), note };
}

/** How much of the bar is out at second t, 0 to 1: the camera's own ease, so the window grows about its middle. */
export const barOut = (play: BarPlay, t: number) => grown(play, t) * (1 - EASE.heavy(clamp01((t - play.back) / (play.gone - play.back))));
const grown = (play: BarPlay, t: number) => EASE.heavy(clamp01((t - play.from) / (play.to - play.from)));
/** How much of the bar is DRAWN at second t: `barOut`, but a bar that leaves with the camera is whole until it is out of the frame (`off`), then not there. */
export const barShown = (play: BarPlay, t: number) => (play.off == null ? barOut(play, t) : t >= play.off ? 0 : grown(play, t));
/** Where the bar's bookmarks are for a cursor that pressed one: as drawn; a bar the camera left behind keeps its place
 *  above the window (the cursor rides out of the frame on its bookmark, and comes back from there). */
export const barHeld = (play: BarPlay, t: number) => (play.off == null ? barOut(play, t) : grown(play, t));

export const about = {
  name: 'browser-bar', use: 'bar',
  for: 'A neutral browser tab strip, toolbar and bookmarks row that grows out of the top of the window for a step taken in the browser itself, then goes back in.',
  inputs: { title: 'the tab\'s title (authored)', host: 'the address shown (a made-up one, authored)', bookmarks: 'label + icon name, in order (labels authored)', hero: 'the bookmark the cursor presses (target "bar:hero")', from: 'a cue word to start growing on, optional', arrives: 'how what the hero opens comes: down (from under the bar, the default) | right (a short slide in from the window\'s right edge, fading up) | appear (set in place whole)', leaves: 'with-camera: it does not go back in; the shot\'s next framing starts once what the hero opened has arrived and carries the bar out of the frame\'s top (optional; that framing must leave the window\'s top out of the frame)' },
  takes: 'grows in about 0.55 s and is whole 0.3 s before the click on its hero; goes back in over 0.55 s once its line has been said, or (leaves: with-camera) is carried out by the next camera move',
  text: ['title', 'host', 'bookmarks[].label'],
  reads: ['nothing of the screen'],
  example: { line: 6, bar: { title: 'Webhooks', host: 'app.example.com', hero: 'Autofill', bookmarks: [{ label: 'Inbox', icon: 'inbox' }, { label: 'Autofill', icon: 'bookmark' }] }, then: [{ cursor: 'click', target: 'bar:hero', cue: 'bookmarklet' }] },
};
