// The review page: one film, its versions, notes pinned to moments. Talks to server.mjs beside it and to the helper's
// send/approve/tutorial routes under the same /review/<id>/ prefix. Plain DOM, no dependencies.
import { statusLabel, countLine, versionsOf, keepTime, timecode, pinsOf, isDrag, pictureBox, regionOf, deleteQuestion } from './model.mjs';

const $ = (id) => document.getElementById(id);
const BASE = location.pathname.replace(/\/[^/]*$/, '');
const video = $('video');
const el = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (v === false || v == null) continue; if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? '' : v); } for (const kid of kids) if (kid != null) n.append(kid); return n; };
let versions = [], current = null, notes = [], tutorial = null, pendingSeek = 0, notesKey = '', said = null;

async function api(method, url, body) {
  let r;
  try { r = await fetch(BASE + url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined }); }
  catch { throw new Error('Rostrum is not running.'); }
  let json = null; try { json = await r.json(); } catch { /* not json */ }
  if (!r.ok) throw new Error(json?.error || `Rostrum answered ${r.status}`);
  return json;
}
function say(text, ms = 4000) { clearTimeout(said); $('said').textContent = text; said = setTimeout(() => { $('said').textContent = ''; }, ms); }

// ── time ──
const fps = () => current?.fps || 30;
const duration = () => (Number.isFinite(video.duration) && video.duration > 0 ? video.duration : current?.duration || 0);
const start = () => current?.start || 0;
const curFrame = () => Math.max(0, Math.floor((video.currentTime - start()) * fps() + 1e-4));
const maxFrame = () => (duration() ? Math.max(0, Math.round(duration() * fps()) - 1) : Infinity);
function seekFrame(frame) { const f = Math.min(maxFrame(), Math.max(0, Math.round(frame))); video.currentTime = start() + (f + 0.5) / fps(); update(); }
const frameOf = (t) => Math.min(maxFrame(), Math.max(0, Math.floor((keepTime(t, duration()) - start()) * fps() + 1e-4)));
function seekTime(t) { seekFrame(frameOf(t)); }
const isAt = (t) => curFrame() === frameOf(t); // the film is on the frame of that moment

// ── versions ──
function renderVersions() {
  const seg = $('versions'); seg.replaceChildren();
  for (const v of versions) seg.append(el('button', { type: 'button', role: 'tab', class: v.path === current?.path ? 'on' : '', 'aria-selected': String(v.path === current?.path), text: v.name, onclick: () => select(v.path, video.currentTime) }));
  if (current) {
    const d = new Date(current.mtime), today = d.toDateString() === new Date().toDateString();
    const when = `${today ? 'today' : d.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase()}`;
    $('built').textContent = `Version ${current.name.slice(1)}, built ${when}`;
  }
}
function select(path, at = 0) {
  const v = versions.find((x) => x.path === path); if (!v) return;
  current = v; pendingSeek = at;
  video.src = `${BASE}/video?path=${encodeURIComponent(path)}&v=${Math.round(v.mtime)}`;
  $('film-msg').hidden = true;
  history.replaceState(null, '', `#${v.name}`);
  renderVersions(); renderNotes(); update();
}
async function loadVersions() {
  const data = await api('GET', '/api/videos');
  versions = versionsOf(data.versions ?? []);
  if (current) { const fresh = versions.find((v) => v.path === current.path); if (fresh && fresh.mtime !== current.mtime) select(fresh.path, video.currentTime); else current = fresh ?? current; }
  renderVersions();
}

// ── the player ──
let shown = '';
function update() {
  const dur = duration(), f = curFrame(), key = `${current?.path}|${f}|${dur}`;
  if (key !== shown) { shown = key; $('tc').textContent = timecode(video.currentTime); $('dur').textContent = `/ ${timecode(dur)}`; $('at').textContent = timecode(video.currentTime); $('timeline').setAttribute('aria-valuemax', String(Math.round(dur))); $('timeline').setAttribute('aria-valuenow', String(Math.round(video.currentTime))); }
  const pos = dur ? Math.min(1, video.currentTime / dur) * 100 : 0;
  $('head').style.left = `${pos}%`; $('fill').style.width = `${pos}%`;
  if (draft && !isAt(draft.time)) draft = null;                  // the film moved on: the selection was for that moment
  if (openId && !(openNote() && isAt(openNote().time))) openId = null;
  if (openId !== listOpen) renderNotes();                        // the open note's row carries its Edit and Delete
  showArea(); markNear();
}
function tick() { if (video.paused) return; update(); requestAnimationFrame(tick); }
const togglePlay = () => { if (!current) return; if (video.paused) video.play().catch(() => {}); else video.pause(); };
const showPlay = () => { $('play').querySelector('use').setAttribute('href', video.paused ? '#i-play' : '#i-pause'); $('play').setAttribute('aria-label', video.paused ? 'Play' : 'Pause'); };
video.addEventListener('play', () => { showPlay(); draft = null; openId = null; update(); requestAnimationFrame(tick); });
video.addEventListener('pause', () => { showPlay(); if (!video.ended && !video.seeking) seekFrame(curFrame()); update(); });
video.addEventListener('emptied', showPlay); // a new source stops a playing film without a `pause` event
for (const ev of ['emptied', 'seeking', 'seeked', 'timeupdate', 'durationchange']) video.addEventListener(ev, update);
video.addEventListener('loadedmetadata', () => { seekTime(pendingSeek); pendingSeek = 0; shown = ''; renderPins(); update(); });
video.addEventListener('error', () => { if (current) { $('film-msg').textContent = 'This version cannot be played yet. It may still be rendering.'; $('film-msg').hidden = false; } });
$('play').addEventListener('click', togglePlay);

