// One move alone, to look at (the `Move` still in Root.tsx): on the kit's stage at second `t` of its own run, with the
// fixture film's two screens as the shots a cut move is handed. Rendered by tools/move-still.mjs onto the fixture
// film (its public dir has the kit's font and sounds); nothing of a real recording is here. A move that points at an
// element (it reads 'the named element') is shown over the fixture's second screen, and a cut that does is told where
// the fixture's own elements are on its two screens (`place` below).
import React from 'react';
import { CUTS, MOVES, STAGES, moveOf } from './moves/all';
import type { Tone } from './moves/contract';
import { Card, Label } from './kit/atoms';
import { TitleCard } from './kit/Lockup';
import { FPS, H, Stage, TONES, W } from './kit/stage';
import { Camera, FRAME, Lifted } from './tutorial/Camera';
import { cameraAt, project } from './tutorial/cameraAt';
import { stage } from './tutorial/changes';

export type LookProps = { move: string; inputs: Record<string, unknown>; t: number; tone: Tone; takes?: number; /** a stage: what stands on it (default: a recorded window) */ show?: 'type' | 'window' };
/** the fixture film's measured elements a still can point at, by the names its beat file gives them (tools/make-fixture-film.mjs;
 *  fixtures/tutorials/fixture-film/film/clean/boxes.json): the user menu and its Profile item on the first screen, the
 *  profile card and the dialog on the second */
const FIXTURE: Record<string, { screen: number; node?: number; x: number; y: number; w: number; h: number }> = {
  userMenu: { screen: 0, node: 21, x: 1419.14, y: -0.5, w: 152.86, h: 64 }, profileItem: { screen: 0, node: 26, x: 1373, y: 73, w: 198, h: 36.5 },
  // (the head of the profile card, the user's picture and name again, is not measured by the fixture: read off a still; it is no node)
  card: { screen: 1, node: 26, x: 480, y: 100, w: 640, h: 414.5 }, profileHead: { screen: 1, x: 518, y: 132, w: 199, h: 63 }, dialog: { screen: 1, node: 58, x: 560, y: 363.25, w: 480, h: 173.5 },
  // (the card's fields and the dialog's, so a move that lifts several elements shows several)
  firstName: { screen: 1, node: 38, x: 683, y: 222, w: 280, h: 36.5 }, username: { screen: 1, node: 50, x: 683, y: 385.5, w: 280, h: 36.5 }, viewKey: { screen: 1, node: 54, x: 683, y: 440, w: 280, h: 36.5 },
  keyField: { screen: 1, node: 61, x: 586, y: 426.25, w: 428, h: 36 }, done: { screen: 1, node: 63, x: 934, y: 477.5, w: 80.5, h: 37.5 },   // (the dialog's button: read off a still, as the head is)
};
const IN_DIALOG = ['dialog', 'keyField', 'done'];
const whole = (w: number, h: number) => [{ frame: 0, box: { x: 0, y: 0, w, h }, fill: 0.8 }, { frame: 10 * FPS, box: { x: 0, y: 0, w, h }, fill: 0.82, ease: 'linear' as const }];

