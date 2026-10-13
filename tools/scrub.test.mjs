import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_RULES, OLD_DEFAULTS, blindReplace, elementsIn, findSignedInUser, rulesFor, scrub, stays, textOf, walk } from './scrub.mjs';
import { makeLedger } from '../film/src/standins.ts';
import { MORE, ORIGINALS, comment, el, more, page, tx } from '../fixtures/scrub/leak-set.mjs';

const squash = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const find = (tree, pred) => { let hit; walk(tree, (n) => { if (!hit && pred(n)) hit = n; }); return hit; };
const byTag = (tree, tag) => find(tree, (n) => n.tagName === tag);
const byId = (tree, id) => find(tree, (n) => n.attributes?.id === id);
// Most of these tests are about rules a tutorial now switches on (rules.json `use`): they run with everything that was automatic before the policy narrowed.
const old = (json = {}, ...rest) => rulesFor({ use: OLD_DEFAULTS, ...json }, ...rest), ALL = old();
const run = (tree, extra = {}, ledger = makeLedger()) => scrub(tree, old(extra), ledger, { user: findSignedInUser(tree) });

// ---- what is replaced with nobody asking: secrets, account numbers, money. Nothing else.

// One made-up page with one of each kind. (4111 1111 1111 1111 is the card networks' own test number: it passes the Luhn check.)
const KINDS = { key: 'sk_test_51Hqz9XbT2LmQ0pRrS7uVwX', account: '000123456789', routing: '021000021', tin: '12-3456789', ssn: '123-45-6789', card: '4111 1111 1111 1111', amount: '$4,312.77',
  email: 'ines.marlow@harbor-freight.example', phone: '555-0142-7730', person: 'Ines Marlow', company: 'Harbor Freight Lines', cell: 'Wire to the Tacoma yard', order: '884120', masked: 'tin-in-a-table 98-7654321' };
const kinds = () => el('html', {}, el('body', {},
  el('header', { class: 'topbar' }, el('span', { id: 'user-name' }, tx(KINDS.person)), el('img', { class: 'avatar', src: 'rostrum-asset:/face.png', alt: 'face' })),
  el('p', { id: 'k' }, tx(`Key ${KINDS.key}`)), el('p', { id: 'a' }, tx(`Account ${KINDS.account}, routing ${KINDS.routing}`)), el('p', { id: 't' }, tx(`EIN ${KINDS.tin}, SSN ${KINDS.ssn}`)), el('p', { id: 'c' }, tx(`Card ${KINDS.card}`)),
  el('p', { id: 'm' }, tx(`Balance ${KINDS.amount}`)), el('p', { id: 'e' }, tx(`Write to ${KINDS.email}`)), el('p', { id: 'p' }, tx(`Call ${KINDS.phone}`)), el('p', { id: 'n' }, tx(`${KINDS.person} of ${KINDS.company}`)), el('p', { id: 'o' }, tx(`Order ${KINDS.order}`)),
  el('a', { id: 'l', href: 'https://site.test/customers/77', title: `Order ${KINDS.order}` }, tx('Open')),
  el('label', { for: 'pw' }, tx('Password')), el('input', { id: 'pw', type: 'password', value: '********' }),
  el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, tx('Customer')), el('th', {}, tx('Note')), el('th', {}, tx('TIN')), el('th', {}, tx('Account Type')))),
    el('tbody', {}, el('tr', {}, el('td', {}, tx(KINDS.company)), el('td', {}, tx(KINDS.cell)), el('td', {}, tx('**-***4321')), el('td', {}, tx('Checking')))))));
const seen = (tree) => Object.fromEntries(['k', 'a', 't', 'c', 'm', 'e', 'p', 'n', 'o'].map((id) => [id, textOf(byId(tree, id))]));

test('by default only secrets, account numbers and money are replaced: a key, an account, routing, tax and card number, an amount, a field, a column that says TIN', () => {
  const tree = kinds(), originals = [];
  const out = scrub(tree, rulesFor({}), makeLedger(), { originals });
  assert.deepEqual(seen(tree), { k: 'Key Key 1', a: 'Account Account number 1, routing Account number 2', t: 'EIN Tax ID 1, SSN Tax ID 2', c: 'Card Card number 1', m: 'Balance $100.00',
    e: `Write to ${KINDS.email}`, p: `Call ${KINDS.phone}`, n: `${KINDS.person} of ${KINDS.company}`, o: `Order ${KINDS.order}` });
  assert.equal(byId(tree, 'pw').attributes.value, 'Password-123456');
  assert.deepEqual(cellsOf(tree), [KINDS.company, KINDS.cell, 'TIN 1', 'Checking']);   // a column headed TIN is a secret's column whatever it holds; "Account Type" is not one
  assert.equal(textOf(byId(tree, 'user-name')), KINDS.person);                          // nobody looked for a signed-in user
  assert.deepEqual([byTag(tree, 'img').attributes.src, byId(tree, 'l').attributes.href, byId(tree, 'l').attributes.title], ['rostrum-asset:/face.png', '#', `Order ${KINDS.order}`]);
  // the sweep's list is what was replaced, and nothing that was not
  const listed = originals.map((o) => o.value);
  for (const v of [KINDS.key, KINDS.account, KINDS.routing, KINDS.tin, KINDS.ssn, KINDS.card, KINDS.amount, '**-***4321']) assert.ok(listed.includes(v), 'not on the list: a ' + v.length + '-character value');
  for (const v of [KINDS.email, KINDS.phone, KINDS.person, KINDS.company, KINDS.cell, KINDS.order]) assert.ok(!listed.some((l) => l.includes(v)), 'on the list though nothing replaced it');
  assert.deepEqual([...new Set(out.changed.map((c) => c.kind))].sort(), ['account', 'card', 'key', 'link', 'money', 'secret', 'series', 'taxid']);
  assert.deepEqual(DEFAULT_RULES.map((r) => r.pattern ?? r.kind), ['fields', 'selects', 'secretCells', 'money', 'key', 'card', 'taxid', 'account', 'secretElements', 'links']);
});

test('the automatic patterns fail closed (security review): a secret of any shape is one; what reads as words, a failed card check or a short number is not', () => {
  const line = (s) => { const t = el('html', {}, el('body', {}, el('p', {}, tx(s)))); scrub(t, rulesFor({}), makeLedger()); return textOf(byTag(t, 'p')); };
  // secrets, whatever they are made of (every one invented for this test)
  const SECRETS = { 'a 24-digit numeric token': '482019375566201844773901', 'a 40-character lowercase hex key': '3f9a1c7e5b2d8046af13c9e7b5d2a8f04c6e1b9d', 'a 32-character letters-only mixed-case token': 'QwXzRtYpLkJhGfDsAmNbVcKqWrTyUiOp',
    'a base64 token with + / =': 'aGVsbG8+d29ybGQ/Zm9vYmFy+abc/XYZ==', 'a JWT': 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.c2lnbmF0dXJlLXBhcnQ', 'a UUID': '0b9f8e7d-6c5b-4a39-9281-706f5e4d3c2b',
    'a 32-character lowercase letters-only token': 'kqzvxjwplmfhgtrbncdsyqzxvkjwpmfh', 'a prefixed key': 'tok_9aK2mQ7xPz41LrT8vBn6WcY3' };
  for (const [what, secret] of Object.entries(SECRETS)) assert.match(line(`Use ${secret} now`), /^Use (Key|Account number) 1 now$/, what);
  assert.equal(line('acct 12345678'), 'acct Account number 1');
  assert.equal(line('IBAN 12345678901234567890 and 5500005555555559'), 'IBAN Account number 1 and Card number 1'); // a run of digits has no longest length
  // not secrets: a long ordinary word, hyphenated and snake_case and camelCase names, numbers that are measures, dates; and (a decision) an order
  // number of 6 or 7 digits in running text is NOT automatic: it is `use: ["numbers"]`. From 8 digits on it is taken for an account number.
  for (const s of ['pneumonoultramicroscopicsilicovolcanoconiosis', 'internationalization-ready', 'enterprise-resource-planning-suite', 'payment_reference_number_external', 'paymentReferenceNumberExternalId', 'a-very-long-class-name-that-must-stay',
    'swal2-animate-success-line-tip', 'Order 884120', 'Row 1234567', 'Ref 4111 1111 1111 1112 x', '09/01/2026', 'Tue, 29 Sep 2026 11:28:23', '0.123456789', '12,345,678', '$0.00', '12.5%']) assert.equal(line(s), s, s);
});

test('a card number is never the fraction of a decimal; the same digits standing anywhere else still are one', () => {
  const CARD = '4111111111111111', line = (s) => { const t = el('html', {}, el('body', {}, el('p', {}, tx(s)))); scrub(t, rulesFor({}), makeLedger()); return textOf(byTag(t, 'p')); };
  // a float whose 16 fractional digits pass the card check: a measure, in text, in an attribute and in a style
  for (const s of [`0.${CARD}`, `scale(0.${CARD})`, `Ratio 12.${CARD} x`, `matrix(1.${CARD}, 0, 0, 1.${CARD}, 0, 0)`]) assert.equal(line(s), s, s);
  const attrs = { class: 'waves-ripple', 'data-scale': `scale(0.${CARD})`, style: `transform: scale(0.${CARD}) translate(0px, 0px);` };
  const ripple = el('html', {}, el('body', {}, el('button', {}, el('div', { ...attrs }), tx('Save')))), originals = [];
  const out = scrub(ripple, rulesFor({}), makeLedger(), { originals });
  assert.deepEqual(find(ripple, (n) => n.attributes?.class === 'waves-ripple').attributes, attrs);
  assert.deepEqual([originals, out.changed.filter((c) => c.kind === 'card')], [[], []]);
  // the same digits as a card: alone, grouped, after a label, after a point that is no decimal point
  const CARDS = { [CARD]: 'Card number 1', '4111 1111 1111 1111': 'Card number 1', '4111-1111-1111-1111': 'Card number 1', [`Card: ${CARD}`]: 'Card: Card number 1', [`Card:${CARD}`]: 'Card:Card number 1',
    [`0. ${CARD}`]: '0. Card number 1', [`Paid in full. ${CARD}`]: 'Paid in full. Card number 1', [`.${CARD}`]: '.Card number 1', [`No.${CARD}`]: 'No.Card number 1', [`0, ${CARD}`]: '0, Card number 1', [`scale(0.5) ${CARD}`]: 'scale(0.5) Card number 1' };
  for (const [s, want] of Object.entries(CARDS)) assert.equal(line(s), want, s);
  const held = el('html', {}, el('body', {}, el('div', { 'data-scale': CARD, 'data-note': `0. ${CARD}`, title: `scale(${CARD})` }))), listed = [];
  scrub(held, rulesFor({}), makeLedger(), { originals: listed });
  assert.deepEqual(byTag(held, 'div').attributes, { 'data-scale': 'Card number 1', 'data-note': '0. Card number 1', title: 'scale(Card number 1)' });
  assert.ok(listed.length === 3 && listed.every((o) => o.kind === 'card' && o.value === CARD));
});

