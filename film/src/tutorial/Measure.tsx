// Measures the nodes a beat file names, in the rebuilt screens (tools/measure-boxes.mjs reads what this prints and
// writes clean/boxes.json). Per node: its box in recorded-viewport px, and what the framing and the cursor need that
// only the laid-out page knows: the box of its row, the box of its nearest group, and a spot inside it where a
// cursor's tip sits on no letters.
import React, { useEffect, useRef, useState } from 'react';
import { AbsoluteFill, useDelayRender } from 'remotion';
import { RecordedScreen } from '../RecordedScreen';
import type { Box } from './cameraAt';
import type { Measured } from './framing';
import { spotFor } from './spot';
import { BrowserBar } from '../moves/browser-bar/BrowserBar';
import { BarSpec, HERO, barMetrics } from '../moves/browser-bar/bar';

const box = (r: DOMRect): Box => ({ x: +r.left.toFixed(2), y: +r.top.toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2) });

/** The row a control sits in: its nearest ancestor that is a band around it (clearly wider, hardly taller) and not
 *  most of the window. */
function rowOf(e: Element, vw: number): Box | undefined {
  const r = e.getBoundingClientRect();
  for (let n = e.parentElement; n && n !== e.ownerDocument.body; n = n.parentElement) {
    const a = n.getBoundingClientRect();
    if (a.height > Math.max(2.5 * r.height, r.height + 40) || a.width > 0.6 * vw) return undefined;
    if (a.width >= 1.5 * r.width) return box(a);
  }
  return undefined;
}

/** The group it belongs to: its nearest ancestor that holds clearly more than its row and is under 60% of the window. */
function groupOf(e: Element, vw: number, vh: number): Box | undefined {
  const r = e.getBoundingClientRect();
  for (let n = e.parentElement; n && n !== e.ownerDocument.body; n = n.parentElement) {
    const a = n.getBoundingClientRect();
    if (a.width > 0.6 * vw || a.height > 0.8 * vh) return undefined;
    if (a.height >= 2.5 * r.height && a.width >= 1.2 * r.width) return box(a);
  }
  return undefined;
}

/** Where the control's own ink is: its text (a field's value included), its images and icons. */
function inkOf(e: HTMLElement): DOMRect[] {
  const doc = e.ownerDocument, view = doc.defaultView!, out: DOMRect[] = [];
  const walker = doc.createTreeWalker(e, 4 /* NodeFilter.SHOW_TEXT */);
  while (walker.nextNode()) {
    if (!(walker.currentNode as Text).data.trim()) continue;
    const range = doc.createRange();
    range.selectNodeContents(walker.currentNode);
    out.push(...range.getClientRects());
  }
  for (const m of e.querySelectorAll('img,svg,canvas,picture')) out.push(m.getBoundingClientRect());
  const value = 'value' in e && typeof (e as HTMLInputElement).value === 'string' ? (e as HTMLInputElement).value : '';
  if (value) {
    const cs = view.getComputedStyle(e), r = e.getBoundingClientRect(), ctx = doc.createElement('canvas').getContext('2d')!;
    ctx.font = cs.font;
    const w = Math.min(ctx.measureText(value).width, r.width), pl = parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft), pr = parseFloat(cs.borderRightWidth) + parseFloat(cs.paddingRight);
    const spare = Math.max(0, r.width - pl - pr - w), left = r.left + pl + (cs.textAlign === 'center' ? spare / 2 : cs.textAlign === 'right' || cs.textAlign === 'end' ? spare : 0), h = parseFloat(cs.fontSize) * 1.3;
    out.push(new DOMRect(left, r.top + r.height / 2 - h / 2, w, h));
  }
  return out;
}

/** A spot for the cursor's tip, as shares of the box: on the control, with the tip and the arrow's body (which hangs
 *  down and right of the tip) clear of the ink; which of the clear spots is spot.ts `spotFor` (beside the label). */
