# Build: the moves library, the beat file, stills, sweep and render

**Who this page speaks to.** Two readers stage a film from it, and it binds them differently:

- **The builder agent (`rostrum-stager`).** For the builder a film is a description, not code. The only file
  written per film is `<tutorial folder>/film/beats.json`; the template in the plugin turns it into the film. The
  builder never edits the template (anything under the plugin's `film/` or `tools/`) to make one film work: if the
  template cannot do something, it reports that as a limit. The beat-file mechanics and the staging discipline
  below are the builder's bounds.
- **The main session.** It writes the beat file in the same vocabulary and draws on the library of moves heavily,
  and it is also the one that may change the template and write new moves, one-off scenes and stages when a film
  needs a picture the library does not make (SKILL.md, Stage 2: "A build never stops..."). The plugin folder is
  two levels above the skill folder; `tools/` commands and `npm run moves` run from there.

`examples/beats.json` beside `examples/script.md` is one how-to, both ways.

## Order of work

1. Stand-in rules and fills, if any (`references/scrub.md`).
2. `helper.mjs progress <id> shotlist` (the panel's bar starts), then write `film/beats.json` (below). The phases, in
   order: `making` (only while new film pieces are being made in the chat before staging, with a `--note`),
   `shotlist`, `measure`, `staging`, `checking`, `sweep`, `render`.
3. The brand. Which one a film gets: the tutorial's own `brand` when it has one (picked in the panel, or set here
   earlier: keep it, do not ask again); else the only brand when `get tutorials` lists exactly one; else none.
   With more than one brand listed and the tutorial's `brand` null, ask in chat before anything is staged: name
   the brands and `none` (a text-only end card), unless the user already answered for this tutorial at the
   narration hand-off. Then `node "<skill dir>/scripts/helper.mjs" brand <id> <name>` for a brand named, or
   `helper.mjs brand <id>` with nothing to set: it copies the tutorial's brand into the film (or, with none, sets a
   text-only end card). The site a tutorial was recorded on never picks a brand.
4. Dispatch `rostrum-stager` (brief below). It measures, renders stills, checks, fixes what is plainly a beat-file
   slip, and reports.
5. Check the frames yourself (`references/how-to.md` for a how-to's defaults; `references/explainer.md` and
   `references/showcase.md` for the register the film is in; `references/house-notes.md`). Fix and re-dispatch: at
   most 3 passes in all.
6. `helper.mjs run <id> sweep`, then `helper.mjs run <id> render`.
7. Open the review page and report.

The panel shows where the build is. The stager reports its own phases; the render writes its own progress and
clears it when the film is built. If the build stops before the render (a sweep that cannot be cleared), run
`helper.mjs progress <id> clear` so the panel stops showing the bar, then say what happened.

## The beat file

```json
{ "version": 1, "title": "<the script's title>", "viewport": { "width": 2560, "height": 1351 },
  "nodes": { "<name>": [<screen>, <node id>], ... },
  "beats": [ { "line": 0, "screen": 2, "frame": { "whole": true }, "cursor": "enter" }, ... ],
  "chalk": [] }
```

| Field | What it is |
|---|---|
| `version` | `1` |
| `title` | The title card's text, and the end card's when there is no brand |
| `viewport` | The recorded window's size: copy it from `film/clean/manifest.json` (`viewport`). Never invent it |
| `nodes` | Every element the film points at, frames or stages, under a short name of your choosing: `[screen, node id]`. Each is measured in that screen. A name used anywhere below must be here |
| `beats` | In film order (below) |
| `chalk` | `[]`. Nothing reads it yet |
| `stage` | Optional: the film's stage (a scene may name its own; a shot has the film's). `"light"` or `"dark"`, or a named stage: `{ "move": "field" \| "environment" \| "image" \| "footage", "tone": "light" \| "dark", ...its inputs }` (`references/stages.md`). Without it: the brand's own stage when its `brand.json` has one, else light |
| `open` | Optional: `{ "move": "title-makes-room" }` (the first screen is there from the first frame and slides aside while the title fades in beside it, then returns) or `{ "move": "cut-to-screen" }` (no title: the first screen already placed). Without it the film opens on the title alone |
| `end` | Optional: `{ "move": "logo-lift", "from": "<name>" }`: the camera pushes toward that element (the site's own logo on the last shot's screen) and the brand's mark sets out of it (`references/moves.md`, logo-lift); or `{ "move": "end-glyph", "glyph": "<name>" }`: a hard cut to that element of the last screen alone on the stage, its parts parting and coming back, the mark coming up out of it (end-glyph). Without it the film ends the plain way |

