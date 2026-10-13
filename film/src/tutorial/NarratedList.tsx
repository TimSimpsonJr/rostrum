// A narrated list on the frame (when it plays: list.ts): the items as large type in the title card's face and
// weight, one to a row, each after its icon; rows left-aligned, the block centred in the frame. One ink for the type,
// one accent for the icons. No bullets, numbers, boxes, rules or labels: the type and the icon are all there is.
// Every row is laid out from the first frame (unseen until its word), so nothing moves when a later item comes.
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { place } from '../kit/ease';
import { Icon } from '../kit/Icon';
import { H, TONES, W } from '../kit/stage';
import type { Tone } from '../kit/stage';
import { ListPlay, listItem } from './list';

const LEADING = 1.5;      // a row's pitch, in type sizes
const RISE = 22;          // px an item rises as it sets, and on as it leaves

/** The type's size: the title card's 116 is for one line alone; a list sets smaller, so that its longest row takes
 *  a little over half the frame's width and its rows no more than about six tenths of the height. */
export const listSize = (items: { text: string }[]) => {
  const longest = Math.max(...items.map((i) => i.text.length));
  return Math.round(Math.max(44, Math.min(96, (0.56 * W) / (0.5 * longest + 1.3), (0.62 * H) / (items.length * LEADING))));
};

/** `t`: film seconds. `accent`: the icons' colour (the brand's; without one, the kit's for the tone). `tone`: the stage it sets on. */
export const NarratedList: React.FC<{ play: ListPlay; t: number; accent?: string | null; tone?: Tone }> = ({ play, t, accent, tone = 'light' }) => {
  const size = listSize(play.items);
  return (
    <AbsoluteFill style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', fontSize: size, fontWeight: 300, letterSpacing: '-0.03em', color: TONES[tone].ink, transform: place(0, -8) }}>
        {play.items.map((it, i) => {
          const { o, dy } = listItem(play, i, t);
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.42em', height: `${LEADING}em`, lineHeight: `${LEADING}em`, whiteSpace: 'nowrap', opacity: o, transform: place(0, RISE * dy) }}>
              {/* the set's tallest icons (20 of its 24 units, plus the line) stand from the type's baseline to its cap
                  line, centred on the capitals; the line is a little lighter than the type's stems, never heavier */}
              <div style={{ flex: 'none', transform: place(0, -0.012 * size) }}><Icon name={it.icon} size={0.8 * size} stroke={1.75} colour={accent ?? TONES[tone].accent} /></div>
              <span>{it.text}</span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
