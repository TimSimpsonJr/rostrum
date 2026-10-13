// The supervisor against a fake engine and a fake helper: adopt or start, one restart, the poll, and what each press calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import { HINT_MS, OPEN_FLOOR_MS, createSupervisor, failureNotice } from './supervise.ts';
import { NODE_PIN } from './node.ts';

/** What a pressed Open button says under it for a few seconds. */
const HINT = { line: 'The page can take a few moments to open. If nothing happens, press again in a few seconds.', isWarning: false, href: null };

const BASE = 'http://127.0.0.1:4600';
const T = (over = {}) => ({ id: 'rec-1760000000000', title: null, site: 'app.example.test', brand: null, state: 'recorded', busy: null, error: null, flags: { noMic: false }, renders: [], progress: null, archived: false, length: null, ...over });
const settle = () => new Promise((r) => setTimeout(r, 5));

/** A fake helper (up or down, with tutorials) behind a fake engine that records every call. */
function world({ up = true, tutorials = [], brands = [], prepared = true, env = { os: 'Windows_NT', userProfile: 'C:\\Users\\ada' }, store = {}, spawnFails = false } = {}) {
  const w = { up, tutorials, brands, prepared, calls: [], spawned: [], ran: [], submitted: [], views: [], store: { ...store }, children: [], refuse: {}, requests: [], lastSeen: null, theme: 'dark', copied: [], slept: [], floor: undefined, hold: new Promise(() => {}), now: 1_000_000, trash: [], probed: [], nodes: { node: 'v22.20.0', 'C:\\n\\node.exe': 'v22.20.0' } };
  const reply = (status, body) => ({ status, ok: status >= 200 && status < 300, text: typeof body === 'string' ? body : JSON.stringify(body) });
  const find = (id) => w.tutorials.find((t) => t.id === id);
  w.host = {
    root: 'C:\\plugin',
    env,
    fetch: async (url, init = {}) => {
      const method = init.method ?? 'GET', path = url.slice(BASE.length), body = init.body ? JSON.parse(init.body) : undefined;
      assert.ok(url.startsWith(BASE + '/'), url);
      assert.equal(Object.keys(init.headers ?? {}).some((h) => h.toLowerCase() === 'origin'), false, 'the panel never sends an Origin');
      w.calls.push(body ? `${method} ${path} ${init.body}` : `${method} ${path}`);
      if (!w.up) throw new Error('ECONNREFUSED');
      if (w.refuse[`${method} ${path}`]) return reply(...w.refuse[`${method} ${path}`]);
      if (path === '/health') return reply(200, 'ok');
      if (path === '/tutorials') return reply(200, { tutorials: w.tutorials, recorder: { lastSeen: w.lastSeen ?? null }, brands: w.brands, home: 'C:\\T', requests: w.requests, setup: w.setup });
      if (path === '/setup') { // as the helper: one run at a time
        if (w.setup.running) return reply(409, { error: 'setup is running' });
        w.setup = { ...w.setup, running: true, last: { state: 'running', label: 'Installing the video engine', pct: 0, note: null } };
        return reply(202, { ok: true, running: true });
      }
      if (path === '/recorder/install') return reply(200, { ok: true, dir: 'C:\\T\\Recorder', hasVendor: true });
      const done = /^\/requests\/(\d+)\/done$/.exec(path);
      if (done) { w.requests = w.requests.filter((r) => r.n !== Number(done[1])); return reply(200, { ok: true }); }
      const m = /^\/tutorials\/([\w-]+)(?:\/([a-z]+))?(\?.*)?$/.exec(path), t = m && find(m[1]);
      if (m?.[2] === 'restore') { // as the helper: the copy in the trash back, unless one of that id is there
        const back = w.trash.find((one) => one.id === m[1]);
        if (t) return reply(409, { error: 'a tutorial with this id is there already' });
        if (!back) return reply(404, { error: 'nothing in the trash under this id' });
        w.trash = w.trash.filter((one) => one !== back); w.tutorials.push(back);
        return reply(200, back);
      }
      if (!t) return reply(404, { error: 'no such tutorial' });
      if (!m[2] && method === 'DELETE') { w.tutorials = w.tutorials.filter((one) => one !== t); w.trash.push(t); return reply(200, { ok: true }); }
      if (!m[2]) return reply(200, { ...t, dir: 'C:\\T\\' + t.id });
      if (m[2] === 'elements') return w.prepared ? reply(404, { error: 'no such screen' }) : reply(409, { error: 'not prepared yet' });
      if (m[2] === 'progress') { if (body?.clear === true) t.progress = null; return reply(200, t); }
      if (m[2] === 'state') {
        if (body.event === 'retry') t.error = null;
        if (body.brand !== undefined) t.brand = body.brand;
        if (body.title !== undefined) t.title = body.title;
        if (body.archived !== undefined) t.archived = body.archived;
        return reply(200, t);
      }
      t.busy = m[2];
      t.error = null; // as the helper's `begin` does
      return reply(202, { ok: true, busy: m[2] });
    },
    spawn: (request) => {
      w.spawned.push(request);
      const child = { pieces: [], waiting: null, push(piece) { if (this.waiting) { const go = this.waiting; this.waiting = null; go(piece); } else this.pieces.push(piece); } };
      w.children.push(child);
      return { next: () => (spawnFails ? Promise.reject(new Error('ENOENT')) : new Promise((resolve) => { if (child.pieces.length) resolve(child.pieces.shift()); else child.waiting = resolve; })) };
    },
    run: async (argv) => {
      // Node is asked its version before the helper is started (hooks/node.ts): kept apart from what a press runs
      if (argv[1] === '--version') { w.probed.push(argv[0]); if (!(argv[0] in w.nodes)) throw new Error('ENOENT'); return { exitCode: 0, stdout: `${w.nodes[argv[0]]}\n` }; }
      w.ran.push(argv);
      return { exitCode: 0, stdout: argv[0] === 'uname' ? 'Darwin\n' : '' };
    },
    now: async () => w.now,
    sleep: async (ms) => { w.slept.push(ms); await (ms > 5000 ? w.hold : w.floor); },

    submit: async (text) => { w.submitted.push(text); },
    storeGet: async (key) => w.store[key],
    storeSet: async (key, value) => { w.store[key] = value; },
    publish: async (view) => { w.views.push(view); },
    theme: async () => w.theme,
    copy: async (text) => { w.copied.push(text); return { isCopied: true }; },
  };
  w.say = (i, text) => w.children[i].push({ done: false, value: { stream: 'stdout', text } });
  w.exit = (i, code) => w.children[i].push({ done: true, value: { code, signal: null } });
  w.view = () => w.views[w.views.length - 1];
  w.since = (n) => w.calls.slice(n);
  /** The delete questions on show: [id, token] of each card that has one. */
  w.asked = () => w.view().tutorials.flatMap((r) => (r.ask ? [[r.id, r.ask.token]] : []));
  w.deletes = () => w.calls.filter((c) => c.startsWith('DELETE'));
  return w;
}

test('a helper already answering is adopted: none is started', async () => {
  const w = world({ up: true, tutorials: [T()] });
  const s = createSupervisor(w.host);
  await s.start();
  assert.deepEqual(w.spawned, []);
  assert.equal(w.view().status.line, 'Recorder not connected');
  assert.equal(w.view().tutorials.length, 1);
});

