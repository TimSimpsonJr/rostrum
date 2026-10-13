import React from 'react';
import { morphRect, place as put } from '../../kit/ease';
import { Sfx } from '../../kit/sound';
import { liftShadow } from '../../kit/stage';
import type { MoveProps } from '../contract';
import { heroOf, liftAt } from './move.ts';
import type { Inputs } from './move.ts';

const LiftOut: React.FC<MoveProps<Inputs>> = ({ t, from, to, inputs, tone, place, lift }) => {
  const k = liftAt(from, to, t), box = k > 0 ? place(inputs.node) : null;
  // the element is drawn once, at the size it stands at when out, and the whole of it (ground, shadow, corners) is
  // scaled down to wherever it is between its place on the page and there: a transform, so it moves by sub-pixels
  const hero = box && heroOf(box, inputs.strength), r = box && hero && morphRect(box, hero, k);
  return (
    <>
      {hero && r ? (
        <div style={{ position: 'absolute', left: 0, top: 0, width: hero.w, height: hero.h, transformOrigin: '0 0', transform: put(r.x, r.y, `scale(${(r.w / hero.w).toFixed(5)})`) }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: 14, boxShadow: liftShadow(tone), opacity: k }} />
          <div style={{ position: 'absolute', inset: 0, borderRadius: 14, overflow: 'hidden' }}>{lift(inputs.node, hero.w)}</div>
        </div>
      ) : null}
      <Sfx name="paper-slide" at={from} />
      <Sfx name="pat-medium" at={to} />
    </>
  );
};
export default LiftOut;
