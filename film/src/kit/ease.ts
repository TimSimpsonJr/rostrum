// Easing and small math, ported from the explainer kit (film/kit/ease.ts, explainer/motion.ts). Pure functions of time
// in seconds; no imports, so node tests can load it. No overshoot and no bounce anywhere. (Tests: build.test.mjs.)

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** Quintic in-out: speed AND acceleration are zero at both ends. THE move ease: cameras, the cursor, anything heavy. */
const heavy = (x: number) => { const u = clamp01(x); return u * u * u * (10 - 15 * u + 6 * u * u); };

/** A CSS cubic-bezier(x1, y1, x2, y2) as a function, solved by Newton's method (six steps from the input). */
const cubic = (x1: number, y1: number, x2: number, y2: number) => (x: number) => {
  const u = clamp01(x);
  if (u === 0 || u === 1) return u;
  const ax = 1 - 3 * x2 + 3 * x1, bx = 3 * x2 - 6 * x1, cx = 3 * x1;
  let s = u;
  for (let i = 0; i < 6; i++) { const d = 3 * ax * s * s + 2 * bx * s + cx; if (Math.abs(d) < 1e-6) break; s = clamp01(s - (((ax * s + bx) * s + cx) * s - u) / d); }
  return ((1 - 3 * y2 + 3 * y1) * s + (3 * y2 - 6 * y1)) * s * s + 3 * y1 * s;
};

export const EASE = {
  heavy,
  /** A draw or a wipe: soft start, soft stop, near-steady in between (the assembly's outlines and fills). */
  draw: cubic(0.4, 0, 0.6, 1),
  /** One confident stroke: off the mark fast, a long soft tail. */
  stroke: (x: number) => heavy(1 - (1 - clamp01(x)) ** 2),
  /** A drift or a descent: soft start, long settle (the assembly's sink). Stands in for the kit's bezier(0.4, 0, 0.2, 1). */
  settle: (x: number) => { const u = clamp01(x); return 1 - (1 - u * u * (3 - 2 * u)) ** 1.6; },
  linear: clamp01,
};

/** Progress 0..1 of a move from time a to time b (seconds), eased. Clamped outside. */
export const tw = (t: number, a: number, b: number, ease: (x: number) => number = EASE.heavy) => ease(clamp01((t - a) / (b - a)));

/** A button press on its moment: down fast, held, back up softly (0 to 1 to 0). The explainer's ch12 envelope. */
export const pressEnv = (t: number, at: number) => tw(t, at, at + 0.1, EASE.stroke) * (1 - tw(t, at + 0.13, at + 0.4));

/** A CSS transform that PLACES something. Always place with this, never with animated left/top: those snap to whole pixels. */
export const place = (x: number, y: number, more = '') => `translate(${x.toFixed(3)}px, ${y.toFixed(3)}px)${more ? ` ${more}` : ''}`;

/** Nothing rests: a slow two-axis wander (px) from the absolute time, different per seed. Speed stays under about 5 px/s at a = 6. */
export function wander(t: number, seed: number, a = 6) {
  const p = seed * 1.618;
  return {
    x: a * (Math.sin(t * 0.31 + p) + 0.5 * Math.sin(t * 0.17 + p * 2.3)),
    y: a * 0.7 * (Math.cos(t * 0.27 + p * 1.7) + 0.5 * Math.sin(t * 0.13 + p)),
  };
}

/** One part of a longer build: how far it has got when the whole is at k, running from a to b of the whole (parts overlap). */
export const seg = (k: number, a: number, b: number, ease: (x: number) => number = EASE.draw) => ease(clamp01((k - a) / (b - a)));

/** Mix two CSS colours in oklch: k = 0 is a, 1 is b. */
export const mix = (a: string, b: string, k: number) => `color-mix(in oklch, ${b} ${(clamp01(k) * 100).toFixed(2)}%, ${a})`;

export type Rect = { x: number; y: number; w: number; h: number; r?: number };
/** Morph: one rect into another (position, size, radius). */
export const morphRect = (a: Rect, b: Rect, k: number): Rect => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), w: lerp(a.w, b.w, k), h: lerp(a.h, b.h, k), r: lerp(a.r ?? 0, b.r ?? 0, k) });

export type Pt = { x: number; y: number };
/** The point k (0..1) of the way along a polyline, by arc length, and the heading there. */
export function travelAlong(path: Pt[], k: number): Pt & { angle: number } {
  const lens = path.slice(1).map((p, i) => Math.hypot(p.x - path[i].x, p.y - path[i].y));
  let d = clamp01(k) * lens.reduce((a, b) => a + b, 0), i = 0;
  while (i < lens.length - 1 && d > lens[i]) d -= lens[i++];
  const a = path[i], b = path[i + 1] ?? a, f = lens[i] ? d / lens[i] : 0;
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, angle: Math.atan2(b.y - a.y, b.x - a.x) };
}
/** The point k (0..1) of a cubic bezier from p0 to p3 with control points p1 and p2. */
export function bezier(p0: Pt, p1: Pt, p2: Pt, p3: Pt, k: number): Pt {
  const u = 1 - k, a = u * u * u, b = 3 * u * u * k, c = 3 * u * k * k, d = k * k * k;
  return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y };
}

/** Spread onto any element with a 3D transform (rotateX/Y, perspective, translateZ). Chrome sets such a layer down on
 *  whole pixels, so a slow move goes in 1 px hops; an opacity just under 1 makes it composite at sub-pixel positions. */
export const SUBPIXEL = { opacity: 0.999 } as const;

/** An odometer's columns for `value` (may be fractional, mid-roll): pos = digits scrolled, on = 1 shown, 0 collapsed.
 *  A higher column turns over during the last unit below it (9 to 10), and opens as it first turns. (Drawn by kit/atoms.tsx.) */
export function odoCols(value: number, digits: number): { pos: number; on: number }[] {
  const v = Math.max(0, value);
  return Array.from({ length: digits }, (_, i) => {
    const unit = 10 ** (digits - 1 - i);
    return unit === 1 ? { pos: v, on: 1 } : { pos: Math.floor(v / unit) + clamp01((v % unit) - (unit - 1)), on: clamp01(v - (unit - 1)) };
  });
}

/** A fixed pseudo-random 0..1 for item i, channel s: per-element offsets that are the same on every frame. */
export const rnd = (i: number, s = 0) => { const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); };
