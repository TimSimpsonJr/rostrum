# Rostrum

Rostrum turns a narrated walkthrough of a web page into a short, polished video. You record yourself clicking through a site in Chrome while you talk, and Claude writes a script from what you said, then rebuilds the screens as a film with camera moves, a cursor and your narration.

The film is rebuilt from the page itself, so it is sharp at any size, and private details are swapped for stand-ins before Claude reads anything.

Rostrum has three parts: a plugin for Claude (a panel and a skill), a recorder you load into Chrome, and a small helper program that runs on your own computer.

## What you need

- **Claude**: the Claude desktop app's Code tab, or Claude Code in a terminal, with plugins available.
- **Google Chrome**, for the recorder.
- **About 1.5 GB of free disk space.** Rostrum fetches what it needs the first time, after you press a button that lists it:

| What | Size | From |
|---|---|---|
| Node 22 (only if your computer has no Node 22 or newer) | about 36 MB download on Windows, about 50 MB on a Mac | nodejs.org |
| The video engine (npm packages, including Remotion) | about 650 MB on disk | the npm registry |
| A browser for rendering films (Chrome Headless Shell) | about 270 MB on disk | fetched by Remotion |
| The transcriber (whisper.cpp), on Windows | 8 MB download | GitHub |
| The transcriber's English model | 488 MB | Hugging Face |

- **A text-to-speech account for the narration**: an ElevenLabs account, or any other text-to-speech service or app. Rostrum doesn't make the voice itself: you paste the script into your service, download the audio, and give Claude the file. If you'd rather narrate it yourself, your own voice saved as an audio file works too.

Rostrum has been built and used on Windows. macOS should work and hasn't been tried yet (see Known limits). On Linux you install Node 22 and a transcriber yourself.

## Install

### From GitHub

1. Open Claude, start a session in the Code tab, and paste this message:

```
Please add the Rostrum plugin for me, from GitHub.
In my user settings file (~/.claude/settings.json), keep everything that is already there and add:
under "extraKnownMarketplaces", an entry "rostrum" with the value
{ "source": { "source": "github", "repo": "TimSimpsonJr/rostrum" } };
and under "enabledPlugins", "rostrum@rostrum": true.
Then tell me when to restart Claude.
```

Claude asks before it changes the file. Say yes.

2. Quit Claude and open it again. Start a session in the Code tab and type `/rostrum`. The Rostrum panel opens.

No terminal is needed, here or later. If you use Claude Code in a terminal, one line at its prompt does the same:

```
/plugin install rostrum --marketplace TimSimpsonJr/rostrum
```

### From a folder or a zip

1. Unzip Rostrum somewhere it can stay, for example `Documents\rostrum`. Rostrum runs from this folder, so don't move or delete it afterwards.
2. Open Claude, start a session in the Code tab, and paste this message, with your own folder in it:

```
Please add the Rostrum plugin for me. It is in the folder C:\Users\you\Documents\rostrum.
In my user settings file (~/.claude/settings.json), keep everything that is already there and add:
under "extraKnownMarketplaces", an entry "rostrum" with the value
{ "source": { "source": "directory", "path": "C:/Users/you/Documents/rostrum" } };
and under "enabledPlugins", "rostrum@rostrum": true.
Then tell me when to restart Claude.
```

Claude asks before it changes the file. Say yes.

3. Quit Claude and open it again. Start a session in the Code tab and type `/rostrum`. The Rostrum panel opens.

No terminal is needed, here or later. Everything after this is a button in the panel or a sentence in chat.

If you prefer a terminal and have the `claude` command, these two lines do the same thing:

```
claude plugin marketplace add "C:\Users\you\Documents\rostrum"
claude plugin install rostrum@rostrum
```

## First run

The panel walks you through set-up in this order. Each step is one button.

**1. "Rostrum needs Node"** (only if your computer has no Node 22 or newer). The panel says what one press downloads and where it goes, and that nothing else on the computer is changed. Press **Download Node 22**. You'll see "Downloading Node 22.23.3", "Checking the download", "Unpacking Node" and "Node 22.23.3 is ready", then the panel starts Rostrum by itself.

