// What a move is (docs/superpowers/specs/2026-10-12-moves-library-design.md, "The contract"). One shape for a library
// move, a one-off in a tutorial's film/moves/, and a stage. The pure side (move.ts) is what node loads: the catalogue
// (tools/moves.mjs), the sweep and the beat file's checks read it. The drawing (Move.tsx or Cut.tsx) is what the
// Template mounts. Nothing here says when a move may be used.
import type React from 'react';

export type Tone = 'light' | 'dark';
export type Box = { x: number; y: number; w: number; h: number };
export type Cue = string | { word: string; nth?: number };

export type About = {
  name: string;
  /** one line, for the picture plan */
  for: string;
  /** where it goes in the beat file: 'moves' (on a beat, with `at` and `until` cues), 'cut' (on the first beat of a
   *  new shot: the way in), 'stage' (the film's or a scene's ground), or the engine key that already stages it
   *  ('frame', 'cursor', 'change', 'list', 'bar', 'sequence', 'window', 'open', 'end') */
  use: 'moves' | 'cut' | 'stage' | string;
  /** each input, in a sentence: what it is, and whether it is a name in `nodes`, a cue word, authored text or a choice */
  inputs: Record<string, string>;
  /** how long it needs, in words, so the script can leave room */
  takes: string;
  /** which inputs are authored strings it puts on the frames (the sweep reads them: `text()` below) */
  text: string[];
  /** which inputs are cue words of the beat's line (a cue, or a list of them: 'each'): makeBeats hands the move their
   *  seconds in their place, so a move never sees a word it must time */
  cues?: string[];
  /** which inputs name elements the move draws alone, apart from their screen ('node', or a list: 'nodes[]'): the
   *  film hands the move each of them through `lift`; a name among them with no measured box stops the build */
  lifts?: string[];
  /** a cut only: what the film's cursor does through it. The cursor belongs to the shot it is on, so it is drawn
   *  with the shot before (it leaves, shrinks, softens as that shot does) and again with the new one (it arrives with
   *  it, where it will stand when the cut ends). 'rides' (the default): just that. 'fades': on the shot before it is
   *  gone within the cut's first 4 frames instead (a cut that enlarges that shot many times over would enlarge it too) */
  cursor?: 'rides' | 'fades';
  /** a cut only: when (0..1 of its length) the film takes the stage of the shot it leads into, when that differs
   *  from the stage before. Default 0.5: a cut that covers the frame covers it half way. A cut that draws the change
   *  of stage itself says when its own drawing hides the flip. */
  toneAt?: number;
  /** a cut only: the shot it leads into is there whole from the cut's first frame: its page does not set in part by
   *  part after it (a cut that lands on the content itself) */
  whole?: boolean;
  /** what it draws from: 'nothing of the screen', 'the named element', 'two screens', 'the brand'... */
  reads: string[];
  /** a beat, or the part of one, that uses it; the catalogue shows it and tools/move-still.mjs renders it */
  example?: Record<string, unknown>;
};

/** What a scene or shot move's component is given on every frame. */
export type MoveProps<I = Record<string, unknown>> = {
  /** film seconds now; the move runs from `from` (its `at` cue, else the line's start) to `to` (its `until` cue,
   *  else the later of the line's end and from + takes(inputs)) */
  t: number; from: number; to: number;
  inputs: I; tone: Tone; accent: string;
  line: { start: number; end: number };
  /** the box on the frame, now, of an element the inputs name (measured; under the shot's camera); null off a shot,
   *  and for a name that is no element */
  place: (name: string) => Box | null;
  /** an element the move's `about.lifts` names, alone (nothing else of its screen), as the screen shows it now:
   *  drawn `width` frame px wide, its height following (without a width: at its own size in the screen's px), its
   *  top left at the top left of whatever the move puts it in. Null off a shot and for a name that is not among
   *  them. Each element lifted is one more rebuilt screen while the move shows it: ask only while it is in view. */
  lift: (name: string, width?: number) => React.ReactNode | null;
};
/** What a cut move's component is given: `k` 0..1 over its length; the two shots as the Template draws them. Its
 *  length is its `takes`, or (the beat's `until`) up to a word of the line; the inputs it lists in `about.cues` reach
 *  it as film seconds, and the sweep reads its `about.text`, as a move's. On the film's first beat it is the way into
 *  the first shot from the open: `outgoing` is null, and the shot's camera and cursor are as they are without it. */
export type CutProps<I = Record<string, unknown>> = {
  t: number; k: number; at: number; dur: number; inputs: I; tone: Tone; accent: string;
  outgoing: React.ReactNode; incoming: React.ReactNode;
  place: (name: string) => Box | null;
  /** the box on the frame, now, of the new shot's window under its own camera (null: a scene): what a thing that
   *  becomes the window grows into */
  into: Box | null;
};
/** A named stage, as a beat file's `stage`, a scene's, or a brand's (brand.json `stage`): its move and that move's
 *  inputs. `tone` is the one input every named stage takes: which ink, cards and lift shadow go on it (light unless
 *  said). It is all the rest of the film knows of a stage: type, cards, a cut's `toneAt` and gradient-cross read the
 *  tone and never which stage it is. */
export type StageUse = { move: string; tone?: Tone } & Record<string, unknown>;
/** the tone of a stage: the tone itself, or a named stage's `tone` (light unless it says dark) */
export const toneOf = (s?: Tone | StageUse | null): Tone => (typeof s === 'string' ? s : s?.tone === 'dark' ? 'dark' : 'light');
/** What a stage's component (Stage.tsx) is given. It draws the ground only, the whole frame, under everything. */
export type StageProps<I = Record<string, unknown>> = { t: number; tone: Tone; accent: string; inputs: I };
/** The pure side of a move module. */
export type MoveModule = {
  about: About;
  /** null when the inputs are sound; else what is wrong, in a sentence (the build stops on it) */
  check?: (inputs: any) => string | null;
  /** every authored string the move puts on the frames, from its inputs */
  text?: (inputs: any) => string[];
  /** seconds it needs from `at` (a cut: its length); default 0 (a cut: 0.7) */
  takes?: (inputs: any) => number;
  /** how far (0..1) the move's shot has receded under it at second t of a run from `from` to `to`: the screen draws
   *  back, dims and softens (Camera `recede`); the most any move on the shot asks for is what it gets */
  recedes?: (t: number, from: number, to: number) => number;
};
