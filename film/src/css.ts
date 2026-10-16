// What a value is, and where CSS can hold one. Shared by the scrub (tools/scrub.mjs, which rewrites) and the sweep
// (film/src/Sweep.tsx, which reads), so both draw the line in the same place. It runs in Node and in the page.
import { isStructuralAttr } from './standins.ts';

export const MISSING_MARK = 'about:blank#missing';

/** The sheet every rebuilt page gets before anything is laid out or scrolled (RecordedScreen). A frame is a still:
 *  the page's own transitions and animations would run on the wall clock, so transitions are off and animations jump
 *  to their end, where a page may leave things for good (a dropdown's slide ends on the transform that places it).
 *  Every scroll is instant: a page with `scroll-behavior: smooth` animated each scroll the template set (its recorded
 *  offset, an anchor's, a scroll box's), and Measure and the film read it part way, at different points. */
export const STILL_PAGE_CSS = 'noscript{display:none!important} *,*::before,*::after{transition:none!important;animation-duration:0s!important;animation-delay:0s!important;animation-iteration-count:1!important;scroll-behavior:auto!important} html,body{scroll-behavior:auto!important}';
export const ASSET_PREFIX = 'rostrum-asset:/';

/** Is this attribute value (or url() target) really an asset, and so not text to scrub or sweep? Only: an inlined
 *  file (`data:<type>/<subtype>` then `;` or `,`), a page-made blob (`blob:http...`), the exact missing marker, or a
 *  local asset: the exact prefix (`local`: `rostrum-asset:/` in the clean copy, the served folder in a rebuilt page)
 *  followed by a plain file name. Case-sensitive. Anything else that merely starts like one (`about:<an email>`,
 *  `data:<a token>`, `Rostrum-Asset:/...`) is a value like any other. */
