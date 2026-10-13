// The pane through the engine (`claude plugin test .`): what it draws for a helper that answers and one that does
// not, on a surface with Svg and one without, and what a press calls. The helper, the clock, the store, the settings
// and the environment are answered from memory here; the pure parts have their own tests under node (hooks/*.test.mjs).
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const BASE = 'http://127.0.0.1:4600'
const NOW = 1_760_000_000_000
const PANE = { title: 'Rostrum', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} } as const
const SURFACES = ['terminal', 'desktop'] as const
const STATES = ['recorded', 'scripted', 'approved', 'voiced', 'built', 'reviewed', 'done']

type Tutorial = {
  id: string; title: string | null; site: string; brand: null; state: string; busy: string | null; error: { stage: string; message: string } | null
  flags: { noMic: boolean }; renders: string[]; progress: { phase: string; label: string; pct: number; note: string | null } | null; archived: boolean; length: number | null
}
const tutorial = (id: string, state: string, over: Partial<Tutorial> = {}): Tutorial => ({ id, title: `The ${state} one`, site: 'app.example.test', brand: null, state, busy: null, error: null, flags: { noMic: false }, renders: [], progress: null, archived: false, length: null, ...over })
type Ran = { exitCode: number; stdout: string; stderr: string; isStdoutTruncated: boolean; isStderrTruncated: boolean }
const RAN: Ran = { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false }
type Helper = {
  isUp: boolean; tutorials: Tutorial[]; requests?: { n: number; id: string; kind: string }[]; theme?: string; brands?: string[]
  /** When the recorder's heartbeat last arrived; absent: a second ago (connected); null: never. */
  lastSeen?: number | null
  /** What a command run on the host answers (or throws); absent: it ran well. */
  run?: (argv: string[]) => Ran
  /** What a prompt submitted to the session throws; absent: it is taken. */
  submitFails?: string
  /** What `node --version` prints on this computer; absent: v22.20.0; null: there is no Node. */
  node?: string | null
  /** First-run setup as the helper tells it; absent: an older helper, which tells none. */
  setup?: { needed: boolean; running: boolean; data: string; transcriber: string; steps: { name: string; done: boolean; what: string }[]; last: { state: string; label: string; pct: number; note: string | null } | null }
}

/** A helper, a clock, a store, the settings and an environment in memory beneath the mod; what the mod called is kept. */
function world(on: On, helper: Helper) {
  const seen = { calls: [] as string[], submitted: [] as string[], ran: [] as string[][], spawned: [] as string[][], copied: [] as string[], trash: [] as Tutorial[], commands: [] as string[], opened: 0 }
  const clock = mock.clock(on, { now: NOW })
  mock.store(on)
  mock.env(on, { OS: 'Windows_NT', USERPROFILE: 'C:\\Users\\ada' })
  // a hook beneath a call on `$` answers `{ value }`
  const reply = (status: number, body: unknown) => ({ value: { status, ok: status >= 200 && status < 300, headers: {}, text: typeof body === 'string' ? body : JSON.stringify(body) } })
  on('http.fetch', async (_$, e) => {
    const method = e.init?.method ?? 'GET', path = e.url.slice(BASE.length)
    seen.calls.push(e.init?.body ? `${method} ${path} ${e.init.body}` : `${method} ${path}`)
    if (Object.keys(e.init?.headers ?? {}).some(name => name.toLowerCase() === 'origin')) throw new Error('the panel sent an Origin')
    if (!helper.isUp) return { deny: 'ECONNREFUSED' }
    if (path === '/health') return reply(200, 'ok')
    if (path === '/tutorials') return reply(200, { tutorials: helper.tutorials, recorder: { lastSeen: helper.lastSeen === undefined ? NOW - 1000 : helper.lastSeen }, brands: helper.brands ?? [], home: 'C:\\T', requests: helper.requests ?? [], setup: helper.setup })
    if (path === '/setup' && helper.setup) {
      helper.setup = { ...helper.setup, running: true, last: { state: 'running', label: 'Installing the video engine', pct: 4, note: null } }
      return reply(202, { ok: true, running: true })
    }
    if (path === '/recorder/install') return reply(200, { ok: true, dir: 'C:\\T\\Recorder', hasVendor: true })
    const done = /^\/requests\/(\d+)\/done$/.exec(path)
    if (done) {
      helper.requests = (helper.requests ?? []).filter(r => r.n !== Number(done[1]))
      return reply(200, { ok: true })
    }
    const m = /^\/tutorials\/([\w-]+)(?:\/([a-z]+))?/.exec(path)
    const t = helper.tutorials.find(one => one.id === m?.[1])
    const back = seen.trash.find(one => one.id === m?.[1])
    if (m?.[2] === 'restore' && !t && back) { // as the helper: the copy in its trash, back in the list
      seen.trash = seen.trash.filter(one => one !== back)
      helper.tutorials.push(back)
      return reply(200, back)
    }
    if (!m || !t) return reply(404, { error: 'no such tutorial' })
    if (!m[2] && method === 'DELETE') {
      helper.tutorials = helper.tutorials.filter(one => one !== t)
      seen.trash.push(t)
      return reply(200, { ok: true })
    }
    if (!m[2]) return reply(200, t)
    if (m[2] === 'elements') return reply(404, { error: 'no such screen' })
    if (m[2] === 'state') {
      const body = JSON.parse(e.init?.body ?? '{}') as { title?: string; archived?: boolean }
      if (body.title !== undefined) t.title = body.title
      if (body.archived !== undefined) t.archived = body.archived
      return reply(200, t)
    }
    t.busy = m[2]
    t.error = null
    return reply(202, { ok: true, busy: m[2] })
  })
  on('process.run', async (_$, e) => {
    // Node is asked its version before the helper is started (hooks/node.ts): `node` on PATH answers, nothing else is there
    if (e.argv[1] === '--version') return e.argv[0] === 'node' && helper.node !== null ? { value: { ...RAN, stdout: `${helper.node ?? 'v22.20.0'}\n` } } : { deny: 'ENOENT' }
    seen.ran.push([...e.argv])
    return { value: helper.run ? helper.run([...e.argv]) : RAN }
  })
  on('process.spawn', async function* (_$, e) {
    seen.spawned.push([...e.argv])
    yield { stream: 'stderr' as const, text: 'Error: listen EADDRINUSE: address already in use 127.0.0.1:4600\n' }
    return { value: { code: 1, signal: null } }
  })
  on('prompt.submit', async (_$, e) => {
    if (helper.submitFails) throw new Error(helper.submitFails)
    seen.submitted.push(e.text)
    return { text: e.text }
  })
  on('config.list', async () => ({ value: [{ key: 'theme', label: 'Theme', kind: 'choice' as const, value: helper.theme ?? 'dark', options: ['dark', 'light'], provider: { plugin: 'engine', tier: 'core' as const }, isLocked: false }] }))
  on('config.set', async (_$, e) => {
    if (e.key === 'theme') helper.theme = String(e.value)
    return { value: e.value }
  })
  on('ui.copy', async (_$, e) => {
    seen.copied.push(e.text)
    return { value: { isCopied: true as const } }
  })
  on('command.register', async (_$, e) => {
    seen.commands.push(e.name)
    return { value: { command: e.name } }
  })
  on('ui.open', async () => {
    seen.opened++
    return { value: { isPlaced: true as const } }
  })
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))

  return { seen, clock }
}

