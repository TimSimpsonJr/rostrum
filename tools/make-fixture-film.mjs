// A whole tutorial folder made of invented data, for proving the template without a recording:
//   node tools/make-fixture-film.mjs                                   writes fixtures/tutorials/fixture-film/ (screens, kit, brand, script, beats)
//   node tools/measure-boxes.mjs fixtures/tutorials/fixture-film       measures the nodes the beat file names
//   node --experimental-strip-types tools/make-fixture-film.mjs --timing   a silent narration timing (0.3 s a word, gaps from the pacing)
//   npm run still -- fixtures/tutorials/fixture-film Tutorial out.png --frame 300
// The folder is laid out like any tutorial (tools/paths.mjs): script.md at its root, the rest under film/.
// Two screens, as a recording would leave them: a dashboard taken with its user menu open, and a profile page taken
// with a dialog open. The film shuts both until their clicks. Every name and value here is made up.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { paths } from './paths.mjs';

// `--more`: a variant in fixtures/tutorials/fixture-film-more for what the regress fixture has no page for: a tip that
// shows under the pointer, a list to drag a row of (a third screen: the page after the drop), and a page taller than
// its window. The plain fixture is the regression baseline: without `--more` this writes what it always wrote.
const MORE = process.argv.includes('--more');
const ROOT = fileURLToPath(new URL('..', import.meta.url)), OUT = path.join(ROOT, MORE ? 'fixtures/tutorials/fixture-film-more' : 'fixtures/tutorials/fixture-film');
const VIEWPORT = { width: 1600, height: 900 };

const CSS = `
*{box-sizing:border-box}
body{margin:0;font:15px/1.5 "Segoe UI",system-ui,sans-serif;background:#f4f5f7;color:#1c2430}
header{position:relative;display:flex;align-items:center;gap:28px;height:64px;padding:0 28px;background:#fff;border-bottom:1px solid #d9dde3}
header strong{font-size:17px}
header a{color:#5b6676;text-decoration:none}
header .gap{flex:1}
.user{display:flex;align-items:center;gap:10px;height:64px;padding:0 14px;border:0;background:transparent;font:inherit;color:inherit;cursor:pointer}
.user:hover{background:#eef1f6}
.dot{width:32px;height:32px;border-radius:50%;background:#c9d4f5}
.menu{position:absolute;top:64px;right:28px;width:200px;margin:0;padding:8px 0;list-style:none;background:#fff;border:1px solid #d9dde3;border-radius:6px;box-shadow:0 10px 30px rgba(20,30,60,.18)}
.menu li{padding:7px 18px;cursor:pointer}
.menu li:hover{background:#eef2ff;color:#2456c9}
main{max-width:1100px;margin:28px auto;padding:0 28px}
h1{font-size:22px;margin:0 0 18px}
.tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:18px}
.tile{background:#fff;border:1px solid #d9dde3;border-radius:8px;padding:16px 18px}
.tile b{display:block;font-size:26px;font-weight:600}
.tile span{color:#5b6676}
table{width:100%;margin-top:22px;border-collapse:collapse;background:#fff;border:1px solid #d9dde3}
th,td{text-align:left;padding:10px 16px;border-top:1px solid #e6e9ee}
th{color:#5b6676;font-weight:500;border-top:0}
.card{width:640px;margin:36px auto 0;background:#fff;border:1px solid #d9dde3;border-radius:8px;padding:28px 36px}
.who{display:flex;align-items:center;gap:16px;margin-bottom:20px}
.who .dot{width:64px;height:64px}
.who h2{margin:0;font-size:20px}
.who p{margin:0;color:#5b6676}
.row{display:flex;align-items:center;gap:16px;padding:9px 0}
.row label{width:150px;color:#5b6676}
.row input{flex:0 0 280px;font:inherit;color:inherit;background:#f8f9fb;border:1px solid #d9dde3;border-radius:5px;padding:6px 12px}
.btn{flex:0 0 280px;font:inherit;color:#2456c9;background:#fff;border:1px solid #2456c9;border-radius:5px;padding:6px 12px;cursor:pointer}
.btn:hover{background:#2456c9;color:#fff}
.backdrop{position:fixed;inset:0;background:#000;opacity:.5}
.modal{position:fixed;inset:0;display:flex;align-items:center;justify-content:center}
.dialog{width:480px;background:#fff;border-radius:8px;box-shadow:0 20px 60px rgba(0,0,0,.3);padding:22px 26px}
.dialog h3{margin:0 0 14px;font-size:18px}
.dialog input{width:100%;font:15px ui-monospace,Consolas,monospace;text-align:center;color:inherit;background:#f8f9fb;border:1px solid #d9dde3;border-radius:5px;padding:8px 12px}
.dialog .foot{display:flex;justify-content:flex-end;margin-top:16px}
.done{font:inherit;color:#fff;background:#2e9d6a;border:0;border-radius:5px;padding:7px 22px}
`.trim().replace(/\n/g, '') + (!MORE ? '' : `
.tip{position:absolute;left:683px;top:482px;padding:6px 10px;background:#1c2430;color:#fff;border-radius:4px;font-size:13px;visibility:hidden}
.fav,.act{margin-top:18px;padding:18px 36px}
.act{margin-bottom:120px}
.fav h3,.act h3{margin:0 0 8px;font-size:16px}
.fav ul{margin:0;padding:0;list-style:none}
.fav li{display:flex;align-items:center;gap:12px;margin:0 -12px;padding:8px 12px;border-radius:5px;background:#fff;cursor:grab}
.fav li:hover{background:#eef1f6}
.grip{color:#9aa3b0;letter-spacing:2px}
.act table{margin-top:0}
`.trim().replace(/\n/g, ''));

