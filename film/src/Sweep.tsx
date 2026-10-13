// The sensitive-value sweep's eyes (tools/sweep.mjs reads what this prints). It rebuilds screens of the clean copy
// exactly as the film does (same RecordedScreen, no rules: the stand-ins are already in the clean copy), then reports
// what each document would show: every text node in order (so the tool can also look across node boundaries), every
// form value, and every attribute that is not structure. It also measures the boxes the film stages from. Nothing is judged
// here; the page never sees the originals.
import React, { useEffect, useRef, useState } from 'react';
import { AbsoluteFill, useDelayRender } from 'remotion';
import { RecordedScreen } from './RecordedScreen';
import { recordingUrl } from './recording';
import { isStructuralAttr } from './standins';
import { cssParts, cssValues, isAssetValue } from './css';

/** `via` (which kind of stand-in wrote a node) is not known here: tools/sweep.mjs adds it from clean/changed.json. */
export type Seen = { id: number; kind: string; s: string; p?: number; hidden?: true; via?: string; svg?: true; parts?: string[] };

/** What the document would show. `hidden`: not laid out or not visible as recorded (the film only ever hides more).
 *  Text is every text node under <body>, whatever its namespace: a chart drawn as SVG (text, tspan, title, its HTML
 *  tooltips and legends) is read like any other text (`svg` marks it, so the tool can say what charts held).
 *  A select is read twice: its value, and the text of the option it shows. */
export function collect(doc: Document, mirror: { getId(n: Node): number }): Seen[] {
  const out: Seen[] = [], assets = recordingUrl('assets/');
  const hidden = (el: Element | null) => (el && (el as any).checkVisibility({ checkVisibilityCSS: true }) ? {} : { hidden: true as const });
  const w = doc.createTreeWalker(doc.body, 4 /* NodeFilter.SHOW_TEXT */);
  while (w.nextNode()) {
    const t = w.currentNode as Text;
    if (!t.data || t.parentElement?.closest('script,style,noscript')) continue;
    // (`p`: the element the text stands in, so the tool can tell whose text it is: rules.json `allow` names elements)
    out.push({ id: mirror.getId(t), kind: 'text', s: t.data, ...(t.parentElement ? { p: mirror.getId(t.parentElement) } : {}), ...hidden(t.parentElement), ...(t.parentElement?.closest('svg') ? { svg: true as const } : {}) });
  }
  for (const el of doc.body.querySelectorAll('*')) {
    const id = mirror.getId(el), h = hidden(el);
    if (el.matches('input:not([type=hidden]),textarea,select')) out.push({ id, kind: 'value', s: (el as HTMLInputElement).value ?? '', ...h });
    if (el instanceof (doc.defaultView as any).HTMLSelectElement) for (const o of (el as HTMLSelectElement).selectedOptions) out.push({ id, kind: 'value', s: o.textContent ?? '', ...h });
    // every attribute that is not structure (the scrub's allow-list), shown or not, unless it really is an asset (the
    // scrub's own test: css.ts); of a style, the values of its declarations in full (property names are not values)
    for (const a of el.attributes) {
      if (!a.value || isStructuralAttr(a.name) || isAssetValue(a.value, assets)) continue;
      const v = a.name === 'style' ? cssValues(a.value, assets, true) : a.value;
      if (v) out.push({ id, kind: `attr:${a.name}`, s: v, ...h });
    }
  }
  // stylesheets (a <style>, or one rrweb inlined): what css.ts `cssValues` reads of them (strings, custom property
  // values, whatever in a declaration is not CSS structure). Counted as showing: `content: "..."` puts text on the page.
  for (const st of doc.querySelectorAll('style')) {
    const id = mirror.getId(st);
    if (id == null || id < 0) continue; // the two this film adds itself (RecordedScreen)
    // (`parts`: the same values declaration by declaration, for the tool's stripped comparison: css.ts `cssParts`)
    const parts = cssParts(st.textContent ?? '', assets);
    if (parts.length) out.push({ id, kind: 'css', s: parts.join(' '), parts });
  }
  return out;
}

/** `nodes`: name -> [screen, node id] to measure. `windows`: the screens laid out as a window (`unclip`). `isolate`:
 *  the screens the film shows only as a window, and the nodes that show of each (tools/sweep.mjs `isolatedIn`): built
 *  as Camera builds a windowed shot, so everything else is `visibility:hidden` and is reported `hidden`. A stylesheet
 *  is still reported as showing whatever it applies to. */
export const Sweep: React.FC<{ screens: number[]; nodes?: Record<string, [number, number]>; windows?: Record<number, number[]>; isolate?: Record<number, number[]> }> = ({ screens, nodes = {}, windows = {}, isolate = {} }) => {
  const { delayRender, continueRender } = useDelayRender();
  const [handle] = useState(() => delayRender('sweep'));
  const got = useRef(new Map<number, { seen: Seen[]; boxes: Record<string, object> }>());
  const [n, setN] = useState(0);
  useEffect(() => {
    if (n < screens.length) return;
    console.log('RT-SWEEP:' + JSON.stringify({ screens: screens.map((s) => ({ screen: s, ...got.current.get(s)! })) }));
    continueRender(handle);
  }, [n]);
  return (
    <AbsoluteFill style={{ background: '#fff' }}>
      {screens.map((s) => (
        <RecordedScreen
          key={s} screen={s} isolate={isolate[s]} unclip={windows[s]} style={{ position: 'absolute', left: 0, top: 0 }}
          prepare={(doc, mirror) => {
            const boxes: Record<string, object> = {};
            for (const [name, [screen, node]] of Object.entries(nodes)) {
              if (screen !== s) continue;
              const r = (mirror.getNode(node) as Element | null)?.getBoundingClientRect();
              if (r) boxes[name] = { screen, node, x: r.left, y: r.top, w: r.width, h: r.height };
            }
            got.current.set(s, { seen: collect(doc, mirror), boxes });
            setN(got.current.size);
          }}
        />
      ))}
    </AbsoluteFill>
  );
};
