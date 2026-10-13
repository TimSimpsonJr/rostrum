// The leak test set: pages in rrweb's serialized form, holding INVENTED sensitive values in every place a real page
// hides them (split over elements, in tooltips and attributes, in a heading, in SVG text, in hidden inputs, in a
// select with many options, in a comment). tools/scrub.test.mjs scrubs them and looks for anything that survived.
// Nothing here is real: every value was made up for this file.

let next = 1;
/** An element node; ids are given in the order the nodes are made (children first, as the calls nest). */
export const el = (tagName, attributes = {}, ...childNodes) => ({ type: 2, tagName, attributes: { ...attributes }, childNodes, id: next++ });
/** A text node. */
export const tx = (textContent) => ({ type: 3, textContent, id: next++ });
export const comment = (textContent) => ({ type: 5, textContent, id: next++ });

export const ORIGINALS = { email: 'rita.quill@acme-corp.example', phone: '555-0199-4821', key: 'sk_test_51Hqz9XbT2LmQ0pRrS7uVwX', id: '884120', amount: '$4,312.77', name: 'Rita Quill' };
/** More of the same, for the places the first six do not reach. */
export const MORE = { company: 'Acme Corp', hidden: 'csrf-9f8e7d6c5b4a39281706', password: 'hunter2-Zebra!', note: 'Wire ref 7741093355', payee: 'Oskar Lindqvist', second: 'Halvorsen Freight' };

/** The page of the plan (Task 4), with every original somewhere a rule has to reach. */
export const page = () => el('html', {}, el('body', {},
  el('header', { class: 'topbar' }, el('span', { id: 'user-name' }, tx(ORIGINALS.name)), el('img', { class: 'avatar', alt: ORIGINALS.name, src: 'x.png' })),
  el('h2', {}, tx(`Welcome back, ${ORIGINALS.name}`)),                                    // name in a heading
  el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, tx('Invoice ID')), el('th', {}, tx('Amount')), el('th', {}, tx('Date')))),
    el('tbody', {}, el('tr', {}, el('td', {}, tx(ORIGINALS.id)), el('td', {}, el('span', {}, tx('$')), tx('4,312.77')), el('td', {}, tx('09/01/2026'))))),  // split sum; a date stays
  el('p', {}, tx('Call '), el('b', {}, tx('555-0199-')), tx('4821 today')),                // phone split across elements
  el('button', { title: `Email ${ORIGINALS.email}` }, tx('Send')),                         // value in a tooltip
  el('input', { id: 'k', value: ORIGINALS.key, type: 'text' }), el('label', { for: 'k' }, tx('Secret key')),
  el('div', { 'data-customer': ORIGINALS.email }, tx('Customer')),                          // data attribute
  el('svg', {}, el('text', {}, tx(ORIGINALS.amount))),                                      // SVG text
  el('select', { id: 's' }, el('option', { selected: true }, tx('Acme Corp'))), el('label', { for: 's' }, tx('Company')),
));

/** The harder page: the places the plan's page does not cover. */
export const more = () => el('html', {}, el('head', {}, el('title', {}, tx(`Inbox for ${ORIGINALS.email}`)), el('meta', { name: 'csrf', content: MORE.hidden })), el('body', {},
  el('nav', { class: 'navbar' }, el('div', { class: 'user-menu' }, el('span', {}, tx(ORIGINALS.name)))),
  comment(` rendered for ${ORIGINALS.email} `),                                             // a comment in the markup
  el('form', {},
    el('input', { type: 'hidden', name: 'token', value: MORE.hidden }),                      // hidden input
    el('label', {}, tx('Password'), el('input', { type: 'password', value: MORE.password })), // wrapped by its label
    el('textarea', { id: 'memo', value: MORE.note, 'aria-label': 'Memo' }, tx(MORE.note)),
    el('input', { type: 'search', placeholder: `Search ${ORIGINALS.email}`, 'aria-label': `Search for ${ORIGINALS.name}` }),
    el('input', { type: 'checkbox', value: 'on' }), el('input', { type: 'submit', value: 'Save changes' }),
    el('select', { id: 'payee', value: '***', title: MORE.payee },                           // many options, each one data
      el('option', { value: '11' }, tx(MORE.payee)), el('option', { value: '12' }, tx(MORE.second)), el('option', { value: '13' }, tx(MORE.company)),
      el('optgroup', { label: 'Archived' }, el('option', { value: '14' }, tx('Brightwater Supply')))),
    el('label', { for: 'payee' }, tx('Payee'))),
  el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, tx('Payee')), el('th', {}, tx('Payor Email')), el('th', {}, tx('Total')), el('th', {}, tx('Open')), el('th', {}, tx('Share')), el('th', {}, tx('Actions')))),
    el('tbody', {},
      el('tr', {}, el('th', {}, tx(MORE.payee)), el('td', {}, tx(ORIGINALS.email)), el('td', {}, tx('$'), el('b', {}, tx('4,312')), el('sup', {}, tx('.77'))), el('td', {}, tx('3')), el('td', {}, tx('12.5%')), el('td', {}, el('button', {}, tx('View Details')))),
      el('tr', {}, el('th', {}, tx(MORE.second)), el('td', {}, tx('second@acme-corp.example')), el('td', {}, tx('$0.00')), el('td', {}, tx('0')), el('td', {}, tx('0%')), el('td', {}, el('button', {}, tx('View Details')))))),
  el('p', {}, tx('Paid '), el('span', {}, tx('$')), el('strong', {}, tx('4,312.77')), tx(' to account '), el('code', {}, tx('8841')), el('code', {}, tx('2077'))), // a sum and a number, each split
  el('a', { href: '#', title: ORIGINALS.phone, 'aria-label': `Call ${ORIGINALS.phone}` }, tx('Call')),
  el('svg', {}, el('text', {}, el('tspan', {}, tx('$4,312')), el('tspan', {}, tx('.77'))), el('title', {}, tx(ORIGINALS.id))),
  el('div', { style: 'display:none' }, tx(`key ${ORIGINALS.key}`)),                          // not shown, still in the file
));

