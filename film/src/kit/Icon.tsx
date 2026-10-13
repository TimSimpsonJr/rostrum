// The kit's icons: one brand-neutral line set, drawn by name (Lucide, the `lucide-static` package: ISC, with some
// icons from Feather under MIT; the licence text is film/src/kit/ICONS-LICENSE.txt). The path data is bundled from
// node_modules, so a film needs no icon file of its own and renders offline. The names are the set's own
// (`helper.mjs icons <a word>` lists them).
// ponytail: the whole set's path data (0.8 MB of JSON) rides in every bundle; if bundling slows, have the measure
// step write only the icons a beat file names into the tutorial's film/kit/ and read those.
import React from 'react';
import nodes from 'lucide-static/icon-nodes.json';

type IconNode = [string, Record<string, string>][];
const SET = nodes as unknown as Record<string, IconNode>;

export const hasIcon = (name: string) => Object.prototype.hasOwnProperty.call(SET, name);

/** One icon at `size` px square, in one colour. `stroke`: the line's weight in the set's own units (its grid is 24
 *  wide; the set draws at 2). Nothing is drawn for a name the set does not have: the build stops on those first. */
export const Icon: React.FC<{ name: string; size: number; colour: string; stroke?: number }> = ({ name, size, colour, stroke = 2 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={colour} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block', flex: 'none', color: colour }}>
    {(hasIcon(name) ? SET[name] : []).map(([tag, attrs], i) => React.createElement(tag, { key: i, ...attrs }))}
  </svg>
);