test('a secret by what the page calls it (security review): an element whose id or label says key, token, password or account number, whatever the value looks like', () => {
  const tree = el('html', {}, el('body', {},
    el('label', { for: 'shown' }, tx('API key')), el('span', { id: 'shown' }, tx('0b9f8e7d-6c5b')),            // a short id used as a secret, under a label that says so
    el('code', { id: 'clientSecretValue' }, tx('correct horse battery')),                                     // words: the id says it is a secret
    el('span', { id: 'bearer_token' }, tx('abc123')), el('dl', {}, el('dt', {}, tx('Password')), el('dd', {}, tx('hunter2 Zebra'))),
    el('span', { id: 'invoiceAccountNumber' }, tx('00123')), el('span', { id: 'maskedAccountNumber' }, tx('****')),
    el('label', { id: 'passwordLabel' }, tx('Password')), el('button', { id: 'showTokenBtn' }, tx('Show token')), el('h5', { id: 'secretKeyTitle' }, tx('Secret Key')), // these NAME a secret: left
    el('div', { id: 'tokenPanel' }, el('p', {}, tx('Tokens let other programs act for you.')), el('button', {}, tx('Create'))),                                       // a container: left
    el('span', { id: 'keyboardHint' }, tx('Press Enter')), el('span', { id: 'apiStatus' }, tx('Online')),
    el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, tx('Name')), el('th', {}, tx('Balance')), el('th', {}, tx('Amount %')), el('th', {}, tx('Client Secret')))),
      el('tbody', {}, el('tr', {}, el('td', {}, tx('Oskar Lindqvist')), el('td', {}, tx('1,204.50')), el('td', {}, tx('2.5')), el('td', {}, tx('swordfish'))))))), originals = [];
  scrub(tree, rulesFor({}), makeLedger(), { originals });
  const read = (id) => textOf(byId(tree, id));
  assert.deepEqual(['shown', 'clientSecretValue', 'bearer_token', 'invoiceAccountNumber', 'maskedAccountNumber'].map(read), ['Key 1', 'Key 2', 'Key 3', 'Account number 1', '****']);
  assert.equal(textOf(byTag(tree, 'dd')), 'Key 4');
  assert.deepEqual(['passwordLabel', 'showTokenBtn', 'secretKeyTitle', 'tokenPanel', 'keyboardHint', 'apiStatus'].map(read), ['Password', 'Show token', 'Secret Key', 'Tokens let other programs act for you.Create', 'Press Enter', 'Online']);
  assert.deepEqual(cellsOf(tree), ['Oskar Lindqvist', '100.00', '2.5', 'Client secret 1']); // a bare figure under "Balance" is a sum; a percentage column is not; a column that says secret is one
  for (const v of ['0b9f8e7d-6c5b', 'correct horse battery', 'abc123', 'hunter2 Zebra', '00123', '1,204.50', 'swordfish']) assert.ok(originals.some((o) => o.value === v), 'not handed to the sweep');
});

test('each kind that is no longer automatic is switched on by name (rules.json `use`), and only that kind changes', () => {
  const base = (() => { const t = kinds(); scrub(t, rulesFor({}), makeLedger()); return t; })();
  const withUse = (name, opts = {}) => { const t = kinds(); scrub(t, rulesFor({ use: [name] }), makeLedger(), opts); return t; };
  const same = (t, but) => { for (const [id, v] of Object.entries(seen(base))) if (!but.includes(id)) assert.equal(seen(t)[id], v, `${id} changed`); };
  let t = withUse('emails'); assert.equal(seen(t).e, 'Write to priya.raman@example.com'); same(t, ['e']);
  t = withUse('phones'); assert.equal(seen(t).p, 'Call Phone number 1'); same(t, ['p']);
  t = withUse('numbers'); assert.equal(seen(t).o, 'Order Number 1'); assert.equal(byId(t, 'l').attributes.title, 'Order Number 1'); same(t, ['o']);
  t = withUse('cells'); assert.deepEqual(cellsOf(t), ['Customer 1', 'Note 1', 'TIN 1', 'Account type 1']); same(t, []);
  t = withUse('avatars'); assert.ok(byTag(t, 'img').attributes.src.startsWith('data:image/svg+xml,')); same(t, []);
  t = withUse('links'); assert.equal(byId(t, 'l').attributes.href, '#'); same(t, []); assert.equal(byId(base, 'l').attributes.href, '#'); // where links go is blanked with nobody asking: the name is still accepted, and changes nothing
  // `user` asks prepare to look for the signed-in user; the scrub replaces the one it is handed
  t = withUse('user', { user: findSignedInUser(kinds()) }); assert.equal(textOf(byId(t, 'user-name')), 'Jordan Avery'); assert.equal(seen(t).n, `Jordan Avery of ${KINDS.company}`); same(t, ['n', 'e']); // (and the name's words inside the email address)
  assert.deepEqual(rulesFor({ use: ['nonsense', 'user'] }).length, rulesFor({}).length, 'a name it does not know switches nothing on');
});

test('blindColumns: the cells under the named headers are replaced as a kind; the same label gives the same original the same stand-in in every table; it fails closed', () => {
  const email = () => el('table', { id: 'mail' }, el('tbody', {}, el('tr', {}, el('td', {}, tx('Title')), el('td', {}, tx('ID')), el('td', {}, tx('Example'))),
    el('tr', {}, el('td', {}, tx('Payee Name')), el('td', {}, tx('7755001')), el('td', {}, tx('Oskar Lindqvist'))), el('tr', {}, el('td', {}, tx('Reference')), el('td', {}, tx('NA')), el('td', {}, tx('Ines Marlow')))));
  const preview = () => el('table', { id: 'pre' }, el('thead', {}, el('tr', {}, el('th', {}, tx('#')), el('th', {}, tx('Value')))), el('tbody', {}, el('tr', {}, el('td', {}, tx('1')), el('td', {}, tx('NA'))), el('tr', {}, el('td', {}, tx('2')), el('td', {}, tx('7755001')))));
  const tree = el('html', {}, el('body', {}, email(), preview())), originals = [];
  const out = scrub(tree, rulesFor({ blindColumns: [{ table: '#mail', columns: ['id'], as: 'series', label: 'ID' }, { table: '#mail', columns: ['Example'], as: 'name' }, { table: '#pre', columns: ['Value', 'Nope'], as: 'series', label: 'ID' }] }), makeLedger(), { originals });
  assert.deepEqual(cellsOf(tree), ['Title', 'ID', 'Example', 'Payee Name', 'ID 1', 'Jordan Avery', 'Reference', 'ID 2', 'Jordan Avery', '1', 'ID 2', '2', 'ID 1']); // headers and the other columns as recorded
  const ids = (id) => byId(tree, id).id;
  assert.deepEqual(out.blindedColumns, [{ rule: 0, ok: true, table: ids('mail'), column: 'id', cells: 2 }, { rule: 1, ok: true, table: ids('mail'), column: 'Example', cells: 2 },
    { rule: 2, ok: true, table: ids('pre'), column: 'Value', cells: 2 }, { rule: 2, ok: false, table: ids('pre'), column: 'Nope', cells: 0, reason: 'no such header' }]);
  assert.ok(originals.some((o) => o.kind === 'series' && o.value === '7755001') && originals.some((o) => o.kind === 'name' && o.value === 'Oskar Lindqvist'));
  assert.ok(!JSON.stringify(out).includes('7755001') && !JSON.stringify(out).includes('Lindqvist'));
  for (const [rule, reason] of [[{ table: 'table', columns: ['ID'], as: 'series' }, 'ambiguous: 2 tables'], [{ table: '#none', columns: ['ID'], as: 'series' }, 'no table'], [{ table: { near: 'ID' }, columns: ['ID'], as: 'series' }, 'near needs a screen'], [{ table: '#mail', columns: ['7755001'], as: 'series' }, 'not in a header row']]) {
    const t = el('html', {}, el('body', {}, email(), preview())), r = scrub(t, rulesFor({ blindColumns: [rule] }), makeLedger());
    assert.deepEqual([r.blindedColumns.map((b) => [b.ok, b.reason]), cellsOf(t).includes('7755001')], [[[false, reason]], true], reason);
  }
});

test('nothing from the leak set survives the scrub, as text or squashed', () => {
  const tree = page(); scrub(tree, ALL, makeLedger(), { user: findSignedInUser(tree) });
  const out = JSON.stringify(tree), flat = out.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  for (const v of Object.values(ORIGINALS)) { assert.ok(!out.includes(v), v.length + ' chars survived whole'); assert.ok(!flat.includes(v.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')), v.length + ' chars survived squashed'); }
  for (const part of ['rita', 'quill', '0199', '4821', '4,312', '884120']) assert.ok(!out.toLowerCase().includes(part), part + ' survived in part');
});

test('nor from the harder page: head, comment, hidden and password fields, many options, row headings, split sums and numbers', () => {
  const tree = more(); scrub(tree, ALL, makeLedger(), { user: findSignedInUser(tree) });
  const out = JSON.stringify(tree), flat = squash(out);
  for (const [name, v] of Object.entries({ ...ORIGINALS, ...MORE })) { assert.ok(!out.includes(v), `${name} (${v.length} chars) survived whole`); assert.ok(!flat.includes(squash(v)), `${name} (${v.length} chars) survived squashed`); }
  for (const part of ['rita', 'quill', '0199', '4821', '4,312', '884120', 'oskar', 'lindqvist', 'halvorsen', 'brightwater', 'hunter2', '8841', '2077', 'second@']) assert.ok(!out.toLowerCase().includes(part), part + ' survived in part');
  assert.equal(byId(tree, 'payee').childNodes.length, 1);                    // one option, the stand-in
  assert.equal(byId(tree, 'payee').attributes.title, undefined);
  assert.equal(find(tree, (n) => n.attributes?.type === 'password').attributes.value, 'Password-123456'); // named from the label that wraps it; still a password field
  assert.equal(byId(tree, 'memo').attributes.value, 'Memo-123456');
  assert.equal(textOf(byId(tree, 'memo')), '');
  assert.equal(find(tree, (n) => n.attributes?.type === 'hidden').attributes.value, '');
});

test('interface text stays: headings, labels, buttons, column names, a real date, a zero sum', () => {
  const tree = page();
  find(tree, (n) => n.tagName === 'body').childNodes.push(el('p', {}, tx('Balance due: $0.00')), el('table', {}, el('thead', {}, el('tr', {}, el('td', {}, tx('Status')), el('td', {}, tx('Share')))), el('tbody', {}, el('tr', {}, el('td', {}, tx('$0.00')), el('td', {}, tx('100%'))))));
  run(tree);
  const out = JSON.stringify(tree);
  for (const ui of ['"Status"', '"Share"','Invoice ID', 'Amount', 'Send', 'Secret key', 'Welcome back,', '09/01/2026', 'Call ', ' today', 'Customer', 'Company', 'Balance due: $0.00', '"$0.00"', '100%']) assert.ok(out.includes(ui), ui + ' is gone');
  const other = more(); run(other);
  const text = JSON.stringify(other);
  for (const ui of ['Payor Email', 'Actions', 'View Details', 'Save changes', '"$0.00"', '12.5%', '"3"', '"0"', 'Paid ', ' to account ', '"on"']) assert.ok(text.includes(ui), ui + ' is gone');
});

test('the same original gets the same stand-in across two screens of one ledger; series number in order of appearance', () => {
  const screen = (...ids) => el('html', {}, el('body', {}, el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, tx('Invoice ID')))), el('tbody', {}, ...ids.map((id) => el('tr', {}, el('td', {}, tx(id))))))));
  const ledger = makeLedger(), a = screen('884120', 'INV-77'), b = screen('INV-77', 'new-one', '884120');
  run(a, {}, ledger); run(b, {}, ledger);
  const cells = (t) => { const out = []; walk(t, (n) => { if (n.tagName === 'td') out.push(textOf(n)); }); return out; };
  assert.deepEqual(cells(a), ['Invoice 1', 'Invoice 2']);
  assert.deepEqual(cells(b), ['Invoice 2', 'Invoice 3', 'Invoice 1']);
});

