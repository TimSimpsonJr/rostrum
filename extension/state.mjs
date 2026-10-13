// The recorder's state, pure: used by the worker (which owns storage), the popup (which only draws) and the tests.
// A recording is { id, phase, armedAt, startedAt, tabId, segments }. Time is the recorder's wall clock (Date.now()),
// the same clock the page's rrweb events and the microphone's t0 carry, so the helper can line everything up and take
// the pauses out (tools/segments.mjs).
export const COUNTDOWN_MS = 3000;
const SENT_FOR_MS = 60 * 60 * 1000;

/** The press on Ready: a countdown starts; nothing is recorded yet. */
export const arm = (now, tabId) => ({ id: `rec-${now}`, phase: 'countdown', armedAt: now, startedAt: null, tabId, segments: [] });
/** 3, 2, 1 during the countdown; 0 when it is over. */
export const countdownAt = (r, now) => Math.max(0, Math.ceil((r.armedAt + COUNTDOWN_MS - now) / 1000));
/** The countdown ends: the first segment opens. */
export const begin = (r, now) => (r && r.phase === 'countdown' ? { ...r, phase: 'recording', startedAt: now, segments: [{ from: now, to: null }] } : r);
/** A press during the countdown: nothing was recorded, nothing is kept. Later presses are stop, not cancel. */
export const cancel = (r) => (r && r.phase === 'countdown' ? null : r);
export const pause = (r, now) => (r && r.phase === 'recording' ? { ...r, phase: 'paused', segments: close(r.segments, now) } : r);
/** Carry on: a new segment opens, on the tab then in front (`tabId`; -1 = no tab, nothing is recorded until one comes to the front). */
export const resume = (r, now, tabId = r?.tabId) => (r && r.phase === 'paused' ? { ...placed(r, tabId), phase: 'recording', segments: [...r.segments, { from: now, to: null }] } : r);
// on a new tab the question of whether its page is being captured starts again (see "proof of life" below)
const placed = (r, tabId) => { const { noPage, ...rest } = r; return { ...rest, tabId }; };

// ── which tab is recorded ──
// One tab at a time: the active tab of the focused ordinary Chrome window, and only while the phase is 'recording'.
// During the countdown and a pause no tab is recorded and none is followed. A private (incognito) tab is never recorded.
/** The id to record for the tab Chrome says is in front ({ id, incognito }): -1 (no tab) for a private tab or none. */
export const tabOf = (tab) => (tab && !tab.incognito && Number.isInteger(tab.id) ? tab.id : -1);
/** The tab in front changed. Only a running recording moves; when Chrome cannot say which tab is in front (`tab`
 *  absent: a developer-tools or app window has the focus) it stays where it is; a private tab in front records nothing. */
export const follow = (r, tab) => (r?.phase === 'recording' && tab && r.tabId !== tabOf(tab) ? placed(r, tabOf(tab)) : r);
/** Is this tab's page being recorded right now? What injection and every 'start' are checked against. */
export const records = (r, tabId) => r?.phase === 'recording' && Number.isInteger(tabId) && tabId >= 0 && r.tabId === tabId;

// ── what may join the recording ──
// A page's last batch is sent just after it is told to stop (a tab switch, a pause, Stop). The tab that was being
// recorded may finish sending for GRACE_MS, and nothing after that.
export const GRACE_MS = 2000;
/** After a change from `before` to `after`: the tab that stopped being recorded and until when it may still send, or null. */
export const leaving = (before, after, now) => (before?.phase === 'recording' && before.tabId >= 0 && !(after?.id === before.id && records(after, before.tabId)) ? { id: before.id, tabId: before.tabId, until: now + GRACE_MS } : null);
/** May a batch (events or asset addresses) from this sender join? `stored` is { recording, flushing } from storage;
 *  `from` is { id (what the batch claims), tabId, frameId (Chrome's word for where it came from) }. */
