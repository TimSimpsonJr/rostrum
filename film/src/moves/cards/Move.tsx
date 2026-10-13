import React from 'react';
import { Bar, Card, Drift, Hairline, Label } from '../../kit/atoms';
import { BuildBox } from '../../kit/build.tsx';   // (the extension: './build' alone finds build.ts)
import { EASE, SUBPIXEL, place, rnd, tw } from '../../kit/ease';
import { Sfx } from '../../kit/sound';
import type { MoveProps } from '../contract';
import { joinOf, labelSize, layoutOf, linesOf, startsOf } from './move.ts';
import type { Inputs } from './move.ts';

const Cards: React.FC<MoveProps<Inputs>> = ({ t, from, to, inputs, tone, accent }) => {
  const items = inputs.items, arrive = inputs.arrive ?? 'build';
  const slots = layoutOf(items.length, inputs.layout, linesOf(inputs)), size = labelSize(inputs, slots[0].w);
  const starts = startsOf(slots.length, from, inputs.each as number[] | undefined);
  const out = tw(t, to, to + 0.4, EASE.settle);
  if (out >= 1) return null;
  /** a card is there to join once its surface is (the build's fill; a fold or a slide at rest) */
  const landed = (i: number) => starts[i] + (arrive === 'build' ? 0.45 : 0.5);
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: 1 - out }}>
      <Drift t={t} t0={from} t1={Math.max(to, from + 2)} push={0.025} drift={4} seed={3}>
        {(inputs.connect ?? []).map(([a, b], i) => { const j = joinOf(slots[a], slots[b]), at = Math.max(landed(a), landed(b)); return <Hairline key={`j${i}`} from={j.from} to={j.to} k={tw(t, at, at + 0.6, EASE.stroke)} tone={tone} width={2} />; })}
        {slots.map((s, i) => {
          const c = items[i], at = starts[i];
          const inner = (
            <>
              <Label tone={tone} strong size={size} x={30} y={28 + (30 - size) / 2}>{c.label}</Label>
              {Array.from({ length: c.lines ?? 0 }, (_, j) => <Bar key={j} tone={tone} h={12} x={30} y={92 + 36 * j} w={(s.w - 60) * (1 - 0.34 * rnd(i * 7 + j, 2))} k={tw(t, at + 0.6 + 0.12 * j, at + 0.95 + 0.12 * j, EASE.stroke)} />)}
            </>
          );
          if (arrive === 'build') return <BuildBox key={i} t={t} at={at} x={s.x} y={s.y} w={s.w} h={s.h} r={24} tone={tone} ink={accent} seed={i}>{inner}</BuildBox>;
          const k = tw(t, at, at + 0.7, EASE.settle);
          if (k <= 0) return null;
          const how = arrive === 'fold' ? `perspective(2100px) rotateY(${(88 * (1 - k)).toFixed(3)}deg)` : `translate(${(-70 * (1 - k)).toFixed(2)}px, 0)`;
          return <div key={i} style={{ position: 'absolute', left: 0, top: 0, width: s.w, height: s.h, transformOrigin: '0 50%', transform: `${place(s.x, s.y)} ${how}`, ...SUBPIXEL, opacity: Math.min(SUBPIXEL.opacity, k * 3) }}><Card tone={tone} w={s.w} h={s.h}>{inner}</Card></div>;
        })}
      </Drift>
      {slots.map((_, i) => <Sfx key={i} name={arrive === 'build' ? 'pencil-short' : arrive === 'fold' ? 'page-turn' : 'paper-slide'} at={starts[i]} />)}
      {slots.map((_, i) => <Sfx key={`p${i}`} name={arrive === 'build' ? 'pat-small' : 'pat-medium'} at={starts[i] + (arrive === 'build' ? 0.85 : 0.6)} />)}
    </div>
  );
};
export default Cards;
