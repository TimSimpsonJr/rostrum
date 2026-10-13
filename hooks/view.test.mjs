// What the panel shows: order, the one-button rule, wording, the progress rows, setup, the stopped block, tips.
import test from 'node:test';
import assert from 'node:assert/strict';
import { STALE_MS, viewOf, viewKey, headingOf, headingMarkdown, doneOf, stepLine, busyLine, recordedWhen, deleteQuestion } from './view.ts';

const T = (over = {}) => ({ id: 'rec-1760000000000', title: 'Reset a password', site: 'app.example.test', brand: null, state: 'recorded', busy: null, error: null, noMic: false, renders: [], progress: null, archived: false, length: null, ...over });
const RUNNING = { status: 'running', isOwned: true, reason: null, output: [] };
const snap = (tutorials, over = {}) => ({ tutorials, lastSeen: 999_000, brands: [], home: 'C:\\T', requests: [], ...over });
const input = (over = {}) => ({ helper: RUNNING, snapshot: snap([]), now: 1_000_000, waitingForScript: [], lastBrandBySite: {}, notice: null, link: null, hint: null, port: 4600, pending: [], mode: 'dark', openId: null, more: 'closed', question: null, deleted: [], setupOpen: false, installed: null, everConnected: true, tipIndex: 0, ...over });
const rows = (tutorials, over = {}) => viewOf(input({ snapshot: snap(tutorials), ...over })).tutorials;
const labels = (row) => row.buttons.map((b) => `${b.isPrimary ? '*' : ''}${b.label}`);

test('six steps: done count and the step line per state', () => {
  assert.deepEqual(['recorded', 'scripted', 'approved', 'voiced', 'built', 'reviewed', 'done'].map(doneOf), [1, 2, 3, 4, 5, 6, 6]);
  assert.equal(stepLine('recorded'), 'Script, step 2 of 6');
  assert.equal(stepLine('approved'), 'Narration, step 4 of 6');
  assert.equal(stepLine('voiced'), 'Build, step 5 of 6');
  assert.equal(stepLine('built'), 'Review, step 6 of 6');
  assert.equal(stepLine('reviewed'), 'Approved, all 6 steps done');
});

test('one button per state, the primary one, and what it says; the approved one has Open film alone (Archive is under More)', () => {
  const one = (over) => rows([T(over)])[0];
  assert.deepEqual(labels(one({ state: 'recorded' })), ['*Write script']);
  assert.deepEqual(labels(one({ state: 'scripted' })), ['*Show script']);
  assert.deepEqual(labels(one({ state: 'approved' })), ['*Add narration']);
  assert.deepEqual(labels(one({ state: 'voiced' })), ['*Build']);
  assert.deepEqual(labels(one({ state: 'built', renders: ['v3.mp4'], length: 54 })), ['*Open review']);
  assert.equal(one({ state: 'built', renders: ['v3.mp4'], length: 54 }).line, 'Version 3 is built, 0:54 long. Watch it, then send notes or approve it.');
  assert.deepEqual(labels(one({ state: 'reviewed', renders: ['v3.mp4'], length: 54 })), ['*Open film']);
  assert.equal(one({ state: 'reviewed', renders: ['v3.mp4'], length: 54 }).line, 'Version 3 is the finished film, 0:54 long. It is in your Rostrum folder.');
  assert.equal(one({ state: 'reviewed', renders: ['v3.mp4'], length: 125 }).line, 'Version 3 is the finished film, 2:05 long. It is in your Rostrum folder.');
  assert.equal(one({ state: 'built', renders: ['v3.mp4'], length: null }).line, 'Version 3 is built. Watch it, then send notes or approve it.');
  for (const state of ['recorded', 'scripted', 'approved', 'voiced', 'built']) assert.equal(one({ state }).buttons.length, 1, state);
  assert.equal(one({ state: 'recorded', noMic: true }).warn, 'No microphone audio in this recording. Record it again, or type notes for the script in chat.');
});

test('done and archived tutorials are not listed', () => {
  assert.deepEqual(rows([T({ state: 'done' }), T({ id: 'rec-1760000000001', archived: true }), T({ id: 'rec-1760000000002' })]).map((r) => r.id), ['rec-1760000000002']);
});