export const MoveLook: React.FC<LookProps> = ({ move, inputs, t, tone, takes, show }) => {
  const M = MOVES[move], C = CUTS[move], dur = takes ?? moveOf(move)?.takes?.(inputs) ?? (C ? 0.7 : 2);
  // the inputs a move lists as cues are seconds in a film (makeBeats); here there is no line, so they are spread over the move's own length
  const spread = (v: unknown) => (Array.isArray(v) ? v.map((_, j) => (dur * (j + 1)) / (v.length + 1)) : dur / 2);
  inputs = { ...inputs, ...Object.fromEntries((moveOf(move)?.about.cues ?? []).filter((k) => inputs[k] != null).map((k) => [k, spread(inputs[k])])) };
  // (the screen recedes under a move that asks for it, as in a film. The second screen's capture holds its dialog: it
  // is shut, as before its `opens` in a film, when everything the move names is on the page under it)
  const names = Object.values(inputs).flat().flatMap((v) => (v && typeof v === 'object' ? Object.values(v) : [v])).filter((v): v is string => typeof v === 'string' && !!FIXTURE[v]);
  const shut = !!M && names.length > 0 && !names.some((n) => IN_DIALOG.includes(n));
  const keys = whole(1600, 900), screen = (i: number) => <Camera screen={i} keys={keys} recede={M ? moveOf(move)?.recedes?.(t, 0, dur) ?? 0 : 0} write={i === 1 && shut ? (doc, mirror) => stage(doc, mirror, 0, { opens: [{ node: FIXTURE.dialog.node!, at: 1e9, from: 'centre' }], presses: [], selects: [] }) : undefined} />;
  // a move that points at an element is drawn over the fixture's second screen, a cut between its two. A name the
  // fixture has is that element, where the camera above puts it. Any other name, by the order the inputs name them
  // (the words a move shows are not names): on a move, the dialog, then the head of the card; on a cut, the user menu
  // of the first screen, then the same user at the head of the second's card.
  const onScreen = !!M && !!moveOf(move)?.about.reads.includes('the named element');
  const shown = moveOf(move)?.text?.(inputs) ?? [];
  const cam = cameraAt(keys, 0, FRAME), named = [...new Set(Object.values(inputs).flat().flatMap((v) => (v && typeof v === 'object' ? Object.values(v) : [v])).filter((v): v is string => typeof v === 'string' && !shown.includes(v)))];
  // (a move that reads 'two screens' keeps a name of the first screen: a before beside an after)
  const two = !!M && !!moveOf(move)?.about.reads.includes('two screens');
  const fixtureOf = (name: string) => { const own = FIXTURE[name], later = named.indexOf(name) > 0; return own && (C || two || own.screen === 1) ? own : later ? FIXTURE.profileHead : C ? FIXTURE.userMenu : FIXTURE.dialog; };
  const place = (name: string) => {
    if (!onScreen && !C) return { x: 760, y: 420, w: 400, h: 120 };
    const b = fixtureOf(name), at = project(cam, b, FRAME);
    return { x: at.x, y: at.y, w: b.w * cam.s, h: b.h * cam.s };
  };
  // an element the move lifts out (its `about.lifts`): the fixture's own node, alone, as a film hands it over
  const lifts = (moveOf(move)?.about.lifts ?? []).flatMap((p) => [inputs[p.replace(/\[\]$/, '')]].flat());
  const lift = (name: string, width?: number) => { const b = fixtureOf(name); return lifts.includes(name) && b.node != null ? <Lifted screen={b.screen} node={b.node} box={b} width={width} /> : null; };
  // (a cut that changes the stage, `to` a tone: the stage flips when the cut says, as in a film)
  const to = C && (inputs.to === 'light' || inputs.to === 'dark') ? inputs.to : null;
  if (to) tone = t / dur >= (moveOf(move)?.about.toneAt ?? 0.5) ? to : to === 'dark' ? 'light' : 'dark';
  // a stage alone: its ground, with what a film puts on one. `show: 'type'`: a title, a line under it and two cards
  // (can they be read on it?); else the fixture's first screen as a window (what it does behind a shot)
  const S = STAGES[move];
  if (S) return (
    <Stage tone={tone} ground={<S t={t} tone={tone} accent={TONES[tone].accent} inputs={inputs} />}>
      {show === 'type' ? (
        <>
          <TitleCard t={2} title="A title on this stage" leave={1e9} tone={tone} />
          <Label x={W / 2} y={H / 2 + 86} size={36} tone={tone} align="center">A quieter line under it</Label>
          {[0, 1].map((i) => <Card key={i} x={W / 2 - 420 + i * 440} y={H / 2 + 190} w={400} h={150} tone={tone}><Label x={36} y={34} size={32} strong tone={tone}>A card</Label><Label x={36} y={84} tone={tone}>and its caption</Label></Card>)}
        </>
      ) : screen(0)}
    </Stage>
  );
  return (
    <Stage tone={tone}>
      {C ?<C t={t} k={Math.min(1, Math.max(0, t / dur))} at={0} dur={dur} inputs={inputs} tone={tone} outgoing={screen(0)} incoming={screen(1)} place={place} /> : null}
      {onScreen ? screen(1) : null}
      {M ? <M t={t} from={0} to={dur} inputs={inputs} tone={tone} accent={TONES[tone].accent} line={{ start: 0, end: dur }} place={place} lift={lift} /> : null}
      {!M && !C ? <div style={{ position: 'absolute', left: 80, top: 80, font: '40px system-ui' }}>no move "{move}" has a Move.tsx or Cut.tsx</div> : null}
    </Stage>
  );
};
