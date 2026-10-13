// A beat file (beats.json, the only per-film file) + the measured boxes (clean/boxes.json) + the narration's timing
// (narration/timing.json) -> what the template plays: shots with their cameras, the cursor's moves, the clicks, and
// what each screen stages (something opening, a page assembling, a value becoming selected). Pure data and math:
// node can load it (the tests and tools/make-timing.mjs do).
//
// Every time comes from the narration (a line's start, or the word a beat names as its cue); every place from a
// measured box. Nothing here is particular to one film.
import { rnd } from '../kit/ease.ts';
import { cameraAt, cameraFaults, project, scrollAt } from './cameraAt.ts';
import type { Box, CamKey, Scroll, Size } from './cameraAt.ts';
import { cursorAt } from './cursorPath.ts';
import type { Move, Stop } from './cursorPath.ts';
import { GLYPH, LIFT, closeOf } from './close.ts';
import type { Timing } from './close.ts';
import { FRAME, STEP, drifted, frameFor, mostScale, moveSeconds, union, windowHeight } from './framing.ts';
import type { Around, Boxes, FrameSpec, Framing } from './framing.ts';
import { clearNear, clearOf } from './spot.ts';
import type { Staging } from './changes.ts';
import { playList } from './list.ts';
import type { ListPlay, ListSpec } from './list.ts';
import { ARRIVED, ARRIVES, HERO, barHeld, barMetrics, barOut, barPlay, barText, checkBar } from '../moves/browser-bar/bar.ts';
import type { BarPlay, BarSpec } from '../moves/browser-bar/bar.ts';
import type { Beats } from './Template.tsx';
import { toneOf } from '../moves/contract.ts';
import type { Box as MBox, MoveModule, StageUse, Tone } from '../moves/contract.ts';

/** The word of the beat's line at which the cursor arrives or clicks: its first occurrence, or the nth (from 0). */
export type Cue = string | { word: string; nth?: number };
/** a library move (or a one-off) on this beat: `move` names it; `at` and `until` are cues of the beat's line; the rest are its inputs (names, cues, authored text, choices) */
export type MoveUse = { move: string; at?: Cue; until?: Cue } & Record<string, unknown>;
/** the way into this beat's shot (on the first beat of a new shot): a cut move and its inputs. `until`: a cue of the
 *  beat's line the cut runs to, instead of for its own length. On the film's first beat it is the way into the first
 *  shot from the open: the move is handed that shot alone (no shot before), from when its window would have come */
export type CutUse = { move: string; until?: Cue } & Record<string, unknown>;
/** a shot with no recorded screen: the stage (the film's unless given) and this beat's moves are all there is */
export type Scene = { stage?: Tone | StageUse };
export const SCENE = -1;   // the screen number of a scene shot
/** What a move is, by name: the registry's (moves/index.ts) in the film, tools/moves.mjs's in node. */
export type MoveOf = (name: string) => MoveModule | null;
/** `opens`: `node` is shut until the click on `after`, then opens. `page`: the beat's screen replaces the one before
 *  (a cut). `selects`: the value of `node` shows as selected from the click on it; with `to` (a block: a table) the
 *  selection runs down it from the beat's cue to the cue `to`, following the cursor. `scrolls`: the content of the
 *  shot's window scrolls, in one eased move, to its bottom, its top, or until the named node is near the window's
 *  top; it starts on the beat's cue word (else with the line) and has landed before the line ends. The camera holds.
 *  `fills`: the field `node` is empty until the click on it (else the cue, else the line), then holds its value: whole
 *  (a paste), or (`typed`) letter by letter until the cue `to` (else for about a second). The value is the clean
 *  copy's, or `text`: authored words (a list: one per line), drawn by the film and read by the sweep.
 *  `becomes`: the shot's screen becomes a later capture of the same page, in place, under the same camera: 0.3 s after
 *  the click on `after` (else after the cue, else with the line). `grows`: [a name on the screen before, a name on the
 *  new one] of one element whose box changes with it: it is carried from the one box to the other, uncovered as it goes. */
export type Change = { kind: 'opens'; node: string; after?: string } | { kind: 'page' } | { kind: 'selects'; node: string; to?: Cue } | { kind: 'scrolls'; to: string }
  | { kind: 'fills'; node: string; typed?: boolean; text?: string | string[]; to?: Cue }
  /** `wait`: the page took its time to answer (a save): the capture comes as long after the click (or the word) as
   *  the recording took from the capture before it to it, 2 s at most, and the line after is given that much more air */
  | { kind: 'becomes'; screen: number; after?: string; grows?: [string, string]; wait?: boolean }
  /** `close`: `node` (a menu, a dialog) goes the way it came, from the beat's cue (else its line's start), and is not seen again until its next `opens` on the shot */
  | { kind: 'close'; node: string }
  /** `hover`: `node` (a tip, a menu) is there only while the pointer is over `after`: uncovered when the cursor
   *  arrives on `after` (a `rest` or a `move` to it on this shot; it rests ON the control), which takes the page's
   *  own hover look meanwhile; it goes the way it came when the cursor moves on */
  | { kind: 'hover'; node: string; after: string }
  /** `frame-back` (on a `bare` shot): the window's frame and shadow come back round the elements, which do not move,
   *  from the beat's cue (else its line's start) */
  | { kind: 'frame-back' };
/** `rest`: the cursor arrives beside the target on the cue and stays. `move`: it carries straight on from where it
 *  was (no stop there) and glides to beside the target, arriving on the cue: for running down a list or a group.
 *  `drag`: it arrives on `target` on the cue, presses and holds, carries the thing (drawn alone, riding with the
 *  pointer) to where `to` is, and lets go on the cue `release`; a `becomes` on the beat follows the drop by 0.3 s. */
export type CursorDoes = 'enter' | 'move' | 'click' | 'rest' | 'leave' | 'drag';
export type Action = { cursor: CursorDoes; target?: string; cue?: Cue; change?: Change; /** a drag: the name it is dropped on, and the word it is let go on */ to?: string; release?: Cue };
/** The page works by itself: the captures from `from` through `watch` play at the pace they were recorded at, then
 *  those of `then` evenly over what is left of the line, all in place under the shot's camera. */
export type Sequence = { from: number; watch?: number; then?: number[]; /** a scroll box the page fills as it goes: kept scrolled to its end, so what was added last is in view */ follow?: string };
/** `list`: while the line enumerates things, the screen recedes and they appear as type, one by one (list.ts). */
/** `window` (on the first beat of a shot): a name in `nodes`, or several. The shot shows only those nodes of its
 *  screen, laid out at their full size where the page put them (nothing above them clips or scrolls them:
 *  RecordedScreen `unclip`), through a window on the stage of an ordinary shape; what is taller scrolls (`scrolls`).
 *  `bar`: a browser bar grows out of the window's top under this beat's line and goes back in after it
 *  (moves/browser-bar); its hero bookmark is the cursor target "bar:hero". `sequence`: above.
 *  `bare` (with `window`): the elements stand on the stage with no window frame and no shadow, until a `frame-back`. */
export type Beat = Partial<Action> & { line: number; screen?: number; window?: string | string[]; bare?: boolean; frame?: FrameSpec; then?: Partial<Action>[]; list?: ListSpec; bar?: BarSpec; sequence?: Sequence; moves?: MoveUse[]; cut?: CutUse; scene?: Scene };
export type BeatsFile = {
  version: 1; title: string; viewport: Size;
  /** the film's stage (a scene may name its own; a shot has the film's): a tone, or a named stage and its inputs
   *  (`{ move, tone?, ... }`: a library stage or a one-off's Stage.tsx). Without it: the brand's own stage when its
   *  brand.json has one (Tutorial.tsx), else light */
  stage?: Tone | StageUse;
  /** per screen (from the manifest); without it every screen is `viewport` */
  viewports?: Record<number, Size>;
  /** the manifest's screens and when each was taken (seconds): a sequence paces its watched screens by them */
  screens?: { i: number; t: number }[];
  /** name -> [screen, node id]: what the film points at or frames; measured into clean/boxes.json */
  nodes: Record<string, [number, number]>;
  beats: Beat[]; chalk?: unknown[];
  /** how the film ends, when not the plain way: `logo-lift`: the camera pushes toward the element `from` (the recorded
   *  site's own logo, on the last screen), the window fades, and the brand's mark sets out of it */
  end?: { move: 'logo-lift'; from: string }
    /** `end-glyph`: a hard cut to the element `glyph` (of the last shot's screen) alone in the middle of the stage, its
     *  parts sliding apart and back, and the brand's mark comes up out of it as the end card sets */
    | { move: 'end-glyph'; glyph: string };
  /** how the film opens, when not on the title alone: `title-makes-room`: the first screen is there from the first
   *  frame and slides aside for the title; `cut-to-screen`: no title, the first screen already placed */
  open?: { move: Open };
};
export type Open = 'title-makes-room' | 'cut-to-screen';
/** `title-makes-room` (seconds; shares of the frame): the window stands `still` in the middle at `scale` of its size,
 *  slides over `slide` until its middle is at `at` of the frame's width while the title fades in from `titleIn` in the
 *  column `title` (its left edge as a share of the width; its width in px); at `openLeave` the title is gone in `clear`,
 *  and only then is the window `back` in the middle at its size (the two never share a frame's place). */
export const OPEN = { still: 0.6, slide: 8 / 30, titleIn: 0.75, clear: 0.2, back: 0.5, scale: 0.62, at: 0.31, title: { x: 0.61, w: 620 } };

/** Where every element of the film's screens is, when the screens were measured (clean/layout.json: per screen, node
 *  id -> box). Optional everywhere: without it no frame edge is settled and the cursor is parked nowhere in particular. */
export type Layout = Record<string, { boxes?: Record<string, Box> } | undefined>;

const OFF = { x: FRAME.width + 140, y: FRAME.height + 170 };       // where the cursor waits, off the frame's bottom right
const GONE = { x: FRAME.width + 110, y: FRAME.height + 130 };      // where it leaves to
const CUT_AFTER_CLICK = 0.3;   // a page change follows the click that causes it by this much...
const CUT_BEFORE_LINE = 0.3;   // ...or, with no such click, comes this long before its line
const LINE_LEFT = 0.6;         // ...unless the click's own line has this much or more still to say after such a cut:
const CUT_HOLD = 0.25;         // then the shot holds until this long before the next line
const ENTER_BY = 2;            // the cursor is on at most this long after the window has settled (about)...
const ENTER_REST = { x: 0.86, y: 0.84 }; // ...resting low and right in the window, off what is being read
const WINDOW_SETTLES = 0.75;   // Template: the window's own entrance
const WAIT_LONG = 1;           // waiting longer than this after a cut, the cursor drifts toward what it does next
const DRIFT = 0.35;            // ...this share of the way
const CUT_LOOSE = 0.911;       // after a cut the camera is already travelling in: it starts this much looser
const CUT_SETTLE = 1.5;        // ...and settles over this long
const SWAP_AFTER = 0.3;        // a screen becomes its next capture this long after the click (or the word) that causes it
const WAIT_MOST = 2;           // ...or, for a `becomes` that waits, as long as the recording took, up to this
/** how long after its click (or word) a `becomes` brings its capture: SWAP_AFTER, or (`wait`) the time the recording
 *  took from the capture before it to it (the manifest's times: `file.screens`), within [SWAP_AFTER, WAIT_MOST] */