One beat:

| Field | Values | Meaning |
|---|---|---|
| `line` | a number | Which narration line this beat plays under: the script's `#` (0 is the first spoken line). Give every line one beat, in order |
| `screen` | a screen number | The snapshot shown. Optional after the first beat: a beat without it stays on the screen before. **A different number is a cut to a new shot** |
| `window` | a name, or a list of names | Only on the first beat of a shot: the shot shows those elements of the screen alone, as the window on the stage (below, "Some elements as the window") |
| `bare` | `true` | Only beside `window`: the elements stand on the stage with no window frame and no shadow, until a `frame-back` change brings them (or for the whole shot) |
| `frame` | `{ "whole": true }`, `{ "target": "<name>", "with": "self" \| "row" \| "group" \| "corner" }` or `{ "targets": ["<name>", "<name>", ...] }`; any of them with `"back": true`, `"settle": false`, `"side": "left" \| "right"`, `"cut": true` and/or `"hold": true` | Where the camera is by this beat. Optional: without it the camera stays where it was (a shot's first beat without one is `whole`). On a beat with a `cue` and no cursor of its own, the camera has arrived by that word |
| `cursor` | `enter`, `click`, `rest`, `move`, `drag` (with `to`, `release`), `leave` | What the cursor does (below). Optional: a beat can be camera only |
| `target` | a name | What the cursor goes to. Needed for `click`, `rest`, `move` |
| `cue` | a word, or `{ "word": "...", "nth": 1 }` | The word of this beat's line at which the cursor arrives or clicks. Without it: the line's start |
| `change` | `{ "kind": "opens", "node": "<name>", "after": "<name>" }`, `{ "kind": "close", "node": "<name>" }`, `{ "kind": "hover", "node": "<name>", "after": "<name>" }`, `{ "kind": "page" }`, `{ "kind": "frame-back" }`, `{ "kind": "selects", "node": "<name>" }`, `{ "kind": "scrolls", "to": "bottom" \| "top" \| "<name>" }`, `{ "kind": "fills", "node": "<name>", "typed": true, "text": "...", "to": <cue> }`, `{ "kind": "becomes", "screen": <n>, "after": "<name>", "grows": ["<name>", "<name>"] }`; `selects` also takes `"to": <cue>` | What the screen does (below) |
| `then` | a list of `{ cursor, target, cue, change }` | Further cursor actions inside the same line, in order. An entry may be a `change` alone (with a `cue`, or none) |
| `bar` | `{ "title", "host", "bookmarks": [{ "label", "icon" }], "hero", "from": <cue>, "arrives": "down" \| "right" \| "appear" }` | A browser bar grows out of the window's top under this beat's line and goes back in after it (below, "The browser bar") |
| `sequence` | `{ "from": <screen>, "watch": <screen>, "then": [<screen>, ...], "follow": "<name>" }` | The page works by itself: its captures play in place under the shot's camera (below, "A sequence") |
| `list` | `{ "from": <cue>, "items": [ { "text": "...", "icon": "<icon name>", "cue": <cue> }, ... ] }` | A narrated list: while the line enumerates things, the screen recedes behind a blur and the items appear as large type, each with an icon, on the word that names it (below) |
| `moves` | `[{ "move": "<name>", "at": <cue>, "until": <cue>, ...inputs }]` | A library move or a one-off on this beat, from the word `at` (else the line's start) to the word `until` (else the line's end, or as long as the move takes). The names, their inputs and an example of each: `references/moves.md` |
| `cut` | `{ "move": "<name>", "until": <cue>, ...inputs }` | Only on the first beat of a new shot: the way into it, a cut move from the catalogue. The shot before stays up for the cut's length (its own, or with `until` up to that word of the line). On the film's first beat it is the way into the first shot from the title (a one-off `Cut.tsx` that draws an opening and hands over to the window): it starts when the window would have come, the window is not drawn until the move draws it, and the shot's camera and cursor are as they are without it |
| `scene` | `{ "stage": "light" \| "dark" \| a named stage }` (or `{}`) | A beat with no screen: a scene of this beat's `moves` on the stage. The cursor is not on it (it leaves before, and comes on again after). The next beat names a `screen` |

### The cursor

- `enter`: on the first beat only. The cursor comes on from off the frame's bottom right with the camera's first
  move, or, under a long first line, about two seconds after the window has settled: it then rests low and right in
  the window, off what is being read, until its first action. It stays until a scene or the end.
- `click`: the cursor travels to the control, lands on a blank part of it at the cue, presses; the control answers
  with the page's own hover and press look. The blank part is the one nearest the control's label: just past the
  label's end (a wide row with its label at the left is clicked beside the label, not in its empty middle).
- `rest`: the cursor arrives **beside** the target (to its right, clear of its text) on the cue and stays there.
  For pointing at something that is not clicked: a field, a value, a heading. Where a neighbour stands beside the
  target (the next field of a row), it rests on the target's own blank part instead.
- After a cut the cursor never waits on a word: it steps to the nearest clear spot, and when its next action is more
  than about a second away it drifts toward it at once. Nothing in the beat file sets this.
- `move`: the cursor does not stop where it was: it leaves at once and glides to beside the target, arriving on the
  cue. For running along a group: `rest` on the first member, then `move` to the last (in `then`). Not for a new,
  separate thing: that is another `rest`.
- `drag`: with `"to": "<name>"` and `"release": <cue>`. The cursor arrives on `target` at the `cue`, presses and
  holds, and carries it (the element alone rides with the pointer; its place on the page is empty meanwhile) to
  where `to` stands, letting go on the word `release`. A `becomes` on the same beat brings the page as it is after
  the drop 0.3 s later; without one the thing is back where it was. Frame both the thing and where it goes.
- `leave`: on the last beat (the closing line) only, with no target. The cursor goes as the end card comes.
- Cues inside one line must be in the order the words are spoken, and far enough apart for the cursor to travel
  (about a quarter of a second at the very least; a note names a move that has too few frames).

### The cue word

- The word is matched against the words of the narration as timed, lower case, punctuation dropped (apostrophes
  kept: `you'll`). Read `film/narration/timing.json` (`sentences[<line>].words[].w`) and choose a word that is
  there. A word that is not in the line stops the build with `line N has no "<word>"`.
- Choose the word at which the action should land: for a click, the control's name as spoken ("select View API
  Key": `view` or `api`); for a `rest`, the word naming the thing ("your name": `name`).
- If the word occurs more than once in the line, `{ "word": "key", "nth": 1 }` picks the second (counted from 0).

### Changes

- `opens`: `node` (a menu, a dialog) is hidden until the click on `after`, then opens: uncovered from its top edge
  when it hangs directly under what was clicked, otherwise set in place whole (it grows a little into place; it is
  never shown in part). The framing the click is seen in is widened by the template, when it needs to be, so that
  what opens is whole in the frame from its first frame. Put it on the action that clicks, or on
  the beat that frames what opened; its time comes from the click on `after` either way. `node` is the panel the
  viewer sees, not a wrapper as large as the window (`references/understand.md`, step 5). `after` must be the
  target of a `click` in the film.
- `close`: `node` (a menu, a dialog) goes the way it came: covered back to its top edge, or shrinking a little as
  its backdrop dims out, and it is hidden 0.3 s later. It starts on the beat's `cue` word (the click on its Done
  button, say), without one with the line, and stays shut until its next `opens` on the shot. `node` is what an
  `opens` showed, or something the capture shows open.