test('while a stage runs: no button; a long step shows the bar, a short one its words', () => {
  const bar = rows([T({ state: 'voiced', busy: 'render', progress: { label: 'Rendering', pct: 70, note: 'No private data found in the final check.' } })])[0];
  assert.deepEqual(bar.buttons, []);
  assert.deepEqual(bar.progress, { pct: 70, label: 'Rendering', note: 'No private data found in the final check.', isDone: false, isStale: false });
  const built = rows([T({ state: 'built', progress: { label: 'Built', pct: 100, note: null } })])[0];
  assert.equal(built.progress.isDone, true);
  assert.deepEqual(built.buttons, []);
  const short = rows([T({ state: 'voiced', busy: 'measure' })])[0];
  assert.deepEqual([short.buttons, short.progress, short.line], [[], null, 'Measuring the screens.']);
  assert.equal(busyLine({ busy: 'transcribe', state: 'approved' }), 'Checking the narration against the script.');
});

test('failures: Keep for a take that differs, Retry for a stage that can run again, a fix button for a missing transcriber; the warning is one sentence', () => {
  const differs = rows([T({ state: 'approved', error: { stage: 'time', message: '1 not spoken' } })])[0];
  assert.equal(differs.warn, 'The narration does not match the script. 1 line not spoken.');
  assert.equal(differs.line, 'Give a new take in chat, or press Keep to use this one.');
  assert.deepEqual(labels(differs), ['*Keep']);
  const two = rows([T({ state: 'approved', error: { stage: 'time', message: '2 lines differ from the script, 1 not spoken' } })])[0];
  assert.equal(two.warn, 'The narration does not match the script. 2 lines differ from the script, 1 not spoken.');
  const render = rows([T({ state: 'voiced', error: { stage: 'render', message: 'render failed (exit 1)' } })])[0];
  assert.deepEqual([render.warn, render.line, labels(render)], ['Rendering the film failed: render failed (exit 1).', 'Nothing was lost. Press Retry.', ['*Retry']]);
  const whisper = rows([T({ error: { stage: 'transcribe', message: 'whisper: program not found' } })])[0];
  assert.equal(whisper.warn, 'Rostrum could not find the transcriber on this computer.');
  assert.equal(whisper.line, 'Claude can set it up for you.');
  assert.deepEqual(labels(whisper), ['*Ask Claude to set it up']);
  const runtime = rows([T({ error: { stage: 'transcribe', message: "the transcriber needs Microsoft's Visual C++ runtime, which most PCs already have: Claude can help install it" } })])[0];
  assert.deepEqual([runtime.warn, runtime.line, labels(runtime)], ["The transcriber needs Microsoft's Visual C++ runtime, which most PCs already have but this one lacks.", 'Claude can help install it.', ['*Ask Claude to set it up']]);
  assert.equal(whisper.buttons[0].act, 'fix');
  const sweep = rows([T({ state: 'voiced', error: { stage: 'sweep', message: 'sweep failed: 2 places (out/sweep.txt names them by node)' } })])[0];
  assert.equal(sweep.warn, 'The final check for private data found 2 places that need a rule.');
  assert.equal(sweep.line, 'Nothing was rendered. Ask in chat for them to be fixed, or press Retry to check again.');
  assert.deepEqual(labels(sweep), ['*Retry']);
});

