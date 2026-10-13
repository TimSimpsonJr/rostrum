// Isolated-world bridge: storage state -> page ('start'/'stop'), page event batches -> service worker.
// This is the only script the extension runs on every page, and on a page that is not being recorded it does nothing
// but learn that. The recorder itself (rrweb + the page script) is NOT on every page: when this tab is the recorded
// one, the bridge asks the worker to inject it here (chrome.scripting, MAIN world), on Start and again on each page
// load in this tab while the recording runs. The injected script announces { ct: 'ready' }, and the bridge answers
// with the state, so it does not matter which arrives first. __rostrum.start is idempotent.
// One tab at a time, the tab in front: the worker moves `recording.tabId` as the person switches tabs, and tells this
// script its own tab id (asked once, at load). Every sync waits for that answer, so 'start' is never posted before the
// tab is known to be the recorded one; no answer means never start. A tab that is no longer in front, or a recording
// that is paused, gets 'stop' (the page flushes and goes quiet); back in front or resumed, 'start' again, which takes
// a fresh full snapshot. Nothing is injected or started during the countdown or a pause.
// The page is untrusted: batches are forwarded only for a recording this bridge saw in storage, under the stored id
// (never the page's). `id` outlives 'stop' by a moment on purpose, so the page's final flush still gets out; then it
// is forgotten, and this bridge forwards nothing more (the worker refuses a late batch too: state.mjs `accepts`).
//
// Twice in one page: Chrome puts this script into pages as they load, and the worker also puts it (the same file,
// chrome.scripting, this isolated world, the top frame) into a tab that was already open when the extension was
// installed or reloaded, where Chrome does not. A copy that finds a live one already here does nothing. A copy whose
// extension has been reloaded under it is cut off from the extension for good ("Extension context invalidated"): it
// notices at its next use of chrome.*, goes quiet, and makes way for the new copy.
(() => {
  const connected = () => { try { return !!chrome.runtime?.id; } catch { return false; } };
  const before = window.__rostrumBridge; // this world's own window: the page cannot see or set it
  if (before?.alive()) return;
  before?.quit();

  const GRACE_MS = 2000; // as extension/state.mjs
  let id = null;
  let forgetting = null; // the timer that drops `id` after 'stop'
  let injected = false; // once per document: the recorder is put into this page at most once
  let over = false;
  const quit = () => { over = true; id = null; clearTimeout(forgetting); removeEventListener('message', heard); };
  window.__rostrumBridge = { alive: () => !over && connected(), quit };
  // every use of chrome.* goes through here: null when the worker does not answer, and the end of this copy when the
  // extension is no longer the one that put it here
  const ask = async (use) => { try { return await use(); } catch { if (!connected()) quit(); return null; } };
  const tell = (msg) => ask(() => chrome.runtime.sendMessage(msg));

  const isHttpUrl = (u) => typeof u === 'string' && u.length <= 2048 && /^https?:\/\//i.test(u);
  const myTab = window === window.top ? tell({ ct: 'whoami' }) : Promise.resolve(null); // the top page only, as before
  const sync = async () => {
    const [tabId, stored] = await Promise.all([myTab, ask(() => chrome.storage.local.get('recording'))]);
    if (over || !stored) return;
    const { recording } = stored;
    // recorded only while the recording is running and this is its tab (state.mjs `records`; the worker checks the same)
    const live = recording?.phase === 'recording' && Number.isInteger(tabId) && recording.tabId === tabId;
    if (live) { id = recording.id; clearTimeout(forgetting); forgetting = null; }
    if (live && !injected) {
      injected = true;
      // the worker checks again that this tab is the recorded one before it injects anything
      const ok = await tell({ ct: 'inject' });
      if (!ok) injected = false;
      return; // the injected script says 'ready', which brings us back here to post 'start'
    }
    // a page that was never recorded hears nothing from the bridge at all
    if (live) window.postMessage({ ct: 'start', id }, location.origin);
    else if (id) {
      window.postMessage({ ct: 'stop' }, location.origin);
      forgetting ??= setTimeout(() => { id = null; forgetting = null; }, GRACE_MS);
    }
  };

  function heard(e) {
    if (e.source !== window || !e.data) return;
    if (e.data.ct === 'ready') sync();
    else if (e.data.ct === 'events' && id && Array.isArray(e.data.events)) tell({ ct: 'events', id, events: e.data.events });
    // asset URLs the worker should fetch and store: at most 500 per message, http(s) strings only
    else if (e.data.ct === 'assets' && id && Array.isArray(e.data.urls) && e.data.urls.length <= 500 && e.data.urls.every(isHttpUrl)) tell({ ct: 'assets', id, urls: e.data.urls });
  }
  addEventListener('message', heard);
  try {
    chrome.storage.onChanged.addListener((changes, area) => { if (!over && area === 'local' && changes.recording) sync(); });
    // The worker asks whether a bridge is alive in the tab it is about to record (only this extension's worker can
    // reach this listener). Answering also looks at the state again.
    chrome.runtime.onMessage.addListener((msg, sender, respond) => {
      if (over || sender.id !== chrome.runtime.id || sender.tab || msg?.ct !== 'ping') return;
      respond('pong');
      sync();
    });
  } catch { quit(); }
  sync();
})();
