// The Rostrum mod: the pane, the /rostrum command, and the wiring of the engine's `$` to the supervisor.
// The pane draws the view in `$.state` with the host's own elements and nothing else; the two drawings of ours (the
// stage track, the progress bar) are Svg where the surface has it and text where it has not (the terminal). What the
// view says is hooks/view.ts, what a press does is hooks/supervise.ts, the helper's addresses are hooks/helper.ts.
// The helper owns every tutorial's state.
import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register } from 'claude-code'

import type { RostrumButton, RostrumLink, RostrumProgress, RostrumRow } from '../types'
import { bakeBar, barText, barWidth, sized } from './bar.ts'
import { RUN_TIMEOUT_MS, createSupervisor, failureNotice } from './supervise.ts'
import type { Host, Supervisor } from './supervise.ts'
import { GREEN, dotSvg, trackSvg, trackText } from './track.ts'
import { FIRST_CLICK, headingMarkdown } from './view.ts'

const PANE = 'rostrum'
const TITLE = 'Rostrum'
const POLL_MS = 2000
const SVG_LIMIT = 131072 // the host's limit for an Svg's markup
// One block of the panel: a tutorial, the recorder setup, the stopped helper, the tip. The one place its look is set.
const CARD = { flexDirection: 'column', borderStyle: 'round', borderDimColor: true, paddingX: 2, paddingY: 1 } as const
const view = atom({ plugin: 'rostrum', key: 'view' } as const, null)

// Gone at a hot reload, with the module's timers and the helper it started: `supervisor` then starts over.
let running: Supervisor | undefined

// The bar is baked once per mode, percentage and phase, not at every draw; the last 40 are kept.
const baked = new Map<string, string>()
/** The bar's markup, or null when it would be over the host's limit (a very short phase name late in a step): text then. */
function barSvg(mode: 'light' | 'dark', pct: number, label: string): string | null {
  const key = `${mode}:${pct}:${label}`
  let svg = baked.get(key)
  if (svg === undefined) {
    svg = bakeBar(mode, pct, label)
    if (baked.size >= 40) baked.delete(baked.keys().next().value!)
    baked.set(key, svg)
  }
  return svg.length < SVG_LIMIT ? svg : null
}

async function hostOf($: EngineInterface): Promise<Host> {
  return {
    fetch: (url, init) => $.http.fetch(url, init),
    spawn: request => $.process.spawn(request),
    run: (argv, init) => $.process.run(argv, { timeoutMs: init?.timeoutMs ?? RUN_TIMEOUT_MS, ...(init?.env ? { env: init.env } : {}) }),
    sleep: ms => $.clock.sleep(ms),
    now: () => $.clock.now(),
    submit: text => $.prompt.submit({ text }),
    storeGet: key => $.store.get(key),
    storeSet: (key, value) => $.store.set(key, value),
    publish: next => update($, view, () => next),
    theme: async () => {
      const row = (await $.config.list()).find(r => r.key === 'theme')
      return typeof row?.value === 'string' ? row.value : null
    },
    copy: (text, surface) => $.ui.copy({ text, surface: surface as never }),
    root: $.plugin.root,
    env: {
      os: await $.env.get('OS'),
      userProfile: await $.env.get('USERPROFILE'),
      home: await $.env.get('HOME'),
      rostrumHome: await $.env.get('ROSTRUM_HOME'),
      node: await $.env.get('ROSTRUM_NODE'),
      port: await $.env.get('ROSTRUM_PORT'),
      // where Node is looked for, and Rostrum's data folder (hooks/node.ts)
      data: await $.env.get('ROSTRUM_DATA'),
      localAppData: await $.env.get('LOCALAPPDATA'),
      xdgData: await $.env.get('XDG_DATA_HOME'),
      programFiles: await $.env.get('ProgramFiles'),
      systemRoot: await $.env.get('SystemRoot'),
      pretendNoNode: await $.env.get('ROSTRUM_PRETEND_NO_NODE'),
    },
  }
}

/** The supervisor of this load of the module: made, started and set polling the first time it is asked for. */
async function supervisor($: EngineInterface): Promise<Supervisor> {
  if (running) return running
  const made = createSupervisor(await hostOf($))
  if (running) return running
  running = made
  // not awaited: the helper may take seconds to start, and the session does not wait for it
  void made.start().catch(() => undefined)
  $.clock.every(POLL_MS, () => void made.tick().catch(() => undefined))

  return made
}

