import React from 'react';
import { place } from '../../kit/ease';
import { H, TONES, W } from '../../kit/stage';
import type { MoveProps } from '../contract';
import { SIZE, beatAt } from './move.ts';
import type { Inputs } from './move.ts';

// The title card's own structure (kit/Lockup TitleCard), a size down: a mask one line tall in the middle of the
// frame, the words rising into it; the whole clears upward. No sound.
const TypeBeat: React.FC<MoveProps<Inputs>> = ({ t, from, to, inputs, tone }) => {
  const { rise, out } = beatAt(from, to, t), line = SIZE * 1.12;
  if (t < from || out >= 1) return null;
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: W, height: line, overflow: 'hidden', transform: place(0, H / 2 - line / 2 - 8 - 26 * out), opacity: 1 - out }}>
      <div style={{ width: W, textAlign: 'center', fontSize: SIZE, lineHeight: `${line}px`, fontWeight: 300, letterSpacing: '-0.035em', color: TONES[tone].ink, whiteSpace: 'nowrap', transform: place(0, line * (1 - rise)) }}>{inputs.text}</div>
    </div>
  );
};
export default TypeBeat;
