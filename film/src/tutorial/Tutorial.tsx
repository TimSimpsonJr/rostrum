// A tutorial rendered from its film/ folder (the public dir: tools/paths.mjs): beats.json says what the film is, clean/boxes.json where
// things are, narration/timing.json when. No film has code of its own.
//   npm run render -- <tutorial> Tutorial <tutorial>/out/v1.mp4
//   npm run still  -- <tutorial> Tutorial <png> --frame <n>
import React, { useMemo } from 'react';
import { AbsoluteFill, CalculateMetadataFunction, staticFile } from 'remotion';
import { hasIcon } from '../kit/Icon';
import { moveOf } from '../moves/all';
import { Brand, loadBrand } from '../kit/Lockup';
import { Template, Timing } from './Template';
import { BeatsFile, Layout, makeBeats } from './beats';
import { Boxes } from './framing';

export type TutorialProps = { file: BeatsFile | null; boxes: Boxes; timing: Timing | null; brand: Brand; missing: string | null; layout?: Layout | null };

const read = async (file: string) => { const r = await fetch(staticFile(file)).catch(() => null); return r?.ok ? r.json().catch(() => null) : null; };

/** Reads the tutorial folder. The film's length is the narration's (close.ts), so it is known only here. It also
 *  reports what the beat file came to (`RT-BEATS:` on the console): the faults, and the moments worth a still. */
export const tutorialMetadata: CalculateMetadataFunction<TutorialProps> = async ({ props }) => {
  // (clean/layout.json, where every element of the screens is, is there when the screens were measured: without it
  // no frame edge is settled between elements and the cursor is parked nowhere in particular)
  const [file, boxes, timing, manifest, brand, layout] = await Promise.all([read('beats.json'), read('clean/boxes.json'), read('narration/timing.json'), read('clean/manifest.json'), loadBrand(), read('clean/layout.json')]);
  const missing = [!file && 'beats.json', !boxes && 'clean/boxes.json', !timing && 'narration/timing.json'].filter(Boolean).join(', ');
  if (missing) return { props: { ...props, brand, missing: `This folder has no ${missing}.` } };
  // the recorded viewport is the recording's, whatever the beat file says
  // every screen is its own size (prepare writes one per screen; an older clean copy has only the recording's)
  const viewports = manifest?.screens ? Object.fromEntries(manifest.screens.map((s: any) => [s.i, s.viewport ?? manifest.viewport])) : undefined;
  // (and when each was taken: a sequence plays its watched screens at the recorded pace)
  // (a film that names no stage is on its brand's own, when the brand has one: brand.json `stage`)
  const staged: BeatsFile = file.stage == null && brand.stage ? { ...file, stage: brand.stage } : file;
  const film: BeatsFile = manifest?.viewport ? { ...staged, viewport: manifest.viewport, viewports, screens: manifest.screens?.map((s: any) => ({ i: s.i, t: s.t })) } : staged;
  const { frames, fps, faults, moments } = makeBeats(film, boxes, timing, layout ?? undefined, hasIcon, !!brand.mark?.build, moveOf);
  console.log('RT-BEATS:' + JSON.stringify({ frames, fps, faults, moments }));
  return { durationInFrames: frames, props: { file: film, boxes, timing, brand, missing: null, layout } };
};

export const Tutorial: React.FC<TutorialProps> = ({ file, boxes, timing, brand, missing, layout }) => {
  const made = useMemo(() => (file && timing ? makeBeats(file, boxes, timing, layout ?? undefined, hasIcon, !!brand.mark?.build, moveOf) : null), [file, boxes, timing, layout, brand]);
  if (!made || !timing) return <AbsoluteFill style={{ background: '#fff', color: '#222', font: '40px system-ui', padding: 80 }}>{missing ?? 'No tutorial folder was given (--public-dir).'}</AbsoluteFill>;
  return <Template brand={brand} title={made.title} beats={made.beats} timing={timing} />;
};