test('a stand-in is never derived from the original', () => {
  const make = (o) => el('html', {}, el('body', {}, el('header', {}, el('span', { class: 'user' }, tx(o.name))),
    el('input', { id: 'apiKey', value: o.key }), el('p', {}, tx(`Mail ${o.email} or call ${o.phone}, ref ${o.id}, due ${o.amount}`)),
    el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, tx('Order No.')))), el('tbody', {}, el('tr', {}, el('td', {}, tx(o.id)))))));
  let next = 1000;
  const renumber = (t) => { walk(t, (n) => { n.id = next++; }); next = 1000; return t; };
  const a = renumber(make(ORIGINALS)), b = renumber(make({ name: 'Bartholomew Featherstonehaugh', key: 'x'.repeat(60), email: 'a@b.example', phone: '+44 (0)20 7946 0018', id: '7755001', amount: '$9.50' }));
  run(a); run(b);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test('a field named from its label: the key field shows "SecretKey-123456"; a password field keeps type=password', () => {
  const tree = page(); run(tree);
  assert.equal(byId(tree, 'k').attributes.value, 'SecretKey-123456');
  const form = el('html', {}, el('body', {},
    el('label', { for: 'p' }, tx('API token')), el('input', { id: 'p', type: 'password', value: '************' }),
    el('input', { id: 'userApiKey', type: 'text', value: '*'.repeat(44) }),               // no label: its id names it
    el('input', { name: 'nothing', value: '' }), el('input', { type: 'radio', value: 'ACH' }),
    el('label', { for: 'f' }, tx('First name')), el('input', { id: 'f', value: '***' }), el('label', { for: 'l' }, tx('Last name')), el('input', { id: 'l', value: '*******' }),
    el('label', { for: 'e' }, tx('Email')), el('input', { id: 'e', type: 'email', value: '*'.repeat(29) }), el('label', { for: 'u' }, tx('Username')), el('input', { id: 'u', value: '********' })));
  run(form);
  const value = (id) => byId(form, id).attributes.value;
  assert.equal(value('p'), 'APIToken-123456');
  assert.equal(byId(form, 'p').attributes.type, 'password');
  assert.equal(value('userApiKey'), 'UserAPIKey-123456');
  assert.equal(find(form, (n) => n.attributes?.name === 'nothing').attributes.value, ''); // an empty field stays empty
  assert.equal(find(form, (n) => n.attributes?.type === 'radio').attributes.value, 'ACH');
  // the fields that say who someone is take the roster's first person, whatever was recorded (here, the recorder's asterisks)
  assert.deepEqual(['f', 'l', 'e', 'u'].map(value), ['Jordan', 'Avery', 'jordan.avery@example.com', 'javery']);
});

const chart = () => el('svg', { class: 'apexcharts-svg' },
  el('g', { class: 'apexcharts-gridlines-horizontal' }, el('line', { y1: '0' }), el('line', { y1: '50' }), el('line', { y1: '100' })),
  el('g', { class: 'apexcharts-line-series' }, el('path', { class: 'apexcharts-line', d: 'M0 100L50 100L100 100' }),
    el('circle', { class: 'apexcharts-marker', cx: '100', cy: '100', j: '2' }), el('circle', { class: 'apexcharts-marker', cx: '0', cy: '100', j: '0' }), el('circle', { class: 'apexcharts-marker', cx: '50', cy: '100', j: '1' })),
  el('g', { class: 'apexcharts-yaxis' }, ...[['100', '0'], ['50', '0'], ['0', '0']].map(([y, v]) => el('text', { class: 'apexcharts-yaxis-label', y }, el('tspan', {}, tx(v)), el('title', {}, tx(v))))));

test('fill rules go last and are not rewritten; chart values are redrawn with a round y axis', () => {
  const tree = el('html', {}, el('body', {},
    el('div', { class: 'card' }, el('p', {}, tx('Total paid')), el('h4', {}, tx('$0.00'))),
    el('div', { class: 'card' }, el('p', {}, tx('Max reserves:')), el('h4', { id: 'max' }, tx('$7,431.20'))),
    el('div', { class: 'card' }, el('p', {}, tx('Total disbursements')), el('h4', {}, tx('0'))),
    el('span', { id: 'plan' }, tx('real plan name')), chart()));
  const { changed } = run(tree, { fill: [{ near: 'Total paid', value: '$12,000.00' }, { near: 'max reserves', value: '$50,000.00' }, { near: 'Total disbursements', value: '48' }, { selector: '#plan', value: 'Standard' }], chart: [{ selector: 'svg.apexcharts-svg', values: [2, 3, 4] }] });
  const h4 = []; walk(tree, (n) => { if (n.tagName === 'h4') h4.push(textOf(n)); });
  assert.deepEqual(h4, ['$12,000.00', '$50,000.00', '48']);               // money figures, yet the money rule did not renumber them
  assert.equal(textOf(byId(tree, 'plan')), 'Standard');
  const labels = []; walk(tree, (n) => { if (n.tagName === 'tspan') labels.push(textOf(n)); });
  assert.deepEqual(labels, ['0', '2', '4']);                               // bottom label first in this chart; 2 ticks of 2: a round axis that holds the values
  assert.equal(byTag(tree, 'path').attributes.d, 'M0 50C25 50 25 25 50 25C75 25 75 0 100 0');
  const cy = []; walk(tree, (n) => { if (n.tagName === 'circle') cy.push([n.attributes.j, n.attributes.cy]); });
  assert.deepEqual(cy.sort(), [['0', '50'], ['1', '25'], ['2', '0']]);
  assert.ok(changed.some((c) => c.kind === 'fill') && changed.some((c) => c.kind === 'chart'));
});

test('changed records every replaced node with its kind, and never the text', () => {
  const tree = page(), before = JSON.parse(JSON.stringify(tree));
  const { changed } = scrub(tree, ALL, makeLedger(), { user: findSignedInUser(tree) });
  const old = new Map(); walk(before, (n) => old.set(n.id, JSON.stringify({ ...n, childNodes: undefined })));
  const now = new Map(); walk(tree, (n) => now.set(n.id, JSON.stringify({ ...n, childNodes: undefined })));
  const ids = new Set(changed.map((c) => c.id));
  for (const [id, was] of old) if (now.has(id) && now.get(id) !== was) assert.ok(ids.has(id), `node ${id} changed without a record`);
  for (const c of changed) { assert.deepEqual(Object.keys(c).sort(), ['id', 'kind']); assert.match(c.kind, /^(secret|series|money|email|key|phone|digits|fill|chart|blind|avatar|user)$/); }
  for (const kind of ['secret', 'series', 'money', 'email', 'phone', 'avatar', 'user']) assert.ok(changed.some((c) => c.kind === kind), 'no ' + kind);
  const said = JSON.stringify(changed);
  for (const v of Object.values(ORIGINALS)) assert.ok(!said.includes(v));
});

test('what stays as recorded in a table: a real date, a zero sum, a percentage, a small count, the interface words listed to keep', () => {
  const keep = new Set(['simple payment']);
  for (const v of ['09/01/2026', '2026-09-01', '9/1/26 10:42 AM', '$0.00', '$.00', '12.5%', '0%', '3', '999', 'Simple Payment']) assert.ok(stays(v, keep), v);
  for (const v of ['123-45-6789', '13/45/2026', '$0.01', '1234', 'Rita Quill', 'Disbursement', '']) assert.ok(!stays(v, keep), v);
});

// ---- the signed-in user

test('the signed-in user is found in the header and replaced everywhere, in text and in attributes', () => {
  const tree = page();
  find(tree, (n) => n.tagName === 'body').childNodes.push(el('p', {}, tx('The Rita Quill Lamp, by quill & co. Ask RITA.')), el('a', { title: 'Write to Rita', 'aria-label': 'Quill' }, tx('Contact')));
  const user = findSignedInUser(tree);
  assert.deepEqual(user, { full: 'Rita Quill', first: 'Rita', last: 'Quill' });
  scrub(tree, ALL, makeLedger(), { user });
  assert.equal(textOf(byTag(tree, 'h2')), 'Welcome back, Jordan Avery');
  assert.equal(textOf(byId(tree, 'user-name')), 'Jordan Avery');
  assert.ok(JSON.stringify(tree).includes('The Jordan Avery Lamp, by Avery & co. Ask Jordan.')); // a product named after them goes too: the sweep's job is leaks
  const a = byTag(tree, 'a');
  assert.deepEqual([a.attributes.title, a.attributes['aria-label']], ['Write to Jordan', 'Avery']);
  assert.ok(!/rita|quill/i.test(JSON.stringify(tree)));
});

test('no header, no user: the scrub still runs; menu items and options that merely look like names are not taken for one', () => {
  const plain = el('html', {}, el('body', {}, el('h1', {}, tx('Rita Quill')), el('p', {}, tx('rita.quill@acme-corp.example'))));
  assert.equal(findSignedInUser(plain), null);
  scrub(plain, ALL, makeLedger(), { user: null });
  assert.equal(textOf(byTag(plain, 'p')), 'priya.raman@example.com');
  const menu = el('html', {}, el('body', {}, el('nav', { class: 'navbar' },
    el('a', { class: 'dropdown-item' }, el('span', {}, tx('Company Settings'))), el('a', {}, tx('Company Settings')), el('button', {}, tx('Sign Out')),
    el('select', {}, el('option', {}, tx('Acme Corp')), el('option', {}, tx('Acme Corp')), el('option', {}, tx('Acme Corp'))))));
  assert.equal(findSignedInUser(menu), null);
  const named = el('html', {}, el('head', {}, el('title', {}, tx('API Keys - Fixture Admin'))), el('body', {}, el('header', {}, el('strong', {}, tx('Fixture Admin')), el('a', {}, tx('API Keys')))));
  assert.equal(findSignedInUser(named), null);                              // the site's own name in its header is not a person
  // a menu item in a place that says "user", made of the site's own form words, beside a real name: the name wins
  const site = () => el('html', {}, el('body', {}, el('nav', {}, el('div', { class: 'user-nav' }, el('a', { class: 'user-link' }, el('span', {}, tx('User Management'))))),
    el('label', { for: 'key' }, tx('User API key')), el('input', { id: 'key' }), el('h5', {}, tx('API Key Management'))));
  assert.equal(findSignedInUser([site(), site(), site()]), null);
  const withName = site(); byTag(withName, 'body').childNodes.push(el('div', {}, el('div', { class: 'avatar' }), el('h5', {}, tx('Rita Quill'))));
  assert.equal(findSignedInUser([site(), withName, site()]).full, 'Rita Quill');
});

test('the user is found across the screens of a recording: the name beside the avatar, backed by the first name in the user menu', () => {
  const header = () => el('header', { id: 'page-topbar' }, el('button', { id: 'page-header-user-dropdown' }, el('img', { class: 'header-profile-user', src: 'a.png' }), el('span', {}, tx('Rita'))),
    el('a', { class: 'dropdown-item' }, el('span', {}, tx('Company Settings'))));
  const home = el('html', {}, el('body', {}, header(), el('div', {}, el('div', { class: 'profile-user-wid' }, el('img', { src: 'a.png' })), el('h5', {}, tx('Rita Quill'))), el('h4', {}, tx('Recent Transactions'))));
  const profile = el('html', {}, el('body', {}, header(), el('h4', {}, tx('Monthly Earning'))));
  const user = findSignedInUser([home, profile]);
  assert.deepEqual(user, { full: 'Rita Quill', first: 'Rita', last: 'Quill' });
  scrub(profile, ALL, makeLedger(), { user });
  assert.equal(textOf(byId(profile, 'page-header-user-dropdown')), 'Jordan');
  assert.ok(JSON.stringify(profile).includes('Company Settings'));
});