test('with none answering the helper is started from the plugin folder, on the tutorials folder', async () => {
  const w = world({ up: false });
  const s = createSupervisor(w.host);
  await s.start();
  assert.deepEqual(w.spawned, [{ argv: ['node', '--experimental-strip-types', 'helper/server.mjs', '--tutorials', 'C:\\Users\\ada\\Videos\\Rostrum'], cwd: 'C:\\plugin' }]);
  assert.equal(w.view().status.line, 'Rostrum is starting');
  w.up = true;
  w.say(0, 'rostrum helper on http://127.0.0.1:4600\n');
  await s.tick();
  assert.equal(w.view().status.line, 'Recorder not connected');
  assert.equal(w.view().empty.title, 'Nothing in progress');
});

test('the stored folder, the node of ROSTRUM_NODE and the port of ROSTRUM_PORT are used', async () => {
  const w = world({ up: false, store: { tutorialsDir: 'E:\\Chosen' }, env: { os: 'Windows_NT', userProfile: 'C:\\Users\\ada', rostrumHome: 'D:\\Env', node: 'C:\\n\\node.exe', port: '4700' } });
  w.host.fetch = async (url) => { w.calls.push(url); throw new Error('down'); };
  await createSupervisor(w.host).start();
  assert.deepEqual(w.spawned[0].argv, ['C:\\n\\node.exe', '--experimental-strip-types', 'helper/server.mjs', '--tutorials', 'E:\\Chosen']);
  assert.equal(w.calls[0], 'http://127.0.0.1:4700/health');
});

test('a helper that ends is restarted once, then shown stopped; Start Rostrum again starts it again', async () => {
  const w = world({ up: false });
  const s = createSupervisor(w.host);
  await s.start();
  w.say(0, 'boom\n');
  w.exit(0, 1);
  await settle();
  assert.equal(w.spawned.length, 2, 'one automatic restart');
  assert.equal(w.view().status.line, 'Rostrum is starting');
  w.say(1, 'Error: something else\n');
  w.exit(1, 1);
  await settle();
  assert.equal(w.spawned.length, 2, 'and no more');
  assert.deepEqual(w.view().status, { line: 'Rostrum has stopped', isConnected: false, isStopped: true, reason: 'Rostrum\'s helper stopped (exit code 1) and did not stay up when started again.', fixPrompt: null });
  await s.restart();
  assert.equal(w.spawned.length, 3);
  assert.equal(w.view().status.line, 'Rostrum is starting');
});

test('a helper that stops keeps its list on show, as rows that wait', async () => {
  const w = world({ up: true, tutorials: [T({ title: 'Reset a password', state: 'built' })] });
  const s = createSupervisor(w.host);
  await s.start();
  w.up = false;
  await s.tick();
  await settle();
  w.exit(0, 1); await settle();
  w.exit(1, 1); await settle();
  assert.equal(w.view().status.isStopped, true);
  assert.deepEqual(w.view().tutorials.map((r) => [r.name, r.line, r.buttons.length]), [['Reset a password', 'Waiting', 0]]);
});

test('a helper that ends because another holds the port: the other is adopted', async () => {
  const w = world({ up: false });
  const s = createSupervisor(w.host);
  await s.start();
  w.up = true; // the other session's helper is now answering
  w.exit(0, 1);
  await settle();
  assert.equal(w.spawned.length, 1);
  assert.equal(w.view().status.line, 'Recorder not connected');
});

test('the stopped reasons say what happened in plain words', async () => {
  const w = world({ up: false, spawnFails: true });
  await createSupervisor(w.host).start();
  await settle();
  assert.equal(w.spawned.length, 1);
  assert.equal(w.view().status.reason, 'Rostrum could not start its helper: Node (version 22 or later) was not found on this computer.');
  assert.equal(w.view().status.fixPrompt, 'Rostrum: set up Node for the helper');
  const v = world({ up: false });
  const s = createSupervisor(v.host);
  await s.start();
  v.say(0, 'Error: listen EADDRINUSE: address already in use 127.0.0.1:4600\n');
  v.exit(0, 1); await settle();
  v.exit(1, 1); await settle();
  assert.equal(v.view().status.reason, 'Port 4600 is in use by another program.');
  await s.fixHelper();
  assert.deepEqual(v.submitted, ['Rostrum: set up Node for the helper']);
});

test('Node is found by version before the helper is started: none, or only an old one, and nothing is started; the block says which', async () => {
  const none = world({ up: false });
  none.nodes = {};
  const s = createSupervisor(none.host);
  await s.start();
  assert.deepEqual(none.spawned, []);
  assert.deepEqual(none.probed, ['node', 'C:\\Users\\ada\\AppData\\Local\\Rostrum\\node\\node.exe']);
  assert.deepEqual([none.view().status.line, none.view().status.isStopped, none.view().status.reason, none.view().status.fixPrompt], ['Rostrum needs Node', true, 'Rostrum needs Node 22 or newer, which is not on this computer.', 'Rostrum: set up Node for the helper']);
  // Node installed since: Start Rostrum again finds it and starts the helper with it
  none.nodes = { node: 'v24.1.0' };
  await s.restart();
  assert.deepEqual(none.spawned.map((r) => r.argv[0]), ['node']);
  assert.equal(none.view().status.line, 'Rostrum is starting');
  const old = world({ up: false, env: { os: 'Windows_NT', userProfile: 'C:\\Users\\ada', programFiles: 'C:\\Program Files' } });
  old.nodes = { node: 'v18.20.4', 'C:\\Program Files\\nodejs\\node.exe': 'v20.11.0' };
  await createSupervisor(old.host).start();
  assert.deepEqual(old.spawned, []);
  assert.equal(old.view().status.reason, 'Rostrum needs Node 22 or newer. This computer has Node 18.20.4.');
  // PATH's is old but a newer one is in a usual place: the helper is started with that one
  old.nodes = { node: 'v18.20.4', 'C:\\Program Files\\nodejs\\node.exe': 'v22.4.0' };
  const again = world({ up: false, env: old.host.env });
  again.nodes = old.nodes;
  await createSupervisor(again.host).start();
  assert.equal(again.spawned[0].argv[0], 'C:\\Program Files\\nodejs\\node.exe');
  // a helper already answering is adopted without asking for Node at all
  const up = world({ up: true });
  up.nodes = {};
  await createSupervisor(up.host).start();
  assert.deepEqual([up.probed, up.view().status.isStopped], [[], false]);
});