export function accepts({ recording, flushing }, { id, tabId, frameId }, now) {
  if (frameId !== 0 || typeof id !== 'string' || !Number.isInteger(tabId)) return false;
  if (recording?.id === id && records(recording, tabId)) return true;
  return !!flushing && flushing.id === id && flushing.tabId === tabId && now <= flushing.until;
}
/** How many pauses a recording has been resumed from: sent with its events, so the helper knows a recording had
 *  pauses even if where they were never arrives. `unsent` is { [id]: segments } still to be confirmed by the helper. */
export const pausesOf = ({ recording, unsent }, id) => Math.max(0, ((recording?.id === id ? recording.segments : unsent?.[id]) ?? []).length - 1);
const close =(segments, now) => segments.map((s) => (s.to === null ? { from: s.from, to: now } : s));
/** Stop: the segments closed, how long was recorded, and whether anything of a page was captured. Null when nothing was recorded. */
export function stop(r, now) {
  if (!r || r.phase === 'countdown') return null;
  const segments = close(r.segments, now);
  return { id: r.id, seconds: Math.round(segments.reduce((ms, s) => ms + (s.to - s.from), 0) / 100) / 10, segments, captured: r.captured === true };
}
/** Recorded time so far: the closed segments plus the open one up to now. The clock stops while paused. */
export const elapsedMs = (r, now) => (r?.segments ?? []).reduce((ms, s) => ms + ((s.to ?? now) - s.from), 0);
const mmss = (ms) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
export const withMic = (mic) => mic === 'granted';
const spoken = (seconds) => {
  const whole = Math.round(seconds), m = Math.floor(whole / 60), s = whole % 60;
  return [m ? `${m} minute${m === 1 ? '' : 's'}` : '', s || !m ? `${s} second${s === 1 ? '' : 's'}` : ''].filter(Boolean).join(' ');
};

export const NOT_CAPTURED = 'This page is not being captured. Reload the page, then it will be.';
export const CANNOT_RECORD = 'This kind of page can\'t be recorded. Switch to a normal web page.';
/** What the popup shows: { state, count?, clock?, warn?, dim?, captured? }. `warn` is a line to show instead of the usual one
 *  while recording (`dim`: said quietly, since nothing has gone wrong); state 'empty' is a recording that ended with nothing of a page in it (never "Sent").
 * `mic` is the permission state ('granted' | 'prompt' | 'denied'). */
export function popupState({ helperUp, mic, recording, lastSent, now }) {
  if (!helperUp) return { state: 'notConnected' };
  if (recording?.phase === 'countdown') return { state: 'countdown', count: countdownAt(recording, now) };
  if (recording?.phase === 'recording') return { state: 'recording', clock: mmss(elapsedMs(recording, now)), warn: recording.noPage === 'kind' ? CANNOT_RECORD : recording.noPage ? NOT_CAPTURED : null, dim: recording.noPage === 'kind' };
  if (recording?.phase === 'paused') return { state: 'paused', clock: mmss(elapsedMs(recording, now)) };
  if (!withMic(mic)) return { state: 'micOff' };
  if (lastSent && now - lastSent.at < SENT_FOR_MS && lastSent.captured === false) return { state: 'empty', captured: `Nothing was captured from the page.${lastSent.withMic ? ' Your narration was saved, but there is no screen to go with it.' : ''}` };
  if (lastSent && now - lastSent.at < SENT_FOR_MS) return { state: 'sent', captured: `${spoken(lastSent.seconds)}, ${lastSent.withMic ? 'with your narration' : 'without narration'}. The script comes next, in Claude.` };
  return { state: 'ready' };
}

