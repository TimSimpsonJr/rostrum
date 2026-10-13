import React from 'react';
import { H, W } from '../../kit/stage';
import type { CutProps } from '../contract';
import { pullAt } from './move.ts';
import type { Inputs } from './move.ts';

// Nothing of the shot before. The new shot, larger about the element's middle on the frame (a name with no box, or
// a cut into a scene: about the frame's middle). No sound: the showcase has none.
const PullBack: React.FC<CutProps<Inputs>> = ({ k, inputs, incoming, place }) => {
  const box = place(inputs.from), cx = box ? box.x + box.w / 2 : W / 2, cy = box ? box.y + box.h / 2 : H / 2, s = pullAt(k);
  return incoming ? <div style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, transformOrigin: '0 0', transform: `translate(${(cx * (1 - s)).toFixed(3)}px, ${(cy * (1 - s)).toFixed(3)}px) scale(${s.toFixed(5)})` }}>{incoming}</div> : null;
};
export default PullBack;