/** The places that are in the file but never on screen: where links go, where forms post, CSS, attributes nobody listed. */
export const LINKS = { token: 'tok_9aK2mQ7xPz41LrT8vBn6WcY3', record: '9917345520', tag: 'cust-77120934' };
export const links = () => el('html', {}, el('head', {}, el('style', {}, Object.assign(tx(`.who::after { content: "${ORIGINALS.email}" } .bg { background: url("https://cdn.site.test/u/${LINKS.record}.png") } .ok { background: url("rostrum-asset:/a1.png") }`), { isStyle: true })),
  el('link', { _cssText: `.tip::before { content: 'Signed in as ${ORIGINALS.name}' } @import "https://site.test/u/${LINKS.record}.css";` })), el('body', {},
  el('header', {}, el('span', { class: 'user-name' }, tx(ORIGINALS.name))),
  el('a', { href: `mailto:${ORIGINALS.email}`, ping: `https://track.test/p?u=${ORIGINALS.email}` }, tx('Write to us')),                 // a mailto: link
  el('a', { href: `https://site.test/customers/view?email=${ORIGINALS.email}&id=${LINKS.record}`, 'data-href': `/c/${LINKS.record}` }, tx('Open')), // an email and a long id in the query
  el('a', { href: '#details' }, tx('Details')), el('a', { href: `#row-${LINKS.record}?x=1` }, tx('Row')),
  el('map', {}, el('area', { href: `/customers/${LINKS.record}`, coords: '0,0,10,10' })),
  el('form', { action: `/api/save?token=${LINKS.token}`, method: 'post' }, el('button', { formaction: `/api/other?token=${LINKS.token}`, onclick: `go('${ORIGINALS.email}')` }, tx('Save'))),
  el('blockquote', { cite: `https://site.test/u/${ORIGINALS.email}` }, tx('Quoted')),
  el('div', { 'data-owner': ORIGINALS.name, 'data-note': 'plain note' }, tx('Owner')),                                                  // a data-* attribute holding a name
  el('p', { style: `--tip: "${ORIGINALS.phone}"; background: url(https://site.test/bg/${LINKS.record}.png); color: red` }, tx('Styled')), // a value in a style
  el('span', { 'x-customer': ORIGINALS.email, 'ng-reflect-model': LINKS.token, tooltip: `Ref ${LINKS.record}`, itemprop: ORIGINALS.name }, tx('Custom')), // attributes nobody listed
  el('svg', { viewBox: '0 0 1920 1080', width: '1920', height: '1080' }, el('path', { d: 'M0 100 200 300 400 500 600 700', transform: 'translate(12.3456789 0)', 'stroke-width': '1.2345678', class: 'apexcharts-line-with-a-very-long-class-name' }), el('a', { 'xlink:href': `/u/${LINKS.record}` }, el('text', {}, tx('Chart')))),
  el('img', { src: 'rostrum-asset:/0123456789abcdef0123456789abcdef.png', class: 'logo' }), el('img', { src: 'about:blank#missing' }),
));

