// The kit's atoms: a card, a label, a greek line, a capsule, a hairline, a rolling number, a slow camera. Ported from the
// explainer's kit without its CSS variables or its context: every atom takes the stage's `tone` as a prop and reads
// its colours from kit/stage.tsx TONES, and anything that moves takes `t`. Moves are built from these so that moves
// written by different hands read as one film.
import React from 'react';
import { clamp01, odoCols, place, wander } from './ease.ts';
import { TONES, liftShadow } from './stage';
import type { Tone } from './stage';

export { odoCols };

/** A surface with the tone's lift shadow (light) or glow (dark). Its top-left is at (x, y) in its parent, placed by
 *  a transform. Contents are clipped to its rounded corners. */
export const Card: React.FC<{ x?: number; y?: number; w: number; h: number; r?: number; tone: Tone; shadow?: boolean; children?: React.ReactNode; style?: React.CSSProperties }> = ({ x = 0, y = 0, w, h, r = 24, tone, shadow = true, children, style }) => {
  const skin = TONES[tone], box: React.CSSProperties = { position: 'absolute', inset: 0, borderRadius: r };
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: w, height: h, transform: place(x, y), ...style }}>
      {shadow ? <div style={{ ...box, boxShadow: liftShadow(tone) }} /> : null}
      <div style={{ ...box, background: skin.card, overflow: 'hidden', color: skin.ink }}>{children}</div>
    </div>
  );
};

/** A short plain label that names what a thing is. Plain Geist, sentence case. NOT a pill, no dot, no monospace
 *  capitals, never an eyebrow above a heading. `strong` for the thing's name, default for a quieter caption. */
export const Label: React.FC<{ children: React.ReactNode; x?: number; y?: number; size?: number; strong?: boolean; tone: Tone; align?: 'left' | 'center' | 'right'; style?: React.CSSProperties }> = ({ children, x, y, size = 26, strong, tone, align = 'left', style }) => {
  const skin = TONES[tone], placed = x !== undefined || y !== undefined;
  const shift = align === 'center' ? ' translateX(-50%)' : align === 'right' ? ' translateX(-100%)' : '';
  return (
    <div style={{ ...(placed ? { position: 'absolute', left: 0, top: 0, transform: place(x ?? 0, y ?? 0) + shift } : null), fontSize: size, lineHeight: 1.25, fontWeight: strong ? 600 : 480, letterSpacing: '-0.012em', color: strong ? skin.ink : skin.soft, whiteSpace: 'nowrap', ...style }}>
      {children}
    </div>
  );
};

/** A greek bar standing for a line of text. `k` (0..1) draws it on from the left. */
export const Bar: React.FC<{ x?: number; y?: number; w: number; h?: number; k?: number; tone: Tone; color?: string }> = ({ x = 0, y = 0, w, h = 10, k = 1, tone, color }) =>
  k <= 0 ? null : <div style={{ position: 'absolute', left: 0, top: 0, width: w, height: h, borderRadius: h / 2, background: color ?? TONES[tone].bar, transformOrigin: '0 50%', transform: place(x, y, `scale(${clamp01(k).toFixed(4)}, 1)`) }} />;

/** A small capsule holding one plain word: the thing a move carries from one place to another (the explainer's Pill).
 *  Not a tag on a heading and never with a dot. (x, y) is its CENTRE, placed by a transform; `k` 0..1 brings it into
 *  being (it widens from a spot and its word follows); at 1 it simply is there. */
