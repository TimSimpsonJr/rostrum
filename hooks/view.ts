// What the panel shows, worked out from what the helper answered and what the person has opened: the status line
// (or the stopped block), the recorder setup, the list newest first with the open one at the top, and the tip. Pure:
// no engine, no Node. The pane (hooks/register.tsx) draws this as it is; the poll writes it to `$.state` only when
// `viewKey` changes. Every sentence the person reads is here or in hooks/tips.ts.
import type { RostrumButton, RostrumLink, RostrumProgress, RostrumRow, RostrumView } from '../types'
import { PROMPTS, RECORDER_FRESH_MS, routes } from './helper.ts'
import type { Setup, Snapshot, Tutorial } from './helper.ts'
import type { NodeFetch } from './node.ts'
import { tipAt } from './tips.ts'

/** How the helper stands, as the supervisor (hooks/supervise.ts) knows it. */
export type HelperStatus = {
  status: 'starting' | 'running' | 'stopped'
  /** True when this session started it; false when one already answering was adopted. */
  isOwned: boolean
  /** Why it is stopped, in words for the person; null when its last output says it. */
  reason: string | null
  /** The last lines it wrote. */
  output: readonly string[]
  /** It is stopped because no Node new enough was found to start it with (hooks/node.ts). */
  needsNode?: boolean
}

export type ViewInput = {
  helper: HelperStatus
  /** The helper's last answer; kept while it is stopped so the list stays. */
  snapshot: Snapshot | null
  /** The time now, in milliseconds, on the clock the recorder's heartbeat is stamped with. */
  now: number
  /** Tutorials whose script is asked for as soon as their preparation ends. */
  waitingForScript: readonly string[]
  lastBrandBySite: Readonly<Record<string, string>>
  notice: string | null
  /** The address last sent to the browser, the tutorial whose button sent it (null: the recorder setup's) and how far that got; null when none was. */
  link: { id: string | null; href: string; state: 'opening' | 'opened' | 'failed' } | null
  /** The tutorial whose Open review / Open film was pressed in the last few seconds; null when none was. */
  hint: string | null
  /** The helper's port: the review page's address is drawn as a link the surface opens itself. */
  port: number
  /** The presses being carried out now, each `<act>:<id>` (the id empty for a button of no tutorial). */
  pending: readonly string[]
  mode: 'light' | 'dark'
  /** The open tutorial: the one the person last opened or pressed a button on, kept by the supervisor; null (or gone): the first in order. */
  openId: string | null
  /** The tidy actions of the open tutorial: closed, the three links, or the rename field (the delete question is `question`). */
  more: RostrumRow['more']
  /** The one delete question, or null; drawn only on its own tutorial's card while that card is the open one. */
  question: Question | null
  /** Tutorials deleted in this session and not yet dismissed, the latest first: each a line with Undo. */
  deleted: readonly { id: string; name: string }[]
  setupOpen: boolean
  /** What the last install answered, or null before one. */
  installed: { dir: string; hasVendor: boolean } | null
  everConnected: boolean
  tipIndex: number
  /** For the helper stopped for want of Node: what a press would fetch (null: nothing is offered here) and where a fetch is. */
  node?: { offer: { version: string; mb: number; dir: string } | null; fetch: NodeFetch | null }
}

/**
 * A delete question (hooks/supervise.ts puts it and answers it): the tutorial it is for, the token its confirm must
 * bring back, when it was put, its words, the tutorial's name as shown, and the list's order then, which stays the
 * order while the question is open.
 */
export type Question = { id: string; token: string; at: number; text: string; name: string; order: readonly string[] }

/**
 * Said under the recorder's light on the desktop, always, until the host is fixed (then remove this and its one use): there the first click into the panel only gives it the
 * keyboard, and no button hears it (docs/stage-b/panel-first-click.md).
 */
export const FIRST_CLICK = "A note from the developer: sometimes your first click on a button here won't work. It's a bug Anthropic needs to fix, so just click again until it does."

const STEPS = ['Record', 'Script', 'Approve', 'Narration', 'Build', 'Review']
/** How many of the six steps are done in each state; the next one is the current step. */
const DONE: Record<string, number> = { recorded: 1, scripted: 2, approved: 3, voiced: 4, built: 5, reviewed: 6, done: 6 }
export const doneOf = (state: string): number => DONE[state] ?? 0
/** "Narration, step 4 of 6", or "Approved, all 6 steps done". */
export function stepLine(state: string): string {
  const n = doneOf(state)
  return n >= 6 ? 'Approved, all 6 steps done' : `${STEPS[n]}, step ${n + 1} of 6`
}

