# The review player

The page where a tutorial's film is watched and noted: the film with its versions (v1, v2, v3), a timeline with a
numbered pin per note, and the notes beside it, each with its time, its text, its status and Claude's reply.
Switching version keeps the playhead's time. The notes are plain files in the tutorial's folder, so the assistant
can read them and answer them.

The Rostrum helper serves it, one per tutorial, at `/review/<id>/` (Open review in the panel). It runs only under
the helper: the helper adds the routes that know of tutorials (`api/tutorial`, `api/send`, `api/approve`) and the
font (`/kit/GeistVF.woff2`, the film kit's own file). Nothing is loaded from the network, and only
`<tutorial>/out/` and `<tutorial>/review/` are ever served.

`ffprobe` and `ffmpeg` on PATH are optional: without them there are no lengths before a film loads and no frame
images, and everything else works.

## Using the page

Pause anywhere, type, press Enter (or "Add note"): the note is pinned to that moment. Press a pin, a note's number
or its time to go there: that opens the note. "Send notes to Claude" hands the notes to the session through the
Rostrum panel; "Approve" marks the film as reviewed. Keys: Space plays and pauses (wherever the focus is, except in the note box), Left and Right step one frame, N
goes to the note box, Enter adds, Esc clears (and closes an open note).

A click on the film plays and pauses. A drag on it marks a selection: the film pauses, a new note starts at that
moment with the selection attached, and the note box takes the typing; Esc drops both. A drag while a note is open
gives that note its selection or replaces it, and the cross on the selection's corner takes it away. A selection is
drawn only while its note is open (being written, or opened from the list or a pin) and the film rests on the note's
frame: never while the film plays, and never on the timeline. A note that has one says so before it is opened: four
small corners beside its time in the list, one corner on its pin.

An open note has Edit and Delete in its row. Edit turns its text into a field (Enter or Save keeps it, Esc or Cancel
drops the edit and leaves the note open); the selection stays and can be dragged again meanwhile, and Claude's
reply, which the page never edits, stays too. Delete asks once in the row, saying what the note is marked as and
that a reply goes with it, then removes the note and its saved frame.

## Files

- `server.mjs`: the store and its routes (`createReview({ root, notes })`, mounted by `helper/server.mjs`).
- `index.html`, `review.css`, `review.js`: the page. `model.mjs`: its pure parts (the words for a status, the
  count line, versions, pins, the time kept on a switch, a click against a drag, a region from a drag and as it is
  stored), tested in `model.test.mjs`.
- `review.test.mjs`: the routes, through the helper.

## Where the notes are

`<tutorial>/review/`

- `NOTES.md`: everything, readable top to bottom. Rewritten on every change; do not edit it.
- `<video path with / replaced by __>.json`, for example `out__v2.mp4.json`: the source of truth,
  `{ "video": "...", "notes": [ ... ] }`. One file per version; the page lists every version's notes together, by
  time, because a note belongs to the tutorial, not to a version.
- `frames/<noteId>.png`: the frame of the film each note points at.

A note:

```json
{
  "id": "k3x9qa",
  "video": "out/v2.mp4",
  "videoMtime": 1791342660000,
  "time": 31,
  "frame": 930,
  "fps": 30,
  "text": "Hold on the key a little longer",
  "region": null,
  "status": "done",
  "reply": "The key now stays on screen longer.",
  "fixedIn": "v3",
  "createdAt": "2026-10-11T12:00:00.000Z",
  "updatedAt": "2026-10-11T12:30:00.000Z"
}
```

- `video` is the version the note was made on. `time` is seconds into it; `frame` = round(time x fps).
  `NOTES.md` shows times as m:ss.ff (ff = frame within the second).
- `status` and the page's words for it:

  | Stored | On the page | Who sets it |
  |---|---|---|
  | `open` | To fix | the person (a new note; or pressing a note's status to set it back) |
  | `done` | Fixed in v3 (`fixedIn`), or Fixed without it | Claude, replying |
  | `wontfix` | No change needed | Claude, replying (also the answer to praise or a remark) |

- `reply` is the assistant's answer. `fixedIn` is the version that holds the fix (`v<n>`); absent until then.
- `region` is the note's selection, or `null` for a note about the whole frame: `{ "x", "y", "w", "h" }` as
  fractions (0 to 1) of the film's frame from its top-left corner, so on the 1920x1080 film `x` and `w` times 1920
  and `y` and `h` times 1080 are pixels. `NOTES.md` gives it as percentages, and `frames/<noteId>.png` has it
  outlined.
- `videoMtime`: the file's modified time when the note was made. If the file is newer, `NOTES.md` marks the
  note as stale.

## For the assistant

1. Read `<tutorial>/review/NOTES.md`. Look at `frames/<id>.png` to see the moment a note points at.
2. Answer each note with the skill's helper tool, after the render that holds the fix:

   ```
   node "<skill dir>/scripts/helper.mjs" reply <id> <noteId> done <one or two sentences>
   node "<skill dir>/scripts/helper.mjs" reply <id> <noteId> wontfix <one line>
   node "<skill dir>/scripts/helper.mjs" reply <id> <noteId> open <a question>
   ```

   `done` carries the version: the latest render becomes the note's `fixedIn`. The page shows the reply and the
   new status within a few seconds.
3. Never write the `.json` files in `review/` by hand, and never edit `NOTES.md`.

## API

All under `/review/<id>/`. Writes need `Content-Type: application/json`.

| | |
|---|---|
| `GET api/tutorial` | `{ id, title, state, length, renders }` (the helper's) |
| `GET api/videos` | `{ versions: [{ name, path, size, mtime, duration, fps, start, notes, open }] }`, by number |
| `GET api/notes` | every note of the tutorial, by time |
| `GET api/notes?video=<path>` | notes of one version |
| `POST api/notes` | `{ video, time, text, region? }` creates a note |
| `PUT api/notes/<noteId>` | any of `{ text, status, reply, fixedIn, region }` (`region: null` takes it away) |
| `DELETE api/notes/<noteId>` | removes the note and its frame image |
| `GET api/frame?video=<path>&t=<seconds>` | PNG of that frame |
| `GET video?path=<path>` | the film file (byte ranges supported) |
| `POST api/send` | asks the panel to hand the notes to the session (the helper's) |
| `POST api/approve` | the `reviewed` event (the helper's) |
