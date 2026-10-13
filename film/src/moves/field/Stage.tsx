import React from 'react';
import { AbsoluteFill } from 'remotion';
import type { StageProps } from '../contract';
import { angleAt } from './move.ts';
import type { Inputs } from './move.ts';

const Field: React.FC<StageProps<Inputs>> = ({ t, accent, inputs }) => {
  const colourOf = (c?: string) => (c === 'accent' ? accent : c);
  return <AbsoluteFill style={{ background: inputs.colour ? colourOf(inputs.colour) : `linear-gradient(${angleAt(inputs.angle, t).toFixed(3)}deg, ${colourOf(inputs.from)}, ${colourOf(inputs.to)})` }} />;
};
export default Field;
