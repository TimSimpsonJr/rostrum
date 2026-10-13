// The tutorial format, the same for every film in the library:
//   open (the title, alone) -> the recorded screens, one continuous camera each, the cursor acting -> end card,
//   with the narration's closing line spoken over the logo reveal (close.ts; always, not a per-film choice).
// What is particular to one film (which screens, where the camera goes, what the cursor does, how a state change is
// staged) arrives as `beats`; when things happen comes from `timing` (tools/make-timing.mjs), so a new narration take
// needs only a new timing file.
import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Rule } from '../standins';
import { EASE, pressEnv, tw, wander } from '../kit/ease';
import { BarPlay, BarSpec, barShown } from '../moves/browser-bar/bar';
import { toneOf } from '../moves/contract';
import type { StageUse, Tone } from '../moves/contract';
import { CUTS, MOVES, STAGES, moveOf } from '../moves/all';
import { cameraAt, project, scrollAt } from './cameraAt';
import type { Size } from './cameraAt';
import { Brand, EndCard, TitleCard } from '../kit/Lockup';
import { Click, Press, Release, Sound } from '../kit/sound';
import { FPS, Stage, TONES, liftShadow } from '../kit/stage';
import { Box, CamKey, Camera, FRAME, Lifted, Scroll } from './Camera';
import { Cursor, Move, Stop, cursorAt } from './Cursor';
import { Staging, stage as stageChanges } from './changes';
import { ListPlay, listBlur, listUp } from './list';
import { NarratedList } from './NarratedList';

import { OPEN } from './beats';
import { GLYPH, LIFT, Timing, closeOf } from './close';

export type { Timing } from './close';

/** One recorded screen on stage for film seconds [from, to), under its own camera (keys in frames). The first shot's
 *  entrance and the last shot's exit are the template's: the window settles in (a slight scale and rise, never a plain
 *  fade) and, at the close, gives way (a slight scale down and out) over the same stage the end card sets on. */
export type Shot = {
  screen: number; from: number; to: number; camera: CamKey[];
  /** stages what the recording did not capture as motion (see RecordedScreen `write`) */
  write?: (doc: Document, mirror: any, t: number) => void;
  /** the same, as data: what the screen stages, set by the generic `stage` (changes.ts); a beat file's films use this */
  staging?: Staging;
  /** the shot shows some nodes of its screen alone (`isolate`), laid out unclipped, through this box of the screen: a
   *  beat file's `window`; `scroll`: their content moves up inside it over time */
  window?: Box; isolate?: number[]; scroll?: Scroll[];
  /** a windowed shot with no window frame and no shadow (a beat file's `bare`); `frameBack`: the second they come back, when they do */
  bare?: boolean; frameBack?: number;
  /** the captures the shot shows, in time, when it shows more than its own: the screen becomes its next capture in
   *  place under the same camera (a beat file's `becomes` and `sequence`) */
  screens?: { at: number; screen: number }[];
  /** a browser bar grows out of the window's top and goes back in (moves/browser-bar); `click`: the cursor presses
   *  its hero bookmark at `at` and moves on at `until` */
  bar?: { spec: BarSpec; viewport: Size; play: BarPlay; click: { at: number; until: number } | null };
  /** a scene: no recorded screen (`screen` is -1) and nothing of the camera is drawn; the stage (its own tone, when
   *  given) and the moves of its beats are all there is */
  scene?: { stage?: Tone | StageUse };
};
/** A library move or a one-off on stage from `from` to `to` (film seconds), on shot `shot`; `pins`: the measured boxes
 *  of the elements its inputs name, in the screen's own px (the move is told where they are on the frame: `place`).
 *  `pinScreens`: the screen each of them is measured on (a move between two shots points at elements of both).
 *  `lifts`: the elements it draws alone (its `about.lifts`): which node of which screen each is (`lift` below). */