// ── what is in the popup, by state (the table in the design, section 1) ──
// Every part of popup.html that belongs to some states and not others, by its id. A part that is not listed for a
// state is not there at all (the `hidden` attribute): it cannot be seen, pressed or tabbed to. The record control and
// the header are always there. `cancel` lives inside s1, the "Allow microphone" button inside foot-mic, the microphone
// picker inside meter.
export const PARTS = ['mk', 'tick', 'icon-micoff', 'icon-play', 'big-off', 'big-mic', 'label', 'count', 'timer', 'sent', 'sub-off', 'sub-mic', 's0', 's1', 's2', 'sub-paused', 's3', 'pause', 'stop', 'foot-off', 'foot-mic', 'meter', 'again', 'warn', 'big-empty'];
const SHOWS = {
  loading: [],
  notConnected: ['big-off', 'sub-off', 'foot-off'],                // bare cap; "Rostrum is not open in Claude"; "Looking for Rostrum"
  micOff: ['icon-micoff', 'big-mic', 'sub-mic', 'foot-mic'],       // the mic-off mark; "Allow the microphone"; the Allow button
  ready: ['mk', 'label', 's0', 'meter'],                           // the dot; "Start recording"; the meter and the picker
  countdown: ['mk', 'label', 's0', 'count', 's1', 'meter'],        // label and s0 fade out as 3, 2, 1 and "Go to the page ... Cancel" come in
  recording: ['mk', 'timer', 's2', 'pause', 'meter'],              // the square; the time; "Press to stop"; Pause (which does the same)
  paused: ['icon-play', 'timer', 'sub-paused', 'stop', 'meter'],   // the play mark; the time held; "Send to Rostrum" (the only way to end); the meter flat
  sent: ['tick', 'sent', 's3', 'again'],                           // from Stopped: the ring comes on green, the check is drawn; "Sent to Rostrum"; "Record another"
};
SHOWS.empty = ['mk', 'big-empty', 's3', 'again'];                    // the plain dot; "Nothing to send"; what happened; "Record another"
const WARNED = ['mk', 'timer', 'warn', 'meter'];                     // recording, but the page is not being captured: the warning takes the place of the usual line and of Pause
export const shows = (state, warn = false) => (state === 'recording' && warn ? WARNED : SHOWS[state] ?? []);
/** What can be pressed besides the buttons that are simply there or not: the record control, and the picker (Ready only). */
export const pressable = (state) => ({ rec: ['ready', 'countdown', 'recording', 'paused', 'sent', 'empty'].includes(state), picker: state === 'ready' });
/** What a press on the big control asks of the worker. It never ends a recording: while recording it stops (pauses),
 *  like the Pause pill; stopped, it carries on. Ending is the "Send to Rostrum" pill, there only once stopped: two
 *  deliberate presses, so a slip on the control loses nothing. */
export const press = (state) => ({ ready: 'arm', sent: 'arm', empty: 'arm', countdown: 'cancel', recording: 'pause', paused: 'resume' })[state] ?? null;
/** The meter's label: it claims to hear only while sound has come from the microphone in the last SILENT_MS. */
export const SILENT_MS = 5000; // long enough that someone who has simply stopped talking is not nagged
export const hearing = (state, msSinceSound) => (state === 'paused' ? 'Not recording' : msSinceSound > SILENT_MS ? 'No sound from this microphone' : 'Hearing you');
/** The toolbar icon: the red ring only while a recording is running (not counting down, not paused) and its page is being captured. */
export const iconFor = (recording) => (recording?.phase === 'recording' && !recording.noPage ? 'rec' : 'idle');

// ── the microphone menu ──
// Chrome's device names, made readable: "Microphone (C922 Pro Stream Webcam) (046d:085c)" is the C922 Pro Stream
// Webcam. Chrome also lists the system's default and communications devices again under an alias ("Default - ...",
// "Communications - ..."): the default becomes the first row, "System default", saying which device that is now;
// an alias of a device that is listed plainly anyway is left out.
const ALIAS = /^(Default|Communications) - /;
/** A device name as the menu shows it. A name that fits none of the patterns is left as it is. */
export const micName = (label) => {
  const plain = String(label ?? '').replace(ALIAS, '').replace(/ \([0-9a-f]{4}:[0-9a-f]{4}\)$/i, '');
  return (plain.match(/^Microphone \((.+)\)$/)?.[1] ?? plain) || 'Microphone';
};
/** The menu's rows for Chrome's audio inputs ([{ deviceId, label }]): [{ deviceId, label, note? }]. The system
 *  default is { deviceId: 'default', label: 'System default', note: <the device it is now> }, first. */
