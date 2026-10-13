// The popup draws; the worker decides (extension/state.mjs is the one state machine). A press sends one message and the
// popup redraws from storage, so nothing depends on this page staying open (it closes the moment another tab is
// clicked, as the countdown asks). Every animated value is a function of two clocks, as in the motion prototype
// (docs/stage-b/mockups/button-motion.html): `a` ms since the arming press, `b` ms since the stopping press.
// Nothing here reads or logs anything of a page.
import { popupState, COUNTDOWN_MS, PARTS, shows, pressable, press, hearing, micMenu, micCurrent } from './state.mjs';

const $ = (id) => document.getElementById(id);
const HEALTH = 'http://127.0.0.1:4600/health';
const send = (msg) => chrome.runtime.sendMessage(msg).catch(() => false);
const main = document.querySelector('main');
let helperUp = false, mic = 'prompt', recording = null, lastSent = null, shownState = '', nudged = null;
let level = 0; // the microphone's level, 0..1, from the meter
let heardAt = Date.now(); // when sound last came from the microphone (the popup's opening counts, so it does not start by complaining)

// ── the animation (the prototype's draw(), one element per key) ──
const COUNT = COUNTDOWN_MS, MORPH_AT = 60, MORPH = 340;
const clamp = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const outCubic = (x) => 1 - Math.pow(1 - clamp(x), 3);
const inOutCubic = (x) => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const mix = (p, q, k) => p + (q - p) * k;
const rgb = (p, q, k) => `rgb(${Math.round(mix(p[0], q[0], k))},${Math.round(mix(p[1], q[1], k))},${Math.round(mix(p[2], q[2], k))})`;
const INK = [31, 30, 29], RED = [229, 83, 63], GREEN = [61, 208, 104];