/** The session starts; the mod's own start (not awaited by its hook) is let run to its end. */
async function start($: Engine, clock: { settle: () => Promise<void> }) {
  await $.session.start({ cwd: 'C:\\work', surface: 'desktop', isInteractive: true })
  await clock.settle()
}
const mount = ($: Engine, surface: (typeof SURFACES)[number]) => $.ui.mount({ plugin: 'rostrum', surface, component: 'Pane', requestId: 'rostrum', props: PANE })

test('each state draws its one button: the open row with its track and step line, the rest one line each', async ($, on) => {
  // the newest is the recorded one, so it is the open row; the finished and the archived ones are not listed
  const helper: Helper = { isUp: true, tutorials: STATES.map((state, i) => tutorial(`rec-176000000000${6 - i}`, state)) }
  helper.tutorials.push(tutorial('rec-1760000000007', 'voiced', { title: 'The archived one', archived: true }))
  const { seen, clock } = world(on, helper)
  await start($, clock)
  for (const surface of SURFACES) {
    const ui = await mount($, surface)
    expect(await ui.find({ type: 'Text', text: 'Recorder connected' })).toBeDefined()
    const labels = (await ui.findAll({ type: 'Button' })).map(b => `${b.props.variant === 'primary' ? '*' : ''}${String(b.props.label)}`)
    // Open review and Open film are links the desktop opens itself (no press comes to the panel); buttons on the terminal
    const opens = surface === 'desktop' ? [[], []] : [['Open review'], ['Open film']]
    expect(labels).toEqual(['More', '*Write script', 'The scripted one', 'Show script', 'The approved one', 'Add narration', 'The voiced one', 'Build',
      'The built one', ...opens[0]!, 'The reviewed one', ...opens[1]!, '←', '→'])
    const links = ((await ui.findAll({ type: 'Markdown' })) as Node[]).map(el => String(el.props.text)).filter(text => text.startsWith('['))
    expect(links).toEqual(surface === 'desktop' ? [`[Open review](${BASE}/review/?tutorial=rec-1760000000002)`, `[Open film](${BASE}/review/?tutorial=rec-1760000000001)`] : [])
    expect(await ui.find({ type: 'Markdown', text: '## The recorded one' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Script, step 2 of 6' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Recorded with your narration. Next, the script.' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Did you know' })).toBeDefined()
    const drawings = await ui.findAll({ type: 'Svg' })
    if (surface === 'desktop') {
      // the recorder's light, then the track
      expect(drawings).toHaveLength(2)
      expect([drawings[0]!.props.alt, drawings[0]!.props.width, String(drawings[0]!.props.source).includes('#3DD068')]).toEqual(['Connected', 8, true])
      expect(String(drawings[1]!.props.source).startsWith('<svg')).toBe(true)
      expect(drawings[1]!.props.alt).toBe('Step 2 of 6')
    } else {
      expect(drawings).toHaveLength(0)
      expect((await ui.find({ type: 'Text', text: '●' }))?.props.color).toBe('#3DD068')
      expect(await ui.find({ type: 'Text', text: '●◉····' })).toBeDefined()
    }
    await ui.unmount()
  }
  expect(seen.spawned).toEqual([])
})

test('a press calls the route or the prompt of its state', async ($, on) => {
  const helper: Helper = { isUp: true, tutorials: [tutorial('a', 'recorded'), tutorial('b', 'approved'), tutorial('c', 'voiced'), tutorial('d', 'built')] }
  helper.tutorials.push(tutorial('e', 'approved', { error: { stage: 'time', message: '1 not spoken' } }), tutorial('f', 'recorded', { error: { stage: 'transcribe', message: 'whisper: program not found' } }))
  const { seen, clock } = world(on, helper)
  await start($, clock)
  for (const surface of SURFACES) {
    const ui = await mount($, surface)
    seen.submitted.length = 0
    seen.ran.length = 0
    await ui.press({ key: 'script:a' })
    await ui.press({ key: 'build:c' })
    expect(seen.submitted).toEqual(['Rostrum: write the script for tutorial a', 'Rostrum: build tutorial c'])
    await ui.press({ key: 'narration:b' })
    // the narration hand-off is in the chat; only the review player opens in the browser: by the desktop itself from
    // its link, by the panel's opener from the terminal's button
    expect(seen.submitted[2]).toEqual('Rostrum: add narration for tutorial b')
    if (surface === 'desktop') {
      expect(await ui.find({ key: 'review:d', type: 'Button' })).toBeUndefined()
      expect((await ui.find({ key: 'review:d' }))?.props.text).toBe(`[Open review](${BASE}/review/?tutorial=d)`)
      expect(seen.ran).toEqual([])
    } else {
      await ui.press({ key: 'review:d' })
      await clock.advance(1500)
      expect(seen.ran).toEqual([['rundll32', 'url.dll,FileProtocolHandler', `${BASE}/review/?tutorial=d`]])
    }
    await ui.unmount()
  }
  const ui = await mount($, 'desktop')
  // the failed ones stand where they stood (a failure moves nothing); what was pressed last is the open row until
  // another is opened: the take that differs, with its warning and Keep
  expect(((await ui.findAll({ type: 'Button' })) as Node[]).map(b => String(b.props.key)).filter(k => /^open:/.test(k))).toEqual(['open:a', 'open:c', 'open:d', 'open:e', 'open:f'])
  await ui.press({ key: 'open:e' })
  expect(await ui.find({ type: 'Text', text: 'The narration does not match the script. 1 line not spoken.' })).toBeDefined()
  await ui.press({ key: 'fix:f' })
  expect(seen.submitted).toContain('Rostrum: set up the transcriber')
  await ui.press({ key: 'keep:e' })
  expect(seen.calls).toContain('POST /tutorials/e/time')
  expect(await ui.find({ key: 'keep:e' })).toBeUndefined()
  // a name opens its row; More, then Rename in place of the title
  await ui.press({ key: 'open:b' })
  expect(await ui.find({ type: 'Text', text: 'Narration, step 4 of 6' })).toBeDefined()
  await ui.press({ key: 'more:b' })
  expect((await ui.findAll({ type: 'Button' })).map(b => b.props.label)).toContain('Archive')
  await ui.press({ key: 'rename:b' })
  await ui.input({ key: 'rename:b', text: 'New name' })
  expect(seen.calls).toContain('POST /tutorials/b/state {"title":"New name"}')
  expect(await ui.find({ type: 'Markdown', text: '## New name' })).toBeDefined()
  // Delete asks once, in words that say which tutorial; its confirm says what it does
  await ui.press({ key: 'more:b' })
  await ui.press({ key: 'delete:b' })
  expect(await ui.find({ type: 'Text', text: 'Delete "New name", from app.example.test? It goes to Rostrum\'s trash and can be brought back.' })).toBeDefined()
  expect((await ui.find({ key: 'confirmDelete:b' }))?.props.label).toBe('Delete this recording')
  expect(((await ui.findAll({ type: 'Button' })) as Node[]).map(keyOf).filter(k => /^confirmDelete:/.test(String(k)))).toEqual(['confirmDelete:b'])
  expect(seen.calls.some(call => call.startsWith('DELETE'))).toBe(false)
  await ui.press({ key: 'confirmDelete:b' })
  expect(seen.calls.filter(call => call.startsWith('DELETE'))).toEqual(['DELETE /tutorials/b'])
  expect(await ui.find({ key: 'open:b' })).toBeUndefined()
  // where it stood: a line that says what went, with Undo, which brings it back as the open card
  expect(await ui.find({ type: 'Text', text: 'Deleted "New name".' })).toBeDefined()
  await ui.press({ key: 'undo:b' })
  expect(seen.calls).toContain('POST /tutorials/b/restore')
  expect(await ui.find({ type: 'Text', text: 'Deleted "New name".' })).toBeUndefined()
  expect(await ui.find({ type: 'Markdown', text: '## New name' })).toBeDefined()
  // deleted again and the line dismissed: it stays in the trash
  await ui.press({ key: 'more:b' })
  await ui.press({ key: 'delete:b' })
  await ui.press({ key: 'confirmDelete:b' })
  await ui.press({ key: 'dismiss:b' })
  expect(await ui.find({ key: 'undo:b' })).toBeUndefined()
  expect(seen.trash.map(t => t.id)).toEqual(['b'])
  // Archive takes a tutorial off the list
  await ui.press({ key: 'open:d' })
  await ui.press({ key: 'more:d' })
  await ui.press({ key: 'tidyArchive:d' })
  expect(seen.calls).toContain('POST /tutorials/d/state {"archived":true}')
  expect(await ui.find({ key: 'review:d' })).toBeUndefined()
  await ui.unmount()
})

test('the tidy actions and the brand select draw on both surfaces: More, Rename in place of the title, Delete asks once', async ($, on) => {
  const helper: Helper = { isUp: true, tutorials: [tutorial('x', 'voiced')], brands: ['one', 'two'] }
  const { seen, clock } = world(on, helper)
  await start($, clock)
  for (const surface of SURFACES) {
    const ui = await mount($, surface)
    expect(await ui.find({ type: 'Select', key: 'brand:x' })).toBeDefined()
    await ui.select({ key: 'brand:x', value: 'two' })
    expect(seen.calls).toContain('POST /tutorials/x/state {"brand":"two"}')
    await ui.press({ key: 'more:x' })
    expect((await ui.find({ key: 'more:x' }))?.props.label).toBe('Close')
    await ui.press({ key: 'rename:x' })
    expect(await ui.find({ type: 'Input', key: 'rename:x' })).toBeDefined()
    expect(await ui.find({ key: 'more:x' })).toBeUndefined()
    await ui.input({ key: 'rename:x', text: `Named on the ${surface}` })
    expect(await ui.find({ type: 'Markdown', text: `## Named on the ${surface}` })).toBeDefined()
    await ui.press({ key: 'more:x' })
    await ui.press({ key: 'delete:x' })
    const question = `Delete "Named on the ${surface}", from app.example.test? It goes to Rostrum's trash and can be brought back.`
    expect(await ui.find({ type: 'Text', text: question })).toBeDefined()
    await ui.press({ key: 'cancel:x' })
    expect(await ui.find({ type: 'Text', text: question })).toBeUndefined()
    expect(seen.calls.some(call => call.startsWith('DELETE'))).toBe(false)
    await ui.unmount()
  }
})

type Node = { type: string; props: Record<string, unknown>; children?: unknown[] }
/** Every element under a found one, itself included. */
const under = (el: Node): Node[] => [{ ...el, props: el.props ?? {} }, ...(el.children ?? []).filter((c): c is Node => typeof c === 'object' && c !== null).flatMap(under)]
const isCard = (el: Node) => el.type === 'Box' && el.props.borderStyle === 'round' && el.props.borderDimColor === true
const textOf = (el: Node) => (el.children ?? []).filter(c => typeof c === 'string').join('')
const says = (el: Node, text: string) => el.type === 'Text' && textOf(el) === text
const keyOf = (el: Node) => el.props.key as string | undefined

test('every tutorial is a card of its own: the open name a heading, all of it inside the border; the tip is the last card, the status line outside', async ($, on) => {
  const progress = { phase: 'render', label: 'Rendering', pct: 70, note: 'No private data found in the final check.' }
  const helper: Helper = { isUp: true, brands: ['one', 'two'], tutorials: [
    tutorial('a', 'recorded', { title: 'Open [one](https://example.test) with a name far too long for a line', flags: { noMic: true } }),
    tutorial('b', 'voiced', { title: 'Shut one' }), tutorial('c', 'voiced', { title: 'Busy one', busy: 'render', progress }),
  ] }
  const { clock } = world(on, helper)
  await start($, clock)
  for (const surface of SURFACES) {
    helper.lastSeen = undefined
    await clock.advance(2000)
    const ui = await mount($, surface)
    const boxes = async () => (await ui.findAll({ type: 'Box' })) as Node[]
    const cards = (await boxes()).filter(isCard)
    expect(cards.map(keyOf)).toEqual(['row:a', 'row:b', 'row:c', 'card:tip'])
    for (const card of cards) expect([card.props.paddingX, card.props.paddingY]).toEqual([2, 1])
    const [a, b, c, tips] = cards.map(under) as [Node[], Node[], Node[], Node[]]
    // the open card: its name is the one heading, escaped and cut to a line; nothing else is larger or bold
    expect(a.filter(el => el.type === 'Markdown').map(el => el.props.text)).toEqual(['## Open \\[one\\](https\\://example.test)…'])
    expect(a.some(el => el.props.bold === true)).toBe(false)
    expect(a.find(el => says(el, 'Script, step 2 of 6'))?.props.dimColor).toBe(true)
    expect(a.filter(el => el.props.color === 'warning').map(textOf)).toEqual(['No microphone audio in this recording. Record it again, or type notes for the script in chat.'])
    expect(a.find(el => keyOf(el) === 'more:a')?.props.dimColor).toBe(true)
    expect(a.some(el => keyOf(el) === 'script:a')).toBe(true)
    expect(a.some(el => keyOf(el) === 'brand:a')).toBe(true)
    // a collapsed card: no heading and nothing bold, its name and its one button; a running one carries its bar and note
    expect(b.filter(el => el.type === 'Button').map(keyOf)).toEqual(['open:b', 'build:b'])
    expect(b.find(el => keyOf(el) === 'open:b')?.props.dimColor).toBeUndefined()
    expect([...b, ...c].some(el => el.props.bold === true || el.type === 'Markdown')).toBe(false)
    expect(c.find(el => says(el, 'No private data found in the final check.'))?.props.dimColor).toBe(true)
    expect(c.some(el => (surface === 'desktop' ? el.type === 'Svg' : el.type === 'Text' && /70% Rendering$/.test(textOf(el))))).toBe(true)
    // the tidy actions, the delete question and the rename field (with the whole name) are inside the card too
    const inA = async () => under((await boxes()).find(el => keyOf(el) === 'row:a')!)
    await ui.press({ key: 'more:a' })
    expect((await inA()).filter(el => el.type === 'Button').map(keyOf)).toEqual(['more:a', 'rename:a', 'tidyArchive:a', 'delete:a', 'script:a'])
    expect((await inA()).find(el => keyOf(el) === 'more:a')?.props.dimColor).toBe(true)
    // a blank line sets the tidy actions, the delete question and the rename field apart from the track under them
    const holding = async (inner: (el: Node) => boolean) => (await inA()).filter(el => el.type === 'Box' && keyOf(el) !== 'row:a' && (el.children ?? []).some(c => typeof c === 'object' && c !== null && inner({ ...(c as Node), props: (c as Node).props ?? {} })))[0]
    expect((await holding(el => keyOf(el) === 'tidyArchive:a'))?.props.marginBottom).toBe(1)
    await ui.press({ key: 'delete:a' })
    const question = 'Delete "Open [one](https://example.test) with a name far too long for a line", from app.example.test? It goes to Rostrum\'s trash and can be brought back.'
    expect((await inA()).some(el => says(el, question))).toBe(true)
    expect((await holding(el => says(el, question)))?.props.marginBottom).toBe(1)
    expect((await inA()).find(el => keyOf(el) === 'confirmDelete:a')?.props.label).toBe('Delete this recording')
    await ui.press({ key: 'cancel:a' })
    await ui.press({ key: 'more:a' })
    await ui.press({ key: 'rename:a' })
    const field = (await inA()).find(el => el.type === 'Input' && keyOf(el) === 'rename:a')
    expect((await holding(el => el.type === 'Input'))?.props.marginBottom).toBe(1)
    expect(field?.props.value).toBe('Open [one](https://example.test) with a name far too long for a line')
    await ui.input({ key: 'rename:a', text: String(field?.props.value) })
    // the status sentence is the one plain line of an open card: not dim, not coloured
    await ui.press({ key: 'open:b' })
    const plain = under((await boxes()).find(el => keyOf(el) === 'row:b')!).filter(el => el.type === 'Text' && !el.props.dimColor && !el.props.color && !el.props.bold)
    expect(plain.map(textOf)).toEqual(['The narration is in. Build the film next.'])
    await ui.press({ key: 'open:a' })
    // the tip card: a card like the rest with a blank line more above it, a small dim heading (plain Text, not bold), the tip in italic, an arrow each way
    expect([tips[0]!.props.borderStyle, tips[0]!.props.marginTop]).toEqual(['round', 1])
    const words = tips.filter(el => el.type === 'Text').map(el => [textOf(el), el.props.dimColor === true, el.props.italic === true, el.props.bold === true])
    expect(words[0]).toEqual(['Did you know', true, false, false])
    expect(words[words.length - 1]!.slice(1)).toEqual([true, true, false])
    expect(String(words[words.length - 1]![0])).toMatch(/^[A-Z].+\.$/)
    expect(tips.filter(el => el.type === 'Button').map(el => [keyOf(el), el.props.label, el.props.plain])).toEqual([['prevTip', '←', true], ['nextTip', '→', true]])
    expect(tips.some(el => el.type === 'Markdown')).toBe(false)
    // outside every card: the status line, a light and dim words with nothing around them, a blank line between the blocks
    const inside = (await boxes()).filter(isCard).flatMap(under)
    expect(inside.some(el => says(el, 'Recorder connected'))).toBe(false)
    // directly under it on the desktop, small (dim, italic) and always there: the first click only selects the panel.
    // Not on the terminal, which is worked by its keys. A blank line, then the first card.
    const FIRST_CLICK = "A note from the developer: sometimes your first click on a button here won't work. It's a bug Anthropic needs to fix, so just click again until it does."
    const all = under((await boxes())[0]!), note = all.find(el => says(el, FIRST_CLICK))
    if (surface === 'desktop') {
      expect([note?.props.dimColor, note?.props.italic, note?.props.bold]).toEqual([true, true, undefined])
      expect(inside.some(el => says(el, FIRST_CLICK))).toBe(false)
      const head = (await boxes()).find(el => (el.children ?? []).some(c => typeof c === 'object' && c !== null && says(c as Node, FIRST_CLICK)))!
      expect([head.props.flexDirection, head.props.marginBottom]).toEqual(['column', 1])
      expect(under(head).findIndex(el => says(el, FIRST_CLICK))).toBeGreaterThan(under(head).findIndex(el => says(el, 'Recorder connected')))
      expect(all.findIndex(el => says(el, FIRST_CLICK))).toBeLessThan(all.findIndex(el => keyOf(el) === 'row:a'))
    } else expect(note).toBeUndefined()
    expect((await ui.find({ type: 'Text', text: 'Recorder connected' }))?.props.dimColor).toBe(true)
    expect((await boxes())[0]!.props.gap).toBe(1)
    // connected: setup is done, and nothing leads to it; not connected any more: a dim link does (it may need installing again)
    expect(await ui.find({ key: 'setup' })).toBeUndefined()
    helper.lastSeen = NOW - 120_000
    await clock.advance(2000)
    expect(await ui.find({ type: 'Text', text: 'Recorder not connected' })).toBeDefined()
    if (surface === 'desktop') expect(String((await ui.findAll({ type: 'Svg' }))[0]!.props.source)).toContain('#9C9A92')
    expect([(await ui.find({ key: 'setup' }))?.props.label, (await ui.find({ key: 'setup' }))?.props.dimColor]).toEqual(['Recorder setup', true])
    // recorder setup is a card of the same kind
    await ui.press({ key: 'setup' })
    const setup = (await boxes()).filter(isCard).find(el => keyOf(el) === 'card:setup')!
    expect(under(setup).filter(el => el.type === 'Button').map(keyOf)).toEqual(['install', 'extensions', 'copy'])
    expect(under(setup).some(el => el.type === 'Markdown')).toBe(false)
    await ui.press({ key: 'setup' })
    await ui.unmount()
  }
})

test('the stopped helper is a card: the warning colour on its heading only', async ($, on) => {
  const { clock } = world(on, { isUp: false, tutorials: [] })
  await start($, clock)
  for (const surface of SURFACES) {
    const ui = await mount($, surface)
    const cards = ((await ui.findAll({ type: 'Box' })) as Node[]).filter(isCard)
    expect(cards.map(keyOf)).toEqual(['card:stopped'])
    const all = under(cards[0]!)
    expect(all.filter(el => el.props.color === 'warning').map(textOf)).toEqual(['Rostrum has stopped'])
    expect(all.some(el => keyOf(el) === 'restart')).toBe(true)
    await ui.unmount()
  }
})

test('a long step draws the bar: an animated Svg with the percentage beside it, text on the terminal; no button', async ($, on) => {
  const progress = { phase: 'render', label: 'Rendering', pct: 70, note: 'No private data found in the final check.' }
  const helper: Helper = { isUp: true, tutorials: [tutorial('rec-1760000000002', 'voiced', { busy: 'render', progress }), tutorial('rec-1760000000001', 'recorded', { busy: 'prepare', progress: { phase: 'clean', label: 'Cleaning the recording', pct: 12, note: null } })] }
  const { clock } = world(on, helper)
  await start($, clock)
  for (const surface of SURFACES) {
    const ui = await mount($, surface)
    expect(await ui.find({ type: 'Text', text: 'No private data found in the final check.' })).toBeDefined()
    expect(await ui.find({ key: 'build:rec-1760000000002' })).toBeUndefined()
    expect(await ui.find({ key: 'script:rec-1760000000001' })).toBeUndefined()
    const drawings = await ui.findAll({ type: 'Svg' })
    if (surface === 'desktop') {
      // the recorder's light, the track, the open row's bar, the collapsed row's bar
      expect(drawings).toHaveLength(4)
      const bar = drawings[2]!
      expect(String(bar.props.source).startsWith('<svg')).toBe(true)
      expect(String(bar.props.source)).toContain('<animate')
      expect(bar.props.isInteractive).toBe(true)
      expect(bar.props.alt).toBe('Rendering, 70%')
      expect(String(bar.props.source).length).toBeLessThan(131072)
      expect(await ui.find({ type: 'Text', text: '70%' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: '12%' })).toBeDefined()
    } else {
      expect(drawings).toHaveLength(0)
      expect(await ui.find({ type: 'Text', text: /^\[#+-*\] 70% Rendering$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^\[#+-*\] 12% Cleaning the recording$/ })).toBeDefined()
    }
    await ui.unmount()
  }
})

test('no helper: it is started, restarted once, then shown stopped with Start Rostrum again', async ($, on) => {
  const helper: Helper = { isUp: false, tutorials: [] }
  const { seen, clock } = world(on, helper)
  await start($, clock)
  const argv = ['node', '--experimental-strip-types', 'helper/server.mjs', '--tutorials', 'C:\\Users\\ada\\Videos\\Rostrum']
  expect(seen.spawned).toEqual([argv, argv])
  for (const surface of SURFACES) {
    const ui = await mount($, surface)
    expect(await ui.find({ type: 'Text', text: 'Rostrum has stopped' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Port 4600 is in use by another program.' })).toBeDefined()
    expect(await ui.find({ key: 'restart' })).toBeDefined()
    expect(await ui.find({ key: 'setup' })).toBeUndefined()
    await ui.unmount()
  }
  // a helper that now answers is adopted on Start Rostrum again, and the next poll lists nothing to do yet
  helper.isUp = true
  const ui = await mount($, 'desktop')
  await ui.press({ key: 'restart' })
  expect(seen.spawned).toHaveLength(2)
  expect(await ui.find({ type: 'Text', text: 'Recorder connected' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Nothing in progress' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Record a walkthrough in Chrome and it appears here.' })).toBeDefined()
  await ui.unmount()
})

test('a helper that goes away keeps its list on show: the rows wait, and nothing on them can be pressed', async ($, on) => {
  const helper: Helper = { isUp: true, tutorials: [tutorial('a', 'voiced')] }
  const { clock } = world(on, helper)
  await start($, clock)
  helper.isUp = false
  await clock.advance(2000)
  await clock.settle()
  for (const surface of SURFACES) {
    const ui = await mount($, surface)
    expect(await ui.find({ type: 'Text', text: 'Rostrum has stopped' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Waiting' })).toBeDefined()
    expect(await ui.find({ key: 'open:a' })).toBeDefined()
    expect(await ui.find({ key: 'build:a' })).toBeUndefined()
    await ui.unmount()
  }
})

test('recorder setup opens in place: install, the extensions page, the folder with Copy', async ($, on) => {
  // a recorder that never connected: the empty state's own button is the way in, and no link beside the status
  const { seen, clock } = world(on, { isUp: true, tutorials: [], lastSeen: null })
  await start($, clock)
  for (const surface of SURFACES) {
    const ui = await mount($, surface)
    expect(await ui.find({ type: 'Text', text: 'Set up the recorder' })).toBeUndefined()
    expect(await ui.find({ key: 'setup' })).toBeUndefined()
    expect((await ui.find({ key: 'setup-first' }))?.props.variant).toBe('primary')
    await ui.press({ key: 'setup-first' })
    expect((await ui.find({ key: 'setup' }))?.props.label).toBe('Close setup')
    expect(await ui.find({ type: 'Text', text: 'Set up the recorder' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'The recorder is a Chrome extension that you load into Chrome by hand. This is done once.' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '1. Put the recorder\'s files on this computer.' })).toBeDefined()
    expect((await ui.find({ key: 'install' }))?.props.label).toBe(surface === SURFACES[0] ? 'Put the recorder files in place' : 'Put the recorder files in place again')
    expect(await ui.find({ type: 'Text', text: '4. Pin it: press the puzzle-piece icon in Chrome\'s toolbar, then the pin beside Rostrum. Its icon is a blue speech bubble with an R cut out; a red ring means it is recording.' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'When Chrome has it, the line at the top turns to "Recorder connected" within a minute.' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '2. Open Chrome\'s extensions page and switch on Developer mode, top right.' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '3. Press Load unpacked, top left, pick this folder and press Select Folder.' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'C:\\T\\Recorder' })).toBeDefined()
    expect(await ui.find({ key: 'nextTip' })).toBeUndefined()
    seen.calls.length = 0
    seen.copied.length = 0
    await ui.press({ key: 'install' })
    expect(seen.calls).toContain('POST /recorder/install')
    expect(await ui.find({ type: 'Text', text: 'The recorder files are in place.' })).toBeDefined()
    expect((await ui.find({ key: 'install' }))?.props.label).toBe('Put the recorder files in place again')
    await ui.press({ key: 'copy' })
    expect(seen.copied).toEqual(['C:\\T\\Recorder'])
    await ui.press({ key: 'extensions' })
    expect(seen.ran[seen.ran.length - 1]).toEqual(['cmd', '/c', 'start', '', 'chrome', 'chrome://extensions'])
    await ui.press({ key: 'setup' })
    expect(await ui.find({ type: 'Text', text: 'Set up the recorder' })).toBeUndefined()
    await ui.unmount()
  }
})

test('Send notes on the review page reaches Claude at the next poll, once', async ($, on) => {
  const helper: Helper = { isUp: true, tutorials: [tutorial('d', 'built', { renders: ['v1.mp4'] })], requests: [] }
  const { seen, clock } = world(on, helper)
  await start($, clock)
  helper.requests!.push({ n: 7, id: 'd', kind: 'notes' })
  await clock.advance(2000)
  expect(seen.submitted).toEqual(['Rostrum: fix the review notes for tutorial d'])
  expect(seen.calls).toContain('POST /requests/7/done')
  await clock.advance(2000)
  expect(seen.submitted).toHaveLength(1)
})

test('the drawings follow the host\'s theme, and a change of it', async ($, on) => {
  const helper: Helper = { isUp: true, tutorials: [tutorial('a', 'voiced')], theme: 'light' }
  const { clock } = world(on, helper)
  await start($, clock)
  const ui = await mount($, 'desktop')
  const track = async () => String((await ui.findAll({ type: 'Svg' }))[1]?.props.source)
  expect(await track()).toContain('#1F6FEB')
  await $.config.set({ key: 'theme', value: 'dark' } as Parameters<Engine['config']['set']>[0])
  await clock.settle()
  expect(await track()).toContain('#2C84FF')
  await ui.unmount()
})

test('the poll every 2 s shows what the helper now says', async ($, on) => {
  const helper: Helper = { isUp: true, tutorials: [tutorial('a', 'voiced')] }
  const { clock } = world(on, helper)
  await start($, clock)
  const ui = await mount($, 'desktop')
  expect(await ui.find({ key: 'build:a' })).toBeDefined()
  helper.tutorials[0]!.busy = 'render'
  await clock.advance(2000)
  expect(await ui.find({ key: 'build:a' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'Rendering the film.' })).toBeDefined()
  await ui.unmount()
})

test('/rostrum opens the pane', async ($, on) => {
  const { clock } = world(on, { isUp: true, tutorials: [] })
  await start($, clock)
  const ran = await $.command.run({ command: 'rostrum', args: '' } as Parameters<Engine['command']['run']>[0])
  expect(ran.text).toBe('Rostrum panel opened.')
})

test('the panel opens only when asked for, and can be asked for without a new session', async ($, on) => {
  const { seen, clock } = world(on, { isUp: true, tutorials: [] })
  // a session that starts does not open the panel
  await start($, clock)
  expect(seen.commands).toEqual(['rostrum'])
  expect(seen.opened).toBe(0)
  // an ordinary prompt, and a job for the skill, open nothing
  await $.prompt.submit({ text: 'hello' } as Parameters<Engine['prompt']['submit']>[0])
  await $.prompt.submit({ text: 'Rostrum: build tutorial rec-1' } as Parameters<Engine['prompt']['submit']>[0])
  expect(seen.opened).toBe(0)
  // the command typed as a prompt, and the skill's name the prompt box completes it to, both open it
  await $.prompt.submit({ text: '/rostrum' } as Parameters<Engine['prompt']['submit']>[0])
  expect(seen.opened).toBe(1)
  await $.prompt.submit({ text: ' /rostrum:rostrum ' } as Parameters<Engine['prompt']['submit']>[0])
  expect(seen.opened).toBe(2)
  // the prompt itself still goes through, so the skill loads as it would have
  expect(seen.submitted).toContain(' /rostrum:rostrum ')
})

test('after a reload, with no session start, the first prompt registers /rostrum', async ($, on) => {
  const { seen, clock } = world(on, { isUp: true, tutorials: [] })
  await $.prompt.submit({ text: 'hello' } as Parameters<Engine['prompt']['submit']>[0])
  await clock.settle()
  expect(seen.commands).toEqual(['rostrum'])
  expect(seen.opened).toBe(0)
})

test('Open film and Open review: on the desktop a link the app opens itself, in the button\'s place; on the terminal a button that answers at once', async ($, on) => {
  const helper: Helper = { isUp: true, tutorials: [tutorial('f', 'reviewed', { renders: ['v1.mp4'] }), tutorial('d', 'built', { renders: ['v1.mp4'] })] }
  const { seen, clock } = world(on, helper)
  await start($, clock)
  const film = `${BASE}/review/?tutorial=f`
  const QUIET = 'The page can take a few moments to open. If nothing happens, press again in a few seconds.'
  const WARNING = 'The browser could not be opened. Open this address yourself:'
  const card = async (ui: Awaited<ReturnType<typeof mount>>, id: string) => under(((await ui.findAll({ type: 'Box' })) as Node[]).find(el => keyOf(el) === `row:${id}`)!)

  // the desktop: no press travels to the panel, so nothing of the panel's can be late
  let ui = await mount($, 'desktop')
  if (await ui.find({ key: 'open:f' })) await ui.press({ key: 'open:f' })
  const inF = await card(ui, 'f'), inD = await card(ui, 'd')
  expect(inF.filter(el => el.type === 'Markdown').map(el => el.props.text)).toEqual(['## The reviewed one', `[Open film](${film})`])
  expect(inD.filter(el => el.type === 'Markdown').map(el => el.props.text)).toEqual([`[Open review](${BASE}/review/?tutorial=d)`])
  // in the button's place and alone there: under the status sentence in the open card, at the right of a collapsed one
  expect(inF.filter(el => el.type === 'Button').map(keyOf)).toEqual(['more:f'])
  expect(inF.findIndex(el => keyOf(el) === 'film:f')).toBeGreaterThan(inF.findIndex(el => el.type === 'Text' && /finished film/.test(textOf(el))))
  expect(inD.filter(el => el.type === 'Button').map(keyOf)).toEqual(['open:d'])
  // the link is the surface's own to open: the panel answers no press on it, and draws no line under it
  expect(inF.find(el => keyOf(el) === 'film:f')?.props.onLinkPress).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: QUIET })).toBeUndefined()
  expect(seen.ran).toEqual([])
  const tip = async () => String(((await ui.findAll({ type: 'Text' })) as Node[]).filter(el => el.props.italic === true).map(textOf).pop())
  const first = await tip()
  await ui.press({ key: 'nextTip' })
  expect(await tip()).not.toBe(first)
  await ui.press({ key: 'prevTip' })
  expect(await tip()).toBe(first)
  // More on the finished row: Archive is there, among the tidy actions, and nowhere else
  await ui.press({ key: 'more:f' })
  expect((await ui.findAll({ type: 'Button' })).map(b => String(b.props.key)).filter(k => /rchive/.test(k))).toEqual(['tidyArchive:f'])
  await ui.press({ key: 'more:f' })
  await ui.unmount()

  // the terminal draws no links to press: the button, its press shown as taken at once
  ui = await mount($, 'terminal')
  expect(((await ui.findAll({ type: 'Markdown' })) as Node[]).some(el => String(el.props.text).startsWith('['))).toBe(false)
  await ui.press({ key: 'film:f' })
  expect([(await ui.find({ key: 'film:f' }))?.props.label, (await ui.find({ key: 'film:f' }))?.props.dimColor, (await ui.find({ key: 'film:f' }))?.props.variant]).toEqual(['Opening…', true, undefined])
  expect((await ui.find({ type: 'Text', text: QUIET }))?.props.dimColor).toBe(true)
  await ui.press({ key: 'film:f' }) // not taken twice
  await clock.advance(1500)
  expect((await ui.find({ key: 'film:f' }))?.props.label).toBe('Open film')
  expect(seen.ran).toEqual([['rundll32', 'url.dll,FileProtocolHandler', film]])
  // no address is shown for one that was sent; the plain line is in the tutorial's own card, under its buttons
  expect(await ui.find({ type: 'Link' })).toBeUndefined()
  let inside = await card(ui, 'f')
  expect(inside.filter(el => el.type === 'Button').map(keyOf)).toEqual(['more:f', 'film:f'])
  expect(inside.findIndex(el => says(el, QUIET))).toBeGreaterThan(inside.findIndex(el => keyOf(el) === 'film:f'))
  // the collapsed card's own button: the line moves there, under its row; it has its 8 seconds, then goes
  await ui.press({ key: 'review:d' })
  await clock.advance(1500)
  expect((await card(ui, 'f')).some(el => says(el, QUIET))).toBe(false)
  inside = await card(ui, 'd')
  expect(inside.findIndex(el => says(el, QUIET))).toBeGreaterThan(inside.findIndex(el => keyOf(el) === 'review:d'))
  await clock.advance(5000)
  expect(await ui.find({ type: 'Text', text: QUIET })).toBeDefined()
  await clock.advance(3000)
  expect(await ui.find({ type: 'Text', text: QUIET })).toBeUndefined()
  // the first opener cannot be started: the next is tried
  helper.run = argv => { if (argv[0] === 'rundll32') throw new Error('ENOENT'); return RAN }
  seen.ran.length = 0
  await ui.press({ key: 'film:f' })
  await clock.advance(1500)
  expect(seen.ran.map(argv => argv[0])).toEqual(['rundll32', 'cmd'])
  expect(await ui.find({ type: 'Text', text: WARNING })).toBeUndefined()
  // none of them works: the warning in the card, with the address to open by hand
  helper.run = () => ({ ...RAN, exitCode: 1 })
  await ui.press({ key: 'film:f' })
  await clock.advance(1500)
  inside = await card(ui, 'f')
  expect(inside.find(el => says(el, WARNING))?.props.color).toBe('warning')
  expect(inside.find(el => el.type === 'Link')?.props.href).toBe(film)
  expect(await ui.find({ type: 'Text', text: QUIET })).toBeUndefined()
  // a press whose work throws says so in the pane
  helper.tutorials.push(tutorial('v', 'voiced'))
  helper.submitFails = 'A turn is running.'
  await clock.advance(2000)
  await ui.press({ key: 'open:v' })
  await ui.press({ key: 'build:v' })
  expect((await ui.find({ type: 'Text', text: /^That did not work: / }))?.props.color).toBe('warning')
  await ui.unmount()
})

test('the pressed card keeps its place and stays open while its step runs, the bar where its button was; the bar fits the pane it is drawn in', async ($, on) => {
  const helper: Helper = { isUp: true, tutorials: [tutorial('rec-1760000000002', 'recorded', { title: 'The new one' }), tutorial('rec-1760000000001', 'built', { title: 'The older one' })] }
  const { clock } = world(on, helper)
  await start($, clock)
  const narrow = await $.ui.mount({ plugin: 'rostrum', surface: 'desktop', component: 'Pane', requestId: 'rostrum', props: { ...PANE, bodyColumns: 39 } })
  const cards = async () => ((await narrow.findAll({ type: 'Box' })) as Node[]).filter(isCard).map(keyOf)
  expect(await cards()).toEqual(['row:rec-1760000000002', 'row:rec-1760000000001', 'card:tip'])
  await narrow.press({ key: 'script:rec-1760000000002' })
  // the step starts: the helper says what it is doing and how far along
  helper.tutorials[0]!.busy = 'prepare'
  helper.tutorials[0]!.progress = { phase: 'gestures', label: 'Reading your gestures', pct: 40, note: null }
  await clock.advance(2000)
  expect(await cards()).toEqual(['row:rec-1760000000002', 'row:rec-1760000000001', 'card:tip'])
  const open = under(((await narrow.findAll({ type: 'Box' })) as Node[]).find(el => keyOf(el) === 'row:rec-1760000000002')!)
  expect(open.filter(el => el.type === 'Markdown').map(el => el.props.text)).toEqual(['## The new one'])
  expect(open.some(el => says(el, 'Script, step 2 of 6'))).toBe(true)
  expect(open.some(el => keyOf(el) === 'script:rec-1760000000002')).toBe(false)
  // the bar and its percentage inside the card: 39 columns leave the bar 224 px, scaled whole (18 high), "40%" beside it
  const bar = open.find(el => el.type === 'Svg' && el.props.isInteractive === true)!
  expect([bar.props.width, bar.props.height, bar.props.alt]).toEqual([224, 18, 'Reading your gestures, 40%'])
  expect(String(bar.props.source)).toContain('width="224" height="18" viewBox="0 0 300 24"')
  expect(open.findIndex(el => says(el, '40%'))).toBeGreaterThan(open.indexOf(bar))
  await narrow.unmount()
  // a wider pane: the bar at its baked width
  const wide = await mount($, 'desktop')
  const drawn = ((await wide.findAll({ type: 'Svg' })) as Node[]).find(el => el.props.isInteractive === true)!
  expect([drawn.props.width, drawn.props.height]).toEqual([300, 24])
  await wide.unmount()
})

test('two untitled recordings: each card says its site and time; a delete question on one stays on it while the other fails, and only that one goes', async ($, on) => {
  const A = 'rec-1791825949606', B = 'rec-1791826477657'
  const whenOf = (id: string) => { const d = new Date(Number(id.slice(4))), two = (n: number) => String(n).padStart(2, '0'); return `${d.toLocaleString('en-US', { month: 'short' })} ${d.getDate()}, ${two(d.getHours())}:${two(d.getMinutes())}` }
  const helper: Helper = { isUp: true, tutorials: [tutorial(A, 'recorded', { title: null, site: 'mail.example.test' }), tutorial(B, 'recorded', { title: null, site: 'mail.example.test', busy: 'prepare' })] }
  const { seen, clock } = world(on, helper)
  await start($, clock)
  const ui = await mount($, 'desktop')
  const cards = async () => ((await ui.findAll({ type: 'Box' })) as Node[]).filter(isCard).map(keyOf)
  const confirms = async () => ((await ui.findAll({ type: 'Button' })) as Node[]).map(keyOf).filter(k => /^confirmDelete:/.test(String(k)))
  // the newest is the open card; the older one's name says which it is
  expect(await cards()).toEqual([`row:${B}`, `row:${A}`, 'card:tip'])
  expect((await ui.find({ key: `open:${A}` }))?.props.label).toBe(`mail.example.test · ${whenOf(A)}`)
  await ui.press({ key: `open:${A}` })
  await ui.press({ key: `more:${A}` })
  await ui.press({ key: `delete:${A}` })
  const question = `Delete "mail.example.test · ${whenOf(A)}", recorded ${whenOf(A)}, from mail.example.test? It goes to Rostrum's trash and can be brought back.`
  expect(await ui.find({ type: 'Text', text: question })).toBeDefined()
  // the other one's step fails at the next poll: no card moves, the question and its one confirm are still A's
  helper.tutorials[1]!.busy = null
  helper.tutorials[1]!.error = { stage: 'prepare', message: 'exit 1' }
  await clock.advance(2000)
  expect(await cards()).toEqual([`row:${A}`, `row:${B}`, 'card:tip'])
  expect(await ui.find({ type: 'Text', text: 'Preparing the recording failed: exit 1.' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: question })).toBeDefined()
  expect(await confirms()).toEqual([`confirmDelete:${A}`])
  await ui.press({ key: `confirmDelete:${A}` })
  expect(seen.calls.filter(call => call.startsWith('DELETE'))).toEqual([`DELETE /tutorials/${A}`])
  expect(helper.tutorials.map(t => t.id)).toEqual([B])
  expect(await ui.find({ type: 'Text', text: `Deleted "mail.example.test · ${whenOf(A)}".` })).toBeDefined()
  // a question left open for 30 s is closed at the poll, and nothing can be confirmed
  await ui.press({ key: `more:${B}` })
  await ui.press({ key: `delete:${B}` })
  expect(await confirms()).toEqual([`confirmDelete:${B}`])
  await clock.advance(30_000)
  expect(await confirms()).toEqual([])
  expect(helper.tutorials.map(t => t.id)).toEqual([B])
  await ui.unmount()
})

test('new pieces being made: the card shows a running build with its note and no Build button; "Stop showing this" comes only after six hours without word', async ($, on) => {
  const making = (at: number) => ({ phase: 'making', label: 'Making new pieces', pct: 3, note: 'Building the browser bar', at: new Date(at).toISOString() })
  const helper: Helper = { isUp: true, tutorials: [tutorial('m', 'voiced', { progress: making(NOW) as never })] }
  const { seen, clock } = world(on, helper)
  await start($, clock)
  for (const surface of SURFACES) {
    helper.tutorials[0]!.progress = making(NOW) as never
    await clock.advance(2000)
    const ui = await mount($, surface)
    expect(await ui.find({ type: 'Text', text: 'Build, step 5 of 6' })).toBeDefined()
    expect(await ui.find({ key: 'build:m' })).toBeUndefined()
    expect((await ui.find({ type: 'Text', text: 'Building the browser bar' }))?.props.dimColor).toBe(true)
    if (surface === 'desktop') expect((((await ui.findAll({ type: 'Svg' })) as Node[]).find(el => el.props.isInteractive === true))?.props.alt).toBe('Making new pieces, 3%')
    else expect(await ui.find({ type: 'Text', text: /3% Making new pieces$/ })).toBeDefined()
    expect(await ui.find({ key: 'stopShowing:m' })).toBeUndefined()
    // the tidy actions are there all the while
    await ui.press({ key: 'more:m' })
    expect(await ui.find({ key: 'tidyArchive:m' })).toBeDefined()
    await ui.press({ key: 'more:m' })
    // six hours on and nothing told: a dim plain button under the note takes the bar away through the helper
    helper.tutorials[0]!.progress = making(NOW - 7 * 60 * 60 * 1000) as never
    await clock.advance(2000)
    const stop = await ui.find({ key: 'stopShowing:m' })
    expect([stop?.props.label, stop?.props.plain, stop?.props.dimColor]).toEqual(['Stop showing this', true, true])
    await ui.press({ key: 'stopShowing:m' })
    expect(seen.calls).toContain('POST /tutorials/m/progress {"clear":true}')
    await ui.unmount()
  }
})

test('no Node on the computer: nothing is started, and the stopped card says what Rostrum needs and offers Claude', async ($, on) => {
  const helper: Helper = { isUp: false, tutorials: [], node: null }
  const { seen, clock } = world(on, helper)
  await start($, clock)
  expect(seen.spawned).toEqual([])
  for (const surface of SURFACES) {
    const ui = await mount($, surface)
    const card = ((await ui.findAll({ type: 'Box' })) as Node[]).filter(isCard).find(el => keyOf(el) === 'card:stopped')!
    expect(under(card).filter(el => el.type === 'Text').map(textOf)).toEqual([
      'Rostrum needs Node', 'Rostrum needs Node 22 or newer, which is not on this computer.',
      'One press downloads Node 22.23.3 from nodejs.org (about 36 MB), checks it against the checksum nodejs.org publishes for it, and puts it in C:\\Users\\ada\\AppData\\Local\\Rostrum\\node. Nothing else on this computer is changed.',
    ])
    expect([(await ui.find({ key: 'fetchNode' }))?.props.label, (await ui.find({ key: 'fetchNode' }))?.props.variant]).toEqual(['Download Node 22', 'primary'])
    expect((await ui.find({ key: 'fixHelper' }))?.props.label).toBe('Ask Claude to fix this')
    expect((await ui.find({ key: 'restart' }))?.props.variant).toBeUndefined()
    await ui.unmount()
  }
  // pressed: curl, then the hash, which here is not the pinned one: removed, said in the warning colour, Try again
  const ui = await mount($, 'desktop')
  seen.ran.length = 0
  await ui.press({ key: 'fetchNode' })
  await clock.settle()
  expect(seen.ran.map(argv => argv[0])).toEqual(['C:\\Windows\\System32\\curl.exe', 'C:\\Windows\\System32\\certutil.exe', 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'])
  expect(seen.ran[0]!.slice(-2)).toEqual(['C:\\Users\\ada\\AppData\\Local\\Rostrum\\node\\node-v22.23.3-win-x64.zip', 'https://nodejs.org/dist/v22.23.3/node-v22.23.3-win-x64.zip'])
  expect((await ui.find({ key: 'fetchNode' }))?.props.label).toBe('Try again')
  expect((await ui.find({ type: 'Text', text: /^The download did not match the checksum nodejs\.org publishes for it/ }))?.props.color).toBe('warning')
  expect(seen.spawned).toEqual([])
  await ui.unmount()
})

test('first-run setup: a card names what one press fetches; pressed, it shows the bar; a failed step offers Try again; the rows wait meanwhile', async ($, on) => {
  const what = 'the video engine (npm packages, about 650 MB on disk)'
  const missing = { needed: true, running: false, data: 'C:\\D', transcriber: 'none', steps: [{ name: 'deps', done: false, what }], last: null }
  const helper: Helper = { isUp: true, tutorials: [tutorial('a', 'voiced')], lastSeen: null, setup: missing }
  const { seen, clock } = world(on, helper)
  await start($, clock)
  for (const surface of SURFACES) {
    helper.setup = missing
    await clock.advance(2000)
    const ui = await mount($, surface)
    const card = ((await ui.findAll({ type: 'Box' })) as Node[]).filter(isCard).find(el => keyOf(el) === 'card:install')!
    expect(under(card).filter(el => el.type === 'Text').map(textOf)).toEqual([
      'Set up Rostrum', 'Rostrum needs a few things it does not ship with. One press fetches them:', `- The ${what.slice(4)}`,
      "They go into this plugin's own folder. Nothing is sent anywhere.",
      "There is no transcriber on this computer yet, and Rostrum's own transcriber is not available for this computer yet. Claude can set one up for you.",
    ])
    expect([(await ui.find({ key: 'setUp' }))?.props.label, (await ui.find({ key: 'setUp' }))?.props.variant]).toEqual(['Download and set up', 'primary'])
    expect((await ui.find({ key: 'fixTranscriber' }))?.props.label).toBe('Ask Claude to set it up')
    expect(await ui.find({ type: 'Text', text: 'Waiting for setup' })).toBeDefined()
    expect(await ui.find({ key: 'build:a' })).toBeUndefined()
    expect(await ui.find({ key: 'setup' })).toBeUndefined()
    await ui.press({ key: 'setUp' })
    expect(seen.calls).toContain('POST /setup')
    expect(await ui.find({ key: 'setUp' })).toBeUndefined()
    if (surface === 'desktop') expect((((await ui.findAll({ type: 'Svg' })) as Node[]).find(el => el.props.isInteractive === true))?.props.alt).toBe('Installing the video engine, 4%')
    else expect(await ui.find({ type: 'Text', text: /4% Installing the video engine$/ })).toBeDefined()
    helper.setup = { ...missing, last: { state: 'failed', label: 'Installing the video engine', pct: 0, note: 'Installing the video engine did not finish: npm stopped with code 1: check the connection.' } }
    await clock.advance(2000)
    expect((await ui.find({ key: 'setUp' }))?.props.label).toBe('Try again')
    expect((await ui.find({ type: 'Text', text: /^Installing the video engine did not finish: .* Try again carries on from there\.$/ }))?.props.color).toBe('warning')
    // done: the card is the transcriber's alone, and the tutorial has its button back
    helper.setup = { ...missing, needed: false, steps: [{ name: 'deps', done: true, what }], transcriber: 'python' }
    await clock.advance(2000)
    expect(await ui.find({ key: 'card:install' })).toBeUndefined()
    expect(await ui.find({ key: 'build:a' })).toBeDefined()
    await ui.unmount()
  }
})