test('Download Node 22: the block says what is fetched and where to; a fetch that fails stays there with Try again; one that works starts the helper with the fetched Node', async () => {
  const PORTABLE = 'C:\\Users\\ada\\AppData\\Local\\Rostrum\\node\\node.exe';
  const w = world({ up: false, env: { os: 'Windows_NT', userProfile: 'C:\\Users\\ada', localAppData: 'C:\\Users\\ada\\AppData\\Local' } });
  w.nodes = {};
  const s = createSupervisor(w.host);
  await s.start();
  assert.equal(w.view().status.line, 'Rostrum needs Node');
  assert.deepEqual(w.view().status.node, {
    lines: ['One press downloads Node 22.23.3 from nodejs.org (about 36 MB), checks it against the checksum nodejs.org publishes for it, and puts it in C:\\Users\\ada\\AppData\\Local\\Rostrum\\node. Nothing else on this computer is changed.'],
    button: 'Download Node 22', progress: null, warn: null,
  });
  // the hashing program prints nothing here: the download is not what the pin says, and nothing is started
  await s.fetchNode();
  assert.deepEqual(w.ran.map((argv) => argv[0].split('\\').pop()), ['curl.exe', 'certutil.exe', 'powershell.exe']);
  assert.deepEqual([w.view().status.node.button, w.view().status.node.progress], ['Try again', null]);
  assert.match(w.view().status.node.warn, /^The download did not match the checksum nodejs\.org publishes for it, so it was not unpacked or run/);
  assert.deepEqual(w.spawned, []);
  assert.ok(w.views.some((v) => v.pending['fetchNode:'] === 'Downloading…' && v.status.node?.progress?.label === 'Downloading Node 22.23.3' && v.status.node.button === null), 'the bar while it runs, and no button');
  // Try again, and this time it is the pinned archive: unpacked, tried, and the helper is started with it
  const plain = w.host.run;
  w.host.run = async (argv, init) => {
    const name = argv[0].split('\\').pop();
    if (name === 'certutil.exe') return { exitCode: 0, stdout: `SHA256 hash of x:\r\n${NODE_PIN.archives.windows.sha256}\r\nCertUtil: -hashfile command completed successfully.\r\n` };
    if (name === 'tar.exe') w.nodes[PORTABLE] = 'v22.23.3';
    return plain(argv, init);
  };
  await s.fetchNode();
  assert.deepEqual(w.spawned.map((r) => r.argv[0]), [PORTABLE]);
  assert.deepEqual([w.view().status.line, w.view().status.node], ['Rostrum is starting', undefined]);
  await s.fetchNode(); // pressed with the helper no longer waiting for Node: nothing is fetched
  assert.equal(w.spawned.length, 1);
  // Linux: nothing is offered, and the block says what to do
  const l = world({ up: false, env: { home: '/home/ada' } });
  l.nodes = {};
  l.host.run = async (argv) => { if (argv[0] === 'uname') return { exitCode: 0, stdout: 'Linux\n' }; throw new Error('ENOENT'); };
  await createSupervisor(l.host).start();
  assert.deepEqual(l.view().status.node, { lines: ['Install Node 22 from nodejs.org, then press Start Rostrum again.'], button: null, progress: null, warn: null });
});

test('an adopted helper that goes away is replaced by one of this session', async () => {
  const w = world({ up: true });
  const s = createSupervisor(w.host);
  await s.start();
  w.up = false;
  await s.tick();
  await settle();
  assert.equal(w.spawned.length, 1);
  assert.equal(w.view().status.line, 'Rostrum is starting');
});

test('the poll writes the view only when what is shown changes', async () => {
  const w = world({ up: true, tutorials: [T()] });
  const s = createSupervisor(w.host);
  await s.start();
  const n = w.views.length;
  await s.tick();
  await s.tick();
  assert.equal(w.views.length, n);
  w.tutorials[0].busy = 'prepare';
  await s.tick();
  assert.equal(w.views.length, n + 1);
});

test('the theme is read at start and again when it changes', async () => {
  const w = world({ tutorials: [T()] });
  w.theme = 'light';
  const s = createSupervisor(w.host);
  await s.start();
  assert.equal(w.view().mode, 'light');
  w.theme = 'dark-daltonized';
  await s.themeChanged();
  assert.equal(w.view().mode, 'dark');
  w.theme = null;
  await s.themeChanged();
  assert.equal(w.view().mode, 'dark');
});

test('Write script on a prepared recording submits the prompt', async () => {
  const w = world({ tutorials: [T()], prepared: true });
  const s = createSupervisor(w.host);
  await s.start();
  const n = w.calls.length;
  await s.act('script', 'rec-1760000000000');
  assert.deepEqual(w.since(n).slice(0, 2), ['GET /tutorials/rec-1760000000000', 'GET /tutorials/rec-1760000000000/elements?screen=9999']);
  assert.equal(w.calls.some((c) => c.startsWith('POST')), false);
  assert.deepEqual(w.submitted, ['Rostrum: write the script for tutorial rec-1760000000000']);
});

test('Write script on a raw recording prepares it first, and asks for the script when that has ended well', async () => {
  const w = world({ tutorials: [T()], prepared: false });
  const s = createSupervisor(w.host);
  await s.start();
  await s.act('script', 'rec-1760000000000');
  assert.ok(w.calls.includes('POST /tutorials/rec-1760000000000/prepare'));
  assert.deepEqual(w.submitted, []);
  assert.equal(w.view().tutorials[0].line, 'Preparing the recording. The script starts when this ends.');
  w.tutorials[0].busy = 'transcribe';
  await s.tick();
  assert.deepEqual(w.submitted, []);
  w.tutorials[0].busy = null;
  await s.tick();
  assert.deepEqual(w.submitted, ['Rostrum: write the script for tutorial rec-1760000000000']);
  await s.tick();
  assert.equal(w.submitted.length, 1, 'asked once');
});

test('a preparation that fails asks for no script', async () => {
  const w = world({ tutorials: [T()], prepared: false });
  const s = createSupervisor(w.host);
  await s.start();
  await s.act('script', 'rec-1760000000000');
  Object.assign(w.tutorials[0], { busy: null, error: { stage: 'prepare', message: 'exit 1' } });
  await s.tick();
  assert.deepEqual(w.submitted, []);
  assert.deepEqual(w.view().tutorials[0].buttons.map((b) => b.label), ['Retry']);
});

test('Build, Show script and Add narration submit their prompts; only the review opens in the browser', async () => {
  const w = world({ tutorials: [T({ state: 'voiced' })] });
  const s = createSupervisor(w.host);
  await s.start();
  const id = 'rec-1760000000000';
  await s.act('build', id);
  // the script and the narration hand-off are in the chat: nothing is opened, and the local page is never asked for
  await s.act('viewScript', id);
  await s.act('narration', id);
  assert.deepEqual(w.submitted, [`Rostrum: build tutorial ${id}`, `Rostrum: show the script for tutorial ${id}`, `Rostrum: add narration for tutorial ${id}`]);
  assert.deepEqual(w.ran, []);
  await s.act('review', id);
  await s.act('film', id);
  const review = `${BASE}/review/?tutorial=${id}`;
  const opener = ['rundll32', 'url.dll,FileProtocolHandler', review];
  assert.deepEqual(w.ran, [opener, opener]);
  // no opener can say a page appeared: no warning and no address, only the line that a page takes a moment, in the tutorial's own row
  assert.deepEqual([w.view().notice, w.view().link, w.view().tutorials[0].link], [null, null, HINT]);
  // the next press in the panel clears it; so does the next opening of the pane
  await s.act('more', id);
  assert.equal(w.view().tutorials[0].link, null);
  await s.act('film', id);
  assert.deepEqual(w.view().tutorials[0].link, HINT);
  await s.opened();
  assert.equal(w.view().tutorials[0].link, null);
  assert.equal(w.submitted.length, 3);
  assert.equal(w.calls.some((c) => c.startsWith('POST') || c.includes('/page')), false);
});

test('off Windows the opener is the platform\'s, found once through uname', async () => {
  const w = world({ tutorials: [T({ state: 'built' })], env: { home: '/Users/ada' } });
  const s = createSupervisor(w.host);
  await s.start();
  await s.act('review', 'rec-1760000000000');
  await s.act('review', 'rec-1760000000000');
  assert.deepEqual(w.ran, [['uname', '-s'], ['uname', '-m'], ['open', `${BASE}/review/?tutorial=rec-1760000000000`], ['open', `${BASE}/review/?tutorial=rec-1760000000000`]]);
});

test('a browser that cannot be opened: the address is shown to open by hand', async () => {
  const w = world({ tutorials: [T({ state: 'built' })] });
  w.host.run = async () => ({ exitCode: 1, stdout: '' });
  const s = createSupervisor(w.host);
  await s.start();
  await s.act('review', 'rec-1760000000000');
  await settle();
  assert.equal(w.view().notice, null);
  assert.deepEqual(w.view().tutorials[0].link, { line: 'The browser could not be opened. Open this address yourself:', isWarning: true, href: `${BASE}/review/?tutorial=rec-1760000000000` });
});

