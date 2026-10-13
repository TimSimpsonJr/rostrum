// The narration section of the local page: the script with a copy button, the voice to use, the upload, and what the
// helper heard in the take. Everything shown is written as text (never as markup): the script and the transcript of
// the take are the author's words, not this page's.
'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const id = decodeURIComponent(location.pathname.split('/')[2] ?? '');
  const api = `/tutorials/${encodeURIComponent(id)}`;
  const TYPES = { mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', webm: 'audio/webm', flac: 'audio/flac' };
  const el = (tag, text, cls) => { const n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; };
  const secs = (s) => `${s.toFixed(2)} s`;
  let view = null, timer = null;

  $('review').href = `/review/${encodeURIComponent(id)}/`;

  async function load() {
    let r;
    try { r = await fetch(`${api}/narration`); } catch { return say('The helper is not answering. Is it still running?'); }
    if (!r.ok) return say(r.status === 404 ? 'There is no such tutorial.' : `The helper answered ${r.status}.`);
    view = await r.json();
    draw();
    clearTimeout(timer);
    if (view.busy) timer = setTimeout(load, 1500);
  }
  const say = (text) => { $('stage').textContent = text; $('stage').hidden = !text; };

  function draw() {
    const v = view;
    $('title').textContent = v.title ?? id;
    document.title = `${v.title ?? id}: Rostrum`;
    $('state').textContent = v.state;
    $('lines').replaceChildren(...v.lines.map((l) => el('li', l)));
    $('no-script').hidden = v.lines.length > 0;
    $('copy').disabled = !v.lines.length;
    const voice = v.brand?.voice;
    $('no-brand').hidden = !!voice;
    $('voice').replaceChildren();
    if (voice) for (const [k, label] of [['name', 'Voice'], ['model', 'Model'], ['speed', 'Speed'], ['stability', 'Stability'], ['similarity', 'Similarity']]) {
      if (voice[k] != null) $('voice').append(el('dt', label), el('dd', String(voice[k])));
    }
    const can = ['approved', 'voiced'].includes(v.state) && !v.busy && v.lines.length > 0;
    $('file').disabled = !can;
    say(v.busy ? { transcribe: 'Listening to the take...', time: 'Timing the take...' }[v.busy] ?? `Working: ${v.busy}...`
      : !['approved', 'voiced'].includes(v.state) ? (v.state === 'recorded' || v.state === 'scripted' ? 'The script is not approved yet: the narration comes after that.' : `This tutorial is ${v.state}: its narration is in.`)
      : v.error ? `${v.error.message}.` : '');
    const c = v.compare;
    $('result').hidden = !c;
    if (!c) return;
    $('verdict').textContent = c.ok ? `All ${c.lines} lines were said as written.` : 'Some lines were not said as written. Generate the voice again from the script, or use this take as it is.';
    $('differs').replaceChildren(
      ...c.differs.map((d) => { const li = el('li', `Line ${d.line + 1}: ${d.text}`); li.append(el('span', `Heard: ${d.heard}`, 'heard')); return li; }),
      ...c.missing.map((m) => el('li', `Line ${m + 1} was not spoken: ${v.lines[m] ?? ''}`)),
      ...c.extra.map((x) => { const li = el('li', 'Said, but not in the script:'); li.append(el('span', x, 'heard')); return li; }),
    );
    $('anyway').hidden = c.ok || v.state !== 'approved' || !!v.busy;
    const rows = (v.timing ?? []).map((s) => { const tr = el('tr'); tr.append(el('td', String(s.i + 1)), el('td', secs(s.start)), el('td', secs(s.end)), el('td', (v.lines[s.i] ?? '') + (s.silent ? ' (silent)' : ''))); return tr; });
    $('timing').hidden = !rows.length || v.state === 'approved';
    $('timing').tBodies[0].replaceChildren(...rows);
  }

  $('copy').addEventListener('click', async () => {
    const text = view.lines.join('\n\n');
    try { await navigator.clipboard.writeText(text); $('copied').textContent = 'Copied.'; }
    catch { $('copied').textContent = 'Could not copy: select the lines and copy them by hand.'; }
  });

  async function upload(file) {
    if (!file) return;
    const type = file.type && file.type.startsWith('audio/') ? file.type : TYPES[(file.name.split('.').pop() ?? '').toLowerCase()];
    if (!type) { $('upload-status').textContent = 'That is not an audio file.'; return; }
    if (file.size > 50 * 1024 * 1024) { $('upload-status').textContent = 'That file is over 50 MB.'; return; }
    $('upload-status').textContent = 'Sending...';
    let r;
    try { r = await fetch(`${api}/narration`, { method: 'POST', headers: { 'content-type': type }, body: file }); } catch { $('upload-status').textContent = 'The helper is not answering.'; return; }
    const j = await r.json().catch(() => ({}));
    $('upload-status').textContent = r.ok ? 'Received.' : `Not accepted: ${j.error ?? r.status}.`;
    $('file').value = '';
    load();
  }
  $('file').addEventListener('change', () => upload($('file').files[0]));
  const drop = $('drop');
  for (const ev of ['dragenter', 'dragover']) drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); });
  for (const ev of ['dragleave', 'drop']) drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); });
  drop.addEventListener('drop', (e) => { if (!$('file').disabled) upload(e.dataTransfer?.files?.[0]); });

  $('anyway').addEventListener('click', async () => {
    $('anyway').disabled = true;
    await fetch(`${api}/time`, { method: 'POST' }).catch(() => null);
    $('anyway').disabled = false;
    load();
  });

  load();
})();
