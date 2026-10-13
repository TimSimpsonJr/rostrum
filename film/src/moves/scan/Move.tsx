import React from 'react';
import { lerp, mix, place as put } from '../../kit/ease';
import { Sfx } from '../../kit/sound';
import { H, TONES, W } from '../../kit/stage';
import type { MoveProps } from '../contract';
import { scanAt } from './move.ts';
import type { Inputs } from './move.ts';

const BAND = 120;   // px: the soft band's width (a cone's window is as wide as the element is tall, within reason)

const Scan: React.FC<MoveProps<Inputs>> = ({ t, from, to, inputs, place }) => {
  const { k, dim } = scanAt(from, to, t);
  const box = (inputs.target ? place(inputs.target) : null) ?? { x: 0, y: 0, w: W, h: H }, whole = box.w >= W;
  const cone = inputs.kind === 'cone', r = cone ? Math.max(90, Math.min(260, 0.7 * box.h)) : BAND / 2;
  // the light's centre, in the element's own px: it comes on from beyond the left edge and leaves beyond the right
  const x = lerp(-r, box.w + r, k), y = box.h / 2;
  // what dims is the dark ink whatever the stage: a light page and a dark one both go down, never up
  const shade = mix('transparent', TONES.light.ink, 0.2 * dim), glow = mix('transparent', TONES.light.card, 0.34 * dim);
  // the hole in the dimming is a mask on the fixed layer (nothing that is masked moves; only the gradient's stops do)
  const hole = cone
    ? `radial-gradient(circle ${r.toFixed(2)}px at ${x.toFixed(2)}px ${y.toFixed(2)}px, transparent 0%, transparent 45%, #000 100%)`
    : `linear-gradient(90deg, #000 ${(x - r).toFixed(2)}px, transparent ${(x - 0.2 * r).toFixed(2)}px, transparent ${(x + 0.2 * r).toFixed(2)}px, #000 ${(x + r).toFixed(2)}px)`;
  const light = cone
    ? `radial-gradient(circle ${r.toFixed(2)}px at ${x.toFixed(2)}px ${y.toFixed(2)}px, ${glow} 0%, transparent 70%)`
    : `linear-gradient(90deg, transparent ${(x - r).toFixed(2)}px, ${glow} ${x.toFixed(2)}px, transparent ${(x + r).toFixed(2)}px)`;
  const layer: React.CSSProperties = { position: 'absolute', left: 0, top: 0, width: box.w, height: box.h, borderRadius: whole ? 0 : 10, transform: put(box.x, box.y) };
  return (
    <>
      {dim > 0 ? (
        <>
          <div style={{ ...layer, background: shade, maskImage: hole, WebkitMaskImage: hole }} />
          <div style={{ ...layer, backgroundImage: light }} />
        </>
      ) : null}
      <Sfx name="whoosh-pass" at={from} />
    </>
  );
};
export default Scan;