test('order: newest first, whatever is running or has failed; the open one at the top; nothing moves while a delete question is open', () => {
  const list = [
    T({ id: 'rec-1760000000001', state: 'voiced', busy: 'render', progress: { label: 'Rendering', pct: 70, note: null } }),
    T({ id: 'rec-1760000000002', state: 'scripted' }),
    T({ id: 'rec-1760000000003', state: 'approved', error: { stage: 'time', message: '1 not spoken' } }),
    T({ id: 'rec-1760000000004', state: 'built', renders: ['v1.mp4'] }),
  ];
  assert.deepEqual(rows(list).map((r) => r.id), ['rec-1760000000004', 'rec-1760000000003', 'rec-1760000000002', 'rec-1760000000001']);
  assert.deepEqual(rows(list).map((r) => r.isOpen), [true, false, false, false]);
  // the failed one has its warning where it stands
  assert.equal(rows(list)[1].warn, 'The narration does not match the script. 1 line not spoken.');
  const opened = rows(list, { openId: 'rec-1760000000002' });
  assert.deepEqual(opened.map((r) => r.id), ['rec-1760000000002', 'rec-1760000000004', 'rec-1760000000003', 'rec-1760000000001']);
  assert.deepEqual(opened.map((r) => r.isOpen), [true, false, false, false]);
  // an openId that is gone: the first opens
  assert.equal(rows(list, { openId: 'rec-9' })[0].isOpen, true);
  // a delete question on the open one: the order it was put in is kept, and a newcomer goes to the end
  const question = { id: 'rec-1760000000002', token: 't1', at: 0, text: 'Delete it?', name: 'x', order: ['rec-1760000000002', 'rec-1760000000004', 'rec-1760000000003', 'rec-1760000000001'] };
  const frozen = rows([T({ id: 'rec-1760000000009' }), ...list], { openId: 'rec-1760000000002', question });
  assert.deepEqual(frozen.map((r) => r.id), [...question.order, 'rec-1760000000009']);
  assert.deepEqual(frozen.map((r) => [r.more, r.ask]), [['delete', { text: 'Delete it?', token: 't1' }], ...Array(4).fill(['closed', null])]);
  // a question whose tutorial is not the open card is drawn nowhere, and freezes nothing
  const stray = rows([T({ id: 'rec-1760000000009' }), ...list], { openId: 'rec-1760000000004', question });
  assert.deepEqual([stray.map((r) => r.id)[1], stray.some((r) => r.ask || r.more === 'delete')], ['rec-1760000000009', false]);
  assert.equal(rows(list, { openId: 'rec-1760000000002', more: 'delete' })[0].more, 'closed'); // no question, no question drawn
});

test('the list stands still while work goes on: a step starting, its progress and its end move nothing and close nothing', () => {
  const ids = ['rec-1760000000003', 'rec-1760000000002', 'rec-1760000000001', 'user-api-key'];
  const at = (over) => rows(ids.map((id) => T({ id, state: 'recorded', ...(id === ids[0] ? over : {}) })), { openId: ids[0] });
  const still = at({});
  assert.deepEqual(still.map((r) => r.id), ids);
  const progress = (pct) => ({ label: 'Reading your gestures', pct, note: 'Looking at what you pointed at.' });
  for (const over of [{ busy: 'prepare' }, { busy: 'prepare', progress: progress(40) }, { busy: 'prepare', progress: progress(90) }, { progress: progress(100) }, { state: 'scripted' }, { state: 'voiced', busy: 'render', progress: progress(5) }]) {
    assert.deepEqual([at(over).map((r) => r.id), at(over).map((r) => r.isOpen)], [ids, [true, false, false, false]], JSON.stringify(over));
  }
  // the pressed card stays the open one and carries the bar where its button was
  const running = at({ busy: 'prepare', progress: progress(40) })[0];
  assert.deepEqual([running.isOpen, running.buttons, running.progress.pct, running.progress.label, running.progress.note, running.stepLine], [true, [], 40, 'Reading your gestures', 'Looking at what you pointed at.', 'Script, step 2 of 6']);
  // a step running further down the list stays where it is too, collapsed, with its bar
  const lower = rows(ids.map((id) => T({ id, state: 'recorded', ...(id === ids[2] ? { busy: 'prepare', progress: progress(40) } : {}) })), { openId: ids[0] });
  assert.deepEqual([lower.map((r) => r.id), lower[2].isOpen, lower[2].progress.pct], [ids, false, 40]);
  // a failure moves nothing either: the card has its warning where it stands
  const failed = rows(ids.map((id) => T({ id, ...(id === ids[2] ? { error: { stage: 'prepare', message: 'x' } } : {}) })), { openId: ids[0] });
  assert.deepEqual([failed.map((r) => r.id), failed[2].warn], [ids, 'Preparing the recording failed: x.']);
});

test('the heading of the open tutorial: one level-2 line, cut to its budget, nothing of the name read as markdown', () => {
  assert.equal(headingMarkdown('Reset a password'), '## Reset a password');
  assert.equal(headingMarkdown('See [docs](https://x.test/a)'), '## See \\[docs\\](https\\://x.test/a)');
  assert.equal(headingMarkdown('![shot](https://x.test/a.png)'), '## \\!\\[shot\\](https\\://x.test/a.png)');
  assert.equal(headingMarkdown('<b onclick=x>Bold</b> &amp;'), '## \\<b onclick=x\\>Bold\\</b\\> \\&amp;');
  assert.equal(headingMarkdown('*very* _much_ `so` ~~no~~'), '## \\*very\\* \\_much\\_ \\`so\\` \\~\\~no\\~\\~');
  assert.equal(headingMarkdown('a | b \\ c'), '## a \\| b \\\\ c');
  assert.equal(headingMarkdown('# Title #'), '## \\# Title \\#');
  assert.equal(headingMarkdown('> quoted'), '## \\> quoted');
  assert.equal(headingMarkdown('- item'), '## \\- item');
  assert.equal(headingMarkdown('1. first'), '## 1\\. first');
  assert.equal(headingMarkdown('  two\nlines\r\n here '), '## two lines here');
  const long = headingMarkdown('A walkthrough of the whole of the billing settings page');
  assert.equal(long, '## A walkthrough of the whole of the…');
  assert.equal([...long.slice(4)].length <= 34, true);
  assert.equal(headingMarkdown('abcdef', 4), '## abc…');
});

