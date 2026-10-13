# Fix the review notes

The user watches the cut on the review page and leaves notes pinned to moments of the film. Each note gets a fix
(or a reason), a reply, and a line in the log. A note is about this film: it is fixed and logged, and does not
become a rule for the next one.

The page has two buttons of its own. "Send notes to Claude" arrives as the same prompt as the panel's ("Rostrum: fix
the review notes for tutorial <id>"): there is nothing else to do for it. "Approve" is the `reviewed` event, raised
by the page itself.

## Read

- `<tutorial folder>/review/NOTES.md`: every note, grouped by video file: its time (`m:ss.ff`), frame number,
  status (`open | done | wontfix`, then the page's words for it), its `id`, the text, and often a
  saved frame (`review/frames/<id>.png`: a frame of the clean film, safe to open). `NOTES.md` is generated: never
  edit it, and never write `.json` files into `review/` (the player owns them).
- A note may carry a `Region`: the part of the frame the user dragged over, meaning "this, here" rather than the
  whole frame. It is given as percentages of the frame from its top-left corner, so on the 1920x1080 film x and
  width are of 1920 and y and height of 1080, at the note's frame. The saved frame has it outlined; after a fix,
  `helper.mjs stills <id> frames <n>` renders that frame again to check the same part of it.
- Work on every note that is `open`, whichever version it was made on: notes belong to the tutorial, and the page
  lists them together by time. A note marked `Stale` was made on an earlier render: check it still applies before
  fixing.
- If the state is `reviewed`, reopen it: `node "<skill dir>/scripts/helper.mjs" event <id> notes`.

## Decide, per note

1. **Where is the fix?** Usually:

   | The note is about | Fix in |
   |---|---|
   | What is in frame, how tight, the order of camera moves | `beats.json`: `frame`, `with`, the first framing of a screen |
   | When the cursor arrives or clicks; what it points at | `beats.json`: `cue`, `target`, `rest` or `move` |
   | Something appearing wrongly, or missing | `beats.json`: `change`, the screen number, the `nodes` entry |
   | A value that should not show, or a stand-in that reads oddly | `rules.json` through the helper (`references/scrub.md`) |
   | The words spoken | The script. This means a new narration take: say so before doing anything (`event <id> revoice`, `event <id> editScript`, edit, approval, the user's new take) |
   | The pace between lines | Nothing to set by hand: the air between lines follows the film's moves. A simpler move shortens it |
   | The logo, colours, voice | The brand (`references/brand.md`) |
   | Something the existing moves do not make | Film code: a new move or scene, as in a build (SKILL.md, Stage 2) |

2. If a note is unclear, ask the user one plain question about the film before changing anything.

## Fix

1. Make the changes to `beats.json` (and rules, through the helper) for all open notes together; new film code,
   where a note needs it, is written here in the main session.
2. Dispatch `rostrum-stager` with the brief form in `references/build.md`, adding the notes being fixed (text, frame
   number, the change made for each) and asking for stills at each note's frame as well.
3. Check each note's moment on stills (`helper.mjs stills <id> frames <n>,<n>,...`), and what follows it: a
   change in one beat moves the camera in the beats after it. Stills cost seconds and a render costs minutes, and
   the helper renders a film whole, so notes are best settled on stills before one render for the round. At most 3 passes, as in a build.
4. `helper.mjs run <id> sweep`, `helper.mjs run <id> render`.

## Reply and log

For each note:

- Reply on the note itself, so it shows on the review page:
  `node "<skill dir>/scripts/helper.mjs" reply <id> <noteId> done <one or two sentences>` for a note that was fixed,
  `... reply <id> <noteId> wontfix <one line>` for one that needs no change (or `open` with a question). Say what
  changed in the film, in film terms ("The camera now holds the whole form before it goes to the button"), not
  which field was edited.
- The page shows a note's status in its own words: `open` is "To fix"; `done` is "Fixed in v<n>" (the reply command
  adds the version: the latest render, so reply after the render); `wontfix` is "No change needed", which is also
  the answer to praise or a remark that asks for nothing ("Good"): reply `wontfix` with a one-line answer.
  The user can set any note back to "To fix" on the page; it is then `open` again and due a new answer.
  `review/NOTES.md` keeps the raw status words.
- Append an entry to `<tutorial folder>/review/FIXES.md` (create it with the heading `# Notes and fixes` if it is
  not there). One entry per note:

  ```markdown
  ## <date> · <video file> · <m:ss.ff> · note <id>
  - Note: <the user's words, as written>
  - Cause: <why the film came out that way>
  - Fix: <what was changed, by file and field; or why not>
  ```

Then tell the user in chat: per note, one line on what changed or why not; the new render's name; that the review
page shows it. When the user says the film is right in chat, `helper.mjs event <id> reviewed` (Approve on the page
does the same, so check the state first); **Done** in the panel closes it.
