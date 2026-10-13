import React from 'react';
import { Card, Label } from '../../kit/atoms';
import { place as put } from '../../kit/ease';
import { Sfx } from '../../kit/sound';
import { TONES } from '../../kit/stage';
import type { MoveProps } from '../contract';
import { AFTER, CARD_H, TYPE, cardW, pinAt, runAt } from './move.ts';
import type { Inputs } from './move.ts';

const DISC = 18;   // px (the plan's 14 is lost beside a screen framed close)

const Pin: React.FC<MoveProps<Inputs>> = ({ t, from, to, inputs, tone, accent, place }) => {
  const r = runAt(from, to, t), box = t >= from && r.gone < 1 ? place(inputs.target) : null;
  const w = cardW(inputs.text), at = box && pinAt(box, w), skin = TONES[tone];
  return (
    <>
      {at ? (
        <div style={{ position: 'absolute', inset: 0, opacity: 1 - r.gone }}>
          {r.out > 0 ? (
            // the card slides out from under the pin's side, uncovered as it comes (a wipe on a holder that does not move)
            <div style={{ position: 'absolute', left: 0, top: 0, width: w + 80, height: CARD_H + 120, transform: put(at.card.x - 40, at.card.y - 40), clipPath: at.way > 0 ? `inset(0 ${((1 - r.out) * 100).toFixed(2)}% 0 0)` : `inset(0 0 0 ${((1 - r.out) * 100).toFixed(2)}%)` }}>
              <Card tone={tone} x={40 - at.way * 26 * (1 - r.out)} y={40} w={w} h={CARD_H} r={16}>
                <Label tone={tone} strong size={TYPE} x={w / 2} y={(CARD_H - TYPE * 1.25) / 2} align="center">{inputs.text}</Label>
              </Card>
            </div>
          ) : null}
          <div style={{ position: 'absolute', left: 0, top: 0, width: DISC, height: DISC, borderRadius: DISC, background: accent, boxShadow: `0 0 0 3px ${skin.card}, 0 4px 10px oklch(0.3 0.08 272 / 0.35)`, transform: put(at.pin.x - DISC / 2, at.pin.y - DISC / 2 - 40 * (1 - r.drop)), opacity: Math.min(1, r.drop * 4) }} />
        </div>
      ) : null}
      <Sfx name="pin-place" at={from} />
      <Sfx name="pat-small" at={from + AFTER} />
    </>
  );
};
export default Pin;