// ── a press on the film: a click plays or pauses, a drag marks a selection for a note ──
// A selection is a region of the frame ({ x, y, w, h } as fractions of the picture). It is drawn only while its note is
// open (being written, or opened from the list or a pin) and the film rests on that note's frame; never while it plays.
let draft = null;   // { region, time }: the selection of the note being written
let openId = null;  // the note that is open
let drawn;          // the rectangle under the pointer during a drag (null while it is too thin); undefined otherwise
const openNote = () => notes.find((n) => n.id === openId);
const picture = () => pictureBox(video.clientWidth, video.clientHeight, video.videoWidth, video.videoHeight);
const shownRegion = () => (drawn !== undefined ? drawn : !video.paused ? null : draft ? draft.region : openNote()?.region ?? null);
function showArea() {
  const r = shownRegion(), a = $('area'), b = picture();
  a.hidden = !r; a.classList.toggle('drawing', drawn !== undefined);
  if (r) for (const [k, v] of Object.entries({ left: b.x + r.x * b.w, top: b.y + r.y * b.h, width: r.w * b.w, height: r.h * b.h })) a.style[k] = `${v}px`;
}
video.parentElement.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || !current || e.target.closest('button')) return;
  const film = e.currentTarget, at = (ev) => { const r = video.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; };
  const from = at(e); let dragging = false;
  film.setPointerCapture(e.pointerId);
  const move = (ev) => {
    if (!dragging && !isDrag(from, at(ev))) return;
    if (!dragging) { dragging = true; if (!video.paused) video.pause(); }
    drawn = regionOf(from, at(ev), picture()); showArea();
  };
  const end = (ev) => {
    for (const [name, fn] of [['pointermove', move], ['pointerup', end], ['pointercancel', end]]) film.removeEventListener(name, fn);
    const region = drawn; drawn = undefined;
    if (ev.type === 'pointerup' && !dragging) togglePlay();
    else if (ev.type === 'pointerup' && region) {
      if (openNote()) change(openId, { region });                                     // the open note's selection, set or replaced
      else { draft = { region, time: video.currentTime }; $('text').focus(); }        // a new note, as pressing N starts one
    }
    update();
  };
  film.addEventListener('pointermove', move); film.addEventListener('pointerup', end); film.addEventListener('pointercancel', end);
});
$('area-x').addEventListener('click', () => { if (draft) { draft = null; update(); } else if (openId) change(openId, { region: null }); });
window.addEventListener('resize', showArea);
const step = (n) => { if (!current) return; if (!video.paused) video.pause(); seekFrame(curFrame() + n); };
$('back1').addEventListener('click', () => step(-1));
$('fwd1').addEventListener('click', () => step(1));
$('mute').addEventListener('click', () => { video.muted = !video.muted; $('mute').setAttribute('aria-pressed', String(video.muted)); });
$('volume').addEventListener('input', (e) => { video.volume = Number(e.target.value); try { localStorage.setItem('rostrum-volume', String(video.volume)); } catch { /* fine */ } });
try { const v = Number(localStorage.getItem('rostrum-volume')); if (v >= 0 && v <= 1 && localStorage.getItem('rostrum-volume') !== null) { video.volume = v; $('volume').value = String(v); } } catch { /* fine */ }