function spotOf(e: HTMLElement): [number, number] | undefined {
  const r = e.getBoundingClientRect();
  return spotFor({ w: r.width, h: r.height }, inkOf(e).map((k) => ({ x: k.left - r.left, y: k.top - r.top, w: k.width, h: k.height })));
}

export const measure = (e: HTMLElement, screen: number, node: number): Measured => {
  const view = e.ownerDocument.defaultView!, vw = view.innerWidth, vh = view.innerHeight;
  const row = rowOf(e, vw), group = groupOf(e, vw, vh), spot = spotOf(e);
  return { screen, node, ...box(e.getBoundingClientRect()), ...(row ? { row } : {}), ...(group ? { group } : {}), ...(spot ? { spot } : {}) };
};

/** `nodes`: name -> [screen, node id] (a beat file's `nodes`). `windows`: screen -> the node a shot shows as its
 *  window (tools/measure-boxes.mjs `windowsIn`): that screen is measured unclipped, as the film draws it. Prints `RT-BOXES:` + JSON { name: Measured }. */
export const Measure: React.FC<{ nodes: Record<string, [number, number]>; windows?: Record<number, number[]>;
  /** the film's browser bar, when it has one (tools/measure-boxes.mjs `barIn`): its hero bookmark is measured as
   *  "bar:hero", node -1, in the px of the screen it is over: above the page, so its y is negative */
  bar?: { screen: number; width: number; spec: BarSpec } | null }> = ({ nodes, windows = {}, bar = null }) => {
  const screens = [...new Set(Object.values(nodes).map(([s]) => s))];
  const { delayRender, continueRender } = useDelayRender();
  const [handle] = useState(() => delayRender('measure'));
  const got = useRef(new Map<number, Record<string, Measured>>());
  const [n, setN] = useState(0);
  const barAt = useRef<HTMLDivElement>(null), [hero, setHero] = useState<Record<string, Measured> | null>(bar ? null : {});
  useEffect(() => {
    if (!bar) return;
    let dead = false;
    (async () => {
      // the bar is set in the kit's face: its widths are real only once that has loaded
      for (let i = 0; i < 150 && !document.fonts.check('500 24px Geist'); i++) await new Promise((r) => setTimeout(r, 20));
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const e = barAt.current?.querySelector('[data-bar-hero]'), o = barAt.current?.getBoundingClientRect();
      if (dead || !e || !o) return;
      const r = e.getBoundingClientRect(), up = barMetrics(bar.width).height;
      // the tip goes under the label, on the bookmark: the label fills it, so there is no blank beside
      setHero({ [HERO]: { screen: bar.screen, node: -1, x: +(r.left - o.left).toFixed(2), y: +(r.top - o.top - up).toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2), spot: [0.6, 0.86] } });
    })();
    return () => { dead = true; };
  }, []);
  useEffect(() => {
    if (n < screens.length || !hero) return;
    console.log('RT-BOXES:' + JSON.stringify(Object.assign({}, ...screens.map((s) => got.current.get(s)), hero)));
    continueRender(handle);
  }, [n, hero]);
  return (
    <AbsoluteFill style={{ background: '#fff' }}>
      {bar ? <div ref={barAt} style={{ position: 'absolute', left: 0, top: 0, width: bar.width, height: barMetrics(bar.width).height }}><BrowserBar spec={bar.spec} width={bar.width} /></div> : null}
      {screens.map((s) => (
        <RecordedScreen
          key={s} screen={s} unclip={windows[s]} style={{ position: 'absolute', left: 0, top: 0 }}
          prepare={(doc, mirror) => {
            const boxes: Record<string, Measured> = {};
            for (const [name, [screen, node]] of Object.entries(nodes)) {
              const e = screen === s ? (mirror.getNode(node) as HTMLElement | null) : null;
              if (e?.getBoundingClientRect) boxes[name] = measure(e, screen, node);
            }
            got.current.set(s, boxes);
            setN(got.current.size);
          }}
        />
      ))}
    </AbsoluteFill>
  );
};