const BUSY: Record<string, string> = {
  prepare: 'Preparing the recording', transcribe: 'Transcribing the audio', time: 'Timing the narration', measure: 'Measuring the screens',
  stills: 'Rendering frames to check', sweep: 'Checking the film for private data', render: 'Rendering the film',
}
/** A running stage in plain words (the short stages; the long ones have the bar). */
export function busyLine(t: Pick<Tutorial, 'busy' | 'state'>, isWaitingForScript = false): string {
  const words = t.busy === 'transcribe' && t.state !== 'recorded' ? 'Checking the narration against the script' : BUSY[t.busy ?? ''] ?? 'Working'
  return isWaitingForScript ? `${words}. The script starts when this ends.` : `${words}.`
}

const FAILED: Record<string, string> = {
  prepare: 'Preparing the recording failed', transcribe: 'Transcribing the audio failed', time: 'Timing the narration failed', measure: 'Measuring the screens failed',
  stills: 'Rendering frames failed', sweep: 'The check for private data failed', render: 'Rendering the film failed',
}
const button = (act: RostrumButton['act'], label: string, isPrimary = true): RostrumButton => ({ act, label, isPrimary, href: null })
/** The helper's words when Rostrum's own transcriber cannot start on a Windows PC (tools/fetch.mjs `NEEDS_RUNTIME`, tools/setup.mjs's step). */
const RUNTIME = /Visual C\+\+ runtime/

/** A failure: the warning sentence, the sentence under it, and its one button. */
export function failure(t: Pick<Tutorial, 'error' | 'state'>): { warn: string; line: string; buttons: RostrumButton[] } {
  const { stage, message } = t.error ?? { stage: '', message: '' }
  const said = message.trim().replace(/[.\s]+$/, '')
  if (stage === 'time' && /differ|not spoken/.test(said)) {
    const words = said.replace(/^(\d+) not spoken$/, (_m, n) => `${n} line${n === '1' ? '' : 's'} not spoken`)
    return { warn: `The narration does not match the script. ${words.charAt(0).toUpperCase()}${words.slice(1)}.`, line: 'Give a new take in chat, or press Keep to use this one.', buttons: [button('keep', 'Keep')] }
  }
  // (helper/whisper.mjs: Rostrum's own transcriber is there and cannot start, and there is no Python Whisper to fall back on)
  if (stage === 'transcribe' && RUNTIME.test(said)) return { warn: "The transcriber needs Microsoft's Visual C++ runtime, which most PCs already have but this one lacks.", line: 'Claude can help install it.', buttons: [button('fix', 'Ask Claude to set it up')] }
  if (stage === 'transcribe' && /not found/.test(said)) return { warn: 'Rostrum could not find the transcriber on this computer.', line: 'Claude can set it up for you.', buttons: [button('fix', 'Ask Claude to set it up')] }
  if (stage === 'sweep') {
    const n = /(\d+) place/.exec(said)?.[1] ?? 'some'
    return { warn: `The final check for private data found ${n} place${n === '1' ? '' : 's'} that need${n === '1' ? 's' : ''} a rule.`, line: 'Nothing was rendered. Ask in chat for them to be fixed, or press Retry to check again.', buttons: [button('retry', 'Retry')] }
  }
  return { warn: `${FAILED[stage] ?? 'A step failed'}${said ? `: ${said}` : ''}.`, line: 'Nothing was lost. Press Retry.', buttons: [button('retry', 'Retry')] }
}

const last = (renders: readonly string[]) => renders[renders.length - 1] ?? null
const versionOf = (file: string | null) => { const m = /^v(\d+)/.exec(file ?? ''); return m ? m[1] : null }
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const length = (t: Tutorial) => (t.length ? `, ${mmss(t.length)} long` : '')

