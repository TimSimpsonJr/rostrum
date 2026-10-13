// The recorder's state machine: every transition, cancel in the countdown, segments across pauses, what the popup shows.
import test from 'node:test';
import assert from 'node:assert/strict';
import { COUNTDOWN_MS, GRACE_MS, arm, begin, cancel, pause, resume, stop, elapsedMs, countdownAt, popupState, withMic, tabOf, follow, records, leaving, accepts, pausesOf, PARTS, shows, pressable, hearing, SILENT_MS, iconFor, micName, micMenu, micRowText, micCurrent, holdsBridge, bridgeStep, proof, lost, tookBatch, LIFE_RETRY_MS, LIFE_GIVE_UP_MS, NOT_CAPTURED, CANNOT_RECORD, capturable, cannot, press } from './state.mjs';

const T0 = 1_760_000_000_000;

test('only a running recording follows the tab in front; never a private tab; paused and counting down, nothing moves', () => {
  const counting = arm(T0, 5), on = begin(counting, T0 + 3000), held = pause(on, T0 + 9000);
  assert.deepEqual([tabOf({ id: 7, incognito: false }), tabOf({ id: 7, incognito: true }), tabOf(undefined), tabOf({})], [7, -1, -1, -1]);
  assert.equal(follow(on, { id: 7, incognito: false }).tabId, 7);
  assert.equal(follow(on, { id: 5, incognito: false }), on);         // the same tab: unchanged
  assert.equal(follow(on, { id: 8, incognito: true }).tabId, -1);    // a private tab in front: no tab is recorded
  assert.equal(follow(on, undefined), on);                           // Chrome cannot say which tab: it stays
  assert.equal(follow(held, { id: 7, incognito: false }), held);     // paused: nothing is followed
  assert.equal(follow(counting, { id: 7, incognito: false }), counting);
  assert.equal(follow(null, { id: 7, incognito: false }), null);
  // carrying on records the tab then in front, not the one the pause began on
  assert.equal(resume(held, T0 + 20_000, 7).tabId, 7);
  assert.equal(resume(held, T0 + 20_000, -1).tabId, -1);
  assert.equal(resume(held, T0 + 20_000).tabId, 5);
});

test('a page is recorded (injected, started) only in the one tab of a running recording', () => {
  const counting = arm(T0, 5), on = begin(counting, T0 + 3000);
  assert.equal(records(on, 5), true);
  assert.equal(records(on, 6), false);
  assert.equal(records(counting, 5), false);
  assert.equal(records(pause(on, T0 + 9000), 5), false);
  assert.equal(records(null, 5), false);
  assert.equal(records(on, undefined), false);
  assert.equal(records(follow(on, { id: 8, incognito: true }), -1), false); // "no tab" is not a tab
});

test('a batch joins only from the recorded tab\'s top frame, under the recording\'s id, while it runs; the tab just left may finish for a moment', () => {
  const on = begin(arm(T0, 5), T0 + 3000), now = T0 + 10_000, from = { id: on.id, tabId: 5, frameId: 0 };
  const none = { recording: on, flushing: null };
  assert.equal(accepts(none, from, now), true);
  assert.equal(accepts(none, { ...from, tabId: 6 }, now), false);              // another tab
  assert.equal(accepts(none, { ...from, frameId: 3 }, now), false);            // a frame inside the page
  assert.equal(accepts(none, { ...from, id: 'rec-1' }, now), false);           // another recording's id
  assert.equal(accepts(none, { ...from, id: undefined }, now), false);
  assert.equal(accepts(none, { ...from, tabId: undefined }, now), false);      // not from a tab at all
  assert.equal(accepts({ recording: arm(T0, 5), flushing: null }, { ...from, id: `rec-${T0}` }, T0 + 100), false); // counting down
  // paused: refused, but for the moment after the pause the page's last batch is taken
  const held = pause(on, now), gone = leaving(on, held, now);
  assert.deepEqual(gone, { id: on.id, tabId: 5, until: now + GRACE_MS });
  assert.equal(accepts({ recording: held, flushing: null }, from, now + 10), false);
  assert.equal(accepts({ recording: held, flushing: gone }, from, now + GRACE_MS), true);
  assert.equal(accepts({ recording: held, flushing: gone }, from, now + GRACE_MS + 1), false);
  // a tab switch: the old tab for the moment, the new tab from then on, the old tab never again after it
  const moved = follow(on, { id: 7, incognito: false }), left = leaving(on, moved, now);
  assert.equal(accepts({ recording: moved, flushing: left }, from, now + 500), true);
  assert.equal(accepts({ recording: moved, flushing: left }, { ...from, tabId: 7 }, now + 500), true);
  assert.equal(accepts({ recording: moved, flushing: left }, from, now + 60_000), false);
  assert.equal(accepts({ recording: moved, flushing: left }, { ...from, tabId: 9 }, now + 500), false);
  assert.equal(accepts({ recording: moved, flushing: left }, { ...from, frameId: 1 }, now + 500), false); // the moment is the top frame's too
  // Stop: the recording is gone; its tab may finish, then nothing
  const stopped = leaving(on, null, now);
  assert.equal(accepts({ recording: null, flushing: stopped }, from, now + 1000), true);
  assert.equal(accepts({ recording: null, flushing: stopped }, from, now + GRACE_MS + 1), false);
  assert.equal(accepts({ recording: null, flushing: null }, from, now), false);
  // nothing is owed to a tab that was not being recorded
  assert.equal(leaving(held, null, now), null);
  assert.equal(leaving(on, on, now), null);
  assert.equal(leaving(arm(T0, 5), null, now), null);
});

