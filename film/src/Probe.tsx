// Where every element of a clean screen is (tools/gestures.mjs reads what this prints, to say what a gesture encloses).
// It rebuilds the screens exactly as the film does and reports node ids and boxes only: no text leaves the page here
// (the labels a gesture is given come from the clean tree, through tools/scrub.mjs `elementsIn`).
// An element is reported when it shows as recorded: laid out, visible, not transparent, and not covered at its centre
// by something that is no part of it (the page behind an open dialog's backdrop is not something a pointer circles).
import React, { useEffect, useRef, useState } from 'react';
import { AbsoluteFill, useDelayRender } from 'remotion';
import { RecordedScreen } from './RecordedScreen';

type Box = { x: number; y: number; w: number; h: number };

export function boxesOf(doc: Document, mirror: { getId(n: Node): number }): Record<number, Box> {
  const view = doc.defaultView!, vw = view.innerWidth, vh = view.innerHeight, out: Record<number, Box> = {};
  for (const el of doc.body.querySelectorAll('*')) {
    const id = mirror.getId(el);
    if (id == null || id < 0 || !(el as any).checkVisibility({ checkVisibilityCSS: true, checkOpacity: true })) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (cx >= 0 && cy >= 0 && cx < vw && cy < vh) { // only what is in the window can be asked what covers it
      const top = doc.elementFromPoint(cx, cy);
      if (top && !el.contains(top) && !top.contains(el)) continue;
    }
    out[id] = { x: +r.left.toFixed(1), y: +r.top.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
  }
  return out;
}

/** The look of the recorded site, for a film with no brand of its own (style only, no text): `accent` = the
 *  background colour most of its filled buttons share (none when it has no coloured button), `font` = the first family
 *  of the page's body. */
export function lookOf(doc: Document): { accent: string | null; font: string | null } {
  const view = doc.defaultView!, count = new Map<string, number>();
  for (const el of doc.body.querySelectorAll('button, [role="button"], input[type="submit"], a[class*="btn"], a[class*="button"]')) {
    const m = /^rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)$/.exec(view.getComputedStyle(el).backgroundColor);
    if (!m || (m[4] != null && Number(m[4]) < 0.9)) continue;
    const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (Math.max(r, g, b) - Math.min(r, g, b) < 40) continue; // white, grey or black is no accent
    const hex = '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
    count.set(hex, (count.get(hex) ?? 0) + 1);
  }
  const accent = [...count].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const font = view.getComputedStyle(doc.body).fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, '') || null;
  return { accent, font };
}

/** Prints `RT-PROBE:` + JSON { <screen>: { boxes: { <node id>: { x, y, w, h } }, look: { accent, font } } }, boxes in recorded-viewport px. */
export const Probe: React.FC<{ screens: number[]; windows?: Record<number, number[]> }> = ({ screens, windows = {} }) => {
  const { delayRender, continueRender } = useDelayRender();
  const [handle] = useState(() => delayRender('probe'));
  const got = useRef(new Map<number, { boxes: Record<number, Box>; look: { accent: string | null; font: string | null } }>());
  const [n, setN] = useState(0);
  useEffect(() => {
    if (n < screens.length) return;
    console.log('RT-PROBE:' + JSON.stringify(Object.fromEntries(screens.map((s) => [s, got.current.get(s)]))));
    continueRender(handle);
  }, [n]);
  return (
    <AbsoluteFill style={{ background: '#fff' }}>
      {screens.map((s) => (
        <RecordedScreen key={s} screen={s} unclip={windows[s]} style={{ position: 'absolute', left: 0, top: 0 }} prepare={(doc, mirror) => { got.current.set(s, { boxes: boxesOf(doc, mirror), look: lookOf(doc) }); setN(got.current.size); }} />
      ))}
    </AbsoluteFill>
  );
};
