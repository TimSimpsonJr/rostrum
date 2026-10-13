import React from 'react';
import { Card, Hairline, Label } from '../../kit/atoms';
import { Sfx } from '../../kit/sound';
import type { MoveProps } from '../contract';
import { CAPTION, DOWN, LAG, PANE, fitOf, paneOf, splitAt } from './move.ts';
import type { Inputs } from './move.ts';

const HEAD = PANE.pad + CAPTION * 2;   // the caption's strip at the pane's top

const Split: React.FC<MoveProps<Inputs>> = ({ t, from, to, inputs, tone, place, lift }) => {
  const { up, down } = splitAt(from, to, t), top = paneOf(0).y;
  return (
    <>
      {([0, 1] as const).map((i) => {
        const k = up[i] * (1 - down), name = i ? inputs.after : inputs.before;
        if (k <= 0) return null;
        // (the box is used for its shape only: where the element is on the frame does not matter here)
        const pane = paneOf(i), box = place(name) ?? { w: 4, h: 3 }, w = fitOf(box), h = (w * box.h) / box.w;
        return (
          <Card key={i} tone={tone} x={pane.x} y={pane.y + 30 * (1 - k)} w={pane.w} h={pane.h} style={{ opacity: Math.min(1, 8 * k) }}>{/* solid within a few frames: the screen's text is never read through a pane's */}
            <Label tone={tone} size={CAPTION} x={PANE.pad} y={PANE.pad - 8}>{i ? 'After' : 'Before'}</Label>
            <div style={{ position: 'absolute', left: (pane.w - w) / 2, top: HEAD + (pane.h - HEAD - PANE.pad - h) / 2, width: w, height: h, overflow: 'hidden', borderRadius: 10 }}>{lift(name, w)}</div>
          </Card>
        );
      })}
      {up[1] > 0 && down < 1 ? <div style={{ position: 'absolute', inset: 0, opacity: 1 - down }}><Hairline tone={tone} from={{ x: 960, y: top }} to={{ x: 960, y: top + PANE.h }} k={up[1]} /></div> : null}
      <Sfx name="paper-slide" at={from} />
      <Sfx name="paper-slide" at={from + LAG} />
      <Sfx name="pat-medium" at={to - DOWN} />
    </>
  );
};
export default Split;