test('a slow press is shown as taken before anything it waits for answers: "Opening…" before the settings, the helper or the opener', async () => {
  const never = () => new Promise(() => {});
  const id = 'rec-1760000000000', OPENING = HINT;
  // the settings never read (so the supervisor never started): the press is in the view all the same
  let w = world({ tutorials: [T({ state: 'reviewed' })] });
  w.host.storeGet = never;
  w.floor = never();
  void createSupervisor(w.host).act('film', id);
  await settle();
  assert.deepEqual(w.view().pending, { [`film:${id}`]: 'Opening…' });
  assert.deepEqual(w.views.find((v) => v.pending[`film:${id}`]), w.view(), 'the label and the line come with the first thing the press publishes');
  // the helper never answers for the tutorial
  for (const [kind, state] of [['film', 'reviewed'], ['review', 'built']]) {
    w = world({ tutorials: [T({ state })] });
    const s = createSupervisor(w.host);
    await s.start();
    const fetch = w.host.fetch;
    w.host.fetch = (url, init) => (url.endsWith(`/tutorials/${id}`) ? never() : fetch(url, init));
    void s.act(kind, id);
    await settle();
    assert.deepEqual([w.view().pending, w.view().tutorials[0].link], [{ [`${kind}:${id}`]: 'Opening…' }, OPENING]);
    assert.deepEqual(w.ran, []);
  }
  // the opener never returns and the floor has not passed: still "Opening…", and a second press is not taken
  w = world({ tutorials: [T({ state: 'reviewed' })] });
  let floor;
  w.floor = new Promise((resolve) => { floor = resolve; });
  w.host.run = (argv) => { w.ran.push(argv); return never(); };
  const s = createSupervisor(w.host);
  await s.start();
  void s.act('film', id);
  await settle();
  assert.deepEqual([w.view().pending, w.view().tutorials[0].link], [{ [`film:${id}`]: 'Opening…' }, OPENING]);
  assert.deepEqual(w.slept, [HINT_MS, OPEN_FLOOR_MS]);
  await s.act('film', id);
  assert.equal(w.ran.length, 1);
  assert.deepEqual(w.view().tutorials[0].link, OPENING);
  // at the floor an opener still running is taken to have started a browser: the label is back, the address to press
  floor();
  await settle();
  assert.deepEqual([w.view().pending, w.view().tutorials[0].link], [{}, HINT]);
});

test('an opener that answers at once still shows "Opening…" for the floor; one that fails says so at its end; the plain line goes after its 8 s', async () => {
  const id = 'rec-1760000000000', WARNING = { line: 'The browser could not be opened. Open this address yourself:', isWarning: true, href: `${BASE}/review/?tutorial=${id}` };
  for (const [exitCode, after] of [[0, HINT], [1, WARNING]]) {
    const w = world({ tutorials: [T({ state: 'built' })] });
    let floor, hold;
    w.floor = new Promise((resolve) => { floor = resolve; });
    w.hold = new Promise((resolve) => { hold = resolve; });
    w.host.run = async () => ({ exitCode, stdout: '' });
    const s = createSupervisor(w.host);
    await s.start();
    void s.act('review', id);
    await settle();
    assert.deepEqual([w.view().pending[`review:${id}`], w.view().tutorials[0].link], ['Opening…', HINT]);
    floor();
    await settle();
    assert.deepEqual([w.view().pending, w.view().tutorials[0].link], [{}, after]);
    // the plain line has had its time: nothing is left under the buttons, but a warning stays
    hold();
    await settle();
    assert.deepEqual(w.view().tutorials[0].link, exitCode ? WARNING : null);
  }
});

test('every slow press wears its "…" label until it ends or fails: the helper\'s routes, the prompts, the panel\'s own buttons', async () => {
  const id = 'rec-1760000000000';
  const w = world({ tutorials: [T({ state: 'voiced' })] });
  const s = createSupervisor(w.host);
  await s.start();
  let let_go;
  const held = () => new Promise((resolve, reject) => { let_go = { resolve, reject }; });
  const fetch = w.host.fetch, submit = w.host.submit;
  const during = async (press, key, label) => {
    const done = press();
    await settle();
    assert.deepEqual(w.view().pending, { [key]: label }, key);
    return () => done;
  };
  // a prompt the session is slow to take, and one it refuses
  w.host.submit = held;
  let done = (await during(() => s.act('build', id), `build:${id}`, 'Starting…'))();
  let_go.resolve();
  await done;
  assert.deepEqual(w.view().pending, {});
  done = (await during(() => s.act('narration', id), `narration:${id}`, 'Asking Claude…'))();
  let_go.reject(new Error('A turn is running.'));
  await assert.rejects(done, /A turn is running/);
  assert.deepEqual(w.view().pending, {});
  done = (await during(() => s.fixHelper(), 'fixHelper:', 'Asking Claude…'))();
  let_go.resolve();
  await done;
  w.host.submit = submit;
  // a route the helper is slow to answer
  w.host.fetch = (url, init) => (init?.method === 'POST' ? held().then(() => fetch(url, init)) : fetch(url, init));
  done = (await during(() => s.install(), 'install:', 'Installing…'))();
  let_go.resolve();
  await done;
  assert.deepEqual([w.view().pending, w.view().notice], [{}, 'The recorder files are in place.']);
  done = (await during(() => s.act('archive', id), `archive:${id}`, 'Archiving…'))();
  // a second press meanwhile is not taken
  await s.act('archive', id);
  let_go.resolve();
  await done;
  assert.equal(w.calls.filter((c) => c.includes('"archived":true')).length, 1);
  assert.deepEqual([w.view().pending, w.view().tutorials.length], [{}, 0]);
  // what is done at once is never pending
  w.tutorials = [T({ state: 'voiced' })];
  await s.tick();
  const before = w.views.length;
  await s.act('more', id);
  await s.act('delete', id);
  assert.equal(w.views.slice(before).some((v) => Object.keys(v.pending).length > 0), false);
  w.host.fetch = (url, init) => (init?.method === 'DELETE' ? held().then(() => fetch(url, init)) : fetch(url, init));
  done = (await during(() => s.act('confirmDelete', id, w.asked()[0][1]), `confirmDelete:${id}`, 'Deleting…'))();
  let_go.resolve();
  await done;
  assert.deepEqual([w.view().pending, w.view().tutorials.length], [{}, 0]);
});

test('a press on another tutorial moves the address line there; openers that fail late say so only for the line shown', async () => {
  for (const [kind, state] of [['film', 'reviewed'], ['review', 'built']]) {
    const a = 'rec-1760000000002', b = 'rec-1760000000001';
    const w = world({ tutorials: [T({ id: a, state }), T({ id: b, state: 'built' })] });
    const held = [];
    w.host.run = (argv) => new Promise((resolve) => held.push({ argv, resolve }));
    const s = createSupervisor(w.host);
    await s.start();
    // the first press of a session: the opener may sit until its time limit; past the floor the press does not wait for it
    await s.act(kind, a);
    assert.equal(held.length, 1, 'the opener was started');
    assert.deepEqual([a, b].map((id) => w.view().tutorials.find((r) => r.id === id).link?.isWarning), [false, undefined]);
    // a press on another tutorial moves the line there; the first one's openers failing later say nothing
    await s.act('review', b);
    assert.deepEqual([a, b].map((id) => w.view().tutorials.find((r) => r.id === id).link?.isWarning), [undefined, false]);
    held[0].resolve({ exitCode: 1, stdout: '' });
    await settle();
    held[2].resolve({ exitCode: 1, stdout: '' });
    await settle();
    assert.deepEqual([a, b].map((id) => w.view().tutorials.find((r) => r.id === id).link?.isWarning), [undefined, false]);
    // every opener of the press shown failed: its line turns to the warning
    held[1].resolve({ exitCode: 1, stdout: '' });
    await settle();
    held[3].resolve({ exitCode: 1, stdout: '' });
    await settle();
    assert.deepEqual(held.map((h) => h.argv[0]), ['rundll32', 'rundll32', 'cmd', 'cmd']);
    assert.deepEqual([a, b].map((id) => w.view().tutorials.find((r) => r.id === id).link?.isWarning), [undefined, true]);
  }
});

