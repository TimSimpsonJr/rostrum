import React from 'react';
import { EASE, place, tw } from '../../kit/ease';
import { Sfx } from '../../kit/sound';
import { H, TONES, W } from '../../kit/stage';
import type { MoveProps } from '../contract';
import { sizeOf, swapAt, swapsOf } from './move.ts';
import type { Inputs } from './move.ts';

// the slot's top and bottom edges are feathered, so a word fades as it leaves instead of being cut by a hard edge
// (the mask is on the fixed slot, not on what moves, and only while a word is moving: at rest nothing of a descender is faded)
const FEATHER = 'linear-gradient(to bottom, transparent 0%, #000 14%, #000 86%, transparent 100%)';

const WordSwap: React.FC<MoveProps<Inputs>> = ({ t, from, to, inputs, tone, accent }) => {
  const on = tw(t, from, from + 0.4, EASE.settle), off = tw(t, to, to + 0.3, EASE.settle);
  if (on <= 0 || off >= 1) return null;
  const size = sizeOf(inputs), slot = size * 1.3, swaps = swapsOf(inputs, from), { i, u } = swapAt(swaps, t), k = EASE.heavy(u), skin = TONES[tone];
  const cell: React.CSSProperties = { gridArea: '1 / 1', whiteSpace: 'nowrap', textAlign: 'left' };
  return (
    <>
      <div style={{ position: 'absolute', left: 0, top: 0, width: W, textAlign: 'center', fontSize: size, lineHeight: `${slot}px`, fontWeight: 300, letterSpacing: '-0.03em', color: skin.ink, whiteSpace: 'pre', opacity: on * (1 - off), transform: place(0, H / 2 - slot / 2 - 8 + 18 * (1 - on) - 14 * off) }}>
        {inputs.before ? <span>{inputs.before} </span> : null}
        {/* the slot is as wide as the widest word (every word lies in it unseen), so nothing else on the line moves */}
        <span style={{ display: 'inline-grid', verticalAlign: 'top', height: slot, overflow: 'hidden', fontWeight: 560, color: accent, ...(u < 1 ? { maskImage: FEATHER, WebkitMaskImage: FEATHER } : null) }}>
          {inputs.words.map((w, j) => <span key={j} style={{ ...cell, visibility: 'hidden' }}>{w}</span>)}
          {u < 1 ? <span style={{ ...cell, transform: place(0, -slot * k) }}>{inputs.words[i - 1]}</span> : null}
          <span style={{ ...cell, transform: place(0, u < 1 ? slot * (1 - k) : 0) }}>{inputs.words[i]}</span>
        </span>
      </div>
      {swaps.map((at, j) => <Sfx key={j} name="wordswap-tick" at={at} />)}
    </>
  );
};
export default WordSwap;