test('names: the title, else "<site> · <when>" with the time never cut; the delete question names the tutorial; the open row carries the brand select only with more than one brand; More states', () => {
  const when = `${new Date(1760000000000).toLocaleString('en-US', { month: 'short' })} ${new Date(1760000000000).getDate()}, ${String(new Date(1760000000000).getHours()).padStart(2, '0')}:${String(new Date(1760000000000).getMinutes()).padStart(2, '0')}`;
  assert.equal(recordedWhen('rec-1760000000000'), when);
  assert.equal(headingOf({ id: 'rec-1760000000000', title: null }), `Recording · ${when}`);
  assert.equal(headingOf({ id: 'rec-1760000000000', title: null, site: 'mail.example.com' }), `mail.example.com · ${when}`);
  assert.equal(headingOf({ id: 'rec-1760000000000', title: 'Reset a password', site: 'mail.example.com' }), 'Reset a password');
  // two recordings of one site differ by their time; a long site is cut, and the whole name fits the heading's line
  assert.notEqual(headingOf({ id: 'rec-1760000000000', title: null, site: 'a.test' }), headingOf({ id: 'rec-1760000540000', title: null, site: 'a.test' }));
  const long = headingOf({ id: 'rec-1760000000000', title: null, site: 'accounts.a-very-long-company-name.example.test' });
  assert.equal(long.endsWith(`… · ${when}`), true);
  assert.equal([...long].length <= 34, true);
  assert.equal(headingMarkdown(long), `## ${long.replace(':', '\\:')}`); // the heading cuts nothing more off it
  assert.equal(headingOf({ id: 'user-api-key', title: null, site: 'a.test' }), 'a.test · user-api-key');
  assert.equal(deleteQuestion({ id: 'rec-1760000000000', title: 'Reset a password', site: 'mail.example.com' }), `Delete "Reset a password", recorded ${when}, from mail.example.com? It goes to Rostrum's trash and can be brought back.`);
  assert.equal(deleteQuestion({ id: 'user-api-key', title: 'Keys', site: '' }), 'Delete "Keys"? It goes to Rostrum\'s trash and can be brought back.');
  const two = rows([T({ state: 'voiced' })], { snapshot: snap([T({ state: 'voiced' })], { brands: ['a', 'b'] }) });
  assert.deepEqual(two[0].brand, { options: ['a', 'b'], value: null });
  assert.equal(rows([T({ state: 'voiced' }), T({ id: 'rec-1760000000001', state: 'voiced' })], { snapshot: snap([T({ state: 'voiced' }), T({ id: 'rec-1760000000001', state: 'voiced' })], { brands: ['a', 'b'] }) })[1].brand, null);
  assert.equal(rows([T()])[0].more, 'closed');
  assert.equal(rows([T()], { more: 'rename' })[0].more, 'rename');
  assert.equal(rows([T(), T({ id: 'rec-1760000000001' })], { more: 'rename' })[1].more, 'closed'); // only the open row has the tidy actions
  // tutorials deleted in this session: a line each, while the helper answers
  assert.deepEqual(viewOf(input({ deleted: [{ id: 'a', name: 'Gone' }] })).deleted, [{ id: 'a', name: 'Gone' }]);
});

