// The scrub: stand-ins applied at PREPARE time, on rrweb's serialized tree, so the clean copy on disk already holds
// them and a screen is rebuilt with no rules at all. (They used to be applied at render time on the rebuilt document:
// film/src/old/standins-dom.ts.) Replaced with nobody asking: SECRETS AND ACCOUNT NUMBERS (every field value, which
// the recorder has already masked; every select; a table cell under a heading that says key, token, password,
// account, routing, card, TIN, SSN, EIN or tax id; anything shaped like a key, a card number, a tax id or an account
// number) and MONEY (currency figures that are not zero), in text and in the attributes a browser shows. NOTHING ELSE:
// emails, phone numbers, names, the signed-in user, companies, table cells and pictures arrive as recorded (where links go is blanked: it is never on a frame),
// and are replaced only where a tutorial's rules.json says so, by judgement: a kind switched on by name (`use`), an
// element or a column named (`blind`, `blindColumns`), the signed-in user named (`user`), a whole page hidden but for
// what is kept (`only`). What a rule would replace can be kept on purpose (`keep`, `keepColumns`).
// What a stand-in looks like is film/src/standins.ts's business (labels, not look-alikes; never made from the original).
//
// A tree is { type, tagName, attributes, childNodes, id }; a text node is { type: 3, textContent, id }.
// Nothing here prints, and nothing an agent can call returns text that was recorded: `scrub` answers with node ids and
// kinds, `blindReplace` with a place, a tag and a length, `elementsIn` with text of the CLEAN tree only.
import { COMPANY, PEOPLE, emailOf, initialsDisc, isStructuralAttr, makeLedger, secretFor, seriesName } from '../film/src/standins.ts';
import { ASSET_PREFIX, MISSING_MARK, isAssetValue, isCssUrlOk, isNumberList, passCss } from '../film/src/css.ts';

const ELEMENT = 2, TEXT = 3, COMMENT = 5;
// What hidden text reads as (rules.json `only`): an en dash for every character, so a line of text becomes a calm
// ruled line of about its length, in the page's own font and colour. Every text font has the glyph, it is half an em
// wide (about an average letter), and a line of it can wrap. It can never be an original. One place to change it.
export const GREEK = '–';
/** What a hidden picture becomes: a flat, neutral block. */
export const FLAT_BLOCK = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect width="8" height="8" fill="#d9dce1"/></svg>');

// ---- tree helpers

export function walk(node, fn) { fn(node); for (const c of node.childNodes ?? []) walk(c, fn); }
/** The text under a node: its text nodes run together (comments are not text). */
export const textOf = (n) => (n.type === TEXT ? n.textContent ?? '' : n.type === COMMENT ? '' : (n.childNodes ?? []).map(textOf).join(''));
/** An attribute as a string, or undefined. */
export const attr = (node, name) => { const v = node?.attributes?.[name]; return v == null || v === false ? undefined : String(v); };

const indexes = new WeakMap();
/** Parents and ids of a tree, built once per root (again with `fresh`, after the tree was reshaped from outside). */
function indexOf(tree, fresh = false) {
  let ix = fresh ? undefined : indexes.get(tree);
  if (!ix) {
    ix = { parent: new Map(), byId: new Map(), max: 0 };
    (function go(n, p) { if (p) ix.parent.set(n, p); if (n.id != null) { ix.byId.set(n.id, n); if (n.id > ix.max) ix.max = n.id; } for (const c of n.childNodes ?? []) go(c, n); })(tree, null);
    indexes.set(tree, ix);
  }
  return ix;
}
export const findById = (tree, id) => indexOf(tree).byId.get(id) ?? null;
/** The node's ancestors, nearest first. */
function ancestors(node, tree) { const { parent } = indexOf(tree), out = []; for (let p = parent.get(node); p; p = parent.get(p)) out.push(p); return out; }
const closest = (node, tree, tags) => [node, ...ancestors(node, tree)].find((n) => n.type === ELEMENT && tags.includes(n.tagName)) ?? null;
const kids = (n) => (n.childNodes ?? []).filter((c) => c.type === ELEMENT);
const classes = (n) => String(n.attributes?.class ?? '').split(/\s+/).filter(Boolean);
const idClass = (n) => `${n?.attributes?.class ?? ''} ${n?.attributes?.id ?? ''}`;
const short = (s) => { const t = (s ?? '').replace(/\s+/g, ' ').trim(); return t && t.length <= 40 ? t : ''; };

function parseSelector(selector) {
  return selector.split(',').map((one) => one.trim().split(/\s+/).map((compound) => {
    const c = { tag: null, id: null, classes: [], attrs: [] };
    let rest = compound;
    const take = (re, fn) => { const m = re.exec(rest); if (m) { fn(m); rest = rest.slice(m[0].length); } return !!m; };
    take(/^(\*|[a-zA-Z][\w-]*)/, (m) => { c.tag = m[1] === '*' ? null : m[1].toLowerCase(); });
    while (rest) {
      if (take(/^#([\w-]+)/, (m) => { c.id = m[1]; })) continue;
      if (take(/^\.([\w-]+)/, (m) => c.classes.push(m[1]))) continue;
      if (take(/^\[([\w:-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\]]*)))?\]/, (m) => c.attrs.push([m[1], m[2] ?? m[3] ?? m[4]]))) continue;
      throw new Error(`selector not understood: "${selector}" (tag, #id, .class, [attr=value] and spaces between them only)`);
    }
    return c;
  }));
}
const fits = (n, c) => n.type === ELEMENT && (!c.tag || n.tagName === c.tag) && (c.id == null || attr(n, 'id') === c.id)
  && c.classes.every((k) => classes(n).includes(k)) && c.attrs.every(([k, v]) => (v == null ? attr(n, k) != null : attr(n, k) === v));
/** Does `node` match the selector? Tag, `#id`, `.class`, `[attr=value]`, the descendant combinator and commas: enough for rules.json. */
export function matches(node, simpleSelector, tree) {
  const up = tree ? ancestors(node, tree) : [];
  return parseSelector(simpleSelector).some((parts) => {
    if (!fits(node, parts.at(-1))) return false;
    let at = 0;
    for (let i = parts.length - 2; i >= 0; i--) { while (at < up.length && !fits(up[at], parts[i])) at++; if (at++ >= up.length) return false; }
    return true;
  });
}
/** Every element under `root` (in `tree`) that matches, in document order. */
function select(root, selector, tree) { const out = []; walk(root, (n) => { if (n !== root && n.type === ELEMENT && matches(n, selector, tree)) out.push(n); }); return out; }

// A table's columns, counted with colspans. ponytail: rowspans are not counted; a table that uses them is off by the
// spanned cells in the rows below (a kept column then keeps nothing there, a heading is the neighbour's).
const cellsOfRow = (row) => kids(row).filter((c) => c.tagName === 'td' || c.tagName === 'th');
const spanOf = (cell) => Math.max(1, parseInt(attr(cell, 'colspan') ?? '1', 10) || 1);
/** The column a cell starts at in its row, or -1. */
const columnOf = (cell, row) => { let at = 0; for (const c of cellsOfRow(row)) { if (c === cell) return at; at += spanOf(c); } return -1; };
/** The cell of `row` that lies over column `at`, or undefined. */
const cellAt = (row, at) => cellsOfRow(row).find((c) => { const from = columnOf(c, row); return at >= from && at < from + spanOf(c); });
/** The rows of a table that are its own (not those of a table inside it), in order. */
const rowsOf = (table, tree) => { const out = []; walk(table, (n) => { if (n.tagName === 'tr' && closest(n, tree, ['table']) === table) out.push(n); }); return out; };

/** The heading of a table cell's column (the `thead` cell over the same column, colspans counted), or ''. */
export function headingOf(cell, tree) {
  const td = closest(cell, tree, ['td', 'th']), table = td && closest(td, tree, ['table']);
  if (!table) return '';
  const row = closest(td, tree, ['tr']), at = row ? columnOf(td, row) : -1;
  const first = rowsOf(table, tree).find((r) => closest(r, tree, ['thead', 'table'])?.tagName === 'thead');
  const over = first && at >= 0 && cellAt(first, at);
  return over ? short(textOf(over)) : '';
}

// ---- interface text inside a table cell

// A table body cell is data by default, but a cell also holds the interface's own controls: a "View" button, a menu
// of "Edit / History / Delete", an "Open" link. Their words are not replaced by the cell's stand-in. A link can just
// as well BE the data (a company's name linking to its page, an email as a mailto link), so a control's label counts
// as interface text only on evidence that is in the tree:
//   a menu     the text stands inside a menu (a <menu>, role=menu|menubar|listbox|tablist|toolbar, or one of the
//              class names listed below, exactly: "dropdown-menu", "dropdown-item", "menu", "menu-item", and the
//              two library prefixes): interface, whatever the rows
//   repeats    the control's whole label stands in a control in EVERY row of that column that holds anything, and
//              there are two rows or more ("View" down an Actions column): interface
//   a button   (button, summary, role=button|menuitem|tab|option) with neither: its caption is still never rewritten
//              (a caption is the interface's), but the sweep goes on looking for it, as it does for all a cell holds
//   a link     (a, role=link) with neither: data, replaced like any cell text
// ponytail: evidence, not knowledge. Taken for interface when it is data: the same linked value in every row of a
// column (a list filtered to one company), anything a page puts in a menu inside a cell. Taken for data when it is
// interface: a link in a one-row table, an action some rows lack. The first needs a blind rule, the second `keep`.
// Because the first is a leak, what is kept on evidence is never dropped from the sweep's sight: it is listed as an
// original of its own kind (`control`), and the sweep lets it show only where the same judgement holds on the clean
// copy, counts and lists it on every run, and fails it anywhere else (tools/sweep.mjs `sortInterface`).
const PRESS_ROLES = ['button', 'menuitem', 'menuitemradio', 'menuitemcheckbox', 'tab', 'option'], MENU_ROLES = ['menu', 'menubar', 'listbox', 'tablist', 'toolbar'];
const MENU_CLASSES = new Set(['dropdown-menu', 'dropdown-item', 'menu', 'menu-item']), MENU_PREFIXES = ['MuiMenu-', 'ant-dropdown-menu']; // exact names and listed library prefixes: nothing looser
const isPress = (n) => n.tagName === 'button' || n.tagName === 'summary' || PRESS_ROLES.includes(attr(n, 'role'));
const isControl = (n) => n.type === ELEMENT && (isPress(n) || n.tagName === 'a' || attr(n, 'role') === 'link');
const isMenu = (n) => n.tagName === 'menu' || MENU_ROLES.includes(attr(n, 'role')) || classes(n).some((c) => MENU_CLASSES.has(c) || MENU_PREFIXES.some((p) => c.startsWith(p)));
const labelOfControl = (n) => textOf(n).replace(/\s+/g, ' ').trim().toLowerCase();

/** Judges the cells of one tree, as it stands when a column is first asked about (so ask before rewriting cells).
 *  Returns (cell) => { data, labels, original, control }: `data`, the text nodes the cell rule replaces; `labels`,
 *  the text nodes kept as interface text on evidence; `original`, the cell's text without those (the data and the
 *  captions of buttons nothing shows to be the interface's); `control`, the text of `labels`. Both strings are as
 *  recorded, white space between the nodes included, and both go on the sweep's list (kinds `cell` and `control`).
 *  The one judgement for all three: prepare lists the originals, the scrub rewrites `data`, the sweep asks again. */
