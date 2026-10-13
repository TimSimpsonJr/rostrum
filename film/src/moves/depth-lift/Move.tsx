import React from 'react';
import { place as put } from '../../kit/ease';
import { Sfx } from '../../kit/sound';
import { liftShadow } from '../../kit/stage';
import type { MoveProps } from '../contract';
import { castAt, depthAt, layerAt } from './move.ts';
import type { Inputs } from './move.ts';

const DepthLift: React.FC<MoveProps<Inputs>> = ({ t, from, to, inputs, tone, place, lift }) => {
  const k = depthAt(from, to, t);
  return (
    <>
      {k > 0 ? inputs.nodes.map((name, i) => {
        const box = place(name);
        if (!box) return null;
        // the element is drawn once at its size on the frame and the whole of it (ground, shadow) scaled to its depth
        const r = layerAt(i, k, t, box);
        return (
          <div key={name} style={{ position: 'absolute', left: 0, top: 0, width: box.w, height: box.h, transformOrigin: '0 0', transform: put(r.x, r.y, `scale(${r.scale.toFixed(5)})`) }}>
            {/* the farthest stands off the receded screen on the stage's lift shadow; each nearer one casts on the one below */}
            <div style={{ position: 'absolute', inset: 0, borderRadius: 8, boxShadow: i ? castAt(r.z) : liftShadow(tone), opacity: i ? 1 : k }} />
            <div style={{ position: 'absolute', inset: 0, borderRadius: 8, overflow: 'hidden' }}>{lift(name, box.w)}</div>
          </div>
        );
      }) : null}
      {inputs.nodes.map((name, i) => <Sfx key={name} name="paper-slide" at={from + 0.08 * i} />)}
    </>
  );
};
export default DepthLift;