test('the openers are tried in turn: the next when one cannot start or fails, none after one that ran', async () => {
  const w = world({ tutorials: [T({ state: 'built' })] });
  w.host.run = async (argv) => { w.ran.push(argv); if (argv[0] === 'rundll32') throw new Error('ENOENT'); return { exitCode: 0, stdout: '' }; };
  const s = createSupervisor(w.host);
  await s.start();
  await s.act('review', 'rec-1760000000000');
  await settle();
  assert.deepEqual(w.ran.map((argv) => argv[0]), ['rundll32', 'cmd']);
  assert.equal(w.view().notice, null);
  assert.deepEqual(w.view().tutorials[0].link, HINT);
  // one that is still running at the time limit did start a browser (it holds the output open): no second window
  const realNow = Date.now;
  let clock = 0;
  Date.now = () => clock;
  try {
    w.ran.length = 0;
    w.host.run = async (argv) => { w.ran.push(argv); clock += 10_000; throw new Error('timed out'); };
    await s.act('review', 'rec-1760000000000');
    await settle();
  } finally { Date.now = realNow; }
  assert.deepEqual(w.ran.map((argv) => argv[0]), ['rundll32']);
  assert.deepEqual([w.view().notice, w.view().tutorials[0].link.isWarning], [null, false]);
});

test('a press that threw is said in the pane, in one plain line', async () => {
  assert.equal(failureNotice(new Error('A turn is running.\n    at somewhere')), 'That did not work: A turn is running.');
  assert.equal(failureNotice(undefined), 'That did not work: no reason was given.');
  const w = world({ tutorials: [T({ state: 'voiced' })] });
  const s = createSupervisor(w.host);
  await s.start();
  w.host.submit = async () => { throw new Error('A turn is running'); };
  await assert.rejects(s.act('build', 'rec-1760000000000'));
  await s.failed(new Error('A turn is running'));
  assert.equal(w.view().notice, 'That did not work: A turn is running.');
});

test('Retry runs the failed stage on its route (which clears the error as it starts)', async () => {
  for (const [stage, call] of [['prepare', 'POST /tutorials/x/prepare'], ['transcribe', 'POST /tutorials/x/transcribe'], ['time', 'POST /tutorials/x/time'], ['measure', 'POST /tutorials/x/measure'],
    ['stills', 'POST /tutorials/x/stills {"moments":true}'], ['sweep', 'POST /tutorials/x/sweep'], ['render', 'POST /tutorials/x/render']]) {
    const w = world({ tutorials: [T({ id: 'x', state: 'voiced', error: { stage, message: 'exit 1' } })] });
    const s = createSupervisor(w.host);
    await s.start();
    const n = w.calls.length;
    await s.act('retry', 'x');
    assert.deepEqual(w.since(n).slice(0, 2), ['GET /tutorials/x', call], stage);
    assert.equal(w.calls.some((c) => c.includes('/state')), false, 'no retry event: a refused stage must leave the error standing');
    assert.equal(w.view().notice, null);
  }
});

test('a Retry the helper refuses says so in its words', async () => {
  const w = world({ tutorials: [T({ id: 'x', state: 'voiced', error: { stage: 'render', message: 'exit 1' } })] });
  w.refuse['POST /tutorials/x/render'] = [409, { error: 'sweep first' }];
  const s = createSupervisor(w.host);
  await s.start();
  await s.act('retry', 'x');
  assert.equal(w.view().notice, 'Retry: the helper answered "sweep first".');
  assert.deepEqual(w.view().tutorials[0].buttons.map((b) => b.label), ['Retry'], 'the error still stands');
  const unknown = world({ tutorials: [T({ id: 'x', error: { stage: 'mystery', message: '' } })] });
  const u = createSupervisor(unknown.host);
  await u.start();
  await u.act('retry', 'x');
  assert.equal(unknown.calls.some((c) => c.startsWith('POST')), false);
  assert.match(unknown.view().notice, /does not know the stage "mystery"/);
});

test('Keep times the take there is; fix asks Claude; retry runs the stage again', async () => {
  const w = world({ tutorials: [T({ id: 'a', state: 'approved', error: { stage: 'time', message: '1 not spoken' } }), T({ id: 'b', error: { stage: 'transcribe', message: 'whisper: program not found' } }), T({ id: 'c', state: 'voiced', error: { stage: 'render', message: 'exit 1' } })] });
  const s = createSupervisor(w.host);
  await s.start();
  await s.act('keep', 'a');
  assert.ok(w.calls.includes('POST /tutorials/a/time'));
  await s.act('fix', 'b');
  assert.deepEqual(w.submitted, ['Rostrum: set up the transcriber']);
  await s.act('retry', 'c');
  assert.ok(w.calls.includes('POST /tutorials/c/render'));
});

test('a press on a name opens it; More, Rename, Delete and Cancel move the open row through its states', async () => {
  const w = world({ tutorials: [T(), T({ id: 'rec-1760000000001', state: 'voiced' })] });
  const s = createSupervisor(w.host);
  await s.start();
  await s.act('open', 'rec-1760000000000');
  assert.deepEqual(w.view().tutorials.map((r) => [r.id, r.isOpen]), [['rec-1760000000000', true], ['rec-1760000000001', false]]);
  await s.act('more', 'rec-1760000000000');
  assert.equal(w.view().tutorials[0].more, 'open');
  await s.act('rename', 'rec-1760000000000');
  assert.equal(w.view().tutorials[0].more, 'rename');
  await s.rename('rec-1760000000000', '  Reset your password ');
  assert.ok(w.calls.includes('POST /tutorials/rec-1760000000000/state {"title":"Reset your password"}'));
  assert.equal(w.view().tutorials[0].more, 'closed');
  await s.act('delete', 'rec-1760000000000');
  assert.equal(w.view().tutorials[0].more, 'delete');
  await s.act('cancel', 'rec-1760000000000');
  assert.equal(w.view().tutorials[0].more, 'closed');
  await s.act('delete', 'rec-1760000000000');
  await s.act('confirmDelete', ...w.asked()[0]);
  assert.ok(w.calls.includes('DELETE /tutorials/rec-1760000000000'));
  assert.deepEqual(w.view().tutorials.map((r) => r.id), ['rec-1760000000001']);
  await s.act('archive', 'rec-1760000000001');
  assert.ok(w.calls.includes('POST /tutorials/rec-1760000000001/state {"archived":true}'));
});