- `hover`: `node` (a tip, a small menu) is there only while the pointer is over `after`. Give the cursor a `rest` or
  a `move` to `after` on the same shot: it rests on the control (not beside it), the control takes the page's own
  hover look, and `node` is uncovered from its top edge as the cursor arrives; when the cursor moves on, it goes
  the way it came. The capture must hold `node` as it showed under the pointer: it shows a hover the recording
  contains.
- `page`: this beat's screen replaces the one before. Write it on the first beat of each new screen. When the last
  action of the beat before is the click that causes it, the cut comes 0.3 s after that click if the click's line is
  all but said by then (less than about 0.6 s of it left); if the click comes early in its line, the shot holds
  until the line has been said and the cut comes 0.25 s before the next line (so cue a click on the word that names
  the control, wherever in the line that is: there is no need to move a cue late to hold the shot). With no such
  click the cut comes 0.3 s before the line. The new page's parts set in place and the camera is already moving.
- `frame-back`: on a shot whose first beat has `window` and `"bare": true`, the window's frame and shadow fade in
  round the elements over 10 frames, on the beat's `cue` word (without one, with the line). Nothing moves.
- `selects`: the value of `node` (a field) shows as selected from the click on it. For "select it, copy it".
  With `"to": <cue>` the node is a block (a table, a list) selected by dragging: from the beat's `cue` word to the
  word `to`, each row is selected as the cursor's tip comes down to it, so give the cursor a `move` to the block's
  last cell that arrives on the same word. It follows a `scrolls` running at the same time.
