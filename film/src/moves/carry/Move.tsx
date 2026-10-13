import React from 'react';
import { Pill } from '../../kit/atoms';
import { Sfx } from '../../kit/sound';
import type { MoveProps } from '../contract';
import { LEAVE, besideOf, carryAt, halfOf } from './move.ts';
import type { Inputs } from './move.ts';

// The capsule is 56 px, not the kit's 40: beside a screen framed close, its word must still read.
const TALL = 56;

// (`from` is the run's first second, a prop of every move; the element it sets beside is `inputs.from`. It never
// stands over an element it names: besideOf)
const Carry: React.FC<MoveProps<Inputs>> = ({ t, from, to, inputs, tone, place }) => {
  const rest = (name?: string) => besideOf(name ? place(name) : null, TALL, halfOf(inputs.text, TALL));
  const c = carryAt(from, to, rest(inputs.from), rest(inputs.to), t);
  return (
    <>
      {c.set > 0 && c.out < 1 ? <Pill tone={tone} h={TALL} x={c.x} y={c.y} k={c.set} style={{ opacity: 1 - c.out }}>{inputs.text}</Pill> : null}
      <Sfx name="paper-slide" at={from + LEAVE} />
    </>
  );
};
export default Carry;
