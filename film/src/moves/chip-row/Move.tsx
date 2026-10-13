import React from 'react';
import { Card, Label } from '../../kit/atoms';
import { lerp } from '../../kit/ease';
import { Sfx } from '../../kit/sound';
import { TONES } from '../../kit/stage';
import type { MoveProps } from '../contract';
import { CHIP, HERO, chipAt, chipWidth, heroAt, slotsOf, startsOf } from './move.ts';
import type { Inputs } from './move.ts';

// The hero is there from the start of the run, in the middle; it moves aside once, and the chips rise in beside it.
// (In a film `each` has reached the move as seconds: about.cues.)
const ChipRow: React.FC<MoveProps<Inputs>> = ({ t, from, to, inputs, tone, line }) => {
  const slots = slotsOf(inputs.items.length, chipWidth(inputs.items)), starts = startsOf(inputs.items.length, from, inputs.each as number[] | undefined);
  // (the hero stands in the middle from the line's start: with an `at` cue it is looked at before it moves)
  const g = heroAt(from, t), out = chipAt(from, to, t).out, on = chipAt(Math.min(from, line.start) - 0.3, to, t).k;
  if (on <= 0 || out >= 1) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: 1 - out }}>
      <Card tone={tone} x={lerp(slots.start.x, slots.hero.x, g)} y={slots.hero.y} w={HERO.w} h={HERO.h} style={{ opacity: on }}>
        <div style={{ position: 'absolute', inset: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', fontSize: 32, lineHeight: 1.25, fontWeight: 600, letterSpacing: '-0.012em', color: TONES[tone].ink }}>{inputs.hero}</div>
      </Card>
      {slots.chips.map((c, i) => {
        const { k } = chipAt(starts[i], to, t);
        return k <= 0 ? null : (
          <Card key={i} tone={tone} x={c.x} y={c.y + 12 * (1 - k)} w={c.w} h={c.h} r={16} style={{ opacity: k }}>
            <Label tone={tone} strong size={CHIP.size} x={c.w / 2} y={(c.h - CHIP.size * 1.25) / 2} align="center">{inputs.items[i]}</Label>
          </Card>
        );
      })}
      <Sfx name="pat-medium" at={from} />
      {starts.map((s, i) => <Sfx key={i} name="pat-small" at={s} />)}
    </div>
  );
};
export default ChipRow;