/** A serialized page as rrweb leaves it: every node has an id; `ref` names the ones the beat file points at. */
function page(title, body) {
  let id = 0;
  const refs = {};
  const build = (n) => {
    if (typeof n === 'string') return { type: 3, textContent: n, id: ++id };
    const [tag, attrs = {}, ...kids] = n, { ref, ...attributes } = attrs, me = { type: 2, tagName: tag, attributes, childNodes: [], id: ++id };
    if (ref) refs[ref] = me.id;
    me.childNodes = kids.map(build);
    return me;
  };
  const doc = { type: 0, childNodes: [], compatMode: 'CSS1Compat', id: ++id };
  doc.childNodes.push({ type: 1, name: 'html', publicId: '', systemId: '', id: ++id });
  doc.childNodes.push(build(['html', { lang: 'en' }, ['head', {}, ['meta', { charset: 'utf-8' }], ['title', {}, title], ['style', { _cssText: CSS }, '']], ['body', {}, ...body]]));
  return { node: doc, refs };
}

const header = (...open) => ['header', {}, ['strong', {}, 'Fixture Admin'], ['a', { href: '#' }, 'Dashboard'], ['a', { href: '#' }, 'Payments'], ['a', { href: '#' }, 'Reports'], ['div', { class: 'gap' }],
  ['button', { class: 'user', ref: 'userMenu' }, ['span', { class: 'dot' }], ['span', {}, 'Dana Fixture']], ...open];
const tile = (n, label) => ['div', { class: 'tile' }, ['b', {}, n], ['span', {}, label]];
const tr = (...cells) => ['tr', {}, ...cells.map((c) => ['td', {}, c])];

const home = page('Dashboard - Fixture Admin', [
  header(['ul', { class: 'menu', ref: 'menu' }, ['li', { ref: 'profileItem' }, 'Profile'], ['li', {}, 'Settings'], ['li', {}, 'Sign out']]),
  ['main', {}, ['h1', {}, 'Dashboard'],
    ['div', { class: 'tiles' }, tile('128', 'Payments this month'), tile('$100.00', 'Average payment'), tile('12', 'Open batches'), tile('3', 'Users')],
    ['table', {}, ['tr', {}, ['th', {}, 'Payment'], ['th', {}, 'Payee'], ['th', {}, 'Amount'], ['th', {}, 'Status']],
      tr('Transaction 1', 'Payee 1', '$100.00', 'Paid'), tr('Transaction 2', 'Payee 2', '$200.00', 'Paid'), tr('Transaction 3', 'Payee 3', '$300.00', 'Pending'), tr('Transaction 4', 'Payee 4', '$400.00', 'Paid'), tr('Transaction 5', 'Payee 5', '$500.00', 'Pending')]],
]);

const field = (label, value, ref) => ['div', { class: 'row' }, ['label', {}, label], ['input', { type: 'text', value, readonly: '', ...(ref ? { ref } : {}) }]];
/** The profile page. The variant's (`favs`: its favourites, in order) has more under the card, and a tip last in the
 *  body, so no node of the plain page has another id in it. */
