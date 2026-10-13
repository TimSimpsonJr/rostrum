// The house stage and its tokens, ported from the explainer (explainer/stage-tokens.css, src/tokens.css,
// explainer/kit/StageBackground.tsx, film/kit/atoms.tsx): the light stage with two slow orbs and a fixed dither,
// the Geist face, and the one clock; the dark stage and every colour by tone (TONES). Only what a film uses.
import React from 'react';
import { AbsoluteFill, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';

export const W = 1920, H = 1080, FPS = 30;

export const TOKEN = {
  stage: 'oklch(0.975 0.008 272)',
  orbA: 'oklch(0.62 0.17 272 / 0.34)',
  orbB: 'oklch(0.72 0.13 250 / 0.3)',
  ink: 'oklch(0.155 0.015 230)', // --foreground
  soft: 'oklch(0.556 0.015 230)', // --muted-foreground
  accent: 'oklch(0.48 0.175 272)', // --primary: the kit's own accent, for a film with no brand's
  card: 'oklch(1 0 0)',
  border: 'oklch(0.922 0.005 230)',
  font: '"Geist", ui-sans-serif, system-ui, sans-serif',
};
export type Tone = 'light' | 'dark';
/** What a tone has beyond the stage's own names: a recess inside a card (`well`), greek text on a card (`bar`), the
 *  lit top of a card (`lit`), and what a lifted card casts or glows with (`lift`: a whole box-shadow). */
const LIGHT = {
  ...TOKEN,
  well: 'oklch(0.955 0.012 272)', bar: 'oklch(0.86 0.02 272)', lit: TOKEN.card,
  lift: '0 3px 6px -1px oklch(0.48 0.175 272 / 0.075), 0 34px 67px -22px oklch(0.48 0.175 272 / 0.2), 0 90px 168px -45px oklch(0.48 0.175 272 / 0.225)',
};
/** The dark stage (the explainer's, hue 272; no brand): a deep field with one slow glow (`orbA`; `orbB` is unused on
 *  it), cards that glow instead of casting shadow. */
export const DARK: typeof LIGHT = {
  stage: 'oklch(0.165 0.036 275)', orbA: 'oklch(0.48 0.175 272 / 0.46)', orbB: 'oklch(0.48 0.175 272 / 0.2)',
  ink: 'oklch(0.93 0.005 230)', soft: 'oklch(0.68 0.012 230)', accent: 'oklch(0.74 0.13 272)', card: 'oklch(0.225 0.028 272)', border: 'oklch(0.36 0.035 272)', font: TOKEN.font,
  well: 'oklch(0.185 0.026 272)', bar: 'oklch(0.47 0.04 272)', lit: 'oklch(0.315 0.045 272)',
  lift: '0 0 0 1px oklch(0.36 0.035 272), 0 30px 90px -24px oklch(0.55 0.19 272 / 0.6), inset 0 1px 0 oklch(1 0 0 / 0.16)',
};
/** Every colour a move or a card uses, by the stage's tone. A palette change is these objects and nothing else. */
export const TONES: Record<Tone, typeof LIGHT> = { light: LIGHT, dark: DARK };
/** the stage shadow under a lifted card (light) or the dark card's glow */
export const liftShadow = (tone: Tone) => TONES[tone].lift;

/** The stage shadow under a window (--shadow-stage), with its hairline edge. `k`: divide every length by this, for an
 *  element that sits inside a scale(k) transform and must keep the shadow's size on the frame. */
export const stageShadow = (k = 1) => {
  const p = (n: number) => `${(n / k).toFixed(3)}px`;
  return `0 0 0 ${p(1)} ${TOKEN.border}, 0 ${p(2)} ${p(4)} ${p(-1)} oklch(0.48 0.175 272 / 0.06), 0 ${p(24)} ${p(48)} ${p(-16)} oklch(0.48 0.175 272 / 0.16), 0 ${p(64)} ${p(120)} ${p(-32)} oklch(0.48 0.175 272 / 0.18)`;
};

// Geist, loaded once per page; frames wait for it.
if (typeof document !== 'undefined') {
  const handle = delayRender('kit: Geist');
  const face = new FontFace('Geist', `url(${staticFile('kit/GeistVF.woff2')}) format("woff2")`, { weight: '100 900', style: 'normal' });
  face.load().then((f) => { document.fonts.add(f); continueRender(handle); }, () => continueRender(handle));
}

/** Seconds of the frame being drawn, on the composition's own clock. Every animated value is a pure function of this. */
export const useT = () => useCurrentFrame() / useVideoConfig().fps;

// The film's dither: one fixed fine grey noise over the stage, so its slow gradients do not show 8-bit steps.
const DITHER = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><filter id="n" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="13" stitchTiles="stitch"/><feColorMatrix values="1 0 0 0 0  1 0 0 0 0  1 0 0 0 0  0 0 0 0 1"/></filter><rect width="256" height="256" filter="url(#n)"/></svg>',
)}")`;

/** The stage: full frame, opaque, drifting on the film's clock (so it never rests and never resets). Light: two
 *  slow orbs. Dark: a deep field with one slow glow. `tone`: the film's or a scene's.
 *  `ground`: a named stage's own drawing (a moves/<name>/Stage.tsx), in place of the tone's orbs, over the tone's
 *  plain colour and under the same dither. */
export const Stage: React.FC<{ tone?: Tone; ground?: React.ReactNode; children?: React.ReactNode }> = ({ tone = 'light', ground: named, children }) => {
  const t = useT();
  const ax = 420 + 150 * Math.sin(t * 0.031 + 0.4) + 60 * Math.sin(t * 0.083), ay = 260 + 110 * Math.cos(t * 0.027 + 1.1);
  const bx = 1500 + 170 * Math.cos(t * 0.024 + 2.0) + 50 * Math.sin(t * 0.071), by = 840 + 120 * Math.sin(t * 0.029 + 0.7);
  const gx = 1040 + 190 * Math.sin(t * 0.026 + 1.3) + 70 * Math.sin(t * 0.067), gy = 470 + 120 * Math.cos(t * 0.022 + 0.2);
  const ground: React.CSSProperties = tone === 'dark'
    ? { backgroundColor: DARK.stage, backgroundImage: `radial-gradient(circle 1150px at ${gx.toFixed(2)}px ${gy.toFixed(2)}px, ${DARK.orbA}, transparent 100%)` }
    : { backgroundColor: TOKEN.stage, backgroundImage: `radial-gradient(circle 900px at ${ax.toFixed(2)}px ${ay.toFixed(2)}px, ${TOKEN.orbA}, transparent 100%), radial-gradient(circle 780px at ${bx.toFixed(2)}px ${by.toFixed(2)}px, ${TOKEN.orbB}, transparent 100%)` };
  return (
    <AbsoluteFill style={{ fontFamily: TOKEN.font, overflow: 'hidden' }}>
      <AbsoluteFill style={{ isolation: 'isolate' }}>
        {named ? <AbsoluteFill style={{ backgroundColor: TONES[tone].stage }}>{named}</AbsoluteFill> : <AbsoluteFill style={ground} />}
        <AbsoluteFill style={{ backgroundImage: DITHER, opacity: 0.2, mixBlendMode: 'overlay' }} />
      </AbsoluteFill>
      {children}
    </AbsoluteFill>
  );
};