// ── timeline and pins ──
$('timeline').addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || !current || !duration() || e.target.closest('.pin')) return;
  e.preventDefault();
  const tl = $('timeline'), to = (ev) => { const r = tl.getBoundingClientRect(); seekTime(Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)) * duration()); };
  if (!video.paused) video.pause();
  to(e); tl.setPointerCapture(e.pointerId);
  const end = () => { tl.removeEventListener('pointermove', to); tl.removeEventListener('pointerup', end); tl.removeEventListener('pointercancel', end); };
  tl.addEventListener('pointermove', to); tl.addEventListener('pointerup', end); tl.addEventListener('pointercancel', end);
});
function renderPins() {
  const pins = $('pins'); pins.replaceChildren();
  for (const p of pinsOf(notes, duration())) pins.append(el('button', { type: 'button', class: `pin${p.isOpen ? '' : ' quiet'}${p.hasRegion ? ' area' : ''}`, 'data-id': p.id, style: `left:${p.left * 100}%`, 'aria-label': `Note ${p.n} at ${timecode(p.time)}`, text: String(p.n), onclick: () => gotoNote(p.id) }));
}
function gotoNote(id) { const n = notes.find((x) => x.id === id); if (!n) return; if (!video.paused) video.pause(); draft = null; openId = id; seekTime(n.time); } // opens the note: its selection shows
let nearKey = '';
function markNear() {
  const ids = notes.filter((n) => Math.abs(video.currentTime - n.time) <= 1).map((n) => n.id), key = ids.join(',');
  if (key === nearKey) return; nearKey = key;
  for (const li of $('list').children) li.classList.toggle('on', ids.includes(li.dataset.id));
}

// ── notes ──
async function loadNotes() {
  const data = await api('GET', '/api/notes');
  const key = JSON.stringify(data.notes);
  if (key === notesKey) return; notesKey = key;
  notes = data.notes; renderNotes(); renderPins();
}
// an icon of the sprite: an <svg> made by createElement is HTML, not SVG, so it is built in the SVG namespace
const icon = (name) => { const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), use = document.createElementNS('http://www.w3.org/2000/svg', 'use'); svg.setAttribute('class', 'i'); use.setAttribute('href', `#${name}`); svg.append(use); return svg; };
// The open note's row: Edit turns its text into a field (Save, Cancel); Delete asks once, in the row. Both end when the note closes.
let listOpen = null, editing = null, editText = '', asking = null;
function renderNotes() {
  listOpen = openId; if (editing !== openId) editing = null; if (asking !== openId) asking = null;
  $('counts').textContent = countLine(notes);
  const list = $('list'), typing = document.activeElement?.classList.contains('edit-txt'); list.replaceChildren();
  const pins = pinsOf(notes, duration());
  for (const p of pins) {
    const n = notes.find((x) => x.id === p.id), open = n.id === openId;
    list.append(el('li', { class: `note${open ? ' open' : ''}`, 'data-id': n.id },
      el('button', { type: 'button', class: `pin${p.isOpen ? '' : ' quiet'}`, text: String(p.n), 'aria-label': `Go to ${timecode(n.time)}`, onclick: () => gotoNote(n.id) }),
      el('div', {},
        el('div', { class: 'note-h' },
          el('button', { type: 'button', class: 't num', text: timecode(n.time), onclick: () => gotoNote(n.id) }),
          p.hasRegion ? el('span', { class: 'has-area', title: 'Has a selection', role: 'img', 'aria-label': 'Has a selection' }, icon('i-area')) : null,
          el('button', { type: 'button', class: `st${n.status === 'open' ? ' open' : ''}`, title: n.status === 'open' ? 'Claude sets this when it replies' : 'Set back to To fix', onclick: () => n.status !== 'open' && change(n.id, { status: 'open' }) },
            n.status === 'done' ? icon('i-check') : null, statusLabel(n))),
        editing === n.id
          ? el('form', { class: 'edit', onsubmit: (e) => { e.preventDefault(); saveEdit(n.id); } },
            el('input', { class: 'edit-txt', maxlength: '5000', 'aria-label': 'Note', autocomplete: 'off', value: editText, oninput: (e) => { editText = e.target.value; } }),
            el('button', { type: 'submit', class: 'go', text: 'Save' }), el('button', { type: 'button', text: 'Cancel', onclick: cancelEdit }))
          : el('div', { class: 'say', text: n.text }),
        n.reply ? el('div', { class: 'reply' }, el('b', { text: 'Claude' }), ` ${n.reply}`) : null,
        !open || editing === n.id ? null : asking === n.id
          ? el('div', { class: 'acts' }, el('span', { class: 'ask', text: deleteQuestion(n) }), el('button', { type: 'button', class: 'go', text: 'Delete', onclick: () => remove(n.id) }), el('button', { type: 'button', text: 'Keep', onclick: () => { asking = null; renderNotes(); } }))
          : el('div', { class: 'acts' }, el('button', { type: 'button', text: 'Edit', onclick: () => { editing = n.id; editText = n.text; renderNotes(); focusEdit(); } }), el('button', { type: 'button', text: 'Delete', onclick: () => { asking = n.id; renderNotes(); } })))));
  }
  if (typing) focusEdit(); // the list was redrawn under the typing (a reply arrived, the selection changed)
  nearKey = ''; markNear();
}
async function change(id, body) { // a note's status, its text or its selection; true when it was kept
  try { const n = await api('PUT', `/api/notes/${id}`, body); notes = notes.map((x) => (x.id === id ? n : x)); notesKey = ''; renderNotes(); renderPins(); update(); return true; } catch (e) { say(e.message); return false; }
}
async function saveEdit(id) { const text = editText.trim(); if (text && await change(id, { text })) cancelEdit(); } // the reply and the selection stay as they are
function cancelEdit() { editing = null; renderNotes(); }
function focusEdit() { const field = $('list').querySelector('.edit-txt'); if (field) { field.focus(); field.setSelectionRange(field.value.length, field.value.length); } }
async function remove(id) { // the note, and its saved frame with it
  try { await api('DELETE', `/api/notes/${id}`); notes = notes.filter((x) => x.id !== id); notesKey = ''; renderNotes(); renderPins(); update(); } catch (e) { say(e.message); }
}
$('compose').addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = $('text').value.trim();
  if (!current || !text) return;
  if (!video.paused) video.pause();
  const time = Math.round((video.currentTime) * 1e3) / 1e3;
  try { await api('POST', '/api/notes', { video: current.path, time, text, region: draft?.region ?? null }); $('text').value = ''; draft = null; notesKey = ''; await loadNotes(); update(); } catch (err) { say(err.message); }
});
$('text').addEventListener('focus', () => { if (!video.paused) video.pause(); });

