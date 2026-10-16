import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { useDelayRender } from 'remotion';
import { rebuildIntoSandboxedIframe, createMirror, createCache } from 'rrweb-snapshot';
import { loadManifest, recordingUrl, viewportOf } from './recording';
import { holdExtent, keepLayer, unhide as display } from './tutorial/changes';
import { STILL_PAGE_CSS } from './css';

export type { Box } from './kit/chalkPath';
import type { Box } from './kit/chalkPath';

/** Screen `screen` of the prepared recording (clean/ of the public dir: see recording.ts), rebuilt in an iframe. `isolate`: show only that node and its subtree, on transparent.
 *  Either may be several nodes.
 *  `unclip`: those nodes are laid out as a document of their own: nothing above them clips or scrolls them, and the
 *  iframe grows to hold them, so their boxes are their full content (a beat file's `window`; Measure, Probe and Sweep
 *  rebuild such a screen the same way, so every box is in the same layout). With `isolate` as well, the element takes
 *  the colour the page gave the first of them (its own background, else its nearest ancestor's), so the window has no bare edge.
 *  `unhide`: nodes the capture holds hidden (display:none: a hover menu an `opens` with `unhide` shows) are displayed
 *  before anything is laid out or measured (tools/measure-boxes.mjs `unhidesIn`).
 *  `grounded`: the isolated nodes get that colour without being unclipped: they stay where the page laid them out, on
 *  their own ground instead of on transparent (an element a move lifts out of its screen: Template `lift`).
 *  The clean copy already holds the stand-ins (tools/scrub.mjs wrote them at prepare), so nothing is replaced here.
 *  `pageY`: the document is scrolled to this y once it is built, instead of where its capture has it (a `becomes`
 *  anchor: Measure measured it so scrolled, and reported the scroll it got).
 *  `extend`: the screen is rebuilt that many px taller than its recorded viewport (same width, same scroll): more
 *  of the page below the recorded window is laid out and drawn (a beat file's `extend`).
 *  `layer`: only the layer that holds these nodes (a dialog: its fixed host and backdrop) is shown, on transparent:
 *  the capture lies over another of the same page (changes.ts `keepLayer`).
 *  `prepare(doc, mirror)`: runs once after rebuild, before measuring.
 *  `write(doc, mirror)`: runs on every frame once the document is built (and before the first frame is released): the
 *  place to stage a state the recording did not capture as motion (a menu easing open, a pressed button). It must set
 *  everything it touches from the current frame alone, because frames render out of order.
 *  `boxOf` + `onMeasure`: reports that node's box in recorded-viewport CSS px.
 *  The element is always the screen's own recorded viewport size in CSS px; the parent scales it with a plain CSS transform.
 *  No zoom trick: Remotion screenshots each frame as a static page, and Chrome rasterises a static transformed layer
 *  (iframe content included) at its final scale, so text is crisp at 4x (checked: out/screen-sharp.png). */
