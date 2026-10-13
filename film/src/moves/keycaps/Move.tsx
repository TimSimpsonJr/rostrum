import React from 'react';
import { Card, Label } from '../../kit/atoms';
import { Sfx } from '../../kit/sound';
import { H } from '../../kit/stage';
import type { MoveProps } from '../contract';
import { BOTTOM, CAP, LEAVE, TYPE, capsAt, rowOf } from './move.ts';
import type { Inputs } from './move.ts';

// The row rises as one and is gone by the end of its run.
const Keycaps: React.FC<MoveProps<Inputs>> = ({ t, from, to, inputs, tone }) => {
  const { set, out } = capsAt(from, to - LEAVE, t), y = H - BOTTOM - CAP + 14 * (1 - set);
  return (
    <>
      {set > 0 && out < 1 ? (
        <div style={{ position: 'absolute', inset: 0, opacity: set * (1 - out) }}>
          {rowOf(inputs.caps).map((c, i) => (
            <Card key={i} tone={tone} x={c.x} y={y} w={c.w} h={CAP} r={12}>
              <Label tone={tone} strong size={TYPE} x={c.w / 2} y={(CAP - TYPE * 1.25) / 2} align="center">{inputs.caps[i]}</Label>
            </Card>
          ))}
        </div>
      ) : null}
      <Sfx name="pat-small" at={from} />
      <Sfx name="click-tick" at={from + 0.1} />
    </>
  );
};
export default Keycaps;