- `fills`: the field `node` is empty until its moment, then holds its value. On the beat that clicks the field the
  moment is the click; otherwise the beat's `cue` word, or the line's start. Without `typed` the value arrives whole
  (a paste); with it, letter by letter until the cue `to` (about a second without one). The value is what the clean
  copy holds in the field, or `text`: words the film draws instead (a list of strings is one line each). `text` is
  authored: a stand-in or a made-up value, never one seen in the recording; the sweep reads it. A `fills` holds for
  its own shot.
- `becomes`: the shot's screen becomes a later capture of the same page, in place, under the same camera: 0.3 s
  after the click on `after`; without `after`, 0.3 s after the cue word, or with the line. Use it where the page
  changes without leaving (a tab switched, a list filtered, a panel that has worked something out) so the shot is
  not cut. The beats that follow stay on the shot's first screen number (a new number is a cut); nodes of the new
  capture are named in `nodes` with its number. `grows`: two names of one element, on the capture before and on
  the new one, when its box changes with the swap: it is carried from the one box to the other and uncovered as it
  goes, so nothing jumps. `"wait": true`: the page took its time to answer (a save): the capture comes as long after
  the click as the recording took from the capture before it (the manifest's times), 2 s at most, and when it is the
  last thing before the closing line that line gets as much more air (run the `time` stage again). An `opens` of something that is only in the new capture opens as the capture comes.
- `scrolls`: the content of the shot's window moves up in one eased move: to its `bottom`, back to its `top`, or
  until a named element is near the window's top. It starts on the beat's `cue` word (without one, with the line)
  and has landed before the line ends; the camera holds while it runs, so do not put a new target framing on or
  after it in the same shot (a note). The cursor rides with the content: whatever it reaches during or after the
  scroll must be in the window by then (a note names it otherwise). To scroll from one word and have the cursor
  arrive on a later one, put the scroll on a beat with a `cue` and no cursor, and the cursor in its `then`.
  A whole screen (no `window`) scrolls its own page inside its window on the stage, to a named element (`top` too;
  `bottom` only when the screen's elements are measured in `clean/layout.json`). There a framing on the scroll's
  beat, or after it, frames things where the scroll leaves them, so the camera may go to a target once the page
  has moved; something fixed to the window (a sticky header) is best framed before the scroll.

### A narrated list

For a line that counts things off ("you need three things: your A, your B and your C"). From a word of the line the
recorded screen eases into a blur under a light wash; each item then sets as a row of large type after its icon, on
the word that names it; earlier items stay; when the line has been said they clear together and the screen comes
back sharp. Only then does the camera move on or the cursor come.

```json
{ "line": 0, "screen": 2, "frame": { "whole": true }, "cursor": "enter",
  "list": { "from": { "word": "your", "nth": 0 }, "items": [
    { "text": "Your sign-in name", "icon": "user-round", "cue": "name" },
    { "text": "Your access key", "icon": "key-round", "cue": "key" } ] } }
```

- **`text` is authored, never read from the screen.** Take it from the script's own words for that item, with a
  capital ("your TIN" in the line: `"Your TIN"`). It names a kind of thing. **It never holds a value**: no key, no
  number, no name of a person or a company, nothing seen in the recording. The sweep reads every item's text like
  anything shown and fails on an original.
- **`cue`**: the word of this beat's line that names the item (the same form as a cursor's cue: a word, or
  `{ "word", "nth" }`). The item is fully there on that word. Items are listed in the order they are spoken, and
  their words are at least a quarter of a second apart.
- **`from`** (optional): the word at which the screen starts to recede. Without it: the first item's word. Either
  way the template starts the blur early enough for the screen to be unreadable when the first item shows, so
  `from` can only make it earlier. To have the screen going as an item's lead-in is said ("... your TIN"), name
  that lead-in word (`{ "word": "your", "nth": 0 }`).
- **`icon`**: a name from the bundled line-icon set (Lucide; brand-neutral; nothing is fetched). List names with
  `node "<skill dir>/scripts/helper.mjs" icons <a word>` (it searches names, then meanings: `icons key`,
  `icons building`). Choose icons that read as one family and can be told apart at a glance: one plain subject
  each, no two near-identical. A name the set does not have stops the build and says so.
- Two to five items of two to four words each. The type's size follows the longest item; long items make a small
  list.
- **Where it can go:** on a line before the cursor's first action (usually the first line, over the whole screen).
  The cursor is never on screen with a list: on the film's first line it enters once the list has cleared. A list
  after the cursor has come on is a note (the cursor would sit on it).
- **The line after a list** gets about 0.7 s more air (the list clearing), and its camera move starts only on a
  sharp screen and keeps its own length: it may be on the last of its way in as the cursor acts. Cue that line's
  first action on the word that names the control, not on its first words.
- There is nothing else to set: no size, colour, position or timing. The icons take the brand's accent (the kit's
  when there is no brand); the type is the title card's. No sound plays with a list.