test('the status line, setup, the empty states and the stopped block', () => {
  let v = viewOf(input());
  assert.deepEqual(v.status, { line: 'Recorder connected', isConnected: true, isStopped: false, reason: null, fixPrompt: null });
  // connected: setup is done, nothing leads to it
  assert.equal(v.setup.showLink, false);
  assert.deepEqual(v.empty, { title: 'Nothing in progress', line: 'Record a walkthrough in Chrome and it appears here.', showSetupButton: false });
  assert.match(v.tip, /^[A-Z]/);
  v = viewOf(input({ snapshot: snap([], { lastSeen: null }), everConnected: false }));
  assert.deepEqual([v.status.line, v.status.isConnected], ['Recorder not connected', false]);
  assert.equal(v.empty.showSetupButton, true);
  assert.equal(v.tip, null);
  // never connected: the empty state's button is the way in; with a tutorial listed, or once it had connected, the link is
  assert.equal(v.setup.showLink, false);
  assert.equal(viewOf(input({ snapshot: snap([T()], { lastSeen: null }), everConnected: false })).setup.showLink, true);
  assert.equal(viewOf(input({ snapshot: snap([], { lastSeen: null }) })).setup.showLink, true);
  assert.equal(viewOf(input({ setupOpen: true })).setup.showLink, true);
  v = viewOf(input({ setupOpen: true, installed: { dir: 'C:\\T\\Recorder', hasVendor: true } }));
  assert.deepEqual(v.setup, { isOpen: true, showLink: true, dir: 'C:\\T\\Recorder', hasVendor: true, installed: true });
  assert.equal(viewOf(input()).setup.isOpen, false);
  assert.equal(viewOf(input()).setup.dir, 'C:\\T\\Recorder');
  v = viewOf(input({ helper: { status: 'stopped', isOwned: false, reason: 'Port 4600 is in use by another program.', output: [] }, snapshot: snap([T({ state: 'built' })]) }));
  assert.deepEqual(v.status, { line: 'Rostrum has stopped', isConnected: false, isStopped: true, reason: 'Port 4600 is in use by another program.', fixPrompt: null });
  assert.deepEqual(v.tutorials.map((r) => [r.name, r.line, r.buttons.length]), [['Reset a password', 'Waiting', 0]]);
  v = viewOf(input({ helper: { status: 'stopped', isOwned: false, reason: 'Rostrum needs Node 22 or newer, which is not on this computer.', output: [], needsNode: true }, snapshot: null }));
  assert.equal(v.status.fixPrompt, 'Rostrum: set up Node for the helper');
  assert.equal(viewOf(input({ helper: { status: 'starting', isOwned: true, reason: null, output: [] }, snapshot: null })).status.line, 'Rostrum is starting');
});

test('under a pressed Open button: for a few seconds the plain line that a page takes a moment; the address only with the warning that nothing opened', () => {
  const href = 'http://127.0.0.1:4600/x', two = snap([T({ id: 'rec-1760000000002', state: 'built' }), T({ id: 'rec-1760000000001', state: 'reviewed' })]);
  const lines = (over) => { const v = viewOf(input({ snapshot: two, ...over })); return [v.link, ...v.tutorials.map((r) => r.link)]; };
  const HINT = { line: 'The page can take a few moments to open. If nothing happens, press again in a few seconds.', isWarning: false, href: null };
  const WARNING = { line: 'The browser could not be opened. Open this address yourself:', isWarning: true, href };
  assert.deepEqual(lines({}), [null, null, null]);
  // an address on its way or sent well is not shown: nothing at the top of the pane, nothing in the row
  assert.deepEqual(lines({ link: { id: 'rec-1760000000002', href, state: 'opening' } }), [null, null, null]);
  assert.deepEqual(lines({ link: { id: 'rec-1760000000002', href, state: 'opened' } }), [null, null, null]);
  // the pressed tutorial's row says the page takes a moment, the open row's or a collapsed one's, whatever the address did
  assert.deepEqual(lines({ hint: 'rec-1760000000002' }), [null, HINT, null]);
  assert.deepEqual(lines({ hint: 'rec-1760000000001', link: { id: 'rec-1760000000001', href, state: 'opened' } }), [null, null, HINT]);
  // no opener worked: the warning and the address, in that row, in place of the plain line
  assert.deepEqual(lines({ hint: 'rec-1760000000001', link: { id: 'rec-1760000000001', href, state: 'failed' } }), [null, null, WARNING]);
  // the recorder setup's own (no tutorial) stays with the setup, and only when it failed
  assert.deepEqual(lines({ link: { id: null, href, state: 'opened' } }), [null, null, null]);
  assert.deepEqual(lines({ link: { id: null, href, state: 'failed' } }), [WARNING, null, null]);
});

