# The explainer register: a taste reference

One of two references a film may lean on (the other is restraint: framing by cut, the interface held still, one
thing moving at a time). Neither is a mode, and a film may mix them. This page is the utilitarian one: whatever makes
the step unmistakable. It is a reference to draw from, not a set of rules: the narration and the user's instructions
decide what a film is, and nothing here fails a build.

## What it reaches for

- **The cursor leads.** It points, rests beside what is being read, clicks on its cue word. Where the eye should be
  is where the cursor is (`cursor`, `frame`).
- **Lists as type.** When a line enumerates, the screen recedes and the items set as large type, each on its word
  (`list`).
- **Plain labels.** A short label that names what a thing is (`mark-time`, `pin`, the capsule of `carry`). The
  owner turned down a tag with a dot, an eyebrow above a heading and monospace capitals
  (`references/house-notes.md`, "No ornament").
- **Lift-outs.** The one thing the line is about, taken off the page and made large enough to read (`lift-out`);
  what a screen is made of, lifted apart (`depth-lift`).
- **Cards for an idea.** When the line is about something the screen does not show (a relationship, a count, rounds
  of work), a scene of cards on the stage says it (`cards`, `counter`, `word-swap`, `sheet-stack`), then the film goes
  back to the screen.
- **A way between places that says how they relate.** A step sideways (`stage-push`), into the thing chosen
  (`zoom-through`), the same thing on both sides (`match-cut`), time passing (`line-pass`), another world
  (`gradient-cross`), a thing taken along (`carry`). A plain cut says nothing, which is often right.

`references/moves.md` has each move's inputs; `helper.mjs moves <name> look` renders one alone.

## An idea the screen cannot show

A scene leaves the recording for a beat (`scene: {}` on the beat: no screen, no camera, no cursor). It suits a line
about something no screen shows: `cards` for a thing and its parts, `counter` for a quantity, `word-swap` for a
state that changes, `sheet-stack` for rounds of work, `type-beat` for a breath between two parts. The way back is a
cut move, or `carry` (what was taken there goes here), and the film is on the screen again before the next action.

```json
{ "line": 4, "scene": {}, "moves": [{ "move": "cards", "at": "holds",
    "items": [{ "label": "Your account", "lines": 3 }, { "label": "Its keys", "lines": 2 }, { "label": "The sandbox", "lines": 2 }],
    "connect": [[0, 1], [0, 2]] }] },
{ "line": 5, "screen": 3, "cut": { "move": "stage-push" }, "frame": { "target": "keys" }, "cursor": "rest", "target": "keys", "cue": "keys" }
```

(Line 4 says "Your account holds its keys and its sandbox"; line 5 is back on the page where the keys are.)

## What the explainer's reviews taught

Notes from the owner's reviews of the film this vocabulary came from. Each was a remark on a real frame.

- **In that film, nothing is static.** A frame that holds for more than half a second read as a bug; a hold is a slow drift.
- **Containers before contents.** A card lands, then what is in it arrives; the hierarchy is part of the motion.
- **Vary arrivals.** Three things in a row that arrive the same way read as a template: change the direction, the
  way in (`cards` has three), or the order.
- **Smooth paths, already moving.** Things travel on curves, not right angles, and overlap rather than queue; what
  is carried across a cut is in flight as the cut lands.
- **Built in place, not flown in.** An assembly draws, fills and settles where it stands, its steps overlapping on
  soft curves; a swarm flying in read as wrong, and so did parts jerking into place one by one.
- **Sounds are many and quiet.** One small tactile sound for a visible event, a click for an interface moment, none
  for a slow drift; the same sound many times in a dense stretch was distracting.
- **No overshoot, no bounce.** The one exception is the match cut's own impact.
- **No match cut between different things.** It carried when the same object was on both sides, and jarred when it
  was not.
- **Large enough to read.** The thing a shot is about fills most of the frame; type under about 22 px was too small.
- **A transition never stops half way.** One that slid in, paused and went on again was the most remarked fault of
  all; so was a camera that went one way and came back.
