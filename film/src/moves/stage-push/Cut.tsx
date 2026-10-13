import React from 'react';
import { place } from '../../kit/ease';
import { Sfx } from '../../kit/sound';
import { H, W } from '../../kit/stage';
import type { CutProps } from '../contract';
import { pushAt } from './move.ts';
import type { Inputs, Slot } from './move.ts';

/** One shot as a frame-sized picture that travels: clipped to the frame it was in (a shot whose camera is close in
 *  is larger than the frame), its corners rounding as it leaves. A cut out of or into a scene has no shot there. */
const Travel: React.FC<{ s: Slot; children: React.ReactNode }> = ({ s, children }) => (children ? (
  <div style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, overflow: 'hidden', borderRadius: 28 * s.a, transformOrigin: '50% 50%', transform: place(s.x, s.y, `scale(${s.scale.toFixed(5)})`), opacity: s.opacity, ...(s.blur > 0.05 ? { filter: `blur(${s.blur.toFixed(2)}px)` } : null) }}>{children}</div>
) : null);

const StagePush: React.FC<CutProps<Inputs>> = ({ k, at, inputs, outgoing, incoming }) => {
  const p = pushAt(k, inputs.direction);
  return (
    <>
      <Travel s={p.outgoing}>{outgoing}</Travel>
      <Travel s={p.incoming}>{incoming}</Travel>
      <Sfx name="whoosh" at={at} />
    </>
  );
};
export default StagePush;