test('a press being carried out: its button\'s label by what it does', () => {
  assert.deepEqual(viewOf(input()).pending, {});
  const keys = ['film:a', 'review:a', 'extensions:', 'script:a', 'build:a', 'keep:a', 'retry:a', 'restart:', 'archive:a', 'confirmDelete:a', 'install:', 'viewScript:a', 'narration:a', 'fix:a', 'fixHelper:'];
  assert.deepEqual(Object.values(viewOf(input({ pending: keys })).pending), ['Opening…', 'Opening…', 'Opening…', 'Starting…', 'Starting…', 'Starting…', 'Starting…', 'Starting…', 'Archiving…', 'Deleting…', 'Installing…', 'Asking Claude…', 'Asking Claude…', 'Asking Claude…', 'Asking Claude…']);
  assert.deepEqual(Object.keys(viewOf(input({ pending: keys })).pending), keys);
});

test('tips: a different one per opening, none while setup is open', () => {
  assert.notEqual(viewOf(input({ tipIndex: 0 })).tip, viewOf(input({ tipIndex: 1 })).tip);
  assert.equal(viewOf(input({ setupOpen: true })).tip, null);
});

test('the copy follows the rules: no exclamation marks, no "please", no "successfully", and nothing sends the user to a terminal', () => {
  const states = ['recorded', 'scripted', 'approved', 'voiced', 'built', 'reviewed'], stages = ['prepare', 'transcribe', 'time', 'measure', 'stills', 'sweep', 'render'];
  const tutorials = [
    ...states.map((state, i) => T({ id: `rec-176000000000${i}`, state, noMic: true, renders: ['v1.mp4'], length: 61 })),
    ...stages.map((busy, i) => T({ id: `rec-176000000001${i}`, state: 'voiced', busy })),
    ...stages.map((stage, i) => T({ id: `rec-176000000002${i}`, state: 'voiced', error: { stage, message: 'exit 1' } })),
    T({ id: 'rec-1760000000030', error: { stage: 'transcribe', message: 'whisper: program not found' } }),
    T({ id: 'rec-1760000000031', state: 'approved', error: { stage: 'time', message: '1 not spoken' } }),
  ];
  const views = [
    viewOf(input({ snapshot: snap(tutorials, { brands: ['a', 'b'] }) })),
    viewOf(input({ snapshot: snap([], { lastSeen: null }), everConnected: false })),
    viewOf(input({ setupOpen: true })),
    viewOf(input({ helper: { status: 'stopped', isOwned: false, reason: 'The helper ended with exit code 1 and one restart did not keep it up.', output: ['a'] }, snapshot: null })),
    viewOf(input({ helper: { status: 'starting', isOwned: false, reason: null, output: [] }, snapshot: null })),
    ...Array.from({ length: 14 }, (_, i) => viewOf(input({ tipIndex: i }))),
  ];
  const text = JSON.stringify(views);
  assert.doesNotMatch(text, /!/);
  assert.doesNotMatch(text, /please/i);
  assert.doesNotMatch(text, /successfully/i);
  for (const word of ['terminal', 'command', 'variable', 'ROSTRUM_', 'npm', 'node ', 'cmd', 'PowerShell']) assert.ok(!text.includes(word), word);
});

test('viewKey changes when the view does', () => {
  assert.notEqual(viewKey(viewOf(input())), viewKey(viewOf(input({ notice: 'x' }))));
});

test('Open review and Open film carry the review page\'s own address, for a surface that opens links itself; no other button does, nor an id unfit for a link', () => {
  const v = viewOf(input({ port: 4700, snapshot: snap([T({ id: 'rec-1760000000003', state: 'built' }), T({ id: 'rec-1760000000002', state: 'reviewed' }), T({ id: 'rec-1760000000001', state: 'voiced' })]) }));
  assert.deepEqual(v.tutorials.map((r) => r.buttons.map((b) => [b.act, b.href])), [
    [['review', 'http://127.0.0.1:4700/review/?tutorial=rec-1760000000003']],
    [['film', 'http://127.0.0.1:4700/review/?tutorial=rec-1760000000002']],
    [['build', null]],
  ]);
  // an id that is not plain letters, digits, dot, dash and underscore never stands in a link: the button stays
  for (const id of ['a b', 'a)b', 'a](x', 'a/b', 'a?b', 'é', '']) assert.deepEqual(viewOf(input({ snapshot: snap([T({ id, state: 'built' })]) })).tutorials[0].buttons.map((b) => [b.act, b.href]), [['review', null]], id);
  assert.equal(viewOf(input({ snapshot: snap([T({ id: 'user-api.key_2', state: 'built' })]) })).tutorials[0].buttons[0].href, 'http://127.0.0.1:4600/review/?tutorial=user-api.key_2');
});