test('weak evidence finds NO user: an interface heading beside something called "account" is not a person, nor is a word the interface uses', () => {
  // the page that misled it: the user menu's button shows one short name; a section heading of two capitalised words
  // stands beside an element whose id says "Account"; its words are the interface's own ("... Settings" three times over)
  const product = () => el('html', {}, el('body', {},
    el('header', { id: 'page-topbar' }, el('button', { id: 'page-header-user-dropdown', class: 'header-item' }, el('img', { class: 'header-profile-user', src: 'a.png' }), el('span', {}, tx('ODA'))),
      el('a', { class: 'dropdown-item' }, el('span', {}, tx('Application Settings'))), el('a', { class: 'dropdown-item' }, el('span', {}, tx('User Management')))),
    el('div', { class: 'row' }, el('h5', {}, tx('Support Settings'))), el('div', { class: 'row' }, el('h5', {}, tx('Webhook Settings'))),
    el('div', { class: 'row' }, el('h5', { class: 'text-muted' }, tx('Invoice Settings'))), el('div', { id: 'invoiceAccountDetailsDiv', class: 'row' }, el('h5', {}, tx('Invoice Account')), el('span', {}, tx('****')))));
  assert.equal(findSignedInUser([product(), product()]), null);
  // a user menu whose button reads an interface word ("Account") backs no one: it would back every phrase with that word
  const menu = el('html', {}, el('body', {}, el('header', {}, el('button', { class: 'user-menu' }, tx('Account'))), el('h5', {}, tx('Bank Account')), el('h5', {}, tx('Account Details'))));
  assert.equal(findSignedInUser(menu), null);
  // "user" or "account" in a class outside the page header, with no picture of a person beside it, is no evidence
  const list = el('html', {}, el('body', {}, el('div', { class: 'user-table-wrap' }, el('h5', {}, tx('Active Users'))), el('div', { id: 'accountPanel' }, el('span', {}, tx('Northwind Mutual')))));
  assert.equal(findSignedInUser(list), null);
  // a heading (h1 to h4) is a title, wherever it stands
  const titled = el('html', {}, el('body', {}, el('header', {}, el('h2', { class: 'user-title' }, tx('Rita Quill')))));
  assert.equal(findSignedInUser(titled), null);
  // strong evidence still finds the person: the first name on the header's user button, though other people share it in a table
  const people = el('html', {}, el('body', {}, el('header', {}, el('button', { class: 'user-dropdown' }, tx('Rita'))), el('div', {}, el('div', { class: 'avatar' }), el('h5', {}, tx('Rita Quill'))),
    el('table', {}, el('tbody', {}, el('tr', {}, el('td', {}, tx('Rita Adams'))), el('tr', {}, el('td', {}, tx('Rita Stone')))))));
  assert.equal(findSignedInUser(people).full, 'Rita Quill');
  // and a name standing next to an email of the same person
  const card = el('html', {}, el('body', {}, el('div', { class: 'card' }, el('span', {}, tx('Ines Marlow')), el('span', {}, tx('ines.marlow@harbor-freight.example')))));
  assert.equal(findSignedInUser(card).full, 'Ines Marlow');
  assert.equal(findSignedInUser(el('html', {}, el('body', {}, el('div', { class: 'card' }, el('span', {}, tx('Ines Marlow')), el('span', {}, tx('billing@harbor-freight.example')))))), null);
});

test('resolveUser: a `user` rule names the element that holds the name, or switches detection off; it says how the user was found, never the name', async () => {
  const { resolveUser } = await import('./scrub.mjs');
  const screen = (name, extra = []) => el('html', {}, el('body', {}, el('header', {}, el('button', { id: 'user-dropdown' }, el('span', { class: 'who' }, tx(name)), ...extra)), el('p', {}, tx(`Signed in as ${name}. Soda and oda are words.`))));
  const a = screen('ODA'), b = screen('ODA'), screens = [{ i: 15, tree: a }, { i: 16, tree: b }], span = find(a, (n) => n.attributes?.class === 'who');
  // by selector: read from the first screen where it finds exactly one element holding a name
  const byRule = resolveUser(screens, [{ selector: '#user-dropdown .who' }]);
  assert.deepEqual([byRule.by, byRule.screen, byRule.node, byRule.user], ['rule', 15, span.id, { full: 'ODA', first: 'ODA', last: 'ODA' }]);
  assert.deepEqual(resolveUser(screens, [{ screen: 16, node: find(b, (n) => n.attributes?.class === 'who').id }]).screen, 16);
  // a one-word name is replaced where it stands exactly as written, whole words only
  scrub(a, ALL, makeLedger(), { user: byRule.user });
  assert.equal(textOf(span), 'Jordan');
  assert.equal(textOf(byTag(a, 'p')), 'Signed in as Jordan. Soda and oda are words.');
  // fails closed: no such element, several, or text that is not a name: no user, and why; detection is not tried instead
  for (const [rule, reason] of [[{ selector: '.nobody' }, 'no such element'], [{ selector: 'span, p' }, 'no such element'], [{ selector: 'p' }, 'not a name'], [{ screen: 15, node: 99999 }, 'no such element']])
    assert.deepEqual(resolveUser([{ i: 15, tree: screen('ODA') }], [rule]), { user: null, by: 'none', reason }, JSON.stringify(rule));
  assert.deepEqual(resolveUser(screens, [{ off: true }]), { user: null, by: 'off' });
  assert.deepEqual(resolveUser(screens, [{ off: true }, { selector: '#user-dropdown .who' }]).by, 'rule', 'the last rule for a host is the one that counts');
  // with no rule: detection, and where it found the name
  const home = el('html', {}, el('body', {}, el('header', { class: 'topbar' }, el('span', { id: 'user-name' }, tx('Rita Quill')))));
  const found = resolveUser([{ i: 3, tree: el('html', {}, el('body', {})) }, { i: 4, tree: home }], []);
  assert.deepEqual([found.by, found.screen, found.node, found.user.full], ['detection', 4, byId(home, 'user-name').id, 'Rita Quill']);
  assert.deepEqual(resolveUser([{ i: 3, tree: el('html', {}, el('body', {})) }], []), { user: null, by: 'none' });
  assert.ok(!JSON.stringify({ ...byRule, user: undefined }).includes('ODA'));
});

// ---- blind rules

test('a blind rule answers with the place, the tag and the length: never the text, never the stand-in', () => {
  const tree = page(), ledger = makeLedger();
  const h2 = byTag(tree, 'h2'), cell = find(tree, (n) => n.tagName === 'td' && textOf(n) === '$4,312.77'), field = byId(tree, 'k');
  const answers = [blindReplace(tree, { node: h2.id, as: 'name' }, ledger), blindReplace(tree, { node: cell.id, as: 'amount' }, ledger), blindReplace(tree, { node: field.id, as: 'key' }, ledger),
    blindReplace(tree, { node: byTag(tree, 'p').id, as: 'series', label: 'Phone line' }, ledger), blindReplace(tree, { node: byTag(tree, 'button').id, as: 'email' }, ledger), blindReplace(tree, { node: byTag(tree, 'svg').id, as: 'company' }, ledger)];
  assert.deepEqual(answers[0], { ok: true, node: h2.id, tag: 'h2', length: 'Welcome back, Rita Quill'.length, kind: 'blind' });
  const said = JSON.stringify(answers), flat = squash(said);
  for (const v of [...Object.values(ORIGINALS), 'Welcome back', 'Jordan', 'Avery', 'Northwind', 'SecretKey', '$100.00', 'Phone line 1', 'example.com']) { assert.ok(!said.includes(v)); assert.ok(!flat.includes(squash(v))); }
  assert.equal(textOf(h2), 'Jordan Avery');
  assert.equal(textOf(cell), '$100.00');
  assert.equal(field.attributes.value, 'SecretKey-123456');
  assert.equal(textOf(byTag(tree, 'p')), 'Phone line 1');
  assert.equal(textOf(byTag(tree, 'button')), 'priya.raman@example.com');
  assert.equal(byTag(tree, 'button').attributes.title, 'priya.raman@example.com');
  assert.equal(textOf(byTag(tree, 'svg')), 'Northwind Mutual');
  assert.deepEqual(blindReplace(tree, { node: 99999, as: 'name' }, ledger), { ok: false, reason: 'no such node' });
});

test('a blind rule twice over is the same as once; a bare figure becomes a round sum in the ledger\'s series', () => {
  const tree = el('html', {}, el('body', {}, el('p', { id: 'a' }, tx('4,312.77')), el('p', { id: 'b' }, tx('17.00')), el('p', { id: 'c' }, tx('4,312.77'))));
  const ledger = makeLedger(), ids = ['a', 'b', 'c'].map((id) => byId(tree, id).id);
  for (const node of ids) blindReplace(tree, { node, as: 'amount' }, ledger);
  const once = JSON.stringify(tree);
  assert.deepEqual(ids.map((node) => textOf(find(tree, (n) => n.id === node))), ['$100.00', '$200.00', '$100.00']);
  for (const node of ids) blindReplace(tree, { node, as: 'amount' }, ledger);
  assert.equal(JSON.stringify(tree), once);
});

test('blind rules run through the scrub: first, kept from the default rules, their originals handed to the sweep and to no one else', () => {
  const tree = more(), select = byId(tree, 'payee'), originals = [];
  const lamp = el('p', { id: 'lamp' }, tx('Lindqvist & Daughters, est. 1904'));
  byTag(tree, 'body').childNodes.push(lamp);
  const out = scrub(tree, old({ blind: [{ screen: 3, node: select.id, as: 'company' }, { screen: 3, node: lamp.id, as: 'name' }, { screen: 4, node: byTag(tree, 'nav').id, as: 'key' }] }, 3), makeLedger(), { user: findSignedInUser(tree), originals });
  assert.equal(select.childNodes.length, 1);
  assert.equal(textOf(select), 'Northwind Mutual');
  assert.equal(textOf(lamp), 'Jordan Avery');
  assert.equal(textOf(byTag(tree, 'nav')), 'Jordan Avery');               // screen 4's rule is not this screen's: the name there went by the user rule
  assert.deepEqual(out.applied, [{ ok: true, node: select.id, tag: 'select', length: out.applied[0].length, kind: 'blind' }, { ok: true, node: lamp.id, tag: 'p', length: 32, kind: 'blind' }]);
  assert.ok(out.changed.some((c) => c.kind === 'blind'));
  assert.ok(originals.some((o) => o.kind === 'company' && o.value === MORE.payee) && originals.some((o) => o.kind === 'name' && o.value === 'Lindqvist & Daughters, est. 1904'));
  const said = JSON.stringify(out);
  for (const v of [...Object.values(MORE), 'Lindqvist', 'Northwind']) assert.ok(!said.includes(v));
});

// ---- interface text inside a table cell

const cellsOf = (t) => { const out = []; walk(t, (n) => { if (n.tagName === 'td') out.push(textOf(n)); }); return out; };
const table = (heads, ...rows) => el('table', {}, el('thead', {}, el('tr', {}, ...heads.map((h) => el('th', {}, tx(h))))), el('tbody', {}, ...rows.map((cells) => el('tr', {}, ...cells.map((c) => el('td', {}, ...[c].flat()))))));
const actions = () => el('div', { class: 'btn-group dropstart' }, el('button', { type: 'button', class: 'btn' }, tx('View'), el('i', { class: 'chevron' })),
  el('div', { class: 'dropdown-menu' }, el('a', { class: 'dropdown-item', href: '/e/1' }, el('i', {}), tx('Edit')), el('a', { class: 'dropdown-item', href: '/h/1' }, tx('History'))));

test('a control\'s label in a table cell is interface text: a menu\'s items, and a label that repeats down its column; a link that differs per row is data', () => {
  const firms = ['Halvorsen Freight', 'Brightwater Supply', 'Lindqvist & Daughters'];
  const tree = el('html', {}, el('body', {}, table(['Company', 'Contact', 'Open', 'Actions'],
    ...firms.map((f, i) => [el('a', { href: `/c/${i}` }, tx(f)), el('a', { href: `mailto:pay${i}@firm${i}.example` }, tx(`pay${i}@firm${i}.example`)), el('a', { class: 'btn', href: `/o/${i}` }, tx('Open')), actions()]))));
  run(tree);
  const rows = cellsOf(tree);
  assert.deepEqual([0, 4, 8].map((i) => rows[i]), ['Company 1', 'Company 2', 'Company 3']);          // a link whose text differs per row: data
  for (const i of [1, 5, 9]) assert.match(rows[i], /^[a-z.]+@example\.com$/);                         // a mailto link: still an email stand-in
  assert.equal(new Set([1, 5, 9].map((i) => rows[i])).size, 3);
  assert.deepEqual([2, 6, 10].map((i) => rows[i]), ['Open', 'Open', 'Open']);                         // the same link in every row
  assert.deepEqual([3, 7, 11].map((i) => rows[i]), ['ViewEditHistory', 'ViewEditHistory', 'ViewEditHistory']); // a button and its menu: every item keeps its words
  const out = JSON.stringify(tree).toLowerCase();
  for (const part of ['halvorsen', 'brightwater', 'lindqvist', 'firm0', 'pay1@']) assert.ok(!out.includes(part), part + ' survived');
});

