import React from 'react';
import { AbsoluteFill, Loop, OffthreadVideo, staticFile } from 'remotion';
import { mediaSrc } from '../../kit/media';
import { FPS, TONES } from '../../kit/stage';
import type { StageProps } from '../contract';
import { scrimOf } from './move.ts';
import type { Inputs } from './move.ts';

const Footage: React.FC<StageProps<Inputs>> = ({ tone, inputs }) => {
  const clip = <OffthreadVideo muted src={staticFile(mediaSrc(inputs.file))} style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', objectFit: 'cover' }} />;
  return (
    <AbsoluteFill>
      {inputs.loop ? <Loop durationInFrames={Math.max(1, Math.floor(inputs.loop * FPS))}>{clip}</Loop> : clip}
      <AbsoluteFill style={{ background: TONES[tone].stage, opacity: scrimOf(inputs) }} />
    </AbsoluteFill>
  );
};
export default Footage;
