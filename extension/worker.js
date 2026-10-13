// Forwards event batches to the local helper, one at a time, in arrival order. Tells a content script its tab id.
// Fetches the page's assets (stylesheets, fonts, images) and stores them with the recording, through the same chain.
// ponytail: in-memory promise chain. Chrome keeps the worker alive while a message response is pending,
// but a batch whose POST fails (helper down) is dropped, not retried. Persist a queue if that bites.
// Injects the recorder (rrweb + the page script) into the recorded tab, and only there, when its bridge asks.
// Takes a batch only from that tab while the recording runs (and for a moment after it leaves the tab).
// Tells the helper the recorder is installed and awake (a heartbeat; the panel shows "Recorder connected").
// Owns the recording (see "The recording's owner" below): the popup asks, the worker decides and writes storage.
import { arm, begin, cancel, pause, resume, stop, withMic, COUNTDOWN_MS, tabOf, follow, records, leaving, accepts, pausesOf, iconFor, bridgeStep, proof, lost, cannot, tookBatch, LIFE_RETRY_MS, LIFE_GIVE_UP_MS } from './state.mjs';

const HELPER = 'http://127.0.0.1:4600/session/';
const PING = 'http://127.0.0.1:4600/recorder/ping';
const OURS = chrome.runtime.getURL(''); // this extension's own pages (the popup, the microphone page)
const MIC = chrome.runtime.getURL('mic.html');
const ping = () => fetch(PING, { method: 'POST' }).catch(() => {}); // helper not running: nothing to tell
// Chrome fires an alarm no more often than every 30 s; the panel counts the recorder as connected for 60 s after a ping.
// Installed or reloaded: a recording left in storage has no pages behind it any more (and may be an older build's shape).
// And the tabs that are already open have no live bridge (Chrome puts content scripts only into pages that load
// afterwards; a copy from before a reload is cut off): heal() puts one into each, so nobody has to refresh a tab.
chrome.runtime.onInstalled.addListener(() => { chrome.storage.local.remove('recording'); chrome.alarms.create('ping', { periodInMinutes: 0.5 }); ping(); heal(); });
chrome.runtime.onStartup.addListener(() => { chrome.alarms.create('ping', { periodInMinutes: 0.5 }); ping(); heal(); });
chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'ping') ping(); });
let chain = Promise.resolve();
const seen = new Set(); // "<recording id> <url>" already fetched; lost on worker restart, the helper dedupes by hash

// The URL list comes from the page, which is untrusted: http(s) only (never file:, chrome-extension:, data:).
// A slow host must not hold up the event batches queued behind it for long, hence the timeout.
// With cookies first (the recorded site's own files may need the session). A host the extension has no permission
// for is an ordinary cross-origin fetch, where cookies plus a wildcard CORS header fail: retry without cookies,
// which is all a public CDN or font host needs.
// Cookies go only to the recorded page's own origin. Local and private hosts are refused unless they are that
// origin (the fixture), so a page cannot use the worker to read things on the user's machine or network.
const PRIVATE = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[)/i; // any IPv6 literal too
async function storeAsset(id, url, pageOrigin) {
  const u = new URL(url);
  const own = u.origin === pageOrigin;
  if (!own && PRIVATE.test(u.hostname)) throw new Error('private host');
  // With access to every site, a redirect must not lead the worker onto the user's machine or network: a request
  // to another origin that redirects is dropped before the next hop is made (stylesheets and fonts on public hosts
  // are served directly). The recorded page's own origin may redirect within itself.
  // ponytail: hostnames are checked, not resolved addresses, so a public name that resolves to a private address
  // gets through. What comes back is only written to the user's own tutorial folder, never returned to the page.
  // Proxy asset fetches through the helper, which can check resolved addresses, if that matters later.
  const r = await fetch(url, { credentials: own ? 'include' : 'omit', redirect: own ? 'follow' : 'error', signal: AbortSignal.timeout(15000) });
  const final = new URL(r.url || url);
  if (own ? final.origin !== pageOrigin : final.href.split('#')[0] !== u.href.split('#')[0]) throw new Error('redirected off its origin');
  if (!r.ok) throw new Error(String(r.status));
  if (Number(r.headers.get('content-length')) > 20 * 1024 * 1024) throw new Error('too big');
  const type = r.headers.get('content-type') || 'application/octet-stream';
  await fetch(HELPER + encodeURIComponent(id) + '/asset?url=' + encodeURIComponent(url), { method: 'POST', headers: { 'content-type': type }, body: await r.arrayBuffer() });
}

