import React from 'react';
import { EASE, place, tw } from '../../kit/ease';
import { H, TONES, W } from '../../kit/stage';
import type { MoveProps } from '../contract';

const MarkTime: React.FC<MoveProps<{ text: string }>> = ({ t, from, to, inputs, tone }) => {
  const on = tw(t, from, from + 0.4, EASE.settle), off = tw(t, to - 0.3, to, EASE.settle), o = on * (1 - off);
  if (o <= 0) return null;
  return <div style={{ position: 'absolute', left: 0, top: 0, width: W, textAlign: 'center', fontSize: 34, fontWeight: 480, letterSpacing: '-0.012em', color: TONES[tone].soft, opacity: o, transform: place(0, H - 92 + 10 * (1 - on)) }}>{inputs.text}</div>;
};
export default MarkTime;