export const RecordedScreen: React.FC<{
  screen: number; pageY?: number; extend?: number; layer?: number[]; isolate?: number | number[]; unclip?: number | number[]; unhide?: number[]; grounded?: boolean;
  prepare?: (doc: Document, mirror: any) => void; write?: (doc: Document, mirror: any) => void;
  boxOf?: number; onMeasure?: (b: Box) => void; style?: React.CSSProperties;
}> = ({ screen, pageY, extend, layer, isolate, unclip, unhide, grounded, prepare, write, boxOf, onMeasure, style }) => {
  const root = useRef<HTMLDivElement>(null);
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  // Held from the render that asks for a rebuild, the first or a later one (the screen becomes its next capture in
  // place: `becomes`, a sequence): an effect runs after the commit, and a frame on which this screen has just been
  // mounted or changed could otherwise be captured before the effect asks for the hold. Seen as a blank window, or
  // the new capture before anything was staged on it, for one frame.
  const want = `${screen}|${String(isolate)}|${String(unclip)}|${String(unhide)}|${boxOf}${pageY != null ? `|${pageY}` : ''}${extend ? `|+${extend}` : ''}${layer ? `|L${layer}` : ''}`;
  const hold = useRef<{ want: string; handle: number | null }>();
  if (hold.current?.want !== want) {
    if (hold.current?.handle != null) continueRender(hold.current.handle);   // (a render that never committed)
    hold.current = { want, handle: delayRender(`rebuild screen ${screen} (render)`) };
  }
  const cb = useRef({ prepare, write, onMeasure });
  cb.current = { prepare, write, onMeasure };
  const built = useRef<{ doc: Document; mirror: any }>();
  useLayoutEffect(() => { if (built.current) cb.current.write?.(built.current.doc, built.current.mirror); });

  useEffect(() => {
    const handle = hold.current?.handle ?? delayRender(`rebuild screen ${screen}`);
    if (hold.current) hold.current.handle = null;
    let iframe: HTMLIFrameElement | undefined, dead = false;
    (async () => {
      const rec = await loadManifest();
      // prepared screens name their assets `rostrum-asset:/<file>` (tools/prepare-recording.mjs): point those at the served copies
      const snap = JSON.parse((await (await fetch(recordingUrl(`screen-${screen}.json`))).text()).replaceAll('rostrum-asset:/', recordingUrl('assets/')));
      if (dead || !root.current) return;
      const { width, height: recorded } = viewportOf(rec, screen), height = recorded + (extend ?? 0);
      root.current.style.width = `${width}px`;
      root.current.style.height = `${height}px`;
      const mirror = createMirror();
      // The iframe is exactly the recorded viewport, so the page's media queries and layout see what was recorded.
      iframe = rebuildIntoSandboxedIframe(snap.node, {
        root: root.current, mirror, cache: createCache(),
        iframeAttributes: { width: String(width), height: String(height), scrolling: 'no', style: 'border:0;display:block;background:transparent' },
      }).iframe;
      const doc = iframe.contentDocument!;
      // The sandbox has no allow-scripts, and with scripting off Chrome (a) shows <noscript> content, which is what
      // rrweb turns every <script> into, and (b) lays a <canvas> out as its (empty) fallback content, so it has no box
      // and rrweb's own drawImage never shows. So: hide noscript, and swap each recorded canvas for an <img> of its pixels.
      const css = doc.createElement('style');
      // A frame is a still: no transitions, animations at their end, every scroll instant (css.ts STILL_PAGE_CSS).
      css.textContent = STILL_PAGE_CSS;
      doc.head.appendChild(css);
      const scrolled: any[] = [];
      (function walk(n: any) {
        if (n.attributes?.rr_scrollLeft || n.attributes?.rr_scrollTop) scrolled.push(n);
        if (n.tagName === 'canvas' && n.attributes?.rr_dataURL) {
          const canvas = mirror.getNode(n.id) as Element | null;
          if (canvas) {
            const img = doc.createElement('img');
            for (const a of canvas.attributes) img.setAttribute(a.name, a.value);
            img.src = n.attributes.rr_dataURL;
            canvas.replaceWith(img);
            mirror.replace(n.id, img);
          }
        }
        n.childNodes?.forEach(walk);
      })(snap.node);
      let keepCss: HTMLStyleElement | undefined;
      if (isolate != null) {
        const css = keepCss = doc.createElement('style');
        css.textContent = 'html,body{background:transparent!important} body *{visibility:hidden!important} [data-ct-keep],[data-ct-keep] *{visibility:visible!important}';
        doc.head.appendChild(css);
        for (const id of [isolate].flat()) (mirror.getNode(id) as Element | null)?.setAttribute('data-ct-keep', '');
      }
      // Polled from this document: the frame is sandboxed without allow-scripts, so its own events/promises are not relied on.
      // @imports inside inlined stylesheets load from the recording's assets; one that fails never gets a sheet, so the
      // wait is capped. Web fonts start loading only once a layout asks for them.
      const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));
      const imported = (s: CSSStyleSheet): boolean => { try { return [...s.cssRules].every((r) => !(r instanceof (doc.defaultView as any).CSSImportRule) || !!(r as CSSImportRule).styleSheet); } catch { return true; } };
      const sheets = () => [...doc.querySelectorAll<HTMLLinkElement>('link[rel~=stylesheet]')].every((l) => l.sheet) && [...doc.styleSheets].every(imported);
      for (let i = 0; !dead && !sheets() && i < 200; i++) await tick();
      doc.body.getBoundingClientRect();
      await tick(50);
      while (!dead && (doc.fonts.status === 'loading' || [...doc.images].some((i) => !i.complete))) await tick();
      const failed = [...doc.fonts].filter((f) => f.status === 'error').map((f) => `${f.family} ${f.weight}`);
      if (failed.length) console.warn(`RecordedScreen ${screen}: ${failed.length} font faces failed to load: ${[...new Set(failed)].join(', ')}`);
      // rrweb sets recorded scroll positions while it builds, before late stylesheets give the boxes their size: set them again.
      for (const n of scrolled) {
        const el = mirror.getNode(n.id) as Element | null;
        if (el) { el.scrollLeft = n.attributes.rr_scrollLeft ?? 0; el.scrollTop = n.attributes.rr_scrollTop ?? 0; }
      }
      const offset = snap.initialOffset;
      if (offset) iframe.contentWindow!.scrollTo(offset.left, offset.top);
      for (const id of unhide ?? []) { const e = mirror.getNode(id) as HTMLElement | null; if (e?.style) display(e); }
      if (pageY != null) iframe.contentWindow!.scrollTo(offset?.left ?? 0, pageY);
      const nodesOf = (ids?: number | number[]) => (ids != null ? [ids].flat() : []).map((id) => mirror.getNode(id) as HTMLElement | null).filter((e): e is HTMLElement => !!e);
      const wholes = nodesOf(unclip), alone = wholes.length ? wholes : grounded ? nodesOf(isolate) : [];
      let ground = '';
      if (alone.length) {
        // the colour the page gave it, read before anything is changed (the isolating sheet makes the page's own ground transparent)
        if (keepCss?.sheet) keepCss.sheet.disabled = true;
        for (const whole of alone) for (let a: HTMLElement | null = whole; a && !ground; a = a.parentElement) { const c = doc.defaultView!.getComputedStyle(a).backgroundColor; if (c && c !== 'transparent' && !/,\s*0\)$/.test(c)) ground = c; }
        if (keepCss?.sheet) keepCss.sheet.disabled = false;
      }
      if (wholes.length) {
        for (const whole of wholes) for (let a = whole.parentElement; a; a = a.parentElement) { a.scrollTop = 0; a.scrollLeft = 0; a.style.setProperty('overflow', 'visible', 'important'); }
        iframe.contentWindow!.scrollTo(0, 0);
        const bottom = Math.ceil(Math.max(...wholes.map((e) => e.getBoundingClientRect().bottom)));
        if (bottom > height) { iframe.setAttribute('height', String(bottom)); root.current.style.height = `${bottom}px`; }
      }
      if (isolate != null && ground) root.current.style.background = ground;
      if (layer) keepLayer(doc, mirror, layer);
      // (what is staged later never shrinks how far the page scrolls, so it stays at the scroll it was measured at)
      if (!wholes.length) holdExtent(doc);
      cb.current.prepare?.(doc, mirror);
      built.current = { doc, mirror };
      cb.current.write?.(doc, mirror);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      if (dead) return;
      const el = boxOf != null ? (mirror.getNode(boxOf) as Element | null) : null;
      if (el) { const r = el.getBoundingClientRect(); cb.current.onMeasure?.({ x: r.left, y: r.top, w: r.width, h: r.height }); }
      continueRender(handle);
    })().catch(cancelRender);
    return () => { dead = true; built.current = undefined; iframe?.remove(); continueRender(handle); };
  }, [screen, String(isolate), String(unclip), String(unhide), boxOf, pageY, extend, String(layer)]);

  return <div ref={root} style={style} />;
};
