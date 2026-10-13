// The worker against a stand-in for Chrome: who may control a recording, which tab is injected and listened to, what
// a pause and a tab switch do, and that the segments reach the helper however long it takes. Made-up events only.
import test from 'node:test';
import assert from 'node:assert/strict';

const OURS = 'chrome-extension://me/', store = {}, on = {}, calls = { fetch: [], inject: [], tabs: [], icon: [], bridge: [] };
// each tab's bridge: 'live' (answers), 'none' (a tab from before the extension was reloaded: answers once one is put in), 'never'
const bridges = {}, open = [];
const urls = {};
const tabInfo = (id) => ({ id, incognito: id === 8, url: urls[id] ?? 'https://site.test/a' });
let front = { id: 5, incognito: false }, helperUp = true;
const listen = (name) => ({ addListener: (fn) => { on[name] = fn; } });
globalThis.chrome = {
  runtime: { id: 'me', getURL: (p) => OURS + p, onInstalled: listen('installed'), onStartup: listen('startup'), onMessage: listen('message') },
  alarms: { create() {}, onAlarm: { addListener: (fn) => { (on.alarm ??= []).push(fn); } } },
  storage: { local: {
    get: async (keys) => Object.fromEntries((keys == null ? Object.keys(store) : [].concat(keys)).filter((k) => k in store).map((k) => [k, structuredClone(store[k])])),
    set: async (v) => { Object.assign(store, structuredClone(v)); on.stored?.(Object.fromEntries(Object.keys(v).map((k) => [k, { newValue: structuredClone(v[k]) }])), 'local'); },
    remove: async (k) => { for (const key of [].concat(k)) { const had = key in store; delete store[key]; if (had) on.stored?.({ [key]: {} }, 'local'); } },
  }, onChanged: listen('stored') },
  action: { setIcon: async ({ path }) => { calls.icon.push(path[16]); } },
  tabs: { query: async (q) => (q.active ? (front ? [front] : []) : q.url ? open.map(tabInfo) : []), get: async (id) => tabInfo(id),
    sendMessage: async (id, msg) => { if ((bridges[id] ?? 'live') !== 'live') throw new Error('Could not establish connection. Receiving end does not exist.'); return msg.ct === 'ping' ? 'pong' : undefined; }, create: async (t) => { calls.tabs.push(t); }, reload: async () => {}, update: async () => {}, onActivated: listen('activated'), onUpdated: listen('updated') },
  windows: { WINDOW_ID_NONE: -1, update: async () => {}, onFocusChanged: listen('focus') },
  scripting: { executeScript: async (what) => {
    const id = what.target.tabId;
    if (what.files[0] !== 'bridge.js') return void calls.inject.push(id);
    assert.deepEqual([what.world, what.target.allFrames], [undefined, undefined]); // the isolated world, the top frame
    calls.bridge.push(id);
    if (bridges[id] === 'none') bridges[id] = 'live';
  } },
};
globalThis.fetch = async (url, init) => { calls.fetch.push(String(url)); if (!helperUp) throw new Error('down'); return { ok: true, status: 200 }; };
await import('./worker.js');

const popup = { id: 'me', url: OURS + 'popup.html' };
const page = (tabId, frameId = 0, incognito = false) => ({ id: 'me', url: 'https://site.test/a', origin: 'https://site.test', frameId, tab: { id: tabId, incognito } });
const send = (msg, sender) => new Promise((answer) => { if (!on.message(msg, sender, answer)) answer(undefined); });
const events = (tabId, id, sender = page(tabId)) => send({ ct: 'events', id, events: [{ type: 3, timestamp: 1 }] }, sender);
const posted = (part) => calls.fetch.filter((u) => u.includes(part)).length;

