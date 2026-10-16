// The two cards every tutorial has, in the house style (ported from the explainer: ch01's title type and rise, ch13's
// end card and its one gradient sweep).
//   TitleCard  the open: the tutorial's title, alone on the stage. No logo, no label above it, no rule, no ornament.
//   EndCard    the close: the brand's mark alone, set in the centre (or built there, part by part, when the brand
//              asks for it: MarkBuild.tsx), one gradient sweep, held.
// The kit holds no brand. A brand is a folder outside the plugin (brand.json + its mark file), copied into the
// tutorial folder as brand/ and read by loadBrand: its mark is a file used as it is, never redrawn, recoloured or
// cropped here; BrandMark is the one component that shows it.
import React from 'react';
import { Img, staticFile } from 'remotion';
import { EASE, clamp01, lerp, place, tw } from './ease';
import { H, TONES, W } from './stage';
import type { Tone } from './stage';
import { resolveLook } from './look';
import { Build, MarkBuild, readBuild } from './MarkBuild';
import { SWEEP_AT } from './markTiming.ts';
import { FIT, fitTitle } from './titleFit.ts';

export type Brand = {
  name: string | null;
  /** the mark for the end card: an image file, its height over its width, how wide to set it on a 1920 frame, and
   *  (optional) the two colours of the gradient that sweeps across it once, and (optional) how it builds on instead
   *  of fading in (brand.json `mark.build`, read and checked by loadBrand: absent when the file cannot be built) */
  mark: { src: string; aspect: number; width: number; gradient?: [string, string]; build?: Build } | null;
  /** the one accent a film may use beside its ink (a list's icons): the brand's, else its mark's first gradient
   *  colour, else the recorded site's (kit/look.ts); none: the kit's own (TOKEN.accent) */
  accent?: string | null;
  /** the brand's own stage (brand.json `stage`: a named stage and its inputs, as a beat file's): a film that names no
   *  stage is on it. A file it names is in the brand's folder, so it reaches the film as `brand/<file>` */
  stage?: { move: string; tone?: Tone } & Record<string, unknown>;
};

export const NO_BRAND: Brand = { name: null, mark: null };

/** The brand of the tutorial being rendered: brand/brand.json of the public dir (`mark.file` is beside it). No brand folder: NO_BRAND. */
export async function loadBrand(): Promise<Brand> {
  const read = async (file: string) => { const r = await fetch(staticFile(file)).catch(() => null); return r?.ok ? r.json().catch(() => null) : null; };
  const [b, site] = await Promise.all([read('brand/brand.json'), read('clean/site.json')]);
  if (!b) return NO_BRAND;
  // a mark with no gradient of its own is swept in the accent (the brand's, else the recorded site's: kit/look.ts)
  const { accent } = resolveLook(b, site), gradient = b.mark?.gradient ?? (accent ? [accent, accent] : undefined);
  // a mark that builds: its SVG is read here once and travels with the brand (the build is then a pure function of time)
  const text = b.mark?.build && /\.svg$/i.test(b.mark.file) ? await fetch(staticFile('brand/' + b.mark.file)).then((r) => (r.ok ? r.text() : null)).catch(() => null) : null;
  const build = (text && readBuild(text, b.mark.build, b.mark.width)) || undefined;
  const stage = b.stage && typeof b.stage === 'object' && typeof b.stage.move === 'string' ? { ...b.stage, ...(typeof b.stage.file === 'string' ? { file: 'brand/' + b.stage.file } : {}) } : undefined;
  return { name: b.name ?? null, mark: b.mark ? { src: staticFile('brand/' + b.mark.file), aspect: b.mark.aspect, width: b.mark.width, gradient, ...(build ? { build } : {}) } : null, accent: b.colours?.accent ?? b.accent ?? b.mark?.gradient?.[0] ?? accent, ...(stage ? { stage } : {}) };
}

/** The brand's mark, centred on (W/2, cy). `o`, `dy`: its opacity and px of offset while it sets. `sweep` 0..1: the
 *  brand's gradient crossing it once from the left behind a soft edge (the explainer's end card); at 1 the mark is in the gradient.
 *  `under`: what stands for the mark's image under the sweep (a mark that was built stays the same element: no change of pixels). */
export const BrandMark: React.FC<{ brand: Brand; cy: number; o?: number; dy?: number; sweep?: number; under?: React.ReactNode }> = ({ brand, cy, o = 1, dy = 0, sweep = 0, under }) => {
  if (!brand.mark) return null; // no mark: EndCard sets the title as text instead
  const { src, width: w, aspect, gradient } = brand.mark, h = w * aspect;
  const s = gradient ? sweep : 0;
  const box: React.CSSProperties = { position: 'absolute', left: 0, top: 0, width: w, height: h, transform: place(W / 2 - w / 2, cy - h / 2 + dy) };
  const e = s < 0.5 ? 4 * s ** 3 : 1 - 4 * (1 - s) ** 3; // power2.inOut, as the explainer's
  const feather = 0.225 * w, x1 = lerp(-feather - 0.04 * w, 1.04 * w, e);
  return (
    <>
      {s < 1 ? under ?? <Img src={src} style={{ ...box, opacity: o }} /> : null}
      {/* the same mark in the gradient, shown left of the soft edge. Only once the mark is at rest: a moving element is not masked. */}
      {s > 0 && gradient ? <div style={{ ...box, background: `linear-gradient(90deg, ${gradient[0]}, ${gradient[1]})`, maskImage: `url(${src}), linear-gradient(90deg, #000 ${x1.toFixed(2)}px, transparent ${(x1 + feather).toFixed(2)}px)`, maskSize: '100% 100%', maskRepeat: 'no-repeat', maskComposite: 'intersect' }} /> : null}
    </>
  );
};

