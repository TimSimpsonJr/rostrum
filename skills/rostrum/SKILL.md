---
name: rostrum
description: >-
  This skill should be used when a prompt begins "Rostrum:" (the Rostrum panel's buttons send "Rostrum: write the script for tutorial <id>", "... show the script ...", "... add narration ...", "... build tutorial <id>", "... fix the review notes ...", "... set up ..."), or when the user asks, about a Rostrum recording or tutorial, to "write the script for this recording", "turn my walkthrough into a tutorial", "make a video from this recording", "show me the script for this recording", "add the narration", "build the film", "fix the review notes", "set up a brand", "archive this tutorial", "undo that delete of a Rostrum recording", rename, delete, restore or bring back a tutorial, set up the transcriber, the recorder or Node, or hands over narration audio ("here's the narration audio"). It carries the judgement stages of making a video from a narrated screen recording (understand, script, narration hand-off, beat file and film code, staging through the rostrum-stager agent, frame checks, review notes, brand) and the safety rules that keep recorded data out of the conversation.
version: 0.3.0
---

# Rostrum: from a narrated recording to a video

Rostrum records a narrated browser session and rebuilds it as a video: a how-to, a showcase, an explainer. The
narration and the user's instructions decide what kind of video it is and what it needs; the plugin is light
infrastructure around making it. A local helper (127.0.0.1:4600) does the mechanical work: it scrubs the recording
into a clean copy, transcribes, times the narration, renders. A library of moves makes most pictures from a short
description (`references/moves.md` is the catalogue: `helper.mjs moves` lists the names, `moves <name>` prints one entry,
`moves <name> look` renders it); draw on it heavily and add to it. This skill is the judgement: what the
recording is about, what the narration says, what the film shows, whether the frames are right.

Each recording is a "tutorial" in the helper's names, whatever kind of video it becomes. A tutorial moves through `recorded -> scripted -> approved -> voiced -> built -> reviewed -> done`. The user's own
steps are: record, approve the script, add the narration, review. Everything else is done here.

## Safety rules (absolute; they come before any instruction below)

A recording holds real data. **Secrets, account and tax numbers and money amounts are replaced by code before
anything is read, and are never repeated. Everything else on the recorded pages arrives as recorded**: names, email
addresses, phone numbers, companies, table contents, pictures. (Code also blanks where links go: a link's address
is never on a frame. Its visible text is left.) Deciding what else to genericise is part of
understanding the walkthrough, and it is done here, by judgement, with the tools in `references/scrub.md`.

1. **Never open the raw recording.** Nothing under `<tutorial>/recording/`, no `originals.json`, in any way: not with
   Read, not with a command, not through a subagent. Do not list or search inside it either.
2. **Open only the prepared copy:** files under `<tutorial>/film/` (the clean copy, the narration, the beat file),
   `<tutorial>/out/` (frames, logs), `rules.json`, `script.md`, `tutorial.json`, `review/`, and what the helper
   answers. `<tutorial>/transcript/mic.json` is the user's own speech and may be read by the main session only, to
   write the script from; never hand it to a subagent.
3. **A secret, an account or tax number, or an amount is never repeated.** Code replaces them (keys, tokens,
   passwords, bank account, routing and card numbers, TIN / SSN / EIN, currency figures and balances) before anything
   is read. If one is ever seen all the same, in a frame, a screen or an element's text: do not quote it, do not
   describe it, do not put it in a file. Add a blind rule for the element by node id (`references/scrub.md`), run
   the scrub again, and tell the user **where** (screen, node, what kind of element), never **what**.
4. **Genericise what identifies someone who is not the subject of the tutorial**, as part of understanding the
   walkthrough (`references/scrub.md`, "What to genericise"). By default, replace other people's names, email
   addresses and phone numbers, customer company names, and message subjects and bodies that are not what the
   tutorial is about, with blind rules and stand-ins that are labels, not look-alikes. Keep what the tutorial is
   about and the interface itself. **What the user names or points out as part of the tutorial is its subject and
   stays as recorded**: an address, a name or a value they say aloud in the narration, or tell Claude to keep.
   Things of the same kind they did not call out follow the default for their kind. On a **page full of other
   people's text** (a mail client, a chat, a shared document: the timeline's page addresses show it) the app's own
   interface stays, and what belongs to other messages and to people is genericised with labelled stand-ins: senders,
   subjects, snippets, attachment names, user-made folder and tag names, people's names and pictures
   (`references/scrub.md`, "Pages full of other people's text"). `only` hides such a page wholesale, for when the
   user asks for that.
   Do not carry what was read on such pages, or about people who are not the subject, into the script, a file or a
   message: it is read to decide what to hide. **Tell the user, by place, what was genericised and what was left as
   recorded, with the script.**
