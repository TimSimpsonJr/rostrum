// What the panel knows about the local helper (helper/server.mjs): its addresses, which route a button or a retry
// calls, the prompts the buttons submit, how it is started and how a page is opened. Pure: no engine, no Node.
// The helper owns every tutorial's state; nothing here decides anything about a tutorial.

export type Platform = 'windows' | 'mac' | 'linux'

/** One tutorial as `GET /tutorials` lists it (helper/tutorial.mjs), cut to what the panel shows. */
export type Tutorial = {
  id: string
  title: string | null
  site: string
  brand: string | null
  state: string
  busy: string | null
  error: { stage: string; message: string } | null
  noMic: boolean
  renders: string[]
  /** A long step under way: its phase, the phase's words, the whole step's percentage, the builder's latest plain note, and when it was last told (ms). */
  progress: { phase: string; label: string; pct: number; note: string | null; at: number | null } | null
  archived: boolean
  /** The latest film's length in seconds. */
  length: number | null
}

/**
 * First-run setup as the helper tells it (tools/setup.mjs `setupState`), checked: the steps (`what`: what a step
 * fetches, in the helper's words), where the transcriber stands (`python`: the one already on the computer is used;
 * `none`: there is none and none is fetched), and the latest word of a run.
 */
export type Setup = {
  needed: boolean
  running: boolean
  data: string
  transcriber: string
  steps: { name: string; done: boolean; what: string }[]
  last: { state: string; label: string; pct: number; note: string | null } | null
}

/** The answer of `GET /tutorials`, checked. `setup`: null from a helper that does not tell it (an older one). */
export type Snapshot = { tutorials: Tutorial[]; lastSeen: number | null; brands: string[]; home: string | null; requests: { n: number; id: string; kind: 'notes' }[]; setup?: Setup | null }

export const DEFAULT_PORT = 4600
export const ID = /^[\w-]{1,64}$/
/** The recorder's heartbeat is every 20 s: three missed and it is not connected. */
export const RECORDER_FRESH_MS = 60_000

/** The helper's port: ROSTRUM_PORT when it is a port number, else 4600. */
export function portOf(value: string | undefined): number {
  const n = Number(value)
  return value && Number.isInteger(n) && n > 0 && n < 65536 ? n : DEFAULT_PORT
}

export const baseUrl = (port: number) => `http://127.0.0.1:${port}`

/** The helper's addresses for one port. Ids are checked before they reach a path. */
export function routes(port: number) {
  const base = baseUrl(port)
  const one = (id: string) => `${base}/tutorials/${encodeURIComponent(id)}`
  return {
    health: `${base}/health`,
    tutorials: `${base}/tutorials`,
    tutorial: one,
    state: (id: string) => `${one(id)}/state`,
    /** Brings a deleted tutorial back from the helper's trash. */
    restore: (id: string) => `${one(id)}/restore`,
    stage: (id: string, stage: string) => `${one(id)}/${stage}`,
    /** Answers 409 while there is no clean copy and 404 once there is one; no screen has this number, so nothing is read. */
    prepared: (id: string) => `${one(id)}/elements?screen=9999`,
    page: (id: string) => `${one(id)}/page`,
    review: (id: string) => `${base}/review/?tutorial=${encodeURIComponent(id)}`,
    progress: (id: string) => `${one(id)}/progress`,
    install: `${base}/recorder/install`,
    /** First-run setup: POST starts it (tools/setup.mjs); its state comes with the list. */
    setup: `${base}/setup`,
    requestDone: (n: number) => `${base}/requests/${n}/done`,
  }
}

/** The stages the helper runs, and the route that runs each again after a failure. */
const RETRY: Record<string, { route: string; body?: Record<string, unknown> }> = {
  prepare: { route: 'prepare' },
  transcribe: { route: 'transcribe' },
  time: { route: 'time' },
  measure: { route: 'measure' },
  // the stills route needs to be told which frames: the film's own moments (each beat's cue and each click)
  stills: { route: 'stills', body: { moments: true } },
  sweep: { route: 'sweep' },
  render: { route: 'render' },
}

