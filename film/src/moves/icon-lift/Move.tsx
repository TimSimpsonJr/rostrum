import React from 'react';
import { place as put } from '../../kit/ease';
import { TONES, liftShadow } from '../../kit/stage';
import type { MoveProps } from '../contract';
import { CORE, DIM, GROW, liftAt, patchOf, scaleAt } from './move.ts';
import type { Inputs } from './move.ts';

// The dim is the dark ink whatever the stage (as spotlight's), an oval that falls away to nothing; the element is drawn
// once at the size it grows to and scaled down to where it is, about its own middle.
const IconLift: React.FC<MoveProps<Inputs>> = ({ t, from, to, inputs, tone, place, lift }) => {
  const k = liftAt(from, to, t), box = k > 0 ? place(inputs.target) : null;
  if (!box) return null;
  const p = patchOf(box), w = box.w * GROW, h = box.h * GROW;
  return (
    <>
      <div style={{ position: 'absolute', left: 0, top: 0, width: p.w, height: p.h, transform: put(p.x, p.y), opacity: DIM * k, background: `radial-gradient(closest-side, ${TONES.light.ink} ${CORE * 100}%, transparent 100%)` }} />
      <div style={{ position: 'absolute', left: 0, top: 0, width: w, height: h, transformOrigin: '50% 50%', transform: put(box.x + box.w / 2 - w / 2, box.y + box.h / 2 - h / 2, `scale(${(scaleAt(k) / GROW).toFixed(5)})`) }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: 10, boxShadow: liftShadow(tone), opacity: k }} />
        <div style={{ position: 'absolute', inset: 0, borderRadius: 10, overflow: 'hidden' }}>{lift(inputs.target, w)}</div>
      </div>
    </>
  );
};
export default IconLift;