export function cellJudge(tree) {
  const columns = new Map(); // table -> column -> { rows, labels: label -> rows that have it }
  const stats = (cell) => {
    const table = closest(cell, tree, ['table']), row = closest(cell, tree, ['tr']), at = table && row ? columnOf(cell, row) : -1;
    if (at < 0) return null;
    const byColumn = columns.get(table) ?? columns.set(table, new Map()).get(table);
    if (!byColumn.has(at)) {
      const s = { rows: 0, labels: new Map() };
      for (const r of rowsOf(table, tree)) {
        const c = closest(r, tree, ['thead', 'tfoot', 'table']).tagName === 'table' ? cellAt(r, at) : null;
        if (!c || !textOf(c).trim()) continue;
        s.rows++;
        const has = new Set();
        walk(c, (n) => { if (n !== c && isControl(n) && labelOfControl(n)) has.add(labelOfControl(n)); });
        for (const l of has) s.labels.set(l, (s.labels.get(l) ?? 0) + 1);
      }
      byColumn.set(at, s);
    }
    return byColumn.get(at);
  };
  return (cell) => {
    const data = [], labels = [];
    let original = '', control = '';
    (function go(n, inside) { // inside: the elements between the cell and here, nearest first
      if (n.type === TEXT) {
        const text = n.textContent ?? '';
        if (!text.trim()) { original += text; control += text; return; }
        const c = inside.find(isControl), s = c && stats(cell);
        if (inside.some(isMenu) || (s && s.rows >= 2 && s.labels.get(labelOfControl(c)) === s.rows)) { labels.push(n); control += text; return; } // interface, on evidence
        original += text;
        if (!c || !isPress(c)) data.push(n);
      } else if (n.type === ELEMENT && !INERT.includes(n.tagName)) for (const c of n.childNodes ?? []) go(c, n === cell ? inside : [n, ...inside]);
    })(cell, []);
    return { data, labels, original: original.trim(), control: control.trim() };
  };
}
const CONTROL = ['input', 'select', 'textarea', 'option', 'button'];
/** A label's words, without the text of a control it wraps (a select's options are data). */
const labelText = (n) => (n.type === TEXT ? n.textContent ?? '' : n.type !== ELEMENT || CONTROL.includes(n.tagName) ? '' : (n.childNodes ?? []).map(labelText).join(''));
/** What the screen calls a control, from the places a page's AUTHOR writes and nowhere else: a <label for>, a label
 *  around it, its aria-label, its column's heading, its id, its name. Never text that merely sits beside it (that can
 *  be data, and a label made of data would put a real value into a stand-in). With none of these, "Value". */
export function labelOf(control, tree) {
  const id = attr(control, 'id');
  let named = '';
  if (id) walk(tree, (n) => { if (!named && n.tagName === 'label' && attr(n, 'for') === id) named = short(labelText(n)); });
  const around = ancestors(control, tree).find((n) => n.tagName === 'label');
  return named || (around && short(labelText(around))) || short(attr(control, 'aria-label')) || headingOf(control, tree) || id || attr(control, 'name') || 'Value';
}
/** Not shown as recorded: a hidden input, the `hidden` attribute, an inline display:none. */
export const isHidden = (node) => attr(node, 'type') === 'hidden' || attr(node, 'hidden') != null || /display\s*:\s*none/i.test(attr(node, 'style') ?? '');

// ---- what stays as recorded

// "Counts, percentages, dates and UI text stay as recorded" (spec, Sensitive values); so does a zero sum. A date is a
// real date (month 1-12, day 1-31, a 2- or 4-digit year; or year-month-day), optionally with a time: a number that is
// merely date-SHAPED (an SSN, an account number) is not one. A count is a whole number of up to three digits.
const MD = '(0?[1-9]|1[0-2])[/.-](0?[1-9]|[12]\\d|3[01])', TIME = '(,? \\d{1,2}:\\d{2}(:\\d{2})?( ?[ap]m)?)?';
const DATE = new RegExp(`^(${MD}[/.-](\\d{2}|\\d{4})|\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01]))${TIME}$`, 'i');
const NOTHING = /^-?[$€£] ?[0,]*\.?0*$|^-?[\d,]*\.?\d+ ?%$|^\d{1,3}$/; // zero sums, percentages, small counts: other money is replaced
const norm = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();
/** Does a table cell reading `value` stay as recorded? `keep`: the interface words of this site (rules.json `keep`), normalised. */
export const stays = (value, keep = new Set()) => { const v = value.replace(/\s+/g, ' ').trim(); return !!v && (DATE.test(v) || NOTHING.test(v) || keep.has(v.toLowerCase())); };
let uiText = new Set();
/** For the sweep: the interface words (rules.json `keep`) that `staysAsRecorded` lets through. */
export const setUiText = (list) => { uiText = new Set(list.map(norm)); };
/** For the sweep: the kinds of original a `keep` word clears. A `keep` word is this tutorial's own judgement that a
 *  word may show; a rule can still put the same ordinary word on the list (a blind rule on a subject line that reads
 *  "Test", text an `only` rule hid, a select's option), and the interface says it elsewhere. Listed by name, so a kind
 *  nobody thought of is not cleared. NEVER the secret kinds, whatever `keep` says: key, card, account, taxid, money,
 *  amount, field (a field's value). (A table cell has its own rule: `stays`.) */
export const KEEPABLE = Object.freeze(['series', 'number', 'name', 'company', 'email', 'phone', 'digits', 'greeked', 'option', 'control']);
/** For the sweep: is this original cleared because its WHOLE value is a `keep` word (case and outer space aside)?
 *  Never a longer original that holds the word, never a secret kind. */
export const keptByWord = (o) => KEEPABLE.includes(o.kind) && uiText.has(norm(o.value));
/** For the sweep: an original that is a table cell and stays as recorded is not a leak when it shows; nor is one that is exactly a `keep` word. */
export const staysAsRecorded = (o) => (o.kind === 'cell' && stays(o.value, uiText)) || keptByWord(o); // (hidden text that is exactly a listed interface word: "Search" in a mail client and in the product)

// ---- rules

// What is replaced with nobody asking: SECRETS AND ACCOUNT NUMBERS, and MONEY. Nothing else. (The owner's policy,
// Oct 12 2026: "narrow the automatic scrubbing rules to actual sensitive values only, and leave everything else to
// judgement".) Emails, phone numbers, names, companies, table cells and pictures arrive as recorded; each has
// a rule that a tutorial's rules.json switches on (`use`), beside the tools that name a place (blind, blindColumns,
// only, user).
/** The default rules, in order. Data: `--drop-default <i>` (tools/sweep.mjs) leaves one out to prove the sweep can fail. */
export const DEFAULT_RULES = Object.freeze([
  { kind: 'fields' },      // every input and textarea value, named from its label: the recorder has already masked them (maskAllInputs)
  { kind: 'selects' },     // every select: one option, the stand-in: the recorder has masked which was chosen
  { kind: 'secretCells' }, // a table cell under a heading that says key, token, secret, password, account, routing, card, TIN, SSN, EIN, tax id; a bare figure under one that says balance, amount, fee, price
  { kind: 'pattern', pattern: 'money' },   // a currency figure that is not zero
  { kind: 'pattern', pattern: 'key' },     // a key or token: a JWT, or 20 characters or more of letters, digits and + / = _ - that do not read as words
  { kind: 'pattern', pattern: 'card' },    // a card number: 13 to 19 digits, grouped or not, that pass the Luhn check
  { kind: 'pattern', pattern: 'taxid' },   // a tax id as written: 123-45-6789 (SSN), 12-3456789 (EIN)
  { kind: 'pattern', pattern: 'account' }, // an account, routing or bare tax number, a numeric token: a run of 8 digits or more
  { kind: 'secretElements' }, // an element whose own id or label says it holds a key, a token, a password, an account number: whatever the value looks like
  { kind: 'links' },          // where links go and forms post (href, action, ping, on* handlers): never on a frame, and a URL holds ids, addresses and tokens. The link's visible text is not touched.
]);
/** The rules a tutorial switches on by name (rules.json `use: [...]`). `user` is not a rule of the scrub: it asks
 *  prepare to look for the signed-in user (resolveUser). */
export const OPT_IN = Object.freeze({
  cells: { kind: 'cells' },                         // every table body cell, numbered under its column heading
  avatars: { kind: 'avatars' },                     // pictures of people
  links: { kind: 'links' },                         // (automatic again, by the owner's decision: the name is still accepted in an old rules file, and changes nothing)
  emails: { kind: 'pattern', pattern: 'email' },
  phones: { kind: 'pattern', pattern: 'phone' },
  numbers: { kind: 'pattern', pattern: 'digits' },  // any run of 6 digits or more
  user: null,
});
/** What was automatic before the policy narrowed: a tutorial made then keeps its look with this as its `use` list. */
export const OLD_DEFAULTS = Object.freeze(['cells', 'avatars', 'links', 'emails', 'phones', 'numbers', 'user']);
/** The rules for one screen: the defaults, what rules.json switches on (`use`), and its tools ({ blind, blindColumns,
 *  fill, chart, keep, keepColumns, only }; its `allow` list is the sweep's alone and is not read here: it never
 *  changes what the scrub writes; `user` is read by prepare). Blind rules are per screen; with no `screen` given, all
 *  of them. `dropBlind` / `dropDefault`: an index to leave out.
 *  `keepColumns`: [{ screen?, table: selector | node id | { near: header text }, columns: [header text] }]: columns
 *  left as recorded ON PURPOSE where a rule would replace them; a rule with no `screen` is asked of every screen.
 *  `blindColumns`: [{ screen?, table, columns, as, label? }]: the same way of naming columns, to REPLACE their cells. */
export function rulesFor(json = {}, screen, { dropBlind, dropDefault, host } = {}) {
  // `only`: [{ screens?: { from, to } | [numbers], host?, keep: [selector | node id], all? }]: a page of other people's
  // text, of which only the kept subtrees are read by the rules (the scrub, 1a). With neither `screens` nor `host`:
  // every screen. A rule whose host cannot be compared (the screen's is not known) applies: it errs on hiding.
  const onScreen = ({ screens: s }) => screen == null || s == null || (Array.isArray(s) ? s.includes(screen) : !(Number.isInteger(s.from) && Number.isInteger(s.to)) || (screen >= s.from && screen <= s.to)); // (a range that cannot be read applies)
  const onHost = (o) => o.host == null || host == null || String(o.host).toLowerCase() === String(host).toLowerCase();
  const columns = (kind, list) => (list ?? []).map((k, i) => ({ kind, ...k, i })).filter((k) => Array.isArray(k.columns) && (screen == null || k.screen == null || k.screen === screen));
  return [
    ...(json.only ?? []).map((o, i) => ({ kind: 'only', ...o, i })).filter((o) => onScreen(o) && onHost(o)),
    ...(json.blind ?? []).map((b, i) => ({ kind: 'blind', ...b, i })).filter((b) => b.i !== dropBlind && (screen == null || b.screen === screen)),
    ...(json.blindAll ?? []).map((b, i) => ({ kind: 'blindAll', ...b, i })).filter((b) => typeof b.selector === 'string' && onScreen(b) && onHost(b)),
    ...columns('blindColumns', json.blindColumns), ...columns('keepColumns', json.keepColumns),
    ...DEFAULT_RULES.filter((_, i) => i !== dropDefault),
    ...[...new Set(Array.isArray(json.use) ? json.use : [])].map((name) => OPT_IN[name]).filter(Boolean),
    ...((json.keep ?? []).length ? [{ kind: 'keep', words: json.keep }] : []),
    ...(json.fill ?? []).map((f) => ({ kind: 'fill', ...f })).filter((f) => f.node == null || screen == null || f.screen === screen),
    ...(json.chart ?? []).map((c) => ({ kind: 'chart', ...c })),
  ];
}