**2. "Set up Rostrum".** The card reads "Rostrum needs a few things it does not ship with. One press fetches them:" and lists what is missing, with sizes. Under the list: "They go into this plugin's own folder" (and Rostrum's data folder, for the transcriber). "Nothing is sent anywhere." Press **Download and set up**.

A bar shows where it is: "Installing the video engine", "Putting the recorder's files together", "Fetching the browser that renders films", "Fetching the transcriber". It takes some minutes; how many depends on your connection. When it finishes the panel says "Rostrum is set up."

If a step fails, the card names it in plain words and offers **Try again**, which carries on from the step that failed.

**3. The transcriber.** Rostrum turns your speech into text on your own computer.

- On Windows, set-up fetches the transcriber (whisper.cpp) and its English model. It needs Microsoft's Visual C++ runtime, which most PCs already have. If yours doesn't, Rostrum says so and uses a Python Whisper instead if one is installed; Claude can help install the runtime. The program isn't signed, so a company antivirus may ask about it.
- On a Mac, Rostrum uses `whisper-cli` from Homebrew if it is there (set-up then fetches only the model), or a Python Whisper. If there is neither, the panel says "Rostrum has no transcriber" and offers **Ask Claude to set it up**.

## Load the recorder in Chrome

The recorder is a Chrome extension that you load by hand, once. In the panel, press **Set up the recorder** (or **Recorder setup** beside the status line). The card has four steps:

1. "Put the recorder's files on this computer." Press **Put the recorder files in place**.
2. "Open Chrome's extensions page and switch on Developer mode, top right." The **Open extensions page** button opens it (or go to `chrome://extensions`).
3. "Press Load unpacked, top left, pick this folder and press Select Folder." The card shows the folder, with a **Copy** button so you can paste the path into the dialog.
4. "Pin it: press the puzzle-piece icon in Chrome's toolbar, then the pin beside Rostrum."

The recorder's icon is a blue speech bubble with an R cut out. A red ring in its place means it is recording.

When Chrome has it, the line at the top of the panel turns to **Recorder connected**, with a green dot, within a minute.

## Make your first video

A video goes through six steps. The panel shows them as a row of dots: Record, Script, Approve, Narration, Build, Review.

| Step | Who | What happens |
|---|---|---|
| Record | You | Open the page you want to show. Press the Rostrum icon in Chrome, allow the microphone the one time Chrome asks, and press **Start recording**. Click through the task and say what you're doing. **Pause** holds the recording; **Send to Rostrum** ends it. The recording appears in the panel as a card. |
| Script | Claude | Press **Write script**. Claude writes a narration script from what you said and did, and shows it in chat. |
| Approve | You | Read the script in chat. Ask for any changes in plain words, then approve it there. |
| Narration | You | Paste the script into your own text-to-speech tool (or read it aloud) and save the audio. Press **Add narration** and give Claude the file in chat. |
| Build | Claude | Press **Build**. Claude stages the film, checks the frames and renders it. The panel shows a progress bar. |
| Review | You | Press **Open review**. Watch the film, pin notes to moments you want changed and send them, or approve it. The finished film is in your Rostrum folder. |

You can talk naturally while recording. The script is written from what you say, then tightened.

Your videos live in a folder of your own: `Videos\Rostrum` on Windows, `Movies/Rostrum` on a Mac.

## Privacy

Everything runs on your computer. The helper answers only on `127.0.0.1` (your own machine), and recordings stay in your Rostrum folder. The only network use is the set-up downloads above, the conversation with Claude that you see in chat, and whatever your own text-to-speech tool does.

**Replaced automatically, before Claude reads anything:**

- secrets: passwords, API keys, tokens
- account numbers, card numbers and tax numbers
- money amounts (round figures stand in, in the same format)
- the values of form fields (the recorder masks them as it records)
- where links go (link addresses are blanked; a link's visible text is kept)

**Everything else is judged per video.** Names, email addresses, company names and table contents arrive as recorded. Claude decides with the script which of them to make generic (other people's names and customers, typically) and tells you what was changed, so you can say if something should stay or go.

The raw recording is never read by Claude. Claude works from the cleaned copy, and a final check for private data runs before any film is rendered.

## Brands

A brand is optional. It is a folder with your logo, colours and, if you like, your voice settings. Give Claude your branding material in chat and it sets the folder up.

- With one brand, it is used.
- With several, Claude asks which one before building.
- With none, the film ends on a plain card with its title.

## Known limits

- **Only tried on Windows so far.** The Mac paths were written by reading, not by running.
- **The first click into the panel can be swallowed.** In the desktop app, a first click on a panel that doesn't have focus only focuses it. Click again. The panel says so too.
- **Pages that scroll inside an inner panel** (rather than the whole page scrolling) don't scroll in the film.
- **A few developer tools need a full ffmpeg.** Making videos doesn't: the engine's bundled ffmpeg covers it.
- **Some audio formats aren't read.** Narration in MP3, WAV, AAC (M4A), FLAC, Opus or Ogg Vorbis works. WMA, AMR and Apple Lossless don't; save as MP3 or WAV instead.
- **The Windows transcriber is new.** It has transcribed text-to-speech narration; a microphone recording is less tested. If the script doesn't match what you said, that's worth reporting.

## Licence

Rostrum is released under the MIT licence. See `LICENSE`.

**Remotion, which renders the videos, has its own licence.** Rostrum installs Remotion on your computer but doesn't include it. Remotion's licence says you are eligible to use it for free if you are:

- "an individual"
- "a for-profit organization with up to 3 employees"
- "a non-profit or not-for-profit organization"
- "evaluating whether Remotion is a good fit, and are not yet using it in a commercial way"

Any other organisation needs a Remotion Company License: see [remotion.pro](https://www.remotion.pro/license). If you make videos with Rostrum at a larger company, that company needs one.

The sound effects are public domain (Creative Commons 0); their sources are listed in `film/public/kit/SOUNDS.md`. The icons are from Lucide (`film/src/kit/ICONS-LICENSE.txt`). The typeface is Geist, under the SIL Open Font License (`film/src/kit/FONT-LICENSE.txt`).