export const Pill: React.FC<{ children: React.ReactNode; x: number; y: number; k?: number; h?: number; tone: Tone; style?: React.CSSProperties }> = ({ children, x, y, k = 1, h = 40, tone, style }) => {
  const skin = TONES[tone], u = clamp01(k), grow = 1 - (1 - u) ** 3;
  if (u <= 0) return null;
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: 0, height: 0, transform: place(x, y), ...style }}>
      <div style={{ position: 'absolute', left: 0, top: 0, height: h, boxSizing: 'border-box', padding: `0 ${h * 0.42}px`, borderRadius: h / 2, display: 'flex', alignItems: 'center', whiteSpace: 'nowrap',
        background: skin.card, color: skin.ink, boxShadow: `0 0 0 1px ${skin.border}, 0 ${h * 0.15}px ${h * 0.6}px oklch(0.45 0.09 272 / 0.18)`, fontSize: h * 0.42, fontWeight: 560, letterSpacing: '-0.01em',
        transform: `translate(-50%, -50%) scale(${(0.3 + 0.7 * grow).toFixed(4)}, ${(0.6 + 0.4 * grow).toFixed(4)})`, opacity: Math.min(1, u * 4) }}>
        <span style={{ opacity: clamp01((u - 0.45) / 0.55) }}>{children}</span>
      </div>
    </div>
  );
};

type Pt = { x: number; y: number };
/** A 1 px line drawn on from `from` to `to` (the parent's px) by `k` 0..1. */
export const Hairline: React.FC<{ from: Pt; to: Pt; k?: number; tone: Tone; color?: string; width?: number }> = ({ from: a, to: b, k = 1, tone, color, width = 1 }) => {
  const p = clamp01(k), len = Math.hypot(b.x - a.x, b.y - a.y);
  if (p <= 0) return null;
  return (
    <svg width={1} height={1} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color ?? TONES[tone].soft} strokeWidth={width} strokeLinecap="round" strokeDasharray={`${len} ${len}`} strokeDashoffset={len * (1 - p)} />
    </svg>
  );
};

const STRIP = '01234567890'.split('');
// a column's top and bottom edges are feathered, so a digit fades as it turns out of the window instead of being cut (a digit at rest is clear of them)
const ODO_EDGE = 'linear-gradient(to bottom, transparent 0%, #000 12%, #000 88%, transparent 100%)';
/** A number whose digit columns turn like an odometer: `value` may be fractional, mid-roll, so it moves on every
 *  frame of a roll. A higher column opens as it first turns. Tabular digits, one line tall. */
export const Odometer: React.FC<{ value: number; digits?: number; size: number; weight?: number; color: string }> = ({ value, digits = 2, size, weight = 300, color }) => (
  <span style={{ display: 'inline-block', whiteSpace: 'nowrap', fontSize: size, fontWeight: weight, lineHeight: 1, color, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.03em' }}>
    {odoCols(value, digits).map((c, i) => {
      const p = ((c.pos % 10) + 10) % 10;
      return (
        <span key={i} style={{ display: 'inline-block', position: 'relative', overflow: 'hidden', height: '1em', lineHeight: '1em', verticalAlign: 'top', maskImage: ODO_EDGE, WebkitMaskImage: ODO_EDGE, ...(c.on >= 1 ? null : { maxWidth: `${(c.on * 0.75).toFixed(4)}em`, opacity: c.on }) }}>
          <span style={{ visibility: 'hidden' }}>0</span>
          <span style={{ position: 'absolute', left: 0, top: 0, display: 'block', transform: `translateY(${((-p * 100) / 11).toFixed(4)}%)` }}>
            {STRIP.map((d, j) => <span key={j} style={{ display: 'block', height: '1em' }}>{d}</span>)}
          </span>
        </span>
      );
    })}
  </span>
);

/** The slow camera over a scene: a linear push from t0 to t1 (and on past t1, so a late cut never stalls) plus a
 *  slow two-axis drift. A plain 2D transform, so it is sub-pixel smooth. push: scale gained by t1 (0.03 = 3 %).
 *  drift: px of wander (0 = none). pan: px travelled by t1. */
export const Drift: React.FC<{ t: number; t0: number; t1: number; push?: number; drift?: number; pan?: { x?: number; y?: number }; seed?: number; children: React.ReactNode }> = ({ t, t0, t1, push = 0.03, drift = 5, pan, seed = 1, children }) => {
  const k = (t - t0) / (t1 - t0), w = wander(t, seed, drift);
  return <div style={{ position: 'absolute', inset: 0, transformOrigin: '50% 50%', transform: place(w.x + (pan?.x ?? 0) * k, w.y + (pan?.y ?? 0) * k, `scale(${(1 + push * k).toFixed(5)})`) }}>{children}</div>;
};
