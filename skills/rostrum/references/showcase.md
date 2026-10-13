# The showcase register: a taste reference

The other of the two references a film may lean on (`references/explainer.md` is the utilitarian one). This one is
restraint: the interface is the picture, the frame changes by cut, one thing moves at a time, and type stands beside
the interface, never on it. Neither is a mode, and a film may mix them. It is a reference to draw from, not a set of
rules: the narration and the user's instructions decide what a film is, and nothing here fails a build.

## What it leaves out

Worth knowing as a whole, because the look is mostly what is absent:

- Nothing drawn over the interface: no arrow, circle, ring or callout. Focus is framing (a crop, a cut, one item
  larger) or the interface's own highlight.
- No travelling zoom when something is being read. A change of framing is a hard cut.
- No type over the interface. A label stands beside the window or on an empty stage; two to four words, or a list
  of nouns, never a sentence.
- No dissolve between two states of the interface. A change is animated in place, or it is a cut.
- No overshoot, bounce or elastic ease. A short attack, a long settle, a stop. Nothing over about a second.
- No busy ground behind readable interface: a plain field, a two-colour gradient, a quiet room.
- Often no cursor at all. A film in this register may leave the pointer out and let the interface change by itself.

## The moves that carry it

- **The open.** `title-makes-room`: the first screen is there from the first frame and steps aside for the title.
  `cut-to-screen`: no title; the film opens on the screen, placed.
- **Framing by cut.** `framing-cut` (`frame.cut`): from the whole to the part that matters and back, with no travel.
  `pull-back` is the one cut that moves: it lands close on an element and settles back to the shot's framing.
- **The window held still.** `device-hold` (`frame.hold`): no drift for the shot; everything that changes, changes
  inside the screen.
- **The interface without its window.** `bare-ui` (`window` + `bare`): the elements alone on the stage, no frame, no
  shadow. `device-comes-back` (`frame-back`): the frame fades in round them without moving them, a detail back to the
  whole without a zoom.
- **Type beside the thing.** `frame.side` puts the window to one side and leaves a column free. `label-beside` sets a
  short label there whose words change on cue (the step counter without a step counter); `feature-list` sets nouns
  there line by line. On a scene, `chip-row`: a hero tile and its options.
- **One thing larger.** `icon-lift`: an element grows in its place while what is around it dims a little. The one
  focus move here that is not a cut.
- **The end.** `end-glyph`: a hard cut to one element alone, its parts parting and coming back, the mark coming up
  where it stood.

`references/moves.md` has each one's inputs; `helper.mjs moves <name> look` renders the ones that draw alone, and
the engine's (the open, the framings, bare, the end) are looked at in a film's stills.

## Change in place, and the swap

Two of the names above are ways of writing what the beat file already has, and they are most of this register:

- `hold-while-it-changes`: a `becomes` under a held framing. The window does not move; the screen becomes its next
  capture inside it. The viewer watches the interface answer, not the camera.
- `screen-swap`: a `page` change with `hold` on both shots. The same window in the same place, its content cut to
  another screen, whole, with nothing setting in: before and after, or past a long stretch nobody needs to watch.

```json
{ "line": 2, "screen": 4, "frame": { "whole": true, "side": "left", "hold": true },
  "moves": [{ "move": "label-beside", "words": ["Open the menu", "Choose Profile"], "each": ["choose"] }] },
{ "line": 3, "frame": { "target": "card", "cut": true }, "change": { "kind": "becomes", "screen": 5, "after": "save" } }
```

## What it costs

- At a side framing a wide page is small (half the frame's width at most): its text is not read there. Frame the
  part that matters to the side, or cut to it.
- A label beside the window is the stage's own type, large and light. `labels` (the explainer's) is the quiet
  annotation on the page; they are different voices, and a film that uses both should mean it.
- A cursor that is on the frame is enlarged with a shot that `pull-back` brings in, and jumps with a framing cut
  when it is mid-travel. Both vanish in a film that has no cursor.