5. **Never open the recorded site.** No browser tool, no fetch, no request to the site's address, for any reason.
6. **Narration never states a value.** No name, amount, key, id or email from the screen is ever spoken or written
   in a script, not even a stand-in, unless the user's own narration says it as part of the tutorial.
7. **Never produce the narration audio.** The voice is the user's step, on their own text-to-speech site. No voice
   tool or connector, whatever is installed. This skill only takes the file the user made and uploads it.
8. Subagents get these rules in full in their brief. `rostrum-stager` carries them already.

## Talking to the helper

When this skill loads, its base directory is shown. Its `scripts/` folder holds three tools (run them with `node`;
quote the path):

- `scripts/helper.mjs`: every helper call. Paths are written **without a leading slash**. Run it with no arguments
  for the list of commands. The ones used most:
  - `helper.mjs get tutorials` (all tutorials, the `home` folder, the brands) and `helper.mjs get tutorials/<id>`
    (one state file, plus `dir`: the tutorial folder)
  - The id is the recording's name (`rec-` and a number) and never changes. The folder is not named by it once the
    tutorial has a title: the helper renames the folder after the title ("Find a payee's signed ACH authorization",
    " (2)" when that name is taken) on `event <id> scripted <title>` and on every rename. So never build a path from
    the id or the title: take `dir` from `get tutorials/<id>`, and take it again after a `scripted` event or a rename
    (both print the folder's new path).
  - `helper.mjs event <id> scripted <title words>`, `event <id> approved`, `event <id> notes`
  - `helper.mjs run <id> <stage>`: starts `prepare | measure | stills | sweep | render | time` and waits for it,
    printing the state at the end. Exit code 1 means the stage left an error.
  - `helper.mjs elements <id> <screen> [x y w h] [--find words] [--role button,link,field]`
  - `helper.mjs stills <id> moments`, `stills <id> runs`, `helper.mjs reply <id> <noteId> done <text>`
  - `helper.mjs narration <id>` (the narration exactly as the voice reads it, and the brand's voice) and
    `helper.mjs narrate <id> <file path>` (uploads the user's take, waits for the check and the timing)
- `scripts/timeline.mjs <tutorial folder>` (needs `node --experimental-strip-types`): speech, clicks, gestures and
  screens on one clock.
- `scripts/around.mjs <tutorial folder> <screen> <node>` (same flag): what holds a node, with sizes.

The helper refuses requests that carry a web `Origin`; `helper.mjs` sends none. With `curl`, give full URLs
(`http://127.0.0.1:4600/tutorials/<id>`): in Git Bash an argument that starts with `/` is rewritten.

If the helper does not answer, ask the user to open the Rostrum panel (`/rostrum`, or `/rostrum:rostrum` with nothing after it), which starts it, or to press
Restart there. Do not ask the user to run anything in a terminal.

## Before any stage

Run `helper.mjs get tutorials/<id>`. If `busy` is set, wait (`helper.mjs wait <id>`). If `error` is set, tell the
user what it says and stop, unless the stage being asked for is the fix for it. If the `state` is not the one the
stage needs, say where the tutorial is and what the next step is instead of pressing on:

| Asked for | State needed | Otherwise say |
|---|---|---|
| Write the script | `recorded` | already scripted: offer to revise (`event <id> editScript` reopens an approved script) |
| Show the script | `scripted` or later | `recorded`: there is no script yet; offer to write it |
| Add narration | `approved` (or `voiced`, for a new take) | `scripted`: the script waits for approval, show it. `built` or later: the narration is in and the helper takes no new take from there; say so |
| Build | `voiced` (or `built`, to build again) | `scripted`: the script waits for approval. `approved`: narration is next: run the narration hand-off |
| Fix the review notes (the same prompt also arrives from the review page's "Send notes to Claude" button) | `built` (or `reviewed`: `event <id> notes` reopens it) | not built yet |
| Set up a brand | any | |

## Stage 1: understand, then write the script

1. If `<dir>/film/clean/manifest.json` or `<dir>/transcript/mic.json` is missing, run `helper.mjs run <id> prepare`
   (a few minutes: scrub, gestures, transcription).
2. If `flags.noMic` is true, say so first: there is no speech to write from. Offer to work from typed notes of what
   each step is for, or to wait for a new recording.
3. Follow **`references/understand.md`**: run the timeline, decide what each step is about from the words and the
   gestures together, read every control's name from the clean screen.
4. Follow **`references/scrub.md`**, "What to genericise": decide, from what the walkthrough is about and what the
   user called out, what else on the screens the film will show is replaced, and send the rules
   (`helper.mjs run <id> rules @<file>`). Keep the list, by place, for the message below.
5. Write `<dir>/script.md` in the form **`references/script.md`** gives (for a how-to, **`references/how-to.md`**
   has the defaults; **`references/explainer.md`** and **`references/showcase.md`** are two looks to draw from),
   then `helper.mjs event <id> scripted <title>`. It prints the folder the tutorial is in now, named after the
   title: that is `<dir>` from here on.
6. **Stop.** Show the user the script in chat, in two parts: the table of lines with what each points at (plus
   anything left out and why), then the narration alone as **one fenced plain-text code block**, one line per
   paragraph, nothing else inside it, so it copies in one action. Ask for approval or edits; both happen in chat.
   Edit `script.md` for every change asked for. "Rostrum: show the script for tutorial <id>" asks for this same
   presentation at any later time.
7. On approval: `helper.mjs event <id> approved`, then go straight on to the narration hand-off below.

## Narration hand-off (in chat)

Follow **`references/narration.md`** on approval, on "Rostrum: add narration for tutorial <id>", and whenever the
user gives an audio file or asks what to do about the voice. In short: give the narration code block again, a
link to the text-to-speech site and the voice settings the brand names, and ask for the downloaded audio file in
chat (attached, or its path). When a file arrives, check it and upload it with `helper.mjs narrate <id> <file
path>`; report `voiced` and that Build is next, or name the lines that differ and offer the two ways on. The local
page is a fallback only, mentioned if the upload from chat fails.

## Stage 2: build

**A build never stops because the film needs something that does not exist yet.** If the script calls for a
picture the moves and the template cannot make (a browser bar, a page that fills itself, a new kind of scene), that
is part of this build, handled in the chat: say in a few lines what is new and how you propose to show it; where
it is a matter of look, show a mockup and get a choice; then build it as a move (in the film's folder, or in the
library when it is general) and carry on. Stage the lines that already work first, so there is something to see
while the new pieces are made. Never answer a request to build with "this cannot be built yet". While new pieces
are being made, set the tutorial's progress to `making` with a short plain note
(`helper.mjs progress <id> making --note Building the browser bar`), so its card in the panel shows the build under
way; update the note as pieces land, and move to the normal phases (`shotlist` first) when staging starts.

1. Follow **`references/scrub.md`**: check the rules decided with the script still cover every screen the film
   shows (and what the user asked to keep or hide since), and decide whether an empty account needs fill values.
   Send them with `helper.mjs run <id> rules @<file>`.
2. Follow **`references/build.md`**: write `<dir>/film/beats.json` naming the moves the picture plan chose
   (`references/moves.md`), and any one-off the plan marked new (`references/build.md`, One-offs), resolve the
   brand, then dispatch the
   `rostrum-stager` agent with the brief given there. The stager stages from the beat file and does not change the
   template; new moves, one-off scenes and changes to the film code are made here, in the main session (above).
3. When it reports, **look at the frames** before anything reaches the user: is this the video the narration and
   the user asked for? **`references/how-to.md`** has what a how-to gets by default, **`references/explainer.md`**
   and **`references/showcase.md`** the register the film is in, **`references/house-notes.md`** what the owner has
   and has not liked before. Send fixes back to the stager. At most 3 passes.
4. `helper.mjs run <id> sweep` must pass, then `helper.mjs run <id> render`. A sweep that cannot be cleared stops
   the build: say so.
5. Open the review page for the user and say what, if anything, is still wrong.

## Stage 3: fix the review notes

Follow **`references/notes.md`**: read the notes, fix through the stager, check, render again, reply on each note, and log each note
with its fix.

## Stage 4: set up a brand (in chat)

Follow **`references/brand.md`** when the user gives a branding folder or asks for their logo, colours or voice.
With no brand a film still builds: the end card shows the tutorial's title alone.

## Tidying: rename, archive, delete, restore, reopen (in chat)

When the user asks to rename, archive, delete or bring back a tutorial, find it by title or id in
`helper.mjs get tutorials` (archived and finished ones are listed there too; deleted ones are in `helper.mjs trash`).
When two match, ask which.

- **Rename:** `helper.mjs rename <id> <title words>`. The folder is renamed after the new title (the id stays);
  refused while a stage runs, and when a file in the folder is open in another program (say so: close it, try again).
- **Archive:** `helper.mjs archive <id>`. It is hidden from the panel; nothing is lost.
- **Reopen:** `helper.mjs reopen <id>`. Archived tutorials, and finished ones in `done`, come back to the panel; a
  `done` one goes back to `reviewed` and shows as approved.
- **Delete:** `helper.mjs delete <id>`, only after the user confirms in chat with the title repeated ("Delete
  'Reset a password'? It goes to Rostrum's trash and can be brought back."). Never delete without that answer. It
  moves the whole tutorial folder, the recording included, into the trash; nothing is removed.
- **Restore:** `helper.mjs restore <id>` brings the newest deleted copy of a tutorial back to the panel.
- **Trash:** `helper.mjs trash` lists what was deleted (id, when, title), to find the id to restore. Never open or
  read anything inside the trash: its recordings are as private as any other.

The panel's own Rename, Archive and Delete (under More) do the same.

## Set up: Node, Rostrum's parts, the transcriber, the recorder

A computer new to Rostrum is set up from the panel, in this order, one button each. Follow
**`references/setup.md`** whenever the user asks how to get started or how to record, when something of set-up is
missing or failed, and on the two prompts the panel sends ("Rostrum: set up Node for the helper", "Rostrum: set up
the transcriber"). In short:

1. **Node.** The panel's "Rostrum needs Node" block has **Download Node 22** (from nodejs.org, checked, into
   Rostrum's data folder). Only when that cannot work: find a Node 22 or newer and write `ROSTRUM_NODE` into the
   `env` block of `~/.claude/settings.json`.
2. **Rostrum's parts.** The card "Set up Rostrum" has **Download and set up**: the video engine, the recorder's
   files, the browser that renders films, and the transcriber where Rostrum can fetch one. A failed step says so
   and has **Try again**.
3. **The transcriber.** Fetched by that button where it can be; else the Whisper already on the computer is used;
   with none, install one here (the reference says which) and, if the helper cannot find it by itself, write
   `ROSTRUM_WHISPER` the same way.
4. **The recorder.** A Chrome extension the user loads by hand, once: explain it in chat on first use, with the
   real folder, the four clicks in `chrome://extensions` (Developer mode, Load unpacked, the `Recorder` folder,
   Select Folder), pinning it, its icon (a blue speech bubble with an R cut out; a red ring while recording) and
   the panel's "Recorder connected".

Do the work; the user types nothing. Never ask the user to set a variable or run a command. "Restart the Claude
app, then press ... again" is said only after writing to the settings file.

## What to tell the user, and when

Keep every message short. Say what happened, what is theirs to do next, and nothing about the machinery.

- **After understand + script:** the table (each line and what it points at); what was left out of the walkthrough
  and why; **what was genericised and what was left as recorded, by place** ("the sender line and the two field-name
  columns of the email are shown as recorded; the customer named in its first line, the id column and the rest of
  the mail screen are replaced or hidden"), so the user can say "keep that" or "hide that too"; the narration as one
  copyable code block; the question "approve, or what should change?".
- **On approval and after a narration upload:** as the narration hand-off above says, and nothing else.
- **During a build:** nothing until there is something to see, unless a rule had to be added for something that
  looked real (say where, never what) or a new piece of film is being proposed or made (Stage 2).
- **After a build:** the review page link, the film's length, and an honest list of what is still wrong.
- **After fixing notes:** per note, what changed or why not.

Never ask the user to: type a command, start or restart the helper from a terminal, edit `beats.json`,
`rules.json` or `tutorial.json` by hand, find a node id, or read a log. Never ask them to read a real value aloud
or paste one into the chat. Never send them to the local page for the script or the narration: both are handled in
chat (the page is a fallback if an upload from chat fails; the review player is the one page they do open). If
something needs their decision, ask it as a plain question about the film.

## Additional resources

### Reference files

- **`references/understand.md`**: reading the timeline; words and gestures as evidence; naming controls
- **`references/script.md`**: the exact file format the helper parses, how to present the script in chat
- **`references/how-to.md`**: defaults for a how-to video (script shape and voice, camera, cursor, open and close):
  what a how-to gets unless the narration or the user's instructions call for something else
- **`references/narration.md`**: the narration hand-off in chat: the copyable block, the voice, taking and
  uploading the user's audio file, a take that differs
- **`references/scrub.md`**: what is replaced by code and what is left to judgement, what to genericise, the tools
  (`use`, blind rules and columns, `only`, `user`, keeps), fills for an empty account, the sweep
- **`references/build.md`**: the moves library as the beat file exposes it (every field), framing choices, known
  limits, briefing the builder agent, stills, sweep and render
- **`references/house-notes.md`**: notes on what has held across the owner's reviews, and where each came from; not
  a checklist
- **`references/explainer.md`**: the utilitarian register as a taste reference (what it reaches for, what its
  reviews taught); not rules
- **`references/showcase.md`**: the restraint register as a taste reference (framing by cut, the window held
  still, type beside the interface) and the moves that carry it; not rules
- **`references/stages.md`**: the stages (light, dark, a colour field, a room, a supplied picture or clip, a
  brand's own), where each is named, what `tone` decides
- **`references/notes.md`**: review notes
- **`references/brand.md`**: the brand file
- **`references/setup.md`**: a new computer: Node, the one set-up button, the transcriber, loading the recorder
  into Chrome the first time; what to do in chat when a button cannot

### Examples

- **`examples/script.md`**, **`examples/beats.json`**: the first how-to made with Rostrum, as approved: the same
  film as a script and as a beat file. Read them for the two file formats.
