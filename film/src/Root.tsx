import React from 'react';
import { AbsoluteFill, Composition, Still } from 'remotion';
import { RecordedScreen } from './RecordedScreen';
import { Sweep } from './Sweep';
import { Probe } from './Probe';
import { NO_BRAND } from './kit/Lockup';
import { FPS, H, W } from './kit/stage';
import { LookProps, MoveLook } from './MoveLook';
import { Measure } from './tutorial/Measure';
import { Tutorial, tutorialMetadata } from './tutorial/Tutorial';
import { Rule } from './standins';

// Every render is given a tutorial's film/ folder as its public dir (tools/render.mjs; the layout is tools/paths.mjs):
// the screens come from its clean/, the sounds and font from its kit/, the brand from its brand/, the narration from
// its narration/. The raw recording is beside film/, never in it: Remotion copies and serves the whole public dir.

// The fixture's values have no <label>, id or name of their own, so each rule names its field.
const FIXTURE_KEYS: Rule[] = [
  { match: { selector: '.row:nth-of-type(1) .value' }, secret: 'Company API Key' },
  { match: { selector: '.row:nth-of-type(2) .value' }, secret: 'User API Key' },
  { match: { selector: '.value' }, secret: true },
];

// One screen of the prepared recording. The fixtures are 1280x720, so 1.5x fills the 1920x1080 frame.
// The rules hold regular expressions, which Remotion's props cannot carry, so they are bound here.
const FixtureScreen: React.FC<{ screen?: number; scale?: number; x?: number; y?: number }> = ({ screen = 0, scale = 1.5, x = 0, y = 0 }) => (
  <AbsoluteFill style={{ background: '#eef0fb' }}>
    <RecordedScreen screen={screen} standIns={FIXTURE_KEYS} style={{ transform: `scale(${scale}) translate(${-x}px, ${-y}px)`, transformOrigin: '0 0' }} />
  </AbsoluteFill>
);

// The step 2 stills and the spike (per-fixture screens, the chalk probe, Spike-*) are retired: old/Root-step2.tsx, old/Spike.tsx.
export const Root: React.FC = () => (
  <>
    {/* Any tutorial, from its folder (no film has code of its own; the film that was built by hand is in old/): beats.json + clean/boxes.json + narration/timing.json (tutorial/Tutorial.tsx). */}
    <Composition id="Tutorial" component={Tutorial} width={W} height={H} fps={FPS} durationInFrames={FPS} defaultProps={{ file: null, boxes: {}, timing: null, brand: NO_BRAND, missing: null }} calculateMetadata={tutorialMetadata} />
    {/* What tools/measure-boxes.mjs reads: the boxes of the nodes a beat file names. */}
    <Still id="Measure" component={Measure} width={1920} height={1080} defaultProps={{ nodes: {}, windows: {} }} />
    {/* What tools/gestures.mjs reads: where every element of a clean screen is (ids and boxes, no text). */}
    <Still id="Probe" component={Probe} width={1920} height={1080} defaultProps={{ screens: [] as number[], windows: {} }} />
    {/* What tools/sweep.mjs reads: the film's screens rebuilt with its stand-in rules, reported to the console. */}
    <Still id="Sweep" component={Sweep} width={1920} height={1080} defaultProps={{ screens: [] as number[], windows: {} }} />
    {/* npm run still -- fixtures/tutorials/fixture-keys Screen-keys <out.png> (or fixture-keys-dark) */}
    <Still id="Screen-keys" component={FixtureScreen} width={1920} height={1080} />
    {/* A library move or a one-off alone, at second t of its own run: node --experimental-strip-types tools/move-still.mjs <name> (MoveLook.tsx; an engine move, the browser bar among them, is looked at in a film) */}
    <Still id="Move" component={MoveLook} width={W} height={H} defaultProps={{ move: '', inputs: {}, t: 0.6, tone: 'light' } as LookProps} />
  </>
);
