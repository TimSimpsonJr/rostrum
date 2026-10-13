# Understand: what the walkthrough is about

This stage reads the recording for what its author meant: what they wanted the viewer to do, notice or understand,
moment by moment, and which elements of the screen each moment is about (a **target**: a screen number and a node
id). What kind of video that makes is read from the same place, the author's words and the user's instructions, and
the script and the film are written from it. The steps below are how the evidence is read; a how-to usually comes
out as a list of steps with one target each, and other formats cut it their own way.

## What there is to read

| Source | What it is | How to read it |
|---|---|---|
| `transcript/mic.json` | The author's speech, word by word with times | Through `timeline.mjs` (main session only) |
| `film/clean/manifest.json` | Screens (snapshots, each with a time) and clicks (time, node id, screen) | Through `timeline.mjs` |
| `film/clean/gestures.json` | What the pointer did: circles, rests, sweeps, each with a strength and what it encloses | Through `timeline.mjs` |
| The clean screens | Every element's tag, role and text: secrets, account numbers and amounts already replaced, everything else as recorded | `helper.mjs elements`, `around.mjs` |

Never read `recording/`. The clean copy is the only picture of the screens there is. It holds names, addresses and
table contents as recorded: what else is replaced is decided in this stage (`references/scrub.md`, "What to
genericise"). On a mail, chat or document page the app's interface stays, and other people's messages (senders,
subjects, snippets, attachments), user-made folder and tag names and people's names and pictures are genericised
with labelled stand-ins (`blindAll`); `only` is for when the user asks to hide a page wholesale.

## Step 1: put everything on one clock

```
node --experimental-strip-types "<skill dir>/scripts/timeline.mjs" "<tutorial folder>"
```

It prints one line per event in seconds from the first recorded event: `SCREEN`, `SAID`, `CLICK`, `CIRCLE`, `REST`,
`SWEEP`. Speech times are already moved onto that clock (a transcript word at `w` seconds was said at
`w + micStartsAt`; the script adds it). Each `CLICK` line names the control clicked (the nearest button, link or
field around the clicked node, with its node id and its clean text) and proposes what the click did: `the page
changes: screen N`, or `opens node N` (a menu, a dialog), or nothing.

Read the whole timeline once before deciding anything.

## Step 2: cut it into steps

A step is one thing the viewer is told to do or look at. Usually a step is a stretch of speech plus the click that
ends it, or a stretch of speech about something on the screen with no click at all.

- What is not part of what the author meant usually goes: a stray click on nothing, a false start, the author
  finding their place, thinking aloud. Note each thing left out; the user is told.
- Keep the author's order.
- Several quick clicks on the same field one after another are one action (a double or triple click selects its
  value); the timeline says so.

## Step 3: choose each step's target from the words and the pointer together

The pointer is **evidence, never choreography**. It is read together with what is being said at that moment;
neither decides alone, and the recorded movement is never reproduced in the film.

**Circles first.** Looping the pointer around something is the author's main way of pointing. A circle's `encloses`
lists the elements inside the loop (not merely the one under the pointer). Then the weaker signals: a `rest` (the
pointer staying on something), a `sweep` (a pass across something; always weak).

| What the evidence is | What it means |
|---|---|
| The words name a control **and** a circle (or a strong rest) is on it at that moment | That control is the target |
| The words name a control and there is no gesture on it | Still that control: words alone are enough |
| A gesture with nothing said about what it is on | Weak. Not a step by itself. At most it breaks a tie between two readings of the words |

And a click is its own evidence: what was clicked is the target of the step that clicks, whatever the pointer did
before.

Things that go wrong, and what to do:

- **A rest just before a menu or a dialog opens can name the wrong element.** Enclosure reads each screen as it was
  captured, not as it was at the gesture's moment, so a pointer resting on a menu item that had just opened is
  reported as resting on whatever lies beneath it. Known gap: when a rest is followed within a second or two by a
  click, trust the click.
- **A loose circle can take in a neighbour.** When a circle encloses more than the words account for, choose by the
  words, and list the target in the script so the user can catch a wrong guess.
- **A circle round labels means the fields they label.** The cursor's `rest` lands to the right of its target, so
  for a labelled field the target is the field (`role` `field`), not the label text. Find it with `around.mjs` on
  the label's node: the field is beside it under the same parent.
- **A group can be pointed at by its first and its last member.** "Your name, email and username" over four fields
  can be one step with two targets (the cursor's `rest` on one, `move` to the other).
- **Gestures before the first click of a long silent stretch** are usually the author getting ready. Ignore them.
- **Nothing in `encloses`** means the gesture was over something with no name (an icon, blank space) or the screen
  was not measured. Use the gesture's `box` as a region: `helper.mjs elements <id> <screen> <x> <y> <w> <h>`.

## Step 4: read each control's name from the clean screen

`elements` returns each control's text as the interface shows it, capitals included (the author may have called it
something else aloud).

```
node "<skill dir>/scripts/helper.mjs" elements <id> <screen> --find "view"
node "<skill dir>/scripts/helper.mjs" elements <id> <screen> 2100 0 460 300
node --experimental-strip-types "<skill dir>/scripts/around.mjs" "<tutorial folder>" <screen> <node>
```

- `elements` lists `node, tag, role, text` (40 characters at most; `role` is `button | link | field | heading |
  cell | text`). With a region it lists only what lies inside it; regions work on screens that had a click or a
  gesture. An answer is cut at 500 elements: ask with a region or `--find`.
- **A name is interface text, never data.** The text of a field, a table cell, or a button that shows the signed-in
  person's name is data (as recorded, or a stand-in). Never name a control by it. A user menu whose button shows
  a person's name is "your user menu", and a field is named by its label.
- **A control with no text** (an icon button): work out what it is from the author's words and from what its click
  opens.
- **Node ids belong to one page.** They stay the same across the snapshots of one page and change when the page
  changes. Check a node in the screen the film will show it in (next section).

## Step 5: choose the screen each moment is shown in

A page is captured several times (at every click, and every few seconds). In the beat file a different screen
number is a cut, so beats that stay on one page share one snapshot.

- The useful one is usually the **latest snapshot of that page that holds everything shown on it**: the opened
  menu, the opened dialog. An `opens` change hides what opened until the click that opens it.
- What a click opens appears in the snapshot captured **after** the click. The timeline's proposal names that screen.
- When the proposal says `the panel inside node N`, the first node is the panel the viewer sees and the second is a
  wrapper as large as the window. The panel is the one the film frames.
- Elements behind an open dialog read as "covered" in that snapshot's sizes. Their node ids are still valid there;
  to see their sizes, ask `around.mjs` about an earlier snapshot of the same page.

## What comes out

A table to work from (it becomes the script's "Picture" column and the beat file's `nodes`):

| Step | Said (in the author's words, shortened) | Target | Screen, node | Action | What it causes |
|---|---|---|---|---|---|
| 2 | open the menu up here, go to Profile | the user menu; then "Profile" | 2, 181; 2, 195 | click; click | opens node 191; the page changes |

Plus the list of what was left out, anything uncertain (two readings of a gesture, a control with no name), and
**what the author called out**: every address, name, value or column they say aloud or point at as part of the
tutorial. Those are its subject and stay as recorded; the rest of their kind is genericised
(`references/scrub.md`, "What to genericise").