test('interface text in a cell needs evidence: one row is none, a value that repeats in some rows is none, a menu is', () => {
  // one row: a link is data (nothing says otherwise); the menu's items are a menu's whatever the rows
  const one = el('html', {}, el('body', {}, table(['Company', 'Actions'], [el('a', { href: '/c/1' }, tx('Halvorsen Freight')), actions()])));
  run(one);
  assert.deepEqual(cellsOf(one), ['Company 1', 'ViewEditHistory']);
  // the same company linked in two rows of three: data, the same stand-in for the same value
  const some = el('html', {}, el('body', {}, table(['Company'], ...['Halvorsen Freight', 'Brightwater Supply', 'Halvorsen Freight'].map((f) => [el('a', { href: '#' }, tx(f))]))));
  run(some);
  assert.deepEqual(cellsOf(some), ['Company 1', 'Company 2', 'Company 1']);
  // other ways a page writes a control or a menu: role=menuitem, role=menu, <summary>, a link that says role=button; text beside them is still data
  const roles = el('html', {}, el('body', {}, table(['Payee', 'More'],
    [[tx('Oskar Lindqvist '), el('span', { role: 'button' }, tx('Copy'))], el('details', {}, el('summary', {}, tx('Options')), el('ul', { role: 'menu' }, el('li', { role: 'menuitem' }, tx('Archive')), el('li', {}, tx('Rename'))))])));
  run(roles);
  assert.deepEqual(cellsOf(roles), ['Payee 1Copy', 'OptionsArchiveRename']);
  // a menu item shaped like data is still met by the patterns: interface text is left by the cell rule, not by every rule
  const shaped = el('html', {}, el('body', {}, table(['Actions'], [el('div', { class: 'dropdown-menu' }, el('a', { class: 'dropdown-item' }, tx('Mail rita.quill@acme-corp.example')))])));
  run(shaped);
  assert.deepEqual(cellsOf(shaped), ['Mail priya.raman@example.com']);
  // a class that merely has "menu" in it is no evidence (security review): only the names listed, exactly, and the listed library prefixes
  for (const cls of ['user-menu-list', 'menu_owner', 'context-menu', 'dropdown-content', 'dropdown']) {
    const loose = el('html', {}, el('body', {}, table(['Owner'], [el('div', { class: cls }, el('a', { href: '#' }, tx('Oskar Lindqvist')))])));
    run(loose);
    assert.deepEqual(cellsOf(loose), ['Owner 1'], cls);
  }
  for (const cls of ['menu', 'menu-item', 'MuiMenu-list', 'ant-dropdown-menu-item']) {
    const listed = el('html', {}, el('body', {}, table(['Actions'], [el('div', { class: cls }, el('a', { href: '#' }, tx('Archive')))])));
    run(listed);
    assert.deepEqual(cellsOf(listed), ['Archive'], cls);
  }
});

test('what a cell holds for the sweep: its data as `original`, and what was kept as interface text on evidence as `control`: neither leaves the list', async () => {
  const { cellJudge } = await import('./scrub.mjs');
  const tree = el('html', {}, el('body', {}, table(['Company', 'Open', 'Actions'],
    ...['Halvorsen Freight', 'Brightwater Supply'].map((f) => [[el('b', {}, tx(f.split(' ')[0])), tx(' '), el('i', {}, tx(f.split(' ')[1])), tx(' '), el('button', {}, tx('Pin'))], el('a', { href: '#' }, tx('Open')), actions()]))));
  const judge = cellJudge(tree), tds = []; walk(tree, (n) => { if (n.tagName === 'td') tds.push(n); });
  const said = (td) => { const j = judge(td); return [j.data.map((t) => t.textContent).join('|'), j.original, j.control, j.labels.length]; };
  assert.deepEqual(said(tds[0]), ['Halvorsen|Freight', 'Halvorsen Freight', 'Pin', 1]); // the white space between nodes is part of what a frame would show
  assert.deepEqual(said(tds[1]), ['', '', 'Open', 1]);                                   // a repeated link: not data, but still looked for, as a control
  assert.deepEqual(said(tds[2]), ['', '', 'ViewEditHistory', 3]);                        // a repeated button and a menu
  const lone = el('html', {}, el('body', {}, table(['Company'], [el('button', {}, tx('Halvorsen Freight'))])));
  let td; walk(lone, (n) => { if (n.tagName === 'td') td = n; });
  const j = cellJudge(lone)(td);
  assert.deepEqual([j.data.length, j.original, j.control], [0, 'Halvorsen Freight', '']); // a button's caption is never rewritten, but with no evidence it stays a cell's original
});

// ---- columns kept on purpose

const fields = () => el('html', {}, el('body', {}, el('table', { id: 'map' },
  el('thead', {}, el('tr', {}, el('th', { colspan: '2' }, tx('Source')), el('th', {}, tx('DC title')), el('th', {}, tx('DC API name')), el('th', {}, tx('Example')))),
  el('tbody', {},
    el('tr', {}, el('td', {}, tx('7755001')), el('td', {}, tx('Halvorsen Freight')), el('td', {}, tx('Payee Name')), el('td', {}, el('code', { title: 'payee_name' }, tx('payee_name'))), el('td', {}, tx('Oskar Lindqvist'))),
    el('tr', {}, el('td', {}, tx('7755002')), el('td', {}, tx('Brightwater Supply')), el('td', {}, tx('Reference')), el('td', {}, el('code', {}, tx('payment_reference_number_external'))), el('td', {}, tx('Wire ref 7741093355'))))),
  table(['DC title', 'Owner'], [tx('Payee Name'), tx('Oskar Lindqvist')])));
const KEPT = ['Payee Name', 'payee_name', 'Reference', 'payment_reference_number_external'];

test('keepColumns: the named columns of the named table stay as recorded, by header text and column index; the rest is scrubbed as usual', () => {
  const plain = fields(); run(plain);
  assert.deepEqual(cellsOf(plain).slice(0, 5), ['Source 1', 'Source 2', 'DC title 1', 'DC api name 1', 'Example 1']); // nothing is kept by default
  const tree = fields(), id = byId(tree, 'map').id;
  const out = run(tree, { keepColumns: [{ table: '#map', columns: ['dc title', 'DC API NAME', 'No such column'] }] });
  const rows = cellsOf(tree);
  assert.deepEqual(rows.slice(0, 10), ['Source 1', 'Source 2', 'Payee Name', 'payee_name', 'Example 1', 'Source 3', 'Source 4', 'Reference', 'payment_reference_number_external', 'Example 2']);
  assert.equal(find(tree, (n) => n.tagName === 'code').attributes.title, 'payee_name');          // a tooltip that reads exactly as the kept text
  assert.deepEqual(rows.slice(10), ['DC title 1', 'Owner 1']);                                    // another table with a column of that name: not named, not kept
  assert.deepEqual(out.kept, [{ rule: 0, ok: true, table: id, column: 'dc title', cells: 2 }, { rule: 0, ok: true, table: id, column: 'DC API NAME', cells: 2 }, { rule: 0, ok: false, table: id, column: 'No such column', cells: 0, reason: 'no such header' }]);
  assert.deepEqual(out.headers, [{ rule: 0, table: id, others: 2, replaced: [] }]);              // the other column names went through the rules and came out as they were
  assert.ok(out.changed.some((c) => c.kind === 'kept'));
  const heads = []; walk(tree, (n) => { if (n.tagName === 'th') heads.push(textOf(n)); });
  assert.deepEqual(heads.slice(0, 4), ['Source', 'DC title', 'DC API name', 'Example']);
  for (const part of ['7755', 'halvorsen', 'brightwater', 'lindqvist', '7741093355']) assert.ok(!JSON.stringify(tree).toLowerCase().includes(part), part + ' survived');
  for (const v of KEPT) assert.ok(!JSON.stringify(out).includes(v), 'a kept value is in the answer');
});

test('keepColumns: the table by node id or by a header near it; a rule for another screen, or a table that is not there, keeps nothing', () => {
  for (const how of [(t) => byId(t, 'map').id, () => ({ near: 'dc api name' })]) {
    const tree = fields(), out = run(tree, { keepColumns: [{ screen: 0, table: how(tree), columns: ['DC API name'] }] });
    assert.deepEqual(cellsOf(tree).slice(2, 4), ['DC title 1', 'payee_name']);
    assert.deepEqual(out.kept.map((k) => [k.ok, k.cells]), [[true, 2]]);
  }
  const other = fields(), json = { keepColumns: [{ screen: 3, table: '#map', columns: ['DC title'] }] };
  assert.deepEqual(scrub(other, old(json, 2), makeLedger()).kept, []);
  assert.equal(cellsOf(other)[2], 'DC title 1');
  assert.equal(scrub(fields(), old(json, 3), makeLedger()).kept[0].cells, 2);
  assert.deepEqual(run(fields(), { keepColumns: [{ table: '#nope', columns: ['DC title'] }] }).kept, [{ rule: 0, ok: false, table: null, column: 'DC title', cells: 0, reason: 'no table' }]);
});

test('keepColumns fails closed (security review): one table, a real header row, `near` on header cells of one screen; nothing is kept otherwise', () => {
  const nothingKept = (tree, rule, reason) => {
    const plain = JSON.parse(JSON.stringify(tree)); run(plain);
    const out = run(tree, { keepColumns: [rule] });
    assert.deepEqual(out.kept.map((k) => [k.ok, k.cells, k.reason]), rule.columns.map(() => [false, 0, reason]), reason);
    assert.deepEqual(cellsOf(tree), cellsOf(plain), reason + ': the screen is scrubbed as if there were no rule');
    assert.ok(!out.changed.some((c) => c.kind === 'kept'), reason);
  };
  // `near` names a header two tables have: ambiguous, nothing kept (it used to keep both); so does a selector that matches two
  nothingKept(fields(), { screen: 0, table: { near: 'DC title' }, columns: ['DC title'] }, 'ambiguous: 2 tables');
  nothingKept(fields(), { table: 'table', columns: ['DC title'] }, 'ambiguous: 2 tables');
  // `near` with no screen would be asked of every screen: refused
  nothingKept(fields(), { table: { near: 'DC API name' }, columns: ['DC API name'] }, 'near needs a screen');
  // `near` is matched against header cells only: a body cell that reads so finds no table
  nothingKept(fields(), { screen: 0, table: { near: 'Reference' }, columns: ['DC title'] }, 'no table');
  // a name that only a BODY row holds does not make that row the header (it used to, and the whole row was left as recorded)
  const body = () => el('html', {}, el('body', {}, el('table', { id: 't' }, el('thead', {}, el('tr', {}, el('th', {}, tx('Field')), el('th', {}, tx('Owner')))),
    el('tbody', {}, el('tr', {}, el('td', {}, tx('Halvorsen Freight')), el('td', {}, tx('Oskar Lindqvist'))), el('tr', {}, el('td', {}, tx('DC title')), el('td', {}, tx('Rita Quill'))), el('tr', {}, el('td', {}, tx('Brightwater Supply')), el('td', {}, tx('Ines Marlow')))))));
  nothingKept(body(), { table: '#t', columns: ['DC title'] }, 'not in a header row');
  // a table with no thead: its first row is the header row; a row of th cells is one too
  const bare = el('html', {}, el('body', {}, el('table', { id: 't' }, el('tbody', {},
    el('tr', {}, el('td', {}, tx('DC title')), el('td', {}, tx('884120')), el('td', {}, tx('Owner'))), el('tr', {}, el('td', {}, tx('Payee Name')), el('td', {}, tx('7755001')), el('td', {}, tx('Oskar Lindqvist')))))));
  const out = run(bare, { keepColumns: [{ table: '#t', columns: ['DC title'] }] }), cells = []; walk(bare, (n) => { if (n.tagName === 'td') cells.push(n); });
  assert.deepEqual(out.kept.map((k) => [k.ok, k.cells]), [[true, 1]]);
  assert.deepEqual([textOf(cells[0]), textOf(cells[3])], ['DC title', 'Payee Name']);
  // only the header cells NAMED are kept: the others go through the rules, and the ones a rule replaced are said by node
  assert.ok(!['884120', 'Owner', '7755001', 'Oskar Lindqvist'].some((v) => cellsOf(bare).includes(v)));
  assert.deepEqual(out.headers, [{ rule: 0, table: byId(bare, 't').id, others: 2, replaced: [cells[1].id, cells[2].id] }]);
});

