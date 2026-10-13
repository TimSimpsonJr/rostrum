// A box that assembles in place (the assembly language: build.ts). The kit has no clock of its own inside a move, so
// `t` is a prop; `tone` picks the colours (kit/stage.tsx TONES). Import this file as './build.tsx': './build' finds build.ts.
import React from 'react';
import { buildAt, buildOrder } from './build.ts';
import { clamp01, place, seg } from './ease.ts';
import { TONES, liftShadow } from './stage';
import type { Tone } from './stage';

export { buildAt, buildOrder };

/** A rounded outline drawn round its perimeter: `p` the share drawn, from `start` (0..1) of the way round. */
export const Stroke: React.FC<{ w: number; h: number; r: number; p: number; ink: string; o: number; start: number; sw?: number; dy?: number }> = ({ w, h, r, p, ink, o, start, sw = 1.5, dy = 0 }) =>
  p <= 0 || o <= 0.01 ? null : (
    <svg style={{ position: 'absolute', left: 0, top: 0, width: w, height: h, overflow: 'visible', opacity: o, transform: dy ? place(0, dy) : undefined }}>
      <rect x={sw / 2} y={sw / 2} width={Math.max(0, w - sw)} height={Math.max(0, h - sw)} rx={Math.min(r, (h - sw) / 2)} fill="none" stroke={ink} strokeWidth={sw} pathLength={1} strokeDasharray={`${p.toFixed(4)} ${(1 - p).toFixed(4)}`} strokeDashoffset={-start} />
    </svg>
  );

/** A box that assembles in place from second `at`, then simply is there. (x, y) is its top-left at rest.
 *  kind 'box': outline, echoes, fill, then children. kind 'text': no box; the children wipe in while they drift.
 *  Before `at` it draws nothing. `fill`: default the tone's card; `ink`: the outline, default the tone's accent (a
 *  move passes the brand's). `seed`: a different number gives a different offset, direction and stroke start. */
export const BuildBox: React.FC<{
  t: number; at: number; dur?: number; x?: number; y?: number; w: number; h: number; r?: number; kind?: 'box' | 'text';
  fill?: string; ink?: string; tone: Tone; shadow?: boolean; seed?: number; children?: React.ReactNode; style?: React.CSSProperties;
}> = ({ t, at, dur = 0.9, x = 0, y = 0, w, h, r = 12, kind = 'box', fill, ink, tone, shadow = kind === 'box', seed = 0, children, style }) => {
  const skin = TONES[tone], b = buildAt(t, at, dur, seed);
  if (!b.started) return null;
  const wipe = (p: number) => (p < 1 ? `inset(0 ${(100 * (1 - p)).toFixed(2)}% 0 0 round ${r}px)` : undefined);
  const gap = 1 - b.land, line = ink ?? skin.accent;
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: w, height: h, transform: place(x + b.dx, y + b.dy), ...style }}>
      {kind === 'box' ? (
        <>
          {shadow ? <div style={{ position: 'absolute', inset: 0, borderRadius: r, boxShadow: liftShadow(tone), opacity: clamp01(b.fill * 1.5) }} /> : null}
          {[1, 2].map((j) => <Stroke key={j} w={w} h={h} r={r} p={seg(b.k - 0.07 * j, 0, 0.55)} ink={line} o={(0.5 / j) * gap} start={b.start} sw={1.2} dy={-5 * j * gap} />)}
          <Stroke w={w} h={h} r={r} p={b.outline} ink={line} o={1 - seg(b.fill, 0.6, 1)} start={b.start} />
          {b.fill > 0 ? <div style={{ position: 'absolute', inset: 0, borderRadius: r, background: fill ?? skin.card, clipPath: wipe(b.fill) }} /> : null}
        </>
      ) : null}
      {b.content > 0 ? <div style={{ position: 'absolute', inset: 0, borderRadius: r, color: skin.ink, overflow: kind === 'box' ? 'hidden' : undefined, clipPath: kind === 'text' ? wipe(b.content) : undefined, opacity: kind === 'box' ? b.content : 1, transform: kind === 'box' ? place(0, 6 * (1 - b.content)) : undefined }}>{children}</div> : null}
    </div>
  );
};
