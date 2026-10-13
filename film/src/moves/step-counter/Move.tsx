import React from 'react';
import { Label } from '../../kit/atoms';
import { wander } from '../../kit/ease';
import { W } from '../../kit/stage';
import type { MoveProps } from '../contract';
import { EDGE, SIZE, countAt, text } from './move.ts';
import type { Inputs } from './move.ts';

// The kit's quiet caption, right-aligned in the frame's top corner; it drifts a hair, as everything at rest does. No sound.
const StepCounter: React.FC<MoveProps<Inputs>> = ({ t, from, to, inputs, tone }) => {
  const { k, out } = countAt(from, to, t), w = wander(t, 11, 2);
  if (k <= 0 || out >= 1) return null;
  return <Label tone={tone} size={SIZE} align="right" x={W - EDGE + w.x} y={EDGE + 8 * (1 - k) + w.y} style={{ opacity: k * (1 - out), fontVariantNumeric: 'tabular-nums' }}>{text(inputs)[0]}</Label>;
};
export default StepCounter;