function draw(a, b, clock, heard) {
  const on = a !== null, off = b !== null;
  if (!on) a = -1;
  if (!off) b = -1;

  // the cap: goes in fast, eases back to a latched depth while counting and recording; out otherwise (a recording is
  // sent from Stopped, by its own button, so the cap is already out)
  let depth = 0;
  if (on) depth = a < 140 ? outCubic(a / 140) : mix(1, 0.7, outCubic((a - 140) / 200));
  const cap = $('cap');
  cap.style.transform = `scale(${(1 - 0.04 * depth).toFixed(4)})`;
  cap.style.boxShadow = `inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -1px 0 rgba(20,20,19,0.12), inset 0 0 0 1px rgba(20,20,19,0.08), inset 0 3px 6px rgba(20,20,19,${(0.16 * depth).toFixed(3)}), 0 ${mix(4, 1.5, depth).toFixed(2)}px ${mix(7, 2.5, depth).toFixed(2)}px rgba(0,0,0,0.5), 0 1px 1px rgba(0,0,0,0.5)`;

  // the ring: dark at the press; one red flash with each count (a quick bloom, a softer decay); solid red when
  // recording starts; dark when stopped; green when sent
  let lit = 0, colour = RED;
  if (on && a < COUNT) {
    const since = a < 1000 ? a - 150 : a % 1000;
    lit = since < 0 ? 0 : since < 90 ? outCubic(since / 90) : Math.pow(1 - clamp((since - 90) / 520), 2);
  } else if (on) lit = outCubic((a - COUNT) / 300);
  if (off) { colour = GREEN; lit = outCubic(b / 300); } // sent, from Stopped: the dark ring comes on green
  const c = colour.map(Math.round).join(',');
  $('ring').style.background = `rgb(${c})`;
  $('glow').style.opacity = lit.toFixed(3);
  $('glow').style.filter = `drop-shadow(0 0 5px rgba(${c},0.6))`;

  // the mark: through the count the dot flashes red with the ring and goes back to its ink between; when recording
  // starts it turns red for good and becomes the rounded square (corner and size only); on stop, back to a circle
  // that gives way to a tick
  const m = on ? inOutCubic((a - COUNT - MORPH_AT) / MORPH) : 0, n = off ? outCubic(b / 300) : 0;
  const k = m * (1 - n), red = lit * (1 - n), flash = on && a < COUNT ? lit : 0, mk = $('mk');
  mk.style.borderRadius = `${mix(50, 25, k).toFixed(2)}%`;
  mk.style.background = rgb(INK, RED, red);
  mk.style.boxShadow = `inset 0 1px 2px rgba(0,0,0,${mix(0.35, 0.25, red).toFixed(3)}), 0 1px 0 rgba(255,255,255,0.8), 0 0 ${mix(7, 11, flash).toFixed(2)}px rgba(229,83,63,${(0.8 * flash).toFixed(3)})`;
  mk.style.transform = `scale(${(mix(22 / 24, 1, k) * (off ? mix(1, 0.6, clamp((b - 100) / 220)) : 1)).toFixed(4)})`;
  mk.style.opacity = off ? (1 - clamp((b - 100) / 200)).toFixed(3) : 1;
  $('tick').style.strokeDashoffset = off ? (24 * (1 - outCubic((b - 200) / 300))).toFixed(2) : 24;

  // the words under it
  const rec = on ? outCubic((a - COUNT) / 200) : 0, gone = off ? clamp(b / 150) : 0, sent = off ? outCubic((b - 150) / 250) : 0;
  $('label').style.opacity = on ? 1 - clamp(a / 150) : 1;
  const count = $('count');
  if (!on || a < 150 || a >= COUNT) count.style.opacity = 0;
  else {
    const local = a % 1000 - (a < 1000 ? 150 : 0), inn = outCubic(local / 180), out = clamp((1000 - a % 1000) / 120);
    count.style.opacity = (inn * out).toFixed(3);
    count.style.transform = `translateY(${((1 - inn) * 6).toFixed(2)}px)`;
  }
  $('timer').style.opacity = (rec * (1 - gone)).toFixed(3);
  $('sent').style.opacity = sent.toFixed(3);
  $('sent').style.transform = `translateY(${((1 - sent) * 6).toFixed(2)}px)`;
  $('s0').style.opacity = on ? 1 - clamp(a / 150) : 1;
  $('s1').style.opacity = on ? clamp((a - 150) / 150) * (1 - clamp((a - COUNT + 120) / 120)) : 0;
  $('s2').style.opacity = (rec * (1 - gone)).toFixed(3);
  $('s3').style.opacity = sent.toFixed(3);
  $('pause').style.opacity = (rec * (1 - gone)).toFixed(3);
  $('meter').style.opacity = off ? 1 - clamp(b / 200) : 1;
  $('again').style.opacity = off ? outCubic((b - 250) / 250) : 0;

  // the level meter: the real level, each bar with its own factor so it reads as a wave
  const bars = $('wave').children;
  for (let i = 0; i < bars.length; i++) {
    const v = Math.abs(Math.sin(i * 1.7 + clock / 140) * Math.sin(i * 0.37 + clock / 330));
    bars[i].style.height = `${Math.max(6, Math.round(100 * heard * (0.2 + 0.8 * v)))}%`;
  }
}