test('a recording from the popup: one tab at a time, nothing while paused, segments until the helper has them', async () => {
  await send({ ct: 'arm', mic: 'prompt' }, popup);
  const id = store.recording.id;
  assert.deepEqual([store.recording.phase, store.recording.tabId, calls.tabs.length], ['countdown', 5, 0]); // no microphone allowed: no microphone page opened
  // a page (through its content script) cannot steer the recording
  await send({ ct: 'stop' }, page(5));
  await send({ ct: 'cancel' }, page(5));
  assert.equal(store.recording.phase, 'countdown');
  // nothing is injected or taken during the count, and 'begin' cannot cut it short
  assert.equal(await send({ ct: 'inject' }, page(5)), false);
  assert.equal(await events(5, id), false);
  await send({ ct: 'begin' }, popup);
  assert.equal(store.recording.phase, 'countdown');
  store.recording.armedAt -= 3000;
  front = { id: 6, incognito: false }; // the person went to the page to show during the count
  await send({ ct: 'begin' }, popup);
  assert.deepEqual([store.recording.phase, store.recording.tabId], ['recording', 6]);
  assert.deepEqual([calls.icon[0], calls.icon.at(-1)], ['icons/icon-16.png', 'icons/icon-rec-16.png']); // neutral through the count, red once it runs

  // injected only into the recorded tab's top frame; batches only from there, under the recording's id
  assert.equal(await send({ ct: 'inject' }, page(6)), true);
  assert.equal(await send({ ct: 'inject' }, page(5)), false);
  assert.equal(await send({ ct: 'inject' }, page(6, 2)), false);
  assert.deepEqual(calls.inject, [6]);
  assert.equal(await events(6, id), true);
  assert.equal(await events(5, id), false);
  assert.equal(await events(6, 'rec-1'), false);
  assert.equal(await events(6, id, page(6, 2)), false);
  assert.equal(await send({ ct: 'assets', id, urls: [] }, page(5)), false);
  assert.equal(posted('/events'), 1);

  // a tab switch: the new tab is the recorded one; the old one may finish for a moment, then never again
  front = { id: 7, incognito: false };
  await on.activated({ tabId: 99 }); // the event's own tab is not believed: the tab in front is asked for
  assert.equal(store.recording.tabId, 7);
  assert.equal(await events(6, id), true);
  store.flushing.until = Date.now() - 1;
  assert.equal(await events(6, id), false);
  assert.equal(await events(7, id), true);
  // a private tab in front: nothing is recorded, nothing injected, nothing taken
  front = { id: 8, incognito: true };
  await on.focus(3);
  assert.equal(store.recording.tabId, -1);
  assert.equal(await send({ ct: 'inject' }, page(8, 0, true)), false);
  assert.equal(await events(8, id, page(8, 0, true)), false);
  front = { id: 7, incognito: false };
  await on.activated({ tabId: 7 });

  // pause: the page's last batch, then nothing; no tab is followed or injected while paused
  await send({ ct: 'pause' }, popup);
  assert.equal(store.recording.phase, 'paused');
  assert.equal(calls.icon.at(-1), 'icons/icon-16.png'); // paused: the toolbar icon is neutral again
  assert.equal(await events(7, id), true);
  store.flushing.until = Date.now() - 1;
  assert.equal(await events(7, id), false);
  front = { id: 9, incognito: false };
  await on.activated({ tabId: 9 });
  assert.equal(store.recording.tabId, 7);
  assert.equal(await send({ ct: 'inject' }, page(9)), false);
  assert.equal(await send({ ct: 'inject' }, page(7)), false);
  assert.deepEqual(calls.inject, [6]);
  // carrying on records the tab then in front; its batches say the recording has had a pause
  helperUp = false;
  await send({ ct: 'resume' }, popup);
  assert.deepEqual([store.recording.phase, store.recording.tabId, store.recording.segments.length], ['recording', 9, 2]);
  assert.equal(await events(7, id), false);
  calls.fetch.length = 0;
  assert.equal(await events(9, id), false); // taken, but the helper is not answering
  assert.ok(calls.fetch.some((u) => u.endsWith('/events?pauses=1')));

  // Stop with the helper not answering: the recording ends, the segments are kept, and sent when it is back
  await send({ ct: 'stop' }, popup);
  assert.equal(store.recording, undefined);
  assert.equal(calls.icon.at(-1), 'icons/icon-16.png');
  assert.equal(store.lastSent.id, id);
  assert.equal(store.unsent[id].length, 2);
  assert.ok(store.unsent[id].every((s) => Number.isFinite(s.to)));
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(store.unsent[id].length, 2); // still not confirmed
  helperUp = true; calls.fetch.length = 0;
  for (const alarm of on.alarm) alarm({ name: 'ping' });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(posted(`/session/${id}/segments`), 1);
  assert.deepEqual(store.unsent, {});
  // after Stop the last tab may finish for a moment; then nothing joins
  assert.equal(await events(9, id), true);
  store.flushing.until = Date.now() - 1;
  assert.equal(await events(9, id), false);
});