// The recording's owner. The popup only asks; every change to storage.local.recording is made here, so a popup that
// closes mid-way (clicking the tab to show closes it) can never leave a half-made recording. Changes run one at a
// time, so a tab switch and a press that land together cannot overwrite each other. The rules themselves (which tab,
// which phase, what may join) are extension/state.mjs, which is tested; this file applies them.
const SEGMENTS = (id) => HELPER + encodeURIComponent(id) + '/segments';
const stored = (keys) => chrome.storage.local.get(keys);
const getRec = async () => (await stored('recording')).recording ?? null;
// The tab in front: the active tab of the focused ordinary Chrome window. Nothing when a window of another kind
// (developer tools, an app window) has the focus, or Chrome does not show this extension that window.
const frontTab = async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true, windowType: 'normal' }))[0];
let changes = Promise.resolve();
const oneAtATime = (work) => { const run = changes.then(work); changes = run.catch(() => {}); return run; };
// One write for one change: the recording, the tab it has just left (which may finish sending for a moment, and no
// longer: state.mjs `leaving`), and, when a pause began or ended, the segments still to be confirmed by the helper.
async function put(before, after, now, also = {}) {
  if (after === before) return;
  const set = { ...also }, gone = leaving(before, after, now);
  if (gone) set.flushing = gone;
  if (after) set.recording = after;
  if (before && after && before.phase !== 'countdown' && after.segments !== before.segments) set.unsent = { ...(await stored('unsent')).unsent, [after.id]: after.segments };
  await chrome.storage.local.set(set);
  if (!after) await chrome.storage.local.remove('recording'); // the bridge and the microphone page stop on this change
  if (set.unsent) sendSegments();
  // a tab has just become the recorded one, or none is any more: see to its bridge and expect its batches
  const was = before?.phase === 'recording' ? before.tabId : null, is = after?.phase === 'recording' ? after.tabId : null;
  if (was !== is) watch(after);
}
const change = (how) => oneAtATime(async () => { const r = await getRec(), now = Date.now(); await put(r, await how(r, now), now); });

