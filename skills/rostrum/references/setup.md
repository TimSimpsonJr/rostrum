# Set up: Node, Rostrum's parts, the transcriber, the recorder

A computer that has only just had the plugin installed is taken through four things, in this order, by the panel
(`/rostrum`). Each is a button there. The chat's part is to say which button is next, to explain the recorder's first
load, and to do the work itself where a button cannot. Never ask the user to type a command, open a terminal or set a
variable.

To see where a computer stands: `helper.mjs get setup` (when the helper answers) gives `steps` (each with `done`),
`transcriber` (`offered`, `python`, `own` or `none`), `running` and the last word of a run; `helper.mjs get tutorials`
gives `home` (the tutorials folder) and whether the recorder has been heard from (`recorder.lastSeen`).

## 1. Node

The helper needs Node 22 or newer. With none, the panel shows a block headed "Rostrum needs Node" and the button
**Download Node 22**: it fetches Node 22 from nodejs.org into Rostrum's data folder, checks it against nodejs.org's
checksum, and starts the helper with it. Nothing else on the computer is changed. Tell the user to press it.

The data folder is `%LOCALAPPDATA%\Rostrum` on Windows, `~/Library/Application Support/Rostrum` on a Mac and
`~/.local/share/rostrum` on Linux; the fetched Node is in its `node` folder.

Do the work in chat only when the button cannot (the download keeps failing, Linux, or the prompt "Rostrum: set up
Node for the helper" arrives):

1. Look for a Node that is new enough: `where node` on Windows, `which node` elsewhere, then the usual places
   (`%ProgramFiles%\nodejs\node.exe`, `%LOCALAPPDATA%\mise\shims\node.exe`, `/opt/homebrew/bin/node`,
   `/usr/local/bin/node`, a version manager's folder). Run it with `--version`: 22 or newer.
2. If one is found, write its full path into the `env` block of `~/.claude/settings.json` as `ROSTRUM_NODE`: read the
   file, add the key, write it back whole. Never remove another key. Then say: "Restart the Claude app, then press
   Start Rostrum again in the panel."
3. If none is found, say that Node 22 needs installing and give the link to the installer on nodejs.org. An installer
   is the user's to run; after it, "Start Rostrum again" finds the new Node by itself.

## 2. Rostrum's parts: one button

With the helper running, a copy of Rostrum that lacks something shows the card **Set up Rostrum**. It lists what is
missing and roughly how big it is: the video engine (npm packages, about 650 MB on disk), the recorder's files, a
browser for rendering films (Chrome Headless Shell, about 270 MB, fetched by Remotion), and the transcriber where
Rostrum can fetch one (below). The button is **Download and set up**. Tell the user to press it and that it takes
some minutes; the card shows a bar. Tutorials say "Waiting for setup" until it is done, then "Rostrum is set up."

A step that fails is named on the card in plain words, with **Try again**, which carries on from the step that
failed. If it fails again the same way, read `helper.mjs get setup` and say what the last word was and what it most
likely means (no connection, a full disk, a security program holding a file).

## 3. The transcriber

Rostrum turns the user's speech into text on the computer itself. Which program does it:

- **Fetched by the set-up button** where Rostrum has one to fetch (`transcriber: offered`): whisper.cpp and its
  English model (488 MB), into the data folder. Nothing to do in chat.
- **The Whisper already on the computer** (`python`): used as it is. Nothing to do.
- **None** (`none`): the panel shows "Rostrum has no transcriber" with **Ask Claude to set it up**, which sends
  "Rostrum: set up the transcriber". The same prompt comes from a tutorial whose transcription failed with "could
  not find the transcriber".

On that prompt, do the work; the user types nothing:

1. Look for one: `where whisper` / `which whisper`, then the usual places
   (`%LOCALAPPDATA%\Programs\Python\Python3*\Scripts\whisper.exe`); on a Mac also `whisper-cli` in
   `/opt/homebrew/bin` and `/usr/local/bin`.
2. If there is none, install one. On a Mac with Homebrew: `brew install whisper-cpp`, then ask the user to press
   **Download and set up** in the panel, which now fetches the model for it. Anywhere else: Python Whisper,
   `pip install -U openai-whisper` (through `uv pip` or `pip`); it needs Python and an `ffmpeg` on PATH, so say
   plainly if either is missing and what installs it.
3. If the program is not in a folder the helper searches (PATH; Homebrew's two folders on a Mac), write its full path
   into the `env` block of `~/.claude/settings.json` as `ROSTRUM_WHISPER`, as for `ROSTRUM_NODE` above, and say:
   "Restart the Claude app, then press Retry in the panel."
4. Otherwise say it is in place and that Retry (on the tutorial) runs the transcription again.

## 4. The recorder

The recorder is a Chrome extension that the user loads into Chrome by hand, once. Explain it on "how do I record",
"set up the recorder", and the first time a user has Rostrum set up and nothing recorded (`recorder.lastSeen` is
null). The panel has the same steps under **Set up the recorder** (the button on the empty panel, or "Recorder setup"
beside the status line); walk the user through them there:

1. Press **Put the recorder files in place**. The helper copies the recorder into the tutorials folder, as
   `Recorder`. Say the real folder: `home` from `helper.mjs get tutorials`, plus `Recorder`
   (by default `C:\Users\<name>\Videos\Rostrum\Recorder` on Windows, `/Users/<name>/Movies/Rostrum/Recorder` on a
   Mac). The card shows it, with **Copy**.
2. Press **Open extensions page** (or open `chrome://extensions` in Chrome). Then four clicks there:
   - switch on **Developer mode**, top right;
   - press **Load unpacked**, top left;
   - pick the `Recorder` folder (paste the copied path into the folder dialog);
   - press **Select Folder**. Chrome now lists "Rostrum".
3. Pin it: press the puzzle-piece icon in Chrome's toolbar, then the pin beside Rostrum. Its icon is a **blue speech
   bubble with an R cut out**. A **red ring** in its place means it is recording.
4. Look at the panel: the line at the top turns to **Recorder connected**, with a green dot, within a minute.

Then to record: open the page to show, press the Rostrum icon, allow the microphone the one time Chrome asks (in a
new tab), and press Start recording. Pause holds it; **Send to Rostrum** ends it, and the recording appears in the
panel as a card.

After the plugin is updated, the copy Chrome loaded is the old one: press **Put the recorder files in place again**,
then the reload arrow on Rostrum's card in `chrome://extensions`.

If the popup says "Rostrum is not open in Claude", the helper is not running: the panel (`/rostrum`) starts it.

A brand is not part of set-up: with none, a film ends on a card with its title (Stage 4 of the skill sets one up).
