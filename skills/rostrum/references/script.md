# Script: the narration and what the film shows

The script is what the film's voice says and, beside each line, what the film shows. The user approves it in
chat; the narration block they copy, the comparison with the recorded voice and the timing all read this one file.

What the script says, in what shape and at what length, comes from the recording's narration and the user's
instructions. For a how-to, `references/how-to.md` has the defaults, and `examples/script.md` is one as approved.
The one thing fixed whatever the format is safety rule 6: no value from the screen in a line.

If the user's instructions require a writing or voice skill for text that goes to an outside audience, invoke it for
the narration lines.

## The file: `<tutorial folder>/script.md`

The helper reads **only the table**, and only its `Narration` column. The exact rules of the parser:

- A table row is a line that starts with `|`. The header row must have a cell that reads `Narration`.
- Every row after the header whose Narration cell is not empty is one narration line, in order. Lines are numbered
  from 0 in that order: **line 0 is the first spoken line**. That number is the `line` of the beat file.
- A cell that is empty, or wholly in brackets such as `(no narration)`, is not a line. Use it for the title row.
- Do not put a `|` inside a cell (write `\|` if one is ever needed). Do not put a second table with a `Narration`
  column in the file. Do not wrap a line of narration in brackets.
- The narration text is exactly what the voice will be asked to say and what the recorded take is compared with,
  word for word. No stage directions inside it.

The layout a how-to uses (the columns after `Narration` are for the user to check the plan against, and are free:
another kind of video names its own):

```markdown
# <Title>: script

Status: DRAFT, waiting for approval. <n> words in <k> lines, about <s> seconds spoken.
Left out of the walkthrough: <each thing, and why>.

| # | Narration | Picture | Moves |
|---|---|---|---|
|   | (no narration) | The title alone on the stage: "<Title>" | title |
| 0 | <line> | The whole screen settles in; the cursor comes on | window · framing whole · cursor enter |
| 1 | <line> | <what the viewer sees, the control named by its label and where it is> | framing corner · cursor click · opens |
| n | <closing line> | The last screen gives way to the end card | cursor leave · end-card |
```

- `#` is the line number from 0, so it equals the beat file's `line`. The title row has none.
- `Picture` is one sentence of what the viewer sees under the line; `Moves` names the moves that make it, by their
  names in the catalogue (`references/moves.md`). A move that is not in the catalogue is written `NEW: <name>`.
- Saying what each line shows in words the user can check ("the View API Key button, under the form") is how a
  wrongly read gesture gets caught before the build.
- When the user approves, change the status line to `APPROVED` with the date and any cut they asked for.

### The picture plan

The `Picture` and `Moves` columns are the picture plan: the user approves the words and the picture together, and
either can be redirected in chat before anything is built. The stage is named where it changes
(`references/stages.md`); a picture or a clip the user supplied for one is named in the header as
`Media supplied: <file names>`. A worked example
(five lines, invented, no values):

```markdown
# Find your user API key: script

Status: DRAFT, waiting for approval. 58 words in 5 lines, about 23 seconds spoken.
Left out of the walkthrough: closing the menu (the cut covers it).

| # | Narration | Picture | Moves |
|---|---|---|---|
|   | (no narration) | The title alone on the stage. | title |
| 0 | On your dashboard, open your user menu in the top right corner. | The whole dashboard settles in; the cursor travels to the user menu and clicks it on "menu"; the menu uncovers from under the control as the camera eases toward that corner. | window · framing corner · cursor click · opens |
| 1 | Choose Profile. | The cursor steps to Profile and clicks; a cut to the profile page, its cards setting in place. | cursor click · page-cut |
| 2 | Your API key sits in the Credentials card, below your contact details. | The camera goes in on the Credentials card; the cursor rests beside the key field on "key". | framing group · cursor rest |
| 3 | Select View API Key to reveal it, then copy it with the button beside it. | The cursor clicks View; the key field lifts out of the page and enlarges while the page recedes behind it; the stand-in value shows selected on "copy"; the field sets back down. | cursor click · lift-out · selects |
| 4 | And that's how you find your user API key. | The cursor leaves; the page gives way; the mark sets and is swept. | cursor leave · end-card |
```

(`examples/script.md` was approved before there was a picture plan: its columns are `Points at` and `Cursor`.)

## Then

1. `node "<skill dir>/scripts/helper.mjs" event <id> scripted <the title>` (the title becomes the tutorial's name in
   the panel; 120 characters at most).
2. Stop and present it in chat, as described under "Presenting the script in chat" below. Ask: approve, or what
   should change?
3. Approval and edits happen in chat. For each edit, change `script.md`, then show the changed rows and the whole
   narration block again (the block must always be the current text). An edit to an already approved script first
   needs `event <id> editScript`.
4. On approval: `event <id> approved`, then go straight on to the narration hand-off (`references/narration.md`):
   the block again, the text-to-speech link and voice, and the request for the audio file in chat.

## Presenting the script in chat

The same presentation is used after writing the script, after every edit, and for the prompt "Rostrum: show the
script for tutorial <id>" (the panel's **View script** button) in any state from `scripted` on. Never send the user
to the local page to read or copy the script.

1. One line above everything: the title, the status (draft or approved), the word count and the seconds spoken.
2. **The table of lines:** the script's own table, shown as it is (`#`, `Narration`, `Picture`, `Moves`), so each
   line can be checked against what it shows. Under it, what was left out of the walkthrough and why, and anything
   uncertain.
3. **The narration alone, as ONE fenced plain-text code block**, so the user copies it in one action:
   - open the fence with ```` ```text ````;
   - one narration line per paragraph, with one blank line between paragraphs, in script order;
   - exactly the text the voice should read, character for character as in the `Narration` column;
   - **nothing else inside the block**: no line numbers, no labels, no title, no brackets, no stage directions, no
     trailing note. The title row and any `(no narration)` row are not in it.

   Take the text from `node "<skill dir>/scripts/helper.mjs" narration <id>`: it prints the lines the helper parsed
   from `script.md`, one per paragraph, which is exactly what a take is compared with. Copy what is between its two
   rules into the block. If its line count is not the table's, the table is malformed: fix `script.md` first.

   For a script whose lines are "Your keys are on the Keys page.", "Select Copy to copy one." and "And that's how
   you copy a key.", the block is:

   ```text
   Your keys are on the Keys page.

   Select Copy to copy one.

   And that's how you copy a key.
   ```

4. The question. For a draft: "Approve, or what should change?" For a script already approved, no question: say
   where the tutorial stands and what is next.

Keep the table and the block as two separate things: the table is for checking, the block is for copying.
