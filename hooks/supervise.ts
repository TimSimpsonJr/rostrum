// The panel's work between the engine and the helper: start or adopt the helper, restart it once, poll it every 2 s
// into the view, and carry a button press to the route or prompt it stands for. It talks to the world only through
// `Host` (hooks/register.tsx builds one from the engine's `$`; the tests build one from fakes), and keeps nothing a
// tutorial owns: every press reads the tutorial's state from the helper first. What it does keep is the panel's own:
// which row is open, its tidy actions, the setup block, the theme, the tip.
import type { RostrumAct, RostrumRow, RostrumView } from '../types'
import { PROMPTS, helperArgv, openArgvs, parseTutorial, parseTutorials, platformOf, portOf, refusal, retryRoute, routes, tail, tutorialsDir } from './helper.ts'
import type { Platform, Snapshot, Tutorial } from './helper.ts'
import { findNode, installNode, nodeOffer } from './node.ts'
import type { NodeEnv, NodeFetch, Run } from './node.ts'
import { PENDING, brandShown, deleteQuestion, drawnOrder, headingOf, inOrder, isListed, viewKey, viewOf } from './view.ts'
import type { HelperStatus, Question, ViewInput } from './view.ts'

export type Reply = { status: number; ok: boolean; text: string }
export type Chunk = { stream: string; text: string }