export type MovePlay = { name: string; shot: number; line: { start: number; end: number }; from: number; to: number; inputs: Record<string, unknown>; pins: Record<string, Box>; pinScreens?: Record<string, number>; lifts?: Record<string, { node: number; screen: number }> };
/** A cut move: the way into shot `shot` from the one before, over [at, at + dur]; both shots are mounted meanwhile. */
export type CutPlay = { name: string; shot: number; at: number; dur: number; inputs: Record<string, unknown>; pins: Record<string, Box>; pinScreens?: Record<string, number>; /** the new shot's window, in its screen's px (none: a scene) */ window?: Box };
export type Beats = {
  /** seconds: the open starts to leave */
  openLeave: number;
  /** the open, when not the title alone (a beat file's `open`; beats.ts OPEN) */
  open?: 'title-makes-room' | 'cut-to-screen';
  shots: Shot[];
  cursor: { start: Stop; moves: Move[] };
  /** seconds of each click: the cursor presses and the click sounds */
  clicks: number[];
  /** drags: the press is held from `from` to `release`; meanwhile, and until `to` (when the page as it is after the
   *  drop comes), node `node` of `screen` (measured `box`, held at `grab` px from its top left) rides with the pointer */
  drags?: { shot: number; from: number; release: number; to: number; screen: number; node: number; box: Box; grab: { x: number; y: number } }[];
  /** narrated lists (list.ts): the screen recedes behind a blur and a light wash, the items set as type. No sound:
   *  the kit has the click only, and a list is not a click. */
  lists?: ListPlay[];
  /** the film's stage; library moves and one-offs on its beats; cut moves between its shots (all optional: a film
   *  built by hand, or before the library, has none) */
  tone?: Tone; moves?: MovePlay[]; cuts?: CutPlay[];
  /** the film's stage when it is a named one (a moves/<name>/Stage.tsx draws the ground; `tone` above is its tone) */
  stage?: StageUse;
  /** the film ends on a logo lift (a beat file's `end`): the last shot's camera pushes toward the site's logo,
   *  which is in `from` on the frame when the push arrives; the end card's mark sets out of that box */
  lift?: { from: Box };
  /** the film ends on a glyph (a beat file's `end`): at `at` the last shot is cut away to node `node` of `screen`
   *  (measured `box`) alone, standing at `rest` on the frame; the end card's mark comes up out of that box */
  glyph?: { screen: number; node: number; box: Box; at: number; rest: Box };
};

const BLUR = 6;           // frame px at full: the screen stays recognisable behind the list, its small text softened (18 read as far too heavy)
/** the wash over a receded screen, from the stage's own colour: type on it has contrast on a light page or a dark one */
const wash = (tone: Tone) => `color-mix(in oklch, ${TONES[tone].stage} 80%, transparent)`;

