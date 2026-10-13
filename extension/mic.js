// Extension page, kept open in a pinned tab. While chrome.storage.local.recording is running it records the
// microphone (the one chosen in the popup, storage.local.micDeviceId, else the default), pausing with the recording,
// which leaves the gap out of the audio, and POSTs the chunks to the helper as recordings/<id>/mic.webm. t0 (the clock time the audio starts)
// goes with the first chunk, so the audio can be lined up with the rrweb event timestamps (same clock).
const HELPER = 'http://127.0.0.1:4600/session/';
const state = document.getElementById('state');
const note = document.getElementById('note');
const level = document.getElementById('level');
const BLOCKED = 'Allow the microphone for this page (the icon at the right of the address bar), then reload this tab.';
let live = null; // { id, stream, rec, ctx, meter } while recording

const show = (s, n = '') => { state.textContent = s; note.textContent = n; document.title = 'Rostrum mic: ' + s; };

// One chunk at a time, in order: each POST waits for the one before it. A failed POST is retried (a gap would
// corrupt the file); after 5 tries the chunk is given up and the page says so.
function sender(id, getT0) {
  let chain = Promise.resolve();
  let seq = 0;
  return (blob) => {
    const n = seq++;
    chain = chain.then(async () => {
      for (let attempt = 0; attempt < 5; attempt++) {
        const ok = await fetch(`${HELPER}${encodeURIComponent(id)}/audio?seq=${n}&t0=${getT0()}`, { method: 'POST', headers: { 'content-type': 'audio/webm' }, body: blob }).then((r) => r.ok, () => false);
        if (ok) return;
        await new Promise((r) => setTimeout(r, 500));
      }
      show(state.textContent, 'A piece of audio could not be sent to Rostrum. This recording\'s audio is incomplete.');
    });
  };
}

async function begin(id) {
  if (live) return;
  live = { id }; // claimed before the first await, so a second storage event cannot start a second recorder
  const { micDeviceId: deviceId } = await chrome.storage.local.get('micDeviceId');
  let stream;
  try {
    // the chosen microphone; if it has gone (unplugged), whichever Chrome gives
    stream = await navigator.mediaDevices.getUserMedia({ audio: deviceId ? { deviceId: { exact: deviceId } } : true }).catch((err) => { if (!deviceId) throw err; return navigator.mediaDevices.getUserMedia({ audio: true }); });
  } catch {
    if (live?.id === id) live = null;
    return show('blocked', BLOCKED);
  }
  // stopped, replaced or paused while the microphone was opening: let go of it (a paused one opens when it carries on)
  const { recording } = await chrome.storage.local.get('recording');
  if (live?.id !== id || recording?.id !== id || recording.phase !== 'recording') { if (live?.id === id) live = null; return stream.getTracks().forEach((t) => t.stop()); }
  let t0 = 0;
  const rec = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
  const send = sender(id, () => t0);
  rec.addEventListener('start', () => { t0 = Date.now(); show('recording'); });
  rec.addEventListener('dataavailable', (e) => { if (e.data.size) send(e.data); });
  rec.start(1000);

  // level meter, so it is plain that the microphone hears something
  const ctx = new AudioContext();
  const analyser = ctx.createAnalyser();
  ctx.createMediaStreamSource(stream).connect(analyser);
  const samples = new Float32Array(analyser.fftSize);
  const meter = setInterval(() => {
    analyser.getFloatTimeDomainData(samples);
    level.value = Math.min(1, Math.max(...samples.map(Math.abs)) * 2);
  }, 100);
  Object.assign(live, { stream, rec, ctx, meter });
}

// Only a running recording has sound in it. While it is paused the recorder is paused (the gap is left out of the
// file) AND the microphone's track is switched off, so nothing said during a pause can be in the file even if one of
// the two were to fail. During the countdown there is no recorder at all.
function hold(paused) {
  const { rec, stream } = live;
  if (paused && rec.state === 'recording') rec.pause();
  stream.getAudioTracks().forEach((t) => { t.enabled = !paused; });
  if (!paused && rec.state === 'paused') rec.resume();
}

function end() {
  if (!live) return;
  const { stream, rec, ctx, meter } = live;
  live = null;
  if (!rec) return; // still waiting for permission; begin() sees live changed and lets go of the stream
  rec.stop(); // fires one last dataavailable, which is sent like the others
  stream.getTracks().forEach((t) => t.stop());
  clearInterval(meter);
  ctx.close();
  level.value = 0;
  show('idle', 'Last recording stopped.');
}

async function sync() {
  const { recording } = await chrome.storage.local.get('recording');
  if (!recording || recording.phase === 'countdown') { if (!recording) end(); return; } // nothing is recorded during the count
  if (live?.id !== recording.id) {
    end();
    if (recording.phase !== 'recording') return; // this page opened during a pause: the microphone opens when it carries on
    await begin(recording.id);
    if (live?.rec) sync(); // the recording may have been paused or stopped while the microphone was opening
    return;
  }
  if (!live.rec) return; // still opening: the call above comes back here
  hold(recording.phase !== 'recording');
  const now = recording.phase === 'paused' ? 'paused' : 'recording';
  if (state.textContent !== now) show(now);
}

// First visit: ask for the microphone now, so the permission prompt does not appear in the middle of a recording.
async function probe() {
  try {
    (await navigator.mediaDevices.getUserMedia({ audio: true })).getTracks().forEach((t) => t.stop());
    if (!live) show('idle', 'Allowed. Press the record control in the Rostrum popup.');
  } catch { if (!live) show('blocked', BLOCKED); }
}

chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.recording) sync(); });
chrome.storage.local.get('recording').then(({ recording }) => (recording ? sync() : probe()));