// ── state → the screen ──
const WORDS = { notConnected: 'Not connected', micOff: 'Microphone off', ready: 'Ready', countdown: 'Starting', recording: 'Recording', paused: 'Paused', sent: 'Sent', empty: 'Not sent' };
const PRESS = { notConnected: 'Record', micOff: 'Record', ready: 'Start recording', countdown: 'Cancel', recording: 'Stop', paused: 'Carry on recording', sent: 'Start recording', empty: 'Start recording' };
function render(now) {
  const shown = popupState({ helperUp, mic, recording, lastSent, now }), s = shown.state;
  const look = s + (shown.warn ? (shown.dim ? ' cannot' : ' warned') : '');
  if (look !== shownState) {
    shownState = look;
    main.dataset.state = s;
    const word = $('state-word');
    word.className = `state${s === 'recording' ? ' live' : ''}`;
    word.textContent = WORDS[s];
    if (s === 'recording') { const dot = document.createElement('i'); dot.className = 'rec-dot'; word.prepend(dot); }
    // only the parts of this state exist (state.mjs `shows`): the rest are not laid out, so they cannot be seen,
    // pressed, tabbed to, or lie over something that can
    const here = shows(s, !!shown.warn), can = pressable(s);
    $('warn').textContent = shown.warn ?? '';
    $('warn').classList.toggle('dim', !!shown.dim);
    for (const id of PARTS) $(id).hidden = !here.includes(id);
    $('rec').disabled = !can.rec;
    $('rec').setAttribute('aria-label', PRESS[s]);
    $('mic').disabled = !can.picker;
    if (!can.picker) closeMenu();
    $('wave').classList.toggle('flat', s === 'paused');
    $('timer').classList.toggle('held', s === 'paused');
  }
  if (shown.count) $('count').textContent = shown.count;
  if (s === 'countdown') $('timer').textContent = '0:00';
  if (shown.clock) $('timer').textContent = shown.clock;
  if (shown.captured) $('s3').textContent = shown.captured;
  const says = hearing(s, now - heardAt);
  if ($('hearing').textContent !== says) { $('hearing').textContent = says; $('hearing').classList.toggle('dim', says.startsWith('No sound')); }
  // the two clocks: counting or recording, `a` runs from the arming press; sent, `b` runs from the stop
  const a = s === 'countdown' || s === 'recording' ? now - recording.armedAt : null;
  draw(a, s === 'sent' ? now - lastSent.at : null, now, s === 'paused' ? 0 : level);
  if (s === 'paused') $('timer').style.opacity = 1; // the time stays, held (the rest of the paused look is popup.css)
  if (s === 'empty') $('s3').style.opacity = $('again').style.opacity = 1; // nothing was captured: the plain control, what happened, Record another
  // the count is over and the worker has not begun: its timer was lost, so ask it once
  if (s === 'countdown' && now - recording.armedAt >= COUNTDOWN_MS + 250 && nudged !== recording.id) { nudged = recording.id; send({ ct: 'begin' }); }
}

// ── storage, the helper, the microphone's permission ──
async function load() {
  const v = await chrome.storage.local.get(['recording', 'lastSent']);
  recording = v.recording ?? null;
  lastSent = v.lastSent ?? null;
}
chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && (changes.recording || changes.lastSent)) load(); });
async function health() { helperUp = await fetch(HEALTH).then((r) => r.ok, () => false); }
// The popup shares the extension's origin with the microphone page, so this is that page's permission. Should Chrome
// not answer the question here, a microphone that has a name means it is allowed (names are given only once it is).
async function permission() {
  mic = await navigator.permissions.query({ name: 'microphone' }).then((p) => p.state,
    async () => ((await navigator.mediaDevices.enumerateDevices().catch(() => [])).some((d) => d.kind === 'audioinput' && d.label) ? 'granted' : 'prompt'));
  if (mic === 'granted' && !stream && !opening) listen();
}

// ── the meter and the picker: a stream of the popup's own, only once the microphone is allowed (so no question is
// ever asked from here), let go of when the popup closes. Heard, never recorded or sent. ──
for (let i = 0; i < 46; i++) $('wave').appendChild(document.createElement('i'));
let stream = null, ctx = null, meter = null, opening = false;
function quiet() {
  clearInterval(meter);
  stream?.getTracks().forEach((t) => t.stop());
  ctx?.close();
  stream = ctx = null;
  level = 0;
}
async function listen() {
  opening = true;
  try {
    const { micDeviceId } = await chrome.storage.local.get('micDeviceId');
    // the chosen microphone; if it has gone (unplugged), whichever Chrome gives
    const next = await navigator.mediaDevices.getUserMedia({ audio: micDeviceId ? { deviceId: { exact: micDeviceId } } : true })
      .catch((err) => { if (!micDeviceId) throw err; return navigator.mediaDevices.getUserMedia({ audio: true }); });
    quiet();
    stream = next;
    ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    ctx.createMediaStreamSource(stream).connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    meter = setInterval(() => { analyser.getFloatTimeDomainData(samples); let peak = 0; for (const v of samples) peak = Math.max(peak, Math.abs(v)); level = Math.min(1, peak * 2); if (level > 0.02) heardAt = Date.now(); }, 50);
    chosen = micDeviceId ?? '';
    heard = stream.getAudioTracks()[0]?.getSettings().deviceId ?? '';
    await devices();
  } catch { /* no microphone to hear: the bars stay flat */ } finally { opening = false; }
}