test('new pieces being made in the chat: the card is a running build though no stage is busy; "Stop showing this" only after six hours of silence', () => {
  const NOW = 1_000_000 + STALE_MS;
  const making = (at, over = {}) => T({ state: 'voiced', busy: null, progress: { phase: 'making', label: 'Making new pieces', pct: 3, note: 'Building the browser bar', at }, ...over });
  const shown = (t, now = NOW) => viewOf(input({ now, snapshot: snap([t, T({ id: 'rec-1750000000000', state: 'voiced' })]) })).tutorials[0];
  let r = shown(making(NOW - 60_000));
  // the open card: the track at Build, the bar with its pill and the note; no sentence and no Build button
  assert.deepEqual([r.isOpen, r.done, r.stepLine, r.line, r.buttons, r.warn], [true, 4, 'Build, step 5 of 6', null, [], null]);
  assert.deepEqual(r.progress, { pct: 3, label: 'Making new pieces', note: 'Building the browser bar', isDone: false, isStale: false });
  // building again from a built film: the same
  r = shown(making(NOW - 60_000, { state: 'built', renders: ['v1.mp4'] }));
  assert.deepEqual([r.buttons, r.progress.label, r.stepLine], [[], 'Making new pieces', 'Review, step 6 of 6']);
  // six hours without a word: a way out is offered; a minute less, or a time that is not known: not yet
  assert.equal(shown(making(NOW - STALE_MS)).progress.isStale, true);
  assert.equal(shown(making(NOW - STALE_MS + 60_000)).progress.isStale, false);
  assert.equal(shown(making(null)).progress.isStale, false);
  // only this phase: the helper's own stages end by themselves
  assert.equal(shown(T({ state: 'voiced', busy: 'render', progress: { phase: 'render', label: 'Rendering', pct: 80, note: null, at: NOW - 2 * STALE_MS } })).progress.isStale, false);
  // the other tutorial is untouched: its Build button stands
  assert.deepEqual(viewOf(input({ now: NOW, snapshot: snap([making(NOW), T({ id: 'rec-1750000000000', state: 'voiced' })]) })).tutorials[1].buttons.map((b) => b.act), ['build']);
});

const STEPS = [
  { name: 'deps', done: false, what: 'the video engine (npm packages, about 650 MB on disk)' },
  { name: 'vendor', done: false, what: "the recorder's files, made on this computer from those packages" },
  { name: 'browser', done: false, what: 'a browser for rendering films (Chrome Headless Shell, about 270 MB on disk, fetched by Remotion)' },
];
const setupOf = (over = {}) => ({ needed: true, running: false, data: 'C:\\Users\\ada\\AppData\\Local\\Rostrum', transcriber: 'python', steps: STEPS, last: null, ...over });

test('first-run setup: before the press the card names what is fetched and where it goes; the rows wait; the recorder and the tips come after', () => {
  const v = viewOf(input({ snapshot: snap([T({ state: 'voiced' })], { setup: setupOf(), lastSeen: null }), everConnected: false }));
  assert.deepEqual(v.install, {
    title: 'Set up Rostrum',
    lines: ['Rostrum needs a few things it does not ship with. One press fetches them:', '- The video engine (npm packages, about 650 MB on disk)', "- The recorder's files, made on this computer from those packages", '- A browser for rendering films (Chrome Headless Shell, about 270 MB on disk, fetched by Remotion)'],
    where: "They go into this plugin's own folder. Nothing is sent anywhere.",
    button: 'Download and set up', progress: null, warn: null,
    transcriber: { line: 'To turn speech into text Rostrum uses the Whisper that is already on this computer.', isMissing: false },
  });
  assert.deepEqual(v.tutorials.map((r) => [r.line, r.buttons.length]), [['Waiting for setup', 0]]);
  assert.deepEqual([v.setup, v.empty, v.tip], [null, null, null]);
  assert.equal(viewOf(input({ snapshot: snap([], { setup: setupOf() }) })).empty, null);
  // only what is missing is named; a transcriber that is fetched goes to the data folder, and that is said
  const some = viewOf(input({ snapshot: snap([], { setup: setupOf({ transcriber: 'offered', steps: [{ ...STEPS[0], done: true }, { ...STEPS[1], done: true }, STEPS[2], { name: 'transcriber', done: false, what: "the transcriber's English model (488 MB, from Hugging Face)" }] }) }) })).install;
  assert.deepEqual(some.lines.slice(1), ['- A browser for rendering films (Chrome Headless Shell, about 270 MB on disk, fetched by Remotion)', "- The transcriber's English model (488 MB, from Hugging Face)"]);
  assert.equal(some.where, "They go into this plugin's own folder and C:\\Users\\ada\\AppData\\Local\\Rostrum. Nothing is sent anywhere.");
  assert.equal(some.transcriber, null);
});

