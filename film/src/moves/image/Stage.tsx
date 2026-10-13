import React from 'react';
import { AbsoluteFill, Img, staticFile } from 'remotion';
import { mediaSrc } from '../../kit/media';
import { TONES } from '../../kit/stage';
import type { StageProps } from '../contract';
import { scrimOf } from './move.ts';
import type { Inputs } from './move.ts';

const Picture: React.FC<StageProps<Inputs>> = ({ tone, inputs }) => (
  <AbsoluteFill>
    <Img src={staticFile(mediaSrc(inputs.file))} style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', objectFit: inputs.fit ?? 'cover' }} />
    <AbsoluteFill style={{ background: TONES[tone].stage, opacity: scrimOf(inputs) }} />
  </AbsoluteFill>
);
export default Picture;
