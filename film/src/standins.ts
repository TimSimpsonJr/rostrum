// Stand-ins: what a screen shows in place of a sensitive value, so nothing real reaches a frame or an agent.
// This file says what a stand-in LOOKS like; tools/scrub.mjs decides where one goes and writes it into the clean copy
// at prepare time (the render-time version that worked on the rebuilt document is retired: old/standins-dom.ts).
// A stand-in is a representative LABEL, not an imitation (Tim, Oct 10; spec "Sensitive values"): it says what kind of
// thing sits there and never tries to look like a plausible real value.
//   people         the library's roster, with matching example.com emails, usernames and initials
//   organisations  the library's invented company
//   one of a series (transaction ids, invoice numbers, rows of a list)
//                  the kind's name and a running number in order of appearance: "Transaction 1", "Transaction 2"
//   a secret or identifier that stands alone (an API key, a token, an account number)
//                  the field's own name, compact, and a short fixed number: "UserAPIKey-123456"
// The kind's name is read from the screen itself (the field's label, the column's heading), so rules carry no
// per-film lists. A stand-in is NEVER derived from the original's characters, length or hash: the original is only
// ever a lookup key, so the same original gets the same stand-in.
//   money          the currency symbol and format stay, the figure becomes a round one numbered in order of
//                  appearance: $100.00, $200.00, ... A zero amount stays as it is.
// Counts, percentages, dates and UI text stay as recorded.
//   empty accounts a recording of an account with no activity (zero totals, a flat chart) is FILLED on the screens a
//                  film shows: round figures that agree with each other, chosen once per film and listed with its
//                  rules (`fill`, `chart` in the tutorial's rules.json). A tutorial should look like the product in use.
// Pure: no DOM, no Node. tools/scrub.mjs imports it with --experimental-strip-types.

export const PEOPLE = [{ first: 'Jordan', last: 'Avery' }, { first: 'Priya', last: 'Raman' }, { first: 'Marcus', last: 'Bell' }];
export const COMPANY = 'Northwind Mutual';
export const emailOf = (p: { first: string; last: string }) => `${p.first}.${p.last}@example.com`.toLowerCase();

/** RETIRED with old/standins-dom.ts: a render-time rule. Stand-in rules are now data in a tutorial's rules.json
 *  ({ blind, fill, chart, keep }) on top of tools/scrub.mjs's DEFAULT_RULES. The type stays while old props name it. */
export type Rule = {
  /** `selector`: these elements. `label`: the form control whose <label> text matches. `pattern`: any text or input value shaped like this. */
  match: { selector?: string; label?: RegExp; pattern?: 'money' | 'email' | 'phone' | 'key' | 'digits'; near?: RegExp };
  /** A fixed stand-in (a roster name, the company, an image URL). */
  value?: string;
  /** One of a series: numbered in order of appearance. `true` reads the kind's name from the screen (a table cell's column heading); a string names it. */
  series?: true | string;
  /** A stand-alone secret or identifier. `true` reads the field's name from the screen; a string names it. */
  secret?: true | string;
  /** Show a password field's stand-in as text. Without it the field keeps its dots. */
  reveal?: boolean;
  /** Fill (empty accounts): the figure to show, whatever was recorded, zero included. */
  fill?: string;
  /** Fill for a line chart drawn as SVG by ApexCharts: the values to plot, one per point. */
  chart?: number[];
};

const ACRONYMS = new Set(['api', 'id', 'url', 'uuid', 'guid', 'ach', 'ssn', 'ein', 'tin', 'iban', 'pin']);
const words = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/[^A-Za-z0-9]+/).filter(Boolean);
const cap = (w: string) => (ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : /^[A-Z0-9]+$/.test(w) ? w : w[0].toUpperCase() + w.slice(1).toLowerCase());

/** A field's name, compact: "User API Key" and "userApiKey" both give "UserAPIKey". */
export const compactName = (label: string) => words(label).map(cap).join('') || 'Value';
/** What one item of a series is called, from its column heading or label: "Transaction UUID" gives "Transaction". */
export function seriesName(heading: string) {
  const all = words(heading), kept = all.filter((w) => !/^(uuid|guid|id|ids|number|numbers|no|num|code|ref|reference)$/i.test(w));
  return (kept.length ? kept : all).map((w, i) => (i ? w.toLowerCase() : cap(w))).join(' ') || 'Item';
}