const MONEY = /[$€£]\s?(?:\d[\d,]*(?:\.\d+)?|\.\d+)/;
// key: a JSON web token, or a run of 20 characters or more of letters, digits and + / = _ - that `isKeyLike` (below)
//   does not read as words. account: a run of 8 digits or more, of any length (a 24-digit token is one too), that is
//   not the fraction of a decimal ("0.123456789" is a measure; a grouped figure such as 12,345,678 has no run of 8).
//   card: 13 to 19 digits, grouped or not, that pass the Luhn check (REALLY), and likewise never the fraction of a
//   decimal: not when a digit and a point stand right before the run (a ripple's "scale(0.4111111111111111)"; one in
//   ten such floats passes the check). A point with no digit before it, or with a space after it, is not a decimal.
//   Not automatic: digits written in groups with spaces, dots or dashes that are neither a card nor a tax id (they read
//   as phone numbers: `phones`), and runs of 6 or 7 digits (order numbers, ids: `numbers`).
const PATTERNS = { money: new RegExp(MONEY.source, 'g'), email: /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, key: /eyJ[\w-]{5,}\.[\w-]{5,}\.[\w-]*|[\w+/=-]{20,}/g, card: /(?<![\d-])(?<!\d\.)\d(?:[ -]?\d){12,18}(?![\d-])/g, taxid: /(?<![\d-])(?:\d{3}-\d{2}-\d{4}|\d{2}-\d{7})(?![\d-])/g,
  phone: /\+?\d[\d\s().-]{8,}\d/g, account: /(?<!\d)(?<!\d\.)\d{8,}(?!\d)/g, digits: /\d{6,}/g };
/** Where two patterns meet on the same text, the first of these takes it. */
const PATTERN_ORDER = ['money', 'email', 'key', 'card', 'taxid', 'account', 'phone', 'digits'];
const luhn = (digits) => { let sum = 0; for (let i = digits.length - 1, twice = false; i >= 0; i--, twice = !twice) { const d = +digits[i] * (twice ? 2 : 1); sum += d > 9 ? d - 9 : d; } return sum % 10 === 0; };
/** Does a long unbroken token read as WORDS (a name, an identifier, a product's hyphenated name)? Split at - _ and at
 *  capitals, every piece must be letters (with at most 4 digits after them: "v2", "col12") or a number of 4 digits at
 *  most, the pieces must be 3 letters long on average, and every piece of 4 letters or more must have vowels like a
 *  word has (a fifth to seven tenths of it, and no five consonants in a row). */
const readsAsWords = (token) => {
  if (/[+/=]/.test(token)) return false;
  const pieces = token.split(/[-_]+/).filter(Boolean).flatMap((part) => (/^\d{1,4}$/.test(part) ? [] : part.match(/[A-Z]+(?![a-z])|[A-Z]?[a-z]+\d{0,4}|\d+/g) ?? [part]));
  if (!pieces.length || pieces.some((p) => !/^[A-Za-z]+\d{0,4}$/.test(p))) return false;
  const words = pieces.map((p) => p.replace(/\d+$/, '').toLowerCase());
  if (words.join('').length / words.length < 3) return false;
  return words.every((w) => { if (w.length < 4) return true; const vowels = (w.match(/[aeiouy]/g) ?? []).length / w.length; return vowels >= 0.2 && vowels <= 0.7 && !/[^aeiouy]{5}/.test(w); });
};
/** Is this token a key? Long and not words: digits among letters, a base64 sign, letters in no word's order, a JWT.
 *  (All digits is an account number's business.) Errs on yes: a random-looking id is replaced too. */
export const isKeyLike = (token) => /^eyJ[\w-]+\.[\w-]+\./.test(token) || (token.length >= 20 && !/^\d+$/.test(token) && !/^[-_=+/]+$/.test(token) && !readsAsWords(token));
/** What a pattern's shape lets through that is not the thing: a long name is not a key, 13 digits are not a card. */
const REALLY = { key: isKeyLike, card: (s) => { const d = s.replace(/\D/g, ''); return d.length >= 13 && d.length <= 19 && luhn(d); } };
const WHOLE = { money: new RegExp(`^${MONEY.source}$`), email: new RegExp(`^${PATTERNS.email.source}$`) };
const PATTERN_KIND = { money: 'Amount', email: 'Email', key: 'Key', card: 'Card number', taxid: 'Tax ID', phone: 'Phone number', account: 'Account number', digits: 'Number' };
/** A heading or a label that says the thing under it is a secret or an account number. */
export const SENSITIVE = /\b(?:api[ _-]?key|keys?|tokens?|secret|password|passcode|pin|bearer|routing|iban|swift|cvv|cvc|tin|ssn|ein|tax(?:payer)?[ _-]?(?:id|number|no)|(?:card|account|acct)(?:[ _-]?(?:number|no|#|id))?)\b(?![ _-]?(?:type|status|name|usage|prefix))/i;
/** A column heading that says its cells are sums of money, whatever they look like ("Balance": 1,204.50). */
export const MONEYISH = /\b(?:balance|amount|subtotal|fees?|price|charges?|cost|salary|revenue)\b(?![^%]*%)/i;
/** An element's own id, name or test id that says it HOLDS a secret or an account number, whatever the value looks
 *  like ("apiKeyValue", "client_secret", "bearerToken", "accountNumber"). Compounds only: a bare "key" or "api" in an
 *  id is a keyboard hint or a docs link as often as a secret. */
export const SECRET_ID = /api[-_ ]?key|secret|token|passw(?:or)?d|bearer|private[-_ ]?key|access[-_ ]?key/i, ACCOUNT_ID = /(?:account|acct|card)[-_ ]?(?:number|no|num)|routing|(?:^|[-_ ])(?:ssn|tin|ein)(?:$|[-_ A-Z])|tax[-_ ]?id/i;
/** The elements that hold a value (not the ones that name one: a label, a heading, a button). */
const VALUE_TAGS = new Set(['span', 'code', 'pre', 'kbd', 'samp', 'output', 'data', 'dd', 'p', 'div', 'strong', 'b', 'em', 'i', 'small', 'mark', 'var', 'td']);
const ISO_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])(?!\d)/;
// Every attribute can hold a value except the structural ones (an allow-list: film/src/standins.ts). CSS has its own pass.
const isShown = (name) => !isStructuralAttr(name) && name !== 'style' && name !== '_cssText';
// An inlined or local asset, or the missing marker, is not a value: film/src/css.ts `isAssetValue`, the same test the
// sweep uses. Narrow on purpose: a value that merely starts like one (about:<an email>) is scrubbed like any other.
const LINK_DATA = /href|url|link|src/i;

const NO_VALUE_TYPES = new Set(['button', 'submit', 'reset', 'checkbox', 'radio', 'hidden', 'range', 'color', 'image', 'file']);
const INERT = ['script', 'style', 'noscript'];
// Elements that sit inside a line of text: a value split over them reads as one ("<span>$</span>50.00", a phone number half in bold).
const INLINE = new Set(['a', 'abbr', 'b', 'bdi', 'bdo', 'cite', 'code', 'data', 'del', 'em', 'font', 'i', 'ins', 'kbd', 'mark', 'q', 's', 'samp', 'small', 'span', 'strong', 'sub', 'sup', 'time', 'tspan', 'u', 'var']);
const AVATAR = /avatar|profile|user|photo/i;
const isAvatar = (img, parent) => AVATAR.test(`${attr(img, 'alt') ?? ''} ${idClass(img)} ${isAssetValue(attr(img, 'src') ?? '') ? '' : attr(img, 'src') ?? ''}`) || AVATAR.test(idClass(parent));

/** The fields that say who someone is take the roster's person, whatever was recorded (a recorder may store only asterisks). */
function personField(label, p) {
  const k = label.toLowerCase().replace(/[^a-z]/g, '');
  return { firstname: p.first, givenname: p.first, lastname: p.last, surname: p.last, familyname: p.last, name: `${p.first} ${p.last}`, fullname: `${p.first} ${p.last}`,
    email: emailOf(p), emailaddress: emailOf(p), username: (p.first[0] + p.last).toLowerCase() }[k] ?? null;
}

// ---- the signed-in user

const NAME = /^[A-Z][\p{L}'’-]+( [A-Z][\p{L}'’-]+){1,2}$/u, ONE_WORD = /^\p{Lu}[\p{L}'’-]+$/u, USERISH = /user|profile|account|avatar/i, HEADERISH = /topbar|navbar|header/i;
const NOT_A_NAME = ['option', 'select', 'label', 'th', 'thead', 'legend', 'textarea', 'svg', 'head', 'h1', 'h2', 'h3', 'h4', ...INERT];
const PICTURE = /avatar|photo|profile/i, UI_TEXT = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'button', 'a', 'summary', 'label', 'legend', 'th'];
/** The signed-in user's name, from the screens of ONE site: { full, first, last } or null. Never run unasked (a
 *  tutorial asks with `use: ["user"]`; a `user` rule names the element instead: resolveUser), and it would rather find
 *  no one than the wrong text: a wrong "name" has its words replaced across the whole site.
 *  A candidate is text shaped like a person's name (two or three capitalised words, 40 characters at most), outside
 *  options, labels, column headings and titles (h1 to h4). It is dropped when a word of it is the site's own: a word
 *  of its labels, column headings and legends ("User Management" beside a "User API key" field), or its first or
 *  last word standing in two or more OTHER headings, buttons and links ("Invoice Settings" on a site with "Webhook
 *  Settings" and "Support Settings"). What is left scores by evidence, at its best:
 *    3  in the page's header (header, nav, role=banner, a class or id that says topbar, navbar or header), in or beside
 *       an element whose class or id says user, profile, account or avatar (a link or button counts only when it says
 *       so itself); or, anywhere, beside a picture of a person (a class or id that says avatar, photo or profile)
 *    0  anywhere else: "user" or "account" in a class outside the header is a users table or a bank account as
 *       often as a person
 *    5  more when its first or last word also stands alone on the user menu's button in the header ("Rita" beside
 *       the avatar), unless that word backs two or more different candidates (a button that reads "Account");
 *       this alone makes a candidate of a name standing anywhere
 *    5  more when an email with its first or last name in it stands beside it
 *    5  for an unmasked first-name and last-name field pair in such a place
 *  The best score wins, then the one seen most often. Returns the name to code only (`at`, not enumerable, says where
 *  it stood: { tree: index, node }): nothing is printed.
 *  ponytail: a heuristic. When it finds no one, the name is ordinary text: a `user` rule or a blind rule covers it. */