/** The open: the title rises into place through a mask and settles, holds, and clears upward from `leave` (gone 0.6 s later).
 *  A title too wide for the frame is set on two lines, and smaller if it must (titleFit.ts). */
export const TitleCard: React.FC<{ t: number; title: string; leave: number; tone?: Tone; /** the title beside a window that has made room for it: flush left in a column `w` px wide from `x`, in over 0.3 s from `from`, gone `clear` s after `leave`; no rise, no travel */ beside?: { from: number; clear: number; x: number; w: number } }> = ({ t, title, leave, tone = 'light', beside }) => {
  if (beside) {
    const o = tw(t, beside.from, beside.from + 0.3, EASE.linear) * (1 - tw(t, leave, leave + beside.clear, EASE.linear));
    if (o <= 0) return null;
    return (
      <div style={{ position: 'absolute', left: 0, top: 0, width: beside.w, height: H, display: 'flex', alignItems: 'center', transform: place(beside.x, 0), opacity: o }}>
        <div style={{ fontSize: 64, lineHeight: 1.12, fontWeight: 300, letterSpacing: '-0.03em', color: TONES[tone].ink, textAlign: 'left', whiteSpace: 'normal', textWrap: 'balance' }}>{title}</div>
      </div>
    );
  }
  const out = tw(t, leave, leave + 0.6, EASE.settle);
  if (out >= 1) return null;
  const { lines, size } = fitTitle(title, 116, FIT * W, -0.035), line = size * 1.12, high = line * lines.length, rise = 1 - (1 - clamp01((t - 0.25) / 0.8)) ** 3, drop = high * (1 - rise);
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: W, height: high, overflow: 'hidden', transform: place(0, H / 2 - high / 2 - 8 - 26 * out), opacity: 1 - out }}>
      <div style={{ width: W, textAlign: 'center', fontSize: size, lineHeight: `${line}px`, fontWeight: 300, letterSpacing: '-0.035em', color: TONES[tone].ink, whiteSpace: 'nowrap', transform: place(0, drop) }}>{lines.map((l, i) => <div key={i}>{l}</div>)}</div>
    </div>
  );
};

/** The end card from `at`: the brand's mark sets in the centre, one gradient sweep, held. A mark with a `build` is
 *  built there instead (whole by BUILD s: from then on the file as it is, the same element), then swept from SWEEP_AT. The template times it so
 *  that the narration's closing line is spoken over this (tutorial/close.ts).
 *  With no mark (no brand, or a brand without one) the card is text only: the tutorial's title alone, in the title
 *  card's type at 72 px (two lines, or smaller, when it must: titleFit.ts), setting the same way. No name of a site or a product is shown that the film was not given. */
export const EndCard: React.FC<{ brand: Brand; t: number; at: number; title?: string; tone?: Tone; from?: { x: number; y: number; w: number; h: number } }> = ({ brand, t, at, title, tone = 'light', from }) => {
  const k = tw(t, at, at + 0.7, EASE.settle), u = t - at, mark = brand.mark;
  // A logo lift (`from`: where the recorded site's own logo is on the frame as the camera's push arrives): the
  // mark, the brand's file as it is, comes up over that box at that width in the 0.3 s before `at`, while the window
  // goes, and travels and sizes to its place as the card sets; the sweep is as ever. A mark that is built, and a
  // card of text, set in the usual way (the push and the window's going are the lift then).
  if (from && mark && !mark.build) {
    const o = tw(t, at - 0.3, at, EASE.linear), g = EASE.heavy(clamp01(u / 0.8)), s = lerp(from.w / mark.width, 1, g);
    if (o <= 0) return null;
    return (
      <div style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, transformOrigin: '50% 50%', transform: place((from.x + from.w / 2 - W / 2) * (1 - g), (from.y + from.h / 2 - H / 2) * (1 - g), `scale(${s.toFixed(5)})`) }}>
        <BrandMark brand={brand} cy={H / 2} o={o} sweep={clamp01((t - (at + 1.15)) / 0.66)} />
      </div>
    );
  }
  if (k <= 0) return null;
  if (mark?.build) return <BrandMark brand={brand} cy={H / 2} sweep={clamp01((u - SWEEP_AT) / 0.66)} under={<MarkBuild build={mark.build} w={mark.width} h={mark.width * mark.aspect} cy={H / 2} u={u} />} />;
  if (brand.mark) return <BrandMark brand={brand} cy={H / 2} o={k} dy={14 * (1 - k)} sweep={clamp01((t - (at + 1.15)) / 0.66)} />;
  if (!title) return null;
  const { lines, size } = fitTitle(title, 72, FIT * W, -0.035), line = size * 1.12, high = line * lines.length;
  return <div style={{ position: 'absolute', left: 0, top: 0, width: W, textAlign: 'center', fontSize: size, lineHeight: `${line}px`, fontWeight: 300, letterSpacing: '-0.035em', color: TONES[tone].ink, whiteSpace: 'nowrap', opacity: k, transform: place(0, H / 2 - high / 2 + 14 * (1 - k)) }}>{lines.map((l, i) => <div key={i}>{l}</div>)}</div>;
};