test('how many pauses a recording was resumed from, live or still waiting to be confirmed', () => {
  const on = begin(arm(T0, 5), T0 + 3000), held = pause(on, T0 + 9000), again = resume(held, T0 + 12_000);
  assert.equal(pausesOf({ recording: on }, on.id), 0);
  assert.equal(pausesOf({ recording: held }, on.id), 0);   // paused, nothing after it yet
  assert.equal(pausesOf({ recording: again }, on.id), 1);
  assert.equal(pausesOf({ recording: null, unsent: { [on.id]: stop(again, T0 + 20_000).segments } }, on.id), 1);
  assert.equal(pausesOf({ recording: null, unsent: {} }, on.id), 0);
});

test('arm, then begin after the countdown: one open segment from the start', () => {
  const r = arm(T0, 5);
  assert.deepEqual(r, { id: `rec-${T0}`, phase: 'countdown', armedAt: T0, startedAt: null, tabId: 5, segments: [] });
  assert.equal(countdownAt(r, T0 + 100), 3);
  assert.equal(countdownAt(r, T0 + 1100), 2);
  assert.equal(countdownAt(r, T0 + 2900), 1);
  assert.equal(countdownAt(r, T0 + COUNTDOWN_MS), 0);
  const on = begin(r, T0 + COUNTDOWN_MS);
  assert.deepEqual(on, { ...r, phase: 'recording', startedAt: T0 + COUNTDOWN_MS, segments: [{ from: T0 + COUNTDOWN_MS, to: null }] });
  assert.equal(begin(on, T0 + 9000), on); // already recording: unchanged
  assert.equal(elapsedMs(on, T0 + COUNTDOWN_MS + 4000), 4000);
});

test('cancel during the countdown leaves nothing; after it, nothing changes', () => {
  const r = arm(T0, 5), on = begin(r, T0 + 3000);
  assert.equal(cancel(r), null);
  assert.equal(cancel(on), on);
  assert.equal(cancel(null), null);
});

test('pause closes the segment and stops the clock; resume opens a new one; the gap is left out', () => {
  const on = begin(arm(T0, 5), T0 + 3000);
  const p = pause(on, T0 + 10_000);
  assert.deepEqual(p.segments, [{ from: T0 + 3000, to: T0 + 10_000 }]);
  assert.equal(p.phase, 'paused');
  assert.equal(elapsedMs(p, T0 + 60_000), 7000);
  assert.equal(pause(p, T0 + 11_000), p);
  const r = resume(p, T0 + 20_000);
  assert.deepEqual(r.segments, [{ from: T0 + 3000, to: T0 + 10_000 }, { from: T0 + 20_000, to: null }]);
  assert.equal(r.phase, 'recording');
  assert.equal(elapsedMs(r, T0 + 25_000), 12_000);
  assert.equal(resume(r, T0 + 26_000), r);
  const counting = arm(T0, 5);
  assert.equal(pause(counting, T0 + 1000), counting); // not in the countdown
});

