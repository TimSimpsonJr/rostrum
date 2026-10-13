import React from 'react';
import { Sfx } from '../../kit/sound';
import { H, W } from '../../kit/stage';
import type { CutProps } from '../contract';
import { CUT, matchAt } from './move.ts';
import type { Inputs } from './move.ts';

// (a name with no box, or a cut out of or into a scene: the object is the middle of the frame on that side)
const MIDDLE = { x: W / 2 - 320, y: H / 2 - 180, w: 640, h: 360 };

const MatchCut: React.FC<CutProps<Inputs>> = ({ k, at, dur, inputs, outgoing, incoming, place }) => {
  const m = matchAt(k, place(inputs.hero[0]) ?? MIDDLE, place(inputs.hero[1]) ?? MIDDLE), shot = m.cut ? incoming : outgoing;
  return (
    <>
      {shot ? <div style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, transformOrigin: '0 0', transform: `translate(${m.x.toFixed(3)}px, ${m.y.toFixed(3)}px) scale(${m.scale.toFixed(5)})` }}>{shot}</div> : null}
      <Sfx name="whoosh-cut" at={at + CUT * dur - 0.4} />
      <Sfx name="pat-large" at={at + CUT * dur} />
    </>
  );
};
export default MatchCut;