/** Where a tutorial stands when nothing runs and nothing failed: one sentence and its one button (Archive is under More). */
export function idle(t: Tutorial): { line: string | null; buttons: RostrumButton[] } {
  const v = versionOf(last(t.renders))
  switch (t.state) {
    case 'recorded': return { line: t.noMic ? null : 'Recorded with your narration. Next, the script.', buttons: [button('script', 'Write script')] }
    case 'scripted': return { line: 'The script is written. Read it in chat and approve it there.', buttons: [button('viewScript', 'Show script')] }
    case 'approved': return { line: 'Give me the narration audio in chat.', buttons: [button('narration', 'Add narration')] }
    case 'voiced': return { line: 'The narration is in. Build the film next.', buttons: [button('build', 'Build')] }
    case 'built': return { line: `Version ${v ?? '1'} is built${length(t)}. Watch it, then send notes or approve it.`, buttons: [button('review', 'Open review')] }
    case 'reviewed': return { line: `Version ${v ?? '1'} is the finished film${length(t)}. It is in your Rostrum folder.`, buttons: [button('film', 'Open film')] }
    default: return { line: null, buttons: [] }
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const recordedAt = (id: string): number | null => { const m = /^rec-(\d{12,14})$/.exec(id); return m ? Number(m[1]) : null }
/** "Oct 12, 13:34": when a recording was started (its id is that time), or null for an id that is not a recording's. */
export function recordedWhen(id: string): string | null {
  const at = recordedAt(id)
  if (at === null) return null
  const d = new Date(at), two = (n: number) => String(n).padStart(2, '0')
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${two(d.getHours())}:${two(d.getMinutes())}`
}

// The open tutorial's name is drawn as a markdown heading, the one way to a larger size: `#` is a level larger, `###` one smaller.
const HEADING = '##'
const HEADING_CHARS = 34 // one line of a pane about 380 px wide; Markdown cannot truncate, so the string is cut here

/**
 * The title, or until the script names it "<site> · <when>" ("mail.example.com · Oct 12, 13:34"; "Recording" for a
 * recording with no site), so two untitled recordings are never the same words. Within the heading's budget: a long
 * site is cut, the time never.
 * ponytail: a collapsed card's name shares its line with a button and the host cuts what does not fit from the end;
 * in a pane much narrower than 380 px that could reach the time. Lower HEADING_CHARS here if that is ever seen.
 */
export function headingOf(t: Pick<Tutorial, 'id' | 'title'> & { site?: string }): string {
  if (t.title) return t.title
  const when = recordedWhen(t.id) ?? t.id, room = Math.max(4, HEADING_CHARS - when.length - 3)
  const site = [...(t.site?.trim() || 'Recording')]
  return `${site.length > room ? `${site.slice(0, room - 1).join('')}…` : site.join('')} · ${when}`
}

/** The delete question's words: which tutorial, when it was recorded and where, and what becomes of it. */
export function deleteQuestion(t: Pick<Tutorial, 'id' | 'title' | 'site'>): string {
  const when = recordedWhen(t.id), site = t.site.trim()
  return `Delete "${headingOf(t)}"${when ? `, recorded ${when}` : ''}${site ? `, from ${site}` : ''}? It goes to Rostrum's trash and can be brought back.`
}
/**
 * A name as one markdown heading line in which nothing of the name is markdown: one line, cut to `max` characters with
 * an ellipsis, every character markdown reads escaped. The full name stays in the row for the rename field.
 */
export function headingMarkdown(name: string, max = HEADING_CHARS): string {
  const chars = [...name.replace(/\s+/g, ' ').trim()]
  const cut = chars.length > max ? `${chars.slice(0, max - 1).join('').trimEnd()}…` : chars.join('')
  // ponytail: a bare address (www.example.test) may still be linked by a renderer that links plain text; it is the
  // person's own title and a press only opens it. Break it with a zero-width space if that ever matters.
  const safe = cut.replace(/[\\`*_[\]<>#|~!&:]/g, '\\$&').replace(/^[-+]/, '\\$&').replace(/^(\d+)([.)])/, '$1\\$2')
  return `${HEADING} ${safe}`
}

/** Is the recorder connected: did its heartbeat reach the helper within the last minute? */
export function recorderConnected(lastSeen: number | null, now: number): boolean {
  return lastSeen !== null && now - lastSeen < RECORDER_FRESH_MS
}
/** The brand a tutorial's picker shows: its own, else the one last picked for its site (when that brand still exists). */
export function brandShown(t: Pick<Tutorial, 'brand' | 'site'>, brands: readonly string[], lastBrandBySite: Readonly<Record<string, string>>): string | null {
  if (t.brand && brands.includes(t.brand)) return t.brand
  const remembered = t.site ? lastBrandBySite[t.site] : undefined
  return remembered && brands.includes(remembered) ? remembered : null
}

/**
 * The newest recording first (the time in the recording's id, which never changes), then by id. Nothing in it follows
 * a tutorial's state, progress or failure, so no card ever moves under the pointer because of what a step did: a
 * failed tutorial shows its warning where it stands.
 */
export function inOrder(tutorials: readonly Tutorial[]): Tutorial[] {
  return [...tutorials].sort((a, b) => (recordedAt(b.id) ?? 0) - (recordedAt(a.id) ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}
export const isListed = (t: Tutorial): boolean => !t.archived && t.state !== 'done'
/**
 * The list as it is drawn: the open one at the top, the rest in order. While a delete question is open (`frozen`, the
 * order when it was put) nothing changes place: a tutorial that arrives meanwhile goes to the end until it closes.
 */
export function drawnOrder(listed: readonly Tutorial[], openId: string | null, frozen: readonly string[] | null = null): Tutorial[] {
  const ordered = [...listed.filter((t) => t.id === openId), ...inOrder(listed.filter((t) => t.id !== openId))]
  if (!frozen) return ordered
  const place = (t: Tutorial) => { const i = frozen.indexOf(t.id); return i < 0 ? frozen.length : i }
  return ordered.sort((a, b) => place(a) - place(b)) // stable: the newcomers keep their own order at the end
}

/**
 * What a pressed button says while its press is carried out, by what the press does (a tutorial's acts, and the
 * panel's own buttons). An act that is not here is done at once and is never shown as pending.
 */
export const PENDING: Readonly<Record<string, string>> = {
  film: 'Opening…', review: 'Opening…', extensions: 'Opening…',
  script: 'Starting…', build: 'Starting…', keep: 'Starting…', retry: 'Starting…', restart: 'Starting…',
  archive: 'Archiving…', confirmDelete: 'Deleting…', undo: 'Bringing it back…', install: 'Installing…', setUp: 'Setting up…', fetchNode: 'Downloading…',
  viewScript: 'Asking Claude…', narration: 'Asking Claude…', fix: 'Asking Claude…', fixHelper: 'Asking Claude…', fixTranscriber: 'Asking Claude…',
}

/**
 * The line under one tutorial's buttons (or the recorder setup's, `id` null) after a press on Open: the warning with
 * the address when no opener worked, else for a few seconds the plain word that a page takes a moment. An address that
 * was sent well is not shown.
 */
function linkOf(input: ViewInput, id: string | null): RostrumLink | null {
  const l = input.link
  if (l && l.id === id && l.state === 'failed') return { line: 'The browser could not be opened. Open this address yourself:', isWarning: true, href: l.href }
  return id !== null && input.hint === id ? { line: 'The page can take a few moments to open. If nothing happens, press again in a few seconds.', isWarning: false, href: null } : null
}

/** An id that may stand in a link the surface opens (the helper's own are: letters, digits, dot, dash, underscore). */
const LINKABLE = /^[A-Za-z0-9._-]+$/
/**
 * Open review / Open film with the review page's own address, so a surface that draws links opens it itself, at once,
 * with no press travelling to the panel and back (on the live pane a press was seen to arrive seconds late).
 */
const linked = (b: RostrumButton, id: string, port: number): RostrumButton =>
  (b.act === 'review' || b.act === 'film') && LINKABLE.test(id) ? { ...b, href: routes(port).review(id) } : b

/** New pieces being made in the chat with no word of it for this long: the card offers a way to stop showing it. */
export const STALE_MS = 6 * 60 * 60 * 1000
const isStale = (p: NonNullable<Tutorial['progress']>, now: number): boolean => p.phase === 'making' && p.at !== null && now - p.at >= STALE_MS

function row(t: Tutorial, input: ViewInput, brands: readonly string[], isOpen: boolean): RostrumRow {
  const isWaiting = input.waitingForScript.includes(t.id)
  const progress: RostrumProgress | null = t.progress ? { pct: t.progress.pct, label: t.progress.label, note: t.progress.note, isDone: t.progress.pct >= 100, isStale: isStale(t.progress, input.now) } : null
  let warn: string | null = t.state === 'recorded' && t.noMic && !t.error ? 'No microphone audio in this recording. Record it again, or type notes for the script in chat.' : null
  let line: string | null = null, buttons: RostrumButton[] = []
  if (progress) line = null
  else if (t.busy) line = busyLine(t, isWaiting)
  else if (t.error) ({ warn, line, buttons } = failure(t))
  else ({ line, buttons } = idle(t))
  // the question is drawn on its own tutorial's card and no other: a card that is not that tutorial's never has it
  const q = input.question, ask = isOpen && q && q.id === t.id ? { text: q.text, token: q.token } : null
  return {
    id: t.id, name: headingOf(t), isOpen, done: doneOf(t.state), stepLine: stepLine(t.state), warn, isFailed: !!t.error && !t.busy && !progress, line, buttons: buttons.map((b) => linked(b, t.id, input.port)),
    brand: isOpen && brands.length > 1 ? { options: [...brands], value: brandShown(t, brands, input.lastBrandBySite) } : null,
    progress, more: ask ? 'delete' : isOpen && input.more !== 'delete' ? input.more : 'closed', ask, link: linkOf(input, t.id),
  }
}

const upper = (words: string) => words.charAt(0).toUpperCase() + words.slice(1)
/**
 * The first-run setup card (the helper's tools/setup.mjs does the work): what one press fetches and where it goes,
 * the run's bar, a failed step and "Try again", and where the transcriber stands when setup fetches none. Null when
 * this copy of Rostrum lacks nothing and has a transcriber.
 */
export function installOf(st: Setup | null | undefined): NonNullable<RostrumView['install']> | null {
  if (!st) return null
  const missing = st.steps.filter((x) => !x.done), last = st.last
  const hasFailed = !st.running && missing.length > 0 && last?.state === 'failed'
  // a transcriber that is in place and cannot start is not something the press fetches: it is said as a note, outside the list
  const needsRuntime = missing.some((x) => x.name === 'transcriber' && RUNTIME.test(x.what)), fetched = missing.filter((x) => !(x.name === 'transcriber' && RUNTIME.test(x.what)))
  // (`none` comes only from a computer Rostrum has no transcriber of its own for, a Mac: the helper's tools/setup.mjs `transcriberPlan`)
  const transcriber = needsRuntime ? { line: "Rostrum's transcriber is in place but cannot start without Microsoft's Visual C++ runtime, which most PCs already have. Claude can help install it; its English model is fetched after that.", isMissing: true }
    : st.transcriber === 'none' ? { line: "There is no transcriber on this computer yet, and Rostrum's own transcriber is not available for this computer yet. Claude can set one up for you.", isMissing: true }
    : st.transcriber === 'python' && (missing.length > 0 || st.running) ? { line: 'To turn speech into text Rostrum uses the Whisper that is already on this computer.', isMissing: false } : null
  if (!missing.length && !st.running && !transcriber) return null
  return {
    title: missing.length || st.running ? 'Set up Rostrum' : 'Rostrum has no transcriber',
    lines: fetched.length ? ['Rostrum needs a few things it does not ship with. One press fetches them:', ...fetched.map((x) => `- ${upper(x.what)}`)] : [],
    where: fetched.length ? `They go into this plugin's own folder${fetched.some((x) => x.name === 'transcriber') && st.data ? ` and ${st.data}` : ''}. Nothing is sent anywhere.` : null,
    button: st.running || !missing.length ? null : hasFailed ? 'Try again' : 'Download and set up',
    progress: st.running ? { pct: last?.pct ?? 0, label: last?.label || 'Starting', note: null, isDone: false, isStale: false } : null,
    warn: hasFailed ? `${last!.note ?? 'Setup did not finish.'} Nothing is broken: Try again carries on from there.` : null,
    transcriber,
  }
}

/**
 * The stopped block of a computer with no Node new enough: what one press downloads (hooks/node.ts `installNode`), from
 * where, how big and where to, its bar while it runs, and a failed fetch with "Try again". Where nothing can be
 * fetched (Linux) it says what to do instead.
 */
function nodeOf(input: ViewInput): NonNullable<RostrumView['status']['node']> | null {
  if (input.helper.status !== 'stopped' || !input.helper.needsNode) return null
  const offer = input.node?.offer ?? null, f = input.node?.fetch ?? null
  const isRunning = !!f && f.state !== 'failed' && f.state !== 'done'
  return {
    lines: offer ? [`One press downloads Node ${offer.version} from nodejs.org (about ${offer.mb} MB), checks it against the checksum nodejs.org publishes for it, and puts it in ${offer.dir}. Nothing else on this computer is changed.`]
      : ['Install Node 22 from nodejs.org, then press Start Rostrum again.'],
    button: !offer || isRunning ? null : f?.state === 'failed' ? 'Try again' : 'Download Node 22',
    progress: isRunning ? { pct: f.pct, label: f.label, note: null, isDone: false, isStale: false } : null,
    warn: f?.state === 'failed' ? f.note : null,
  }
}

/** Everything the pane draws. */
export function viewOf(input: ViewInput): RostrumView {
  const h = input.helper, s = input.snapshot
  const isUp = h.status === 'running' && !!s
  const install = isUp ? installOf(s!.setup) : null
  // until this copy of Rostrum has what it needs nothing can be made: the rows wait, and the recorder's setup comes after
  const isLacking = !!install && (install.lines.length > 0 || !!install.progress)
  const listed = s ? inOrder(s.tutorials.filter(isListed)) : []
  const openId = listed.some((t) => t.id === input.openId) ? input.openId : listed[0]?.id ?? null
  const ordered = drawnOrder(listed, openId, input.question && input.question.id === openId ? input.question.order : null)
  const tutorials = isUp && !isLacking ? ordered.map((t) => row(t, input, s!.brands, t.id === openId))
    : ordered.map((t) => ({ ...row(t, input, [], false), line: isLacking ? 'Waiting for setup' : 'Waiting', warn: null, isFailed: false, buttons: [], progress: null, brand: null, more: 'closed' as const, ask: null }))
  const isConnected = !!s && recorderConnected(s.lastSeen, input.now)
  const needsNode = nodeOf(input)
  const status: RostrumView['status'] = h.status === 'stopped'
    ? { line: h.needsNode ? 'Rostrum needs Node' : 'Rostrum has stopped', isConnected: false, isStopped: true, reason: h.reason ?? h.output.map((l) => l.trim()).filter(Boolean).slice(-1)[0] ?? null, fixPrompt: h.needsNode ? PROMPTS.setup('Node for the helper') : null, ...(needsNode ? { node: needsNode } : {}) }
    : h.status === 'starting' || !s ? { line: 'Rostrum is starting', isConnected: false, isStopped: false, reason: null, fixPrompt: null }
    : { line: isConnected ? 'Recorder connected' : 'Recorder not connected', isConnected, isStopped: false, reason: null, fixPrompt: null }
  const dir = `${(s?.home ?? '').replace(/[\\/]+$/, '')}${(s?.home ?? '').includes('/') && !(s?.home ?? '').includes('\\') ? '/' : '\\'}Recorder`
  const showSetupButton = !input.everConnected && !isConnected
  // The way into setup: the empty state's own button for a recorder never connected, else a dim link in the status line
  // while the recorder is not connected (it may need installing again); none while it is, setup being done.
  const showLink = input.setupOpen || (!isConnected && !(showSetupButton && listed.length === 0))
  const setup = isUp && !isLacking ? { isOpen: input.setupOpen, showLink, dir: input.installed?.dir ?? dir, hasVendor: input.installed?.hasVendor ?? true, installed: !!input.installed } : null
  const empty = isUp && !isLacking && tutorials.length === 0 ? { title: 'Nothing in progress', line: 'Record a walkthrough in Chrome and it appears here.', showSetupButton } : null
  const tip = isUp && !isLacking && !input.setupOpen && !showSetupButton ? tipAt(input.tipIndex) : null
  const pending = Object.fromEntries(input.pending.map((key) => [key, PENDING[key.slice(0, key.indexOf(':'))] ?? 'Working…']))
  return { mode: input.mode, status, install, setup, notice: input.notice, link: linkOf(input, null), pending, deleted: isUp ? input.deleted.map((d) => ({ id: d.id, name: d.name })) : [], tutorials, empty, tip }
}

/** A compact string of what is shown: the pane is drawn again only when it changes. */
export const viewKey = (view: RostrumView): string => JSON.stringify(view)
