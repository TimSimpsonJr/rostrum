# Stages

The stage is the ground a film stands on. It is part of the picture plan: named once for the film, and again where a
scene changes it. A stage does two things and no more: it draws the ground, and it has a **tone** (light or dark).
The tone is all the rest of the film reads of it: which ink the title and labels take, which cards and lift shadows
the moves draw, when a cut flips. Nothing else in a film knows which stage it is on.

## Where a stage is named

- The beat file's `stage`: the film's.
- A scene's (`"scene": { "stage": ... }`): that scene's own. A shot (a beat with a `screen`) always has the film's.
- The brand's `brand.json` (`"stage": ...`, `references/brand.md`): the stage of every film under that brand that
  names none of its own.
- None of these: light.

Each is written the same way: `"light"`, `"dark"`, or a named stage with its inputs:

```json
"stage": { "move": "field", "from": "accent", "to": "#102040", "tone": "dark" }
```

`tone` is the one input every named stage takes; without it the tone is light. Say `dark` for any ground that is
deep enough to want light type.

## The stages there are

| Stage | What it is | Inputs beside `tone` |
|---|---|---|
| `"light"` | The house stage: a pale field, two slow orbs | none |
| `"dark"` | A deep field with one slow glow; cards glow instead of casting shadow | none |
| `field` | A solid colour, or a two-colour gradient whose angle drifts a degree or two | `colour`, or `from` and `to` (CSS colours; the word `accent` is the brand's accent); `angle` |
| `environment` | A wall lit from one side and a floor low in the frame; a sense of place. No reflection of the content | `light` (`left`, `right`, `top`); `floor: false` for the wall alone |
| `image` | A picture the user supplied, covering the frame | `file`; `scrim`; `fit` |
| `footage` | A clip the user supplied, playing muted behind the film | `file`; `scrim`; `loop` |
| a one-off | A `Stage.tsx` in the tutorial's `film/moves/<name>/`, when no stage here is the one the film calls for | its own |

`references/moves.md` lists every input. To see one alone: `helper.mjs moves <name> look` draws it with a window on
it; `tools/move-still.mjs <name> --with type` draws it with a title and cards on it.

## A supplied picture or clip

- **Where it goes.** In the tutorial's `film/media/` (for this film), or in the brand's folder (for every film of the
  brand: it is copied into each film with the brand). The plugin ships no pictures.
- **How it is named.** By its plain file name: `"file": "texture.png"` is `film/media/texture.png`; in a beat file
  `"file": "brand/wall.jpg"` is the brand's; in `brand.json` the brand's own file is just `"file": "wall.jpg"`.
  A folder, `..`, a drive or an address is refused, and nothing is ever fetched: a picture from the web is saved
  into `film/media/` by the user first. Pictures: png, jpg, jpeg, webp. Clips: mp4, webm.
- **The scrim.** Type has to be read on it, so a wash of the stage's own colour lies over the picture: pale on a
  light tone, deep on a dark one. It is on at 0.6 unless `scrim` says otherwise (0 to 1). Turn it down for a quiet
  picture, up for a busy one; at `0` nothing lies under type or cards.
- **A clip** is used as it is: never trimmed, never heard. One shorter than the film holds its last frame; given
  its length (`"loop": 6`, seconds) it plays again from its start instead. It runs on the film's clock. Every frame
  of it is decoded, so a render takes longer.
- **In the script.** The files the user supplied are named in the picture plan's header (`Media supplied: ...`).

## What stands on a stage

- A recorded window keeps its own ground, corners and shadow on any stage.
- A `bare` shot's elements stand straight on the stage, each on the page's own colour: on a picture or a clip that
  is a patch of that colour over it. That is how it looks; choose a quiet ground, or keep the window.
- Type and cards take the tone's colours. On a `field` of a mid colour neither ink is at its best: make the colour
  clearly pale or clearly deep, and say the tone.

## Crossing from one stage to another

A scene on another stage is a change of world, and the cut into it carries the change: any cut move flips the stage
part of the way through (`toneAt`), and `gradient-cross` is the one made for it, panning down a gradient from light to
dark or back. Its `to` is the tone it arrives on; a named stage shows through the gradient's clear ends. A plain cut
flips on the cut.