test('Delete is carried out only for the row that was asked about', async () => {
  const w = world({ tutorials: [T(), T({ id: 'rec-1760000000001', state: 'voiced' })] });
  const s = createSupervisor(w.host);
  await s.start();
  // no question was put for this one: nothing is deleted
  await s.act('confirmDelete', 'rec-1760000000001');
  await s.act('delete', 'rec-1760000000000');
  await s.act('confirmDelete', 'rec-1760000000001', w.asked()[0][1]);
  assert.equal(w.calls.some((c) => c.startsWith('DELETE')), false);
  assert.equal(w.tutorials.length, 2);
  // the row asked about goes away by other means: the question goes with it
  await s.act('delete', 'rec-1760000000000');
  w.tutorials[0].archived = true;
  await s.tick();
  assert.deepEqual(w.view().tutorials.map((r) => [r.id, r.more, r.ask]), [['rec-1760000000001', 'closed', null]]);
});

test('a send-notes request from the review page is submitted once and marked done', async () => {
  const w = world({ tutorials: [T({ id: 'd', state: 'built', renders: ['v1.mp4'] })] });
  w.requests.push({ n: 7, id: 'd', kind: 'notes' });
  const s = createSupervisor(w.host);
  await s.start();
  await s.tick();
  assert.deepEqual(w.submitted, ['Rostrum: fix the review notes for tutorial d']);
  assert.ok(w.calls.includes('POST /requests/7/done'));
  await s.tick();
  assert.equal(w.submitted.length, 1);
});

test('the recorder once connected is remembered across sessions; setup installs, opens the extensions page and copies the folder', async () => {
  const w = world({ tutorials: [] });
  const s = createSupervisor(w.host);
  await s.start();
  assert.equal(w.view().empty.showSetupButton, true);
  w.lastSeen = 1_000_000 - 5;
  await s.tick();
  assert.equal(w.store.recorderEverConnected, true);
  w.lastSeen = null;
  await s.tick();
  assert.equal(w.view().empty.showSetupButton, false);
  await s.setup(true);
  assert.equal(w.view().setup.isOpen, true);
  await s.install();
  assert.ok(w.calls.includes('POST /recorder/install'));
  assert.deepEqual([w.view().setup.installed, w.view().setup.dir], [true, 'C:\\T\\Recorder']);
  assert.equal(w.view().notice, 'The recorder files are in place.');
  await s.openExtensions();
  await settle();
  assert.deepEqual(w.ran.at(-1), ['cmd', '/c', 'start', '', 'chrome', 'chrome://extensions']);
  // an address sent well is not shown
  assert.equal(w.view().link, null);
  await s.copyDir('desktop');
  assert.deepEqual(w.copied, ['C:\\T\\Recorder']);
  await s.nextTip();
  assert.equal(w.store.tipIndex, 1);
  await s.opened();
  assert.equal(w.store.tipIndex, 2);
  // the back arrow steps back, past the first one too (the view counts round)
  await s.prevTip();
  await s.prevTip();
  await s.prevTip();
  assert.equal(w.store.tipIndex, -1);
  // the next session has both
  const again = world({ tutorials: [], store: w.store });
  await createSupervisor(again.host).start();
  assert.equal(again.view().empty.showSetupButton, false);
});

test('a press while the helper is down, or on a tutorial with a stage running, does nothing and says why', async () => {
  const w = world({ tutorials: [T({ busy: 'render', state: 'voiced' })] });
  const s = createSupervisor(w.host);
  await s.start();
  await s.act('build', 'rec-1760000000000');
  assert.deepEqual(w.submitted, []);
  assert.equal(w.view().notice, 'A stage is running on this tutorial. Wait for it to end.');
  w.up = false;
  await s.act('build', 'rec-1760000000000');
  assert.deepEqual(w.submitted, []);
});

test('leftover progress with no stage running blocks nothing: Rename, Archive and Delete go through', async () => {
  const progress = { phase: 'render', label: 'Rendering', pct: 100, note: null };
  const w = world({ tutorials: [T({ id: 'x', state: 'built', progress }), T({ id: 'y', state: 'built', progress })] });
  const s = createSupervisor(w.host);
  await s.start();
  await s.act('rename', 'x');
  assert.equal(w.view().notice, null);
  assert.equal(w.view().tutorials.find((r) => r.id === 'x').more, 'rename');
  await s.act('archive', 'x');
  assert.ok(w.calls.includes('POST /tutorials/x/state {"archived":true}'));
  await s.act('delete', 'y');
  await s.act('confirmDelete', ...w.asked()[0]);
  assert.ok(w.calls.includes('DELETE /tutorials/y'));
  assert.equal(w.view().notice, null);
});

test('a brand pick is written to the tutorial and remembered for its site; Build applies the remembered one', async () => {
  const w = world({ tutorials: [T({ id: 'x', state: 'voiced' }), T({ id: 'y', state: 'voiced' })], brands: ['one', 'two'] });
  const s = createSupervisor(w.host);
  await s.start();
  await s.pickBrand('x', 'two');
  assert.ok(w.calls.includes('POST /tutorials/x/state {"brand":"two"}'));
  assert.deepEqual(w.store.lastBrandBySite, { 'app.example.test': 'two' });
  await s.act('open', 'y'); // the brand select is on the open row
  assert.equal(w.view().tutorials.find((t) => t.id === 'y').brand.value, 'two');
  const n = w.calls.length;
  await s.act('build', 'y');
  assert.deepEqual(w.since(n).slice(0, 2), ['GET /tutorials/y', 'POST /tutorials/y/state {"brand":"two"}']);
  assert.equal(w.submitted.length, 1);
  // with one brand the helper resolves it: the panel writes nothing
  const single = world({ tutorials: [T({ id: 'x', state: 'voiced' })], brands: ['one'], store: { lastBrandBySite: { 'app.example.test': 'one' } } });
  const one = createSupervisor(single.host);
  await one.start();
  await one.act('build', 'x');
  assert.equal(single.calls.some((c) => c.startsWith('POST')), false);
});

test('what is open changes only by the person\'s hand: a pressed tutorial opens and stays open through its step; a new recording, a step or a failure elsewhere open nothing, and a failure moves nothing', async () => {
  const a = 'rec-1760000000003', b = 'rec-1760000000002', c = 'rec-1760000000001';
  const w = world({ tutorials: [T({ id: a }), T({ id: b, state: 'voiced' }), T({ id: c, state: 'voiced' })], prepared: false });
  const s = createSupervisor(w.host);
  await s.start();
  const shown = () => w.view().tutorials.map((r) => `${r.id.slice(-1)}${r.isOpen ? '*' : ''}${r.progress ? '%' : ''}`);
  assert.deepEqual(shown(), ['3*', '2', '1']);
  // Write script on the open card: its step starts, and it stays where it is, open, with the bar
  await s.act('script', a);
  w.tutorials[0].progress = { label: 'Reading your gestures', pct: 40, note: null };
  await s.tick();
  assert.deepEqual(shown(), ['3*%', '2', '1']);
  assert.deepEqual([w.view().tutorials[0].buttons, w.view().tutorials[0].progress.pct], [[], 40]);
  // a newer recording arrives, and another tutorial fails: the open one is still the open one
  w.tutorials.unshift(T({ id: 'rec-1760000000004' }));
  w.tutorials[3].error = { stage: 'render', message: 'x' };
  await s.tick();
  assert.deepEqual(shown(), ['3*%', '4', '2', '1']);
  // a button on a collapsed card opens that card (the other closes, its tidy actions with it)
  await s.act('more', a);
  await s.act('build', b);
  assert.deepEqual([shown(), w.view().tutorials[0].more], [['2*', '4', '3%', '1'], 'closed']);
  // the open one leaves the list: the first in order opens, and is then kept
  w.tutorials.find((t) => t.id === b).archived = true;
  await s.tick();
  assert.deepEqual(shown(), ['4*', '3%', '1']);
  w.tutorials.find((t) => t.id === c).error = null;
  await s.tick();
  assert.deepEqual(shown(), ['4*', '3%', '1']);
});

