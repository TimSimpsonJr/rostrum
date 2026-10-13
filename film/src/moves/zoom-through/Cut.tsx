import React from 'react';
import { Sfx } from '../../kit/sound';
import { H, W } from '../../kit/stage';
import type { CutProps } from '../contract';
import { FILL, zoomAt } from './move.ts';
import type { Inputs } from './move.ts';

const frame: React.CSSProperties = { position: 'absolute', left: 0, top: 0, width: W, height: H };

const ZoomThrough: React.FC<CutProps<Inputs>> = ({ k, at, dur, inputs, outgoing, incoming, place }) => {
  // (a name with no box, or a cut out of a scene: into the middle of the frame)
  const box = place(inputs.through) ?? { x: W / 2 - 200, y: H / 2 - 60, w: 400, h: 120 };
  const z = zoomAt(k, box), bx = box.x + box.w / 2, by = box.y + box.h / 2;
  return (
    <>
      {outgoing && z.out.on ? (
        // the blur is on a layer the size of the frame; the shot grows inside it about the element's own middle
        <div style={{ ...frame, overflow: 'hidden', ...(z.out.blur > 0.05 ? { filter: `blur(${z.out.blur.toFixed(2)}px)` } : null) }}>
          <div style={{ ...frame, transformOrigin: '0 0', transform: `translate(${(z.out.cx - z.out.scale * bx).toFixed(3)}px, ${(z.out.cy - z.out.scale * by).toFixed(3)}px) scale(${z.out.scale.toFixed(5)})` }}>{outgoing}</div>
        </div>
      ) : null}
      {incoming && z.into.on ? <div style={{ ...frame, transformOrigin: '50% 50%', transform: `scale(${z.into.scale.toFixed(5)})`, opacity: z.into.opacity }}>{incoming}</div> : null}
      <Sfx name="whoosh-cut" at={at + FILL * dur - 0.4} />
    </>
  );
};
export default ZoomThrough;