### Screens and shots

- All the beats on one page use the **same** screen number: the latest snapshot of that page that holds everything
  those beats need (`references/understand.md`, step 5). Changing the number mid-page cuts for no reason and loses
  the camera's continuity.
- Returning to a page seen earlier is a new shot: a cut, opening on its widest framing again.
- Screens recorded at different window sizes (two sites, two zoom levels) need nothing from the beat file: each
  screen is rebuilt and measured at its own size (`film/clean/manifest.json`, `screens[].viewport`), and every whole
  framing shows its window at the same width on the stage.

### Some elements as the window

For a page full of other people's things where one panel is the subject (a single message in a mail application):
put `"window": "<name>"` on the first beat of the shot, a name in `nodes`, or a list of names when the subject is
two elements with other things between them in the page's tree (a message and its subject heading, without the
toolbar that sits beside the heading). The film shows only those elements and what is inside them, where the page
put them; the rest of the page is not there.

- The elements are laid out at their full size: whatever clipped or scrolled them in the recording does not (their
  scroll containers are opened, the scroll is back at the top). All of that screen's boxes are measured in this
  layout, so use one screen number for the whole windowed shot, and do not show the same screen number as a full
  page elsewhere in the film (use another snapshot of the page for that).
- The window is as wide as the elements together and stands at the film's window width; when their content is taller
  than a window can stand, the window shows its top and the rest is reached by `scrolls` (Changes, above), as the
  user did it. Keep the camera on `{ "whole": true }` in such a shot.
- The window takes the page's own colour behind the elements (a dark page gives a dark window).
- Targets, cursor spots, `opens` and `selects` inside it work as on a full page, in the same measured px. A `rest`
  beside something as wide as the window lands on the window's edge: point at a cell or a row's label instead.
- A later shot without `window` is the full page again. `window` on any beat but a shot's first is an error.
- After writing or changing a `window`, measure again (`measure`), and run the gestures step again so the screen's
  element boxes (`film/clean/layout.json`) are in the same layout.
- Look at a still of the shot's first frame and of the scroll's end before going on: the elements alone, nothing of
  the page around them.

### Framing: choices, never numbers

The template works out every camera position from measured boxes. The beat file only says what to hold in frame.
There are no pixel values, zoom factors or timings to set, and none may be added.

- **`{ "whole": true }`** is the whole screen. A how-to opens on it (`references/how-to.md`).
- **A screen's widest useful framing** is often the panel that holds everything the beats on that screen show.
  Find it with `around.mjs` on one of those targets: the outermost element in the chain that still holds all of
  them and is under 60 percent of the window's width. Name it in `nodes` and frame it (`{ "target": "card" }`).
- **Within a shot a framing is never looser than the one before it,** unless it says `"back": true`: then the
  camera pulls back to it, as wide as it asks (the pull-back takes longer the further out it goes, and shows as a
  `scale decreases` note). Without `back`, a framing that asks
  for more than the camera already shows stays at the scale it has, centred on what was asked for.
- **A long way across the page is a pan:** a move between two framings far apart takes about a second for every
  1300 px it travels on the frame, when the words leave it the time.
- **`"settle": false`** leaves a framing exactly as asked (see "The frame's edge falls between elements").
- **`"cut": true`** on a framing after a shot's first: the camera cuts to it instead of travelling, a tenth of a
  second before the beat's cue or action. It is as wide or as tight as it asks (from the whole screen to a crop, or
  back), and nothing before it is held looser for it.
- **`"side": "left"` or `"right"`**: what is framed stands to that side of the stage, at half the frame's width at
  most, and the other side is free for type (`label-beside`, `feature-list` in `references/moves.md`). After a
  framing in the middle it is smaller, so the camera pulls back to it (or cuts, with `cut`).
- **`"hold": true`** on a shot's first framing: the window does not move for the shot. No drift, no settling in
  after the cut, and the new page is there whole (nothing sets in). With a `becomes` under it the change happens in
  place; with a `page` change and `hold` on both shots the content swaps in a window that stays where it is.