// ── Delete: the question belongs to one tutorial, and only that tutorial can go ──
// Two untitled recordings of one site, nine minutes apart: the older (A) and the newer (B).
const A = 'rec-1791825949606', B = 'rec-1791826477657', C = 'rec-1791820000000';
const whenOf = (id) => { const d = new Date(Number(id.slice(4))), two = (n) => String(n).padStart(2, '0'); return `${d.toLocaleString('en-US', { month: 'short' })} ${d.getDate()}, ${two(d.getHours())}:${two(d.getMinutes())}`; };
const NOTHING = 'Nothing was deleted: the question had closed. Press Delete again if it should still go.';
/** A world with the question open on A (A opened by its name, More, Delete). */
async function asking(tutorials = [T({ id: A }), T({ id: B })]) {
  const w = world({ tutorials });
  const s = createSupervisor(w.host);
  await s.start();
  await s.act('open', A); await s.act('more', A); await s.act('delete', A);
  return { w, s };
}

test('untitled recordings are told apart by site and time, and the delete question names the one it is for', async () => {
  const { w } = await asking();
  assert.deepEqual(w.view().tutorials.map((r) => r.name), [`app.example.test · ${whenOf(A)}`, `app.example.test · ${whenOf(B)}`]);
  assert.notEqual(whenOf(A), whenOf(B));
  const [open, other] = w.view().tutorials;
  assert.deepEqual([open.id, open.more, other.more, other.ask], [A, 'delete', 'closed', null]);
  assert.equal(open.ask.text, `Delete "app.example.test · ${whenOf(A)}", recorded ${whenOf(A)}, from app.example.test? It goes to Rostrum's trash and can be brought back.`);
  assert.equal(typeof open.ask.token, 'string');
  assert.deepEqual(w.deletes(), []);
});

test('the confirm must carry the id and the token of the question on show: anything else deletes nothing and closes the question', async () => {
  for (const press of [(t) => [B, t], (t) => [A, undefined], (t) => [A, `${t}x`], (t) => [B, undefined]]) {
    const { w, s } = await asking();
    const token = w.asked()[0][1];
    await s.act('confirmDelete', ...press(token));
    assert.deepEqual([w.deletes(), w.asked(), w.tutorials.length], [[], [], 2], String(press));
    // a token is good once: the question it was minted for has closed, and it opens nothing again
    await s.act('confirmDelete', A, token);
    assert.deepEqual([w.deletes(), w.view().notice], [[], NOTHING]);
    // asked again: a new token, and that one deletes A and nothing else
    await s.act('delete', A);
    assert.notEqual(w.asked()[0][1], token);
    await s.act('confirmDelete', ...w.asked()[0]);
    assert.deepEqual([w.deletes(), w.tutorials.map((t) => t.id)], [[`DELETE /tutorials/${A}`], [B]]);
  }
});

test('a question older than 30 s deletes nothing, and the poll takes it away', async () => {
  const { w, s } = await asking();
  const [id, token] = w.asked()[0];
  w.now += 29_000;
  await s.tick();
  assert.deepEqual(w.asked(), [[id, token]]);
  w.now += 1000;
  await s.act('confirmDelete', id, token);
  assert.deepEqual([w.deletes(), w.asked(), w.view().notice], [[], [], NOTHING]);
  await s.act('delete', A);
  w.now += 30_000;
  await s.tick();
  assert.deepEqual([w.asked(), w.view().tutorials[0].more], [[], 'closed']);
});

test('while the question is open nothing moves: a failure, a step and a new recording are shown in place, and only the tutorial asked about can go', async () => {
  const { w, s } = await asking([T({ id: A }), T({ id: B, busy: 'prepare' }), T({ id: C })]);
  const order = () => w.view().tutorials.map((r) => r.id);
  assert.deepEqual(order(), [A, B, C]);
  const [, token] = w.asked()[0];
  // B's preparation fails (it has the warning, where it stands), and a newer recording arrives
  Object.assign(w.tutorials[1], { busy: null, error: { stage: 'prepare', message: 'exit 1' } });
  const D = 'rec-1791829999999';
  w.tutorials.unshift(T({ id: D }));
  await s.tick();
  assert.deepEqual(order(), [A, B, C, D]);
  assert.deepEqual(w.asked(), [[A, token]]);
  assert.match(w.view().tutorials[1].warn, /^Preparing the recording failed/);
  assert.deepEqual(w.view().tutorials.map((r) => r.isOpen), [true, false, false, false]);
  // the confirm on show is A's, and it deletes A
  await s.act('confirmDelete', ...w.asked()[0]);
  assert.deepEqual(w.deletes(), [`DELETE /tutorials/${A}`]);
  assert.deepEqual(w.tutorials.map((t) => t.id).sort(), [B, C, D].sort());
  // with the question closed the list is newest first again, the failed one in its place (a failure moves nothing)
  assert.deepEqual(order(), [D, B, C]);
});

test('the question is withdrawn, never moved: its tutorial leaving the list, a press elsewhere, or anything above the list changing closes it', async () => {
  // its tutorial is archived from chat: no other card inherits the question
  let { w, s } = await asking();
  let token = w.asked()[0][1];
  w.tutorials[0].archived = true;
  await s.tick();
  assert.deepEqual([w.asked(), w.view().tutorials.map((r) => [r.id, r.isOpen, r.more])], [[], [[B, true, 'closed']]]);
  await s.act('confirmDelete', B, token);
  await s.act('confirmDelete', A, token);
  assert.deepEqual(w.deletes(), []);
  // its tutorial is missing from one answer of the helper and back in the next: the question does not come back
  ({ w, s } = await asking());
  token = w.asked()[0][1];
  const all = w.tutorials;
  w.tutorials = [all[1]]; await s.tick();
  w.tutorials = all; await s.tick();
  assert.deepEqual(w.asked(), []);
  await s.act('confirmDelete', B, token);
  assert.deepEqual(w.deletes(), []);
  // a press on another card, or on another button of its own card
  for (const press of [(x) => x.act('open', B), (x) => x.act('more', B), (x) => x.act('script', A), (x) => x.setup(true), (x) => x.act('cancel', A)]) {
    ({ w, s } = await asking());
    token = w.asked()[0][1];
    await press(s);
    assert.deepEqual(w.asked(), [], String(press));
    await s.act('confirmDelete', A, token);
    assert.deepEqual(w.deletes(), [], String(press));
  }
  // what stands above the list changes (the recorder connects: another status line), so the cards may have moved
  ({ w, s } = await asking());
  token = w.asked()[0][1];
  w.lastSeen = w.now - 1000;
  await s.tick();
  assert.deepEqual(w.asked(), []);
  await s.act('confirmDelete', A, token);
  assert.deepEqual(w.deletes(), []);
});

test('presses that cross: a question asked for A while B is pressed, and a confirm while another card is opened, never delete B', async () => {
  const w = world({ tutorials: [T({ id: A }), T({ id: B })] });
  const s = createSupervisor(w.host);
  await s.start();
  await s.act('open', A); await s.act('more', A);
  await Promise.all([s.act('delete', A), s.act('open', B)]);
  for (const [id] of w.asked()) assert.equal(id, A);
  const token = w.asked()[0]?.[1];
  await Promise.all([s.act('confirmDelete', A, token), s.act('more', B)]);
  await Promise.all([s.act('delete', B), s.act('delete', A)]);
  assert.equal(w.asked().length <= 1, true);
  assert.equal(w.deletes().includes(`DELETE /tutorials/${B}`), false);
  // whatever is on show, a confirm for B with A's token deletes nothing
  await s.act('delete', A);
  await s.act('confirmDelete', B, w.asked()[0][1]);
  assert.deepEqual(w.deletes().filter((c) => c.endsWith(B)), []);
});