test('a tab with no live bridge gets one; a page that never arrives is said not to be captured; nothing captured is not "sent"', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const settle = async () => { for (let i = 0; i < 30; i++) await new Promise((r) => setImmediate(r)); };
  const after = async (ms) => { t.mock.timers.tick(ms); await settle(); };
  const start = async (tab) => {
    front = tab;
    await send({ ct: 'arm', mic: 'granted' }, popup);
    store.recording.armedAt -= 3000;
    await send({ ct: 'begin' }, popup);
    await settle();
    return store.recording.id;
  };
  helperUp = true;
  bridges[20] = 'none'; bridges[21] = 'never';

  // a tab that was open before the extension was reloaded: no bridge answers, so one is put in, and its page arrives
  let id = await start({ id: 20, incognito: false });
  assert.ok(calls.bridge.includes(20));
  assert.equal(bridges[20], 'live');
  assert.equal(await events(20, id), true);
  await settle();
  assert.deepEqual([store.recording.captured, store.recording.noPage], [true, undefined]);
  await after(6000);
  assert.equal(store.recording.noPage, undefined); // batches came: nothing to say
  assert.equal(calls.icon.at(-1), 'icons/icon-rec-16.png');

  // on to a tab whose page never arrives: seen to at once, again at 3 s, and at 6 s the recording says so
  front = { id: 21, incognito: false };
  await on.activated({ tabId: 21 });
  await settle();
  const tries = () => calls.bridge.filter((x) => x === 21).length;
  assert.equal(tries(), 1);
  await after(2999);
  assert.deepEqual([tries(), store.recording.noPage], [1, undefined]);
  await after(1);
  assert.deepEqual([tries(), store.recording.noPage], [2, undefined]);
  await after(3000);
  assert.equal(store.recording.noPage, true);
  assert.equal(calls.icon.at(-1), 'icons/icon-16.png'); // the toolbar does not claim to be recording
  // the page was reloaded and its batches come: the warning goes
  bridges[21] = 'live';
  assert.equal(await events(21, id), true);
  await settle();
  assert.equal(store.recording.noPage, undefined);
  assert.equal(calls.icon.at(-1), 'icons/icon-rec-16.png');
  await send({ ct: 'stop' }, popup);
  assert.deepEqual([store.lastSent.id, store.lastSent.captured], [id, true]);

  // a recording in which no page ever arrives ends as "nothing captured", not as sent
  bridges[22] = 'never';
  id = await start({ id: 22, incognito: false });
  await after(6000);
  assert.equal(store.recording.noPage, true);
  await send({ ct: 'stop' }, popup);
  assert.deepEqual([store.lastSent.id, store.lastSent.captured], [id, false]);
  // unless its one batch comes with Stop
  assert.equal(await events(22, id), true);
  await settle();
  assert.equal(store.lastSent.captured, true);

  // a page that can never be recorded: said so at once, nothing put into it, never turned into a failure
  urls[40] = 'chrome://settings/';
  calls.bridge.length = 0;
  id = await start({ id: 40, incognito: false });
  assert.deepEqual([store.recording.tabId, store.recording.noPage, calls.bridge.length], [40, 'kind', 0]);
  await after(6000);
  assert.equal(store.recording.noPage, 'kind');
  // the same tab goes to a normal page: its bridge is seen to and its batches clear the note
  urls[40] = 'https://site.test/b';
  on.updated(40, { url: urls[40] });
  await settle();
  assert.equal(await events(40, id), true);
  await settle();
  assert.equal(store.recording.noPage, undefined);
  await send({ ct: 'stop' }, popup);

  // installed or reloaded: every open web tab without a live bridge gets one, so no tab needs refreshing
  bridges[30] = 'none'; bridges[31] = 'live'; open.push(30, 31);
  calls.bridge.length = 0;
  on.installed();
  await settle();
  assert.deepEqual(calls.bridge, [30]);
});