/** The route (and body) that runs a failed stage again, or null for a stage the helper does not have. */
export function retryRoute(stage: string): { route: string; body?: Record<string, unknown> } | null {
  return Object.hasOwn(RETRY, stage) ? RETRY[stage]! : null
}

/** The prompts the buttons submit, word for word what the skill (skills/rostrum/SKILL.md) starts on: nothing is added. */
export const PROMPTS = {
  script: (id: string) => `Rostrum: write the script for tutorial ${id}`,
  showScript: (id: string) => `Rostrum: show the script for tutorial ${id}`,
  narration: (id: string) => `Rostrum: add narration for tutorial ${id}`,
  build: (id: string) => `Rostrum: build tutorial ${id}`,
  notes: (id: string) => `Rostrum: fix the review notes for tutorial ${id}`,
  setup: (what: string) => `Rostrum: set up ${what}`,
}

/** Windows when the host's environment says so, else what `uname -s` printed. */
export function platformOf(os: string | undefined, uname: string | undefined): Platform {
  if (os === 'Windows_NT') return 'windows'
  return (uname ?? '').trim() === 'Darwin' ? 'mac' : 'linux'
}

/**
 * The commands that open an address in the person's browser, in the order they are tried: the next one only when the
 * one before could not be started or said it failed. The address is one of ours (routes), never a tutorial's text.
 */
export function openArgvs(platform: Platform, url: string): string[][] {
  // a chrome:// address is not one the default browser's opener takes: Chrome itself is started with it
  if (/^chrome:/.test(url)) return [platform === 'windows' ? ['cmd', '/c', 'start', '', 'chrome', url] : platform === 'mac' ? ['open', '-a', 'Google Chrome', url] : ['google-chrome', url]]
  // Windows: the shell's own opener first (its argument is the address as it is, where cmd reads & | > ^ in one), then cmd's
  if (platform === 'windows') return [['rundll32', 'url.dll,FileProtocolHandler', url], ['cmd', '/c', 'start', '', url]]
  return [platform === 'mac' ? ['open', url] : ['xdg-open', url]]
}

/** The tutorials folder: the stored choice, else ROSTRUM_HOME, else Rostrum in the home folder's videos folder, which a Mac calls Movies (as the helper's own default, tools/data.mjs `tutorialsHome`). */
export function tutorialsDir(from: { stored?: unknown; rostrumHome?: string; userProfile?: string; home?: string; platform: Platform }): string | null {
  if (typeof from.stored === 'string' && from.stored.trim()) return from.stored.trim()
  if (from.rostrumHome?.trim()) return from.rostrumHome.trim()
  const windows = from.platform === 'windows', root = (windows ? from.userProfile : from.home)?.trim()
  if (!root) return null
  const sep = windows ? '\\' : '/'
  return [root.replace(/[\\/]+$/, ''), from.platform === 'mac' ? 'Movies' : 'Videos', 'Rostrum'].join(sep)
}

/** How the helper is started, from the plugin's folder. Its port and transcriber come from the environment it inherits. */
export function helperArgv(node: string | undefined, dir: string | null): string[] {
  return [node?.trim() || 'node', '--experimental-strip-types', 'helper/server.mjs', ...(dir ? ['--tutorials', dir] : [])]
}

/** The last `keep` lines of the helper's output after `text` arrived (pieces end anywhere; a line may span two). */
export function tail(lines: readonly string[], text: string, keep = 4): string[] {
  const all = [...lines]
  const parts = text.replace(/\r/g, '').split('\n')
  if (all.length) all[all.length - 1] += parts.shift() ?? ''
  all.push(...parts)
  const whole = all.filter((line, i) => line.trim() || i === all.length - 1)
  return whole.slice(-(keep + 1)).map((line) => line.slice(0, 200))
}

const text = (v: unknown, max: number): string | null => (typeof v === 'string' ? v.slice(0, max) : null)