test('first-run setup: a run shows its bar and no button; a failed step says what failed and offers Try again; done, the card goes', () => {
  const running = viewOf(input({ snapshot: snap([], { setup: setupOf({ running: true, last: { state: 'running', label: 'Installing the video engine', pct: 12, note: null } }) }) })).install;
  assert.deepEqual([running.button, running.warn, running.progress], [null, null, { pct: 12, label: 'Installing the video engine', note: null, isDone: false, isStale: false }]);
  const failed = viewOf(input({ snapshot: snap([], { setup: setupOf({ steps: [{ ...STEPS[0], done: true }, { ...STEPS[1], done: true }, STEPS[2]], last: { state: 'failed', label: 'Fetching the browser that renders films', pct: 70, note: 'Fetching the browser that renders films did not finish: the browser download stopped with code 1: check the connection.' } }) }) })).install;
  assert.deepEqual([failed.button, failed.progress], ['Try again', null]);
  assert.equal(failed.warn, 'Fetching the browser that renders films did not finish: the browser download stopped with code 1: check the connection. Nothing is broken: Try again carries on from there.');
  const done = (transcriber) => viewOf(input({ snapshot: snap([T()], { setup: setupOf({ needed: false, transcriber, steps: STEPS.map((s) => ({ ...s, done: true })), last: { state: 'done', label: 'Set up', pct: 100, note: null } }) }) }));
  assert.equal(done('python').install, null);
  assert.equal(done('own').install, null);
  assert.equal(done('python').tutorials[0].buttons.length, 1);
  // nothing to fetch, and no transcriber at all: said, with Claude offered; nothing waits for it
  const none = done('none');
  assert.deepEqual(none.install, { title: 'Rostrum has no transcriber', lines: [], where: null, button: null, progress: null, warn: null, transcriber: { line: "There is no transcriber on this computer yet, and Rostrum's own transcriber is not available for this computer yet. Claude can set one up for you.", isMissing: true } });
  // Rostrum's own transcriber is in place and cannot start (a PC without the Visual C++ runtime): a note with Claude offered, not a thing the press fetches
  const RUNTIME = { name: 'transcriber', done: false, what: "the transcriber's English model, once Microsoft's Visual C++ runtime is installed (the transcriber cannot start without it: Claude can help)" };
  const stuck = viewOf(input({ snapshot: snap([T()], { setup: setupOf({ transcriber: 'offered', steps: [...STEPS.map((s) => ({ ...s, done: true })), RUNTIME] }) }) }));
  assert.deepEqual([stuck.install.title, stuck.install.lines, stuck.install.where, stuck.install.button], ['Set up Rostrum', [], null, 'Download and set up']);
  assert.deepEqual(stuck.install.transcriber, { line: "Rostrum's transcriber is in place but cannot start without Microsoft's Visual C++ runtime, which most PCs already have. Claude can help install it; its English model is fetched after that.", isMissing: true });
  assert.equal(stuck.tutorials[0].buttons.length, 1, 'nothing waits for it');
  const both = viewOf(input({ snapshot: snap([], { setup: setupOf({ transcriber: 'offered', steps: [...STEPS, RUNTIME] }) }) })).install;
  assert.equal(both.lines.length, 4, 'the three things the press fetches, and not the runtime line');
  assert.ok(both.where.endsWith("plugin's own folder. Nothing is sent anywhere.") && both.transcriber.isMissing);
  assert.equal(none.tutorials[0].buttons.length, 1);
  // a helper that tells no setup (an older one), or one that is not answering: no card
  assert.equal(viewOf(input()).install, null);
  assert.equal(viewOf(input({ helper: { status: 'stopped', isOwned: false, reason: null, output: [] }, snapshot: snap([], { setup: setupOf() }) })).install, null);
});