test('keepColumns keeps the visible text only (security review): other attributes and fields inside a kept cell still go through the rules', () => {
  const tree = el('html', {}, el('body', {}, el('header', {}, el('span', { class: 'user-name' }, tx('Rita Quill'))), el('table', { id: 't' },
    el('thead', {}, el('tr', {}, el('th', {}, tx('DC title')), el('th', {}, tx('Example')))),
    el('tbody', {}, el('tr', {},
      el('td', { title: 'Call 555-0199-4821', 'data-owner': 'rita.quill@acme-corp.example', 'aria-label': 'Rita Quill' }, el('span', { title: 'Payee Name' }, tx('Payee Name')), el('input', { value: 'sk_test_51Hqz9XbT2LmQ0pRrS7uVwX', 'aria-label': 'Secret key' }), el('img', { class: 'avatar', src: 'x.png', alt: 'Rita Quill' })),
      el('td', {}, tx('Oskar Lindqvist')))))));
  const out = run(tree, { keepColumns: [{ table: '#t', columns: ['DC title'] }] });
  const td = find(tree, (n) => n.tagName === 'td'), said = JSON.stringify(tree);
  assert.equal(textOf(td), 'Payee Name');
  assert.equal(find(td, (n) => n.tagName === 'span').attributes.title, 'Payee Name');
  assert.equal(find(td, (n) => n.tagName === 'input').attributes.value, 'SecretKey-123456');
  assert.deepEqual([td.attributes['aria-label'], td.attributes['data-owner']], ['Jordan Avery', 'priya.raman@example.com']);
  for (const part of ['0199', 'rita', 'quill', 'sk_test', 'x.png']) assert.ok(!said.toLowerCase().includes(part), part + ' survived in a kept cell');
  // and only text nodes (and the tooltip that repeats them) are marked kept for the sweep
  const marked = new Set(out.changed.filter((c) => c.kind === 'kept').map((c) => c.id)), all = []; walk(tree, (n) => { if (marked.has(n.id)) all.push(n.type === 3 ? '#text' : n.tagName); });
  assert.deepEqual(all.sort(), ['#text', '#text', 'span']); // the header cell's text, the cell's text, the span whose title repeats it
});

// ---- pages full of other people's text (`only`)

// A made-up mail client: folders, a list of other messages (senders, subjects, faces), a search box, and the reading
// pane of the open message with a table in it. Every name and subject here is invented.
const HIDDEN = ['Halvorsen invoices', 'Oskar Lindqvist', 'Re: the Brightwater contract, final terms', 'Ines Marlow', 'Lunch on Thursday?', 'Search Ines Marlow'];
const mail = () => el('html', {}, el('head', {}, el('title', {}, tx('Inbox (3) - rita.quill@acme-corp.example'))), el('body', {},
  el('nav', { class: 'folders' }, el('a', { href: '/f/1', title: 'Halvorsen invoices' }, tx('Halvorsen invoices')), el('a', { href: '/f/2' }, tx('Inbox'))),
  el('div', { class: 'list', role: 'listbox' },
    el('div', { class: 'row', 'data-sender': 'Oskar Lindqvist', 'aria-selected': 'true', 'aria-label': 'From Oskar Lindqvist' }, el('img', { class: 'face', src: 'rostrum-asset:/face1.png', alt: 'Oskar Lindqvist' }),
      el('span', { class: 'from' }, tx(' Oskar Lindqvist ')), el('span', { class: 'subject' }, tx('Re: the Brightwater contract, final terms')), el('span', { class: 'when' }, tx('09/01/2026'))),
    el('div', { class: 'row', style: 'background-image: url("rostrum-asset:/face2.png"); color: red' }, el('span', {}, tx('Ines Marlow')), el('span', {}, tx('Lunch on Thursday?'))),
    el('input', { type: 'search', placeholder: 'Search Ines Marlow', value: 'brightwater' }), el('svg', {}, el('use', { href: '#icon-star' }))),
  el('div', { class: 'reading', role: 'region' }, el('h1', {}, tx('Field mapping for 884120')), el('p', { class: 'from' }, tx('noreply@flow.example')), byId(fields(), 'map'))));
const dashes = (s) => /^–+$/.test(s);

test('only: outside the kept subtree every text, attribute and picture is hidden; inside it the rules run as usual, keepColumns too', () => {
  const tree = mail(), originals = [];
  const out = scrub(tree, old({ only: [{ keep: ['.reading'] }], keepColumns: [{ table: '#map', columns: ['DC title'] }] }), makeLedger(), { user: findSignedInUser(tree), originals });
  const said = JSON.stringify(tree), low = said.toLowerCase();
  for (const part of ['halvorsen', 'inbox', 'oskar', 'lindqvist', 'brightwater', 'marlow', 'lunch', 'thursday', 'rita', 'acme', '09/01/2026', 'face1', 'face2', '/f/1']) assert.ok(!low.includes(part), part + ' is still in the clean screen');
  const by = (cls) => find(tree, (n) => n.attributes?.class === cls);
  // text: a line of dashes as long as the text was, the white space around it left where it was
  assert.equal(textOf(by('from')), ' ' + '–'.repeat(15) + ' ');
  assert.ok(dashes(textOf(by('subject'))) && textOf(by('subject')).length === HIDDEN[2].length && dashes(textOf(byTag(tree, 'title'))) && dashes(textOf(by('when'))));
  // attributes: emptied, but what shows is dashes, and what a stylesheet reads (true/false, a small number, a #reference) stays
  const row = by('row'), search = byTag(tree, 'input');
  assert.deepEqual([row.attributes['data-sender'], row.attributes['aria-label'], row.attributes['aria-selected'], byTag(tree, 'use').attributes.href], ['', '', 'true', '#icon-star']);
  assert.ok(dashes(search.attributes.placeholder) && search.attributes.placeholder.length === 18 && dashes(search.attributes.value) && search.attributes.type === 'search');
  // pictures: a flat block, in an img and in a style attribute
  const face = byTag(tree, 'img'), second = find(tree, (n) => n.attributes?.style);
  assert.ok(face.attributes.src.startsWith('data:image/svg+xml,') && face.attributes.alt === '' && !second.attributes.style.includes('url(') && second.attributes.style.includes('color: red'));
  assert.deepEqual(out.dropped, ['face1.png']);
  // the kept pane: scrubbed as any page is, and the column kept on purpose is kept
  assert.equal(textOf(byTag(tree, 'h1')), 'Field mapping for Number 1');
  assert.match(textOf(find(tree, (n) => n.tagName === 'p')), /@example\.com$/);
  assert.deepEqual(cellsOf(tree).slice(0, 5), ['Source 1', 'Source 2', 'Payee Name', 'DC api name 1', 'Example 1']);
  // the answer: counts and the rule's own words; what was hidden is on the sweep's list and marked
  assert.deepEqual(out.only, { texts: 8, attributes: 6, pictures: 2, keeps: [{ rule: 0, keep: '.reading', ok: true, matched: 1 }] });
  for (const v of HIDDEN) assert.ok(originals.some((o) => o.kind === 'greeked' && o.value === v), 'not on the sweep\'s list');
  assert.ok(out.changed.some((c) => c.kind === 'greek') && !JSON.stringify(out).toLowerCase().includes('lindqvist'));
});

test('blindAll: every element a selector matches is replaced as a kind; the interface stays; the same original reads the same on every screen', () => {
  const ledger = makeLedger(), originals = [];
  const rules = (screen) => rulesFor({ blindAll: [{ host: 'mail.site.test', selector: '.row .from', as: 'series', label: 'Sender' }, { selector: '.row .subject', as: 'series', label: 'Subject' }, { screens: { from: 0, to: 1 }, selector: '.face', as: 'picture' },
    { screens: [9], selector: '.reading h1', as: 'company' }, { selector: '.nothing-here', as: 'series', label: 'Tag' }, { selector: 'a > > b', as: 'series' }] }, screen, { host: 'mail.site.test' });
  const first = mail(), again = mail();
  const out = scrub(first, rules(0), ledger, { originals }), by = (t, cls) => { const got = []; walk(t, (n) => { if (n.attributes?.class === cls) got.push(textOf(n)); }); return got; };
  assert.deepEqual([by(first, 'from'), by(first, 'subject')], [['Sender 1', 'noreply@flow.example'], ['Subject 1']]); // the list's sender; `.reading .from` is not in a .row
  const face = byTag(first, 'img');
  assert.ok(face.attributes.src.startsWith('data:image/svg+xml,') && face.attributes.alt === '' && out.dropped.includes('face1.png'));
  // the interface is as recorded: folders, the search box's placeholder, the other row (its spans have no class), the reading pane
  const said = JSON.stringify(first);
  for (const kept of ['Halvorsen invoices', 'Inbox', 'Ines Marlow', 'Lunch on Thursday?', 'Field mapping for 884120', '09/01/2026']) assert.ok(said.includes(kept), kept + ' was replaced though no rule named it');
  assert.ok(!said.includes('Re: the Brightwater contract'));
  // the answer: per rule, what matched and what was replaced; no match is said, not an error; a selector that cannot be read matches nothing
  assert.deepEqual(out.blindedAll, [{ rule: 0, selector: '.row .from', matched: 1, replaced: 1 }, { rule: 1, selector: '.row .subject', matched: 1, replaced: 1 }, { rule: 2, selector: '.face', matched: 1, replaced: 1 },
    { rule: 4, selector: '.nothing-here', matched: 0, replaced: 0 }, { rule: 5, selector: 'a > > b', matched: 0, replaced: 0, reason: 'selector not understood' }]);
  assert.ok(originals.some((o) => o.kind === 'series' && o.value === 'Oskar Lindqvist') && originals.some((o) => o.value === HIDDEN[2]) && !JSON.stringify(out).includes('Lindqvist'));
  // another screen of the same recording: the same sender and subject read the same; a rule for other screens or another site is not this screen's
  scrub(again, rules(9), ledger);
  assert.deepEqual([by(again, 'from')[0], by(again, 'subject')[0], textOf(byTag(again, 'h1')), byTag(again, 'img').attributes.src], ['Sender 1', 'Subject 1', 'Northwind Mutual', 'rostrum-asset:/face1.png']);
  assert.deepEqual(rulesFor({ blindAll: [{ host: 'mail.site.test', selector: '.x', as: 'name' }] }, 3, { host: 'app.site.test' }).filter((r) => r.kind === 'blindAll'), []);
});

