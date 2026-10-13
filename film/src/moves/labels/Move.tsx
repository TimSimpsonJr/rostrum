import React from 'react';
import { Card, Label } from '../../kit/atoms';
import { Sfx } from '../../kit/sound';
import { TONES } from '../../kit/stage';
import type { MoveProps } from '../contract';
import { RISE, SIZE, apart, beside, labelAt, startsOf, widthOf } from './move.ts';
import type { Inputs } from './move.ts';

const PAD = 14, H = 40;   // (the keycaps' side padding and corner; low enough that labels on neighbouring rows of a form stand 12 px apart)

// Each label is on a small ground of the stage's card colour: bare type over a page of type cannot be read, and on the
// dark stage the type is light over a light page. It is quieter than the page it annotates: the kit label's plain
// weight, 24 px. It stands at its element's side first (fields named in a column: above one is over the next), and
// never within 12 px of another label (`apart`). (In a film `each` has reached the move as seconds: about.cues.)
const Labels: React.FC<MoveProps<Inputs>> = ({ t, from, to, inputs, tone, place }) => {
  const starts = startsOf(inputs.items.length, from, inputs.each as number[] | undefined);
  // (every label's place is settled from all of them, shown or not, so none shifts when a later one sets)
  const shown = inputs.items.map((it) => { const box = place(it.target), w = widthOf(it.text) + 2 * PAD; if (!box) return null; const c = beside(box, w, H, 12, true); return { x: c.x - w / 2, y: c.y - H / 2, w, h: H }; });
  const rects = apart(shown.filter((r) => !!r));
  let n = 0;
  return (
    <>
      {inputs.items.map((it, i) => {
        const r = shown[i] ? rects[n++] : null, { k, out } = labelAt(starts[i], to, t);
        if (!r || k <= 0 || out >= 1) return null;
        return (
          <Card key={i} tone={tone} x={r.x} y={r.y + RISE * (1 - k)} w={r.w} h={H} r={12} style={{ opacity: k * (1 - out) }}>
            <Label tone={tone} size={SIZE} x={r.w / 2} y={(H - SIZE * 1.25) / 2} align="center" style={{ color: TONES[tone].ink }}>{it.text}</Label>
          </Card>
        );
      })}
      {starts.map((s, i) => <Sfx key={i} name="pat-small" at={s} />)}
    </>
  );
};
export default Labels;