const profileOf = (favs) => page('Profile - Fixture Admin', [
  header(),
  ['main', {}, ['div', { class: 'card', ref: 'card' },
    ['div', { class: 'who' }, ['span', { class: 'dot' }], ['div', {}, ['h2', {}, 'Dana Fixture'], ['p', {}, 'Administrator']]],
    ['form', {}, field('First name', 'Dana', 'firstName'), field('Last name', 'Fixture'), field('Email', 'dana@fixture.test'), field('Username', 'dana.fixture', 'username'),
      ['div', { class: 'row' }, ['label', {}, 'API key'], ['button', { class: 'btn', type: 'button', ref: 'viewKey' }, 'View API Key']]]],
    ...(favs ? [
      ['div', { class: 'card fav', ref: 'favs' }, ['h3', {}, 'Favourites'], ['ul', {}, ...favs.map((name, i) => ['li', { ref: `row${'ABC'[i]}` }, ['span', { class: 'grip' }, '::'], name])]],
      ['div', { class: 'card act', ref: 'activity' }, ['h3', {}, 'Recent activity'], ['table', {}, ['tr', {}, ['th', {}, 'What'], ['th', {}, 'Where'], ['th', {}, 'When']],
        ...Array.from({ length: 12 }, (_, i) => tr(['Signed in', 'Viewed a report', 'Opened a batch', 'Changed a setting'][i % 4], `Device ${1 + (i % 3)}`, `${i + 1} days ago`))]],
    ] : [])],
  ['div', { class: 'backdrop' }],
  ['div', { class: 'modal' }, ['div', { class: 'dialog', ref: 'dialog' }, ['h3', {}, 'View API Key'], ['input', { type: 'text', value: 'UserAPIKey-123456', readonly: '', ref: 'keyField' }], ['div', { class: 'foot' }, ['button', { class: 'done', type: 'button', ref: 'done' }, 'Done']]]],
  ...(favs ? [['div', { class: 'tip', ref: 'tip' }, 'Shown once; copy it now']] : []),
]);
const profile = profileOf(MORE ? ['Reports', 'Payments', 'Batches'] : null), dropped = MORE ? profileOf(['Payments', 'Reports', 'Batches']) : null;

const LINES = [
  'Your user API key is on your Profile page.',
  'Open your user menu in the top right corner and choose Profile.',
  'You will see your name, email and username.',
  'At the bottom of the page, select View API Key.',
  'Your key appears in a window.',
  'Select the key, copy it, and paste it where you need it.',
  ...(MORE ? ['Select Done to close the window.', 'Hover over the button to see a note about the key.', 'Drag Reports below Payments to reorder your favourites.', 'Further down the page is your recent activity.'] : []),
  'And that is how you find your user API key.',
];

const P = paths(OUT);
/** `file`: a path from tools/paths.mjs, or one under a folder it names */
const write = (file, data) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data, null, 1) + '\n'); };