test('blindAll marks only what it rewrites (security review): a key, an amount and a field inside an element it touched are still met by the automatic rules', () => {
  const row = () => el('div', { class: 'row', 'aria-label': 'From Oskar Lindqvist, about the Brightwater contract', title: 'Oskar Lindqvist' },
    el('span', { class: 'note' }, tx('Key sk_test_51Hqz9XbT2LmQ0pRrS7uVwX, due $4,312.77, write to ines.marlow@harbor-freight.example')), el('input', { id: 'acct', value: '********', 'aria-label': 'Account number' }),
    el('span', { class: 'who', title: 'acct 000123456789' }, el('img', { class: 'face', src: 'rostrum-asset:/face1.png', alt: 'Oskar Lindqvist' }), el('i', { style: 'background: url("rostrum-asset:/face2.png")' }), tx('OL')), el('span', { class: 'name' }, tx('Oskar Lindqvist')));
  const cases = { attributes: [{ selector: '.row', as: 'attributes' }], picture: [{ selector: '.row .who', as: 'picture' }], series: [{ selector: '.row .name', as: 'series', label: 'Sender' }, { selector: '.row', as: 'attributes' }] };
  for (const [mode, blindAll] of Object.entries(cases)) {
    const tree = el('html', {}, el('body', {}, row())), out = scrub(tree, rulesFor({ blindAll }), makeLedger());
    const by = (cls) => find(tree, (n) => n.attributes?.class === cls);
    // the automatic rules still ran inside the element: the key and the sum are stand-ins, the field is, the account number in a tooltip is; the email (not automatic) is as recorded
    assert.equal(textOf(by('note')), 'Key Key 1, due $100.00, write to ines.marlow@harbor-freight.example', mode);
    assert.equal(byId(tree, 'acct').attributes.value, 'AccountNumber-123456', mode);
    assert.ok(out.changed.some((c) => c.kind === 'key') && out.changed.some((c) => c.kind === 'money') && out.changed.some((c) => c.kind === 'secret'), mode);
    const row1 = by('row'), img = byTag(tree, 'img');
    if (mode === 'attributes') { // only the row's own tooltip and aria text went: its text and its children are as recorded
      assert.deepEqual([row1.attributes['aria-label'], row1.attributes.title, textOf(by('name')), img.attributes.src, by('who').attributes.title], ['', '', 'Oskar Lindqvist', 'rostrum-asset:/face1.png', 'acct Account number 1'], mode);
    }
    if (mode === 'picture') { // every picture under it is flat (the img and the inline background of a child), and what it shows as text is emptied
      assert.ok(img.attributes.src.startsWith('data:image/svg+xml,') && img.attributes.alt === '' && !byTag(tree, 'i').attributes.style.includes('url(') && out.dropped.includes('face1.png'), mode);
      assert.deepEqual([textOf(by('who')), textOf(by('name')), by('who').attributes.title], ['', 'Oskar Lindqvist', ''], mode);
    }
    if (mode === 'series') assert.deepEqual([textOf(by('name')), row1.attributes['aria-label'], img.attributes.src], ['Sender 1', '', 'rostrum-asset:/face1.png'], mode); // a second rule on the same row still applies
  }
});

test('blindAll as attributes: the specification\'s own token for an ARIA attribute is emptied but is no original; the same word as free text, and any other value, still is', async () => {
  const { findHits } = await import('./sweep.mjs');
  const listed = (attributes, keep = []) => {
    const tree = el('html', {}, el('body', {}, el('div', { class: 'row', ...attributes }))), originals = [];
    scrub(tree, rulesFor({ blindAll: [{ selector: '.row', as: 'attributes' }], keep }), makeLedger(), { originals });
    assert.ok(Object.keys(attributes).every((k) => find(tree, (n) => n.attributes?.class === 'row').attributes[k] === ''), 'every one is emptied, listed or not');
    return originals;
  };
  const button = [{ id: 1, kind: 'text', s: 'Menu ', p: 2 }, { id: 3, kind: 'attr:aria-haspopup', s: 'menu' }]; // another page: a button captioned with the same word, the same token
  // a token: not on the list, so the word elsewhere is not a finding
  const tokens = listed({ 'aria-haspopup': 'menu', 'aria-current': 'page', 'aria-live': 'polite', 'aria-relevant': 'additions text', 'aria-orientation': 'vertical', 'aria-sort': 'ascending' });
  assert.deepEqual(tokens, []);
  assert.deepEqual(findHits(button, tokens), []);
  // the same word where a page writes what it likes: on the list, and found
  for (const name of ['aria-label', 'title', 'data-tooltip', 'alt', 'data-kind', 'aria-roledescription', 'aria-valuetext']) {
    const free = listed({ [name]: 'menu' });
    assert.deepEqual(free, [{ kind: 'series', value: 'menu' }], name);
    assert.equal(findHits(button, free).length, 2, name);
  }
  // not the token list of ITS attribute: a name, another attribute's token, another case, a token beside a name
  assert.deepEqual(listed({ 'aria-haspopup': 'Lindqvist' }), [{ kind: 'series', value: 'Lindqvist' }]);
  assert.deepEqual(listed({ 'aria-live': 'menu', 'aria-haspopup': 'Menu', 'aria-current': 'dialog', 'aria-expanded': 'mixed' }).map((o) => o.value), ['menu', 'Menu', 'dialog', 'mixed']);
  assert.deepEqual(listed({ 'aria-relevant': 'additions Brightwater', 'aria-haspopup': 'menu dialog', constructor: 'menu' }).map((o) => o.value), ['additions Brightwater', 'menu dialog', 'menu']);
  // a `keep` word is not listed; any other word is
  assert.deepEqual(listed({ title: 'Inbox', 'aria-label': 'Brightwater' }, ['Inbox']), [{ kind: 'series', value: 'Brightwater' }]);
});

test('only fails closed: a keep that finds nothing, or several subtrees without `all`, keeps nothing; a table outside what is kept keeps no column', () => {
  const hides = (rule, expected, kept) => {
    const tree = mail(), out = scrub(tree, old({ only: [rule] }), makeLedger());
    assert.deepEqual(out.only.keeps.map((k) => [k.ok, k.matched, k.reason]), expected);
    const rest = []; walk(tree, (n) => { if (n.type === 3 && n.textContent.trim() && !dashes(n.textContent.trim())) rest.push(n.textContent); });
    assert.equal(rest.length > 0, kept, JSON.stringify(rule));
  };
  hides({ keep: ['.nope'] }, [[false, 0, 'no such element']], false);
  hides({ keep: ['.row'] }, [[false, 2, 'ambiguous: 2 subtrees']], false);
  hides({ keep: ['.row'], all: true }, [[true, 2, undefined]], true);
  hides({ keep: [] }, [], false);                                                    // nothing kept: the whole page is hidden
  hides({ keep: ['.reading', '.reading table'] }, [[true, 1, undefined], [true, 1, undefined]], true);
  const byNode = mail(), pane = find(byNode, (n) => n.attributes?.class === 'reading');
  assert.deepEqual(scrub(byNode, old({ only: [{ keep: [pane.id] }] }), makeLedger()).only.keeps, [{ rule: 0, keep: pane.id, ok: true, matched: 1 }]);
  // keepColumns names a table that the `only` rule hides: nothing of it is kept
  const tree = mail(), out = scrub(tree, old({ only: [{ keep: ['h1'] }], keepColumns: [{ table: '#map', columns: ['DC title'] }] }), makeLedger());
  assert.deepEqual(out.kept.map((k) => [k.ok, k.reason]), [[false, 'no table']]);
  assert.ok(cellsOf(tree).every(dashes));
  // which screens a rule is for: a range, a list, a host; a host that cannot be compared applies (it errs on hiding)
  const json = { only: [{ screens: { from: 0, to: 14 }, host: 'mail.site.test', keep: ['.reading'] }, { screens: [20, 22], keep: [] }] };
  const on = (screen, host) => old(json, screen, { host }).filter((r) => r.kind === 'only').map((r) => r.i);
  assert.deepEqual([on(3, 'mail.site.test'), on(14, 'MAIL.site.test'), on(15, 'mail.site.test'), on(3, 'app.site.test'), on(3, undefined), on(22, 'app.site.test'), on(21, 'app.site.test')], [[0], [0], [], [], [0], [1], []]);
  assert.deepEqual(scrub(mail(), old({}), makeLedger()).only, null);
});

test('only and the sweep: what was hidden is looked for in every frame; a hidden text planted in a frame fails, the clean screen does not', async () => {
  const { findHits } = await import('./sweep.mjs');
  const { setUiText } = await import('./scrub.mjs');
  const tree = mail(), originals = [];
  scrub(tree, old({ only: [{ keep: ['.reading'] }] }), makeLedger(), { originals });
  const seen = []; walk(tree, (n) => { if (n.type === 3) seen.push({ id: n.id, kind: 'text', s: n.textContent + ' ' }); else if (n.type === 2) for (const [k, v] of Object.entries(n.attributes)) if (typeof v === 'string' && !['class', 'style', 'src', 'href', 'type', 'id', 'role'].includes(k)) seen.push({ id: n.id, kind: 'attr:' + k, s: v }); });
  const hidden = originals.filter((o) => o.kind === 'greeked');
  assert.deepEqual(findHits(seen, hidden), []);
  const planted = findHits([...seen, { id: 9001, kind: 'text', s: 'From: Oskar Lindqvist ' }, { id: 9002, kind: 'attr:title', s: HIDDEN[2] }], hidden);
  assert.deepEqual([...new Set(planted.map((h) => `${h.ids[0]} ${h.where} ${h.original}`))].sort(), ['9001 text greeked', '9002 attr:title greeked']);
  // an interface word the mail client and the product share ("Inbox" was hidden): it fails, until it is listed in `keep`
  const word = [{ id: 1, kind: 'text', s: 'Inbox ' }];
  assert.equal(findHits(word, hidden).length, 1);
  try { setUiText(['Inbox']); assert.deepEqual(findHits(word, hidden), []); assert.equal(findHits([{ id: 1, kind: 'text', s: 'Ines Marlow ' }], hidden).length, 1); } finally { setUiText([]); }
});

// ---- what an agent may ask about a region

test('elementsIn lists the interface elements of the CLEAN tree inside a region: node, tag, role, text cut at 40', () => {
  const tree = page(); run(tree);
  const boxes = {}; let y = 0; walk(tree, (n) => { if (n.type === 2) { boxes[n.id] = { x: 10, y, w: 100, h: 20 }; y += 30; } });
  const all = elementsIn(tree, boxes, null);
  const of = (tag) => all.filter((e) => e.tag === tag).map(({ role, text }) => ({ role, text }));
  assert.deepEqual(of('h2'), [{ role: 'heading', text: 'Welcome back, Jordan Avery' }]);
  assert.deepEqual(of('button'), [{ role: 'button', text: 'Send' }]);
  assert.deepEqual(of('input'), [{ role: 'field', text: 'SecretKey-123456' }]);
  assert.deepEqual(of('select'), [{ role: 'field', text: 'Company 1' }]);
  assert.deepEqual(of('td'), [{ role: 'cell', text: 'Invoice 1' }, { role: 'cell', text: '$100.00' }, { role: 'cell', text: '09/01/2026' }]);
  assert.deepEqual(of('th').map((e) => e.role), ['heading', 'heading', 'heading']);
  assert.ok(all.every((e) => Number.isInteger(e.node) && e.text.length <= 40 && e.box));
  const h2 = byTag(tree, 'h2'), b = boxes[h2.id];
  assert.deepEqual(elementsIn(tree, boxes, { x: 0, y: b.y - 1, w: 200, h: 22 }).map((e) => e.node), [h2.id]);  // only what lies inside
  const long = el('html', {}, el('body', {}, el('p', {}, tx('x'.repeat(90))), el('script', {}, tx('var a')), comment('c')));
  assert.deepEqual(elementsIn(long, null, null).map((e) => [e.tag, e.role, e.text.length]), [['p', 'text', 40]]);
  const said = JSON.stringify(all);
  for (const v of Object.values(ORIGINALS)) assert.ok(!said.includes(v));
});

// ---- what is in the file but never on screen (security review)