/** The stand-in for a stand-alone secret: its field's name and a short fixed number. */
export const secretFor = (name: string) => `${compactName(name)}-123456`;

/** One recording's book of stand-ins: the same original always gets the same stand-in, and a series counts up in
 *  order of first appearance. The original is a key here and nothing else. One book per recording, made at prepare,
 *  so every screen agrees. */
export function makeLedger() {
  const given = new Map<string, string>(), counts = new Map<string, number>();
  const once = (bucket: string, original: string, make: (n: number) => string) => {
    const key = bucket + '\n' + original;
    if (!given.has(key)) { const n = (counts.get(bucket) ?? 0) + 1; counts.set(bucket, n); given.set(key, make(n)); }
    return given.get(key)!;
  };
  return {
    series: (kind: string, original: string) => once('series ' + kind, original, (n) => `${kind} ${n}`),
    /** a sum of money: "$1,234.50" becomes "$100.00", the next new sum "$200.00"; zero stays zero */
    amount: (original: string) => {
      const m = /^(\D*?)((?:\d[\d,]*)?)(\.\d+)?$/.exec(original.trim());
      if (!m || !/[1-9]/.test(m[2] + (m[3] ?? ''))) return original;
      const figure = (n: number) => String(n * 100).replace(/\B(?=(\d{3})+$)/g, ',') + (m[3] ? '.' + '0'.repeat(m[3].length - 1) : '');
      return once('amount', (m[2] + (m[3] ?? '')).replace(/,/g, ''), (n) => m[1] + figure(n));
    },
    /** an email met in passing (a table, a note): the roster's people in turn, after the signed-in user */
    email: (original: string) => once('email', original, (n) => emailOf(PEOPLE[n % PEOPLE.length])),
  };
}
export type Ledger = ReturnType<typeof makeLedger>;

/** A neutral avatar: initials on a disc, as an image URL. */
export const initialsDisc = (initials: string, bg = '#556ee6') => 'data:image/svg+xml,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" fill="${bg}"/><text x="48" y="50" font-family="Segoe UI, Arial, sans-serif" font-size="38" font-weight="600" fill="#fff" text-anchor="middle" dominant-baseline="middle">${initials}</text></svg>`);

// Attributes that hold structure, never a value: what an element is, where it sits, how it is drawn. An ALLOW-list:
// every other attribute, known or not, is scrubbed by tools/scrub.mjs and read by the sweep (film/src/Sweep.tsx).
const STRUCTURAL = new Set(['class', 'id', 'type', 'name', 'role', 'for', 'rel', 'target', 'aria-labelledby', 'aria-describedby', 'aria-controls', 'aria-owns', 'headers', 'list', 'form', // (references to ids are ids)
  'method', 'enctype', 'lang', 'dir', 'charset', 'http-equiv', 'scope', 'wrap',
  'width', 'height', 'viewBox', 'preserveAspectRatio', 'd', 'points', 'transform', 'gradientTransform', 'patternTransform', 'gradientUnits', 'patternUnits', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'dx', 'dy',
  'offset', 'fill', 'stroke', 'opacity', 'filter', 'mask', 'clip-path', 'clip-rule', 'text-anchor', 'dominant-baseline', 'stdDeviation', 'in', 'in2', 'result', 'refX', 'refY', 'markerWidth', 'markerHeight', 'orient', 'textLength', 'lengthAdjust', 'pathLength', 'version',
  'colspan', 'rowspan', 'span', 'cols', 'rows', 'size', 'maxlength', 'minlength', 'tabindex', 'border', 'cellpadding', 'cellspacing', 'align', 'valign', 'bgcolor', 'color', 'coords', 'shape', 'step',
  'checked', 'selected', 'disabled', 'readonly', 'required', 'multiple', 'hidden', 'open', 'novalidate', 'draggable', 'spellcheck', 'contenteditable', 'autocomplete', 'autofocus', 'inputmode',
  'loading', 'decoding', 'crossorigin', 'referrerpolicy', 'media', 'sizes', 'as', 'integrity', 'scrolling', 'frameborder', 'allowfullscreen', 'sandbox']);
/** Is this attribute structure (left as recorded) and not a place a value can sit? */
export const isStructuralAttr = (name: string) => STRUCTURAL.has(name) || /^(rr_|xmlns|stroke-|fill-|stop-|font-|marker-|flood-)/.test(name);