// The helper starts with the session; the panel opens only when asked for (/rostrum).
let ready = false
async function setUp($: EngineInterface): Promise<void> {
  if (ready) return
  ready = true
  try {
    await $.command.register({ name: 'rostrum', description: 'Open the Rostrum panel' })
    await supervisor($)
  } catch (err) {
    ready = false
    throw err
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await setUp($)

    return next(e)
  })

  // session.start does not fire after a hot reload or when the app reopens a session, so /rostrum would be
  // unknown until the next new session: any prompt sets it up, and "/rostrum" typed as a prompt opens the panel.
  // The app's prompt box completes "/rostrum" to the skill's own name, so that name with nothing after it opens
  // the panel too (the skill still loads; with no job named it starts nothing).
  on('prompt.submit', async ($, e, next) => {
    await setUp($).catch(() => undefined)
    if (['/rostrum', '/rostrum:rostrum'].includes(e.text.trim())) {
      const s = await supervisor($)
      await s.opened().catch(() => undefined)
      await $.ui.open({ id: PANE, title: TITLE })
    }

    return next(e)
  }).catch((_$, e, next) => next(e)) // never in the way of a prompt

  on('command.run', { command: 'rostrum' }, async $ => {
    const s = await supervisor($)
    await s.opened().catch(() => undefined)
    await $.ui.open({ id: PANE, title: TITLE })

    return { text: 'Rostrum panel opened.' }
  })

  // the two drawings are made in the host's light or dark: a change of theme draws them again
  on('config.set', { key: 'theme' }, async ($, e, next) => {
    const r = await next(e)
    void supervisor($).then(s => s.themeChanged()).catch(() => undefined)

    return r
  }).catch((_$, e, next) => next(e)) // never in the way of the change itself

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Link } = $.ui.resolve(e)
    // not every surface has these: the terminal has no Svg, the mobile app no Input or Select
    const some = $.ui.resolve(e) as Partial<Elements['desktop']>
    const Input = some.Input, Select = some.Select, Markdown = some.Markdown, Svg = e.surface === 'terminal' ? undefined : some.Svg
    const shown = await read($, view)
    // After a hot reload the last view is still in $.state but nothing is polling (session.start does not fire
    // again), so the pane would show a stale picture until a button was pressed: drawing it starts the polling.
    if (!running) void supervisor($).catch(() => undefined)
    // No press fails silently: whatever a handler throws is said in the pane, by the supervisor when there is one.
    const guard = async (work: (s: Supervisor) => Promise<unknown>) => {
      let s: Supervisor | undefined
      try {
        s = await supervisor($)
        await work(s)
      } catch (err) {
        if (s) await s.failed(err).catch(() => undefined)
        else await update($, view, v => (v ? { ...v, notice: failureNotice(err) } : v)).catch(() => undefined)
      }
    }
    // A press handler returns at once: the supervisor shows the press as taken (its "…" label) before it awaits
    // anything, and the work goes on behind the pane, its failures said by `guard`.
    const press = (work: (s: Supervisor) => Promise<unknown>) => () => void guard(work)

    if (!shown) return (<Box flexDirection="column"><Text dimColor>Rostrum is starting.</Text></Box>)

    // a button whose press is being carried out: its "…" label, dim, not the main action (the supervisor takes no second press)
    const taken = (key: string, label: string, variant?: 'primary' | 'secondary') => {
      const now = shown.pending?.[key]
      return now ? { label: now, dimColor: true } : { label, variant }
    }

    const track = (done: number) => Svg
      ? <Svg source={trackSvg(done, shown.mode)} alt={`Step ${Math.min(done + 1, 6)} of 6`} width={200} height={10} />
      : <Text dimColor>{trackText(done)}</Text>

    const bar = (p: RostrumProgress, id: string) => {
      const baked = Svg ? barSvg(shown.mode, p.pct, p.label) : null
      // as wide as the card's row has room for beside the percentage, in the pane as wide as it is now
      const svg = baked ? sized(baked, barWidth(Number((e.props as { bodyColumns?: number }).bodyColumns))) : null
      return (
        <Box flexDirection="column">
          {Svg && svg
            ? <Box flexDirection="row" justifyContent="space-between" alignItems="center" gap={1}>
                <Box flexShrink={1} minWidth={0} overflow="hidden"><Svg source={svg.source} alt={`${p.label}, ${p.pct}%`} width={svg.width} height={svg.height} isInteractive /></Box>
                <Box flexShrink={0}><Text dimColor>{`${p.pct}%`}</Text></Box>
              </Box>
            : <Text>{barText(p.pct, p.label)}</Text>}
          {p.note && <Text dimColor>{p.note}</Text>}
          {p.isStale && <Box><Button key={`stopShowing:${id}`} plain dimColor label="Stop showing this" onPress={press(s => s.act('stopShowing', id))} /></Box>}
        </Box>
      )
    }

    // One action of a row. Open review / Open film are a link where the surface draws links: the surface opens the
    // page itself, at once, and no press travels to the panel. Everything else, and those two on a surface without
    // links (the terminal), is a button.
    const action = (r: RostrumRow, b: RostrumButton, variant?: 'primary' | 'secondary') => b.href && Markdown && e.surface !== 'terminal'
      ? <Markdown key={`${b.act}:${r.id}`} text={`[${b.label}](${b.href})`} />
      : <Button key={`${b.act}:${r.id}`} {...taken(`${b.act}:${r.id}`, b.label, variant)} onPress={press(s => s.act(b.act, r.id))} />

    const buttons = (r: RostrumRow) => (
      <Box flexDirection="row" gap={1} alignItems="center">
        {r.buttons.map(b => action(r, b, b.isPrimary ? 'primary' : 'secondary'))}
        {Select && r.brand && <Select key={`brand:${r.id}`} options={r.brand.options.map(value => ({ value }))} value={r.brand.value ?? undefined} onSelect={value => void guard(s => s.pickBrand(r.id, value))} />}
      </Box>
    )

    // an address sent to the browser, to press in case nothing opened
    const address = (l: RostrumLink) => (
      <Box flexDirection="column">
        <Text dimColor={!l.isWarning} color={l.isWarning ? 'warning' : undefined}>{l.line}</Text>
        {/* a remote surface draws a Link to an http: address as plain text; a link in Markdown it opens as it opens one in a reply */}
        {l.href && (e.surface !== 'terminal' && Markdown ? <Markdown text={`[${l.href}](${l.href})`} /> : <Link href={l.href} />)}
      </Box>
    )

    // the tidy actions (and the rename field, the delete question) are set apart from the track by a blank line
    const open = (r: RostrumRow) => (
      <Box key={`row:${r.id}`} {...CARD}>
        {r.more === 'rename' && Input
          ? <Box flexDirection="column" marginBottom={1}><Text dimColor>New name</Text><Input key={`rename:${r.id}`} value={r.name} submitLabel="Save" autoFocus onSubmit={value => void guard(s => s.rename(r.id, value))} /></Box>
          : <Box flexDirection="row" justifyContent="space-between">
              <Box flexShrink={1} minWidth={0}>{Markdown ? <Markdown text={headingMarkdown(r.name)} /> : <Text bold wrap="truncate-end">{r.name}</Text>}</Box>
              <Box flexShrink={0}><Button key={`more:${r.id}`} plain dimColor label={r.more === 'closed' ? 'More' : 'Close'} onPress={press(s => s.act(r.more === 'closed' ? 'more' : 'cancel', r.id))} /></Box>
            </Box>}
        {r.more === 'open' && (
          <Box flexDirection="row" gap={2} marginBottom={1}>
            {Input && <Button key={`rename:${r.id}`} plain label="Rename" onPress={press(s => s.act('rename', r.id))} />}
            <Button key={`tidyArchive:${r.id}`} plain {...taken(`archive:${r.id}`, 'Archive')} onPress={press(s => s.act('archive', r.id))} />
            <Button key={`delete:${r.id}`} plain label="Delete" onPress={press(s => s.act('delete', r.id))} />
          </Box>
        )}
        {/* The delete question is this tutorial's own (r.ask is null on every other card): its words name the
            tutorial, and its confirm carries this card's id and the question's one-time token. The supervisor
            deletes only when both are those of the question now open. */}
        {r.ask && (
          <Box flexDirection="column" marginBottom={1}>
            <Text>{r.ask.text}</Text>
            <Box flexDirection="row" gap={1} alignItems="center">
              <Button key={`confirmDelete:${r.id}`} {...taken(`confirmDelete:${r.id}`, 'Delete this recording', 'primary')} onPress={press(s => s.act('confirmDelete', r.id, r.ask!.token))} />
              <Button key={`cancel:${r.id}`} label="Keep" onPress={press(s => s.act('cancel', r.id))} />
            </Box>
          </Box>
        )}
        {track(r.done)}
        <Text dimColor>{r.stepLine}</Text>
        {r.line && <Text>{r.line}</Text>}
        {r.warn && <Text color="warning">{r.warn}</Text>}
        {r.progress ? bar(r.progress, r.id) : null}
        {r.buttons.length > 0 && buttons(r)}
        {r.link && address(r.link)}
      </Box>
    )

    const closed = (r: RostrumRow) => (
      <Box key={`row:${r.id}`} {...CARD}>
        <Box flexDirection="row" justifyContent="space-between" alignItems="center">
          <Box flexShrink={1} minWidth={0} overflow="hidden"><Button key={`open:${r.id}`} plain label={r.name} onPress={press(s => s.act('open', r.id))} /></Box>
          {r.buttons[0] && <Box flexShrink={0}>{action(r, r.buttons[0])}</Box>}
          {!r.buttons[0] && r.line && !r.progress && <Box flexShrink={0}><Text dimColor>{r.line}</Text></Box>}
        </Box>
        {/* a failure does not move its card: a collapsed one says it where it stands */}
        {r.isFailed && r.warn && <Text color="warning">{r.warn}</Text>}
        {r.progress ? bar(r.progress, r.id) : null}
        {r.link && address(r.link)}
      </Box>
    )

    // First-run setup (the helper's tools/setup.mjs): what one press fetches, its bar, a failed step, the transcriber.
    const install = shown.install && (
      <Box key="card:install" {...CARD}>
        <Text bold>{shown.install.title}</Text>
        {shown.install.lines.map(line => <Text key={`fetch:${line}`}>{line}</Text>)}
        {shown.install.where && <Text dimColor>{shown.install.where}</Text>}
        {shown.install.transcriber && <Text dimColor={!shown.install.transcriber.isMissing} color={shown.install.transcriber.isMissing ? 'warning' : undefined}>{shown.install.transcriber.line}</Text>}
        {shown.install.warn && <Text color="warning">{shown.install.warn}</Text>}
        {shown.install.progress && bar(shown.install.progress, '')}
        {(shown.install.button || shown.install.transcriber?.isMissing) && (
          <Box flexDirection="row" gap={1} marginTop={1}>
            {shown.install.button && <Button key="setUp" {...taken('setUp:', shown.install.button, 'primary')} onPress={press(s => s.setUp())} />}
            {shown.install.transcriber?.isMissing && <Button key="fixTranscriber" {...taken('fixTranscriber:', 'Ask Claude to set it up')} onPress={press(s => s.fixTranscriber())} />}
          </Box>
        )}
      </Box>
    )

    const setup =shown.setup && shown.setup.isOpen && (
      <Box key="card:setup" {...CARD}>
        <Text bold>Set up the recorder</Text>
        <Text dimColor>The recorder is a Chrome extension that you load into Chrome by hand. This is done once.</Text>
        <Box marginTop={1}><Text>1. Put the recorder's files on this computer.</Text></Box>
        <Button key="install" {...taken('install:', shown.setup.installed ? 'Put the recorder files in place again' : 'Put the recorder files in place', 'primary')} onPress={press(s => s.install())} />
        <Box marginTop={1}><Text>2. Open Chrome's extensions page and switch on Developer mode, top right.</Text></Box>
        <Button key="extensions" {...taken('extensions:', 'Open extensions page')} onPress={press(s => s.openExtensions())} />
        <Box marginTop={1}><Text>3. Press Load unpacked, top left, pick this folder and press Select Folder.</Text></Box>
        <Box flexDirection="row" gap={1} alignItems="center">
          <Text>{shown.setup.dir}</Text>
          <Button key="copy" label="Copy" onPress={p => guard(s => s.copyDir(p.surface))} />
        </Box>
        <Box marginTop={1}><Text>4. Pin it: press the puzzle-piece icon in Chrome's toolbar, then the pin beside Rostrum. Its icon is a blue speech bubble with an R cut out; a red ring means it is recording.</Text></Box>
        <Box marginTop={1}><Text dimColor>When Chrome has it, the line at the top turns to "Recorder connected" within a minute.</Text></Box>
      </Box>
    )

    // a blank line between the blocks (each card, the tip's last), two under the status line
    return (
      <Box flexDirection="column" gap={1}>
        {shown.status.isStopped
          ? <Box key="card:stopped" {...CARD}>
              <Text color="warning" bold>{shown.status.line}</Text>
              {!shown.status.node && <Text>Nothing is lost, but recordings cannot arrive and nothing can be built until it is running again.</Text>}
              {shown.status.reason && <Text dimColor={!shown.status.node}>{shown.status.reason}</Text>}
              {/* no Node on this computer: what one press downloads, its bar, a failed fetch (hooks/node.ts) */}
              {shown.status.node?.lines.map(line => <Text key={`node:${line}`} dimColor>{line}</Text>)}
              {shown.status.node?.warn && <Text color="warning">{shown.status.node.warn}</Text>}
              {shown.status.node?.progress && bar(shown.status.node.progress, '')}
              {!shown.status.node?.progress && (
                <Box flexDirection="row" gap={1} marginTop={shown.status.node ? 1 : 0}>
                  {shown.status.node?.button && <Button key="fetchNode" {...taken('fetchNode:', shown.status.node.button, 'primary')} onPress={press(s => s.fetchNode())} />}
                  <Button key="restart" {...taken('restart:', 'Start Rostrum again', shown.status.node?.button ? undefined : 'primary')} onPress={press(s => s.restart())} />
                  {shown.status.fixPrompt && <Button key="fixHelper" {...taken('fixHelper:', 'Ask Claude to fix this')} onPress={press(s => s.fixHelper())} />}
                </Box>
              )}
            </Box>
          : <Box flexDirection="column" marginBottom={1}>
              <Box flexDirection="row" justifyContent="space-between" alignItems="center">
                <Box flexDirection="row" gap={1} alignItems="center">
                  {Svg
                    ? <Svg source={dotSvg(shown.status.isConnected === true, shown.mode)} alt={shown.status.isConnected ? 'Connected' : 'Not connected'} width={8} height={8} />
                    : <Text color={shown.status.isConnected ? GREEN.dark : undefined} dimColor={!shown.status.isConnected}>●</Text>}
                  <Text dimColor>{shown.status.line}</Text>
                </Box>
                {shown.setup?.showLink && <Button key="setup" plain dimColor={!shown.setup.isOpen} label={shown.setup.isOpen ? 'Close setup' : 'Recorder setup'} onPress={press(s => s.setup(!shown.setup!.isOpen))} />}
              </Box>
              {/* The desktop gives the panel the keyboard on the first click into it and no button hears that click
                  (docs/stage-b/panel-first-click.md). Always there, focused or not: a line that came and went would
                  move the cards under the pointer between the two clicks. The terminal is worked by its keys. */}
              {e.surface === 'desktop' && <Text key="first-click" dimColor italic>{FIRST_CLICK}</Text>}
            </Box>}
        {install}
        {setup}
        {shown.notice && <Text color="warning">{shown.notice}</Text>}
        {shown.link && address(shown.link)}
        {shown.empty && (
          <Box flexDirection="column">
            <Text bold>{shown.empty.title}</Text>
            <Text>{shown.empty.line}</Text>
            {shown.empty.showSetupButton && !shown.setup?.isOpen && <Button key="setup-first" variant="primary" label="Set up the recorder" onPress={press(s => s.setup(true))} />}
          </Box>
        )}
        {/* where the deleted card stood (the open one, at the top): it is in the helper's trash, and Undo brings it back */}
        {(shown.deleted ?? []).map(d => (
          <Box key={`deleted:${d.id}`} flexDirection="row" gap={1} alignItems="center">
            <Box flexShrink={1} minWidth={0}><Text dimColor wrap="truncate-end">{`Deleted "${d.name}".`}</Text></Box>
            <Box flexShrink={0} flexDirection="row" gap={1}>
              <Button key={`undo:${d.id}`} plain {...taken(`undo:${d.id}`, 'Undo')} onPress={press(s => s.undo(d.id))} />
              <Button key={`dismiss:${d.id}`} plain dimColor label="Dismiss" onPress={press(s => s.dismiss(d.id))} />
            </Box>
          </Box>
        ))}
        {shown.tutorials.map(r => (r.isOpen ? open(r) : closed(r)))}
        {shown.tip && (
          <Box key="card:tip" {...CARD} marginTop={1}>
            <Box flexDirection="row" justifyContent="space-between" alignItems="center">
              <Text dimColor>Did you know</Text>
              <Box flexDirection="row" gap={2}>
                <Button key="prevTip" plain dimColor label="←" onPress={press(s => s.prevTip())} />
                <Button key="nextTip" plain dimColor label="→" onPress={press(s => s.nextTip())} />
              </Box>
            </Box>
            <Text italic dimColor>{shown.tip}</Text>
          </Box>
        )}
      </Box>
    )
  })
}
