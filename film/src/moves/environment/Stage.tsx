import React from 'react';
import { AbsoluteFill } from 'remotion';
import { mix } from '../../kit/ease';
import { H, TONES } from '../../kit/stage';
import type { StageProps } from '../contract';
import { BAND, FLOOR, wallOf } from './move.ts';
import type { Inputs } from './move.ts';

// The wall: from the tone's card colour (the lit side) to its stage colour. The floor: the stage colour with a little
// of the ink in it, darker at the wall; the band above its edge is the wall's shade where it meets the floor.
const Environment: React.FC<StageProps<Inputs>> = ({ tone, inputs }) => {
  const skin = TONES[tone], y = FLOOR * H;
  return (
    <AbsoluteFill style={{ background: `linear-gradient(${wallOf(inputs.light)}, ${mix(skin.stage, skin.lit, 0.7)}, ${mix(skin.stage, skin.ink, 0.04)})` }}>
      {inputs.floor === false ? null : (
        <>
          <div style={{ position: 'absolute', left: 0, right: 0, top: y - BAND, height: BAND, background: `linear-gradient(to bottom, transparent, ${mix('transparent', skin.ink, 0.07)})` }} />
          <div style={{ position: 'absolute', left: 0, right: 0, top: y, bottom: 0, background: `linear-gradient(to bottom, ${mix(skin.stage, skin.ink, 0.12)}, ${mix(skin.stage, skin.ink, 0.05)})` }} />
        </>
      )}
    </AbsoluteFill>
  );
};
export default Environment;
