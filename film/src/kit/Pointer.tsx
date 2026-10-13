// The kit's pointer arrow, ported from the explainer portal's cursor (src/screens/shell.js makeCursor, ui-kit.css
// .dc-cursor): the same 24-unit arrow, ink fill, white edge, soft drop shadow. The explainer showed it at 1.7x over a
// screen at about 0.86x; a tutorial's screens are at 2 to 3x, so it is 2.7x here to read at every beat. Its hotspot
// (the arrow's tip) is (x, y). `press` 0..1 is the original's click: it sinks down and in about its tip (the original
// nudge is a hair, 0.5/1 px and 10%; it is doubled here so the click shows). Nothing else: no ring, no ripple.
import React from 'react';
import { place } from './ease';
import { TOKEN } from './stage';

const ARROW_D = 'M1.5 1.2 L1.5 17.6 L5.6 13.7 L8.4 20.1 L11.3 18.8 L8.6 12.6 L14.4 12.6 Z';

export const Pointer: React.FC<{ x: number; y: number; press?: number; scale?: number }> = ({ x, y, press = 0, scale = 2.7 }) => (
  <div style={{ position: 'absolute', left: 0, top: 0, width: 24, height: 24, transformOrigin: '0 0', transform: place(x - 1.5 * scale, y - 1.2 * scale, `scale(${scale})`), pointerEvents: 'none' }}>
    <svg viewBox="0 0 24 24" style={{ display: 'block', width: '100%', height: '100%', overflow: 'visible', transformOrigin: '2px 2px', transform: `translate(${(1 * press).toFixed(3)}px, ${(2 * press).toFixed(3)}px) scale(${(1 - 0.2 * press).toFixed(4)})` }}>
      <path d={ARROW_D} fill={TOKEN.ink} stroke={TOKEN.card} strokeWidth={1.5} strokeLinejoin="round" style={{ paintOrder: 'stroke', filter: `drop-shadow(0 1px 1.5px color-mix(in oklab, ${TOKEN.ink} 35%, transparent))` }} />
    </svg>
  </div>
);
