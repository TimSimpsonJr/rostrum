// Node for the helper: where it is looked for, which one is good enough (22 or newer), and, on a press, fetching a
// portable one from nodejs.org into Rostrum's data folder. The panel is the one part of Rostrum that runs without
// Node, so this is its job. Pure: it reaches the computer only through `run` (the engine's `$.process.run`: an
// argument list, no shell), and reads no file itself.
// The fetch: the engine's own fetch carries text only, so the system's curl downloads, the system's certutil or
// shasum hashes, the system's tar unpacks, each by its full path with a fixed argument list. The only address is
// NODE_PIN's, the only paths are under the data folder, and the archive's SHA-256 (in this file) is checked BEFORE
// anything is unpacked or run: a download that does not match is removed and never used.
import type { Platform } from './helper.ts'

/** Runs a short command to its end (hooks/supervise.ts `Host.run`). */
export type Run = (argv: string[], init?: { timeoutMs?: number; env?: Record<string, string> }) => Promise<{ exitCode: number; stdout: string }>

/** What is read of the host's environment, once (hooks/register.tsx). */
export type NodeEnv = {
  /** ROSTRUM_NODE: a Node the user (or Claude, in chat) named. */
  node?: string
  /** ROSTRUM_DATA, LOCALAPPDATA, USERPROFILE, HOME, XDG_DATA_HOME: where the data folder is (as tools/data.mjs). */
  data?: string
  localAppData?: string
  userProfile?: string
  home?: string
  xdgData?: string
  programFiles?: string
  /** SystemRoot: where Windows keeps the curl, tar and certutil the fetch below is done with. */
  systemRoot?: string
  /** ROSTRUM_PRETEND_NO_NODE=1: only the data folder's own copy counts (how a computer without Node is rehearsed). */
  pretendNoNode?: string
}

export const NODE_MIN = 22

const join = (platform: Platform, ...parts: string[]) => parts.map((p, i) => (i ? p : p.replace(/[\\/]+$/, ''))).join(platform === 'windows' ? '\\' : '/')

/** Rostrum's data folder, by the rule of tools/data.mjs `dataDir` (tools/setup.test.mjs holds the two to the same answers); null when the environment names no home. */
export function dataDirOf(env: NodeEnv, platform: Platform): string | null {
  if (env.data?.trim()) return env.data.trim()
  const home = (platform === 'windows' ? env.userProfile : env.home)?.trim()
  if (platform === 'windows') {
    const root = env.localAppData?.trim() || (home ? join(platform, home, 'AppData', 'Local') : '')
    return root ? join(platform, root, 'Rostrum') : null
  }
  if (platform === 'mac') return home ? join(platform, home, 'Library', 'Application Support', 'Rostrum') : null
  const root = env.xdgData?.trim() || (home ? join(platform, home, '.local', 'share') : '')
  return root ? join(platform, root, 'rostrum') : null
}

/** Where a Node fetched by the panel lives: <data>/node/node.exe, or <data>/node/bin/node. */
export function portableNode(env: NodeEnv, platform: Platform): string | null {
  const data = dataDirOf(env, platform)
  return data ? join(platform, data, 'node', ...(platform === 'windows' ? ['node.exe'] : ['bin', 'node'])) : null
}

/**
 * The places Node is looked for, in order: ROSTRUM_NODE, `node` on PATH, the usual install places (an app started
 * from the Dock or the Start menu does not always carry the shell's PATH), then the copy the panel fetched.
 * ponytail: version managers that keep Node under a version-numbered folder (nvm, fnm) are not searched (nothing here
 * can list a folder); their Node is found when it is on PATH, and otherwise the fetched copy stands in.
 */
export function nodeCandidates(env: NodeEnv, platform: Platform): string[] {
  const own = portableNode(env, platform)
  if (env.pretendNoNode === '1') return own ? [own] : []
  const usual = platform === 'windows'
    ? [env.programFiles?.trim() && join(platform, env.programFiles.trim(), 'nodejs', 'node.exe'), env.localAppData?.trim() && join(platform, env.localAppData.trim(), 'mise', 'shims', 'node.exe')]
    : ['/opt/homebrew/bin/node', '/usr/local/bin/node']
  return [...new Set([env.node?.trim(), 'node', ...usual, own].filter((c): c is string => !!c))]
}