export function findSignedInUser(treeOrTrees) {
  const trees = Array.isArray(treeOrTrees) ? treeOrTrees : [treeOrTrees];
  const found = new Map(), alone = new Set(), siteWords = new Set(), uiTexts = new Set();
  const add = (full, points, at) => { const e = found.get(full) ?? { points: -1, times: 0, at }; if (points > e.points) { e.points = points; e.at = at; } e.times++; found.set(full, e); };
  const wordsOf = (s) => s.toLowerCase().match(/\p{L}{2,}/gu) ?? [];
  const inHeader = (up) => up.some((a) => a.tagName === 'header' || a.tagName === 'nav' || attr(a, 'role') === 'banner' || HEADERISH.test(idClass(a)));
  trees.forEach((tree) => walk(tree, (n) => {
    if (n.type === ELEMENT && (n.tagName === 'label' || n.tagName === 'legend' || (n.tagName === 'th' && closest(n, tree, ['thead'])))) for (const w of wordsOf(labelText(n))) siteWords.add(w);
    if (n.type === ELEMENT && UI_TEXT.includes(n.tagName) && !closest(n, tree, ['td'])) { const s = textOf(n).replace(/\s+/g, ' ').trim().toLowerCase(); if (s && s.length <= 40) uiTexts.add(s); }
  }));
  trees.forEach((tree, index) => {
    const fields = {}, { parent } = indexOf(tree);
    walk(tree, (n) => {
      if (n.type === ELEMENT && n.tagName === 'input' && attr(n, 'value') && !/^\*+$/.test(attr(n, 'value'))) {
        const k = labelOf(n, tree).toLowerCase().replace(/[^a-z]/g, ''), which = k === 'firstname' ? 'first' : k === 'lastname' || k === 'surname' ? 'last' : null;
        if (which && !fields[which] && ONE_WORD.test(attr(n, 'value').trim()) && ancestors(n, tree).some((a) => USERISH.test(idClass(a)) || HEADERISH.test(idClass(a)) || a.tagName === 'header' || a.tagName === 'nav')) fields[which] = attr(n, 'value').trim();
      }
      if (n.type !== TEXT) return;
      const s = (n.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (!s || s.length > 40) return;
      const up = ancestors(n, tree), tags = up.map((a) => a.tagName);
      const press = up.findIndex((a) => a.tagName === 'button' || a.tagName === 'a');
      if (ONE_WORD.test(s)) { // one word on the user menu's button, in the header: "Rita" beside the avatar
        if (press >= 0 && USERISH.test(idClass(up[press])) && inHeader(up)) alone.add(s.toLowerCase());
        return;
      }
      if (!NAME.test(s) || tags.some((t) => NOT_A_NAME.includes(t))) return;
      const [p, g] = up, beside = [p, g].flatMap((e) => (e && parent.get(e) ? kids(parent.get(e)).filter((x) => x !== e) : []));
      const said = press >= 0 ? up.slice(0, press + 1).some((a) => USERISH.test(idClass(a)))
        : USERISH.test(idClass(p)) || USERISH.test(idClass(g)) || beside.some((x) => USERISH.test(idClass(x)) || (x.tagName === 'img' && isAvatar(x, null)));
      const pictured = press < 0 && (PICTURE.test(idClass(p)) || beside.some((x) => PICTURE.test(idClass(x)) || (x.tagName === 'img' && isAvatar(x, null))));
      const names = wordsOf(s), mailed = (textOf(g ?? p ?? n).match(PATTERNS.email) ?? []).some((m) => m.split('@')[0].toLowerCase().split(/[._+-]/).some((part) => part.length >= 3 && (part === names[0] || part === names.at(-1) || part === names[0] + names.at(-1) || part === names[0][0] + names.at(-1))));
      add(s, ((said && inHeader(up)) || pictured ? 3 : 0) + (mailed ? 5 : 0), { tree: index, node: p?.id });
    });
    if (fields.first && fields.last) add(`${fields.first} ${fields.last}`, 5, { tree: index, node: null });
  });
  const firstLast = (full) => { const w = full.toLowerCase().split(' '); return [w[0], w.at(-1)]; };
  const used = (word, full) => [...uiTexts].filter((t) => !t.includes(full.toLowerCase()) && new RegExp(`(?<![\\p{L}\\p{N}])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'u').test(t)).length;
  const live = [...found].filter(([full]) => !wordsOf(full).some((x) => siteWords.has(x)) && !firstLast(full).some((w) => used(w, full) >= 2));
  const backs = (word) => live.filter(([full]) => firstLast(full).includes(word)).length;
  let best = null;
  for (const [full, e] of live) {
    const points = e.points + (firstLast(full).some((w) => alone.has(w) && backs(w) < 2) ? 5 : 0);
    if (points > 0 && (!best || points > best.points || (points === best.points && e.times > best.times))) best = { full, points, times: e.times, at: e.at };
  }
  return best ? Object.defineProperty({ full: best.full, first: best.full.split(' ')[0], last: best.full.split(' ').at(-1) }, 'at', { value: best.at }) : null;
}

const PERSON = /^[\p{L}'’.-]{2,}( [\p{L}'’.-]+){0,2}$/u;
/** Who is signed in on ONE site of a recording, and how that was found. `screens`: [{ i, tree }], the site's screens
 *  as recorded, in order. `userRules`: the entries of rules.json `user` that are for this site; the last one counts:
 *    { off: true }                       look for no one
 *    { selector } | { screen, node }     the element that holds the name: read from it, by code (nobody types a name).
 *                                        A selector is tried on each screen (or on `screen`) and must find exactly ONE
 *                                        element whose text is a name (one to three words of letters, 40 characters
 *                                        at most); otherwise no user, and why. Detection is not tried instead.
 *  With no rule, `detect` says whether to look (rules.json `use: ["user"]`): findSignedInUser, above.
 *  Returns { user: { full, first, last } | null, by: 'rule' | 'detection' | 'off' | 'none', screen?, node?, reason? }:
 *  the name goes to the scrub and to the sweep's list, and is never printed. */
export function resolveUser(screens, userRules = [], detect = true) {
  const rule = userRules.at(-1);
  if (rule?.off) return { user: null, by: 'off' };
  if (rule) {
    let reason = 'no such element';
    for (const { i, tree } of screens.filter((s) => rule.screen == null || s.i === rule.screen)) {
      let hits = [];
      if (Number.isInteger(rule.node)) hits = [findById(tree, rule.node)].filter((n) => n?.type === ELEMENT);
      else if (typeof rule.selector === 'string') { try { hits = select(tree, rule.selector, tree); } catch { hits = []; } }
      if (hits.length !== 1) continue;
      const name = textOf(hits[0]).replace(/\s+/g, ' ').trim();
      if (!name) continue;
      if (name.length > 40 || !PERSON.test(name)) { reason = 'not a name'; continue; }
      return { user: { full: name, first: name.split(' ')[0], last: name.split(' ').at(-1) }, by: 'rule', screen: i, node: hits[0].id };
    }
    return { user: null, by: 'none', reason };
  }
  const user = detect ? findSignedInUser(screens.map((s) => s.tree)) : null;
  return user ? { user: { ...user }, by: 'detection', screen: screens[user.at.tree].i, node: user.at.node } : { user: null, by: 'none' };
}

// ---- blind rules

// The values the ARIA specification itself fixes for a state or property (WAI-ARIA 1.2), written out. A `blindAll ...
// as: attributes` rule empties them with everything else the element says, but they are not what the page SAID: listed
// as originals, "menu" (aria-haspopup) or "page" (aria-current) would fail the sweep on every button that reads the
// same word. Exact, lower case, by attribute: any other value of these attributes (a name in aria-haspopup) and every
// value of any other attribute (aria-label, title, data-*) is an original like before. The HTML attributes with fixed
// values (role, type, dir, autocomplete, ...) are structure (film/src/standins.ts) and never get this far.
const tokens = (s) => new Set(s.split(' '));
const TRISTATE = 'true false mixed undefined', TRUTH = 'true false undefined', BOOL = 'true false';
const ARIA_TOKENS = new Map(Object.entries({
  'aria-autocomplete': 'inline list both none', 'aria-checked': TRISTATE, 'aria-pressed': TRISTATE, 'aria-current': 'page step location date time true false',
  'aria-expanded': TRUTH, 'aria-grabbed': TRUTH, 'aria-hidden': TRUTH, 'aria-selected': TRUTH, 'aria-haspopup': 'false true menu listbox tree grid dialog',
  'aria-invalid': 'grammar false spelling true', 'aria-live': 'assertive off polite', 'aria-orientation': 'horizontal undefined vertical', 'aria-sort': 'ascending descending none other',
  'aria-atomic': BOOL, 'aria-busy': BOOL, 'aria-disabled': BOOL, 'aria-modal': BOOL, 'aria-multiline': BOOL, 'aria-multiselectable': BOOL, 'aria-readonly': BOOL, 'aria-required': BOOL,
  'aria-relevant': 'additions all removals text', 'aria-dropeffect': 'copy execute link move none popup',
}).map(([name, list]) => [name, tokens(list)]));
const ARIA_TOKEN_LISTS = new Set(['aria-relevant', 'aria-dropeffect']); // the two whose value is several of its tokens
/** Is `value` nothing but the specification's own token(s) for attribute `name`? */
export const isSpecToken = (name, value) => { const list = ARIA_TOKENS.get(name), v = String(value).trim(); return !!list && (ARIA_TOKEN_LISTS.has(name) ? v.split(/\s+/).every((t) => list.has(t)) : list.has(v)); };

const blinded = new WeakMap();
/** Replaces node `node` of `tree` as kind `as`. Returns what Claude may see: the place, the length, the tag. Never the text. */
export function blindReplace(tree, { node, as, label }, ledger, people = PEOPLE, company = COMPANY) {
  const target = findById(tree, node);
  if (!target) return { ok: false, reason: 'no such node' };
  const texts = []; walk(target, (n) => { if (n.type === 3 && n.textContent.trim()) texts.push(n); });
  const value = attr(target, 'value');
  const original = (value ?? texts.map((t) => t.textContent).join('')).trim();
  const was = blinded.get(target);
  if (was && was.standIn === original) return { ok: true, node, tag: target.tagName, length: was.length, kind: 'blind' }; // asked again: it already reads as its stand-in
  const length = original.length;
  const standIn = as === 'name' ? `${people[0].first} ${people[0].last}` : as === 'company' ? company : as === 'email' ? ledger.email(original)
    : as === 'key' ? secretFor(label ?? labelOf(target, tree)) : as === 'amount' ? ledger.amount(/[$€£]/.test(original) ? original : '$' + original)
    : ledger.series(label ?? seriesName(headingOf(target, tree) || labelOf(target, tree)), original);
  if (value != null) target.attributes.value = standIn;
  else texts.forEach((t, i) => { t.textContent = i ? '' : standIn; });
  for (const a of ['title', 'alt', 'aria-label']) if (target.attributes?.[a]) target.attributes[a] = standIn;
  blinded.set(target, { standIn, length });
  return { ok: true, node, tag: target.tagName, length, kind: 'blind' };  // no `original`, no `standIn` in the answer
}

// ---- the chart

/** Redraws an ApexCharts line chart inside its own grid: `values` in place of the recorded series, the y axis
 *  relabelled to a round scale that holds them (same number of ticks). Returns the nodes it changed, or false, touching
 *  nothing, when the chart is not built the way this expects. Same geometry as the DOM version it replaces.
 *  ponytail: one series, smooth line, markers; no area, bars or data labels. */
function redrawLineChart(svg, values, tree, newText) {
  const num = (e, a) => Number(attr(e, a));
  const lines = select(svg, '.apexcharts-gridlines-horizontal line', tree), line = select(svg, '.apexcharts-line-series path.apexcharts-line', tree)[0];
  const dots = select(svg, '.apexcharts-line-series circle.apexcharts-marker', tree).sort((a, b) => num(a, 'j') - num(b, 'j'));
  const labels = select(svg, '.apexcharts-yaxis-label', tree).sort((a, b) => num(a, 'y') - num(b, 'y')); // top first
  if (!line || lines.length < 2 || dots.length !== values.length || labels.length !== lines.length) return false;
  const h = Math.max(...lines.map((l) => num(l, 'y1'))), ticks = lines.length - 1;
  const rough = Math.max(...values) / ticks, mag = 10 ** Math.floor(Math.log10(rough)), step = [1, 2, 5, 10].map((k) => k * mag).find((s) => s >= rough);
  const pts = values.map((v, i) => ({ x: num(dots[i], 'cx'), y: h - (v / (step * ticks)) * h }));
  // ApexCharts' "smooth": each span a cubic whose handles sit at the span's middle, level with its ends
  line.attributes.d = pts.map((p, i) => (i ? `C${(pts[i - 1].x + p.x) / 2} ${pts[i - 1].y} ${(pts[i - 1].x + p.x) / 2} ${p.y} ${p.x} ${p.y}` : `M${p.x} ${p.y}`)).join('');
  dots.forEach((d, i) => { d.attributes.cy = String(pts[i].y); });
  const touched = [line, ...dots];
  labels.forEach((l, i) => {
    for (const part of select(l, 'tspan, title', tree)) {
      const ts = (part.childNodes ?? []).filter((c) => c.type === TEXT);
      if (!ts.length) { ts.push(newText()); part.childNodes = [...(part.childNodes ?? []), ts[0]]; }
      ts.forEach((t, k) => { t.textContent = k ? '' : String(step * (ticks - i)); touched.push(t); });
    }
  });
  return touched;
}

// ---- the scrub

/** Applies `rules` (rulesFor, or DEFAULT_RULES) to one screen's tree, changing it in place. `ledger`: one per
 *  recording, so screens agree. `opts.user`: findSignedInUser's answer for the recording, or null. `opts.originals`:
 *  an array that receives what blind rules replaced ({ kind, value }), for the sweep's list and nothing else.
 *  Order: blind rules, columns kept on purpose, where links go, the signed-in user, fills and charts, the default
 *  rules as listed, CSS. A node one rule has written (or kept) is left alone by the ones after it (a fill writes over
 *  a blind rule or the user's name).
 *  Returns { changed: [{ id, kind }], applied: [blindReplace's answers], dropped: [asset names no longer shown],
 *  kept: [{ rule, ok, table, column, cells, reason? }] (keepColumns: the table's node id, the rule's own word for the
 *  column, how many cells were left as recorded, why none), headers: [{ rule, table, others, replaced: [cell ids] }]
 *  (the other header cells of those tables, and which a rule rewrote) }: no text. */
export function scrub(tree, rules = DEFAULT_RULES, ledger = makeLedger(), opts = {}) {
  const { user = null, people = PEOPLE, company = COMPANY, originals } = opts;
  const ix = indexOf(tree, true), me = people[0], meFull = `${me.first} ${me.last}`;
  const changed = [], applied = [], dropped = [], done = new Set(), byUser = new Set();
  const note = (node, kind) => { changed.push({ id: node.id, kind }); };
  const mark = (node, kind) => { done.add(node); note(node, kind); };
  /** what a rule is about to replace, for the sweep's list: only what WAS replaced is ever looked for */
  const saw = (kind, value) => { const v = String(value ?? '').replace(/\s+/g, ' ').trim(); if (v && !/^\*+$/.test(v)) originals?.push({ kind, value: v }); };
  const controls = new Set();
  const up = (n) => ancestors(n, tree);
  const inert = (n) => up(n).some((a) => INERT.includes(a.tagName));
  const newText = () => { const t = { type: TEXT, textContent: '', id: ++ix.max }; ix.byId.set(t.id, t); return t; };
  /** the text nodes under `root` that hold something and that no rule has written yet */
  const texts = (root, all = false) => { const out = []; (function go(n) { if (n.type === TEXT) { if ((n.textContent ?? '').trim() && (all || !done.has(n))) out.push(n); } else if (n.type !== ELEMENT || !INERT.includes(n.tagName)) for (const c of n.childNodes ?? []) go(c); })(root); return out; };
  const own = (el) => (el.childNodes ?? []).filter((c) => c.type === TEXT && (c.textContent ?? '').trim());
  const keep = new Set(rules.filter((r) => r.kind === 'keep').flatMap((r) => r.words).map(norm));
  const every = (tags, fn) => walk(tree, (n) => { if (n.type === ELEMENT && tags.includes(n.tagName) && !done.has(n)) fn(n); });

  walk(tree, (n) => { if (n.type === COMMENT && n.textContent) n.textContent = ''; }); // a comment is never shown, and it can hold anything

  /** a select becomes one option reading `text`: the recorder masks which option was chosen, and the others are data too */
  const oneOption = (sel, text, kind) => {
    let opt = null; walk(sel, (n) => { if (!opt && n.tagName === 'option') opt = n; });
    if (attr(sel, 'value') != null || attr(sel, 'title') != null) { delete sel.attributes.value; delete sel.attributes.title; note(sel, kind); }
    if (!opt) return false;
    const t = (opt.childNodes ?? []).find((c) => c.type === TEXT) ?? newText();
    t.textContent = text;
    opt.attributes = { selected: true };
    opt.childNodes = [t];
    sel.childNodes = [opt];
    ix.parent.set(opt, sel); ix.parent.set(t, opt);
    for (const n of [sel, opt, t]) mark(n, kind);
    return true;
  };

  // 1. blind rules: an element an agent named, replaced as a kind
  for (const r of rules.filter((x) => x.kind === 'blind')) {
    const target = findById(tree, r.node);
    if (!target) { applied.push({ ok: false, node: r.node, reason: 'no such node' }); continue; }
    const before = texts(target, true);
    for (const t of before) originals?.push({ kind: r.as, value: t.textContent.replace(/\s+/g, ' ').trim() });
    if (attr(target, 'value') && !/^\*+$/.test(attr(target, 'value'))) originals?.push({ kind: r.as, value: attr(target, 'value') });
    const length = (attr(target, 'value') ?? before.map((t) => t.textContent).join('')).trim().length;
    if (target.tagName === 'select') oneOption(target, '?', 'blind');
    const answer = blindReplace(tree, r, ledger, people, company);
    applied.push(target.tagName === 'select' ? { ...answer, length } : answer);
    walk(target, (n) => { done.add(n); });
    for (const n of [target, ...before]) note(n, 'blind');
  }

  // 1. (again) blindAll (rules.json): EVERY element a selector matches on the screens the rule is for, replaced as a
  // kind, the way a blind rule replaces one element by node: the rows of a message list (each sender "Sender 1",
  // "Sender 2", each subject "Subject 1"), a strip of tabs, the tags of a sidebar. `as`: series (numbered under
  // `label`), number, name, company, email, key, amount, or picture (an image becomes a flat block, initials drawn as
  // text are emptied). One ledger for the recording: the same original under the same label reads the same on every
  // screen. A list changes from screen to screen, so no match is not an error: every screen answers
  // { rule, selector, matched, replaced } (replaced: the matches that held something), and a selector that cannot be
  // read matches nothing and says so. An element a blind rule by node already wrote is left as that rule left it.
  // `within: true` (with `as: "company"`): only the company INSIDE the element's text is replaced and the rest reads as
  // recorded (a message's subject line that names the customer). The company is not typed by anyone: it is whatever a
  // rule of this recording has already replaced `as: "company"` (a blind rule on the name in the message's body, this
  // screen's or an earlier one's). It fails closed: when none of those is in the text, the whole text is replaced as
  // a series, as without `within`. Nothing is marked done, so the automatic rules still read the rest. `within` in
  // the answer: how many elements kept their own words.
  const blindedAll = [];
  const companies = () => [...new Set((originals ?? []).filter((o) => o.kind === 'company').map((o) => o.value))].filter((v) => v.length >= 3).sort((a, b) => b.length - a.length);
  const inside = (words) => (words.length ? new RegExp(words.map((v) => v.split(' ').map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+')).join('|'), 'gi') : null);
  for (const r of rules.filter((x) => x.kind === 'blindAll')) {
    let found = [], reason;
    try { found = select(tree, String(r.selector), tree); } catch { reason = 'selector not understood'; }
    let replaced = 0, within = 0;
    for (const target of found) {
      if (done.has(target)) continue;
      const ts = texts(target), whole = ts.map((t) => t.textContent).join('').replace(/\s+/g, ' ').trim();
      // Only what this rule REWRITES is marked done (the text nodes it wrote). Nothing else under the element is taken
      // out of the later rules' reach: a key, an amount or a field inside a row whose tooltip was emptied is still met
      // by the automatic rules (security review of bdfd9a9: the whole subtree used to be marked).
      if (r.as === 'picture') { // the element and every picture in it: flat; what it says (alt, title, initials drawn as text): emptied
        let did = false;
        walk(target, (n) => {
          if (n.type !== ELEMENT || !n.attributes) return;
          const a = n.attributes, was = JSON.stringify(a);
          for (const k of ['src', 'href', 'xlink:href']) if (['img', 'image'].includes(n.tagName) && typeof a[k] === 'string' && a[k]) { if (a[k].startsWith(ASSET_PREFIX)) dropped.push(a[k].slice(ASSET_PREFIX.length)); a[k] = FLAT_BLOCK; }
          if ('rr_dataURL' in a) delete a.rr_dataURL;
          for (const k of ['srcset', 'alt', 'title', 'aria-label']) if (a[k]) { if (k !== 'srcset') saw('name', a[k]); if (k === 'srcset') delete a[k]; else a[k] = ''; }
          if (typeof a.style === 'string' && /url\(/i.test(a.style)) a.style = a.style.replace(/url\(\s*(?:"[^"]*"|'[^']*'|[^)]*)\)/gi, 'none');
          if (JSON.stringify(a) !== was) { note(n, 'blind'); did = true; }
        });
        for (const t of ts) { saw('name', t.textContent); t.textContent = ''; mark(t, 'blind'); did = true; }
        if (did) replaced++;
        continue;
      }
      if (r.as === 'attributes') { // what the element SAYS without showing it (a row's aria-label that repeats its sender and subject, a tooltip): emptied; its text is another rule's
        let did = false;
        // (emptied whatever it is; listed as an original unless it is the specification's own token for that attribute, or a `keep` word: isSpecToken, above)
        for (const [k, v] of Object.entries(target.attributes ?? {})) if (typeof v === 'string' && v.trim() && isShown(k) && !isAssetValue(v) && !['href', 'xlink:href', 'action', 'value', 'placeholder'].includes(k) && !/^(true|false|-?\d{1,3}|#[\w-]*)$/.test(v)) { if (!isSpecToken(k, v) && !keep.has(norm(v))) saw('series', v); target.attributes[k] = ''; did = true; }
        if (did) { note(target, 'blind'); replaced++; }
        continue;
      }
      if (!ts.length || keep.has(whole.toLowerCase())) continue; // (a word or a value listed in `keep` stays: the one address the user called out, in a list of senders)
      const partial = r.within === true && r.as === 'company', re = partial ? inside(companies()) : null;
      if (re && ts.some((t) => (re.lastIndex = 0, re.test(t.textContent)))) {
        const swap = (s) => s.replace(re, company);
        for (const t of ts) { const next = swap(t.textContent); if (next !== t.textContent) { t.textContent = next; note(t, 'blind'); } }
        walk(target, (n) => { if (n.type === ELEMENT) for (const k of ['title', 'alt', 'aria-label', 'data-tooltip', 'data-title', 'data-original-title', 'data-bs-original-title']) if (typeof n.attributes?.[k] === 'string' && swap(n.attributes[k]) !== n.attributes[k]) { n.attributes[k] = swap(n.attributes[k]); note(n, 'blind'); } });
        replaced++; within++;
        continue;
      }
      const as = partial ? 'series' : r.as;                    // (the company was not found in it: all of it goes)
      saw(as, whole);
      const label = r.label ?? 'Item';
      const next = as === 'name' ? meFull : as === 'company' ? company : r.as === 'email' ? ledger.email(whole) : r.as === 'key' ? secretFor(label)
        : r.as === 'amount' ? ledger.amount(/[$€£]/.test(whole) ? whole : '$' + whole) : ledger.series(label, whole);
      ts.forEach((t, i) => { t.textContent = i ? '' : next; mark(t, 'blind'); });
      walk(target, (n) => { if (n.type === ELEMENT) for (const k of ['title', 'alt', 'aria-label', 'data-tooltip', 'data-title', 'data-original-title', 'data-bs-original-title']) if (typeof n.attributes?.[k] === 'string' && n.attributes[k].trim()) { saw(r.as, n.attributes[k]); n.attributes[k] = next; note(n, 'blind'); } });
      replaced++;
    }
    blindedAll.push({ rule: r.i, selector: String(r.selector), matched: found.length, replaced, ...(r.within === true ? { within } : {}), ...(reason ? { reason } : {}) });
  }

  // 1a. pages full of other people's text (rules.json `only`): on a screen such a rule names, ONLY the subtrees it
  // keeps are scrubbed by the rules below; everything else is hidden whatever it is. Outside the kept subtrees: every
  // text node becomes a line of GREEK as long as its text (the white space around it stays, so the page lays out as
  // it did); every attribute that is not structure is emptied, but a field's value and a placeholder, which show,
  // become GREEK too, and a bare true/false or a number of three digits at most stays (a page's CSS reads those);
  // every picture becomes a flat block (img, an SVG image, a recorded canvas, a poster, a background in a style
  // attribute). It errs on hiding: nothing is judged to be "only interface", and a keep entry that finds no element,
  // or several when the rule does not say `all`, keeps nothing and says so. A node a blind rule wrote stays as that
  // rule left it. What was hidden goes to the sweep's list (`greeked`) and is marked `greek` in what the scrub changed.
  // Answered: { texts, attributes, pictures, keeps: [{ rule, keep, ok, matched, reason? }] }, or null with no such rule.
  let only = null, hidden = null;
  const onlyRules = rules.filter((x) => x.kind === 'only');
  if (onlyRules.length) {
    const inside = new Set(), saw = (value) => { const v = value.replace(/\s+/g, ' ').trim(); if (v && !/^[\s*]+$/.test(v)) originals?.push({ kind: 'greeked', value: v }); };
    only = { texts: 0, attributes: 0, pictures: 0, keeps: [] };
    hidden = new Set();
    for (const r of onlyRules) for (const k of Array.isArray(r.keep) ? r.keep : []) {
      let found = [];
      if (Number.isInteger(k)) found = [findById(tree, k)].filter((n) => n?.type === ELEMENT);
      else if (typeof k === 'string') { try { found = select(tree, k, tree); } catch { found = []; } }
      const roots = found.filter((n) => !up(n).some((a) => found.includes(a))), ok = roots.length === 1 || (roots.length > 1 && r.all === true); // a match inside another match is the same subtree
      only.keeps.push({ rule: r.i, keep: k, ok, matched: roots.length, ...(ok ? {} : { reason: roots.length ? `ambiguous: ${roots.length} subtrees` : 'no such element' }) });
      if (ok) for (const root of roots) walk(root, (n) => inside.add(n));
    }
    const picture = (n) => { only.pictures++; note(n, 'greek'); };
    walk(tree, (n) => {
      if (inside.has(n) || done.has(n)) return;
      if (n.type === TEXT) {
        const text = n.textContent ?? '', parent = ix.parent.get(n);
        if (n.isStyle || parent?.tagName === 'style' || !text.trim()) return;                       // a stylesheet is not text (the CSS pass reads it)
        if (parent?.tagName === 'script' || parent?.tagName === 'noscript') { n.textContent = ''; mark(n, 'greek'); return; } // never shown
        saw(text);
        n.textContent = text.replace(/\S[\s\S]*\S|\S/, (inner) => GREEK.repeat([...inner].length));
        only.texts++; mark(n, 'greek');
        return;
      }
      if (n.type !== ELEMENT) return;
      done.add(n); hidden.add(n);
      const a = n.attributes ?? (n.attributes = {}), type = String(a.type ?? 'text').toLowerCase();
      if (n.tagName === 'meta' && (a['http-equiv'] != null || /^(viewport|charset)$/i.test(String(a.name ?? '')))) return;
      if ('rr_dataURL' in a) { delete a.rr_dataURL; picture(n); }
      if (['img', 'image', 'source', 'video', 'audio', 'embed', 'object', 'track'].includes(n.tagName) || (n.tagName === 'input' && type === 'image')) {
        for (const k of ['src', 'href', 'xlink:href', 'data', 'poster', 'srcset']) if (typeof a[k] === 'string' && a[k]) {
          if (a[k].startsWith(ASSET_PREFIX)) dropped.push(a[k].slice(ASSET_PREFIX.length));
          if (k === 'srcset' || k === 'poster') delete a[k]; else a[k] = FLAT_BLOCK;
          picture(n);
        }
      }
      if (typeof a.style === 'string' && /url\(/i.test(a.style)) { a.style = a.style.replace(/url\(\s*(?:"[^"]*"|'[^']*'|[^)]*)\)/gi, 'none'); picture(n); }
      for (const [k, v] of Object.entries(a)) {
        if (k === 'action' || k === 'formaction' || ((k === 'href' || k === 'xlink:href') && (n.tagName === 'a' || n.tagName === 'area'))) { if (v !== '#' && !/^#[\w-]*$/.test(v)) { a[k] = '#'; note(n, 'greek'); } continue; } // where a link goes: nowhere (it stays a link, so it is drawn as one)
        if (typeof v !== 'string' || !v.trim() || !isShown(k) || isAssetValue(v) || /^(true|false|-?\d{1,3}|#[\w-]*)$/.test(v)) continue; // (a bare #id is a reference inside the page: an SVG icon's <use>)
        saw(v);
        const shows = k === 'placeholder' || k === 'label' || (k === 'value' && ((n.tagName === 'input' && (!NO_VALUE_TYPES.has(type) || ['button', 'submit', 'reset'].includes(type))) || n.tagName === 'textarea'));
        a[k] = shows ? GREEK.repeat([...v.trim()].length) : '';
        only.attributes++; note(n, 'greek');
      }
    });
  }

  // 1b. columns kept on purpose (rules.json `keepColumns`): in the ONE table named, the header cells named and the
  // cells under them keep their visible text exactly as recorded (a blind rule, above, still wins). It fails closed:
  // no table or several, a name that is not in a header row (a thead's row, a row of th cells, or the table's first
  // row), `near` without a screen: nothing is kept, and the answer says why. Only TEXT is kept (and a `title` that
  // reads exactly as the element's text): every other attribute, and any field inside a kept cell, still goes through
  // the user, field and pattern rules. The other header cells go through the normal rules; those a rule rewrote are
  // answered (`headers`). Every column is answered ({ rule, table, column, cells, reason? }: the rule's own words
  // for the column, never a cell's text) and its text nodes are marked `kept` for the sweep.
  const kept = [], heads = [], keptTitles = new Set();
  const leave = (cell) => walk(cell, (n) => {
    if (n.type === TEXT) { done.add(n); note(n, 'kept'); }
    else if (n.type === ELEMENT && norm(attr(n, 'title') ?? '') && norm(attr(n, 'title')) === norm(textOf(n))) { keptTitles.add(n); note(n, 'kept'); }
  });
  const inThead = (row) => closest(row, tree, ['thead', 'table']).tagName === 'thead';
  const headerRows = (table) => rowsOf(table, tree).filter((row, i) => i === 0 || inThead(row) || (cellsOfRow(row).length > 0 && cellsOfRow(row).every((c) => c.tagName === 'th')));
  const tablesFor = (spec) => {
    let at = [];
    if (Number.isInteger(spec)) at = [findById(tree, spec)];
    else if (typeof spec === 'string') { try { at = select(tree, spec, tree); } catch { at = []; } }
    else if (typeof spec?.near === 'string') walk(tree, (n) => { if (n.type === ELEMENT && n.tagName === 'table' && headerRows(n).some((row) => cellsOfRow(row).some((c) => norm(textOf(c)) === norm(spec.near)))) at.push(n); });
    return [...new Set(at.map((n) => n && closest(n, tree, ['table'])).filter(Boolean))];
  };
  /** The columns a rule names (keepColumns, blindColumns), found the one fail-closed way: { fail, table } or
   *  { table, head, columns: [{ column, over: [header cells], under: [body cells] }] }. */
  const columnsOf = (r) => {
    const names = r.columns.filter((c) => typeof c === 'string'), wanted = new Set(names.map(norm));
    if (r.table?.near != null && r.screen == null) return { names, fail: 'near needs a screen', table: null };
    const tables = tablesFor(r.table).filter((t) => !hidden?.has(t)); // (on an `only` screen, a table outside what is kept is hidden: nothing of it is named)
    if (tables.length !== 1) return { names, fail: tables.length ? `ambiguous: ${tables.length} tables` : 'no table', table: null };
    const [table] = tables, rows = rowsOf(table, tree), has = (row) => cellsOfRow(row).some((c) => wanted.has(norm(textOf(c))));
    const head = headerRows(table).find(has);
    if (!head) return { names, fail: rows.some(has) ? 'not in a header row' : 'no such header', table: table.id };
    const below = rows.slice(rows.indexOf(head) + 1).filter((row) => !inThead(row));
    return { names, table: table.id, head, others: cellsOfRow(head).filter((c) => !wanted.has(norm(textOf(c)))), columns: names.map((column) => {
      const over = cellsOfRow(head).filter((c) => norm(textOf(c)) === norm(column)), spans = over.map((c) => [columnOf(c, head), columnOf(c, head) + spanOf(c)]);
      return { column, over, under: below.flatMap((row) => cellsOfRow(row).filter((c) => spans.some(([from, to]) => columnOf(c, row) >= from && columnOf(c, row) < to))) };
    }) };
  };
  // blindColumns (rules.json): the cells under the headers named, in the one table named, replaced as a kind, the way
  // a blind rule replaces an element: `as` series (numbered under `label`, or under the header's own words), number,
  // name, company, email, key, amount. The same label gives the same original the same stand-in on every screen and
  // in every table. It fails closed exactly as keepColumns does, and answers { rule, ok, table, column, cells, reason? }.
  const blindedColumns = [];
  for (const r of rules.filter((x) => x.kind === 'blindColumns')) {
    const found = columnsOf(r);
    if (found.fail) { for (const column of found.names) blindedColumns.push({ rule: r.i, ok: false, table: found.table, column, cells: 0, reason: found.fail }); continue; }
    for (const { column, over, under } of found.columns) {
      let cells = 0;
      for (const cell of under) {
        const ts = texts(cell), whole = ts.map((t) => t.textContent).join('').replace(/\s+/g, ' ').trim();
        if (!ts.length) continue;
        saw(r.as, whole);
        const label = r.label ?? seriesName(textOf(over[0]).replace(/\s+/g, ' ').trim());
        const next = r.as === 'name' ? meFull : r.as === 'company' ? company : r.as === 'email' ? ledger.email(whole) : r.as === 'key' ? secretFor(label)
          : r.as === 'amount' ? ledger.amount(/[$€£]/.test(whole) ? whole : '$' + whole) : ledger.series(label, whole);
        ts.forEach((t, i) => { t.textContent = i ? '' : next; mark(t, 'blind'); });
        cells++;
      }
      blindedColumns.push({ rule: r.i, ok: over.length > 0, table: found.table, column, cells, ...(over.length ? {} : { reason: 'no such header' }) });
    }
  }
  for (const r of rules.filter((x) => x.kind === 'keepColumns')) {
    const found = columnsOf(r);
    if (found.fail) { for (const column of found.names) kept.push({ rule: r.i, ok: false, table: found.table, column, cells: 0, reason: found.fail }); continue; }
    for (const { column, over, under } of found.columns) {
      [...over, ...under].forEach(leave);
      kept.push({ rule: r.i, ok: over.length > 0, table: found.table, column, cells: under.length, ...(over.length ? {} : { reason: 'no such header' }) });
    }
    heads.push({ rule: r.i, table: found.table, cells: found.others });
  }

  // 0. where links go and forms post: nothing rendered needs it, and a URL holds ids, addresses and tokens. Automatic
  // (a default rule: the owner's decision, "blank the hidden link addresses automatically"); a link's text is left.
  if (rules.some((r) => r.kind === 'links')) walk(tree, (n) => {
    if (n.type !== ELEMENT || !n.attributes) return;
    const a = n.attributes, was = JSON.stringify(a);
    for (const k of ['href', 'xlink:href']) if (typeof a[k] === 'string' && ['a', 'area'].includes(n.tagName) && !/^#[\w-]*$/.test(a[k])) a[k] = '#';
    for (const k of ['action', 'formaction']) if (k in a) a[k] = '#';
    for (const k of Object.keys(a)) if (['ping', 'cite', 'srcdoc'].includes(k) || /^on[a-z]+$/.test(k) || (k.startsWith('data-') && LINK_DATA.test(k))) delete a[k];
    if (JSON.stringify(a) !== was) note(n, 'link');
  });

  const patterns = rules.filter((r) => r.kind === 'pattern').map((r) => r.pattern);
  /** every match of the patterns in `s`, first listed pattern first where two overlap, left to right; zero sums and real dates are not matches */
  const findMatches = (s, patterns) => {
    const got = [];
    for (const p of PATTERN_ORDER.filter((x) => patterns.includes(x))) for (const m of s.matchAll(PATTERNS[p])) {
      const i = m.index, j = i + m[0].length;
      if ((p === 'money' && !/[1-9]/.test(m[0])) || (p === 'phone' && ISO_DATE.test(m[0])) || (REALLY[p] && !REALLY[p](m[0])) || got.some((g) => i < g.j && j > g.i)) continue;
      got.push({ i, j, p, text: m[0] });
    }
    return got.sort((a, b) => a.i - b.i);
  };

  // 2. the signed-in user, wherever the name stands: whole words, any case
  let swapUser = (s) => s, swapFullName = (s) => s;
  if (user?.full) {
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), word = (s) => `(?<![\\p{L}\\p{N}])${s}(?![\\p{L}\\p{N}])`;
    const parts = [user.first, user.last].filter((w) => w && w.length >= 3 && w.toLowerCase() !== user.full.toLowerCase());
    // a name of ONE word (all a user menu shows of someone) is replaced only where it stands exactly as written: a
    // short name in any case is also a word ("Will", "May", "Mark"). It becomes the roster's first name.
    const one = !/\s/.test(user.full.trim()), flags = one ? 'gu' : 'giu', whole = one ? me.first : meFull;
    const re = new RegExp([user.full.split(/\s+/).map(esc).join('\\s+'), ...parts.map(esc)].map(word).join('|'), flags);
    const swap = (s) => s.replace(re, (m) => (/\s/.test(m) || m.toLowerCase() === user.full.toLowerCase() ? whole : m.toLowerCase() === user.first.toLowerCase() ? me.first : me.last));
    walk(tree, (n) => {
      if (done.has(n)) return;
      if (n.type === TEXT && n.textContent && !inert(n)) { const next = swap(n.textContent); if (next !== n.textContent) { for (const m of findMatches(n.textContent, patterns)) saw(m.p, m.text); n.textContent = next; byUser.add(n); note(n, 'user'); } }
      if (n.type === ELEMENT) for (const [k, v] of Object.entries(n.attributes ?? {})) if (typeof v === 'string' && isShown(k) && !isAssetValue(v) && !(k === 'title' && keptTitles.has(n))) { const next = swap(v); if (next !== v) { for (const m of findMatches(v, patterns)) saw(m.p, m.text); n.attributes[k] = next; note(n, 'user'); } }
    });
    swapUser = swap;
    const full = new RegExp(word(user.full.split(/\s+/).map(esc).join('\\s+')), flags);
    swapFullName = (s) => s.replace(full, whole);
  }

  /** the stand-in for a match of `pattern` found at `el` */
  const patternValue = (pattern, el, original) => {
    if (pattern === 'money') return ledger.amount(original);
    if (pattern === 'email') return ledger.email(original);
    const heading = headingOf(el, tree); // numbered under what the screen calls it, else under its plain kind
    return ledger.series(heading ? seriesName(heading) : PATTERN_KIND[pattern], original);
  };
  const runPatterns = (patterns) => {
    // text: one line of text at a time (an element's own text and that of the inline elements in it), so a value
    // split over nodes is found; the matches are worked out on the text as recorded, so a stand-in is never matched again
    const lines = [];
    (function go(el) {
      let line = [];
      const end = () => { if (line.length) lines.push(line); line = []; };
      (function gather(n) {
        for (const c of n.childNodes ?? []) {
          if (c.type === TEXT) { if (done.has(c)) end(); else if (!c.isStyle) line.push(c); }
          else if (c.type === ELEMENT && INLINE.has(c.tagName) && !done.has(c)) gather(c);
          else { end(); if ((c.type === ELEMENT && !INERT.includes(c.tagName)) || c.type === 0) go(c); }
        }
      })(el);
      end();
    })(tree);
    for (const line of lines) {
      const s = line.map((t) => t.textContent ?? '').join('');
      if (!/[\d@]/.test(s) && s.length < 24) continue;
      const spans = []; let at = 0;
      for (const t of line) { spans.push({ t, from: at, to: at + (t.textContent ?? '').length }); at = spans.at(-1).to; }
      const found = findMatches(s, patterns).map((m) => ({ ...m, over: spans.filter((x) => x.from < m.j && x.to > m.i) }));
      for (const m of found) { m.next = patternValue(m.p, ix.parent.get(m.over[0].t), m.text); saw(m.p, m.text); } // left to right: a series counts in reading order
      for (const m of found.reverse()) {
        if (m.next === m.text) continue;
        // a currency symbol in a node of its own stays there: <span>$</span>50.00
        const lone = m.p === 'money' && m.over.length > 1 && m.over[0].t.textContent.trim().length === 1;
        m.over.forEach(({ t, from, to }, k) => {
          const a = Math.max(m.i, from) - from, b = Math.min(m.j, to) - from;
          const put = lone ? (k === 0 ? m.next[0] : k === 1 ? m.next.slice(1) : '') : k ? '' : m.next;
          t.textContent = t.textContent.slice(0, a) + put + t.textContent.slice(b);
          mark(t, m.p);
        });
      }
    }
    // every attribute that is not structure: shown or not, it is in the file
    walk(tree, (n) => {
      if (n.type !== ELEMENT) return;
      for (const [k, v] of Object.entries(n.attributes ?? {})) {
        if (k === 'title' && keptTitles.has(n)) continue; // a kept cell's tooltip that reads exactly as its kept text
        if (typeof v !== 'string' || !isShown(k) || isAssetValue(v) || (k === 'value' && done.has(n))) continue;
        let next = v;
        // an attribute nobody listed may be a measure ("12.3456789", "0.5, 10.25"). Only the digits AFTER a decimal
        // point are let off, and only when the WHOLE value is a number or a list of numbers: a match is exempt when,
        // its fractional parts taken away, nothing long is left ("0.123456789" yes; "123456789.0", "123456789, 2.5" no)
        const measure = isNumberList(v);
        const fractionOnly = (m) => {
          const from = v[m.i - 1] === '.' && /\d/.test(v[m.i - 2] ?? '') ? '.' + m.text : m.text; // a run that starts right after the point
          const rest = from.replace(/\.\d+/g, '');
          return rest !== from && !/\d{6,}/.test(rest) && !/\+?\d[\d\s().-]{8,}\d/.test(rest);
        };
        const found = findMatches(v, patterns).filter((m) => !(measure && ['digits', 'phone', 'account', 'card'].includes(m.p) && fractionOnly(m)));
        for (const m of found) { m.next = patternValue(m.p, n, m.text); saw(m.p, m.text); }
        for (const m of found.reverse()) next = next.slice(0, m.i) + m.next + next.slice(m.j);
        if (next !== v) { n.attributes[k] = next; note(n, found[0].p); }
      }
    });
  };

  // 3. fills (empty accounts) and charts: what they write, no later rule rewrites, and a figure they cover never
  // takes a number in the ledger (the first sum a viewer sees in a table is $100.00, not $300.00)
  const fill = (el, value) => {
    if (['input', 'textarea'].includes(el.tagName)) { el.attributes.value = value; mark(el, 'fill'); return; }
    const ts = own(el).length ? own(el) : texts(el, true);
    ts.forEach((t, i) => { t.textContent = i ? '' : value; mark(t, 'fill'); });
  };
  const said = (s) => norm(s).replace(/\s*:$/, '');
  for (const r of rules.filter((x) => x.kind === 'fill')) {
    if (r.near != null) walk(tree, (l) => { // the value beside the label: the nearest element holding a figure, looking outward
      if (l.type !== ELEMENT || !own(l).length || said(own(l).map((t) => t.textContent).join(' ')) !== said(r.near) || [l, ...up(l)].some((a) => ['svg', 'head', ...INERT].includes(a.tagName))) return;
      for (let scope = l, n = 0; scope && scope.type === ELEMENT && n < 3; scope = ix.parent.get(scope), n++) {
        const all = []; walk(scope, (e) => { if (e !== scope && e.type === ELEMENT) all.push(e); });
        const at = all.indexOf(l);
        const figures = all.filter((e) => e !== l && !up(l).includes(e) && ![e, ...up(e)].some((a) => a.tagName === 'svg') && own(e).some((t) => /\d/.test(t.textContent)));
        if (!figures.length) continue;
        fill(figures.reduce((a, b) => (Math.abs(all.indexOf(b) - at) < Math.abs(all.indexOf(a) - at) ? b : a)), r.value);
        break;
      }
    });
    else if (r.selector) for (const el of select(tree, r.selector, tree)) fill(el, r.value);
    else if (r.node != null) { // one element on one screen, answered as a blind rule is
      const el = findById(tree, r.node);
      if (!el || el.type !== ELEMENT) { applied.push({ ok: false, node: r.node, reason: 'no such node' }); continue; }
      const length = (attr(el, 'value') ?? texts(el, true).map((t) => t.textContent).join('')).trim().length;
      fill(el, r.value);
      applied.push({ ok: true, node: r.node, tag: el.tagName, length, kind: 'fill' });
    }
  }
  for (const r of rules.filter((x) => x.kind === 'chart')) for (const svg of select(tree, r.selector, tree)) for (const n of redrawLineChart(svg, r.values, tree, newText) || []) mark(n, 'chart');

  // 4. the default rules, as listed
  let patternsRun = false, judge = null;
  // (in this order whatever the list's: a cell is numbered whole, under its heading, before a pattern can take part of it)
  const STEPS = ['fields', 'selects', 'secretElements', 'secretCells', 'cells', 'avatars', 'pattern'];
  for (const r of rules.filter((x) => STEPS.includes(x.kind)).sort((a, b) => STEPS.indexOf(a.kind) - STEPS.indexOf(b.kind))) {
    if (r.kind === 'fields') every(['input', 'textarea'], (n) => {
      const a = n.attributes ?? (n.attributes = {}), type = String(a.type ?? 'text').toLowerCase();
      if (type === 'hidden') { if (a.value) { a.value = ''; mark(n, 'secret'); } return; } // never shown; no frame needs it
      if (n.tagName === 'input' && NO_VALUE_TYPES.has(type)) return;
      const inside = n.tagName === 'textarea' ? texts(n, true) : [];
      if (!a.value && !inside.length) return; // an empty field stays empty
      const label = labelOf(n, tree), who = personField(label, me);
      saw('field', a.value ?? ''); for (const t of inside) saw('field', t.textContent); // (the recorder masks these: what it did not mask is looked for)
      a.value = who ?? secretFor(label);
      for (const t of inside) { t.textContent = ''; mark(t, who ? 'user' : 'secret'); }
      mark(n, who ? 'user' : 'secret');
    });
    if (r.kind === 'selects') every(['select'], (n) => { const label = labelOf(n, tree); oneOption(n, ledger.series(seriesName(label), 'select\n' + label), 'series'); });
    // an element that HOLDS a secret or an account number by what the page calls it, whatever the value looks like:
    // its own id, name or test id says so ("apiKeyValue", "client_secret", "accountNumber"), a <label for> it says so,
    // or it is the <dd> of a <dt> that says so. Only an element that holds a value (a span, a code, a cell: not a
    // label, a heading, a button or a link), with nothing in it but a line of text. A value already masked on the page
    // ("****", "****6621" is left to the patterns) and a word listed in `keep` stay.
    if (r.kind === 'secretElements') walk(tree, (n) => {
      if (n.type !== ELEMENT || done.has(n) || !VALUE_TAGS.has(n.tagName) || inert(n)) return;
      const called = `${attr(n, 'id') ?? ''} ${attr(n, 'name') ?? ''} ${attr(n, 'data-testid') ?? ''}`, id = attr(n, 'id');
      let labelled = ''; if (id) walk(tree, (l) => { if (!labelled && l.tagName === 'label' && attr(l, 'for') === id) labelled = labelText(l); });
      const before = n.tagName === 'dd' ? kids(ix.parent.get(n) ?? {}).slice(0, kids(ix.parent.get(n) ?? {}).indexOf(n)).reverse().find((x) => x.tagName === 'dt') : null;
      const says = `${labelled} ${before ? textOf(before) : ''}`;
      const kind = SECRET_ID.test(called) || /\b(?:api[ _-]?key|keys?|tokens?|secret|password|passcode|bearer)\b/i.test(says) ? 'Key' : ACCOUNT_ID.test(called) || SENSITIVE.test(says) ? 'Account number' : null;
      if (!kind) return;
      let plain = true; walk(n, (c) => { if (c !== n && c.type === ELEMENT && !INLINE.has(c.tagName)) plain = false; if (c !== n && c.type === ELEMENT && (c.tagName === 'a' || isPress(c))) plain = false; });
      const ts = texts(n), whole = ts.map((t) => t.textContent).join('').replace(/\s+/g, ' ').trim();
      if (!plain || !ts.length || whole.length > 120 || !/[\p{L}\p{N}]{2}/u.test(whole.replace(/[*•·xX]+/g, '')) || keep.has(whole.toLowerCase())) return;
      saw('key', whole);
      const next = ledger.series(kind, whole);
      ts.forEach((t, i) => { t.textContent = i ? '' : next; mark(t, 'key'); });
    });
    // a table body cell: every one (`cells`, switched on by a tutorial), or only those under a heading that says the
    // column holds secrets or account numbers, or sums of money (`secretCells`, automatic): numbered under the column's heading
    if (r.kind === 'cells' || r.kind === 'secretCells') every(['td', 'th'], (n) => {
      const part = closest(n, tree, ['tbody', 'thead', 'tfoot', 'table'])?.tagName;
      if (part === 'thead' || (n.tagName === 'th' && part !== 'tbody')) return; // column headings, whichever tag they were written with
      const heading = headingOf(n, tree), secret = SENSITIVE.test(heading), sums = !secret && MONEYISH.test(heading);
      if (r.kind === 'secretCells' && !secret && !sums) return;
      let holds = false; walk(n, (c) => { if (c !== n && ['table', 'input', 'select', 'textarea'].includes(c.tagName)) holds = true; });
      if (holds) return; // a cell that holds a form or another table: its parts are met on their own
      const judged = (judge ??= cellJudge(tree))(n), ts = judged.data.filter((t) => !done.has(t)); // not the labels of the cell's controls: cellJudge, above
      if (judged.control && !controls.has(n)) { controls.add(n); saw('control', judged.control); } // kept as interface text on evidence: still looked for (the sweep asks again)
      if (!ts.length) return;
      const whole = ts.map((t) => t.textContent).join('').replace(/\s+/g, ' ').trim();
      if (sums && /^-?[\d,]*\.?\d+$/.test(whole)) { // a bare figure under a heading that says money ("Balance": 1,204.50): a sum without its sign
        if (!/[1-9]/.test(whole)) return;
        saw('amount', whole);
        const figure = ledger.amount(whole);
        ts.forEach((t, i) => { t.textContent = i ? '' : figure; mark(t, 'money'); });
        return;
      }
      if (r.kind === 'secretCells' && !secret) return;
      if (stays(whole, keep)) { for (const t of ts) done.add(t); return; }
      if (WHOLE.money.test(whole) || (WHOLE.email.test(whole) && patterns.includes('email'))) return; // a sum or an email: the patterns give it its own kind of stand-in
      if (ts.every((t) => byUser.has(t)) && [meFull, me.first, me.last].includes(whole)) return;
      saw('cell', judged.original);
      const next = ledger.series(seriesName(heading || labelOf(n, tree)), whole);
      ts.forEach((t, i) => { t.textContent = i ? '' : next; mark(t, 'series'); });
    });
    if (r.kind === 'avatars') every(['img'], (n) => {
      if (!isAvatar(n, ix.parent.get(n))) return;
      const src = attr(n, 'src') ?? '';
      if (src.startsWith(ASSET_PREFIX)) dropped.push(src.slice(ASSET_PREFIX.length));
      n.attributes.src = initialsDisc(me.first[0] + me.last[0]);
      delete n.attributes.alt; delete n.attributes.srcset;
      mark(n, 'avatar');
    });
    if (r.kind === 'pattern' && !patternsRun) { patternsRun = true; runPatterns(patterns); }
  }

  // CSS (a style attribute, an inlined stylesheet, a <style>): film/src/css.ts `passCss` hands over every place that
  // can hold a value. Quoted strings and attribute-selector strings get the user swap and the patterns (a selector on
  // a structural attribute, `[class^="..."]`, holds a name and is left, as that attribute is). The unquoted
  // text of a declaration's value gets the patterns wherever a match is not made of structure alone (numbers with or
  // without units, colours, keywords, custom property names: `margin: 0 0 0 100px` is not a phone number), and the
  // user's FULL name (a first or last name alone can be a CSS keyword: White, Gray, Bold). Comments are dropped; every
  // url() is a real asset or the missing marker. Selectors' names, property names and custom property NAMES are never
  // touched: that is what breaks rendering. Not a default rule that can be dropped: it runs with whatever patterns are on.
  const fixCss = (text, at) => {
    const put = (s, found) => { for (const m of found) { m.next = patternValue(m.p, at, m.text); saw(m.p, m.text); } for (const m of found.reverse()) s = s.slice(0, m.i) + m.next + s.slice(m.j); return s; };
    const string = (str) => { const next = swapUser(str); return put(next, findMatches(next, patterns)); };
    return passCss(text, {
      string, selectorString: (str, attribute) => (isStructuralAttr(attribute) ? str : string(str)),
      value: (t, structural) => swapFullName(put(t, findMatches(t, patterns).filter((m) => !structural(m.i, m.j)))),
      url: (target) => (isCssUrlOk(target) ? target : MISSING_MARK),
    });
  };
  walk(tree, (n) => {
    if (n.type === TEXT && n.textContent && ix.parent.get(n)?.tagName === 'style') { const next = fixCss(n.textContent, ix.parent.get(n)); if (next !== n.textContent) { n.textContent = next; note(n, 'link'); } }
    if (n.type === ELEMENT) for (const k of ['style', '_cssText']) if (typeof n.attributes?.[k] === 'string') { const next = fixCss(n.attributes[k], n); if (next !== n.attributes[k]) { n.attributes[k] = next; note(n, 'link'); } }
  });

  // the other header cells of a table with kept columns: which of them a rule rewrote (so a column name that looked
  // like data can be kept by name: rules.json `keep`)
  const wrote = new Set(changed.filter((c) => c.kind !== 'kept' && c.kind !== 'link').map((c) => c.id));
  const headers = heads.map((h) => ({ rule: h.rule, table: h.table, others: h.cells.length, replaced: h.cells.filter((c) => { let hit = false; walk(c, (n) => { if (wrote.has(n.id)) hit = true; }); return hit; }).map((c) => c.id) }));
  return { changed, applied, dropped, kept, headers, only, blindedColumns, blindedAll };
}

// ---- what an agent may ask about a region

const ROLE_TAGS = { button: 'button', a: 'link', input: 'field', textarea: 'field', select: 'field', h1: 'heading', h2: 'heading', h3: 'heading', h4: 'heading', h5: 'heading', h6: 'heading', th: 'heading', td: 'cell' };
/** The interface elements of a CLEAN tree, for an agent choosing what a gesture pointed at or what to blind:
 *  [{ node, tag, role, text, box? }]. `text` is read from the tree given, so give it the clean copy and never a raw
 *  screen; it is cut at 40 characters. `role`: button | link | field | heading | cell | text (an element with text of
 *  its own). `boxes`: { <node id>: { x, y, w, h } } as measured in a rebuilt screen; `region`: { x, y, w, h }: only
 *  elements whose box lies inside it. With no region, every element (those not shown as recorded left out when there
 *  are no boxes to say so). */
export function elementsIn(tree, boxes, region) {
  const out = [], cut = (s) => s.replace(/\s+/g, ' ').trim().slice(0, 40);
  (function go(n) {
    if (n.type === ELEMENT) {
      if ([...INERT, 'head', 'option', 'optgroup'].includes(n.tagName) || (!boxes && isHidden(n))) return;
      const type = String(attr(n, 'type') ?? '').toLowerCase(), box = boxes?.[n.id];
      const role = n.tagName === 'input' && ['button', 'submit', 'reset'].includes(type) ? 'button' : attr(n, 'role') === 'button' ? 'button' : ROLE_TAGS[n.tagName]
        ?? ((n.childNodes ?? []).some((c) => c.type === TEXT && (c.textContent ?? '').trim()) ? 'text' : null);
      const inside = !region || (box && box.x >= region.x && box.y >= region.y && box.x + box.w <= region.x + region.w && box.y + box.h <= region.y + region.h);
      if (role && inside) {
        const text = n.tagName === 'input' || n.tagName === 'textarea' ? attr(n, 'value') ?? '' : role === 'text' ? (n.childNodes ?? []).filter((c) => c.type === TEXT).map((c) => c.textContent).join(' ') : textOf(n);
        out.push({ node: n.id, tag: n.tagName, role, text: cut(text), ...(box ? { box } : {}) });
      }
    }
    for (const c of n.childNodes ?? []) go(c);
  })(tree);
  return out;
}