if (process.argv.includes('--timing')) {
  // a narration nobody recorded: every line a silent slot with word times, laid out exactly as a take would be
  const { movesFrom } = await import('../film/src/tutorial/beats.ts');
  const { LEAD, pacing } = await import('./pacing.mjs');
  const { layOut } = await import('./make-timing.mjs');
  const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
  const gaps = pacing(movesFrom(read(P.beats), read(P.boxes), fs.existsSync(P.layout) ? read(P.layout) : undefined));
  let at = 0;
  const spoken = LINES.map((text) => ({ text, words: text.toLowerCase().replace(/[^a-z0-9' ]/g, '').split(' ').map((w) => ({ w, start: (at += 0.3) - 0.3, end: at - 0.02 })) }));
  const sentences = layOut(spoken, { lead: LEAD, gaps }).map((s, i) => ({ i, text: s.text, file: null, clipAt: +s.start.toFixed(3), clipDur: +(s.end - s.start).toFixed(3), start: +s.start.toFixed(3), end: +s.end.toFixed(3), words: s.words }));
  write(P.timing, { fps: 30, dir: 'narration', take: 'none', sentences });
  console.log(`fixture-film: timing for ${sentences.length} lines, gaps ${gaps.join(', ')}, ${sentences.at(-1).end.toFixed(1)} s of narration`);
} else {
  write(P.manifest, { t0: 0, viewport: VIEWPORT, screens: [{ i: 0, t: 0, path: 'screen-0.json', href: 'https://admin.fixture.test/' }, { i: 1, t: 12, path: 'screen-1.json', href: 'https://admin.fixture.test/profile' }, ...(MORE ? [{ i: 2, t: 40, path: 'screen-2.json', href: 'https://admin.fixture.test/profile' }] : [])], clicks: [], mic: null });
  write(path.join(P.clean, 'screen-0.json'), { node: home.node, initialOffset: { left: 0, top: 0 } });
  write(path.join(P.clean, 'screen-1.json'), { node: profile.node, initialOffset: { left: 0, top: 0 } });
  if (MORE) write(path.join(P.clean, 'screen-2.json'), { node: dropped.node, initialOffset: { left: 0, top: 0 } });
  for (const f of fs.readdirSync(path.join(ROOT, 'film/public/kit'))) { fs.mkdirSync(P.kit, { recursive: true }); fs.copyFileSync(path.join(ROOT, 'film/public/kit', f), path.join(P.kit, f)); }
  write(path.join(P.brand, 'mark.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 120"><text x="300" y="86" text-anchor="middle" font-family="Segoe UI, system-ui, sans-serif" font-size="88" font-weight="700" fill="#1c2430">Fixture Co</text></svg>\n');
  write(path.join(P.brand, 'brand.json'), { name: 'Fixture Co', mark: { file: 'mark.svg', aspect: 0.2, width: 620, gradient: ['#2456c9', '#2e9d6a'] } });
  write(P.script, ['# Find your user API key: script (fixture)', '', '| # | Narration | On screen | Cursor |', '|---|---|---|---|', '| 0 | (no narration) | The title | |', ...LINES.map((l, i) => `| ${i + 1} | ${l} | | |`), ''].join('\n'));
  const n = (screen, refs, ...names) => Object.fromEntries(names.map((k) => [k, [screen, refs[k]]]));
  write(P.beats, {
    version: 1, title: 'Find your user API key', viewport: VIEWPORT,
    nodes: { ...n(0, home.refs, 'userMenu', 'menu', 'profileItem'), ...n(1, profile.refs, 'card', 'firstName', 'username', 'viewKey', 'dialog', 'keyField'), ...(MORE ? n(1, profile.refs, 'done', 'tip', 'favs', 'rowA', 'rowB', 'rowC', 'activity') : {}) },
    beats: [
      { line: 0, screen: 0, frame: { whole: true }, cursor: 'enter' },
      { line: 1, screen: 0, frame: { target: 'userMenu', with: 'corner' }, cursor: 'click', target: 'userMenu', cue: 'menu',
        then: [{ cursor: 'click', target: 'profileItem', cue: 'profile', change: { kind: 'opens', node: 'menu', after: 'userMenu' } }] },
      { line: 2, screen: 1, frame: { target: 'card' }, cursor: 'rest', target: 'firstName', cue: 'name', change: { kind: 'page' },
        then: [{ cursor: 'move', target: 'username', cue: 'username' }] },
      { line: 3, screen: 1, frame: { target: 'viewKey', with: 'row' }, cursor: 'click', target: 'viewKey', cue: 'api' },
      { line: 4, screen: 1, frame: { target: 'dialog' }, change: { kind: 'opens', node: 'dialog', after: 'viewKey' } },
      { line: 5, screen: 1, frame: { target: 'keyField' }, cursor: 'click', target: 'keyField', cue: 'select', change: { kind: 'selects', node: 'keyField' } },
      ...(MORE ? [
        { line: 6, frame: { target: 'dialog', back: true }, cursor: 'click', target: 'done', cue: 'done', then: [{ cue: 'to', change: { kind: 'close', node: 'dialog' } }] },
        { line: 7, frame: { targets: ['viewKey', 'tip'], back: true }, cursor: 'rest', target: 'viewKey', cue: 'button', change: { kind: 'hover', node: 'tip', after: 'viewKey' } },
        { line: 8, frame: { target: 'favs', back: true }, cursor: 'drag', target: 'rowA', to: 'rowB', cue: 'drag', release: 'to', change: { kind: 'becomes', screen: 2 } },
        { line: 9, frame: { whole: true, back: true }, cue: 'down', change: { kind: 'scrolls', to: 'activity' }, then: [{ cursor: 'rest', target: 'activity', cue: 'activity' }] },
      ] : []),
      { line: LINES.length - 1, cursor: 'leave' },
    ],
    chalk: [],
  });
  console.log(`fixture-film: ${OUT}`);
}
