// Talking to the Rostrum helper (127.0.0.1) from a command line, for the rostrum skill and its stager agent.
// Plain node:http with no Origin header, and paths written WITHOUT a leading slash (Git Bash rewrites an argument
// that starts with one). Prints states, counts, node ids and text of the CLEAN copy: whatever the helper answers.
//
//   node helper.mjs get <path>                         e.g. get tutorials        get tutorials/<id>
//   node helper.mjs post <path> [<json> | @<file>]     any POST route; the body inline or from a file
//   node helper.mjs put <path> [<json> | @<file>]
//   node helper.mjs event <id> <event> [title...]      scripted (with the title) | approved | editScript | revoice | notes | reviewed | retry
//                                                      (with a title: the folder is renamed after it; the new path is printed)
//   node helper.mjs brand <id> [name | none]           set the tutorial's brand (optional), then copy the resolved brand into its film
//   node helper.mjs wait <id> [seconds]              until no stage is running on the tutorial; exit 1 on an error
//   node helper.mjs run <id> <stage> [<json> | @<file>]   start prepare | rules | measure | stills | sweep | render | time, and wait for it
//   node helper.mjs elements <id> <screen> [x y w h] [--find <words>] [--role button,link,field,...]
//   node helper.mjs stills <id> moments [every]        the film's own moments plus every nth frame (30), then out/log/stills.txt
//   node helper.mjs stills <id> runs                   16 frames across every click and cut, as contact sheets (out/frames/run-<n>.png)
//   node helper.mjs stills <id> list                   16 frames across a narrated list's blur-in, each item and its clearing, as contact sheets
//   node helper.mjs stills <id> frames 120,121,...     the frames named
//   node helper.mjs icons [word]                       the icon names a list may use (the bundled set), by name or meaning; no helper needed
//   node helper.mjs moves [name] [look [s,s] [--tone dark]]   the moves library: the catalogue, one move, or stills of it alone (no helper needed)
//   node helper.mjs sheet <id> <first frame> [count]   one contact sheet of frames already in out/frames (16)
//   node helper.mjs reply <id> <noteId> <open|done|wontfix> <text... | @file>   done also says which render fixed it
//   node helper.mjs progress <id> <phase> [--pass n] [--fraction f] [--note words...]   where the build is, for the panel's bar: making (new pieces being made in chat, before staging; give a --note) | shotlist | measure | staging | checking (--pass 1..3) | sweep | render (--fraction 0..1)
//   node helper.mjs progress <id> clear                the build stopped before its render: take the bar away
//   node helper.mjs rename <id> <title words...>      the folder is renamed after the title too (the id stays); prints its path
// An id is the recording's name and never changes; a titled tutorial's folder is named after its title, so a folder
// is always taken from the helper (`get tutorials/<id>` gives `dir`), never built from the id.
//   node helper.mjs archive <id>                       hidden from the panel; nothing is lost
//   node helper.mjs reopen <id>                        an archived or finished tutorial back in the panel (a finished one as approved)
//   node helper.mjs delete <id>                        the tutorial's folder, whole, into Rostrum's trash (nothing is removed)
//   node helper.mjs restore <id>                       the newest deleted copy of the tutorial, back in the panel
//   node helper.mjs trash                              what is in the trash: id, when it was deleted, its title
//   node helper.mjs narration <id>                     the narration as written (one line per paragraph), and the brand's voice if it has one
//   node helper.mjs narrate <id> <file path>           upload a narration take (mp3, wav, m4a, ogg, webm; 50 MB at most) and wait for the check and the timing
// The port is ROSTRUM_PORT, else 4600.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ffbin, noFull } from '../../../tools/bin.mjs';

const PORT = Number(process.env.ROSTRUM_PORT ?? 4600);
const [cmd, ...args] = process.argv.slice(2);
const out = (s) => process.stdout.write(s + '\n');
const fail = (s) => { out(s); process.exit(1); };