/** `brand`: whose film this is (brand/ of the tutorial folder, see kit/Lockup loadBrand); the template itself knows no brand. */
export const Template: React.FC<{ brand: Brand; standIns?: Rule[]; title: string; beats: Beats; timing: Timing }> = ({ brand, standIns, title, beats, timing }) => {
  const t = useCurrentFrame() / FPS, close = closeOf(timing, !!brand.mark?.build);
  const last = beats.shots.length - 1;
  const arrive = tw(t, beats.shots[0].from, beats.shots[0].from + 0.75, EASE.settle), leave = tw(t, close.windowOut, close.endCard, EASE.settle);
  // an open that makes room for the title (beats.ts OPEN): the first window small in the middle, then aside, and
  // back at its size once the title has gone. Only the window is moved: until it is back nothing acts on the shot
  // (makeBeats holds the camera's first move and the cursor's entrance), so nothing else needs the shift
  const room = beats.open === 'title-makes-room' ? (() => {
    const from = beats.openLeave + OPEN.clear, back = tw(t, from, from + OPEN.back, EASE.settle), aside = tw(t, OPEN.still, OPEN.still + OPEN.slide, EASE.settle) * (1 - back);
    return { scale: OPEN.scale + (1 - OPEN.scale) * back, shift: -(0.5 - OPEN.at) * FRAME.width * aside };
  })() : { scale: 1, shift: 0 };
  /** the window's own entrance or exit, on top of its camera */
  const stage = (i: number) => {
    // (with an open the first window is there, whole, on the first frame: no entrance)
    const a = i === 0 && !beats.open ? arrive : 1, l = i === last ? leave : 0, o = i === 0 ? room : { scale: 1, shift: 0 };
    const on = i === 0 && !beats.open ? tw(t, beats.shots[0].from, beats.shots[0].from + 0.1, EASE.linear) : 1;
    // (a logo lift: the window does not draw back; it is gone over the last of the camera's push toward the logo)
    if (i === last && beats.lift) return { opacity: on * (1 - tw(t, close.endCard - LIFT.fade, close.endCard, EASE.linear)), scale: (0.96 + 0.04 * a) * o.scale, rise: 26 * (1 - a), shift: o.shift };
    // (the entrance is the scale and the rise; the opacity ramp is three frames, never a slow fade of a screen of text)
    return { opacity: on * (1 - l) ** 1.5, scale: (0.96 + 0.04 * a) * (1 - 0.05 * l) * o.scale, rise: 26 * (1 - a) + 10 * l, shift: o.shift };
  };
  /** the shot's browser bar now: how much of it is out, and its hero bookmark under the cursor (the hover as it comes, the press) */
  const barAt = ({ bar }: Shot) => bar && { spec: bar.spec, viewport: bar.viewport, out: barShown(bar.play, t), press: bar.click ? pressEnv(t, bar.click.at) : 0,
    hover: bar.click ? tw(t, bar.click.at - 0.3, bar.click.at - 0.1, EASE.settle) * (1 - tw(t, bar.click.until, bar.click.until + 0.2, EASE.settle)) : 0 };
  /** how far the screen has receded behind a list, 0 to 1 */
  const lists = beats.lists ?? [], recede = Math.max(0, ...lists.map((l) => listBlur(l, t)));
  // (a shot that comes in by a cut move brings its stage when the cut says, `toneAt` of the way through it; half way
  // unless it does: a cut that covers the frame covers it then)
  const toneFrom = (i: number) => { const c = (beats.cuts ?? []).find((x) => x.shot === i); return c ? c.dur * (moveOf(c.name)?.about.toneAt ?? 0.5) : 0; };
  // (the stage now: a scene's own, else the film's. Its tone is all the film reads of it; a named stage draws the ground)
  const use = beats.shots.findLast((s, i) => t >= s.from + toneFrom(i))?.scene?.stage ?? beats.stage ?? beats.tone ?? 'light', tone = toneOf(use);
  const accent = brand.accent ?? TONES[tone].accent, Ground = typeof use === 'string' ? null : STAGES[use.move];
  const ground = Ground && typeof use !== 'string' ? <Ground t={t} tone={tone} accent={accent} inputs={use} /> : undefined;
  const shows = (shot: Shot, screen: number) => shot.screen === screen || !!shot.screens?.some((x) => x.screen === screen);
  /** where a measured box sits on the frame now, under the camera of the shot that shows its screen: the one up now,
   *  else the first to show it from the play's own shot (`own`) on, else the play's own (null in a scene, and for a
   *  name with no box) */
  const placeIn = (own: number, pins: Record<string, Box>, screens: Record<string, number> = {}) => (name: string): Box | null => {
    const b = pins[name], n = screens[name];
    const s = n == null ? own : [beats.shots.findIndex((x) => t >= x.from && t < x.to && shows(x, n)), beats.shots.findIndex((x, i) => i >= own && shows(x, n)), own].find((i) => i >= 0)!;
    const shot = beats.shots[s];
    if (!b || !shot || shot.scene) return null;
    const cam = cameraAt(shot.camera, Math.round(t * FPS), FRAME), p = project(cam, { x: b.x, y: b.y - scrollAt(shot.scroll, t) }, FRAME);
    return { x: p.x, y: p.y, w: b.w * cam.s, h: b.h * cam.s };
  };
  /** what a shot's screen stages now (RecordedScreen `write`) */
  const writeOf = (shot: Shot) => (shot.write ? (doc: Document, mirror: any) => shot.write!(doc, mirror, t) : shot.staging && ((doc: Document, mirror: any) => stageChanges(doc, mirror, t, shot.staging!)));
  /** how far a shot has receded under the moves on it: the most any of them asks for (a move's `recedes`) */
  const under = (i: number) => Math.max(0, ...(beats.moves ?? []).filter((m) => m.shot === i).map((m) => moveOf(m.name)?.recedes?.(t, m.from, m.to) ?? 0));
  /** an element a move draws alone (its `about.lifts`; Camera `Lifted`). An element of the screen its shot shows is
   *  laid out and staged as that screen is; one of another screen (a before beside an after) is as its capture has
   *  it. The move never sees the screen or the node. */
  const liftIn = (m: MovePlay) => (name: string, width?: number): React.ReactNode | null => {
    const l = m.lifts?.[name], b = m.pins[name], shot = beats.shots[m.shot];
    if (!l || !b || !shot || shot.scene) return null;
    const own = shows(shot, l.screen);
    // (on a whole screen whose page has scrolled, the element is that much higher in its window)
    const up = own && !shot.window ? scrollAt(shot.scroll, t) : 0;
    return <Lifted screen={l.screen} node={l.node} box={up ? { ...b, y: b.y - up } : b} width={width} unclip={own ? shot.isolate : undefined} write={(own && writeOf(shot)) || undefined} />;
  };
  const cams: React.ReactNode[] = beats.shots.map((shot, i) => (!shot.scene && t >= shot.from && t < shot.to ? (
    <Camera key={i} screen={shot.screens?.findLast((x) => x.at <= t)?.screen ?? shot.screen} bar={barAt(shot)} window={shot.window} isolate={shot.isolate} scroll={shot.scroll} standIns={standIns} keys={shot.camera} {...stage(i)} blur={BLUR * recede} recede={under(i)} write={writeOf(shot)} frame={!shot.bare ? 1 : shot.frameBack == null ? 0 : tw(t, shot.frameBack, shot.frameBack + 10 / 30, EASE.settle)} />
  ) : null));
  const drags = beats.drags ?? [];
  const cursor = <Cursor start={beats.cursor.start} moves={beats.cursor.moves} clicks={beats.clicks} holds={drags.map((d) => [d.from, d.release])} />;
  // what is dragged rides with the pointer, held where it was pressed: the element alone (the page hides its own
  // meanwhile: Staging `hides`), a little larger and on a shadow while it is in the air, flat again by the time the
  // page as it is after the drop takes over
  const ridden = drags.map((d, i) => {
    const shot = beats.shots[d.shot];
    if (t < d.from || t >= d.to || !shot || shot.scene) return null;
    const frame = Math.round(t * FPS), p = cursorAt(beats.cursor.start, beats.cursor.moves, frame), w = wander(t, 3, 2), s = cameraAt(shot.camera, frame, FRAME).s;
    const air = tw(t, d.from, d.from + 0.15, EASE.settle) * (1 - tw(t, d.release, d.to, EASE.settle)), up = shot.window ? 0 : scrollAt(shot.scroll, t);
    return (
      <div key={`drag${i}`} style={{ position: 'absolute', left: 0, top: 0, transformOrigin: `${(d.grab.x * s).toFixed(2)}px ${(d.grab.y * s).toFixed(2)}px`, transform: `translate(${(p.x + w.x - d.grab.x * s).toFixed(3)}px, ${(p.y + w.y - d.grab.y * s).toFixed(3)}px) scale(${(1 + 0.03 * air).toFixed(5)})` }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: 6 * s, boxShadow: liftShadow(tone), opacity: air }} />
        <Lifted screen={d.screen} node={d.node} box={up ? { ...d.box, y: d.box.y - up } : d.box} width={d.box.w * s} unclip={shot.isolate} write={shot.staging && ((doc: Document, mirror: any) => stageChanges(doc, mirror, t, { ...shot.staging!, hides: undefined }))} />
      </div>
    );
  });
  // a cut move running now is handed its two shots, and draws them itself. The cursor belongs to the shot it is on:
  // it is handed over with each of them (with the shot before it leaves as that shot does, or is gone in 4 frames
  // when the cut says `cursor: 'fades'`; with the new shot it arrives where it stands when the cut ends), and is not
  // drawn over the frame meanwhile
  let riding = false;
  const cuts = (beats.cuts ?? []).map((c) => {
    const C = CUTS[c.name];
    if (!C || t < c.at || t >= c.at + c.dur) return null;
    riding = true;
    const left = moveOf(c.name)?.about.cursor === 'fades' ? 1 - Math.min(1, ((t - c.at) * FPS) / 4) : 1;
    // (the way into the first shot has no shot before it)
    const before = c.shot > 0 ? cams[c.shot - 1] : null, shot = beats.shots[c.shot];
    const outgoing = before && <>{before}{left >= 1 ? cursor : left > 0 ? <AbsoluteFill style={{ opacity: left }}>{cursor}</AbsoluteFill> : null}</>;
    const incoming = cams[c.shot] && <>{cams[c.shot]}{cursor}</>;
    if (c.shot > 0) cams[c.shot - 1] = null;
    cams[c.shot] = null;
    // where the new shot's window stands on the frame now, under its own camera (its entrance and a bar apart)
    const cam = c.window && !shot.scene ? cameraAt(shot.camera, Math.round(t * FPS), FRAME) : null, at = cam && project(cam, c.window!, FRAME);
    const into = cam && at ? { x: at.x, y: at.y, w: c.window!.w * cam.s, h: c.window!.h * cam.s } : null;
    return <C key={`cut${c.shot}`} t={t} k={(t - c.at) / c.dur} at={c.at} dur={c.dur} inputs={c.inputs} tone={tone} accent={accent} outgoing={outgoing} incoming={incoming} place={placeIn(c.shot, c.pins, c.pinScreens)} into={into} />;
  });
  // an end glyph: the last shot is gone at `at` (its `to`: a hard cut, wherever its window stood) and one element of
  // its screen stands alone in the middle, staged as that screen was, its parts parting and coming back; it is gone
  // when the end card's mark starts to come up out of its box
  const g = beats.glyph, glyphGone = close.endCard - GLYPH.rise, ending = beats.shots[last];
  const glyph = g && t >= g.at && t < glyphGone ? (
    <div style={{ position: 'absolute', left: 0, top: 0, width: g.rest.w, height: g.rest.h, transform: `translate(${g.rest.x.toFixed(3)}px, ${g.rest.y.toFixed(3)}px)`, opacity: 1 - tw(t, glyphGone - GLYPH.fade, glyphGone, EASE.linear) }}>
      <div style={{ position: 'absolute', inset: 0, borderRadius: 14, boxShadow: liftShadow(tone) }} />
      <div style={{ position: 'absolute', inset: 0, borderRadius: 14, overflow: 'hidden' }}>
        <Lifted screen={g.screen} node={g.node} box={g.box} width={g.rest.w} write={(doc: Document, mirror: any) => stageChanges(doc, mirror, t, { ...(ending.staging ?? { opens: [], presses: [], selects: [] }), glyph: { node: g.node, at: g.at, over: GLYPH.apart } })} />
      </div>
    </div>
  ) : null;
  return (
    <Stage tone={tone} ground={ground}>
      {cams}
      {cuts}
      {glyph}
      {recede > 0 ? <AbsoluteFill style={{ background: wash(tone), opacity: recede }} /> : null}
      {lists.map((l, i) => (listUp(l, t) ? <NarratedList key={i} play={l} t={t} accent={brand.accent} tone={tone} /> : null))}
      {(beats.moves ?? []).map((m, i) => { const M = MOVES[m.name]; return M && t >= m.from - 1 && t < m.to + 1.5 ? <M key={i} t={t} from={m.from} to={m.to} inputs={m.inputs} tone={tone} accent={accent} line={m.line} place={placeIn(m.shot, m.pins, m.pinScreens)} lift={liftIn(m)} /> : null; })}
      {ridden}
      <TitleCard t={t} title={title} leave={beats.openLeave} tone={tone} beside={beats.open === 'title-makes-room' ? { from: OPEN.titleIn, clear: OPEN.clear, x: OPEN.title.x * FRAME.width, w: OPEN.title.w } : undefined} />
      <EndCard brand={brand} t={t} at={close.endCard} title={title} tone={tone} from={beats.lift?.from ?? beats.glyph?.rest} />
      {riding ? null : cursor}
      {timing.sentences.map((s) => (s.file ? <Sound key={s.file} src={`${timing.dir}/${s.file}`} at={s.clipAt} dur={s.clipDur} /> : null))}
      {beats.clicks.map((c) => <Click key={c} at={c} />)}
      {drags.map((d) => <React.Fragment key={`d${d.from}`}><Press at={d.from} /><Release at={d.release} /></React.Fragment>)}
    </Stage>
  );
};