- **`with`:**
  - `self` (the default): the target alone. A control narrower than 12 percent of the window is framed with its row
    anyway; a target wider than a quarter of the window is treated as a group.
  - `row`: the target with the band it sits in (a form row, a table row, a toolbar). The usual choice for a button
    or a field.
  - `group`: the target with its nearest group (a form, a card section). For "these fields here".
  - `corner`: the quarter of the window the target sits in, running a little past the window's edges. For a control
    in a corner whose menu drops beside it (a user menu, a settings menu): it keeps the control and what opens in
    one frame.
- **`targets`: two or more things held in one frame.** `{ "targets": ["tabs", "panel"] }` frames the union of the
  named nodes' boxes, like a group (the same air, the same limits on how much of the frame it takes, and never
  looser than the framing before it on the screen). Use it when a beat is about one thing but the viewer needs the
  thing beside it to know where they are: a list of tabs with the panel it switches, a control with the field it
  fills. Every name must be in `nodes`, in this beat's screen. Without it a framing of one panel can slice its
  neighbour at the frame's edge.
- **The frame's edge falls between elements.** When the screen was measured (`film/clean/layout.json` has it), the
  template nudges each framing so its edge does not slice a control or a label: it shifts first, and widens a
  little when no shift does it. The shift is at most 13 percent of the frame, so what is framed stays about its
  middle. The whole screen and a `corner` are left as they are. A grid of fields of unequal widths has no clean
  gap: there the edge cuts as few as it can.
- **What a click opens is whole in the frame the click is seen in.** The template widens that framing to hold what
  opens; give the next beat `{ "target": "<what opened>" }` to go in on it. What opens wider than 60 percent of the
  window (a band across the page) is not held: the frame shows the part of it that is in view.
- A beat about something that just opened frames it by name: `{ "target": "dialog" }`.
- Leave `frame` off a beat to stay put (two lines about the same thing).

### The browser bar

For a step taken in the browser's own frame, which no recording holds (a bookmarklet pressed in the bookmarks bar).
The move is `film/src/moves/browser-bar/` (its `about` says what it takes).

```json
{ "line": 6, "cue": "webhook", "frame": { "whole": true, "back": true },
  "bar": { "title": "Companies", "host": "app.example.com", "from": "webhook", "hero": "Autofill",
           "bookmarks": [ { "label": "Inbox", "icon": "inbox" }, { "label": "Autofill", "icon": "bookmark" } ] },
  "then": [ { "cursor": "click", "target": "bar:hero", "cue": "bookmarklet",
              "change": { "kind": "opens", "node": "panel", "after": "bar:hero" } } ] }
```

- The bar grows out of the window's top edge, bookmarks row first; the window is taller by as much as is out, and
  grows about its middle. It is whole 0.3 s before the click on its hero. Once its line has been said it goes back
  in the same way. `from` is the word it starts on; without it, as late as leaves it whole in time.
- The hero bookmark is the cursor target `bar:hero`. It is measured with the nodes (it is in `clean/boxes.json`
  after `measure`) and is never in `nodes`. The page's own boxes do not move while the bar is out.
- What the click on `bar:hero` opens slides down to its place from under the bar; `"arrives": "right"` in the bar slides it in a short way from the window's right edge instead, its opacity coming up (for a panel pinned low or to the right: settled 0.34 s after the press), and `"arrives": "appear"` sets it in place whole (`"down"` is the default).
- `"leaves": "with-camera"` in the bar: it does not go back in. The shot's next framing starts as soon as what the hero opened has arrived, and its push carries the bar out of the frame's top (so that framing must leave the window's top out of the frame; a note says so otherwise). The cursor stays on the bookmark and comes back from above.
- `title`, `host` and the labels are authored: generic words and a made-up address, never the recorded site's.
  The sweep reads them. Icons are names from `helper.mjs icons`.
- The bar is as wide as the window: frame the whole window under it (the example's `"back": true` travels there
  from a tighter framing). One bar to a film.

### A sequence

For a stretch where the page works by itself (a script filling a form, an import running).

```json
{ "line": 12, "frame": { "targets": ["url", "fieldsBox", "addDialog"], "back": true },
  "sequence": { "from": 29, "watch": 35, "then": [40, 45, 50, 55], "follow": "fieldsBox" } }
```

- From the line's start (or the beat's `cue`) the shot's screen becomes capture `from`, then each capture through
  `watch` at the pace it was recorded at (`film/clean/manifest.json`, `screens[].t`), so one cycle is seen as it
  happened. The captures of `then` follow evenly over what is left of the line, each up for at least 7 frames, the
  last 0.35 s before the line ends. A note says so when there is no room (`the watched screens run to ...`).