test('stop closes the open segment and answers what was recorded', () => {
  const on = resume(pause(begin(arm(T0, 5), T0 + 3000), T0 + 10_000), T0 + 20_000);
  const done = stop(on, T0 + 31_500);
  assert.deepEqual(done, { id: `rec-${T0}`, seconds: 18.5, segments: [{ from: T0 + 3000, to: T0 + 10_000 }, { from: T0 + 20_000, to: T0 + 31_500 }], captured: false });
  assert.equal(stop({ ...on, captured: true }, T0 + 31_500).captured, true);
  const fromPause = stop(pause(on, T0 + 25_000), T0 + 40_000);
  assert.equal(fromPause.seconds, 12);
  assert.equal(stop(arm(T0, 5), T0 + 1000), null); // nothing recorded yet
});

test('what the popup shows, in order of what matters most', () => {
  const now = T0 + 5000, on = begin(arm(T0, 5), T0 + 3000);
  assert.equal(popupState({ helperUp: false, mic: 'granted', recording: on, lastSent: null, now }).state, 'notConnected');
  assert.equal(popupState({ helperUp: true, mic: 'prompt', recording: null, lastSent: null, now }).state, 'micOff');
  assert.equal(popupState({ helperUp: true, mic: 'denied', recording: null, lastSent: null, now }).state, 'micOff');
  assert.equal(popupState({ helperUp: true, mic: 'granted', recording: null, lastSent: null, now }).state, 'ready');
  const c = popupState({ helperUp: true, mic: 'granted', recording: arm(T0, 5), lastSent: null, now: T0 + 1200 });
  assert.deepEqual([c.state, c.count], ['countdown', 2]);
  const r = popupState({ helperUp: true, mic: 'granted', recording: on, lastSent: null, now: T0 + 3000 + 102_000 });
  assert.deepEqual([r.state, r.clock], ['recording', '1:42']);
  const p = popupState({ helperUp: true, mic: 'granted', recording: pause(on, T0 + 3000 + 102_000), lastSent: null, now: T0 + 999_999 });
  assert.deepEqual([p.state, p.clock], ['paused', '1:42']);
  const s = popupState({ helperUp: true, mic: 'granted', recording: null, lastSent: { id: 'x', seconds: 128, withMic: true, at: now - 1000 }, now });
  assert.deepEqual([s.state, s.captured], ['sent', '2 minutes 8 seconds, with your narration. The script comes next, in Claude.']);
  const quiet = popupState({ helperUp: true, mic: 'granted', recording: null, lastSent: { id: 'x', seconds: 41, withMic: false, at: now - 1000 }, now });
  assert.equal(quiet.captured, '41 seconds, without narration. The script comes next, in Claude.');
  assert.equal(popupState({ helperUp: true, mic: 'granted', recording: null, lastSent: { id: 'x', seconds: 1, withMic: true, at: now - 3_600_001 }, now }).state, 'ready'); // an hour old: forgotten
  // the helper outranks everything; a running recording outranks the microphone question
  assert.equal(popupState({ helperUp: false, mic: 'prompt', recording: null, lastSent: null, now }).state, 'notConnected');
  assert.equal(popupState({ helperUp: true, mic: 'prompt', recording: on, lastSent: null, now }).state, 'recording');
});

test('a recording counts as narrated when the microphone was allowed when it started', () => {
  assert.equal(withMic('granted'), true);
  assert.equal(withMic('prompt'), false);
});