// A live bridge in the tab that is recorded, and proof that its page is arriving (the rules: state.mjs, "proof of
// life"). The bridge is asked whether it is there; if nothing answers, the same bridge.js Chrome puts into pages as
// they load is put in by hand (its isolated world, the top frame, an ordinary web page that is not private: the
// checks of state.mjs `holdsBridge`), and asked again. It starts by reading the state, so it needs telling nothing.
const answers = (tabId) => Promise.race([
  chrome.tabs.sendMessage(tabId, { ct: 'ping' }, { frameId: 0 }).then((v) => v === 'pong', () => false),
  new Promise((no) => setTimeout(() => no(false), 500)),
]);
async function ensureBridge(tab) {
  if (bridgeStep(tab, false, false) === 'none') return 'none';
  if (await answers(tab.id)) return 'ok';
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['bridge.js'], injectImmediately: true }).catch((err) => console.warn('rostrum: no bridge could be put into this tab', err?.message));
  return bridgeStep(tab, await answers(tab.id), true);
}
const ensureTab = async (tabId) => (tabId >= 0 ? ensureBridge(await chrome.tabs.get(tabId).catch(() => undefined)) : 'none');
const heal = async () => { for (const tab of await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'], discarded: false })) ensureBridge(tab); };
// From the moment a tab is the recorded one its batches are counted (the first, the full snapshot, comes within a
// second). None after 3 s: its bridge is seen to once more. None after 6 s: the recording says so (`noPage`), the popup
// warns and the toolbar icon goes neutral, until a batch does come.
// ponytail: counted in the worker's memory; a worker restarted mid-recording stops checking (batches keep it awake).
let life = null;
function watch(r) {
  clearTimeout(life?.retry);
  clearTimeout(life?.giveUp);
  life = r?.phase === 'recording' ? { id: r.id, tabId: r.tabId, batches: 0 } : null;
  if (!life) return;
  const mine = life;
  // a page that can never be recorded (Chrome's own, the Web Store, a PDF, a private tab): said so, and not a failure
  ensureTab(mine.tabId).then((step) => {
    if (step !== 'none' || life !== mine) return;
    clearTimeout(mine.retry);
    clearTimeout(mine.giveUp);
    change((now) => cannot(now, mine.id, mine.tabId));
  });
  const check = (ms) => {
    if (life !== mine) return;
    const verdict = proof(ms, mine.batches);
    if (verdict === 'retry') ensureTab(mine.tabId);
    if (verdict === 'noPage') change((now) => lost(now, mine.id, mine.tabId));
  };
  mine.retry = setTimeout(() => check(LIFE_RETRY_MS), LIFE_RETRY_MS);
  mine.giveUp = setTimeout(() => check(LIFE_GIVE_UP_MS), LIFE_GIVE_UP_MS);
}

// the recorded tab went to another address: the same questions again, of the page it is now
chrome.tabs.onUpdated.addListener((tabId, info) => { if (info.url && life?.tabId === tabId) getRec().then((r) => { if (r?.phase === 'recording' && r.tabId === tabId) watch(r); }); });

// Where the pauses were (the segments) must reach the helper, or it could not take them out of the clock. They are
// kept in storage (`unsent`) from the moment a pause begins or ends, and at Stop before the recording is cleared, and
// sent until the helper says it has them: now, on every later change, every 30 s (the heartbeat) and when the worker
// starts. Event batches also carry how many pauses there were, so a helper that never hears the segments knows not
// to treat the recording as one stretch (helper/pipeline.mjs).
let sending = null, more = false;
function sendSegments() {
  more = true;
  return (sending ??= (async () => {
    while (more) {
      more = false;
      for (const [id, segments] of Object.entries((await stored('unsent')).unsent ?? {})) {
        const status = await fetch(SEGMENTS(id), { method: 'POST', body: JSON.stringify({ segments }) }).then((r) => r.status, () => 0);
        // confirmed, or refused as something the helper will never take (then the pause count on the events stands guard)
        if (status === 200 || status === 400 || status === 413) await oneAtATime(async () => {
          const { unsent = {} } = await stored('unsent');
          if (JSON.stringify(unsent[id]) !== JSON.stringify(segments)) return; // newer segments were kept meanwhile: they go next
          delete unsent[id];
          await chrome.storage.local.set({ unsent });
        });
      }
    }
  })().catch((err) => console.warn('rostrum: segments not sent yet', err?.message)).finally(() => { sending = null; }));
}
chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'ping') sendSegments(); });
sendSegments();

// The toolbar icon follows the recording: the red ring only while it is running (state.mjs `iconFor`); counting down,
// paused or not recording, the neutral one. Set from storage, so it is right whoever changed it and after a restart.
const showIcon = (recording) => {
  const mark = iconFor(recording) === 'rec' ? 'icon-rec' : 'icon';
  return chrome.action.setIcon({ path: { 16: `icons/${mark}-16.png`, 32: `icons/${mark}-32.png` } }).catch(() => {});
};
chrome.storage.onChanged.addListener((changed, area) => { if (area === 'local' && changed.recording) showIcon(changed.recording.newValue); });
getRec().then(showIcon);

