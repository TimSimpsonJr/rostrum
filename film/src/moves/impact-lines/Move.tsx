import React from 'react';
import { Sfx } from '../../kit/sound';
import { H, W } from '../../kit/stage';
import type { MoveProps } from '../contract';
import { edgeOf, strokesAt, takes } from './move.ts';
import type { Inputs } from './move.ts';

const GAP = 12;   // px between the element's edge and where a stroke starts

const ImpactLines: React.FC<MoveProps<Inputs>> = ({ t, from, inputs, accent, place }) => {
  const k = (t - from) / takes();
  const box = (inputs.target ? place(inputs.target) : null) ?? { x: W / 2 - 70, y: H / 2 - 70, w: 140, h: 140 };
  // how far a stroke reaches beyond the edge: with the element's size, within reason
  const reach = Math.max(44, Math.min(96, 0.32 * Math.min(box.w, box.h) + 30));
  return (
    <>
      {k > 0 && k < 1 ? (
        <svg width={W} height={H} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
          {strokesAt(k, Math.round(from * 30)).map((s, j) => {
            const e = edgeOf(box, s.a), at = (d: number) => [e.x + e.dx * (GAP + reach * d), e.y + e.dy * (GAP + reach * d)];
            const [x1, y1] = at(s.tail), [x2, y2] = at(s.head);
            return s.head - s.tail > 0.01 ? <line key={j} x1={x1.toFixed(2)} y1={y1.toFixed(2)} x2={x2.toFixed(2)} y2={y2.toFixed(2)} stroke={accent} strokeWidth={3} strokeLinecap="round" opacity={s.o.toFixed(3)} /> : null;
          })}
        </svg>
      ) : null}
      <Sfx name="tick-fixed" at={from} />
    </>
  );
};
export default ImpactLines;