- Choose `watch` as the last capture of the first cycle and `then` as the captures where the page is at rest with
  one more thing done. The camera holds one framing for all of it: frame what every capture needs (the example
  pulls back to it with `"back": true`).
- `follow`: a scroll box the page adds to. It is kept scrolled to its end, so what was added last is in view.
- It does not start a shot: the beats after it carry on, on the last capture.
- No cursor acts in a sequence. It stays where its last action left it, which may be out of frame.

### What the library does not make yet

Facts about the moves as they stand, so nobody looks for a field that is not there. None stops a build: a film
that needs one gets it made by the main session (SKILL.md, Stage 2), and the line comes out of this list.

- Every cursor action lands on a word of its own line, or the line's start.
- Chalk marks are not drawn.
- No right-click. A keyboard shortcut is shown as `keycaps`; the page's response must be in the recording.

Whenever a beat is simplified for one of these reasons, say so: in the script's "Left out" line if it is known at
script time, and in the message after the build.

### One-offs: a move for this film only

A film that needs a picture the library does not make gets a move of its own in `<tutorial>/film/moves/<name>/`:
`move.ts` (its `about`, and `check`, `text`, `takes` as the library's: `film/src/moves/contract.ts`) and `Move.tsx`,
`Cut.tsx` or `Stage.tsx`. It is named in the beat file like any library move. The catalogue lists the library only:
a one-off is described by its own `about`, and syncing it writes nothing in the plugin but the gitignored
`film/src/oneoffs/`. A one-off is film code like any other, written in this session and trusted as such.
Before it is bundled its source is scanned (`tools/one-offs.mjs`) to catch accidents, not to contain it: one that
reads a file, the network, time or state would put unscrubbed data, or frames that differ from run to run, into a
film, so it is refused; so is an import from anywhere but its own folder, the kit, the contract, react and remotion.
Its `about` is read from the text of `move.ts` without running the file, so it is written as a plain literal; the
authored strings it shows are the inputs its `about.text` lists (`text`, `items[].text`): the sweep reads those. An
input it lists in `about.cues` (a cue word, or a list of them) reaches the move as film seconds. Its
`check` and `takes` run in the film only. To look at it alone, on the fixture
screens: `node --experimental-strip-types tools/move-still.mjs <name> --tutorial <tutorial folder>`.
Promotion is a copy of the folder into `film/src/moves/` and `npm run moves`.

### What the film code reports

- **The build stops** (the stills stage fails; the message is in `<dir>/out/log/stills.txt`):
  `names "<x>", which has no measured box` (a name missing from `nodes`, or measure not run since it was added);
  `line N has no "<word>"` (a cue that is not in the line); `line N is not in the timing` (more lines in the beat
  file than in the narration); `the first beat names no screen`; `not found in their screens: <names>` from measure
  (a node id that is not in that screen: ids change between pages);
  `line N's list names the icon "<x>", which is not in the icon set` (`helper.mjs icons <a word>` lists the names);
  `line N's list has no items` / `has an item with no text`;
  `line N names the move "<x>", which is not in the library` (or `the cut "<x>"`: `helper.mjs moves` lists the
  names); `line N's <move>: <what its check said>` (an input the move cannot use); `line N: a scene has no cursor`;
  `line N: after a scene the beat names a screen`; `line N: cut goes on the first beat of its shot`;
  `a one-off is refused (...)`, with the file and what was found in it (above, "One-offs").
- **`notes:`** on the first line of `stills.txt`. The stills are made and nothing in the film code stops for
  these: they say how the film came out, for the builder to use or not. The sweep does not read them: it fails on
  private data and nothing else.
  `line N: the cursor has K frames to reach "<target>"` (two cues too close: move a cue to a later word, or split
  the actions over two lines); `screen S (shot K): frames A to B: scale decreases | the camera is the same as the
  frame before | moves up to N px in one frame` (a pull-back, a hold, a fast move);
  `line N: the bar has K frames to grow before the cursor presses its bookmark`;
  `line N: the watched screens run to T s and leave K frames for M more`;
  `line N: the list's items "<a>" and "<b>" are K frames apart` or `are not in the order they are spoken` (cue each
  item on its own word, in spoken order); `line N: the cursor is on while the list is up` (a list goes before the
  cursor's first action); `line N: after the list the cursor has K frames to come on and reach "<target>"` or
  `the camera is still on its way in when the cursor acts` (cue that action on a later word of its line);
  `line N: the list is still up when the screen changes`.

## Stills: looking at the film without rendering it

Stills take seconds; a render takes minutes. All land in `<dir>/out/frames/`; the log is `<dir>/out/log/stills.txt`
(its first line ends with `notes:`).

- `helper.mjs stills <id> moments`: a frame at each line's start, each cue and click, each cut and opening, every
  30th frame, and the last (`f<nnnn>.png`), and where the film has them a field filling, a screen becoming its next
  capture and a bar coming and going. Prints the film's length, the `notes:` and the moments in seconds.
- `helper.mjs stills <id> runs`: 16 consecutive frames across every click and cut, as contact sheets
  (`run-<nnnn>.png`, 4 by 4, left to right, top to bottom): where motion shows.
- `helper.mjs stills <id> list`: for a film with a narrated list, a 16-frame sheet across the blur coming in, each
  item's entrance and the clearing. In them: no list type over a readable screen; nothing there in one frame that
  was absent in the last; the list gone before the screen is sharp; no cursor until then.
- `helper.mjs stills <id> frames <n>,<n>,...`: named frames.

## Dispatching the stager

The `rostrum-stager` agent starts with no context. Give it a complete brief. Use this form, filled in:

```
Tutorial: <id>, folder <absolute tutorial folder>.
Helper tool: node "<absolute skill dir>/scripts/helper.mjs" (helper on 127.0.0.1:4600).
What the film is: "<title>", <what kind of video and what the user asked for>, <k> narration lines, <n> screens. Script: <folder>/script.md. Beat file: <folder>/film/beats.json.

Do: measure, stills at the moments, stills for the runs<, stills for the list, when a beat has one>, sweep. Do not render.
Pass <1|2|3>. <For a later pass: exactly what to change, by beat and field, and what in the frames or the `notes:` line that is meant to fix.>

Intent of each beat (what must be in frame and what the cursor does):
  line 0: the whole dashboard; cursor enters.
  line 1: the user menu (top right) is clicked and its menu opens; then "Profile" in the menu is clicked. Both must be whole in frame.
  ...
Things to look for in particular: <anything doubtful: a small target, a long cursor move, a dialog near the edge>.
Do not change: the narration lines, the targets, the order of beats. You may change `frame`, `with`, a `cue` word, and where a `change` sits, when a fault calls for it.

Report: per fault, the frame number, what is seen, and what you changed or could not fix; the final `notes:` line; the sweep result; the frames I should open.
```

Never include in a brief: the transcript, anything from `recording/`, or a description of any value seen.

## Checking the stager's work

Do not pass its report on. Look:

1. Read `<dir>/out/log/stills.txt` and `<dir>/out/sweep.txt`.
2. Open the moment frames it names and the run sheets: is this the film the narration and the user asked for
   (`references/how-to.md`; `references/explainer.md` or `references/showcase.md` for the register it is in;
   `references/house-notes.md`)?
3. For each fault, decide the fix in terms of the beat file (a wider `with`, a different first framing, a later
   cue, an `opens` on the right node, a blind rule) and re-dispatch with those exact changes. The stager reports
   `checking --pass <n>` to the panel itself: there is nothing to report here.
4. **At most 3 passes** (the first staging counts as one). After the third, stop fixing: go on to the sweep and the
   render if the sweep passes, show the user the cut, and list plainly what is still wrong and why.

A fault the beat file cannot fix (the template stages something badly) is not fixed by the builder editing the
template. It notes it as a limit; the main session then decides whether to build the missing piece (SKILL.md,
Stage 2).

## Sweep, render, review

1. `helper.mjs run <id> sweep`. It must print `sweep passed`. A failure: `references/scrub.md`, "The sweep".
2. `helper.mjs run <id> render` (several minutes). It writes `<dir>/out/v<n>.mp4` and the state becomes `built`.
   `409 sweep again` means something changed after the sweep: run the sweep again first.
3. Open the review page for the user: `http://127.0.0.1:4600/review/?tutorial=<id>`. On Windows:
   `Start-Process "http://127.0.0.1:4600/review/?tutorial=<id>"` in PowerShell (macOS: `open "<url>"`). Give the
   link in chat as well.
4. Tell the user: the film's length; that the review page is open and that timestamped notes can be left there; the fills chosen, if any; where blind rules were added, if any; anything simplified; anything still wrong.
