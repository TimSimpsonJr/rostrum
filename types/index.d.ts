// The panel's state contract: what the mod keeps in `$.state` for the session. One value, the view the pane draws:
// the poll (hooks/supervise.ts) writes it when what is shown changes, the render hook (hooks/register.tsx) reads it.
// Self-contained on purpose (no import): plugin.json names this file as the plugin's "types".

/** What a button of the panel does when pressed (hooks/supervise.ts `act`). */
export type RostrumAct = 'script' | 'viewScript' | 'narration' | 'build' | 'review' | 'film' | 'keep' | 'retry' | 'fix' | 'archive' | 'delete' | 'confirmDelete' | 'cancel' | 'open' | 'more' | 'rename' | 'stopShowing'

export type RostrumButton = {
  act: RostrumAct
  label: string
  isPrimary: boolean
  /**
   * Open review / Open film only: the review page's address. A surface that draws links draws the action as a link to
   * it and opens it itself; one that does not keeps the button, whose press the panel carries out. Null for the rest.
   */
  href: string | null
}

/** A long step under way: the whole step's percentage, the phase in the pill, the builder's latest plain note. */
export type RostrumProgress = {
  pct: number
  label: string
  note: string | null
  isDone: boolean
  /**
   * New pieces being made in the chat (no stage of the helper's runs, so nothing ends it by itself) and nothing told
   * of it for six hours: the card offers "Stop showing this", which takes the bar away.
   */
  isStale: boolean
}

/**
 * The line under a pressed Open button: for a few seconds the plain word that the page takes a moment (no address),
 * or, when no opener worked, the warning with the address to open by hand.
 */
export type RostrumLink = { line: string; isWarning: boolean; href: string | null }

export type RostrumRow = {
  id: string
  /** The title, or "<site> · <date>, <time>" until the script names it: two untitled recordings never read the same. */
  name: string
  /** The one open row: drawn first, with its track, step line, sentence and button. */
  isOpen: boolean
  /** Steps done of six, and the step line ("Narration, step 4 of 6" / "Approved, all 6 steps done"). */
  done: number
  stepLine: string
  /** The host's warning colour: a failure in one sentence. */
  warn: string | null
  /** A step failed and nothing runs: `warn` is the failure, drawn on the card where it stands, open or collapsed. */
  isFailed: boolean
  /** One sentence: where it stands, or what is running. */
  line: string | null
  /** One button; none while a stage runs. Archive is among the tidy actions under More. */
  buttons: RostrumButton[]
  /** The brand picker: the open row only, and only when more than one brand exists. */
  brand: { options: string[]; value: string | null } | null
  progress: RostrumProgress | null
  /** The tidy actions: closed, the three links, the rename field, the delete question. */
  more: 'closed' | 'open' | 'rename' | 'delete'
  /**
   * The delete question, on the card of the tutorial it was put for and on no other: its words (they name the
   * tutorial, when it was recorded and its site) and the one-time token its confirm must carry. Null otherwise.
   */
  ask: { text: string; token: string } | null
  /** What its Open review / Open film says after a press, drawn in its card under its buttons; null when nothing. */
  link: RostrumLink | null
}

export type RostrumView = {
  /** The host's theme, for the two drawings (the stage track and the progress bar). */
  mode: 'light' | 'dark'
  /** The one-line status (a dot, green while the recorder is connected, and its words), or the stopped block. */
  status: {
    line: string; isConnected: boolean; isStopped: boolean; reason: string | null; fixPrompt: string | null
    /**
     * Stopped for want of Node (hooks/node.ts): what one press would download and where to (or, where none is
     * offered, what to do instead), the button ("Download Node 22", "Try again"; null while it runs and where none is
     * offered), the fetch's bar, and a failed fetch in plain words. Null or absent otherwise.
     */
    node?: { lines: string[]; button: string | null; progress: RostrumProgress | null; warn: string | null } | null
  }
  /**
   * First-run setup (the helper's, tools/setup.mjs), a card above the list while this copy of Rostrum lacks something
   * or has no transcriber; null when there is nothing to say (and from a view written before there was one).
   */
  install?: {
    title: string
    /** What one press fetches, a line each; none when nothing is missing. */
    lines: string[]
    /** Where it goes and that nothing is sent anywhere, under the lines. */
    where: string | null
    /** The one button's label ("Download and set up", "Try again"); null while it runs and with nothing to fetch. */
    button: string | null
    /** A run under way: the whole run's percentage and the step in the pill. */
    progress: RostrumProgress | null
    /** The step that failed, in plain words, in the warning colour. */
    warn: string | null
    /** About the transcriber when setup fetches none: the line, and whether there is none at all (Claude is offered). */
    transcriber: { line: string; isMissing: boolean } | null
  } | null
  /** The recorder setup, in place under the status line; null while the helper is not answering. */
  setup: { isOpen: boolean; /** The "Recorder setup" link in the status line. */ showLink: boolean; dir: string; hasVendor: boolean; installed: boolean } | null
  /** What the last press could not do, and what to do about it. */
  notice: string | null
  /** The warning and address when the recorder setup's "Open extensions page" could not open a browser (a tutorial's is in its row). */
  link: RostrumLink | null
  /**
   * The presses being carried out now: `<act>:<id>` (the id empty for a button of no tutorial, "install:") to the
   * label its button wears meanwhile ("Opening…"). Such a button is drawn dim and a press on it is not taken.
   */
  pending: Record<string, string>
  /** Tutorials deleted in this session (they are in the helper's trash), the latest first: a line each, above the list, with Undo. */
  deleted: { id: string; name: string }[]
  /** The open one first, then the newest recording first. A failure moves nothing; nothing moves while a delete question is open. */
  tutorials: RostrumRow[]
  /** Shown when nothing is in progress. */
  empty: { title: string; line: string; showSetupButton: boolean } | null
  /** The tip in the last card, without its "Did you know" heading. */
  tip: string | null
}

declare module 'claude-code' {
  interface PluginState {
    rostrum: { view: RostrumView | null }
  }
}
