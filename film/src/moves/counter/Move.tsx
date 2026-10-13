import React from 'react';
import { Label, Odometer } from '../../kit/atoms';
import { EASE, place, tw } from '../../kit/ease';
import { Sfx } from '../../kit/sound';
import { H, TONES, W } from '../../kit/stage';
import type { MoveProps } from '../contract';
import { digitsOf, valueAt } from './move.ts';
import type { Inputs } from './move.ts';

const SIZE = 200, ROLL = 1.3;

const Counter: React.FC<MoveProps<Inputs>> = ({ t, from, to, inputs, tone }) => {
  const on = tw(t, from, from + 0.4, EASE.settle), off = tw(t, to, to + 0.3, EASE.settle);
  if (on <= 0 || off >= 1) return null;
  const value = valueAt(inputs.from ?? 0, inputs.to, from + 0.15, from + 0.15 + ROLL, t), skin = TONES[tone];
  const top = H / 2 - SIZE / 2 - (inputs.label ? 34 : 0);
  return (
    <>
      <div style={{ position: 'absolute', left: 0, top: 0, width: W, textAlign: 'center', opacity: on * (1 - off), transform: place(0, top + 18 * (1 - on) - 14 * off) }}>
        <Odometer value={value} digits={digitsOf(inputs)} size={SIZE} color={skin.ink} />
        {inputs.label ? <Label tone={tone} size={40} style={{ marginTop: 22, opacity: tw(t, from + 0.5, from + 1.0, EASE.settle) }}>{inputs.label}</Label> : null}
      </div>
      {/* the roll: a few quiet ticks while it turns, and a pat as it lands */}
      {[0.2, 0.45, 0.75].map((d) => <Sfx key={d} name="tick-fixed" at={from + d} gain={-6} />)}
      <Sfx name="pat-small" at={from + 0.15 + ROLL - 0.1} />
    </>
  );
};
export default Counter;