/** "v22.11.0" -> 22; null for anything else. */
export const majorOf = (version: string): number | null => { const m = /^v(\d+)\.\d+\.\d+/.exec(version.trim()); return m ? Number(m[1]) : null }

/**
 * The first candidate that runs and is Node 22 or newer: each is asked its version. `older`: the version of a Node
 * that was found but is too old, when none is good (said in the panel).
 */
export async function findNode(run: Run, env: NodeEnv, platform: Platform): Promise<{ node: { path: string; version: string } | null; older: string | null }> {
  let older: string | null = null
  for (const path of nodeCandidates(env, platform)) {
    const r = await run([path, '--version']).catch(() => null)
    const version = r?.exitCode === 0 ? r.stdout.trim() : '', major = majorOf(version)
    if (major !== null && major >= NODE_MIN) return { node: { path, version: version.slice(1) }, older: null }
    if (major !== null) older ??= version.slice(1)
  }
  return { node: null, older }
}

/**
 * The portable Node the panel fetches: one version, from nodejs.org, each archive with its size and the SHA-256 that
 * nodejs.org's own SHASUMS256.txt for that version lists (https://nodejs.org/dist/v22.23.3/SHASUMS256.txt, read on
 * 13 Oct 2026). Nothing is asked at run time about what the right checksum is: it is here.
 */
export const NODE_PIN = {
  version: '22.23.3',
  base: 'https://nodejs.org/dist/v22.23.3/',
  archives: {
    windows: { file: 'node-v22.23.3-win-x64.zip', sha256: '2b0ff57b049cda1bbcea2240eec20467018713c1efe1f7360c2681859b90ed71', mb: 36 },
    'mac-arm64': { file: 'node-v22.23.3-darwin-arm64.tar.gz', sha256: '23b25245dcfb9af7262f8ff142e9e2e0af025368117329e7a7458a51e5922f53', mb: 50 },
    'mac-x64': { file: 'node-v22.23.3-darwin-x64.tar.gz', sha256: '8a677b0219178efd6eb0e475457c4afb452b521a92f6e67845a73bd85727f2a8', mb: 51 },
  },
} as const

export type NodeArchive = { file: string; sha256: string; mb: number }
/**
 * The archive for this computer, or null where none is fetched (Linux: Node comes from the system there). Windows
 * gets the x64 build on any processor: it runs on ARM too, and the film's packages have no ARM build for Windows.
 * `arch` is what `uname -m` printed on a Mac.
 */
export function nodeArchive(platform: Platform, arch: string): NodeArchive | null {
  if (platform === 'windows') return NODE_PIN.archives.windows
  if (platform === 'mac') return NODE_PIN.archives[arch.trim() === 'arm64' ? 'mac-arm64' : 'mac-x64']
  return null
}

/** What the panel says it would fetch, and where to: null where there is nothing to offer. */
export function nodeOffer(env: NodeEnv, platform: Platform, arch: string): { version: string; mb: number; dir: string } | null {
  const archive = nodeArchive(platform, arch), data = dataDirOf(env, platform)
  return archive && data ? { version: NODE_PIN.version, mb: archive.mb, dir: join(platform, data, 'node') } : null
}

/** The system's own programs, by full path: a `curl` or `tar` earlier on PATH is not what runs. */
function tools(env: NodeEnv, platform: Platform) {
  if (platform !== 'windows') {
    return { curl: '/usr/bin/curl', tar: '/usr/bin/tar', hash: (file: string) => ['/usr/bin/shasum', '-a', '256', file], remove: (file: string) => ({ argv: ['/bin/rm', '-f', file], env: undefined }) }
  }
  const sys = join(platform, env.systemRoot?.trim() || 'C:\\Windows', 'System32')
  return {
    curl: join(platform, sys, 'curl.exe'), tar: join(platform, sys, 'tar.exe'), hash: (file: string) => [join(platform, sys, 'certutil.exe'), '-hashfile', file, 'SHA256'],
    // the path travels in the environment, never in the command's text: nothing in it is read as PowerShell
    remove: (file: string) => ({ argv: [join(platform, sys, 'WindowsPowerShell', 'v1.0', 'powershell.exe'), '-NoProfile', '-NonInteractive', '-Command', 'Remove-Item -LiteralPath $env:ROSTRUM_REMOVE -Force'], env: { ROSTRUM_REMOVE: file } }),
  }
}

