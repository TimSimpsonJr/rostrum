import React from 'react';
import { H, TONES, W } from '../../kit/stage';
import type { MoveProps } from '../contract';
import { DIM, FEATHER, dimAt, windowOf } from './move.ts';
import type { Inputs } from './move.ts';

// What dims is the dark ink whatever the stage (a light page and a dark one both go down, as `scan` does). The blur is
// a filter on a still shape in the mask, never on anything that moves. Fixed ids: one spotlight at a time.
const Spotlight: React.FC<MoveProps<Inputs>> = ({ t, from, to, inputs, place }) => {
  const dim = dimAt(from, to, t), box = dim > 0 ? place(inputs.target) : null;
  if (!box) return null;
  const win = windowOf(box);
  return (
    <svg width={W} height={H} style={{ position: 'absolute', left: 0, top: 0 }}>
      <defs>
        <filter id="spot-f" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation={FEATHER} /></filter>
        <mask id="spot-m" maskUnits="userSpaceOnUse" x={0} y={0} width={W} height={H}>
          <rect width={W} height={H} fill="#fff" />
          <rect x={win.x} y={win.y} width={win.w} height={win.h} rx={12} fill="#000" filter="url(#spot-f)" />
        </mask>
      </defs>
      <rect width={W} height={H} fill={TONES.light.ink} opacity={DIM * dim} mask="url(#spot-m)" />
    </svg>
  );
};
export default Spotlight;