test('each state shows exactly its own controls (the design table), and nothing of another state', () => {
  const table = {
    notConnected: ['big-off', 'sub-off', 'foot-off'],
    micOff: ['icon-micoff', 'big-mic', 'sub-mic', 'foot-mic'],
    ready: ['mk', 'label', 's0', 'meter'],
    countdown: ['mk', 'label', 's0', 'count', 's1', 'meter'],
    recording: ['mk', 'timer', 's2', 'pause', 'meter'],
    paused: ['icon-play', 'timer', 'sub-paused', 'stop', 'meter'],
    sent: ['tick', 'sent', 's3', 'again'],
    empty: ['mk', 'big-empty', 's3', 'again'],
  };
  for (const [state, parts] of Object.entries(table)) {
    assert.deepEqual([...shows(state)].sort(), [...parts].sort(), state);
    for (const p of parts) assert.ok(PARTS.includes(p), `${state}: ${p} is a part`);
  }
  assert.deepEqual(shows('loading'), []);
  // Pause exists only while recording, Stop and send only while paused, Record another only when sent
  const where = (part) => Object.keys(table).filter((s) => shows(s).includes(part));
  assert.deepEqual(where('pause'), ['recording']);
  assert.deepEqual(where('stop'), ['paused']);
  assert.deepEqual(where('again'), ['sent', 'empty']);
  // recording with the page not being captured: the warning stands where the usual line and Pause were
  assert.deepEqual([...shows('recording', true)].sort(), ['meter', 'mk', 'timer', 'warn']);
  assert.deepEqual(shows('ready', true), shows('ready'));
  assert.deepEqual(where('foot-mic'), ['micOff']);
  assert.deepEqual(where('s1'), ['countdown']); // Cancel
  assert.deepEqual(where('meter'), ['ready', 'countdown', 'recording', 'paused']);
  assert.deepEqual(where('tick'), ['sent']);
  // every part belongs to at least one state
  for (const p of PARTS) assert.ok(where(p).length || p === 'warn', p);
  // the control cannot be pressed when there is nothing it could do; the picker is live only in Ready
  assert.deepEqual(['loading', 'notConnected', 'micOff', 'ready', 'countdown', 'recording', 'paused', 'sent'].map((s) => pressable(s).rec), [false, false, false, true, true, true, true, true]);
  assert.equal(pressable('empty').rec, true);
  assert.deepEqual(Object.keys(table).filter((s) => pressable(s).picker), ['ready']);
});

test('the meter says it hears only while sound is coming; the toolbar icon is red only while recording', () => {
  assert.equal(hearing('ready', 0), 'Hearing you');
  assert.equal(hearing('ready', SILENT_MS), 'Hearing you');
  assert.equal(hearing('ready', SILENT_MS + 1), 'No sound from this microphone');
  assert.equal(hearing('recording', 60_000), 'No sound from this microphone');
  assert.equal(hearing('paused', 0), 'Not recording');
  const on = begin(arm(T0, 5), T0 + 3000);
  assert.deepEqual([iconFor(null), iconFor(arm(T0, 5)), iconFor(on), iconFor(pause(on, T0 + 9000))], ['idle', 'idle', 'rec', 'idle']);
});

test('the microphone menu: readable names, the aliases folded away, the system default first', () => {
  // the five names from the owner's Chrome, as Chrome lists them
  const devices = [
    { deviceId: 'default', label: 'Default - Microphone (NVIDIA Broadcast)' },
    { deviceId: 'communications', label: 'Communications - Microphone (C922 Pro Stream Webcam) (046d:085c)' },
    { deviceId: 'c922', label: 'Microphone (C922 Pro Stream Webcam) (046d:085c)' },
    { deviceId: 'nv', label: 'Microphone (NVIDIA Broadcast)' },
    { deviceId: 'fifine', label: 'Microphone (4- fifine Microphone) (3142:a010)' },
  ];
  const rows = micMenu(devices);
  assert.deepEqual(rows.map(micRowText), ['System default · NVIDIA Broadcast', 'C922 Pro Stream Webcam', 'NVIDIA Broadcast', '4- fifine Microphone']);
  assert.deepEqual(rows.map((r) => r.deviceId), ['default', 'c922', 'nv', 'fifine']);
  // the same, whatever order Chrome gives them in, and when the aliases are told only by their names
  const byName = [devices[2], devices[0], devices[3], devices[4], devices[1]].map((d, i) => ({ deviceId: `id${i}`, label: d.label }));
  assert.deepEqual(micMenu(byName).map(micRowText), ['System default · NVIDIA Broadcast', 'C922 Pro Stream Webcam', 'NVIDIA Broadcast', '4- fifine Microphone']);
  // names
  assert.equal(micName('Microphone (C922 Pro Stream Webcam) (046d:085c)'), 'C922 Pro Stream Webcam');
  assert.equal(micName('Microphone (4- fifine Microphone) (3142:a010)'), '4- fifine Microphone');
  assert.equal(micName('Headset (2- Some Buds)'), 'Headset (2- Some Buds)');       // not the wrapper: left alone
  assert.equal(micName('Line In (1234:abcd)'), 'Line In');
  assert.equal(micName('Stereo Mix (Realtek(R) Audio)'), 'Stereo Mix (Realtek(R) Audio)');
  assert.equal(micName(''), 'Microphone');                                         // Chrome gives no name before the microphone is allowed
  // an alias of a device that is not listed plainly is kept, by its name; no default listed, no default row
  assert.deepEqual(micMenu([{ deviceId: 'communications', label: 'Communications - Microphone (Desk Mic)' }, { deviceId: 'x', label: 'Microphone (Other)' }]).map(micRowText), ['Other', 'Desk Mic']);
  assert.deepEqual(micMenu([]), []);
  // which row is in use: the chosen one; nothing chosen, the system default; a chosen one that has gone, the one heard
  assert.equal(micCurrent(rows, 'fifine', 'nv').deviceId, 'fifine');
  assert.equal(micCurrent(rows, undefined, 'nv').deviceId, 'default');
  assert.equal(micCurrent(rows, 'unplugged', 'nv').deviceId, 'nv');
  assert.equal(micCurrent(rows, 'unplugged', 'gone').deviceId, 'default');
  assert.equal(micCurrent([], undefined, undefined), null);
});