export function micMenu(devices) {
  const isDefault = (d) => d.deviceId === 'default' || /^Default - /.test(d.label ?? '');
  const isAlias = (d) => isDefault(d) || d.deviceId === 'communications' || ALIAS.test(d.label ?? '');
  const plain = devices.filter((d) => !isAlias(d)).map((d) => ({ deviceId: d.deviceId, label: micName(d.label) }));
  const names = new Set(plain.map((r) => r.label));
  const main = devices.find(isDefault);
  const others = devices.filter((d) => isAlias(d) && !isDefault(d) && !names.has(micName(d.label))).map((d) => ({ deviceId: d.deviceId, label: micName(d.label) }));
  return [...(main ? [{ deviceId: 'default', label: 'System default', note: micName(main.label) }] : []), ...plain, ...others];
}
/** A row as one line of text: "System default · NVIDIA Broadcast". */
export const micRowText = (row) => (row.note ? `${row.label} · ${row.note}` : row.label);
/** The row in use: the one chosen (`chosen`, a device id, or nothing = the system default); failing that the one
 *  the popup is hearing (`heard`), failing that the first. */
export const micCurrent = (rows, chosen, heard) => rows.find((r) => r.deviceId === (chosen || 'default')) ?? rows.find((r) => r.deviceId === heard) ?? rows[0] ?? null;

// ── proof of life: is the page really being recorded? ──
// A tab's page is recorded through the bridge (the content script) in it. A tab that was open before the extension was
// installed or reloaded has no live bridge: Chrome does not put content scripts into tabs that are already open, and
// an old copy is cut off. So the worker asks the bridge of the tab it is to record whether it is there, puts one in
// if it is not, and then expects batches: a recorded page sends its first (the full snapshot) within a second.
/** Can this tab hold a bridge at all: an ordinary web page (http or https), not private. */
export const holdsBridge = (tab) => !!tab && !tab.incognito && Number.isInteger(tab.id) && /^https?:\/\//i.test(tab.url ?? '');
/** What to do about a tab's bridge: 'none' (it cannot have one), 'ok' (it answered), 'inject' (no answer: put one in
 *  and ask again), 'dead' (put in, and still no answer). */
export const bridgeStep = (tab, answered, injected) => (!capturable(tab) ? 'none' : answered ? 'ok' : injected ? 'dead' : 'inject');
/** Can this tab's page be recorded at all? Not Chrome's own pages, other extensions' pages or files (no bridge can
 *  go there), not the Chrome Web Store (Chrome keeps extensions out), not a PDF (Chrome's viewer is not a page). */
export const capturable = (tab) => holdsBridge(tab) && !/^https?:\/\/(chromewebstore\.google\.com|chrome\.google\.com\/webstore)([/?#]|$)/i.test(tab.url) && !/\.pdf([?#]|$)/i.test(tab.url);
/** The tab in front is one that cannot be recorded: the recording says so (nothing has failed; the popup explains). */
export const cannot = (r, id, tabId) => (r?.id === id && r.phase === 'recording' && r.tabId === tabId && r.noPage !== 'kind' ? { ...r, noPage: 'kind' } : r);
export const LIFE_RETRY_MS = 3000, LIFE_GIVE_UP_MS = 6000;
/** `ms` after a tab became the recorded one, with `batches` taken from it since: 'ok', 'wait', 'retry' (see to its
 *  bridge once more) or 'noPage' (say so in the popup). */
export const proof = (ms, batches) => (batches > 0 ? 'ok' : ms >= LIFE_GIVE_UP_MS ? 'noPage' : ms >= LIFE_RETRY_MS ? 'retry' : 'wait');
/** Nothing has come from the recorded tab: the recording says so (the popup warns, the toolbar icon goes neutral). */
export const lost = (r, id, tabId) => (r?.id === id && records(r, tabId) && !r.noPage ? { ...r, noPage: true } : r);
/** A batch was taken for recording `id` from tab `tabId`: the recording has captured something, and if it came from
 *  the recorded tab, that page is being captured after all. Unchanged when there is nothing new to note. */
export function tookBatch(r, id, tabId) {
  if (!r || r.id !== id) return r;
  const here = records(r, tabId) && r.noPage;
  if (r.captured && !here) return r;
  const { noPage, ...rest } = r;
  return { ...(here ? rest : r), captured: true };
}