// ── the picker: a button with the microphone's name, and a menu of the popup's own above it. The rows are Chrome's
// devices with readable names (state.mjs `micMenu`). The list is read when the microphone opens, when the menu opens
// and when a device is plugged in or out; the menu's rows are built then, never while a frame is drawn. ──
let rows = [], chosen = '', heard = '';
const menu = $('mic-menu'), trigger = $('mic');
async function devices() {
  rows = micMenu((await navigator.mediaDevices.enumerateDevices().catch(() => [])).filter((d) => d.kind === 'audioinput'));
  const now = micCurrent(rows, chosen, heard);
  $('mic-name').textContent = now ? now.note ?? now.label : '';
  if (!menu.hidden) build();
}
function build() {
  const now = micCurrent(rows, chosen, heard);
  menu.replaceChildren(...rows.map((row) => {
    const el = document.createElement('div'), name = document.createElement('span');
    el.className = 'row';
    el.setAttribute('role', 'option');
    el.setAttribute('aria-selected', String(row === now));
    el.tabIndex = -1;
    el.dataset.id = row.deviceId;
    name.textContent = row.label;
    if (row.note) { const note = document.createElement('em'); note.textContent = ` · ${row.note}`; name.append(note); }
    const check = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    check.setAttribute('class', 'i');
    check.setAttribute('aria-hidden', 'true');
    use.setAttribute('href', '#sym-check');
    check.append(use);
    el.append(name, check);
    return el;
  }));
}
async function openMenu() {
  await devices();
  if (!rows.length || trigger.disabled) return;
  build();
  menu.hidden = false;
  trigger.setAttribute('aria-expanded', 'true');
  (menu.querySelector('[aria-selected="true"]') ?? menu.firstElementChild).focus();
}
function closeMenu(refocus = false) {
  if (menu.hidden) return;
  menu.hidden = true;
  trigger.setAttribute('aria-expanded', 'false');
  if (refocus) trigger.focus();
}
async function choose(el) {
  closeMenu(true);
  chosen = el.dataset.id === 'default' ? '' : el.dataset.id; // the system default is "nothing chosen"
  await send({ ct: 'mic', deviceId: chosen }); // the worker stores it (storage.local.micDeviceId); the microphone page reads it at the next recording
  listen(); // the meter moves to it now
}
trigger.addEventListener('click', () => (menu.hidden ? openMenu() : closeMenu()));
menu.addEventListener('click', (e) => { const el = e.target.closest('.row'); if (el) choose(el); });
menu.addEventListener('keydown', (e) => {
  const all = [...menu.children], at = all.indexOf(document.activeElement);
  const to = { ArrowDown: Math.min(at + 1, all.length - 1), ArrowUp: Math.max(at - 1, 0), Home: 0, End: all.length - 1 }[e.key];
  if (to !== undefined) { e.preventDefault(); all[to]?.focus(); }
  else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (all[at]) choose(all[at]); }
  else if (e.key === 'Escape') { e.preventDefault(); closeMenu(true); }
  else if (e.key === 'Tab') closeMenu();
});
document.addEventListener('pointerdown', (e) => { if (!menu.contains(e.target) && !trigger.contains(e.target)) closeMenu(); });
navigator.mediaDevices.addEventListener?.('devicechange', devices);

// ── presses ──
$('rec').addEventListener('click', () => {
  // the control stops (pauses) and carries on; only "Send to Rostrum" ends a recording (state.mjs `press`)
  const ct = press(popupState({ helperUp, mic, recording, lastSent, now: Date.now() }).state);
  if (ct) send(ct === 'arm' ? { ct, mic } : { ct });
});
$('cancel').addEventListener('click', () => send({ ct: 'cancel' }));
$('pause').addEventListener('click', () => send({ ct: 'pause' }));
$('stop').addEventListener('click', () => send({ ct: 'stop' }));
$('allow').addEventListener('click', () => send({ ct: 'openMic' }));
$('again').addEventListener('click', () => send({ ct: 'another' }));

await Promise.all([load(), health(), permission()]);
setInterval(health, 2000);
setInterval(permission, 2000);
(function frame() { render(Date.now()); requestAnimationFrame(frame); })();