export function isAssetValue(value: string, local: string = ASSET_PREFIX): boolean {
  return /^data:[\w.+-]+\/[\w.+-]+[;,]/.test(value) || /^blob:https?:/.test(value) || value === MISSING_MARK
    || (value.startsWith(local) && /^[\w.-]+(#[\w-]*)?$/.test(value.slice(local.length)));
}

/** A url() or @import target that may stay: an asset, a fragment (`#clip`), a neighbour file of a stored stylesheet
 *  (`./a1.woff2`), or an XML namespace name. */
export const isCssUrlOk = (target: string, local: string = ASSET_PREFIX) =>
  isAssetValue(target, local) || /^#[\w-]*$/.test(target) || /^\.\/[\w.-]+(#[\w-]*)?$/.test(target) || /^https?:\/\/www\.w3\.org\/[\w/.#-]*$/.test(target);

/** Is the whole string a number, or numbers separated by spaces or commas ("12.3456789", "0, 0, 10.5")? */
export const isNumberList = (s: string) => /^\s*[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?([\s,]+[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?)*\s*$/i.test(s);

// One word of an unquoted CSS value that is structure, not a value: a number with or without a unit, a hex colour, a
// custom property's name (`--anything`), a keyword or a name: words joined by hyphens or underscores, each with two
// digits at most (`solid`, `ease-in-out`, `important`, `-webkit-focus-ring-color`, a keyframes name like
// `swal2-animate-success-line-tip`). A key or an id has more digits than that in some part of it.
const CSS_NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?(%|[a-z]{1,5})?$/i, CSS_HEX = /^#[0-9a-f]{3,8}$/i;
const CSS_WORD = { test: (w: string) => /^--[\w-]+$/.test(w) || (/^-?[a-z_][\w-]*$/i.test(w) && w.split(/[-_]+/).every((part) => (part.match(/\d/g) ?? []).length <= 2)) };
const LONG_BARE_INTEGER = /^\d{6,}$/;

export type CssHandlers = {
  /** the inside of a quoted string that is a value (`content: "..."`, a font name) */
  string?: (inner: string) => string;
  /** the inside of an attribute selector's value, quoted or not (`[data-id="..."]`), and the attribute's name: a
   *  selector on a structural attribute (`[class^="..."]`, `[type="text"]`) holds a name, as that attribute does */
  selectorString?: (inner: string, attribute: string) => string;
  /** an unquoted stretch of a declaration's value, urls and strings left out. `structural(from, to)`: is that part of
   *  the stretch made only of structure (numbers, colours, keywords, custom property names, function names)? */
  value?: (text: string, structural: (from: number, to: number) => boolean, property: string) => string;
  /** a url() or @import target; return the target to keep or the one to put */
  url?: (target: string) => string;
  /** called after each statement (one declaration, one selector or at-rule prelude, one at-statement): everything
   *  handed over since the last call stood in that one statement */
  end?: () => void;
};

/** Passes over CSS (a stylesheet, or a `style` attribute's declarations) and hands every place that can hold a value
 *  to `h`, returning the CSS with what the handlers answered. Comments are dropped. NOT touched, whatever they hold:
 *  selectors' class and id names, property names, custom property NAMES, at-rule preludes (`@media (...)`,
 *  `@keyframes name`): rewriting those is what breaks a page's rendering. */
export function passCss(css: string, h: CssHandlers): string {
  const n = css.length;
  /** index just past the string that opens at i */
  const pastString = (i: number) => { const q = css[i]; let j = i + 1; while (j < n && css[j] !== q) j += css[j] === '\\' ? 2 : 1; return Math.min(j + 1, n); };
  const pastComment = (i: number) => { const j = css.indexOf('*/', i + 2); return j < 0 ? n : j + 2; };
  /** index of the `;`, `{` or `}` that ends the statement starting at i (n when there is none): strings, comments and brackets are skipped */
  const endOf = (i: number) => {
    let depth = 0;
    while (i < n) {
      const c = css[i];
      if (c === '"' || c === "'") { i = pastString(i); continue; }
      if (c === '/' && css[i + 1] === '*') { i = pastComment(i); continue; }
      if (c === '(' || c === '[') depth++;
      else if (c === ')' || c === ']') depth = Math.max(0, depth - 1);
      else if (!depth && (c === ';' || c === '{' || c === '}')) return i;
      i++;
    }
    return n;
  };
  const noComments = (s: string) => {
    let out = '', i = 0;
    while (i < s.length) {
      const c = s[i];
      if (c === '"' || c === "'") { const q = c; let j = i + 1; while (j < s.length && s[j] !== q) j += s[j] === '\\' ? 2 : 1; out += s.slice(i, j + 1); i = j + 1; }
      else if (c === '/' && s[i + 1] === '*') { const j = s.indexOf('*/', i + 2); i = j < 0 ? s.length : j + 2; out += ' '; }
      else { out += c; i++; }
    }
    return out;
  };
  /** the parts of `s`: quoted strings, url(...)/@import targets, and the stretches between them */
  const parts = (s: string, each: { string: (inner: string, q: string, i: number) => string; url: (target: string, whole: string) => string; plain: (text: string) => string }) => {
    let out = '', at = 0;
    const next = /url\(\s*|["']/gi;
    for (let m; (m = next.exec(s));) {
      const i = m.index;
      if (i < at) continue;
      out += each.plain(s.slice(at, i));
      if (m[0] === '"' || m[0] === "'") {
        let j = i + 1; while (j < s.length && s[j] !== m[0]) j += s[j] === '\\' ? 2 : 1;
        out += each.string(s.slice(i + 1, j), m[0], i);
        at = next.lastIndex = Math.min(j + 1, s.length);
        continue;
      }
      let from = i + m[0].length, to: number, end: number;
      if (s[from] === '"' || s[from] === "'") { const q = s[from]; to = from + 1; while (to < s.length && s[to] !== q) to += s[to] === '\\' ? 2 : 1; from++; end = s.indexOf(')', to) + 1 || s.length; }
      else { let depth = 1; to = from; while (to < s.length && depth) { if (s[to] === '(') depth++; else if (s[to] === ')') depth--; if (depth) to++; } end = Math.min(to + 1, s.length); }
      out += each.url(s.slice(from, to).trim(), s.slice(i, end));
      at = next.lastIndex = end;
    }
    return out + each.plain(s.slice(at));
  };
  const putUrl = (target: string, whole: string) => { if (!h.url || !target) return whole; const next = h.url(target); return next === target ? whole : `url("${next}")`; };
  const str = (fn?: (s: string) => string) => (inner: string, q: string) => q + (fn ? fn(inner) : inner) + q;
  /** an unquoted stretch of a value */
  const plainValue = (property: string) => (text: string) => {
    if (!h.value || !text.trim()) return text;
    const words: { from: number; to: number; ok: boolean }[] = [];
    for (const m of text.matchAll(/[^\s,()/!]+/g)) {
      const w = m[0], to = m.index! + w.length, fn = text[to] === '(';
      const ok = fn || CSS_HEX.test(w) || CSS_WORD.test(w) || (CSS_NUMBER.test(w) && !(property.startsWith('--') && LONG_BARE_INTEGER.test(w)));
      words.push({ from: m.index!, to, ok });
    }
    return h.value(text, (from, to) => words.filter((w) => w.from < to && w.to > from).every((w) => w.ok), property);
  };
  /** a selector or at-rule prelude: only the strings of attribute selectors (and any other quoted string) are values */
  const prelude = (s: string) => {
    if (!h.selectorString && !h.string) return s;
    // [attr=value], quoted or not; the operator may be = ~= |= ^= $= *=
    const withAttrs = s.replace(/\[\s*([\w:-]+)\s*([~|^$*]?=)\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([^\]\s]+))(\s+[is])?\s*\]/g, (m, name, op, a, b, c, flag) => {
      if (!h.selectorString) return m;
      const inner = a ?? b ?? c, next = h.selectorString(inner, name);
      if (next === inner) return m;
      return `[${name}${op}"${next.replace(/["\\]/g, '\\$&')}"${flag ?? ''}]`;
    });
    return withAttrs;
  };
  /** `@import "x" screen;`, `@charset "x";`, `@namespace svg url(...)` */
  const atStatement = (s: string) => {
    const imp = /^(\s*@import\s+)(["'])((?:[^"'\\]|\\.)*)\2/i.exec(s);
    if (imp && h.url) { const next = h.url(imp[3].trim()); return imp[1] + '"' + next + '"' + parts(s.slice(imp[0].length), { string: str(h.string), url: putUrl, plain: (t) => t }); }
    return parts(s, { string: str(h.string), url: putUrl, plain: (t) => t });
  };
  const declaration = (s: string) => {
    const colon = s.indexOf(':');
    if (colon < 0) return s; // not a declaration (stray text): nothing here is a value we can name
    const property = s.slice(0, colon).trim().toLowerCase();
    return s.slice(0, colon + 1) + parts(s.slice(colon + 1), { string: str(h.string), url: putUrl, plain: plainValue(property) });
  };

  let out = '', i = 0;
  while (i < n) {
    const end = endOf(i), stop = css[end] ?? '';
    const chunk = noComments(css.slice(i, end));
    if (stop === '{') out += prelude(chunk);
    else if (/^\s*@/.test(chunk)) out += atStatement(chunk);
    else out += declaration(chunk);
    h.end?.();
    out += stop;
    i = end + 1;
  }
  return out;
}

/** For the sweep: every place of some CSS that can hold a value, as text. Property names and selectors are not values.
 *  Read in full: quoted strings, url() targets that are not assets, the strings of attribute selectors (on attributes
 *  that are not structure), and the whole value of every declaration of a `style` attribute (`inline`) and of every
 *  custom property (`--x: ...`), which is where a page's script puts data.
 *  Of an ordinary declaration in a stylesheet (`color`, `margin`, `animation`), the words that are not structure: a
 *  site's stylesheet is thousands of keywords, colours and numbers, and a table cell reading "Bold" or an id that
 *  happens to equal a hex colour would fail every sweep. */
export function cssValues(css: string, local: string = ASSET_PREFIX, inline = false): string {
  return cssParts(css, local, inline).join(' ');
}

/** The same, statement by statement: one string for everything read of ONE declaration (its strings, its url()
 *  targets, its unquoted words, in order), one for the strings of one selector, one for an at-statement. For the
 *  sweep's stripped comparison (tools/sweep.mjs `findHits`): with punctuation and spacing gone, the numbers of
 *  unrelated declarations of a sheet would run together into digits that no declaration holds. A value is never cut:
 *  whatever stands inside one declaration, however it is punctuated or spaced, is in one string. */
export function cssParts(css: string, local: string = ASSET_PREFIX, inline = false): string[] {
  const parts: string[] = [];
  let got: string[] = [];
  passCss(css, {
    end: () => { if (got.length) parts.push(got.join(' ')); got = []; },
    string: (s) => { got.push(s); return s; },
    selectorString: (s, attribute) => { if (!isStructuralAttr(attribute)) got.push(s); return s; },
    value: (t, structural, property) => {
      if (inline || property.startsWith('--')) { if (t.trim()) got.push(t.trim()); }
      else for (const m of t.matchAll(/[^\s,()/!]+/g)) if (!structural(m.index!, m.index! + m[0].length)) got.push(m[0]);
      return t;
    },
    url: (t) => { if (!isCssUrlOk(t, local)) got.push(t); return t; },
  });
  if (got.length) parts.push(got.join(' '));
  return parts;
}