/** What the supervisor needs of the engine. */
export type Host = {
  fetch: (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<Reply>
  /** Starts a program; the stream is its output, then how it ended. It ends with the module. */
  spawn: (request: { argv: string[]; cwd: string }) => AsyncIterator<Chunk, { code: number | null }>
  /** Runs a command to its end (`timeoutMs`: how long it may take, RUN_TIMEOUT_MS when absent; `env`: variables set over the host's). */
  run: Run
  now: () => Promise<number>
  /** Resolves after `ms` milliseconds. */
  sleep: (ms: number) => Promise<unknown>
  /** Starts a turn in the session with this text. */
  submit: (text: string) => Promise<unknown>
  storeGet: (key: string) => Promise<unknown>
  storeSet: (key: string, value: unknown) => Promise<void>
  /** Writes the view the pane draws. */
  publish: (view: RostrumView) => Promise<unknown>
  /** The host's theme name (the `theme` row of its settings), or null when it has none. */
  theme: () => Promise<string | null>
  /** Puts text on the clipboard of the surface the press came from. */
  copy: (text: string, surface?: string) => Promise<{ isCopied: boolean }>
  /** The plugin's folder. */
  root: string
  /** The host's environment, read once. */
  env: { os?: string; rostrumHome?: string; port?: string } & NodeEnv
}

export const STORE = { tutorialsDir: 'tutorialsDir', lastBrandBySite: 'lastBrandBySite', recorderEverConnected: 'recorderEverConnected', tipIndex: 'tipIndex' }

const JSON_HEADERS = { 'content-type': 'application/json' }
/** How long `Host.run` lets a command run before it is given up on. */
export const RUN_TIMEOUT_MS = 10_000
/** How long a pressed Open button says "Opening…" at the least; an opener still running then did start a browser. */
export const OPEN_FLOOR_MS = 1500
/** How long the line under a pressed Open button stays, unless another press comes first. */
export const HINT_MS = 8000
/** How long a delete question can be answered: an older one is closed, and its confirm deletes nothing. */
export const QUESTION_MS = 30_000
const NOTHING_DELETED = 'Nothing was deleted: the question had closed. Press Delete again if it should still go.'

/** What the pane says of a press that threw: one plain line, never nothing. */
export function failureNotice(err: unknown): string {
  const said = (err instanceof Error ? err.message : String(err ?? '')).split('\n')[0]!.trim().replace(/[.\s]+$/, '').slice(0, 160)
  return `That did not work: ${said || 'no reason was given'}.`
}

/** A theme whose name begins "light" is light; anything else, or none, is dark. */
export const modeOf = (theme: string | null): 'light' | 'dark' => (typeof theme === 'string' && /^light/.test(theme) ? 'light' : 'dark')

/** Why the helper is stopped, in words for the person, from how it ended and its last lines. */
export function reasonOf(code: number | null, output: readonly string[]): string {
  const port = /EADDRINUSE[^\n]*?:(\d+)/.exec(output.join('\n'))?.[1]
  if (port) return `Port ${port} is in use by another program.`
  return `Rostrum's helper stopped${code === null ? '' : ` (exit code ${code})`} and did not stay up when started again.`
}

export function createSupervisor(host: Host) {
  const at = routes(portOf(host.env.port))
  const helper: { status: HelperStatus['status']; isOwned: boolean; reason: string | null; output: string[]; needsNode: boolean } = { status: 'starting', isOwned: false, reason: null, output: [], needsNode: false }
  let snapshot: Snapshot | null = null
  let notice: string | null = null
  // the address last sent to the browser, shown to press in case nothing opened: under the tutorial whose button it was
  // (`id` null: the recorder setup's). It stays until the next press in the panel or the next opening of the pane.
  let link: ViewInput['link'] = null
  // The presses being carried out now, each `<act>:<id>` (the id empty for a button of no tutorial): the view draws
  // such a button with its "…" label, and a second press on it is not taken.
  const pending = new Set<string>()
  // the tutorial whose Open button was last pressed: "The page can take a few moments to open…" under its buttons
  let hint: { id: string } | null = null
  // The one delete question. It belongs to a tutorial by id, not to "the open row": it is drawn on that tutorial's
  // card only, it is closed (never moved to another card) by any press but its own confirm, by its tutorial leaving
  // the list or no longer being the open card, by anything above the list changing (the cards may have moved), and
  // by its age; and while it is open the list keeps the order it had (`order`). `above` is what stood above the
  // list when it was first drawn.
  let question: (Question & { above?: string }) | null = null
  let asked = 0 // every question's token is new: the count of questions put, and the time
  // deleted in this session and not dismissed: each a line with Undo (they are in the helper's trash)
  let deleted: { id: string; name: string }[] = []
  // every press starts here: what the last one said goes, and so does a question (act keeps it for its own confirm)
  const clear = () => { notice = null; link = null; hint = null; question = null }
  let lastBrandBySite: Record<string, string> = {}
  let platform: Platform | null = null
  let arch = '' // a Mac's processor (`uname -m`): which Node archive is its own
  let nodeFetch: NodeFetch | null = null // where the fetch of Node is, from its press to its end or the next start
  let dir: string | null | undefined
  let child = 0 // which spawned helper is ours now: the end of an older one is ignored
  let hasRestarted = false
  let hasAnswered = false // has the helper now in use answered the list at least once
  let isTicking = false
  let lastKey = ''
  let shown: RostrumView | null = null
  let mode: 'light' | 'dark' = 'dark'
  // The open row: the one the person last opened or pressed a button on. With none (the start, or the open one
  // gone) the first in order is taken at the next poll and kept: what is open changes only by the person's hand.
  let openId: string | null = null
  let more: Exclude<RostrumRow['more'], 'delete'> = 'closed' // the delete question is `question`, with its own id
  let setupOpen = false
  let installed: { dir: string; hasVendor: boolean } | null = null
  let everConnected = false
  let tipIndex = 0
  const waitingForScript = new Set<string>()
  const submittedRequests = new Set<number>()

  const get = async (url: string): Promise<Reply | null> => { try { return await host.fetch(url) } catch { return null } }
  const post = async (url: string, body?: Record<string, unknown>): Promise<Reply | null> => {
    try { return await host.fetch(url, body ? { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body) } : { method: 'POST' }) } catch { return null }
  }
  const isHealthy = async () => { const r = await get(at.health); return !!r && r.status === 200 && r.text.trim() === 'ok' }
  const refused = (what: string, r: Reply | null) => {
    const said = r ? refusal(r.text) : ''
    notice = r ? `${what}: the helper answered "${said || r.status}".` : 'The helper did not answer. Check the status line above, then press the button again.'
  }

  const clock = async () => { const now = Number(await host.now().catch(() => NaN)); return Number.isFinite(now) ? now : Date.now() }
  const draw = (now: number) => viewOf({ helper, snapshot, now, waitingForScript: [...waitingForScript], lastBrandBySite, notice, link, hint: hint?.id ?? null, port: portOf(host.env.port), pending: [...pending], mode, openId, more, question, deleted, setupOpen, installed, everConnected, tipIndex, node: { offer: platform ? nodeOffer(host.env, platform, arch) : null, fetch: nodeFetch } })

  async function publish() {
    const now = await clock()
    let view = draw(now)
    if (question) {
      // The question stays only while it is drawn on its own tutorial's card, at the top, with everything above the
      // list as it was when it was put, and while it is young. Otherwise it is closed: never drawn somewhere else.
      const above = JSON.stringify([view.status, view.setup, view.notice, view.link, view.deleted, view.tutorials[0]?.id === question.id && view.tutorials[0]?.ask?.token === question.token])
      question.above ??= above
      if (above !== question.above || openId !== question.id || now - question.at >= QUESTION_MS) {
        question = null
        view = draw(now)
      }
    }
    shown = view
    const key = viewKey(view)
    if (key === lastKey) return
    lastKey = key
    // a write the engine refuses (the module is being unloaded) is tried again at the next poll
    await host.publish(view).catch(() => { lastKey = '' })
  }

  /** A press whose work may take more than a moment: shown as taken before anything is awaited, until it ends or fails. */
  async function during(key: string, work: () => Promise<unknown>) {
    if (pending.has(key)) return
    pending.add(key)
    try {
      await publish()
      await work()
    } finally {
      pending.delete(key)
      await publish()
    }
  }

  // read once, however many ask at the same time (the start and a press)
  let ready: Promise<void> | undefined
  const settings = () => (ready ??= load())
  async function load() {
    if (host.env.os !== 'Windows_NT') {
      const uname = await host.run(['uname', '-s']).catch(() => null)
      platform = platformOf(host.env.os, uname?.stdout)
    } else platform = 'windows'
    if (platform === 'mac') arch = (await host.run(['uname', '-m']).catch(() => null))?.stdout.trim() ?? ''
    const stored = await host.storeGet(STORE.tutorialsDir).catch(() => undefined)
    dir = tutorialsDir({ stored, rostrumHome: host.env.rostrumHome, userProfile: host.env.userProfile, home: host.env.home, platform })
    const brands = await host.storeGet(STORE.lastBrandBySite).catch(() => undefined)
    if (brands && typeof brands === 'object' && !Array.isArray(brands)) {
      lastBrandBySite = Object.fromEntries(Object.entries(brands as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === 'string'))
    }
    everConnected = (await host.storeGet(STORE.recorderEverConnected).catch(() => undefined)) === true
    const tip = await host.storeGet(STORE.tipIndex).catch(() => undefined)
    tipIndex = Number.isInteger(tip) ? (tip as number) : 0
    mode = modeOf(await host.theme().catch(() => null))
  }

  /** The host's theme changed: the two drawings are made again in its mode. */
  async function themeChanged() {
    mode = modeOf(await host.theme().catch(() => null))
    await publish()
  }

  /**
   * A helper already answering is adopted; else one is started from the plugin's folder, with the first Node found
   * that is new enough (hooks/node.ts). With none the helper cannot be started, and the stopped block says so.
   */
  async function start(): Promise<void> {
    helper.status = 'starting'
    helper.reason = null
    helper.needsNode = false
    await publish()
    await settings()
    hasAnswered = false
    if (await isHealthy()) {
      helper.isOwned = false
      helper.status = 'running'
      return tick()
    }
    const found = await findNode(host.run, host.env, platform ?? 'linux')
    if (!found.node) {
      helper.isOwned = false
      helper.status = 'stopped'
      helper.needsNode = true
      helper.reason = found.older ? `Rostrum needs Node 22 or newer. This computer has Node ${found.older}.` : 'Rostrum needs Node 22 or newer, which is not on this computer.'
      return publish()
    }
    const node = found.node.path
    const mine = ++child
    helper.isOwned = true
    void (async () => {
      let end: { code: number | null } | null = null, hasOutput = false
      try {
        const stream = host.spawn({ argv: helperArgv(node, dir ?? null), cwd: host.root })
        for (;;) {
          const piece = await stream.next()
          if (piece.done) { end = piece.value; break }
          hasOutput = true
          if (mine === child) helper.output = tail(helper.output, piece.value.text)
        }
      } catch {
        if (mine !== child) return
        if (!hasOutput) {
          // the first pull rejects when the program cannot be started at all; the list stays, as rows that wait
          helper.isOwned = false
          helper.status = 'stopped'
          helper.needsNode = true
          helper.reason = 'Rostrum could not start its helper: Node (version 22 or later) was not found on this computer.'
          return void publish()
        }
      }
      if (mine === child) await ended(end?.code ?? null)
    })()
  }

  /** Our helper ended. Another one answering (it had the port) is adopted; else one automatic restart; else stopped. */
  async function ended(code: number | null) {
    helper.isOwned = false
    if (await isHealthy()) {
      helper.status = 'running'
      return tick()
    }
    if (!hasRestarted) {
      hasRestarted = true
      return start() // the last lines of the one that ended are kept: with the second one's they say why
    }
    helper.status = 'stopped'
    helper.reason = reasonOf(code, helper.output)
    await publish()
  }

  /** "Start Rostrum again": a fresh start, with its one automatic restart again. */
  function restart() {
    return during('restart:', async () => {
      if (helper.status !== 'stopped') return
      hasRestarted = false
      clear()
      nodeFetch = null
      helper.output = []
      await start()
    })
  }

  /**
   * "Download Node 22" on the stopped block of a computer with no Node: the pinned one is fetched from nodejs.org into
   * the data folder, checked against its checksum before it is unpacked (hooks/node.ts), and the helper is started
   * with it. Each step is shown as it begins; a failure stays on the block, with "Try again".
   */
  function fetchNode() {
    return during('fetchNode:', async () => {
      if (helper.status !== 'stopped' || !helper.needsNode) return
      clear()
      await settings()
      const exe = await installNode(host.run, host.env, platform ?? 'linux', arch, async (s) => { nodeFetch = s; await publish() })
      if (!exe) return
      nodeFetch = null
      hasRestarted = false
      helper.output = []
      await start() // (it finds the one just fetched, in the data folder)
    })
  }

  /** The script of a tutorial that was waiting for its preparation is asked for once that has ended well. */
  async function askWaiting() {
    for (const id of [...waitingForScript]) {
      const t = snapshot?.tutorials.find((one) => one.id === id)
      if (t?.busy) continue
      waitingForScript.delete(id)
      if (t && t.state === 'recorded' && !t.error) await host.submit(PROMPTS.script(id)).catch(() => { notice = 'The script could not be asked for. Press Write script again.' })
    }
  }

  /** "Send notes to Claude" on the review page: each request is submitted once, then marked done at the helper. */
  async function drainRequests() {
    for (const r of snapshot?.requests ?? []) {
      if (submittedRequests.has(r.n)) continue
      submittedRequests.add(r.n)
      await host.submit(PROMPTS.notes(r.id)).catch(() => { submittedRequests.delete(r.n); notice = 'The notes could not be sent to Claude. Press Send notes again.' })
      await post(at.requestDone(r.n))
    }
  }

  /** One poll: the helper's list into the view. An adopted helper that stops answering is replaced by one of ours. */
  async function tick() {
    if (isTicking) return
    isTicking = true
    try {
      const r = await get(at.tutorials), next = r?.status === 200 ? parseTutorials(r.text) : null
      if (next) {
        // the first-run setup that was running has ended with nothing left to fetch: said once
        if (snapshot?.setup?.running && next.setup && !next.setup.running && !next.setup.needed) notice = 'Rostrum is set up.'
        snapshot = next
        hasAnswered = true
        if (helper.status !== 'running') { helper.status = 'running'; helper.reason = null; helper.needsNode = false }
        // the open row is gone (deleted, archived, finished): its tidy actions go with it, so a question put for
        // one tutorial is never answered for another
        if (openId && !next.tutorials.some((t) => t.id === openId && isListed(t))) { openId = null; more = 'closed'; question = null }
        // a deleted one that is back (restored from chat) needs no Undo
        deleted = deleted.filter((d) => !next.tutorials.some((t) => t.id === d.id))
        openId ??= inOrder(next.tutorials.filter(isListed))[0]?.id ?? null
        if (next.lastSeen !== null && !everConnected) {
          everConnected = true
          await host.storeSet(STORE.recorderEverConnected, true).catch(() => undefined)
        }
        await askWaiting()
        await drainRequests()
      } else if (helper.status === 'running' && !helper.isOwned && hasAnswered) {
        // the session that started it has ended: this one starts its own (the list stays, as rows that wait)
        void start()
        return
      }
      await publish()
    } finally { isTicking = false }
  }

  async function open(url: string, id: string | null) {
    // An opener can sit for seconds (the first one of a session, starting the browser, until its time limit), and none
    // of them can say that a page really appeared (on Windows they answer 0 whatever happened): the openers run on
    // behind the pane, and after the floor one still running is taken to have started a browser. Only all of them
    // failing is said, with the address to open by hand.
    const mine: NonNullable<ViewInput['link']> = (link = { id, href: url, state: 'opening' })
    await publish()
    let hasFailed = false
    const say = async (state: 'opened' | 'failed') => {
      if (link !== mine) return // a later press has cleared or replaced it
      mine.state = state
      await publish()
    }
    void (async () => {
      await settings()
      for (const argv of openArgvs(platform ?? 'linux', url)) {
        const began = Date.now()
        const r = await host.run(argv).catch(() => null)
        // one still running at the time limit did start a browser: that browser is what holds its output open
        if (r ? r.exitCode === 0 : Date.now() - began >= RUN_TIMEOUT_MS - 1000) return
      }
      // every opener failed: the line turns to the warning (at the end of the floor, when that is still to come)
      hasFailed = true
      if (mine.state === 'opened') await say('failed')
    })().catch(() => undefined)
    await host.sleep(OPEN_FLOOR_MS).catch(() => undefined)
    await say(hasFailed ? 'failed' : 'opened')
  }

  async function writeScript(t: Tutorial) {
    if (t.state !== 'recorded' || t.error) return
    const probe = await get(at.prepared(t.id))
    if (!probe) return refused('Write script', null)
    if (probe.status !== 409) return void (await host.submit(PROMPTS.script(t.id))) // there is a clean copy already
    const r = await post(at.stage(t.id, 'prepare'))
    if (r?.status !== 202) return refused('Write script', r)
    waitingForScript.add(t.id)
  }

  async function build(t: Tutorial) {
    // the brand the picker shows is the brand the film gets: one remembered for the site is written before the build
    const brands = snapshot?.brands ?? []
    const picked = brands.length > 1 ? brandShown(t, brands, lastBrandBySite) : null
    if (picked && picked !== t.brand) {
      const r = await post(at.state(t.id), { brand: picked })
      if (!r?.ok) return refused('Build', r)
    }
    await host.submit(PROMPTS.build(t.id))
  }

  async function retry(t: Tutorial) {
    if (!t.error) return
    const again = retryRoute(t.error.stage)
    if (!again) { notice = `Retry: the panel does not know the stage "${t.error.stage}". Ask in chat for it to be run again.`; return }
    // the stage's own route clears the error as it starts (helper/server.mjs `begin`); a refused one leaves the error
    // standing, which the `retry` event sent first would have wiped with nothing run
    const r = await post(at.stage(t.id, again.route), again.body)
    if (r?.status !== 202) refused('Retry', r)
  }

  /** "Delete" under More: the question is put for this tutorial, by id, with a token its confirm must bring back. */
  async function ask(t: Tutorial) {
    const now = await clock()
    openId = t.id
    more = 'closed'
    // its own card at the top (as the open one is), then the rest as they stand now
    const rest = drawnOrder((snapshot?.tutorials ?? []).filter((one) => isListed(one) && one.id !== t.id), null).map((one) => one.id)
    question = { id: t.id, token: `${++asked}.${now}`, at: now, text: deleteQuestion(t), name: headingOf(t), order: [t.id, ...rest] }
  }

  /**
   * The answer "Delete this recording": the tutorial goes to the helper's trash, raw recording included. Only for
   * the question that is open now: the press must name its tutorial and carry its token, that tutorial's card must
   * be the open one and the one the question is drawn on, and the question must be under 30 s old. A token is good
   * once: whatever comes of the press, the question is closed. Anything else deletes nothing and says so.
   */
  async function remove(id: string, token: string | undefined) {
    const q = question, drawn = shown?.tutorials[0]
    question = null
    if (!q || !token || q.id !== id || q.token !== token || openId !== id || drawn?.id !== id || drawn.ask?.token !== token || (await clock()) - q.at >= QUESTION_MS) {
      notice = NOTHING_DELETED
      return
    }
    let r: Reply | null = null
    try { r = await host.fetch(at.tutorial(id), { method: 'DELETE' }) } catch { /* no answer */ }
    if (!r?.ok) return refused('Delete', r)
    deleted = [{ id, name: q.name }, ...deleted.filter((d) => d.id !== id)]
    openId = null
  }

  /** "Undo" on a deleted tutorial's line: the helper moves it back from its trash, and it is the open one again. */
  function undo(id: string) {
    return during(`undo:${id}`, async () => {
      clear()
      const r = await post(at.restore(id))
      if (!r?.ok) refused('Undo', r)
      else {
        deleted = deleted.filter((d) => d.id !== id)
        openId = id
        more = 'closed'
      }
      await tick()
    })
  }

  /** "Dismiss" on a deleted tutorial's line: the line goes; the tutorial stays in the trash. */
  async function dismiss(id: string) {
    clear()
    deleted = deleted.filter((d) => d.id !== id)
    await publish()
  }

  /**
   * A button press on a tutorial. The tutorial's state is read from the helper first: the view may be 2 s old.
   * `token` is the delete question's, carried by its confirm and by nothing else.
   */
  async function act(kind: RostrumAct, id: string, token?: string) {
    const key = `${kind}:${id}`
    const isOpening = kind === 'review' || kind === 'film'
    // pressed again while it is being carried out: not taken, but an Open button says its line again
    if (pending.has(key)) return isOpening ? (hintFor(id), publish()) : undefined
    // any press closes a delete question, but the confirm of that very tutorial's own
    const held = kind === 'confirmDelete' && question?.id === id ? question : null
    clear()
    question = held
    // a button pressed on a tutorial makes it the open one, and it stays so while its step runs
    if (openId !== id) { openId = id; more = 'closed' }
    if (isOpening) hintFor(id) // in the view with the first publish below, before anything is asked of anyone
    // opening a row and closing its tidy actions are the panel's own: the helper is not asked
    if (kind === 'open' || kind === 'more' || kind === 'cancel') {
      if (kind === 'open') { openId = id; more = 'closed' }
      else if (kind === 'more') { openId = id; more = more === 'closed' ? 'open' : 'closed' }
      else more = 'closed'
      return publish()
    }
    // an act with a "…" label is shown as taken first: the helper, the session or an opener may take a while
    return Object.hasOwn(PENDING, kind) ? during(key, () => carry(kind, id, token)) : carry(kind, id, token)
  }

  /** The line under a pressed Open button: there from the press whatever the helper or the opener does, for 8 s or until another press. */
  function hintFor(id: string) {
    const mine = (hint = { id })
    void (async () => {
      await host.sleep(HINT_MS)
      if (hint !== mine) return
      hint = null
      await publish()
    })().catch(() => undefined)
  }

  async function carry(kind: RostrumAct, id: string, token?: string) {
    const r = await get(at.tutorial(id)), t = r?.status === 200 ? parseTutorial(r.text) : null
    if (!t) refused('This tutorial', r)
    else if (t.busy) notice = 'A stage is running on this tutorial. Wait for it to end.'
    else if (kind === 'rename') { openId = id; more = kind }
    else if (kind === 'delete') await ask(t)
    else if (kind === 'confirmDelete') await remove(id, token)
    else if (kind === 'archive') { const a = await post(at.state(id), { archived: true }); if (a?.ok) more = 'closed'; else refused('Archive', a) }
    else if (kind === 'script') await writeScript(t)
    else if (kind === 'build') await build(t)
    // the script and the narration hand-off are in the chat; only the review player (video) needs the browser
    else if (kind === 'viewScript') await host.submit(PROMPTS.showScript(id))
    else if (kind === 'narration') await host.submit(PROMPTS.narration(id))
    else if (kind === 'review' || kind === 'film') await open(at.review(id), id)
    else if (kind === 'retry') await retry(t)
    // "Stop showing this": the bar of new pieces being made, which nothing of the helper's ends
    else if (kind === 'stopShowing') { const c = await post(at.progress(id), { clear: true }); if (!c?.ok) refused('Stop showing this', c) }
    // a take that differs from the script is kept by timing it as it is
    else if (kind === 'keep') { const k = await post(at.stage(id, 'time')); if (k?.status !== 202) refused('Keep', k) }
    else if (kind === 'fix') await host.submit(PROMPTS.setup('the transcriber'))
    await tick()
    await publish()
  }

  /** The rename field's Save: the new title is written to the tutorial; an empty one changes nothing. */
  async function rename(id: string, title: string) {
    clear()
    more = 'closed'
    const name = title.trim()
    if (name) {
      const r = await post(at.state(id), { title: name })
      if (!r?.ok) refused('Rename', r)
      await tick()
    }
    await publish()
  }

  /** A pick in a tutorial's brand select: written to the tutorial, and remembered for its site. */
  async function pickBrand(id: string, brand: string) {
    clear()
    const r = await post(at.state(id), { brand })
    if (!r?.ok) refused('The brand', r)
    else {
      const site = parseTutorial(r.text)?.site
      if (site) {
        lastBrandBySite = { ...lastBrandBySite, [site]: brand }
        await host.storeSet(STORE.lastBrandBySite, lastBrandBySite).catch(() => undefined)
      }
    }
    await tick()
    await publish()
  }

  /**
   * "Download and set up" / "Try again": the helper fetches what this copy of Rostrum lacks (tools/setup.mjs). The
   * press only starts it; the poll shows its bar, its end and a failed step. One already running is left to run.
   */
  function setUp() {
    return during('setUp:', async () => {
      clear()
      const r = await post(at.setup)
      if (r?.status !== 202 && r?.status !== 409) refused('Set up', r)
      await tick()
    })
  }

  /** "Ask Claude to set it up" on the setup card: no transcriber on this computer, and none that setup fetches. */
  function fixTranscriber() {
    return during('fixTranscriber:', () => host.submit(PROMPTS.setup('the transcriber')).catch(() => { notice = 'Claude could not be asked. Press the button again.' }))
  }

  /** "Recorder setup" / "Close setup". */
  async function setup(isOpen: boolean) {
    clear()
    setupOpen = isOpen
    await publish()
  }

  /** Setup, step 1: the helper puts the recorder's files in the tutorials folder. */
  function install() {
    return during('install:', async () => {
      clear()
      const r = await post(at.install)
      let j: { dir?: unknown; hasVendor?: unknown } | null = null
      try { j = r ? (JSON.parse(r.text) as typeof j) : null } catch { /* not the helper's answer */ }
      if (r?.status === 200 && j && typeof j.dir === 'string') {
        installed = { dir: j.dir.slice(0, 400), hasVendor: j.hasVendor === true }
        notice = installed.hasVendor ? 'The recorder files are in place.' : 'The recorder files are not complete yet. Press Download and set up first, then this button again.'
      } else refused('Install', r)
    })
  }

  /** Setup, step 2. */
  function openExtensions() {
    return during('extensions:', async () => {
      clear()
      await open('chrome://extensions', null)
    })
  }

  /** Setup, step 3: the folder to pick, onto the clipboard. */
  async function copyDir(surface?: string) {
    clear()
    const folder = shown?.setup?.dir
    const r = folder ? await host.copy(folder, surface).catch(() => ({ isCopied: false })) : { isCopied: false }
    if (!r.isCopied) notice = 'Copying is not available here. The folder is shown above.'
    await publish()
  }

  /** The tip card's arrows, and each opening of the pane (the next one): the tip shown is remembered across sessions. */
  async function nextTip(step = 1) {
    await settings()
    tipIndex += step
    await host.storeSet(STORE.tipIndex, tipIndex).catch(() => undefined)
    await publish()
  }

  /** "Ask Claude to fix this" on the stopped block. */
  function fixHelper() {
    return during('fixHelper:', () => host.submit(PROMPTS.setup('Node for the helper')).catch(() => { notice = 'Claude could not be asked. Press the button again.' }))
  }

  /** A press that threw: said in the pane, never silent. */
  async function failed(err: unknown) {
    notice = failureNotice(err)
    lastKey = ''
    await publish()
  }

  return { start, restart, fetchNode, tick, act, undo, dismiss, rename, pickBrand, setUp, fixTranscriber, setup, install, openExtensions, copyDir, nextTip: () => nextTip(), prevTip: () => nextTip(-1), opened: () => { link = null; hint = null; return nextTip() }, fixHelper, themeChanged, failed }
}

export type Supervisor = ReturnType<typeof createSupervisor>
