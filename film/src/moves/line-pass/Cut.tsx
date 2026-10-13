import React from 'react';
import { clamp01, mix, place } from '../../kit/ease';
import { Sfx } from '../../kit/sound';
import { H, TONES, W } from '../../kit/stage';
import type { CutProps } from '../contract';
import { REST_X, passAt, restY, ribbon } from './move.ts';
import type { Inputs } from './move.ts';

const frame: React.CSSProperties = { position: 'absolute', left: 0, top: 0, width: W, height: H };

// (the ribbon is in the kit's own accent: a cut is not told the brand's)
const LinePass: React.FC<CutProps<Inputs>> = ({ k, at, inputs, tone, outgoing, incoming }) => {
  const v = inputs.variant ?? 'below', p = passAt(k, v), ink = TONES[tone].accent;
  return (
    <>
      {/* the world, under the camera: the ribbon beneath, the shot before at its origin, the new one where the camera comes to rest */}
      <div style={{ ...frame, transform: place(-p.cx, -p.cy) }}>
        {p.head > p.from && p.lift < 940 ? (
          <svg width={1} height={1} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', transform: place(0, -p.lift) }}>
            <path d={ribbon(p.head, v)} fill="none" stroke={ink} strokeWidth={20} strokeLinecap="round" strokeLinejoin="round" />
            <path d={ribbon(p.head, v, 18)} fill="none" stroke={mix(ink, TONES[tone].card, 0.55)} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
        {/* each shot is the picture its frame held (a shot whose camera is close in is larger than its frame, and
            would lie over the ribbon and the other shot); its corners round as the camera leaves it, or until it is reached */}
        {outgoing && p.cx < W + 40 ? <div style={{ ...frame, overflow: 'hidden', borderRadius: 28 * clamp01(p.cx / 240) }}>{outgoing}</div> : null}
        {incoming && p.cx > REST_X - W - 40 ? <div style={{ ...frame, overflow: 'hidden', borderRadius: 28 * clamp01((REST_X - p.cx) / 240), transform: place(REST_X, restY(v)) }}>{incoming}</div> : null}
      </div>
      <Sfx name="whoosh-pass" at={at + 0.3} />
    </>
  );
};
export default LinePass;