function tutorialOf(v: unknown): Tutorial | null {
  if (!v || typeof v !== 'object') return null
  const t = v as Record<string, unknown>
  if (typeof t.id !== 'string' || !ID.test(t.id) || typeof t.state !== 'string') return null
  const e = t.error && typeof t.error === 'object' ? (t.error as Record<string, unknown>) : null
  const p = t.progress && typeof t.progress === 'object' ? (t.progress as Record<string, unknown>) : null
  return {
    id: t.id,
    title: text(t.title, 120)?.trim() || null,
    site: text(t.site, 120) ?? '',
    brand: text(t.brand, 120),
    state: t.state.slice(0, 20),
    busy: text(t.busy, 20),
    error: e ? { stage: text(e.stage, 20) ?? '', message: text(e.message, 400) ?? '' } : null,
    noMic: !!(t.flags && typeof t.flags === 'object' && (t.flags as Record<string, unknown>).noMic),
    renders: Array.isArray(t.renders) ? t.renders.filter((f): f is string => typeof f === 'string').map((f) => f.slice(0, 40)) : [],
    progress: p && typeof p.pct === 'number' && Number.isFinite(p.pct) ? { phase: text(p.phase, 20) ?? '', label: text(p.label, 40) ?? '', pct: Math.max(0, Math.min(100, Math.round(p.pct))), note: text(p.note, 120), at: typeof p.at === 'string' && Number.isFinite(Date.parse(p.at)) ? Date.parse(p.at) : null } : null,
    archived: t.archived === true,
    length: typeof t.length === 'number' && Number.isFinite(t.length) ? t.length : null,
  }
}

/** One tutorial from the body of `GET /tutorials/<id>`, or null. */
export function parseTutorial(body: string): Tutorial | null {
  try { return tutorialOf(JSON.parse(body)) } catch { return null }
}

function setupOf(v: unknown): Setup | null {
  if (!v || typeof v !== 'object') return null
  const s = v as Record<string, unknown>, l = s.last && typeof s.last === 'object' ? (s.last as Record<string, unknown>) : null
  if (!Array.isArray(s.steps)) return null
  return {
    needed: s.needed === true,
    running: s.running === true,
    data: text(s.data, 400) ?? '',
    transcriber: text(s.transcriber, 20) ?? '',
    steps: s.steps.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object').map((x) => ({ name: text(x.name, 20) ?? '', done: x.done === true, what: text(x.what, 160) ?? '' })),
    last: l ? { state: text(l.state, 20) ?? '', label: text(l.label, 60) ?? '', pct: typeof l.pct === 'number' && Number.isFinite(l.pct) ? Math.max(0, Math.min(100, Math.round(l.pct))) : 0, note: text(l.note, 300) } : null,
  }
}

/** The body of `GET /tutorials` as a snapshot, or null when it is not the helper's answer. */
export function parseTutorials(body: string): Snapshot | null {
  let j: unknown
  try { j = JSON.parse(body) } catch { return null }
  if (!j || typeof j !== 'object') return null
  const o = j as Record<string, unknown>
  if (!Array.isArray(o.tutorials)) return null
  const seen = o.recorder && typeof o.recorder === 'object' ? (o.recorder as Record<string, unknown>).lastSeen : null
  return {
    tutorials: o.tutorials.map(tutorialOf).filter((t): t is Tutorial => t !== null),
    lastSeen: typeof seen === 'number' && Number.isFinite(seen) ? seen : null,
    brands: Array.isArray(o.brands) ? o.brands.filter((b): b is string => typeof b === 'string' && b.length > 0 && b.length <= 120) : [],
    home: text(o.home, 400),
    requests: Array.isArray(o.requests) ? o.requests.filter((r): r is { n: number; id: string; kind: 'notes' } => !!r && typeof r === 'object' && Number.isInteger(r.n) && typeof r.id === 'string' && ID.test(r.id) && r.kind === 'notes').map((r) => ({ n: r.n, id: r.id, kind: r.kind })) : [],
    setup: setupOf(o.setup),
  }
}

/** The helper's own words for a refusal (`{ error }`, or a short plain body), cut short; '' when it gave none. */
export function refusal(body: string): string {
  try {
    const j = JSON.parse(body) as { error?: unknown }
    if (typeof j?.error === 'string') return j.error.slice(0, 160)
  } catch { /* a plain body */ }
  return body.length <= 60 ? body.trim() : ''
}