test('nothing survives where links go, forms post, CSS says or unlisted attributes hold; structure and local assets are left alone', async () => {
  const { LINKS, links } = await import('../fixtures/scrub/leak-set.mjs');
  const tree = links();
  const { changed } = scrub(tree, ALL, makeLedger(), { user: findSignedInUser(tree) });
  const out = JSON.stringify(tree), flat = squash(out);
  for (const [name, v] of Object.entries({ ...ORIGINALS, ...LINKS })) { if (name === 'key' || name === 'id' || name === 'amount') continue; assert.ok(!out.includes(v), `${name} (${v.length} chars) survived whole`); assert.ok(!flat.includes(squash(v)), `${name} (${v.length} chars) survived squashed`); }
  for (const part of ['rita', 'quill', '0199', '4821', 'mailto', 'site.test', 'track.test', '99173', '7712']) assert.ok(!out.toLowerCase().includes(part), part + ' survived in part');
  const all = []; walk(tree, (n) => { if (n.type === 2) all.push(n); });
  const by = (tag) => all.filter((n) => n.tagName === tag);
  assert.deepEqual(by('a').map((a) => a.attributes.href ?? a.attributes['xlink:href']), ['#', '#', '#details', '#', '#']); // only a bare #id is kept
  assert.equal(by('area')[0].attributes.href, '#');
  assert.equal(by('form')[0].attributes.action, '#');
  assert.equal(by('button')[0].attributes.formaction, '#');
  for (const gone of ['ping', 'data-href', 'onclick', 'cite']) assert.ok(all.every((n) => !(gone in n.attributes)), gone + ' is still there');
  // structure is not scrubbed: geometry, classes, methods, local assets, the missing marker
  const path = by('path')[0].attributes;
  assert.deepEqual([path.d, path.transform, path['stroke-width'], path.class], ['M0 100 200 300 400 500 600 700', 'translate(12.3456789 0)', '1.2345678', 'apexcharts-line-with-a-very-long-class-name']);
  assert.equal(by('svg')[0].attributes.viewBox, '0 0 1920 1080');
  assert.deepEqual(by('img').map((i) => i.attributes.src), ['rostrum-asset:/0123456789abcdef0123456789abcdef.png', 'about:blank#missing']);
  assert.equal(by('form')[0].attributes.method, 'post');
  assert.equal(by('area')[0].attributes.coords, '0,0,10,10');
  assert.equal(by('div')[0].attributes['data-note'], 'plain note');
  // CSS: strings scrubbed, every url() local or the missing marker, the rest as it was
  const css = [textOf(by('style')[0]), by('link')[0].attributes._cssText, by('p')[0].attributes.style].join('\n');
  assert.ok(css.includes('url("rostrum-asset:/a1.png")') && css.includes('color: red') && css.includes('.who::after { content: "') && css.includes("content: 'Signed in as Jordan Avery'"));
  assert.equal((css.match(/about:blank#missing/g) ?? []).length, 3);
  assert.ok(!/https?:/.test(out));
  assert.ok(changed.some((c) => c.kind === 'link'));
  const said = JSON.stringify(changed);
  for (const v of [...Object.values(ORIGINALS), ...Object.values(LINKS)]) assert.ok(!said.includes(v));
});

// ---- security review of the scrub, Oct 10 2026 (fixtures/scrub/leak-set.mjs: REVIEW)

test('review: a value behind an asset-like prefix, in unquoted CSS, a CSS comment or an attribute selector, or beside a dot, does not survive', async () => {
  const { REVIEW, ASSETS_KEPT, review } = await import('../fixtures/scrub/leak-set.mjs');
  const tree = review();
  scrub(tree, ALL, makeLedger(), { user: findSignedInUser(tree) });
  const out = JSON.stringify(tree), flat = squash(out);
  for (const [name, v] of Object.entries(REVIEW)) { assert.ok(!out.includes(v), `${name} (${v.length} chars) survived whole`); assert.ok(!flat.includes(squash(v)), `${name} (${v.length} chars) survived squashed`); }
  for (const part of ['ines', 'marlow', 'harbor', '0142', '7730', '66201', '44177', '77319', '40281', '31864', 'rita', 'quill']) assert.ok(!out.toLowerCase().includes(part), part + ' survived in part');
  // real assets are left alone, exactly
  const all = []; walk(tree, (n) => { if (n.type === 2) all.push(n); });
  assert.deepEqual(all.filter((n) => n.attributes.class === 'kept').map((n) => n.attributes.src), ASSETS_KEPT);
  // whole-number measures in attributes nobody listed stay
  const span = all.find((n) => n.attributes['data-ratio']);
  assert.equal(span.attributes['x-c'], '0.123456789');                       // a plain fraction: not a leak, not touched
  assert.ok(!/\d{6}/.test(span.attributes['x-a'] + span.attributes['x-b']), 'a long whole number beside a decimal point or in a list stayed');
  assert.deepEqual([span.attributes['data-ratio'], span.attributes['data-pts']], ['12.3456789', '0.1234567, 10.7654321']);
  // CSS structure comes through untouched: names, numbers, colours, keywords; comments are gone
  const css = textOf(all.find((n) => n.tagName === 'style'));
  for (const kept of ['.a-very-long-class-name-that-must-stay-as-it-is#an-equally-long-id-that-must-stay-too {', '--a-very-long-custom-property-name-here: 1px', 'width: var(--a-very-long-custom-property-name-here)', 'z-index: 2147483647', 'margin: 0 0 0 100px',
    'box-shadow: 0 0 0 0.25rem rgba(13,110,253,.25)', 'color: #123456', 'transform: matrix(1 0 0 1 0 0)', 'animation: a-long-keyframes-name-of-letters-only 1s ease-in-out', 'font-family: system-ui,-apple-system,"Segoe UI",sans-serif',
    '@media (min-width: 1234567px) {', 'transition: background-color .15s ease-in-out,border-color .15s ease-in-out', 'url("rostrum-asset:/a1.png")', 'clip-path: url(#clip)', 'outline: 5px auto -webkit-focus-ring-color!important', 'animation: swal2-animate-success-line-tip 0.75s', '[class^="swal2-success-circular-line"] {', '--mail:', '--owner: Jordan Avery']) assert.ok(css.includes(kept), 'CSS structure changed: ' + kept);
  assert.ok(!css.includes('/*'));
  assert.equal((css.match(/about:blank#missing/g) ?? []).length, 2);
  const style = all.find((n) => n.tagName === 'p').attributes.style;
  assert.ok(style.includes('margin: 0 0 0 100px') && style.includes('z-index: 2147483647') && style.includes('--owner: Jordan Avery'));
});

test('review: what counts as an asset is the same for the scrub and the sweep, and narrow', async () => {
  const { isAssetValue, isCssUrlOk, isNumberList, cssValues } = await import('../film/src/css.ts');
  const { ASSETS_KEPT, REVIEW } = await import('../fixtures/scrub/leak-set.mjs');
  for (const v of ASSETS_KEPT) assert.ok(isAssetValue(v), v.slice(0, 20));
  for (const v of ['about:x@y.example', 'about:blank', 'ABOUT:BLANK#MISSING', 'data:tok_4mW9qLx2Zr81NcT5vHb7KdY6', 'data:,hello', 'DATA:image/png;base64,AAAA', 'blob:6620184457', 'Rostrum-Asset:/a.png', 'rostrum-asset:/x@y.example', 'rostrum-asset:/a/b.png', 'rostrum-asset:/a b'])
    assert.ok(!isAssetValue(v), v);
  assert.ok(isAssetValue('http://localhost:3000/public/clean/assets/a1.png', 'http://localhost:3000/public/clean/assets/')); // the sweep's local prefix
  assert.ok(!isAssetValue('rostrum-asset:/a1.png', 'http://localhost:3000/public/clean/assets/'));
  assert.ok(isCssUrlOk('#clip') && isCssUrlOk('./a1.woff2') && isCssUrlOk('http://www.w3.org/2000/svg') && !isCssUrlOk('#clip?x@y.example') && !isCssUrlOk('https://cdn.example/a.png'));
  assert.ok(isNumberList('12.3456789') && isNumberList(' 0.1234567, 10.7654321 ') && isNumberList('-3 4e5') && !isNumberList('v1.6620184457') && !isNumberList('4417720931.5 due') && !isNumberList(''));
  // the sweep reads declaration values in full (not just quoted strings), and attribute-selector strings; not names
  const read = cssValues(`.long-class-name { --mail: ${REVIEW.mail}; margin: 0 0 0 100px; content: "q" } [data-user="${REVIEW.record}"] { background: url(about:${REVIEW.token}) url("rostrum-asset:/a1.png") }`);
  for (const v of [REVIEW.mail, REVIEW.record, REVIEW.token, 'q']) assert.ok(read.includes(v), v.length + ' chars not read');
  for (const v of ['long-class-name', '--mail', 'margin', 'a1.png', '100px']) assert.ok(!read.includes(v), v + ' is not a value');
  // a stylesheet's ordinary declarations: what is not CSS structure; its custom properties and a style attribute: in full
  const sheet = cssValues(`.a { color: #495057; font-weight: bold; margin: 0 0 0 100px; width: ${REVIEW.account}px; animation: swal2-show 1s; order: ${REVIEW.token}; --acct: 0 0 ${REVIEW.account} } [type="${REVIEW.badge}"] { top: 0 } [data-x="${REVIEW.order}"] { top: 0 }`);
  for (const v of [REVIEW.token, REVIEW.account, REVIEW.order]) assert.ok(sheet.includes(v), v.length + ' chars not read');
  for (const v of ['495057', 'bold', '100px', 'swal2', REVIEW.badge]) assert.ok(!sheet.includes(v), v + ' is structure');
  const inline = cssValues(`--call: ${REVIEW.phone}; color: #495057; margin: 0 0 0 100px; font-weight: bold`, undefined, true);
  for (const v of [REVIEW.phone, '#495057', '0 0 0 100px', 'bold']) assert.ok(inline.includes(v), v + ' not read from a style attribute');
  assert.ok(!inline.includes('font-weight'));
});

test('blindAll within: only the company inside the text is replaced, taken from what a blind rule already replaced as company; it fails closed', () => {
  const screen = (subject) => { const name = el('b', {}, tx('Halvorsen  Freight')), head = el('h1', { class: 'subject', title: subject }, tx(subject)); return { name, head, tree: el('html', {}, el('body', {}, head, el('p', {}, name, tx(' has been submitted.')))) }; };
  const json = (node) => ({ blind: node == null ? [] : [{ screen: 0, node, as: 'company' }], blindAll: [{ selector: '.subject', as: 'company', within: true, label: 'Subject' }] });
  const ledger = makeLedger(), originals = [];
  // the body's company is replaced by node; the subject keeps its own words around it (any case, any spacing), tooltip included
  const a = screen('Webhook setup - halvorsen freight onboarding 12');
  const out = scrub(a.tree, rulesFor(json(a.name.id), 0), ledger, { originals });
  assert.equal(textOf(a.head), 'Webhook setup - Northwind Mutual onboarding 12');
  assert.equal(a.head.attributes.title, 'Webhook setup - Northwind Mutual onboarding 12');
  assert.deepEqual(out.blindedAll, [{ rule: 0, selector: '.subject', matched: 1, replaced: 1, within: 1 }]);
  assert.ok(!JSON.stringify(a.tree).toLowerCase().includes('halvorsen') && !JSON.stringify(out).toLowerCase().includes('halvorsen'));
  // a later screen of the same recording with no blind rule of its own: the company is known from the earlier one
  const b = screen('Re: Halvorsen Freight'); b.name.childNodes[0].textContent = 'Somebody';
  scrub(b.tree, rulesFor(json(null), 0), ledger, { originals });
  assert.equal(textOf(b.head), 'Re: Northwind Mutual');
  // the company is not in the text, or nothing was replaced as a company yet: all of it goes, as a series
  const c = screen('Lunch with Rita on Thursday?');
  const closed = scrub(c.tree, rulesFor(json(c.name.id), 0), ledger, { originals });
  assert.equal(textOf(c.head), 'Subject 1');
  assert.deepEqual(closed.blindedAll, [{ rule: 0, selector: '.subject', matched: 1, replaced: 1, within: 0 }]);
  const d = screen('Halvorsen Freight onboarding'), fresh = [];
  scrub(d.tree, rulesFor(json(null), 0), makeLedger(), { originals: fresh });
  assert.equal(textOf(d.head), 'Subject 1');
  assert.ok(fresh.some((o) => o.kind === 'series' && o.value === 'Halvorsen Freight onboarding'));
});
