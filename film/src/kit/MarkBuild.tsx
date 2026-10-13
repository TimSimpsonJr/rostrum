// A brand's mark building on the end card (brand.json `mark.build`; the timing is markTiming.ts). The mark file's own
// SVG is set inline, in BrandMark's box, and each frame is a fresh copy of it with dashes, visibility and offsets set
// as a pure function of the time: nothing is kept between frames, so frames render in any order. Nothing is redrawn
// or recoloured: the strokes are the file's, and once a part has landed it is not touched at all.
import React, { useMemo } from 'react';
import { lerp, place } from './ease';
import { W } from './stage';
import { buildPlan, lineAt, partAt } from './markTiming.ts';

/** brand.json `mark.build`: `parts` selects the mark's stroked parts in order; `from` is the index the build spreads
 *  out from (default: the part holding `line`, else 0); `line` and `fill` (both or neither) name a hidden centreline
 *  and the filled shape it stands for. */
export type BuildSpec = { parts: string; from?: number; line?: string; fill?: string };
export type Build = { svg: string; parts: string; from: number; line?: string; fill?: string; n: number; unit: number };

const GEO = 'path, line, polyline, polygon, rect, circle, ellipse';
const parse = (svg: string) => new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
const all = (el: Element, sel: string) => { try { return [...el.querySelectorAll(sel)]; } catch { return []; } };

/** The build of a mark file, or null when it cannot be built (not an SVG, no viewBox, fewer than two parts, a line
 *  without its fill): the end card then sets the mark the plain way. `width`: the mark's width on the frame. */
export function readBuild(svg: string, spec: BuildSpec | undefined, width: number): Build | null {
  if (!spec || typeof spec.parts !== 'string' || typeof DOMParser === 'undefined') return null;
  const root = parse(svg), vb = (root.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number);
  if (root.localName !== 'svg' || !(vb[2] > 0)) return null;
  const parts = all(root, spec.parts), line = spec.line ? all(root, spec.line)[0] : null, fill = spec.fill ? all(root, spec.fill)[0] : null;
  if (parts.length < 2 || !!spec.line !== !!spec.fill || (spec.line && (!line || !fill))) return null;
  const from = Number.isInteger(spec.from) ? spec.from! : Math.max(0, parts.findIndex((p) => line && p.contains(line)));
  if (from < 0 || from >= parts.length) return null;
  return { svg, parts: spec.parts, from, n: parts.length, unit: vb[2] / width, ...(line ? { line: spec.line, fill: spec.fill } : {}) };
}

function dash(p: Element, k: number) {
  if (k <= 0) return p.setAttribute('visibility', 'hidden');
  p.setAttribute('pathLength', '1');
  p.setAttribute('stroke-dasharray', '1 1');
  p.setAttribute('stroke-dashoffset', (1 - Math.min(k, 0.9999)).toFixed(5));
}

/** The mark `u` seconds into its build, as markup. `unit`: the file's units per frame px. */
function frame(root: Element, b: Build, u: number) {
  const svg = root.cloneNode(true) as Element, parts = all(svg, b.parts), plan = buildPlan(b.n, b.from, !!b.line);
  const hair = 1.65 * b.unit;
  svg.removeAttribute('width'); svg.removeAttribute('height');
  svg.setAttribute('style', 'display:block;width:100%;height:100%;overflow:visible');
  if (b.line) {
    const line = all(svg, b.line)[0], fill = all(svg, b.fill!)[0], c = lineAt(u);
    if (!c.whole) { // the centreline is drawn and swells to its own width: there it covers the pixels of the filled part
      fill.setAttribute('visibility', 'hidden');
      line.setAttribute('visibility', 'visible');
      line.setAttribute('stroke-width', lerp(hair * 1.09, Number(line.getAttribute('stroke-width')) || hair, c.swell).toFixed(3));
      dash(line, c.k);
    }
  }
  parts.forEach((g, i) => {
    if (b.line && i === b.from) return;
    const p = partAt(u, i, plan);
    if (p.full >= 1) return; // landed: the file, untouched
    g.setAttribute('transform', `translate(${(p.dx * b.unit).toFixed(3)} ${(p.dy * b.unit).toFixed(3)}) ${g.getAttribute('transform') ?? ''}`);
    for (const el of all(g, GEO)) {
      const thin = el.cloneNode(false) as Element; // the hairline, under the stroke that chases it
      thin.removeAttribute('id');
      thin.setAttribute('stroke-width', hair.toFixed(3));
      dash(thin, p.thin);
      el.parentNode!.insertBefore(thin, el);
      dash(el, p.full);
    }
  });
  return svg.outerHTML;
}

/** The mark of width `w` and height `h` centred on (W/2, cy), `u` seconds into its build: BrandMark's own box. */
export const MarkBuild: React.FC<{ build: Build; w: number; h: number; cy: number; u: number }> = ({ build, w, h, cy, u }) => {
  const root = useMemo(() => parse(build.svg), [build.svg]);
  return <div style={{ position: 'absolute', left: 0, top: 0, width: w, height: h, transform: place(W / 2 - w / 2, cy - h / 2) }} dangerouslySetInnerHTML={{ __html: frame(root, build, u) }} />;
};
