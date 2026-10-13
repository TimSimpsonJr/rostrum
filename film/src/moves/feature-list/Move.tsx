import React from 'react';
import { Label } from '../../kit/atoms';
import { place } from '../../kit/ease';
import { Icon } from '../../kit/Icon';
import { Sfx } from '../../kit/sound';
import { TONES } from '../../kit/stage';
import type { MoveProps } from '../contract';
import { MARK, SIZE, columnOf, itemAt, startsOf, yOf } from './move.ts';
import type { Inputs } from './move.ts';

// (In a film `each` has reached the move as seconds: about.cues.)
const FeatureList: React.FC<MoveProps<Inputs>> = ({ t, from, to, inputs, tone, accent }) => {
  const n = inputs.items.length, starts = startsOf(n, from, inputs.each as number[] | undefined), x = columnOf(inputs).x;
  return (
    <>
      {inputs.items.map((s, i) => {
        const { k, out } = itemAt(starts[i], to, t), y = yOf(n, i) + 12 * (1 - k);
        if (k <= 0 || out >= 1) return null;
        return (
          <div key={i} style={{ position: 'absolute', left: 0, top: 0, opacity: k * (1 - out), transform: place(x, y) }}>
            {inputs.checks ? <div style={{ position: 'absolute', left: 0, top: (SIZE * 1.25 - 34) / 2 }}><Icon name="check" size={34} colour={accent} stroke={2.4} /></div> : null}
            <Label tone={tone} size={SIZE} x={inputs.checks ? MARK : 0} y={0} style={{ color: TONES[tone].ink }}>{s}</Label>
          </div>
        );
      })}
      {starts.map((s, i) => <Sfx key={i} name="pat-small" at={s} />)}
    </>
  );
};
export default FeatureList;