test('which tabs can hold a bridge, and what to do when one does not answer', () => {
  const web = { id: 5, incognito: false, url: 'https://site.test/a' };
  assert.equal(holdsBridge(web), true);
  assert.equal(holdsBridge({ ...web, url: 'http://site.test/' }), true);
  for (const url of ['chrome://extensions', 'chrome-extension://abc/mic.html', 'file:///C:/a.html', 'about:blank', '', undefined]) assert.equal(holdsBridge({ ...web, url }), false, String(url));
  assert.equal(holdsBridge({ ...web, incognito: true }), false);
  assert.equal(holdsBridge(undefined), false);
  assert.equal(bridgeStep(web, true, false), 'ok');
  assert.equal(bridgeStep(web, false, false), 'inject');   // a tab from before the extension was reloaded
  assert.equal(bridgeStep(web, true, true), 'ok');         // put in, and it answers
  assert.equal(bridgeStep(web, false, true), 'dead');
  assert.equal(bridgeStep({ ...web, url: 'chrome://settings' }, false, false), 'none');
});

test('proof of life: no batch from the recorded tab after 3 s, try again; after 6 s, say so; a batch clears it', () => {
  assert.deepEqual([0, 2999, LIFE_RETRY_MS, 5999, LIFE_GIVE_UP_MS, 60_000].map((ms) => proof(ms, 0)), ['wait', 'wait', 'retry', 'retry', 'noPage', 'noPage']);
  assert.deepEqual([0, 3000, 6000].map((ms) => proof(ms, 1)), ['ok', 'ok', 'ok']);
  const on = begin(arm(T0, 5), T0 + 3000);
  const gone = lost(on, on.id, 5);
  assert.equal(gone.noPage, true);
  assert.equal(lost(on, on.id, 6), on);                    // the recording has moved to another tab since
  assert.equal(lost(on, 'rec-1', 5), on);
  assert.equal(lost(pause(on, T0 + 9000), on.id, 5).noPage, undefined);
  assert.equal(lost(gone, on.id, 5), gone);
  // the popup warns and the toolbar icon is neutral while nothing is captured
  const shown = popupState({ helperUp: true, mic: 'granted', recording: gone, lastSent: null, now: T0 + 10_000 });
  assert.deepEqual([shown.state, shown.warn], ['recording', NOT_CAPTURED]);
  assert.equal(NOT_CAPTURED, 'This page is not being captured. Reload the page, then it will be.');
  assert.equal(popupState({ helperUp: true, mic: 'granted', recording: on, lastSent: null, now: T0 + 10_000 }).warn, null);
  assert.deepEqual([iconFor(on), iconFor(gone)], ['rec', 'idle']);
  // a batch from the recorded tab: captured, and the warning goes; from the tab just left: captured, the warning stays
  assert.deepEqual([tookBatch(gone, on.id, 5).captured, tookBatch(gone, on.id, 5).noPage], [true, undefined]);
  assert.deepEqual([tookBatch(gone, on.id, 4).captured, tookBatch(gone, on.id, 4).noPage], [true, true]);
  const had = tookBatch(on, on.id, 5);
  assert.equal(tookBatch(had, on.id, 5), had);             // nothing new to note: unchanged, so nothing is written
  assert.equal(tookBatch(on, 'rec-1', 5), on);
  assert.equal(tookBatch(null, on.id, 5), null);
  // moving to another tab, or carrying on after a pause, asks the question afresh
  assert.equal(follow(gone, { id: 7, incognito: false }).noPage, undefined);
  assert.equal(resume(pause(had, T0 + 9000), T0 + 12_000, 7).captured, true);
});

