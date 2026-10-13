// The browser bar as drawn (numbers: docs/moves/mockups/browser-bar/bar.css, direction D2). In the window's own px:
// `width` is the window's width; `out` 0..1 is how much of it has come out of the window's top edge (it is anchored
// to its bottom, so the bookmarks row comes first); `hover` and `press` 0..1 are the hero bookmark's states, driven by
// the cursor's click. Light stage tokens. The hero carries data-bar-hero so the Measure still can report its box.
import React from 'react';
import { Icon } from '../../kit/Icon';
import { TOKEN } from '../../kit/stage';
import { BarSpec, barMetrics } from './bar';

export { about } from './bar';

const C = { strip: 'oklch(0.928 0.014 272)', bar: 'oklch(0.974 0.007 272)', line: 'oklch(0.86 0.012 272)', well: 'oklch(0.938 0.011 272)' };
const rest = `color-mix(in oklab, ${TOKEN.ink} 68%, ${C.bar})`, tool = `color-mix(in oklab, ${TOKEN.ink} 70%, ${C.bar})`;
const row: React.CSSProperties = { display: 'flex', alignItems: 'center', boxSizing: 'border-box' };

export const BrowserBar: React.FC<{ spec: BarSpec; width: number; out?: number; hover?: number; press?: number }> = ({ spec, width, out = 1, hover = 0, press = 0 }) => {
  const m = barMetrics(width), u = m.u, px = (n: number) => `${(n * u).toFixed(3)}px`;
  const ic = (name: string, size: number, colour = TOKEN.soft) => <Icon name={name} size={size * u} colour={colour} stroke={2} />;
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width, height: m.height * out, overflow: 'hidden', fontFamily: TOKEN.font, color: TOKEN.ink, lineHeight: 1.2 }}>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: m.height, background: C.bar, borderBottom: `${px(1)} solid ${C.line}`, boxSizing: 'border-box' }}>
        <div style={{ ...row, height: m.tabs, padding: `0 ${px(16)}`, gap: px(14), alignItems: 'flex-end', background: C.strip }}>
          <div style={{ ...row, height: px(46), width: px(350), padding: `0 ${px(14)} 0 ${px(18)}`, gap: px(12), borderRadius: `${px(12)} ${px(12)} 0 0`, background: C.bar, fontSize: px(22), fontWeight: 500 }}>
            <i style={{ flex: 'none', width: px(18), height: px(18), borderRadius: '30%', background: `color-mix(in oklab, ${TOKEN.accent} 80%, ${TOKEN.card})` }} />
            <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{spec.title}</span>
            {ic('x', 18)}
          </div>
          <div style={{ alignSelf: 'center' }}>{ic('plus', 22)}</div>
        </div>
        <div style={{ ...row, height: m.tools, padding: `0 ${px(24)}`, gap: px(24) }}>
          {ic('arrow-left', 25, tool)}<span style={{ opacity: 0.45, display: 'flex' }}>{ic('arrow-right', 25, tool)}</span>{ic('rotate-cw', 25, tool)}
          <div style={{ ...row, flex: 1, height: px(46), padding: `0 ${px(20)}`, gap: px(12), borderRadius: px(23), background: C.well, fontSize: px(23) }}>{ic('lock', 18)}<span>{spec.host}</span></div>
          {ic('ellipsis-vertical', 25, tool)}
        </div>
        <div style={{ ...row, height: m.marks, padding: `0 ${px(12)} ${px(5)}`, gap: px(6), fontSize: px(24), fontWeight: 500 }}>
          {spec.bookmarks.map((b) => {
            const hero = b.label === spec.hero, on = hero ? Math.max(hover, press) : 0;
            return (
              <div key={b.label} {...(hero ? { 'data-bar-hero': '' } : {})} style={{ ...row, whiteSpace: 'nowrap', padding: `${px(9)} ${px(14)}`, gap: px(11), borderRadius: px(10), color: hero ? TOKEN.ink : rest,
                background: on > 0.001 ? `color-mix(in oklab, ${TOKEN.ink} ${(7 * hover + 7 * press).toFixed(2)}%, transparent)` : 'transparent', scale: hero && press > 0.0005 ? (1 - 0.025 * press).toFixed(4) : undefined }}>
                {ic(b.icon, 22, hero ? TOKEN.ink : TOKEN.soft)}<span>{b.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