/** Security review of the scrub (Oct 10 2026): the four places it found a value could still hide.
 *  1. behind a prefix that only LOOKS like an asset (about:, data:, blob:, the local prefix in another case)
 *  2. in CSS outside quoted strings: unquoted declaration values, comments, attribute selectors
 *  3. a long number beside a dot, in an attribute that is not a measure
 *  4. in a page address's path (tools/prepare.test.mjs: HREFS) */
export const REVIEW = { token: 'tok_4mW9qLx2Zr81NcT5vHb7KdY6', record: '6620184457', account: '4417720931', mail: 'ines.marlow@harbor-freight.example', phone: '555-0142-7730', owner: 'Rita Quill',
  badge: '7731905', order: '402817', ledger: '318640275' }; // 6 and 7 digits: too short to read as a phone number, so only the long-number rule sees them
export const ASSETS_KEPT = ['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'blob:https://app.example/3f2a9c1e-7b64-4d0a-9e1f-5c8d2b7a6e40', 'about:blank#missing', 'rostrum-asset:/0123456789abcdef.png'];
export const review = () => el('html', {}, el('head', {},
  el('style', {}, Object.assign(tx([
    `/* rendered for ${REVIEW.mail} */`,                                                              // 2. a comment
    `[data-user="${REVIEW.mail}"] { color: red }`, `[data-record=${REVIEW.record}] { color: blue }`,  // 2. attribute selectors, quoted and not
    `.who { --mail: ${REVIEW.mail}; --call: ${REVIEW.phone}; --acct: ${REVIEW.account}; --token: ${REVIEW.token}; --owner: ${REVIEW.owner} }`, // 2. unquoted values
    `.bg { background: url(about:${REVIEW.mail}); mask: url("data:${REVIEW.token}") }`,               // 1. in CSS
    // structure that must come through untouched (this is where rendering breaks):
    `.a-very-long-class-name-that-must-stay-as-it-is#an-equally-long-id-that-must-stay-too { --a-very-long-custom-property-name-here: 1px; width: var(--a-very-long-custom-property-name-here); z-index: 2147483647; margin: 0 0 0 100px; box-shadow: 0 0 0 0.25rem rgba(13,110,253,.25); color: #123456; transform: matrix(1 0 0 1 0 0); animation: a-long-keyframes-name-of-letters-only 1s ease-in-out; font-family: system-ui,-apple-system,"Segoe UI",sans-serif }`,
    `@media (min-width: 1234567px) { .x { transition: background-color .15s ease-in-out,border-color .15s ease-in-out } }`,
    `.ok { background: url("rostrum-asset:/a1.png"); clip-path: url(#clip) }`,
    // three that a first version of the fix rewrote in a real stylesheet: a keyword run into !important, a keyframes
    // name with a digit in it, and a selector on class (a name, as the class attribute is)
    `.ring { outline: 5px auto -webkit-focus-ring-color!important; animation: swal2-animate-success-line-tip 0.75s }`, `[class^="swal2-success-circular-line"] { top: 0 }`,
  ].join('\n')), { isStyle: true }))), el('body', {},
  el('header', {}, el('span', { class: 'user-name' }, tx(REVIEW.owner))),
  el('img', { src: `about:${REVIEW.mail}` }), el('span', { title: `data:${REVIEW.token}` }, tx('Tip')),               // 1.
  el('video', { poster: `blob:${REVIEW.record}` }), el('img', { alt: `Rostrum-Asset:/${REVIEW.mail}`, src: `rostrum-asset:/${REVIEW.mail}` }), // 1.
  ...ASSETS_KEPT.map((src) => el('img', { src, class: 'kept' })),
  el('p', { style: `--mail: ${REVIEW.mail}; --acct: ${REVIEW.account}; --call: ${REVIEW.phone}; --owner: ${REVIEW.owner}; margin: 0 0 0 100px; z-index: 2147483647` }, tx('Styled')), // 2. a style attribute
  el('span', { 'x-ref': `v1.${REVIEW.badge}`, tooltip: `${REVIEW.order}.5 due`, 'x-a': `${REVIEW.ledger}.0`, 'x-b': `${REVIEW.ledger}, 2.5`, 'x-c': '0.123456789', 'data-ratio': '12.3456789', 'data-pts': '0.1234567, 10.7654321' }, tx('Ref')), // 3.
));

/** 4. A page address whose path holds values, some of them percent-encoded: [recorded, what the clean copy may keep]. */
export const HREFS = [
  [`https://site.test/users/rita%2Equill%40acme-corp.example/Orders/ord-77120934/Rita-Quill/index.html?x=1#y`, 'https://site.test/users/-/Orders/-/-/-'],
  [`https://site.test/a/%E0%A4%A/b/${'x'.repeat(31)}/reports_monthly/`, 'https://site.test/a/-/b/-/reports_monthly/'],
];
