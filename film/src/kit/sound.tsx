// Sound, ported from the explainer's audio.tsx: effects are quiet and tactile and play at the approved level
// (APPROVED_DB under the files' own level). A tutorial uses the approved click only: click-down on the press,
// click-up as the control comes back (kit/click-*.wav in the tutorial folder, copied from film/public/kit; the softened copies; click-up's own -5 dB is in its file).
// A move plays one effect of a family with `Sfx` (the families: sfx.ts; their sources: film/public/kit/SOUNDS.md).
import React from 'react';
import { Audio, Sequence, staticFile, useVideoConfig } from 'remotion';
import { SFX, takeOf } from './sfx.ts';

export { SFX, takeOf };

const APPROVED_DB = -24;
const gain = (db: number) => 10 ** (db / 20);

/** One sound from the public dir (the tutorial folder), starting at `at` seconds. */
export const Sound: React.FC<{ src: string; at: number; dur: number; db?: number }> = ({ src, at, dur, db = 0 }) => {
  const { fps } = useVideoConfig();
  return (
    <Sequence from={Math.round(at * fps)} durationInFrames={Math.ceil(dur * fps) + 1} layout="none">
      <Audio src={staticFile(src)} volume={gain(db)} />
    </Sequence>
  );
};

/** The two halves of the approved click: the press, and the control coming back (a drag holds between them). */
export const Press: React.FC<{ at: number }> = ({ at }) => <Sound src="kit/click-down-1.wav" at={at} dur={0.033} db={APPROVED_DB} />;
export const Release: React.FC<{ at: number }> = ({ at }) => <Sound src="kit/click-up-1.wav" at={at} dur={0.033} db={APPROVED_DB} />;
/** The approved interface click at `at` seconds. */
export const Click: React.FC<{ at: number }> = ({ at }) => (
  <>
    <Press at={at} />
    <Release at={at + 0.14} />
  </>
);

/** One effect of a family at `at` seconds, at the approved level plus the family's trim. `variant`: that take
 *  (default: one fixed by the time). `gain`: dB on top, never above 0. An unknown family draws nothing. */
export const Sfx: React.FC<{ name: string; at: number; variant?: number; gain?: number }> = ({ name, at, variant, gain: more = 0 }) => {
  const f = SFX[name];
  if (!f) return null;
  return <Sound src={`kit/${name}-${takeOf(name, at, variant)}.wav`} at={at} dur={1.3} db={APPROVED_DB + f.trim + Math.min(0, more)} />;
};