/** The SHA-256 in what the hashing program printed: shasum's "<hex>  <file>", certutil's line of hex (older ones put a space between bytes). */
export function parseHash(out: string): string | null {
  for (const line of out.split(/\r?\n/)) {
    const first = /^([0-9a-fA-F]{64})\s/.exec(line)?.[1] ?? line.replace(/\s/g, '')
    if (/^[0-9a-fA-F]{64}$/.test(first)) return first.toLowerCase()
  }
  return null
}

/** Where a fetch is: the pill's words, the whole fetch's percentage, and (failed) what went wrong in plain words. */
export type NodeFetch = { state: 'fetching' | 'verifying' | 'unpacking' | 'done' | 'failed'; label: string; pct: number; note: string | null }
const TEN_MINUTES = 600_000 // the engine's ceiling for one command

/**
 * Fetches the pinned Node into <data>/node: download, checksum, and only then unpack and try it. Resolves the path
 * of the Node now there, or null when it failed (`say` was told why). `pin`: the tests' own.
 * ponytail: the bar moves by step, not by byte (one command downloads the whole archive; its progress is not read).
 */
export async function installNode(run: Run, env: NodeEnv, platform: Platform, arch: string, say: (s: NodeFetch) => Promise<unknown>, pin: { base: string; version: string } = NODE_PIN, archive: NodeArchive | null = nodeArchive(platform, arch)): Promise<string | null> {
  const fail = async (note: string) => { await say({ state: 'failed', label: 'Not downloaded', pct: 0, note }); return null }
  const exe = portableNode(env, platform), data = dataDirOf(env, platform)
  if (!archive || !exe || !data) return fail('Node cannot be downloaded for this computer. Install Node 22 from nodejs.org, then press Start Rostrum again.')
  const t = tools(env, platform), dir = join(platform, data, 'node'), file = join(platform, dir, archive.file)
  const ran = async (argv: string[], init?: Parameters<Run>[1]) => { const r = await run(argv, init).catch(() => null); return r?.exitCode === 0 ? r : null }
  const remove = async () => { const r = t.remove(file); return !!(await ran(r.argv, r.env ? { env: r.env } : undefined)) }

  await say({ state: 'fetching', label: `Downloading Node ${pin.version}`, pct: 5, note: null })
  // https only, redirects included; a failed transfer leaves nothing that is used (the next press writes over it)
  if (!(await ran([t.curl, '--fail', '--silent', '--show-error', '--location', '--proto', '=https', '--proto-redir', '=https', '--retry', '3', '--create-dirs', '--output', file, pin.base + archive.file], { timeoutMs: TEN_MINUTES }))) {
    await remove()
    return fail('The download did not finish. Check the connection and press again.')
  }
  await say({ state: 'verifying', label: 'Checking the download', pct: 70, note: null })
  const hashed = await ran(t.hash(file))
  if (!hashed || parseHash(hashed.stdout) !== archive.sha256) {
    const isGone = await remove()
    return fail(`The download did not match the checksum nodejs.org publishes for it, so it was not unpacked or run${isGone ? ', and it was removed' : ''}. Press again.`)
  }
  await say({ state: 'unpacking', label: 'Unpacking Node', pct: 80, note: null })
  // the archive holds one folder (node-v…): its contents go straight into <data>/node
  if (!(await ran([t.tar, '-xf', file, '-C', dir, '--strip-components=1'], { timeoutMs: TEN_MINUTES }))) return fail('The download could not be unpacked. Press again.')
  const version = await ran([exe, '--version'])
  if (version?.stdout.trim() !== `v${pin.version}`) return fail('The Node that was unpacked did not run on this computer. Ask Claude to fix this.')
  await remove()
  await say({ state: 'done', label: `Node ${pin.version} is ready`, pct: 100, note: null })
  return exe
}
