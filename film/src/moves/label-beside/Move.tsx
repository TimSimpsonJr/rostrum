import React from 'react';
import { EASE, place, tw } from '../../kit/ease';
import { Sfx } from '../../kit/sound';
import { H, TONES } from '../../kit/stage';
import type { MoveProps } from '../contract';
import { columnOf, sizeOf, swapAt, swapsOf } from './move.ts';
import type { Inputs } from './move.ts';

// (the slot's top and bottom edges are feathered only while a word is moving, as in word-swap)
const FEATHER = 'linear-gradient(to bottom, transparent 0%, #000 14%, #000 86%, transparent 100%)';

// One line, flush left in the free column, level with the middle of the frame. (In a film `each` is seconds: about.cues.)
const LabelBeside: React.FC<MoveProps<Inputs>> = ({ t, from, to, inputs, tone }) => {
  const on = tw(t, from, from + 0.4, EASE.linear), off = tw(t, to, to + 0.3, EASE.linear);
  if (on <= 0 || off >= 1) return null;
  const size = sizeOf(inputs), slot = size * 1.3, col = columnOf(inputs), swaps = swapsOf(inputs, from), { i, u } = swapAt(swaps, t), k = EASE.heavy(u);
  const cell: React.CSSProperties = { position: 'absolute', left: 0, top: 0, whiteSpace: 'nowrap' };
  return (
    <>
      <div style={{ position: 'absolute', left: 0, top: 0, width: col.w, height: slot, overflow: 'hidden', transform: place(col.x, H / 2 - slot / 2), opacity: on * (1 - off), fontSize: size, lineHeight: `${slot}px`, fontWeight: 300, letterSpacing: '-0.03em', color: TONES[tone].ink, ...(u < 1 ? { maskImage: FEATHER, WebkitMaskImage: FEATHER } : null) }}>
        {u < 1 ? <span style={{ ...cell, transform: place(0, -slot * k) }}>{inputs.words[i - 1]}</span> : null}
        <span style={{ ...cell, transform: place(0, u < 1 ? slot * (1 - k) : 0) }}>{inputs.words[i]}</span>
      </div>
      {swaps.map((at, j) => <Sfx key={j} name="wordswap-tick" at={at} />)}
    </>
  );
};
export default LabelBeside;