// ── send and approve ──
$('send').addEventListener('click', async () => {
  try { await api('POST', '/api/send'); say('Sent. Claude picks them up in the Rostrum panel.', 6000); } catch (e) { say(e.message); }
});
$('approve').addEventListener('click', async () => {
  try { await api('POST', '/api/approve'); await loadTutorial(); } catch (e) { say(e.message); }
});
async function loadTutorial() {
  tutorial = await api('GET', '/api/tutorial');
  $('title').textContent = tutorial.title || 'Rostrum review';
  document.title = `${tutorial.title || 'Review'} · Rostrum`;
  $('approve').hidden = tutorial.state !== 'built';
  $('approved').hidden = !['reviewed', 'done'].includes(tutorial.state); // after Approve the bar says so, in the button's place
}

// ── keys ──
document.addEventListener('keydown', (e) => {
  const inField = e.target instanceof HTMLElement && e.target.matches('input, textarea');
  if (e.key === 'Escape' && e.target instanceof HTMLElement && e.target.closest('.edit')) return cancelEdit(); // the edit is dropped; the note stays open
  if (e.key === 'Escape') { draft = null; openId = null; update(); } // the note is dropped or closed, and its selection with it
  if (e.key === 'Escape' && e.target === $('text')) { $('text').value = ''; $('text').blur(); return; }
  if (inField || e.ctrlKey || e.metaKey || e.altKey) return;
  // Space plays and pauses wherever the focus rests: a button pressed with the mouse keeps the focus, and Space would
  // press it again (step a frame, mute, reopen a note) instead. Enter still presses a focused button.
  const used = { ' ': togglePlay, ArrowLeft: () => step(-1), ArrowRight: () => step(1), n: () => $('text').focus(), N: () => $('text').focus() }[e.key];
  if (used) { e.preventDefault(); used(); }
});
// the keydown above is the one press; a browser that presses a focused button on the key's release must not add a second
document.addEventListener('keyup', (e) => { if (e.key === ' ' && e.target instanceof HTMLElement && e.target.closest('button')) e.preventDefault(); });

// ── keeping up with the disk (new renders, Claude's replies) ──
async function poll() { if (document.visibilityState !== 'visible') return; try { await loadVersions(); await loadNotes(); await loadTutorial(); } catch { /* the next press says so */ } }
setInterval(poll, 8000);
window.addEventListener('focus', poll);

(async () => {
  try { await loadTutorial(); await loadVersions(); await loadNotes(); } catch (e) { say(e.message, 60000); return; }
  const wanted = location.hash.slice(1), first = versions.find((v) => v.name === wanted) ?? versions[versions.length - 1];
  if (first) select(first.path);
  else { $('film-msg').textContent = 'There is no film to review yet.'; $('film-msg').hidden = false; }
})();