/** One request. Resolves { code, text, json }. A Buffer body is sent as it is, under `type`; anything else as JSON. */
function call(method, route, body, type = 'application/json') {
  const data = body == null ? null : Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  return new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port: PORT, method, path: '/' + String(route).replace(/^\/+/, ''), headers: data ? { 'content-type': type, 'content-length': data.length } : {} }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => { const text = Buffer.concat(chunks).toString('utf8'); let json = null; try { json = JSON.parse(text); } catch { /* not JSON */ } resolve({ code: res.statusCode, text, json }); });
    });
    req.on('error', (e) => resolve({ code: 0, text: `the helper is not answering on 127.0.0.1:${PORT} (${e.code ?? e.message}). Open the Rostrum panel: it starts the helper.`, json: null }));
    req.end(data ?? undefined);
  });
}
/** A body argument: `@file` reads the file, anything else is the JSON itself. */
const bodyOf = (parts) => { const s = parts.join(' ').trim(); if (!s) return null; const text = s.startsWith('@') ? fs.readFileSync(s.slice(1), 'utf8') : s; JSON.parse(text); return text; };
const show = (r) => { out(`${r.code} ${r.json ? JSON.stringify(r.json, null, 1) : r.text}`); return r.code >= 200 && r.code < 300; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const one = (t) => `${t.id}: ${t.state}${t.busy ? `, busy: ${t.busy}` : ''}${t.error ? `, ERROR in ${t.error.stage}: ${t.error.message}` : ''}${t.sweep ? `, sweep ${t.sweep.ok ? 'passed' : `FAILED (${t.sweep.fails})`}` : ''}${t.renders?.length ? `, renders: ${t.renders.join(' ')}` : ''}`;

async function wait(id, seconds = 1800) {
  const until = Date.now() + seconds * 1000;
  let last = '';
  for (;;) {
    const r = await call('GET', `tutorials/${id}`);
    if (!r.json) fail(`${r.code} ${r.text}`);
    if (!r.json.busy) { out(one(r.json)); return r.json; }
    if (r.json.busy !== last) { last = r.json.busy; out(`  ${last}...`); }
    if (Date.now() > until) fail(`still busy (${r.json.busy}) after ${seconds} s`);
    await sleep(2000);
  }
}
async function run(id, stage, body) {
  const r = await call('POST', `tutorials/${id}/${stage}`, body);
  if (r.code !== 202 && r.code !== 200) fail(`${r.code} ${r.json?.error ?? r.text}`);
  if (r.code === 200) { out(JSON.stringify(r.json, null, 1)); return wait(id); } // a route that answers when it is done (rules)
  return wait(id);
}
const dirOf = async (id) => { const r = await call('GET', `tutorials/${id}`); if (!r.json?.dir) fail(`${r.code} ${r.json?.error ?? r.text}`); return r.json.dir; };
const log = (dir, name) => { try { return fs.readFileSync(path.join(dir, 'out', 'log', name), 'utf8').trim(); } catch { return `(no out/log/${name})`; } };
/** The audio types a narration take may be, by the file's extension (the helper takes the type, never a file name). */
const AUDIO = { mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg', webm: 'audio/webm' };
const NARRATION_CAP = 50 * 1024 * 1024;
const frameFile = (dir, n) => path.join(dir, 'out', 'frames', `f${String(n).padStart(4, '0')}.png`);

/** A contact sheet of `count` frames in a row of numbers, 4 across: out/frames/run-<first>.png. Needs ffmpeg. */
function sheet(dir, first, count = 16) {
  const missing = Array.from({ length: count }, (_, i) => first + i).filter((n) => !fs.existsSync(frameFile(dir, n)));
  if (missing.length) return `frames ${missing.join(', ')} are not in out/frames: render them first`;
  const to = path.join(dir, 'out', 'frames', `run-${String(first).padStart(4, '0')}.png`);
  const r = spawnSync(ffbin('ffmpeg', { full: true }), ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-start_number', String(first), '-i', path.join(dir, 'out', 'frames', 'f%04d.png'), '-frames:v', '1', '-vf', `scale=960:-1,tile=4x${Math.ceil(count / 4)}`, to], { encoding: 'utf8' });
  return r.status === 0 ? `sheet: ${to}  (frames ${first} to ${first + count - 1}, left to right, top to bottom)` : `no sheet (${noFull(r, 'a contact sheet') ?? 'ffmpeg exit ' + r.status}): open the frames one by one`;
}

if (cmd === 'get') process.exit(show(await call('GET', args[0])) ? 0 : 1);
else if (cmd === 'post' || cmd === 'put') process.exit(show(await call(cmd.toUpperCase(), args[0], bodyOf(args.slice(1)))) ? 0 : 1);
else if (cmd === 'event') {
  const [id, event, ...title] = args;
  const r = await call('POST', `tutorials/${id}/state`, { event, ...(title.length ? { title: title.join(' ') } : {}) });
  if (r.code !== 200) fail(`${r.code} ${r.json?.error ?? r.text}`);
  out(one(r.json));
  out(`folder: ${r.json.dir}`);
} else if (cmd === 'brand') {
  // with a name: sets the tutorial's brand first ("none" clears it). Then copies the resolved brand into film/brand/.
  const [id, name] = args;
  if (name) { const s = await call('POST', `tutorials/${id}/state`, { brand: name === 'none' ? null : name }); if (s.code !== 200) fail(`${s.code} ${s.json?.error ?? s.text}`); }
  const r = await call('POST', 'brands/resolve', { id });
  if (r.code !== 200) fail(`${r.code} ${r.json?.error ?? r.text}`);
  out(r.json.brand ? `brand: ${r.json.brand}` : 'no brand: the end card will show the title as text');
} else if (cmd === 'wait') { const t = await wait(args[0], args[1] ? Number(args[1]) : undefined); process.exit(t.error ? 1 : 0); }
else if (cmd === 'run') { const t = await run(args[0], args[1], bodyOf(args.slice(2))); process.exit(t.error ? 1 : 0); }
else if (cmd === 'elements') {
  const [id, screen, ...rest] = args, flag = (f) => (rest.includes(f) ? rest[rest.indexOf(f) + 1] : null);
  const nums = rest.filter((a, i) => /^-?\d+(\.\d+)?$/.test(a) && !['--find', '--role'].includes(rest[i - 1]));
  const region = nums.length === 4 ? `&x=${nums[0]}&y=${nums[1]}&w=${nums[2]}&h=${nums[3]}` : '';
  const r = await call('GET', `tutorials/${id}/elements?screen=${screen}${region}`);
  if (r.code !== 200) fail(`${r.code} ${r.json?.error ?? r.text}`);
  const find = flag('--find')?.toLowerCase(), roles = flag('--role')?.split(',');
  const list = r.json.elements.filter((e) => (!find || e.text.toLowerCase().includes(find)) && (!roles || roles.includes(e.role)));
  out(`screen ${r.json.screen}: ${r.json.count} elements${r.json.count > r.json.elements.length ? ` (the first ${r.json.elements.length} answered: ask with a region)` : ''}${r.json.measured ? '' : '; not measured, so no boxes and no regions'}; ${list.length} listed`);
  for (const e of list) out(`  ${String(e.node).padStart(5)}  ${e.tag.padEnd(8)} ${e.role.padEnd(7)} "${e.text}"${e.box ? `  ${Math.round(e.box.w)}x${Math.round(e.box.h)} at ${Math.round(e.box.x)},${Math.round(e.box.y)}` : ''}`);
} else if (cmd === 'stills') {
  const [id, what, arg] = args, dir = await dirOf(id);
  if (what === 'moments') { const t = await run(id, 'stills', { moments: true, every: arg ? Number(arg) : 30 }); out(log(dir, 'stills.txt')); process.exit(t.error ? 1 : 0); }
  else if (what === 'frames') { const t = await run(id, 'stills', { frames: String(arg ?? '').split(',').filter(Boolean).map(Number) }); out(log(dir, 'stills.txt')); process.exit(t.error ? 1 : 0); }
  else if (what === 'runs') {
    // the moments the film names (out/log/stills.txt of a `moments` run): every click and every cut is a state change
    const said = log(dir, 'stills.txt'), fps = Number(/at (\d+) fps/.exec(said)?.[1] ?? 30), total = Number(/^film: (\d+) frames/m.exec(said)?.[1] ?? 0);
    const clicks = [...said.matchAll(/click \S* (\d+\.\d+)/g)].map((m) => Number(m[1])), cuts = (/cuts ([\d., ]+)/.exec(said)?.[1] ?? '').split(',').map((s) => Number(s.trim())).filter(Number.isFinite);
    if (!total) fail('run "stills <id> moments" first: out/log/stills.txt names the moments');
    const starts = [...new Set([...clicks, ...cuts].map((t) => Math.max(0, Math.min(total - 16, Math.round(t * fps) - 2))))].sort((a, b) => a - b);
    const kept = starts.filter((s, i) => i === 0 || s - starts[i - 1] >= 16).slice(0, 15);
    if (!kept.length) fail('the film has no click and no cut: nothing changes state');
    const t = await run(id, 'stills', { frames: kept.flatMap((s) => Array.from({ length: 16 }, (_, i) => s + i)) });
    if (t.error) process.exit(1);
    out(`state changes at ${[...clicks.map((c) => `click ${c}`), ...cuts.map((c) => `cut ${c}`)].join(', ')} s`);
    for (const s of kept) out(sheet(dir, s));
  } else if (what === 'list') {
    // a narrated list's own moments (out/log/stills.txt of a `moments` run): the screen receding, each item, the clearing
    const said = log(dir, 'stills.txt'), fps = Number(/at (\d+) fps/.exec(said)?.[1] ?? 30), F = (s) => Math.round(Number(s) * fps);
    const starts = [...said.matchAll(/list blur ([\d.]+), items ([\d. ]+), out ([\d.]+), sharp [\d.]+/g)].flatMap((m) => [F(m[1]) - 1, ...m[2].trim().split(' ').map((t) => F(t) - 5), F(m[3])]);
    if (!starts.length) fail('no list in out/log/stills.txt: run "stills <id> moments" first (or the film has no list)');
    const t = await run(id, 'stills', { frames: [...new Set(starts.flatMap((s) => Array.from({ length: 16 }, (_, i) => s + i)))] });
    if (t.error) process.exit(1);
    for (const s of starts) out(sheet(dir, s));
  } else fail('stills <id> moments [every] | runs | list | frames <n,n,...>');
} else if (cmd === 'sheet') out(sheet(await dirOf(args[0]), Number(args[1]), args[2] ? Number(args[2]) : 16));
else if (cmd === 'icons') {
  // the set the film bundles (film/src/kit/Icon.tsx): the plugin's own node_modules, read here; nothing is fetched
  const set = new URL('../../../node_modules/lucide-static/', import.meta.url), read = (f) => { try { return JSON.parse(fs.readFileSync(new URL(f, set), 'utf8')); } catch { return null; } };
  const names = Object.keys(read('icon-nodes.json') ?? {}), tags = read('tags.json') ?? {}, find = args.join(' ').trim().toLowerCase();
  if (!names.length) fail('the icon set is not installed: run "npm install" in the plugin folder');
  const hit = names.filter((n) => !find || n.includes(find) || (tags[n] ?? []).some((t) => String(t).toLowerCase().includes(find))).sort((a, b) => Number(b.includes(find)) - Number(a.includes(find)) || a.localeCompare(b));
  out(`${hit.length} of ${names.length} icons${find ? ` match "${find}" (by name first, then by meaning)` : ''}${hit.length > 120 ? '; the first 120 (give a word to narrow it)' : ''}:`);
  out(hit.slice(0, 120).join('  '));
}
else if (cmd === 'moves') {
  // the catalogue the plugin generates (references/moves.md): all of it, one move, or that move rendered alone
  const doc = fs.readFileSync(new URL('../references/moves.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n'), [name, what, ...rest] = args;
  if (!name) { out(doc.split('\n').filter((l) => /^### /.test(l)).map((l) => l.slice(4)).join('  ')); out('\nhelper.mjs moves <name> for one; moves <name> look [s,s] renders it alone; the whole page: references/moves.md'); }
  else {
    const m = /^[a-z][a-z0-9-]*$/.test(name) ? new RegExp(`^### ${name}(?: \\(one-off\\))?\\n[\\s\\S]*?(?=^### |^## |(?![\\s\\S]))`, 'm').exec(doc) : null;
    if (!m) fail(`no move "${name}" in references/moves.md`);
    out(m[0].trim());
    if (what === 'look') {
      const r = spawnSync(process.execPath, ['--experimental-strip-types', fileURLToPath(new URL('../../../tools/move-still.mjs', import.meta.url)), name, ...(rest[0] && !rest[0].startsWith('--') ? ['--t', rest[0]] : []), ...(rest.includes('--tone') ? ['--tone', rest[rest.indexOf('--tone') + 1]] : [])], { encoding: 'utf8', cwd: fileURLToPath(new URL('../../../', import.meta.url)) });
      out((r.stdout + r.stderr).trim()); process.exit(r.status ?? 1);
    }
  }
}
else if (cmd === 'reply') {
  const [id, note, status, ...text] = args, said = text.join(' ');
  const reply = said.startsWith('@') ? fs.readFileSync(said.slice(1), 'utf8').trim() : said;
  // a note that is done says which render fixed it: the latest (the review page shows "Fixed in v<n>")
  const t = status === 'done' ? (await call('GET', `tutorials/${id}`)).json : null;
  const fixedIn = t?.renders?.length ? t.renders[t.renders.length - 1].replace(/\.mp4$/, '') : undefined;
  process.exit(show(await call('PUT', `review/${id}/api/notes/${note}`, { status, reply, ...(fixedIn ? { fixedIn } : {}) })) ? 0 : 1);
} else if (cmd === 'progress') {
  const [id, phase, ...rest] = args;
  if (phase === 'clear') { process.exit(show(await call('POST', `tutorials/${id}/progress`, { clear: true })) ? 0 : 1); }
  const flag = (f) => { const i = rest.indexOf(f); return i >= 0 ? rest[i + 1] : undefined; };
  const noteAt = rest.indexOf('--note'), note = noteAt >= 0 ? rest.slice(noteAt + 1).join(' ') : undefined;
  const r = await call('POST', `tutorials/${id}/progress`, { phase, pass: flag('--pass') ? Number(flag('--pass')) : undefined, fraction: flag('--fraction') ? Number(flag('--fraction')) : undefined, note });
  if (r.code !== 200) fail(`${r.code} ${r.json?.error ?? r.text}`);
  out(`progress: ${r.json.progress.label} ${r.json.progress.pct}%`);
} else if (cmd === 'archive' || cmd === 'reopen') {
  // a finished tutorial (done) is hidden like an archived one: reopening it is the `reopen` event, back to reviewed
  const was = cmd === 'reopen' ? (await call('GET', `tutorials/${args[0]}`)).json : null;
  const r = await call('POST', `tutorials/${args[0]}/state`, { archived: cmd === 'archive', ...(was?.state === 'done' ? { event: 'reopen' } : {}) });
  if (r.code !== 200) fail(`${r.code} ${r.json?.error ?? r.text}`);
  out(`${r.json.id}: ${cmd === 'archive' ? 'archived' : 'back in the panel'} (${r.json.state})`);
} else if (cmd === 'rename') {
  const [id, ...title] = args;
  const r = await call('POST', `tutorials/${id}/state`, { title: title.join(' ') });
  if (r.code !== 200) fail(`${r.code} ${r.json?.error ?? r.text}`);
  out(`${r.json.id}: "${r.json.title}"\nfolder: ${r.json.dir}`);
} else if (cmd === 'delete') {
  const r = await call('DELETE', `tutorials/${args[0]}`);
  if (r.code !== 200) fail(`${r.code} ${r.json?.error ?? r.text}`);
  out(`deleted ${r.json.id}: it is in the trash (helper.mjs restore ${r.json.id} brings it back)`);
} else if (cmd === 'restore') {
  const r = await call('POST', `tutorials/${args[0]}/restore`);
  if (r.code !== 200) fail(`${r.code} ${r.json?.error ?? r.text}`);
  out(`${r.json.id}: back in the panel (${r.json.state})\nfolder: ${r.json.dir}`);
} else if (cmd === 'trash') {
  const r = await call('GET', 'tutorials');
  if (r.code !== 200) fail(`${r.code} ${r.json?.error ?? r.text}`);
  const list = r.json.trashed ?? [];
  out(list.length ? list.map((t) => `${t.id}: deleted ${t.at}${t.name ? `, "${t.name}"` : ''}`).join('\n') : 'the trash is empty');
} else if (cmd === 'narration') {
  const r = await call('GET', `tutorials/${args[0]}/narration`);
  if (r.code !== 200) fail(`${r.code} ${r.json?.error ?? r.text}`);
  const v = r.json, voice = v.brand?.voice;
  out(`${v.id}: ${v.state}, ${v.lines.length} lines, ${v.lines.join(' ').split(/\s+/).filter(Boolean).length} words${v.narration ? '; a take is in' : ''}`);
  out(voice ? `voice (brand ${v.brand.name}): ${Object.entries(voice).filter(([, x]) => x != null && typeof x !== 'object').map(([k, x]) => `${k}: ${x}`).join(', ')}` : 'voice: none set (no brand, or the brand names no voice)');
  out('narration, as the voice reads it (between the rules):\n----------');
  out(v.lines.join('\n\n'));
  out('----------');
} else if (cmd === 'narrate') {
  // the take's bytes are the body and its type is the header, as the local page sends them; nothing names the file
  const [id, ...rest] = args, file = rest.join(' ').trim().replace(/^(["'])(.*)\1$/, '$2');
  if (!id || !file) fail('narrate <id> <file path>');
  const type = AUDIO[path.extname(file).slice(1).toLowerCase()];
  if (!type) fail(`not uploaded: "${path.extname(file) || 'no extension'}" is not an audio type this takes. Give an mp3, wav, m4a, ogg or webm file.`);
  let stat = null;
  try { stat = fs.statSync(file); } catch { /* not there */ }
  if (!stat) fail(`not uploaded: there is no file at ${file}`);
  if (!stat.isFile()) fail(`not uploaded: ${file} is not a file (a folder, or something else)`);
  if (stat.size > NARRATION_CAP) fail(`not uploaded: the file is ${(stat.size / 1024 / 1024).toFixed(1)} MB; 50 MB at most`);
  if (!stat.size) fail('not uploaded: the file is empty');
  const r = await call('POST', `tutorials/${id}/narration`, fs.readFileSync(file), type);
  if (r.code !== 202) fail(`not taken: ${r.code} ${r.json?.error ?? r.text}`);
  out(`uploaded ${(stat.size / 1024).toFixed(0)} KB as ${type}`);
  const t = await wait(id);
  if (!t.error && t.state === 'voiced') { out('The narration is in and timed. Next: Build.'); process.exit(0); }
  if (t.error?.stage === 'time' && /differ|not spoken/.test(t.error.message)) {
    // only the script's own words are printed: never what the transcriber heard
    const v = (await call('GET', `tutorials/${id}/narration`)).json, c = v?.compare;
    out('The take does not match the script. Lines (numbered as in the script, from 0):');
    for (const d of c?.differs ?? []) out(`  line ${d.line}, said differently: ${v.lines?.[d.line] ?? ''}`);
    for (const n of c?.missing ?? []) out(`  line ${n}, not spoken: ${v.lines?.[n] ?? ''}`);
    out(`Either record again and upload the new take (narrate ${id} <file>), or keep this take: run ${id} time`);
  }
  process.exit(1);
} else {
  out(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//   node')).map((l) => l.slice(5)).join('\n'));
  process.exit(cmd ? 1 : 0);
}
