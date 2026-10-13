import React from 'react';
import { SUBPIXEL, clamp01, place } from '../../kit/ease';
import { Sfx } from '../../kit/sound';
import { H, TONES, W } from '../../kit/stage';
import type { CutProps } from '../contract';
import { T, TRAVEL, crossAt, gradientOf } from './move.ts';
import type { Inputs } from './move.ts';

const frame: React.CSSProperties = { position: 'absolute', left: 0, top: 0, width: W, height: H };

const GradientCross: React.FC<CutProps<Inputs>> = ({ k, at, inputs, outgoing, incoming }) => {
  const h = inputs.axis === 'h', c = crossAt(k, inputs.axis);
  const along = (px: number) => (h ? place(px, 0) : place(0, px));
  const stops = gradientOf(inputs.to, TONES.light.stage, TONES.dark.stage).map(([colour, p]) => `${colour} ${(p * 100).toFixed(3)}%`).join(', ');
  // the shot before tips into its going: its leading edge comes forward, by its speed (a 3D turn: SUBPIXEL)
  const lean = Math.abs(c.out.lean) > 0.01 ? ` perspective(2200px) ${h ? `rotateY(${(-c.out.lean).toFixed(3)}deg)` : `rotateX(${c.out.lean.toFixed(3)}deg)`}` : '';
  return (
    <>
      {/* the gradient is one long strip the camera travels along; its two ends are clear */}
      <div style={{ position: 'absolute', left: 0, top: 0, width: h ? (TRAVEL + 1) * W : W, height: h ? H : (TRAVEL + 1) * H, transform: along(-c.cam), backgroundImage: `linear-gradient(${h ? 'to right' : 'to bottom'}, ${stops})` }} />
      {/* each shot is the picture its frame held (a shot whose camera is close in is larger than its frame); its
          corners round as it leaves its place, or until it reaches it */}
      {outgoing && c.out.on ? <div style={{ ...frame, overflow: 'hidden', borderRadius: 28 * clamp01(Math.abs(c.out.offset) / 120), transformOrigin: '50% 50%', transform: along(c.out.offset) + lean, ...(lean ? SUBPIXEL : null) }}>{outgoing}</div> : null}
      {incoming && c.into.on ? <div style={{ ...frame, overflow: 'hidden', borderRadius: 28 * clamp01(c.into.offset / 120), transform: along(c.into.offset) }}>{incoming}</div> : null}
      <Sfx name="whoosh-pass" at={at + T.go} />
    </>
  );
};
export default GradientCross;
