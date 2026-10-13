import React from 'react';
import { Bar, Card, Label } from '../../kit/atoms';
import { EASE, place as put, rnd, tw } from '../../kit/ease';
import { Sfx } from '../../kit/sound';
import { TONES } from '../../kit/stage';
import type { MoveProps } from '../contract';
import { SHEET, TAB, sheetAt, startsOf, tabW, tabsOf } from './move.ts';
import type { Inputs } from './move.ts';

const SheetStack: React.FC<MoveProps<Inputs>> = ({ t, from, to, inputs, tone }) => {
  const n = inputs.count, tabs = tabsOf(inputs), starts = startsOf(n, from), skin = TONES[tone], w = tabW(n);
  const out = tw(t, to, to + 0.4, EASE.settle);
  return (
    <>
      {out < 1 ? (
        <div style={{ position: 'absolute', inset: 0, opacity: 1 - out }}>
          {tabs.map((word, i) => {
            const s = sheetAt(i, n, from, t);
            if (s.k <= 0) return null;
            return (
              <div key={i} style={{ position: 'absolute', left: 0, top: 0, width: SHEET.w, height: SHEET.h, transform: put(s.x, s.y), opacity: Math.min(1, s.k * 4) }}>
                {/* the tab stands on the sheet's top edge and is of a piece with it */}
                <div style={{ position: 'absolute', left: 0, top: 0, width: w - 6, height: TAB.h + 14, borderRadius: '12px 12px 0 0', background: skin.card, boxShadow: `0 0 0 1px ${skin.border}`, transform: put(s.tab, -TAB.h) }}>
                  <Label tone={tone} strong size={TAB.type} x={(w - 6) / 2} y={(TAB.h - TAB.type * 1.25) / 2 + 1} align="center">{word}</Label>
                </div>
                {/* one shadow for the stack, under its back sheet: five would add up to a dark bloom */}
                <Card tone={tone} w={SHEET.w} h={SHEET.h} r={18} shadow={i === 0} style={{ boxShadow: `0 0 0 1px ${skin.border}`, borderRadius: 18 }}>
                  {i === n - 1 ? [0, 1, 2, 3, 4].map((j) => <Bar key={j} tone={tone} h={12} x={44} y={70 + 44 * j} w={(SHEET.w - 88) * (1 - 0.4 * rnd(j, 5))} k={tw(t, starts[i] + 0.35 + 0.1 * j, starts[i] + 0.75 + 0.1 * j, EASE.stroke)} />) : null}
                </Card>
              </div>
            );
          })}
        </div>
      ) : null}
      <Sfx name="riffle" at={from} />
      {starts.map((s, i) => <Sfx key={i} name="sheet-slide" at={s} gain={n > 6 ? -5 : 0} />)}
    </>
  );
};
export default SheetStack;