test('a recording stopped with nothing of a page in it is never "Sent"', () => {
  const now = T0 + 5000, base = { helperUp: true, mic: 'granted', recording: null, now };
  const none = popupState({ ...base, lastSent: { id: 'x', seconds: 360, withMic: true, captured: false, at: now - 1000 } });
  assert.deepEqual([none.state, none.captured], ['empty', 'Nothing was captured from the page. Your narration was saved, but there is no screen to go with it.']);
  assert.equal(popupState({ ...base, lastSent: { id: 'x', seconds: 360, withMic: false, captured: false, at: now - 1000 } }).captured, 'Nothing was captured from the page.');
  assert.equal(popupState({ ...base, lastSent: { id: 'x', seconds: 360, withMic: true, captured: true, at: now - 1000 } }).state, 'sent');
  assert.equal(popupState({ ...base, lastSent: { id: 'x', seconds: 360, withMic: true, at: now - 1000 } }).state, 'sent'); // one sent by an earlier build
});

test('pages that can never be recorded are said to be so, quietly, and are not a failure', () => {
  const web = { id: 5, incognito: false, url: 'https://site.test/a' };
  assert.equal(capturable(web), true);
  for (const url of ['chrome://extensions/', 'chrome-extension://abc/page.html', 'https://chromewebstore.google.com/detail/x', 'https://chrome.google.com/webstore/detail/x', 'https://site.test/files/report.pdf', 'https://site.test/a.PDF?x=1', 'file:///C:/a.html'])
    assert.equal(capturable({ ...web, url }), false, url);
  assert.equal(capturable({ ...web, url: 'https://site.test/pdf-guide' }), true);
  assert.equal(capturable({ ...web, incognito: true }), false);
  assert.equal(bridgeStep({ ...web, url: 'https://chromewebstore.google.com/' }, false, false), 'none'); // nothing is put into it
  const on = begin(arm(T0, 5), T0 + 3000), kind = cannot(on, on.id, 5);
  assert.equal(kind.noPage, 'kind');
  assert.equal(cannot(kind, on.id, 5), kind);
  assert.equal(cannot(on, on.id, 6), on);
  assert.equal(cannot(pause(on, T0 + 9000), on.id, 5).noPage, undefined);
  assert.equal(cannot(follow(on, { id: 8, incognito: true }), on.id, -1).noPage, 'kind'); // a private tab in front
  assert.equal(lost(kind, on.id, 5), kind); // it is not turned into a failure later
  const shown = popupState({ helperUp: true, mic: 'granted', recording: kind, lastSent: null, now: T0 + 10_000 });
  assert.deepEqual([shown.state, shown.warn, shown.dim], ['recording', CANNOT_RECORD, true]);
  assert.equal(CANNOT_RECORD, "This kind of page can't be recorded. Switch to a normal web page.");
  assert.equal(popupState({ helperUp: true, mic: 'granted', recording: lost(on, on.id, 5), lastSent: null, now: T0 + 10_000 }).dim, false);
  assert.equal(iconFor(kind), 'idle');
  assert.equal(tookBatch(follow(kind, { id: 7, incognito: false }), on.id, 7).noPage, undefined); // back on a normal page
});

test('the big control never ends a recording: it stops (pauses) and carries on; sending is its own button, once stopped', () => {
  assert.deepEqual(['ready', 'countdown', 'recording', 'paused', 'sent', 'empty'].map(press), ['arm', 'cancel', 'pause', 'resume', 'arm', 'arm']);
  assert.deepEqual(['loading', 'notConnected', 'micOff'].map(press), [null, null, null]);
  assert.ok(!Object.values({ a: press('recording'), b: press('paused') }).includes('stop'));
  // the pill that ends it ("Send to Rostrum") exists only once stopped; Pause, which does what the control does, only while recording
  assert.ok(shows('paused').includes('stop') && !shows('recording').includes('stop'));
  assert.ok(shows('recording').includes('pause') && !shows('paused').includes('pause'));
});