// ponytail: the countdown is a timer in the worker's memory. Chrome keeps a worker for 30 s after its last event, so
// 3 s holds; an open popup nudges with 'begin' if it does not. Use chrome.alarms if a lost count is ever seen.
let countdown = null;
const armNow = (micState) => oneAtATime(async () => {
  if (await getRec()) return false; // one recording at a time
  const narrated = withMic(micState);
  // The microphone page records the voice: make sure it is there, in the background, and awake (Chrome may have
  // discarded a pinned tab it has not shown for a while, and a discarded page runs nothing).
  if (narrated) {
    const micTab = (await chrome.tabs.query({})).find((t) => t.url?.startsWith(MIC));
    if (!micTab) await chrome.tabs.create({ url: MIC, active: false, pinned: true });
    else if (micTab.discarded) await chrome.tabs.reload(micTab.id);
  }
  const tab = await frontTab();
  ensureBridge(tab); // ready before the count ends
  const r = arm(Date.now(), tabOf(tab));
  await chrome.storage.local.remove('lastSent');
  await chrome.storage.local.set({ recording: r, armedMic: narrated ? 'granted' : 'prompt' });
  clearTimeout(countdown);
  countdown = setTimeout(beginNow, COUNTDOWN_MS);
  return r;
});
const beginNow = () => oneAtATime(async () => {
  const r = await getRec(), now = Date.now();
  if (!r || r.phase !== 'countdown' || now < r.armedAt + COUNTDOWN_MS) return;
  if (now > r.armedAt + COUNTDOWN_MS + 10_000) return put(r, null, now); // a count lost long ago: never start a recording late, unannounced
  const tab = await frontTab(); // the tab in front NOW is the one recorded (the one the count began on, if Chrome cannot say)
  await put(r, begin({ ...r, tabId: tab ? tabOf(tab) : r.tabId }, now), now);
});
const stopNow = () => oneAtATime(async () => {
  const r = await getRec(), now = Date.now(), done = stop(r, now);
  clearTimeout(countdown);
  if (!done) { await put(r, null, now); return null; } // nothing was recorded: a cancel
  const { armedMic, unsent } = await stored(['armedMic', 'unsent']);
  // In one write, before the recording is cleared: "sent" (so the popup never shows Ready in between) and the
  // segments, kept until the helper confirms them.
  await put(r, null, now, { lastSent: { id: done.id, seconds: done.seconds, withMic: withMic(armedMic), captured: done.captured, at: now }, unsent: { ...unsent, [done.id]: done.segments } });
  return done;
});
// The recording follows the tab in front, and only while it is running (state.mjs `follow`): the bridge of the tab
// that lost it stops, the one that gained it asks to be injected (checked below against this same stored tab) and
// starts with a full snapshot. During the countdown and a pause nothing is followed, injected or taken: carrying on
// records the tab then in front. A private tab is never recorded. The event's own tab is not trusted to be the one
// in front (a tab can be activated in a window behind): the front tab is asked for each time.
const followFront = () => change(async (r) => follow(r, r?.phase === 'recording' ? await frontTab() : undefined));
chrome.tabs.onActivated.addListener(followFront);
chrome.windows.onFocusChanged.addListener((windowId) => (windowId === chrome.windows.WINDOW_ID_NONE ? undefined : followFront())); // another Chrome window came to the front

chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return;
  // The recording is controlled from this extension's own pages only (the popup). A content script speaks from inside
  // a web page, and nothing there may start, stop or steer a recording.
  if (typeof sender.url === 'string' && sender.url.startsWith(OURS)) {
    const ask = (work) => { work().then((v) => respond(v ?? true), (err) => { console.warn('rostrum: message failed', msg?.ct, err?.message); respond(false); }); return true; };
    if (msg?.ct === 'arm') return ask(() => armNow(msg.mic));
    if (msg?.ct === 'begin') return ask(beginNow);
    if (msg?.ct === 'cancel') return ask(() => { clearTimeout(countdown); return change(cancel); });
    if (msg?.ct === 'pause') return ask(() => change(pause));
    if (msg?.ct === 'resume') return ask(() => change(async (r, now) => (r?.phase === 'paused' ? resume(r, now, tabOf(await frontTab())) : r)));
    if (msg?.ct === 'stop') return ask(stopNow);
    if (msg?.ct === 'another') return ask(() => chrome.storage.local.remove('lastSent'));
    if (msg?.ct === 'mic') return ask(() => (typeof msg.deviceId === 'string' && msg.deviceId ? chrome.storage.local.set({ micDeviceId: msg.deviceId.slice(0, 200) }) : chrome.storage.local.remove('micDeviceId')));
    if (msg?.ct === 'openMic') return ask(async () => { // the popup's "Allow microphone": the one time this page comes to the front
      const micTab = (await chrome.tabs.query({})).find((t) => t.url?.startsWith(MIC));
      // reload first, then bring it forward: the page asks for the microphone as it loads
      if (micTab) { await chrome.tabs.reload(micTab.id); await chrome.tabs.update(micTab.id, { active: true }); await chrome.windows.update(micTab.windowId, { focused: true }); }
      else await chrome.tabs.create({ url: MIC, active: true });
    });
    return;
  }
  if (msg?.ct === 'whoami') { respond(sender.tab?.id ?? null); return; }
  if (msg?.ct === 'inject') {
    // Only into the tab that is being recorded (as stored by this worker, not as the asking page says), its top frame,
    // and only while the recording is running: never during the countdown or a pause, never into a private tab.
    // A page Chrome will not let an extension into (its own pages, the Web Store) has no bridge to ask, and if the
    // injection is refused anyway the answer is false and the recording carries on with the next ordinary page.
    const tabId = sender.tab?.id;
    stored('recording').then(({ recording }) => {
      if (!records(recording, tabId) || sender.frameId !== 0 || sender.tab?.incognito) return false;
      return chrome.scripting.executeScript({ target: { tabId }, files: ['vendor/rrweb.js', 'vendor/page.js'], world: 'MAIN', injectImmediately: true }).then(() => true);
    }).then(respond, (err) => { console.warn('rostrum: could not inject the recorder', err?.message); respond(false); });
    return true;
  }
  if (msg?.ct !== 'assets' && msg?.ct !== 'events') return;
  // A batch joins only from the recorded tab's top frame, under the recording's own id, while the recording runs;
  // the tab just left (a tab switch, a pause, Stop) may finish sending for a moment (state.mjs `accepts`). Judged
  // by when the batch arrived, against what this worker stored, never by what the page says of itself.
  const at = Date.now();
  stored(['recording', 'flushing', 'unsent', 'lastSent']).then((v) => {
    if (sender.tab?.incognito || !accepts(v, { id: msg.id, tabId: sender.tab?.id, frameId: sender.frameId }, at)) return respond(false);
    if (msg.ct === 'assets') {
      if (!Array.isArray(msg.urls)) return respond(false);
      for (const url of msg.urls.slice(0, 500)) {
        if (typeof url !== 'string' || !/^https?:\/\//i.test(url) || seen.has(msg.id + ' ' + url)) continue;
        seen.add(msg.id + ' ' + url);
        chain = chain.then(() => storeAsset(msg.id, url, sender.origin)).catch((err) => console.warn('rostrum: asset skipped', url, err));
      }
      return chain.then(() => respond(true)); // answered when these are done, which keeps the worker alive until then
    }
    if (!Array.isArray(msg.events)) return respond(false);
    // proof of life: this tab's page is arriving, and the recording has something of a page in it
    if (life?.id === msg.id && life.tabId === sender.tab.id) life.batches++;
    if (tookBatch(v.recording, msg.id, sender.tab.id) !== v.recording) change((r) => tookBatch(r, msg.id, sender.tab.id));
    else if (!v.recording && v.lastSent?.id === msg.id && v.lastSent.captured === false) chrome.storage.local.set({ lastSent: { ...v.lastSent, captured: true } }); // its only batch came with Stop
    const pauses = pausesOf(v, msg.id);
    chain = chain.then(() =>
      fetch(HELPER + encodeURIComponent(msg.id) + '/events' + (pauses ? '?pauses=' + pauses : ''), { method: 'POST', body: JSON.stringify(msg.events) })
        .then((r) => respond(r.ok), (err) => { console.warn('rostrum: batch dropped', err); respond(false); }));
  }, () => respond(false));
  return true; // respond asynchronously
});