test('after the panel starts again the open card is the newest recording, not the one last worked on: its name and its question say which it is', async () => {
  // What the lost recording's timeline fits: A had been worked on, the panel was loaded again, and the card at the
  // top (the only one with More) was then B, the newest, whose step was running.
  const w = world({ tutorials: [T({ id: A }), T({ id: B, busy: 'prepare' })] });
  const s = createSupervisor(w.host);
  await s.start();
  assert.deepEqual(w.view().tutorials.map((r) => [r.id, r.isOpen]), [[B, true], [A, false]]);
  await s.act('more', B); await s.act('delete', B);
  assert.deepEqual([w.asked(), w.view().notice], [[], 'A stage is running on this tutorial. Wait for it to end.']);
  Object.assign(w.tutorials[1], { busy: null, error: { stage: 'prepare', message: 'exit 1' } });
  await s.tick();
  await s.act('delete', B);
  // the question now says which recording, when it was made and where: nobody reads it as A's
  assert.equal(w.view().tutorials[0].ask.text, `Delete "app.example.test · ${whenOf(B)}", recorded ${whenOf(B)}, from app.example.test? It goes to Rostrum's trash and can be brought back.`);
});

test('a deleted tutorial leaves a line with Undo: Undo brings it back and opens it; Dismiss takes the line away', async () => {
  const { w, s } = await asking();
  await s.act('confirmDelete', ...w.asked()[0]);
  assert.deepEqual(w.view().deleted, [{ id: A, name: `app.example.test · ${whenOf(A)}` }]);
  assert.deepEqual(w.view().tutorials.map((r) => r.id), [B]);
  // the line stays through polls
  await s.tick();
  assert.equal(w.view().deleted.length, 1);
  await s.undo(A);
  assert.ok(w.calls.includes(`POST /tutorials/${A}/restore`));
  assert.deepEqual([w.view().deleted, w.view().tutorials.map((r) => [r.id, r.isOpen])], [[], [[A, true], [B, false]]]);
  // deleted again and dismissed: the line goes, the tutorial stays in the trash
  await s.act('delete', A);
  await s.act('confirmDelete', ...w.asked()[0]);
  await s.dismiss(A);
  assert.deepEqual([w.view().deleted, w.trash.map((t) => t.id)], [[], [A]]);
  // brought back from chat while its line is on show: the line goes at the next poll
  w.tutorials.push(w.trash.pop());
  await s.act('open', A); await s.act('delete', A);
  await s.act('confirmDelete', ...w.asked()[0]);
  assert.equal(w.view().deleted.length, 1);
  w.tutorials.push(w.trash.pop());
  await s.tick();
  assert.deepEqual(w.view().deleted, []);
  // an Undo the helper refuses says so and keeps the line
  await s.act('open', A); await s.act('delete', A);
  await s.act('confirmDelete', ...w.asked()[0]);
  w.refuse[`POST /tutorials/${A}/restore`] = [409, { error: 'a tutorial with this id is there already' }];
  await s.undo(A);
  assert.equal(w.view().notice, 'Undo: the helper answered "a tutorial with this id is there already".');
  assert.equal(w.view().deleted.length, 1);
});

test('new pieces being made (progress with no stage busy) block nothing: More, Rename, Archive and Delete go through, and "Stop showing this" takes the bar away', async () => {
  const making = () => ({ phase: 'making', label: 'Making new pieces', pct: 3, note: 'Building the browser bar', at: new Date(1_000_000 - 7 * 60 * 60 * 1000).toISOString() });
  const w = world({ tutorials: [T({ id: 'x', state: 'voiced', progress: making() }), T({ id: 'y', state: 'voiced', progress: making() }), T({ id: 'z', state: 'voiced', progress: making() })] });
  const s = createSupervisor(w.host);
  await s.start();
  const row = (id) => w.view().tutorials.find((r) => r.id === id);
  assert.deepEqual([row('x').buttons, row('x').progress.label, row('x').progress.isStale], [[], 'Making new pieces', true]);
  await s.act('more', 'x');
  assert.equal(row('x').more, 'open');
  await s.act('rename', 'x');
  assert.deepEqual([w.view().notice, row('x').more], [null, 'rename']);
  await s.rename('x', 'A new name');
  assert.ok(w.calls.includes('POST /tutorials/x/state {"title":"A new name"}'));
  // the way out when the chat never says the pieces are done
  await s.act('stopShowing', 'x');
  assert.ok(w.calls.includes('POST /tutorials/x/progress {"clear":true}'));
  assert.deepEqual([row('x').progress, row('x').buttons.map((b) => b.act), w.view().notice], [null, ['build'], null]);
  await s.act('archive', 'y');
  assert.ok(w.calls.includes('POST /tutorials/y/state {"archived":true}'));
  await s.act('delete', 'z');
  await s.act('confirmDelete', ...w.asked()[0]);
  assert.ok(w.calls.includes('DELETE /tutorials/z'));
  assert.equal(w.view().notice, null);
  // a helper that will not: said, in its words
  w.refuse['POST /tutorials/x/progress'] = [409, { error: 'not now' }];
  await s.act('stopShowing', 'x');
  assert.equal(w.view().notice, 'Stop showing this: the helper answered "not now".');
});

test('first-run setup: the press starts it at the helper, the poll shows it run and end, and its end is said once', async () => {
  const steps = (done) => [{ name: 'deps', done, what: 'the video engine (npm packages, about 650 MB on disk)' }];
  const w = world({ up: true, tutorials: [T()] });
  w.setup = { needed: true, running: false, data: 'C:\\D', transcriber: 'none', steps: steps(false), last: null };
  const s = createSupervisor(w.host);
  await s.start();
  assert.equal(w.view().install.button, 'Download and set up');
  assert.equal(w.view().tutorials[0].line, 'Waiting for setup');
  const n = w.calls.length;
  await s.setUp();
  assert.ok(w.since(n).includes('POST /setup'));
  assert.ok(w.views.some((v) => v.pending['setUp:'] === 'Setting up…'), 'the press is shown as taken');
  assert.deepEqual([w.view().install.button, w.view().install.progress.label, w.view().pending['setUp:']], [null, 'Installing the video engine', undefined]);
  await s.setUp(); // pressed again while it runs (409): nothing is said
  assert.equal(w.view().notice, null);
  w.setup = { ...w.setup, needed: false, running: false, steps: steps(true), last: { state: 'done', label: 'Set up', pct: 100, note: null } };
  await s.tick();
  assert.equal(w.view().notice, 'Rostrum is set up.');
  assert.equal(w.view().install.title, 'Rostrum has no transcriber');
  assert.equal(w.view().tutorials[0].buttons.length, 1);
  await s.fixTranscriber();
  assert.deepEqual(w.submitted, ['Rostrum: set up the transcriber']);
  // a helper that refuses the press says so
  w.setup = { ...w.setup, needed: true, steps: steps(false), last: null };
  w.refuse['POST /setup'] = [500, { error: 'no' }];
  await s.setUp();
  assert.equal(w.view().notice, 'Set up: the helper answered "no".');
});