const swapAfter = (file: Pick<BeatsFile, 'screens'>, c: Change & { kind: 'becomes' }) => {
  const i = c.wait ? file.screens?.findIndex((x) => x.i === c.screen) ?? -1 : -1;
  return i > 0 ? clamp(file.screens![i].t - file.screens![i - 1].t, SWAP_AFTER, WAIT_MOST) : SWAP_AFTER;
};
const MIN_DWELL = 7;          // frames: the least a capture of a sequence is up
const SEQ_HOLD = 0.35;         // a sequence's last capture is up this long before its line ends
const FAR = 1800;              // frame px: a camera move across more of the page than this is a pan...
const FAR_SPEED = 1300;        // ...and takes a second for every so many px
const LIFT_FILL = 0.6;         // a logo lift frames the logo at this share of the frame's width, when the camera can get there
const LIFT_LONGEST = 3.2;      // ...and its push is this long at most (1.1 s when the logo is near)
const BAND = 0.6;              // what opens wider than this share of the window is a band of the page: no framing is widened to hold it
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const word = (w: string) => w.toLowerCase().replace(/[^a-z0-9']/g, '');
const sameFrame = (a?: FrameSpec, b?: FrameSpec) => !!a && !!b && !!a.whole === !!b.whole && !!a.back === !!b.back && !!a.cut === !!b.cut && !!a.hold === !!b.hold && a.side === b.side && a.settle === b.settle && a.target === b.target && (a.with ?? 'self') === (b.with ?? 'self') && (a.targets ?? []).join('\n') === (b.targets ?? []).join('\n');
const plainBox = (b: Box): Box => ({ x: b.x, y: b.y, w: b.w, h: b.h });
const raised = <T extends Box>(b: T, dy: number): T => ({ ...b, y: b.y - dy });
/** the boxes of every input that names a measured element (a move points at it through `place`): a name, a list of
 *  names, or a name one level down in a list of items (`labels`: items[].target) */
const pinsOf = (inputs: Record<string, unknown>, boxes: Boxes): Record<string, MBox> => Object.fromEntries(Object.values(inputs).flat().flatMap((v) => (v && typeof v === 'object' ? Object.values(v) : [v])).filter((v): v is string => typeof v === 'string' && !!boxes[v]).map((v) => [v, plainBox(boxes[v])]));
/** ...and, beside them (never inside: a pin is a plain box), the screen each is measured on, when any is named: a
 *  move between two shots is told where an element is under the camera of the shot that shows it */
const pinScreensOf = (inputs: Record<string, unknown>, boxes: Boxes): { pinScreens?: Record<string, number> } => { const on = Object.fromEntries(Object.keys(pinsOf(inputs, boxes)).map((v) => [v, boxes[v].screen])); return Object.keys(on).length ? { pinScreens: on } : {}; };
const holds = (outer: Box, b: Box) => b.x >= outer.x - 0.5 && b.y >= outer.y - 0.5 && b.x + b.w <= outer.x + outer.w + 0.5 && b.y + b.h <= outer.y + outer.h + 0.5;
/** Every measured element of a screen. */
const piecesOf = (layout: Layout | undefined, screen: number): Box[] => Object.values(layout?.[screen]?.boxes ?? {});
/** The elements that hold no other: text, icons, fields. What a waiting cursor must not sit on. */
const leavesOf = (pieces: Box[]) => pieces.filter((p) => !pieces.some((q) => q !== p && holds(p, q) && (q.w < p.w - 1 || q.h < p.h - 1)));

/** Where the cursor's tip goes on a control it clicks: the measured blank spot when there is one; otherwise low in
 *  the box, and right of the middle when the box is wide (its text is on the left or in the middle). Never on letters. */
const clickPoint = (b: Boxes[string]) => { const [fx, fy] = b.spot ?? (b.w > 3 * b.h ? [0.8, 0.6] : [0.5, 0.6]); return { x: b.x + b.w * fx, y: b.y + b.h * fy }; };
/** Where it rests to point at something it does not click: beside it, clear of its text. */
const beside = (b: Box) => ({ x: b.x + b.w + 22, y: b.y + b.h * 0.55 });

type Act = Partial<Action> & { beat: number; line: number; shot: number; first: boolean };
/** `later`: the captures the shot's screen becomes, in beat order (a `becomes`; a `sequence`'s last) */
type ShotPlan = { screen: number; window?: string[]; bare?: boolean; beats: number[]; frames: { beat: number; spec: FrameSpec }[]; later: { beat: number; screen: number }[]; scene?: Scene; cut?: { use: CutUse; beat: number } };
type Changed = { change: Change; beat: number; shot: number; cue?: Cue };
/** What a windowed shot's window holds: the named nodes' full boxes together (measured unclipped). */
const contentOf = (shot: ShotPlan, boxes: Boxes): Box => union(...shot.window!.map((name) => plainBox(boxes[name])));
/** A shot's window on its screen: the whole viewport (the screen's own, when the manifest gave one per screen), or
 *  the top of the named nodes' content, as tall as a window stands on the stage (the rest is scrolled to). */
const windowsOf = (file: BeatsFile, shots: ShotPlan[], boxes: Boxes) => (s: number): Box => {
  const shot = shots[s], vp = file.viewports?.[shot.screen] ?? file.viewport;
  if (!shot.window) return { x: 0, y: 0, w: vp.width, h: vp.height };
  const c = contentOf(shot, boxes);
  return { ...c, h: Math.min(c.h, windowHeight(c.w)) };
};
/** The measured elements a shot can show: all of its screen's (`screen`: the capture in force), or (a windowed shot)
 *  those of its window's content, scrolled into view or not (the cursor's stops are places in the content). */
const piecesIn = (layout: Layout | undefined, shot: ShotPlan, boxes: Boxes, screen = shot.screen) => { if (!shot.window) return piecesOf(layout, screen); const c = contentOf(shot, boxes); return piecesOf(layout, shot.screen).filter((p) => holds(c, p)); };
/** The capture a shot shows by a beat: its own, or the last it became on a beat before this one. */
const screenBy = (shot: ShotPlan, beat: number) => shot.later.filter((l) => l.beat < beat).at(-1)?.screen ?? shot.screen;

/** The beat file read through: which beats share a screen (a shot), what the cursor does in order, what changes. */
function read(file: BeatsFile, boxes: Boxes) {
  const shots: ShotPlan[] = [], acts: Act[] = [], changes: Changed[] = [];
  const lists: { spec: ListSpec; beat: number; line: number; shot: number }[] = [];
  const bars: { spec: BarSpec; beat: number; line: number; shot: number }[] = [];
  const runs: { spec: Sequence; beat: number; line: number; shot: number; cue?: Cue }[] = [];
  const uses: { use: MoveUse; beat: number; line: number; shot: number }[] = [];
  const need =(name: string | undefined, what: string) => { if (name != null && !boxes[name]) throw new Error(`beats: ${what} names "${name}", which has no measured box`); };
  let screen: number | undefined;
  file.beats.forEach((b, i) => {
    // (a scene is a shot of its own; two scene beats in a row with the same `scene` object stay one shot)
    screen = b.scene ? SCENE : (b.screen ?? (screen === SCENE ? undefined : screen));
    if (screen == null) throw new Error(i ? `beats: line ${b.line}: after a scene the beat names a screen` : 'beats: the first beat names no screen');
    if (!shots.length || shots.at(-1)!.screen !== screen || (b.scene && file.beats[shots.at(-1)!.beats[0]].scene !== b.scene)) shots.push({ screen, beats: [], frames: [], later: [], ...(b.scene ? { scene: b.scene } : {}) });
    const shot = shots.at(-1)!, s = shots.length - 1;
    shot.beats.push(i);
    if (shot.scene && b.cursor && b.cursor !== 'leave') throw new Error(`beats: line ${b.line}: a scene has no cursor`);
    if (b.cut) { if (shot.beats.length > 1) throw new Error(`beats: line ${b.line}: cut goes on the first beat of its shot`); shot.cut = { use: b.cut, beat: i }; }
    for (const u of b.moves ?? []) { if (!u || typeof u.move !== 'string') throw new Error(`beats: line ${b.line}: a move is { move, ...inputs }`); uses.push({ use: u, beat: i, line: b.line, shot: s }); }
    const panes = b.window == null ? [] : [b.window].flat();
    for (const name of panes) need(name, `beat ${i}'s window`);
    if (panes.length && shot.beats.length > 1) throw new Error(`beats: line ${b.line}: window goes on the first beat of its shot`);
    if (panes.length) shot.window = panes;
    if (b.bare) { if (!panes.length) throw new Error(`beats: line ${b.line}: bare goes with window on the first beat of its shot`); shot.bare = true; }
    need(b.frame?.target, `beat ${i}'s frame`);
    for (const name of b.frame?.targets ?? []) need(name, `beat ${i}'s frame`);
    if (!shot.frames.length) shot.frames.push({ beat: i, spec: b.frame ?? { whole: true } });
    else if (b.frame && !sameFrame(b.frame, shot.frames.at(-1)!.spec)) shot.frames.push({ beat: i, spec: b.frame });
    const own: Partial<Action>[] = b.cursor ? [{ cursor: b.cursor, target: b.target, cue: b.cue, ...(b.cursor === 'drag' ? { to: b.to, release: b.release } : {}) }] : [];
    [...own, ...(b.then ?? [])].forEach((a, k) => {
      need(a.target, `beat ${i}'s cursor`);
      if (a.cursor === 'drag') { if (!a.target || !a.to || a.release == null) throw new Error(`beats: line ${b.line}: a drag is { cursor: "drag", target, to: the name it is dropped on, release: a cue }`); need(a.to, `beat ${i}'s drag`); }
      acts.push({ ...a, beat: i, line: b.line, shot: s, first: k === 0 });
    });
    // (what a drag changes, it changes when the thing is let go)
    const cueOf = (a: Partial<Action>) => (a.cursor === 'drag' ? a.release : a.cue);
    for (const [c, cue] of [[b.change, cueOf(b)] as const, ...(b.then ?? []).map((a) => [a.change, cueOf(a)] as const)]) if (c) {
      if (c.kind === 'scrolls') { if (c.to !== 'bottom' && c.to !== 'top') need(c.to, `beat ${i}'s change`); }
      else if (c.kind === 'becomes') {
        if (!Number.isInteger(c.screen)) throw new Error(`beats: line ${b.line}: becomes names a screen number`);
        need(c.after, `beat ${i}'s change`);
        for (const name of c.grows ?? []) need(name, `beat ${i}'s change`);
        shot.later.push({ beat: i, screen: c.screen });
      } else if (c.kind !== 'page' && c.kind !== 'frame-back') { need(c.node, `beat ${i}'s change`); if (c.kind === 'opens' || c.kind === 'hover') need(c.after, `beat ${i}'s change`); }
      changes.push({ change: c, beat: i, shot: s, cue });
    }
    if (b.list) lists.push({ spec: b.list, beat: i, line: b.line, shot: s });
    if (b.bar) {
      const bad = checkBar(b.bar);
      if (bad) throw new Error(`beats: line ${b.line}'s bar: ${bad}`);
      if (bars.length) throw new Error(`beats: line ${b.line}: a film has one bar (line ${bars[0].line} has it)`);
      bars.push({ spec: b.bar, beat: i, line: b.line, shot: s });
    }
    if (b.sequence) {
      const q = b.sequence;
      if (!Number.isInteger(q.from) || (q.watch != null && !(Number.isInteger(q.watch) && q.watch >= q.from)) || !(q.then ?? []).every(Number.isInteger)) throw new Error(`beats: line ${b.line}: a sequence is { from, watch?, then?: [screens] }, with watch not before from`);
      need(q.follow, `beat ${i}'s sequence`);
      runs.push({ spec: q, beat: i, line: b.line, shot: s, cue: b.cursor ? undefined : b.cue });
      shot.later.push({ beat: i, screen: (q.then ?? []).at(-1) ?? q.watch ?? q.from });
    }
  });
  return { shots, acts, changes, lists, bars, runs, uses };
}

/** Every screen a beat file shows: each beat's own, what a shot becomes, every capture of a sequence. For the tools
 *  that rebuild or read the film's screens (the sweep). `all`: the manifest's screen numbers, to fill a watched run. */
export function screensShown(file: Pick<BeatsFile, 'beats'>, all?: number[]): number[] {
  const out = new Set<number>();
  for (const b of file.beats ?? []) {
    if (b.screen != null) out.add(b.screen);
    for (const c of [b.change, ...(b.then ?? []).map((a) => a.change)]) if (c?.kind === 'becomes') out.add(c.screen);
    if (b.sequence) for (const i of [...watchedOf(b.sequence, all), ...(b.sequence.then ?? [])]) out.add(i);
  }
  return [...out].sort((a, b) => a - b);
}
const watchedOf = (q: Sequence, all?: number[]) => { const to = q.watch ?? q.from; return all ? all.filter((i) => i >= q.from && i <= to) : Array.from({ length: to - q.from + 1 }, (_, k) => q.from + k); };

/** Every authored string a beat file puts on the frames outside a list (a bar's title, address and bookmarks; the
 *  text a `fills` draws into a field; what a library move or a one-off says it shows: its `text(inputs)`), for the
 *  sweep: [{ line, what, s }]. */
export function authoredText(file: Pick<BeatsFile, 'beats'>, moveOf?: MoveOf): { line: number; what: string; s: string }[] {
  const out: { line: number; what: string; s: string }[] = [];
  for (const b of file.beats ?? []) {
    for (const u of [...(b.moves ?? []), ...(b.cut ? [b.cut] : [])]) { const { move, at: _a, until: _u, ...inputs } = u; for (const s of moveOf?.(move)?.text?.(inputs) ?? []) out.push({ line: b.line, what: move, s }); }
    if (b.bar) for (const s of barText(b.bar)) out.push({ line: b.line, what: 'bar', s });
    for (const c of [b.change, ...(b.then ?? []).map((a) => a.change)]) if (c?.kind === 'fills' && c.text != null) out.push({ line: b.line, what: 'fill', s: [c.text].flat().map(String).join('\n') });
  }
  return out;
}

/** The framings of one shot at rest, in order: each at least a step tighter than the last, none so tight that a
 *  later one on the same screen could not follow without the camera pulling back. A framing marked `back` is the
 *  exception the film asked for: it is as wide as it wants, and nothing before it is held looser for it. */
function framings(shot: ShotPlan, all: Boxes, window: Box, from: (i: number, natural: Framing) => number, surround: Around[] = [], up: number[] = []): Framing[] {
  // (`up`: how far the page has scrolled by each framing: it frames everything that much higher. ponytail: an element
  // fixed to the window is raised with the rest; frame it before the scroll, or teach the measure what is fixed)
  const around = surround.map((a, i) => (up[i] ? { also: a.also?.map((b) => raised(b, up[i])), pieces: a.pieces?.map((b) => raised(b, up[i])) } : a));
  const at = up.map((dy) => (dy ? Object.fromEntries(Object.entries(all).map(([k, b]) => [k, { ...raised(b, dy), ...(b.row ? { row: raised(b.row, dy) } : {}), ...(b.group ? { group: raised(b.group, dy) } : {}) }])) : all));
  const natural = shot.frames.map((f, i) => frameFor(f.spec, at[i] ?? all, window, 0, Infinity, undefined, around[i]));
  const out: Framing[] = [];
  natural.forEach((n, i) => {
    // (a framing by cut is free as a `back` one is: nothing before it is held looser for it, and it is as wide as it asks)
    // (so is a framing to one side that follows one in the middle: it is smaller, to leave its column free)
    const free = (j: number) => { const spec = shot.frames[j].spec; return !!spec.back || !!spec.cut || (!!spec.side && j > 0 && !shot.frames[j - 1].spec.side); };
    const stop = shot.frames.findIndex((_, j) => j > i && free(j)), until = stop < 0 ? natural.length : stop;
    const later = natural.slice(i + 1, until).map((l) => mostScale(l.box) / STEP);
    const next = natural[i + 1]?.box;             // where the camera goes after this framing, if anywhere
    const prev = i ? from(i, out[i - 1]) : 0;
    out.push(frameFor(shot.frames[i].spec, at[i] ?? all, window, free(i) ? 0 : prev, Math.min(Infinity, ...later), next && { x: next.x + next.w / 2, y: next.y + next.h / 2 }, around[i]));
  });
  return out;
}

/** What each framing of each shot is told about its surroundings: the screen's elements (when measured), and what a
 *  click seen in that framing opens (so it is whole in the frame when it appears; a band across the page is not held). */
function aroundOf(shots: ShotPlan[], acts: Act[], changes: Changed[], boxes: Boxes, layout: Layout | undefined, windowOf: (s: number) => Box): Around[][] {
  return shots.map((shot, s) => {
    const out: Around[] = shot.frames.map((f) => ({ pieces: piecesIn(layout, shot, boxes, screenBy(shot, f.beat)), also: [] }));
    for (const { change } of changes.filter((c) => c.shot === s)) {
      if (change.kind !== 'opens' || !change.after || boxes[change.node].w > BAND * windowOf(s).w) continue;
      const click = acts.find((a) => a.shot === s && a.cursor === 'click' && a.target === change.after);
      const k = click ? shot.frames.findLastIndex((f) => f.beat <= click.beat) : -1;
      if (k >= 0 && shot.frames[k].spec.target !== change.node) out[k].also!.push(plainBox(boxes[change.node]));
    }
    return out;
  });
}

type Pace = { cursorPx?: number; /** the line's first action is a `move`: its distance is covered under the line's words, not before them */ glide?: boolean; zoom?: number; cut?: boolean; list?: boolean; read?: boolean; wait?: number };
/** What the film does between line i-1 and line i, for the pacing (tools/pacing.mjs): how far the cursor travels on
 *  the frame, how far the camera goes in or out, whether the page changes, whether something that has just opened
 *  must be read before the film closes. From the beat file and the boxes alone, so the narration can be timed before
 *  the film exists. */
export function movesFrom(file: BeatsFile, boxes: Boxes, layout?: Layout): (Pace | null)[] {
  const { shots, acts, changes } = read(file, boxes), windowOf = windowsOf(file, shots, boxes);
  const lines = Math.max(...file.beats.map((b) => b.line)) + 1;
  const around = aroundOf(shots, acts, changes, boxes, layout, windowOf);
  const rest = shots.map((shot, s) => framings(shot, boxes, windowOf(s), (_, prev) => prev.scale * STEP, around[s]));
  /** the framing in force for a beat, and the camera it gives at rest */
  const framingOf = (beat: number) => { const s = shots.findIndex((x) => x.beats.includes(beat)), k = shots[s].frames.findLastIndex((f) => f.beat <= beat); return { s, k, f: rest[s][k] }; };
  const camOf = (f: Framing) => cameraAt([{ frame: 0, box: f.box, fill: f.fill }], 0, FRAME);
  const out: (Pace | null)[] = [];
  let at = OFF;                                   // where the cursor is, on the frame
  for (let line = 0; line < lines; line++) {
    let m: Pace | null = null;
    // the line before showed a list: it clears, and the screen comes back, before anything else moves
    if (file.beats.some((b) => b.line === line - 1 && b.list)) m = { list: true };
    file.beats.forEach((b, i) => {
      if (b.line !== line) return;
      const { s, k, f } = framingOf(i);
      if (shots[s].frames[k].beat === i) {        // this beat brings a new framing
        if (k === 0 && s > 0) m = { ...m, cut: true, zoom: 1 };
        else if (k > 0) { const z = f.scale / rest[s][k - 1].scale; m = { ...m, zoom: Math.max(m?.zoom ?? 1, z >= 1 ? z : 1 / z) }; }
      }
      for (const a of acts.filter((x) => x.beat === i)) {
        const to = a.cursor === 'leave' ? GONE : a.target ? project(camOf(f), a.cursor === 'click' ? clickPoint(boxes[a.target]) : beside(boxes[a.target]), FRAME) : null;
        if (!to) continue;
        if (a.cursor === 'leave') {
          m = { ...m, cut: true };                // the screen gives way to the end card: a change of scene
          // what the line before left open (a message that the thing was done) is read before the screen goes
          const last = changes.filter((c) => file.beats[c.beat].line === line - 1).at(-1)?.change.kind;
          if (last === 'opens' || last === 'becomes') m = { ...m, read: true };
          // ...and what the page took its time over (a `becomes` that waits) has that time before it comes
          // ponytail: only before the closing line; a waiting `becomes` mid-film gets no air of its own (cue the next line's action late, or add it here)
          const waited = changes.filter((c) => file.beats[c.beat].line === line - 1).map((c) => (c.change.kind === 'becomes' ? swapAfter(file, c.change) - SWAP_AFTER : 0)).reduce((a, b) => a + b, 0);
          if (waited > 0) m = { ...m, wait: +waited.toFixed(2) };
        }
        // (a `move` leaves at once and arrives on its cue: when it is the line's first action its travel is not air before the line)
        if (m?.cursorPx == null && !m?.glide) m = a.cursor === 'move' ? { ...m, glide: true } : { ...m, cursorPx: Math.round(Math.min(dist(at, to), Math.hypot(FRAME.width, FRAME.height))) };
        at = to;
      }
    });
    out.push(m);
  }
  return out;
}

/** The camera's keys with the picture moved down by `lift(frame)` screen px (the browser bar growing out of the
 *  window's top: the window grows about its middle). Where the lift changes (`ranges`, in frames), every frame of each
 *  camera move it falls in is sampled, so the camera's own path is kept exactly; elsewhere the keys are only shifted. */
function lifted(keys: CamKey[], lift: (frame: number) => number, ranges: [number, number][]): CamKey[] {
  const dense = new Set<number>();
  for (const [a, b] of ranges) {
    for (let f = a; f <= b; f++) dense.add(f);
    keys.forEach((k, i) => { const n = keys[i + 1]; if (n && n.frame > a && k.frame < b) for (let f = k.frame; f <= n.frame; f++) dense.add(f); });
  }
  const sampled = (f: number): CamKey => { const c = cameraAt(keys, f, FRAME), w = 1000; return { frame: f, box: { x: c.cx - w / 2, y: c.cy - lift(f) - 0.5, w, h: 1 }, fill: (c.s * w) / FRAME.width, ease: 'linear' }; };
  const frames = [...new Set([...keys.map((k) => k.frame), ...dense])].sort((a, b) => a - b);
  return frames.map((f) => { const own = keys.find((k) => k.frame === f); return dense.has(f) || !own ? sampled(f) : { ...own, box: { ...own.box, y: own.box.y - lift(f) } }; });
}

/** The camera's notes (cameraFaults: one a frame) as one a run: "frames 627 to 641: moves up to 102.0 px in one frame". */
function runsOf(notes: string[]): string[] {
  const out: { from: number; to: number; what: string; most: number }[] = [];
  for (const n of notes) {
    const m = /^frame (\d+): (.*)$/.exec(n);
    if (!m) continue;
    const f = Number(m[1]), px = /^moves ([\d.]+) px/.exec(m[2]), what = px ? 'moves' : /^camera identical/.test(m[2]) ? 'the camera is the same as the frame before' : m[2], last = out.at(-1);
    if (last && last.what === what && last.to === f - 1) { last.to = f; last.most = Math.max(last.most, px ? Number(px[1]) : 0); }
    else out.push({ from: f, to: f, what, most: px ? Number(px[1]) : 0 });
  }
  return out.map((r) => `${r.from === r.to ? `frame ${r.from}` : `frames ${r.from} to ${r.to}`}: ${r.what === 'moves' ? `moves up to ${r.most.toFixed(1)} px in one frame` : r.what}`);
}

/** The film. `faults`: notes on how it came out (a camera that pulls back or jumps, a cursor with too few frames, a
 *  bar with no room to grow): for whoever builds it to use or not. None stops a film (empty = nothing to remark).
 *  `hasIcon`: is this name in the bundled icon set (kit/icons.ts)? Given, a list naming any other icon is an error.
 *  `built`: the brand's mark builds on the end card (close.ts): the reveal, and so perhaps the film, is longer. */
export function makeBeats(file: BeatsFile, boxes: Boxes, timing: Timing, layout?: Layout, hasIcon?: (name: string) => boolean, built = false, moveOf?: MoveOf) {
  const fps = timing.fps, F = (s: number) => Math.round(s * fps), R = (x: number) => Math.round(x * fps) / fps;
  const S = timing.sentences, close = closeOf(timing, built), faults: string[] = [];
  const { shots, acts, changes, lists: listed, bars, runs, uses } = read(file, boxes), windowOf = windowsOf(file, shots, boxes);
  const vpOf = (s: number): Size => file.viewports?.[shots[s].screen] ?? file.viewport;
  const around = aroundOf(shots, acts, changes, boxes, layout, windowOf);
  for (const b of file.beats) if (!S[b.line]) throw new Error(`beats: line ${b.line} is not in the timing (${S.length} lines)`);
  /** when line i says `cue`, in film seconds */
  const said = (i: number, cue: Cue) => {
    const c = typeof cue === 'string' ? { word: cue } : cue, w = S[i].words.filter((x) => x.w === word(c.word))[c.nth ?? 0];
    if (!w) throw new Error(`beats: line ${i} has no "${c.word}"${c.nth ? ` (occurrence ${c.nth})` : ''}`);
    return w.start;
  };
  const when = (a: Act) => (a.cue != null ? said(a.line, a.cue) : S[a.line].start);
  const timed = acts.filter((a) => a.cursor !== 'enter' && a.cursor !== 'leave').map((a) => ({ ...a, t: when(a) }));
  const clicks = timed.filter((a) => a.cursor === 'click');
  // ── lists: each on the words of its own line ──
  const lists: ({ beat: number; shot: number } & ListPlay)[] = listed.map((l) => {
    for (const it of l.spec.items ?? []) if (hasIcon && !hasIcon(it.icon)) throw new Error(`beats: line ${l.line}'s list names the icon "${it.icon}", which is not in the icon set (see the names: helper.mjs icons <a word>)`);
    return { beat: l.beat, shot: l.shot, ...playList(l.spec, l.line, (cue) => said(l.line, cue), S[l.line].end, fps, faults) };
  });

  // ── moments ──
  // ── stages: a tone, or a named stage that passes its own check ──
  for (const [use, where] of [[file.stage, 'stage'] as const, ...file.beats.filter((b) => b.scene?.stage != null).map((b) => [b.scene!.stage, `line ${b.line}'s stage`] as const)]) {
    if (use == null || use === 'light' || use === 'dark') continue;
    if (typeof use !== 'object' || typeof use.move !== 'string') throw new Error(`beats: ${where} is "light", "dark", or a named stage { "move": "<stage>", "tone": "light" | "dark", ...its inputs }`);
    const { move: name, ...inputs } = use, mod = moveOf?.(name);
    if (moveOf && mod?.about.use !== 'stage') throw new Error(`beats: ${where} "${name}" is not a stage in the library (helper.mjs moves lists them)`);
    const bad = mod?.check?.(inputs); if (bad) throw new Error(`beats: ${where} (${name}): ${bad}`);
  }
  const open = file.open?.move;
  if (file.open && open !== 'title-makes-room' && open !== 'cut-to-screen') throw new Error('beats: open is { move: "title-makes-room" | "cut-to-screen" }');
  const makesRoom = open === 'title-makes-room';
  if (makesRoom && (shots[0].scene || shots[0].window || !shots[0].frames[0].spec.whole)) faults.push('open: title-makes-room puts the whole first screen aside at its size: the first shot is a scene, a windowed shot, or not framed whole');
  // the first screen settles in as the title clears; with an open it is there from the first frame
  const enter = open ? 0 : S[0].start - 0.55;
  const openLeave = makesRoom ? S[0].start - 1.0 : open ? -1 : S[0].start - 1.3;   // the title starts to clear (cut-to-screen: there is none)
  /** title-makes-room: the window is back in the middle at its size from here. Until then nothing acts on the first
   *  shot: the camera's first move and the cursor's entrance wait for it (the cursor is placed by the camera alone,
   *  and the window is not where its camera has it while it stands aside) */
  const roomBack = makesRoom ? openLeave + OPEN.clear + OPEN.back : -Infinity;
  const cuts = shots.map((shot, s) => {
    if (s === 0) return enter;
    const first = shot.beats[0], cause = clicks.filter((c) => c.beat === first - 1).at(-1);
    const next = S[file.beats[first].line].start;
    if (!cause || timed.filter((a) => a.beat === first - 1).at(-1) !== cause) return next - CUT_BEFORE_LINE;
    // the click that leaves the page is the last thing the beat before does: the new page follows it, unless its own
    // line still has something to say: then the shot holds until the line has been said
    const soon = cause.t + CUT_AFTER_CLICK;
    return S[cause.line].end - soon < LINE_LEFT ? soon : Math.max(soon, next - CUT_HOLD);
  });
  // ── cut moves: the way into a shot; the shot before stays up for the cut's length ──
  const cutPlays = shots.flatMap((shot, s) => {
    // (on the first shot: the way in from the open. There is no shot before; the shot's camera and cursor are as without it)
    if (!shot.cut) return [];
    const { move: name, until, ...inputs } = shot.cut.use, mod = moveOf?.(name), line = file.beats[shot.cut.beat].line;
    if (moveOf && !mod) throw new Error(`beats: line ${line} names the cut "${name}", which is not in the library (helper.mjs moves lists them)`);
    const bad = mod?.check?.(inputs); if (bad) throw new Error(`beats: line ${line}'s ${name}: ${bad}`);
    // (`until`: it runs to that word of its line; the inputs it lists as cues reach it as seconds, as a move's do)
    const dur = until != null ? said(line, until) - cuts[s] : mod?.takes?.(inputs) ?? 0.7;
    if (!(dur > 0)) throw new Error(`beats: line ${line}'s ${name}: until is a word said after the cut starts`);
    const timed = Object.fromEntries((mod?.about.cues ?? []).filter((k) => inputs[k] != null).map((k) => [k, Array.isArray(inputs[k]) ? (inputs[k] as Cue[]).map((c) => R(said(line, c))) : R(said(line, inputs[k] as Cue))]));
    // (`window`: the new shot's window in its screen's px; the move is told where that is on the frame: `into`)
    return [{ name, shot: s, at: cuts[s], dur: R(dur), inputs: { ...inputs, ...timed }, pins: pinsOf(inputs, boxes), ...pinScreensOf(inputs, boxes), ...(shot.scene ? {} : { window: windowOf(s) }) }];
  });
  /** how long the cut move into shot s runs (0: a plain cut) */
  const cutDur = (s: number) => cutPlays.find((c) => c.shot === s)?.dur ?? 0;
  /** an end on a glyph: the last shot is cut away this long before its window would have left (close.ts GLYPH) */
  const glyphAt = file.end?.move === 'end-glyph' ? R(close.windowOut - GLYPH.lead) : null;
  const ends = shots.map((_, s) => (s + 1 < shots.length ? cuts[s + 1] + cutDur(s + 1) : glyphAt ?? close.endCard));
  // ── library moves and one-offs: each from its cue (else its line's start) to its cue (else the line's end, or as long as it takes) ──
  const plays = uses.map(({ use, line, shot }) => {
    const { move: name, at, until, ...inputs } = use, mod = moveOf?.(name);
    if (moveOf && !mod) throw new Error(`beats: line ${line} names the move "${name}", which is not in the library (helper.mjs moves lists them)`);
    const bad = mod?.check?.(inputs); if (bad) throw new Error(`beats: line ${line}'s ${name}: ${bad}`);
    const from = at != null ? said(line, at) : S[line].start, to = until != null ? said(line, until) : Math.max(from + (mod?.takes?.(inputs) ?? 0), S[line].end);
    // the inputs the move lists as cues (about.cues) reach it as seconds: the words are the beat file's, the times the film's
    const timed = Object.fromEntries((mod?.about.cues ?? []).filter((k) => inputs[k] != null).map((k) => [k, Array.isArray(inputs[k]) ? (inputs[k] as Cue[]).map((c) => R(said(line, c))) : R(said(line, inputs[k] as Cue))]));
    // the elements it draws alone (about.lifts: 'node', or a list 'nodes[]'): which node of which screen each is
    const lifted = (mod?.about.lifts ?? []).flatMap((p) => [inputs[p.replace(/\[\]$/, '')]].flat()).filter((v): v is string => typeof v === 'string');
    for (const n of lifted) if (!boxes[n]) throw new Error(`beats: line ${line}'s ${name} names "${n}", which has no measured box`);
    return { name, shot, line: { start: S[line].start, end: S[line].end }, from: R(from), to: R(to), inputs: { ...inputs, ...timed }, pins: pinsOf(inputs, boxes), ...pinScreensOf(inputs, boxes),
      ...(lifted.length ? { lifts: Object.fromEntries(lifted.map((n) => [n, { node: boxes[n].node, screen: boxes[n].screen }])) } : {}) };
  });
  /** when a click on `name` happens (the first one), if the film has one */
  const clickOn = (name?: string) => clicks.find((c) => c.target === name)?.t;
  const opensAt = (c: Change & { kind: 'opens' }, beat: number) => clickOn(c.after) ?? S[file.beats[beat].line].start;
  /** when a change with no click of its own happens: on its beat's (or action's) cue word, else with the line */
  const cued = (c: Changed) => (c.cue != null ? said(file.beats[c.beat].line, c.cue) : S[file.beats[c.beat].line].start);

  // ── the captures each shot shows, in time: its own, then whatever it becomes (a `becomes`, a `sequence`) ──
  const shown = shots.map((shot, s) => [{ at: cuts[s], screen: shot.screen }]);
  const becameAt = new Map<Change, number>();
  for (const c of changes) {
    if (c.change.kind !== 'becomes') continue;
    const after = swapAfter(file, c.change), at = c.change.after ? (clickOn(c.change.after) ?? cued(c)) + after : c.cue != null ? cued(c) + after : cued(c);
    becameAt.set(c.change, Math.round(at * fps) / fps);
    shown[c.shot].push({ at, screen: c.change.screen });
  }
  const takenAt = (i: number) => file.screens?.find((x) => x.i === i)?.t;
  for (const r of runs) {
    const line = S[r.line], t0 = r.cue != null ? said(r.line, r.cue) : line.start, rest = r.spec.then ?? [];
    const watched = watchedOf(r.spec, file.screens?.map((x) => x.i)), base = takenAt(watched[0]);
    const out = watched.map((i, k) => ({ at: t0 + (base != null && takenAt(i) != null ? takenAt(i)! - base : 0.5 * k), screen: i }));
    const left = line.end - SEQ_HOLD - (out.at(-1)?.at ?? t0), dwell = rest.length ? left / rest.length : 0;
    if (rest.length && dwell < MIN_DWELL / fps) faults.push(`line ${r.line}: the watched screens run to ${(out.at(-1)?.at ?? t0).toFixed(2)} s and leave ${Math.max(0, Math.round(left * fps))} frames for ${rest.length} more: watch fewer screens, or the line needs more air`);
    for (const i of rest) out.push({ at: (out.at(-1)?.at ?? t0) + Math.max(dwell, MIN_DWELL / fps), screen: i });
    shown[r.shot].push(...out);
  }
  for (const list of shown) { list.sort((a, b) => a.at - b.at); for (const x of list) x.at = Math.round(x.at * fps) / fps; }
  const screenAt = (s: number, t: number) => shown[s].findLast((x) => x.at <= t)?.screen ?? shots[s].screen;
  /** what each capture of shot s adds to the one before it, where the two can be matched: both measured, and every
   *  element measured in the one before still there (the same page with more on it: a row added to a list). Anything
   *  else comes whole, as ever: a capture that takes something away, one not measured, and a `becomes` with `grows`
   *  (its element is carried to its new box already) */
  const addsOf = (s: number): NonNullable<Staging['adds']> => shown[s].slice(1).flatMap((x, k) => {
    const was = layout?.[shown[s][k].screen]?.boxes, is = layout?.[x.screen]?.boxes;
    if (!was || !is || !Object.keys(was).length || Object.keys(was).some((id) => !is[id])) return [];
    if (changes.some((c) => c.shot === s && c.change.kind === 'becomes' && c.change.screen === x.screen && c.change.grows)) return [];
    const nodes = Object.keys(is).filter((id) => !was[id]).map(Number);
    return nodes.length ? [{ at: x.at, nodes }] : [];
  });

  // ── scrolls (seconds): the content of a windowed shot moves up inside its window and the camera holds; a whole
  // screen's own document scrolls (changes.ts `stage`) in its window on the stage ──
  const scrolls: Scroll[][] = shots.map(() => []), scrollBeats: number[][] = shots.map(() => []);
  for (const { change, beat, shot: s, cue } of changes) {
    if (change.kind !== 'scrolls') continue;
    const line = file.beats[beat].line, shot = shots[s], w = windowOf(s);
    // (how far a full page goes is known only when its elements are measured; a named element is always reachable)
    if (!shot.window && change.to === 'bottom' && !piecesOf(layout, shot.screen).length) { faults.push(`line ${line}: a full page scrolls to a named element (where its bottom is has not been measured)`); continue; }
    if (shot.window && shot.frames.some((f) => f.beat >= beat && !f.spec.whole && (f.spec.target || f.spec.targets?.length))) faults.push(`line ${line}: the camera frames a target on or after a scroll: keep the camera on the whole window while its content scrolls`);
    // what scrolls: the window's nodes, or the page down to the lowest thing measured on it (it is at least that long)
    const c = shot.window ? contentOf(shot, boxes) : { x: 0, y: 0, w: w.w, h: Math.max(w.h, ...[...piecesOf(layout, shot.screen), ...Object.values(boxes).filter((b) => b.screen === shot.screen && b.node >= 0)].map((b) => b.y + b.h)) };
    const most = Math.max(0, c.h - w.h), y0 = scrolls[s].at(-1)?.y1 ?? 0;
    const y1 = change.to === 'bottom' ? most : change.to === 'top' ? 0 : clamp(boxes[change.to].y - c.y - 0.12 * w.h, 0, most);
    const from = Math.max(cue != null ? said(line, cue) : S[line].start, scrolls[s].at(-1)?.to ?? -Infinity), to = Math.min(from + clamp(0.9 + Math.abs(y1 - y0) / 450, 1.2, 4), S[line].end - 0.2);
    if (to - from < 0.8) faults.push(`line ${line}: the scroll has ${F(Math.max(0, to - from))} frames before the line ends: cue it on an earlier word`);
    scrolls[s].push({ from, to: Math.max(to, from + 0.1), y0, y1 });
    scrollBeats[s].push(beat);
  }
  /** how far a whole screen's page has scrolled by each framing of shot s (a framing on the scroll's own beat, or
   *  after it, frames things where the scroll leaves them); a windowed shot's camera holds: none */
  const scrolledBy = (s: number) => shots[s].frames.map((f) => (shots[s].window ? 0 : scrolls[s][scrollBeats[s].findLastIndex((b) => b <= f.beat)]?.y1 ?? 0));

  // ── the end: a logo lift pushes toward a named element of the last shot's screen ──
  // (or on a glyph: a hard cut to one element of that screen alone)
  const lift = file.end?.move === 'logo-lift' ? file.end.from : null, glyph = file.end?.move === 'end-glyph' ? file.end.glyph : null, ended = lift ?? glyph;
  if (file.end) {
    if (typeof ended !== 'string') throw new Error('beats: end is { move: "logo-lift", from: a name in `nodes` } or { move: "end-glyph", glyph: a name in `nodes` }');
    if (!boxes[ended]) throw new Error(`beats: end names "${ended}", which has no measured box`);
    if (shots.at(-1)!.scene || shots.at(-1)!.window) throw new Error(`beats: ${lift ? 'a logo lift' : 'an end glyph'} ends on a whole screen: the film's last shot is a scene or a windowed shot`);
    if (glyph && boxes[glyph].screen !== screenAt(shots.length - 1, glyphAt!)) throw new Error(`beats: end names "${glyph}", which is not on the screen the film ends on (screen ${screenAt(shots.length - 1, glyphAt!)})`);
    // (the cut to the glyph comes GLYPH.lead before the window would have gone: the line before the closing one should be over)
    if (glyph && S.length > 1 && S[S.length - 2].end > glyphAt!) faults.push(`end: the glyph cuts in ${F(S[S.length - 2].end - glyphAt!)} frames before line ${S.length - 2} has been said: the closing line needs more air before it`);
  }
  /** how far the last shot's page has scrolled when the film ends: a box of that screen is that much higher in its window */
  const endUp = scrolls.at(-1)!.at(-1)?.y1 ?? 0;
  // ── cameras (frames): per shot, one continuous move; every hold a slow push ──
  const starts = new Map<number, number>();        // beat -> the second its camera move starts
  // a bar that leaves with the camera (`leaves`): the first framing after the bar's beat on its shot does not wait
  // for its own line: it starts once what the bar's bookmark brought has arrived, and carries the bar out (`carry`)
  const carried = bars[0]?.spec.leaves === 'with-camera' ? bars[0] : null;
  const heroAt = carried ? clicks.find((c) => c.shot === carried.shot && c.target === HERO)?.t ?? S[carried.line].end : 0;
  let carry: { start: number; arrive: number } | undefined;
  const ordered = shots.map((shot, s) => buildKeys(shot, s));
  function buildKeys(shot: ShotPlan, s: number): CamKey[] {
    const keys: CamKey[] = [];
    let at = cuts[s];
    const moves: { start: number; arrive: number }[] = [], up = scrolledBy(s);
    // a held shot (its first framing says `hold`): no drift, no settling in after the cut; every key says so
    const held = !!shot.frames[0].spec.hold, drift = held ? (fill: number) => fill : drifted, mark = held ? { hold: true as const } : {};
    const landed = s && !held ? cuts[s] + CUT_SETTLE : cuts[s];
    const rest = framings(shot, boxes, windowOf(s), (i, prev) => {
      const beat = shot.frames[i].beat, b = file.beats[beat], line = S[b.line];
      if (shot.frames[i].spec.cut) {
        // a framing by cut: on the frame a travelling camera would have arrived on, one frame after the last of the framing before
        const act = timed.find((a) => a.beat === beat), due = !b.cursor && b.cue != null ? said(b.line, b.cue) : act ? act.t : line.start;
        const arrive = Math.max(due - 0.1, (i === 1 ? Math.max(landed, s === 0 ? roomBack : -Infinity) : moves[i - 2].arrive) + 2 / fps);
        moves.push({ start: arrive - 1 / fps, arrive });
        starts.set(beat, arrive);
        return 0;
      }
      const goal = frameFor(shot.frames[i].spec, boxes, windowOf(s)), zoom = goal.scale / prev.scale;
      // (a long way across the page takes its time; so does a pull-back, by how far out it goes)
      const across = dist({ x: prev.box.x + prev.box.w / 2, y: prev.box.y + prev.box.h / 2 }, { x: goal.box.x + goal.box.w / 2, y: goal.box.y + goal.box.h / 2 - up[i] }) * Math.max(goal.scale, prev.scale);
      const dur = Math.max(zoom >= 1 ? moveSeconds(zoom) : 1.2 + 0.5 * Math.log2(1 / zoom), across > FAR ? across / FAR_SPEED : 0);
      const opened = changes.find((c) => c.beat === beat && c.change.kind === 'opens' && c.change.node === shot.frames[i].spec.target);
      const act = timed.find((a) => a.beat === beat);
      // the camera is there for the beat's first action; a beat with a cue word and no cursor of its own says when itself
      const due = !b.cursor && b.cue != null ? said(b.line, b.cue) : act ? act.t : line.start;
      const reached = i === 1 ? landed : moves[i - 2].arrive;
      let start: number, arrive: number;
      const carries = !!carried && s === carried.shot && beat > carried.beat && !carry;
      if (opened) { start = opensAt(opened.change as Change & { kind: 'opens' }, beat) + 0.1; arrive = start + dur; }
      else if (carries) { start = heroAt + ARRIVED[carried.spec.arrives ?? 'down'] + 0.1; arrive = start + dur; }
      else { arrive = due - 0.1; start = Math.min(arrive - dur, line.start - 0.15); }
      start = Math.max(start, (i === 1 && s === 0 ? Math.max(reached, roomBack) : reached) + 0.25);
      // after a list on an earlier beat of this shot the camera leaves only once the screen is sharp again, and is
      // not hurried for it: it keeps the move's own length, and may be on the last of its way in as the cursor acts
      const sharp = Math.max(-Infinity, ...lists.filter((l) => l.shot === s && l.beat < beat).map((l) => l.sharp));
      if (!opened && sharp > start) {
        start = sharp;
        const late = start + dur - arrive;
        if (late > 0.2 * dur) faults.push(`line ${b.line}: after the list the camera is still on its way in when ${act ? 'the cursor acts' : 'the line starts'} (${F(late)} frames short): ${act ? 'cue the action on a later word' : 'the line needs more air'}`);
        arrive = Math.max(arrive, start + dur);
      }
      arrive = Math.max(arrive, start + 0.5);
      if (carries) carry = { start, arrive };
      moves.push({ start, arrive });
      starts.set(beat, start);
      return ((drift(prev.fill, start - reached) * FRAME.width) / prev.box.w) * STEP;
    }, around[s], up);
    rest.forEach((f, i) => {
      if (i === 0) {
        if (s === 0 || held) keys.push({ frame: F(cuts[s]), box: f.box, fill: f.fill, ...mark });
        else keys.push({ frame: F(cuts[s]), box: f.box, fill: f.fill * CUT_LOOSE }, { frame: F(cuts[s] + CUT_SETTLE), box: f.box, fill: f.fill, ease: 'out' });
        at = landed;
      } else {
        const m = moves[i - 1], prev = rest[i - 1];
        if (F(m.start) > keys.at(-1)!.frame) keys.push({ frame: F(m.start), box: prev.box, fill: drift(prev.fill, m.start - at), ease: 'linear', ...mark });
        keys.push({ frame: Math.max(F(m.arrive), keys.at(-1)!.frame + 1), box: f.box, fill: f.fill, ...(shot.frames[i].spec.cut ? { cut: true as const } : {}), ...mark });
        at = m.arrive;
      }
    });
    // the last hold runs to the cut, or a little past the moment the end card starts to set; with a logo lift, to
    // where the push toward the logo starts
    const lifts = !!lift && s === shots.length - 1;
    const end = s + 1 < shots.length ? ends[s] : lifts ? close.windowOut - LIFT.lead : close.endCard + 0.1, last = rest.at(-1)!;
    if (!lifts) { if (F(end) > keys.at(-1)!.frame) keys.push({ frame: F(end), box: last.box, fill: drift(last.fill, end - at), ease: 'linear', ...mark }); return keys; }
    // One heavy push toward the logo, arriving as the end card starts to set: it is framed at LIFT_FILL of the
    // frame's width, or as near to that as the camera's own rule (cameraFaults) allows: a small logo is not gone in
    // on so far (the end card's mark sets out of wherever it has got to, never looser than the camera was); and when
    // the camera is close on something far from it, the push starts earlier, up to LIFT_LONGEST seconds before it arrives.
    const b = raised(plainBox(boxes[lift!]), endUp), floor = keys.at(-1)!.frame, arrive = Math.max(F(end + LIFT.push), floor + 2);
    let start = Math.max(F(end), floor), fill = LIFT_FILL;
    for (;;) {
      const hold: CamKey = start > floor ? { frame: start, box: last.box, fill: drift(last.fill, start / fps - at), ease: 'linear' } : keys.at(-1)!;
      const least = 1.05 * ((hold.fill * b.w) / hold.box.w), key: CamKey = { frame: arrive, box: b, fill: (fill = Math.max(least, Math.min(fill, LIFT_FILL))), ease: 'heavy' };
      const fast = cameraFaults([hold, key], hold.frame, arrive, FRAME).length > 0;
      if (fast && fill > least) { fill *= 0.95; continue; }
      if (fast && start - 3 > floor && arrive - start < LIFT_LONGEST * fps) { start -= 3; continue; }
      if (hold !== keys.at(-1)) keys.push(hold);
      keys.push(key);
      return keys;
    }
  }

  // ── the browser bar: out of the window's top under its line, back in after it; the window grows about its middle ──
  let bar: { shot: number; spec: BarSpec; play: BarPlay; click: number | null } | undefined;
  if (bars.length) {
    const { spec, line: n, shot: s } = bars[0], line = S[n], click = clicks.find((c) => c.shot === s && c.target === HERO)?.t ?? null;
    const { note, ...plain } = barPlay({ ready: cuts[s], lineStart: line.start, lineEnd: line.end, from: spec.from != null ? said(n, spec.from) : null, click }, fps);
    if (note) faults.push(`line ${n}: ${note}`);
    const half = barMetrics(vpOf(s).width).height / 2, base = ordered[s];
    const lift = (p: BarPlay) => lifted(base, (frame) => half * barOut(p, frame / fps), [[F(p.from), F(p.to)], [F(p.back), F(p.gone)]]);
    let play: BarPlay = plain;
    if (carried) {
      // the room the bar took is given back over the camera's push, and the bar is there, whole, until the window's
      // top edge (the bar's foot: y 0 of the screen) is above the frame's: it is taken away unseen
      const gives = carry && { ...plain, back: R(carry.start), gone: R(carry.arrive) }, keys = gives && lift(gives);
      const off = keys ? Array.from({ length: F(gives!.gone) - F(gives!.back) + 1 }, (_, k) => F(gives!.back) + k).find((f) => project(cameraAt(keys, f, FRAME), { x: 0, y: 0 }, FRAME).y <= -2) : undefined;
      if (off != null) play = { ...gives!, off: off / fps };
      else faults.push(`line ${n}: the bar leaves with the camera, but ${carry ? 'the next framing keeps the window\'s top in the frame' : 'no framing follows it on its shot'}: it goes back in instead`);
    }
    ordered[s] = lift(play);
    bar = { shot: s, spec, play, click };
  }

  // ── cursor (frames; stops on the frame). One cursor: it enters once, rests with what it points at, and leaves. ──
  /** a place in the shot's content, on the frame: under the shot's camera, and up by however far its content has scrolled */
  const on = (s: number, p: { x: number; y: number }): Stop => (frame) => project(cameraAt(ordered[s], frame, FRAME), scrolls[s].length ? { x: p.x, y: p.y - scrollAt(scrolls[s], frame / fps) } : p, FRAME);
  const moves: Move[] = [], begins: number[] = [], drags: NonNullable<Beats['drags']> = [];
  let prev: Stop = () => OFF, shotBefore = 0;
  /** what a waiting cursor must not sit on in shot s at second t: the text, icons and fields of the capture then
   *  showing, less whatever has not opened yet */
  const inkAt = (s: number, t: number) => {
    const shut = changes.filter((c) => c.shot === s && c.change.kind === 'opens' && opensAt(c.change as Change & { kind: 'opens' }, c.beat) > t).map((c) => plainBox(boxes[(c.change as Change & { kind: 'opens' }).node]));
    return leavesOf(piecesIn(layout, shots[s], boxes, screenAt(s, t))).filter((p) => !shut.some((b) => holds(b, p)));
  };
  /** the place on the screen that sits at frame point `p` under shot s's camera at `frame`, and the screen px to one frame px there */
  const under = (s: number, frame: number, p: { x: number; y: number }) => { const cam = cameraAt(ordered[s], frame, FRAME); return { x: cam.cx + (p.x - FRAME.width / 2) / cam.s, y: cam.cy + (p.y - FRAME.height / 2) / cam.s, k: 1 / cam.s }; };
  const travel = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.round(clamp(0.55 + dist(a, b) / 700, 0.7, 2.4) * fps);
  /** a scene has no cursor: one that is on leaves over the second before scene shot s comes, and is gone by its cut */
  const leaveFor = (s: number) => {
    const at = F(cuts[s]), from = Math.max(moves.at(-1)!.to + 2, at - fps);
    moves.push({ from, to: Math.max(at, from + 1), stop: () => GONE, bow: 0.1 });
    begins.push(from / fps);
    prev = () => GONE;
  };
  timed.forEach((a, n) => {
    if (!a.target) return;
    // the first scene between where the cursor last acted (or the film's start) and this action's shot, if any
    const scene = shots.findIndex((x, i) => !!x.scene && i < a.shot && i > (moves.length ? shotBefore : -1));
    const click = a.cursor === 'click' || a.cursor === 'drag', to = F(a.t - (click ? 0.07 : 0.05)), box = boxes[a.target], k = 1 / cameraAt(ordered[a.shot], to, FRAME).s;
    // pointing without clicking it rests beside the target; where a neighbour stands there (the next field of a row),
    // on the target's own blank spot instead, as measured for a click
    const crowded = () => { const p = beside(box); return !clearOf(p.x, p.y, inkAt(a.shot, a.t).filter((q) => !holds(box, q) && !holds(q, box)), k); };
    // beside something as wide as its window there is no beside: it rests inside it, on a blank part
    const room = shots[a.shot].window ? contentOf(shots[a.shot], boxes) : windowOf(a.shot), edge = !click && beside(box).x > room.x + room.w - 12 * k;
    const within = () => clearNear({ x: box.x + 0.86 * box.w, y: box.y + 0.55 * box.h }, inkAt(a.shot, a.t), { x: box.x + 8 * k, y: box.y + 4 * k, w: box.w - 30 * k, h: box.h - 8 * k }, k);
    // (a control that shows something under the pointer, a `hover`, is rested ON, not beside)
    const over = !click && changes.some((c) => c.shot === a.shot && c.change.kind === 'hover' && c.change.after === a.target);
    const aim = click || over || (box.spot && (edge || crowded())) ? clickPoint(box) : edge ? within() : beside(box);
    // (on a browser bar the cursor is never above the window: until the bar is out, and once it has gone back in, the
    // window's top edge is lower than the bookmark, and the cursor is just under it)
    const top = bar && box.node < 0 ? barMetrics(vpOf(a.shot).width).height : 0;
    const stop: Stop = top ? (frame) => on(a.shot, { x: aim.x, y: Math.max(aim.y, 26 * k - top * barHeld(bar!.play, frame / fps)) })(frame) : on(a.shot, aim);
    // it is on within about two seconds of the window settling, however long the first line is: it comes to rest low
    // and right in the window, off what is being read, and waits there (drifting with the camera) for its first action
    const settled = makesRoom ? roomBack : cuts[0] + WINDOW_SETTLES;
    // (when it would come on by itself within a second of that, it does: there would be no time to rest)
    const unaided = starts.has(a.beat) ? clamp(F(starts.get(a.beat)! + 0.2), to - 3 * fps, to - travel(OFF, stop(to))) : to - travel(OFF, stop(to));
    // no cursor while a list is up: when one comes before the cursor's first action, the cursor does not come on
    // early to rest; its entrance waits until the list has cleared
    const wall = moves.length ? -Infinity : Math.max(-Infinity, ...lists.filter((l) => l.blurIn < a.t).map((l) => l.clear));
    if (!moves.length && scene < 0 && wall === -Infinity && unaided > F(settled + ENTER_BY + 1)) {
      const from = F(settled + ENTER_BY - 1.1), at = F(settled + ENTER_BY), ink = inkAt(0, settled);
      const w0 = windowOf(0), want = { x: w0.x + ENTER_REST.x * w0.w, y: w0.y + ENTER_REST.y * w0.h };
      const rest = on(0, ink.length ? clearNear(want, ink, w0, under(0, at, want).k) : want);
      moves.push({ from, to: at, stop: rest, bow: 0.1 });
      prev = rest;
    }
    // across a scene the cursor is off the frame: it leaves before the scene, and comes on again for this action
    if (scene >= 0) { if (moves.length) leaveFor(scene); shotBefore = a.shot; }
    // after a cut the cursor is where it was on the frame, over a new page. It keeps moving toward what it does next:
    // waiting long, it drifts part of the way there at once; waiting briefly, it only moves off any text it lies on
    if (moves.length && a.shot !== shotBefore) {
      // (a cut move draws the two shots itself: the cursor stays as it was until the cut has run)
      const cut = F(cuts[a.shot] + cutDur(a.shot)), here = prev(cut), calm = Math.min(to, Math.max(cut, F(cuts[a.shot] + CUT_SETTLE)));
      const p0 = under(a.shot, calm, here), long = to - travel(here, stop(to)) - cut > WAIT_LONG * fps;
      const goal = long ? { x: p0.x + DRIFT * (aim.x - p0.x), y: p0.y + DRIFT * (aim.y - p0.y) } : { x: p0.x, y: p0.y };
      const ink = inkAt(a.shot, cuts[a.shot]), park = ink.length ? clearNear(goal, ink, windowOf(a.shot), p0.k) : goal;
      const rest = on(a.shot, park), from = cut + 2;
      // (a long wait is a slow glide for most of it; a short one a quick step aside)
      const until = long ? Math.min(from + Math.round(2.2 * fps), to - travel(rest(to), stop(to)) - 4) : from + Math.round(0.45 * fps);
      if ((long || park.x !== p0.x || park.y !== p0.y) && until - from >= 8 && until <= to - 10) {
        moves.push({ from, to: until, stop: rest, bow: 0.06 });
        begins.push(from / fps);
        prev = rest;
      }
    }
    shotBefore = a.shot;
    const last = moves.at(-1)?.to ?? -Infinity, first = !moves.length;
    let from = to - travel(prev(to), stop(to));
    // it comes on with the camera's first move in, not after it
    if (first && starts.has(a.beat)) from = clamp(F(starts.get(a.beat)! + 0.2), to - 3 * fps, from);
    // a `move` does not stop where the cursor was: it leaves at once and glides on, reaching its target on its cue
    if (a.cursor === 'move' && moves.length) from = Math.max(last + 3, to - Math.round(2.4 * fps));
    from = Math.max(from, last + 2, F(wall), first ? F(roomBack) : -Infinity);
    if (scene >= 0 || (a.shot > 0 && cutDur(a.shot))) from =Math.max(from, F(cuts[a.shot] + cutDur(a.shot)) + 2);   // not before its screen is up, nor while a cut move is bringing it
    if (wall > -Infinity && to - from < fps / 2) faults.push(`line ${a.line}: after the list the cursor has ${to - from} frames to come on and reach "${a.target}"`);
    else if (to - from < 6) faults.push(`line ${a.line}: the cursor has ${to - from} frames to reach "${a.target}"`);
    moves.push({ from, to: Math.max(to, from + 1), stop, bow: (n % 2 ? 1 : -1) * (0.08 + 0.08 * rnd(n, 7)) });
    // in a windowed shot what the cursor reaches must be in the window when it gets there (scrolled into it, if need be)
    if (shots[a.shot].window || scrolls[a.shot].length) { const w = windowOf(a.shot), y = aim.y - scrollAt(scrolls[a.shot], a.t); if (aim.x < w.x || aim.x > w.x + w.w || y < w.y || y > w.y + w.h) faults.push(`line ${a.line}: "${a.target}" is outside the window when the cursor reaches it: scroll to it first, or point at something in view`); }
    begins.push(from / fps);
    prev = stop;
    if (a.cursor === 'drag') {
      // the press is held from the cue; the thing rides with the pointer (Template) to where `to` is, held by the
      // same spot, and is let go on `release`; the page as it is after the drop comes SWAP_AFTER later
      const rel = said(a.line, a.release!), dest = boxes[a.to!], grab = { x: aim.x - box.x, y: aim.y - box.y }, go = F(a.t + 0.12), land = Math.max(F(rel), go + 1);
      if (land - go < 8) faults.push(`line ${a.line}: the drag has ${land - go} frames between "${a.target}" and its release: release on a later word`);
      const drop = on(a.shot, { x: dest.x + grab.x, y: dest.y + grab.y });
      moves.push({ from: go, to: land, stop: drop, bow: 0.05 });
      begins.push(go / fps);
      prev = drop;
      drags.push({ shot: a.shot, from: a.t, release: rel, to: R(rel + SWAP_AFTER), screen: screenAt(a.shot, a.t), node: box.node, box: plainBox(box), grab });
    }
  });
  // it leaves as the line before the closing one ends, and is gone before the window goes
  const leave = acts.find((a) => a.cursor === 'leave'), closer = S.length - 1;
  // (not before what the page took its time over has come: a `becomes` that waits, on the leave's beat or the one
  // before it. Until then the cursor stays, still, on what it clicked)
  const awaited = Math.max(-Infinity, ...changes.filter((c) => leave && c.change.kind === 'becomes' && c.change.wait && (c.beat === leave.beat || c.beat === leave.beat - 1)).map((c) => becameAt.get(c.change)! + SWAP_AFTER));
  const leaveFrom = Math.max(Math.min(leave && leave.line < closer ? S[leave.line].start : S[Math.max(0, closer - 1)].end - 0.75, (glyphAt ?? Infinity) - 0.8), ((moves.at(-1)?.to ?? 0) + 2) / fps, awaited);
  // (before an end glyph: before the cut to it)
  const leaveTo = Math.min(leave && leave.line < closer ? leaveFrom + 1.2 : close.windowOut - 0.02, (glyphAt ?? Infinity) - 0.02);
  // (a scene after its last action: it leaves for that instead)
  const sceneAfter = moves.length ? shots.findIndex((x, i) => !!x.scene && i > shotBefore) : -1;
  if (sceneAfter >= 0) leaveFor(sceneAfter);
  else if (moves.length) { moves.push({ from: F(leaveFrom), to: Math.max(F(leaveTo), F(leaveFrom) + 1), stop: () => GONE, bow: 0.1 }); begins.push(leaveFrom); }
  // a list is over one screen, with no cursor on it
  for (const l of lists) {
    if (moves.length && F(l.blurIn) >= moves[0].from) faults.push(`line ${l.line}: the cursor is on while the list is up (a list comes before the cursor's first action)`);
    if (l.sharp > ends[l.shot]) faults.push(`line ${l.line}: the list is still up when the screen changes`);
  }
  /** how far down shot s's content the cursor's tip is at second t (screen px): a selection that is dragged follows it */
  const tipY = (s: number) => (t: number) => under(s, t * fps, cursorAt(() => OFF, moves, t * fps)).y + scrollAt(scrolls[s], t);
  const hover = (t: number) => begins.find((b) => b > t) ?? Infinity; // the cursor moves on from what it clicked at t

  // ── what each screen stages ──
  const node = (name: string) => boxes[name].node;
  /** what sets in place after a cut: the parts of what the shot's first framing holds (of each thing, when it holds several) */
  const assembleOf = (spec: FrameSpec, at: number) => {
    const names = spec.targets?.length ? spec.targets : spec.target ? [spec.target] : [];
    return { at, node: names.length ? node(names[0]) : null, ...(names.length > 1 ? { also: names.slice(1).map(node) } : {}) };
  };
  const mine = <K extends Change['kind']>(s: number, kind: K) => changes.filter((c) => c.shot === s && c.change.kind === kind) as (Changed & { change: Change & { kind: K } })[];
  const opensOf = (s: number) => mine(s, 'opens').map(({ change: c, beat }) => {
    const b = boxes[c.node], anchor = c.after ? boxes[c.after] : undefined;
    // it comes from under the bar when the bar's bookmark brought it (or as the bar's `arrives` says); it hangs from what was clicked; or it does neither
    const from = anchor && anchor.node < 0 ? ARRIVES[bar?.spec.arrives ?? 'down'] :anchor && Math.abs(b.y - (anchor.y + anchor.h)) <= 8 ? 'top' as const : 'centre' as const;
    // (what is only there once the screen has become its next capture opens when that capture comes)
    const born = mine(s, 'becomes').find((x) => x.change.screen === b.screen);
    return { node: b.node, at: Math.max(opensAt(c, beat) + (from === 'top' ? 0.05 : 0.06), born ? becameAt.get(born.change)! : -Infinity), from };
  });
  /** what closes on shot s: it goes the way the open of the same node on the shot had it come (else as a dialog), and
   *  stays shut until that node's next open (else for good) */
  const closesOf = (s: number, opens: Staging['opens']) => mine(s, 'close').map((x) => {
    const n = node(x.change.node), at = cued(x);
    return { node: n, at, from: opens.find((o) => o.node === n)?.from ?? 'centre' as const, until: Math.min(Infinity, ...opens.filter((o) => o.node === n && o.at > at).map((o) => o.at)) };
  });
  /** what shows only under the pointer on shot s: from when the cursor arrives on its control (this beat's action on
   *  it, else the shot's first rest or move there) until the cursor moves on */
  const hoversOf = (s: number) => mine(s, 'hover').flatMap((x) => {
    const on = (a: (typeof timed)[number]) => a.shot === s && a.target === x.change.after && a.cursor !== 'click';
    const act = timed.find((a) => on(a) && a.beat === x.beat) ?? timed.find(on);
    if (!act) { faults.push(`line ${file.beats[x.beat].line}: the hover's control "${x.change.after}" has no cursor action on this shot`); return []; }
    return [{ tip: node(x.change.node), node: node(x.change.after), at: act.t, until: hover(act.t) }];
  });
  /** a shot's opens and closes, its hovers' among them: a tip opens from its top edge as the cursor arrives and closes
   *  (the open mirrored: 0.3 s) as it moves on; each close is shut until that node's next open */
  const comings = (s: number) => {
    const hovers = hoversOf(s), opens = [...opensOf(s), ...hovers.map((h) => ({ node: h.tip, at: h.at, from: 'top' as const }))];
    const until = (n: number, at: number) => Math.min(Infinity, ...opens.filter((o) => o.node === n && o.at > at).map((o) => o.at));
    const closes = [...closesOf(s, opens), ...hovers.filter((h) => h.until < Infinity).map((h) => ({ node: h.tip, at: h.until, from: 'top' as const, until: until(h.tip, h.until) }))];
    return { opens, ...(closes.length ? { closes } : {}), ...(hovers.length ? { hovers: hovers.map(({ tip: _t, ...h }) => h) } : {}) };
  };
  const staging: Staging[] = shots.map((shot, s) => (shot.scene ? { opens: [], presses: [], selects: [], fills: [] } : {
    // (a held shot is a swap on one stage: the new screen is there whole, nothing sets in; nor after a cut move that lands on the content: its about's `whole`)
    assemble: s > 0 && !shot.frames[0].spec.hold && !(shot.cut && moveOf?.(shot.cut.use.move)?.about.whole) ? assembleOf(shot.frames[0].spec, cuts[s]) : undefined,
    ...comings(s), ...(!shot.window && scrolls[s].length ? { scroll: scrolls[s] } : {}),
    // (what is dragged is not drawn in its place while its copy rides; the capture that follows the drop has it where it landed)
    ...(drags.some((d) => d.shot === s) ? { hides: drags.filter((d) => d.shot === s).map((d) => ({ node: d.node, at: d.from, until: d.to })) } : {}),
    presses: clicks.filter((c) => c.shot === s && c.target && node(c.target) >= 0).map((c) => ({ node: node(c.target!), at: c.t, until: hover(c.t) })),
    selects: mine(s, 'selects').map((x) => {
      const c = x.change, at = clickOn(c.node) ?? cued(x);
      return c.to != null ? { node: node(c.node), at, until: said(file.beats[x.beat].line, c.to), edge: tipY(s) } : { node: node(c.node), at };
    }),
    fills: mine(s, 'fills').map((x) => {
      // (from the click on the field when this beat makes it; a field clicked on an earlier line fills on this beat's cue or line)
      const c = x.change, at = (clicks.find((k) => k.target === c.node && k.beat === x.beat)?.t ?? cued(x)) + 0.12;
      const until = c.typed ? Math.max(at + 0.4, c.to != null ? said(file.beats[x.beat].line, c.to) : at + 1.1) : at;
      return { node: node(c.node), at, until, ...(c.text != null ? { text: [c.text].flat().map(String).join('\n') } : {}) };
    }),
    follows: runs.filter((r) => r.shot === s && r.spec.follow).map((r) => node(r.spec.follow!)),
    ...(addsOf(s).length ? { adds: addsOf(s) } : {}),
    grows: mine(s, 'becomes').filter((x) => x.change.grows).map(({ change: c }) => {
      const a = boxes[c.grows![0]], b = boxes[c.grows![1]];
      return { node: b.node, at: becameAt.get(c)!, dx: a.x - b.x, dy: a.y - b.y, right: Math.max(0, b.w - a.w), bottom: Math.max(0, b.h - a.h) };
    }),
  }));

  // ── a bare shot's window frame coming back (seconds), where one is asked for ──
  const frameBack = shots.map((shot, s) => {
    const back = mine(s, 'frame-back')[0];
    if (back && !shot.bare) faults.push(`line ${file.beats[back.beat].line}: frame-back is for a shot that is bare (window + bare on its first beat)`);
    return back && shot.bare ? R(cued(back)) : undefined;
  });
  const beats: Beats = {
    openLeave, ...(open ? { open } : {}),
    shots: shots.map((shot, s) => ({ screen: shot.screen, from: cuts[s], to: ends[s], camera: ordered[s], staging: staging[s],
      ...(shot.scene ? { scene: shot.scene } : {}),
      ...(shown[s].length > 1 ? { screens: shown[s] } : {}),
      ...(bar?.shot === s ? { bar: { spec: bar.spec, viewport: vpOf(s), play: bar.play, click: bar.click != null ? { at: bar.click, until: hover(bar.click) } : null } } : {}),
      ...(shot.window ? { window: windowOf(s), isolate: shot.window.map((name) => boxes[name].node) } : {}),
      ...(shot.bare ? { bare: true, ...(frameBack[s] != null ? { frameBack: frameBack[s] } : {}) } : {}), ...(scrolls[s].length ? { scroll: scrolls[s] } : {}) })),
    cursor: { start: () => OFF, moves },
    clicks: clicks.map((c) => c.t), ...(drags.length ? { drags } : {}),
    lists: lists.map(({ beat: _b, shot: _s, ...play }) => play),
    tone: toneOf(file.stage), ...(file.stage && typeof file.stage === 'object' ? { stage: file.stage } : {}), moves: plays, cuts: cutPlays,
    // (where the logo is on the frame when the push has arrived: the end card's mark sets out of that box)
    // (an end glyph: which element, when the cut to it comes, and where it stands: GLYPH.size of the frame's width, less when it is tall, in the middle)
    ...(glyph ? { glyph: (() => { const b = raised(plainBox(boxes[glyph]), endUp), w = Math.min(GLYPH.size * FRAME.width, (GLYPH.tall * FRAME.height * b.w) / b.h), h = (w * b.h) / b.w;
      return { screen: boxes[glyph].screen, node: boxes[glyph].node, box: b, at: glyphAt!, rest: { x: (FRAME.width - w) / 2, y: (FRAME.height - h) / 2, w, h } }; })() } : {}),
    ...(lift ? { lift: { from: (() => { const b = raised(plainBox(boxes[lift]), endUp), cam = cameraAt(ordered.at(-1)!, F(close.endCard), FRAME), p = project(cam, b, FRAME); return { x: p.x, y: p.y, w: b.w * cam.s, h: b.h * cam.s }; })() } } : {}),
  };
  const frames = Math.ceil(close.total * fps);
  beats.shots.forEach((shot, s) => shot.scene || faults.push(...runsOf(cameraFaults(shot.camera, Math.ceil(shot.from * fps), Math.min(frames, Math.ceil(shot.to * fps)) - 1, FRAME)).map((f) => `screen ${shot.screen} (shot ${s}): ${f}`)));
  /** the moments worth a still: each line's start, each cue, each click, each cut, and what the screens stage */
  const moments = { enter: cuts[0], cuts: cuts.slice(1), lines: S.map((x) => x.start), actions: timed.filter((a) => a.cursor).map((a) => ({ line: a.line, cursor: a.cursor, target: a.target, t: a.t })), opens: staging.flatMap((x) => [...x.opens, ...(x.closes ?? [])].map((o) => o.at)), selects: staging.flatMap((x) => x.selects.map((o) => o.at)),
    list: lists.map((l) => ({ blur: l.blurIn, items: l.items.map((i) => i.at), out: l.out, sharp: l.sharp })),
    fills: staging.flatMap((x) => x.fills.flatMap((f) => [f.at, f.until])), swaps: shown.flatMap((list) => list.slice(1).map((x) => x.at)),
    bar: bar ? [bar.play.from, bar.play.to, bar.play.back, bar.play.gone] : [],
    moves: plays.flatMap((p) => [p.from, p.to]), cutMoves: cutPlays.flatMap((c) => [c.at, c.at + c.dur / 2, c.at + c.dur]) };
  return { beats, title: file.title, fps, close, frames, faults, moments };
}
