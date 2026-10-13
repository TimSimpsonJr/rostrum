# Narration: the hand-off in chat

The narration audio is the user's step: they make the voice on their own text-to-speech site and give the file
back. Everything around that step happens in this chat: the text to copy, where to make the voice and with which
settings, taking the file, uploading it, and what to do when a line was said differently.

**Never produce the audio** (safety rule 7): no voice tool, no connector, no command that synthesises speech, even
if one is available and even if the user's file is late. **Never ask the user to open the local page** for any of
this; the page is named only as a fallback when an upload from chat has failed (see the end).

## When this runs

- Straight after the user approves the script (`event <id> approved`).
- On the prompt "Rostrum: add narration for tutorial <id>" (the panel's **Add narration** button).
- Whenever the user asks what to do about the voice, or gives an audio file: "here's the narration audio", an
  attached audio file, a pasted path that ends in an audio extension.

First run `helper.mjs get tutorials/<id>`. The helper takes a take in `approved`, and a new take in `voiced`. In
`scripted`, the script waits for approval: show it (`references/script.md`). In `recorded`, there is no script. In
`built` or later the narration is already in the film and the helper takes no new take: say so. If `busy` is set,
wait (`helper.mjs wait <id>`). If no tutorial is named, `helper.mjs get tutorials` and take the only one in
`approved`; with several, ask which by title.

## Part 1: hand over (three things, then one request)

Run `node "<skill dir>/scripts/helper.mjs" narration <id>`. It prints the narration as the helper parsed it and the
voice the tutorial's brand names, if any (it reads `GET /tutorials/<id>/narration`: `lines` and `brand.voice`).
With more than one brand and none set on the tutorial there is no voice to show yet: ask which brand first and set
it (`references/build.md`, Order of work, step 3), then run the command.

1. **The narration code block again.** One fenced ```` ```text ```` block: one line per paragraph, one blank line
   between, exactly the text between the two rules of the command's output, and nothing else inside it (no
   numbers, no labels). The rules for the block are in `references/script.md`, "Presenting the script in chat".
2. **Where to make the voice**, as a plain markdown link. If the voice has a `site` that starts with `http://` or
   `https://`, link it with its own address as the text: `[<the address>](<the address>)`. With no `site`, write
   "your text-to-speech site" and no link. The plugin names no site and no vendor: never write one from memory,
   never guess one from the voice's name or settings, never suggest one.
3. **The voice and its settings**, as a short list of exactly what `brand.voice` returned, one per line, for
   example:

   - Voice: `<name>`
   - Model: `<model>`
   - Speed: `<speed>`
   - Stability: `<stability>`
   - Similarity: `<similarity>`

   Leave out any the brand does not set; show any other setting the brand does set, under its own name. With no
   brand, or a brand with no voice: "No voice is set for this tutorial: use your own voice and settings." Do not
   offer to set up a brand here unless asked.
4. **The request:** "Paste the text, generate the audio, download it, then give me the file here: attach it or
   paste its path." Say which types are taken: mp3, wav, m4a, ogg or webm, 50 MB at most.

Then stop and wait. Nothing else belongs in this message.

## Part 2: when the user gives a file

1. **Find the path.** An attached file arrives with a path, or the user pastes one. Strip surrounding quotes. If
   only a file name is given and the folder is not clear, ask where it is rather than searching the disk.
2. **Check it before uploading.** It exists, is a file, and its extension is one of `mp3`, `wav`, `m4a`, `ogg`,
   `webm`. Check with a file listing; **do not open or read the audio**. For any other type, ask for one of those
   five (most sites offer mp3). For a text file, a video, or a folder: say what was given and ask for the audio.
3. **Upload it:**

   ```
   node "<skill dir>/scripts/helper.mjs" narrate <id> "<file path>"
   ```

   It sends the file's bytes with the matching `audio/*` type and no `Origin`, then waits while the helper checks
   that it is audio, transcribes it, compares it with the script line by line, and times it. This takes from
   several seconds to a few minutes. It refuses, before sending anything, a path that is not a file, an unknown
   extension, an empty file and a file over 50 MB, each with a plain message to pass on.
4. **Report what it printed:**

   | The command ends with | Say |
   |---|---|
   | `<id>: voiced` and "The narration is in and timed. Next: Build." (exit 0) | "The narration is in. Next: Build." (the panel's **Build** button, or "build it" here). Nothing else |
   | "The take does not match the script" and a list of lines (exit 1) | See "A take that differs" below |
   | `not taken: 409 ...` | Where the tutorial stands (`busy`: wait and try once more; `narration from <state>`: the state is wrong for a take) |
   | `ERROR in transcribe: not an audio file` | The file is not audio the helper can read: ask for it to be downloaded again, as mp3 or wav |
   | `ERROR in transcribe: ... not found` | The transcriber is not installed on this machine: say so; the same file can be given again once it is |
   | The helper does not answer | Ask the user to open the Rostrum panel (`/rostrum`) or press Restart there, then upload again |

## A take that differs

The helper compares what was said with the script and leaves the tutorial `approved` with the take kept. The
command lists each line that was said differently or not spoken, as `line <n>` and the script's own text.

Show the user **only that**: the line number (as in the script's `#` column, from 0) and the script's own words for
the line. Never show, quote or paraphrase what the transcriber heard, and do not open `compare.json` or the take's
transcript to find out: a transcriber's mishearing shown as fact sends the user after a fault that is not there.

Then offer the two ways on, as a plain question:

- **Record it again.** Generate the audio again (the whole narration as one file; the block is above) taking care
  over the lines named, and give the new file here. Upload it the same way; a new take replaces the old one.
- **Keep the take.** If they have listened and the line is fine as spoken (a name the transcriber cannot spell, a
  number said in words), run `node "<skill dir>/scripts/helper.mjs" run <id> time`. On exit 0 the state is
  `voiced`: "Kept. Next: Build."

Do not choose for them, and do not change `script.md` to match a take unless they ask for the script to change (an
approved script needs `event <id> editScript`, approval again, and then a take that says the new text).

## A new take later

In `voiced`, a new file from the user is uploaded the same way; the tutorial is voiced again only if the new take
compares well. Say that a film already built keeps its narration.

## The fallback

Only if `narrate` fails for a reason that trying again does not fix (the file cannot be reached from this session,
the upload is refused in a way the table does not cover): say what failed in one line, and that the same upload can
be done by hand on the local page, `http://127.0.0.1:4600/tutorials/<id>/page` (the helper's port, if
`ROSTRUM_PORT` is set). The page shows the script, the voice and a place to drop the file. Do not offer it first.
