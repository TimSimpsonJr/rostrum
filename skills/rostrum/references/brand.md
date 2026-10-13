# Set up a brand (in chat)

A brand is a folder on the user's machine, outside the plugin: `<home>/Brands/<name>/` holding `brand.json` and the
mark file. `<home>` is the tutorials folder (`helper.mjs get tutorials` answers it as `home`, and lists the brands
there are). The plugin itself holds no brand. With no brand a film still builds: its end card is the tutorial's
title as text.

## When

The user gives a folder of brand material ("here's our branding", "use our logo"), or asks for their logo, colours
or voice on the films. Do not start this unasked in the middle of a build; offer it afterwards if the end card is
text only.

## Steps

A folder that already holds a `brand.json` is a finished brand someone packaged (a zip counts: unpack it first).
Read the file, check that the mark and any stage file it names are in the folder, copy the whole folder
unmodified to `<home>/Brands/<name>/`, and go to step 4. Ask only about what does not fit this user: the `voice`,
if they use a different one.

1. **Read the folder the user gave.** List it; open what is there: logo files (SVG, PNG), a guidelines document, a
   colour list. Brand material is not a recording: it may be read freely.
2. **Find, in this order, asking only for what cannot be found:**

   | Property | Where to look | If not found |
   |---|---|---|
   | `name` | The folder, the guidelines, the logo's file name | Ask |
   | The mark | A horizontal logo or word-only logo as SVG (best) or PNG with a transparent background. With several, prefer the plain primary version on a light background | Ask which file. With none: leave `mark` out (text-only end card). **Never draw, trace, generate or recolour a logo** |
   | `mark.aspect` | Height divided by width: an SVG's `viewBox` (third and fourth numbers) or `width`/`height`; a PNG's pixel size | Compute it; never guess |
   | `mark.gradient` | Two brand colours, left to right, that sweep across the mark once on the end card | Leave out: the accent is used |
   | `mark.build` | Only an SVG mark drawn as strokes (centrelines with a `stroke`, not filled outlines), with one group per letter or part. Open the file and look | Leave out: the mark sets the plain way. Never edit the file to make it buildable |
   | `colours.accent` | The primary colour in the guidelines or the logo's own fill | Leave `null`: the recorded site's accent is used |
   | `font` | Only if the guidelines name a font the brand's sites really use | Leave `null` |
   | `voice` | Not in a branding folder | Ask: the address of their text-to-speech site (`site`, optional), the voice's name there and its settings (model, speed, stability, similarity). Skip if they use their own voice |
3. **Write the folder.** `<name>` for the folder is lower case letters, digits and hyphens. Copy the mark file into
   it **unmodified** (a file copy: do not re-save, optimise, crop or convert it), under a plain file name (letters,
   digits, dots, hyphens). Then write `brand.json`:

   ```json
   { "name": "Northwind",
     "mark": { "file": "logo.svg", "aspect": 0.21, "width": 900, "gradient": ["#3355cc", "#112277"] },
     "colours": { "accent": "#3355cc" },
     "font": null,
     "voice": { "site": "<https address of the text-to-speech site>", "name": "<voice name>", "model": "<model>", "speed": 1.0, "stability": 50, "similarity": 75 } }
   ```

   - `mark.width`: how wide the mark is set on the 1920-wide end card, in px. Start from 900 for a logo about four
     times as wide as tall; wider for a long word-only mark (up to about 1200), narrower for a square one (about
     400). The mark should take roughly half the frame's width or less and never crowd the edges.
   - `mark.build` (optional) makes the mark build on the end card, part by part, instead of fading in; the sweep
     follows. `"build": { "parts": "g[data-letter]", "from": 4, "line": "#ring-line", "fill": "#ring" }`:
     `parts` is a CSS selector for the mark's stroked parts, in order; `from` is the index (from 0) of the part the
     build spreads out from (left out: the part holding `line`, else the first). `line` and `fill` are for one
     filled part among the strokes and go together: `fill` selects the filled shape, `line` a hidden stroked
     centreline in the same file that covers the same pixels at its own `stroke-width`; the line is drawn first,
     then the filled shape takes its place. A file that does not fit (not an SVG, no `viewBox`, fewer than two
     parts found, a `line` without its `fill`) is set the plain way; filled shapes inside `parts` are not drawn on,
     they appear. The build takes 1.8 s whatever the number of parts and the sweep ends 2.7 s after the card
     starts (1.8 s without a build), so a film whose closing line is shorter than about 2.4 s ends up to 0.9 s later.
   - `stage` (optional) is the brand's own stage: the ground its films stand on when a film names none. It is
     written as a beat file's named stage (`references/stages.md`): `"stage": { "move": "field", "from":
     "#3355cc", "to": "#112277", "tone": "dark" }`, or a picture or clip of the brand's own: `"stage": { "move":
     "image", "file": "wall.jpg", "tone": "dark" }`. `file` is a plain file name in the brand's folder (png, jpg,
     jpeg, webp for `image`; mp4, webm for `footage`), copied into it unmodified like the mark; it is copied
     into each film with the brand, and a name that is a path, an address or another kind of file is refused.
     `tone` says which ink goes on it; a picture or clip gets a scrim of that tone so type reads on it (`scrim`).
   - `mark` may be left out or `null`; `gradient`, `build`, `stage`, `font` and `voice` may be left out.
   - `voice` is only shown to the user (in chat at the narration hand-off, `references/narration.md`, and on the
     local page) as the site, voice and settings to use; `voice.site` may be left out. Nothing here makes audio.
   - A `sites` key in an older `brand.json` is ignored. Which brand a film gets: the one set on the tutorial, the
     only one there is, or the one the user names when asked in chat (`references/build.md`, Order of work, step 3).

4. **Check it.** `helper.mjs get brands` lists the new brand. For a tutorial already built, `helper.mjs brand <id>
   <name>`, then stills of the last second of the film (`helper.mjs stills <id> moments` includes the last frame):
   the mark is whole, sharp, unaltered, centred, with air around it; the sweep and a render follow as for any
   change. With a `build`, also look at frames across the first two seconds of the end card (`helper.mjs stills
   <id> frames ...`, every fourth frame): every part is drawn on, none pops, and the last frame of the build is the
   plain mark.

## Notes

- The mark is the user's file as supplied; a lockup that does not exist as a file is theirs to supply
  (`references/house-notes.md`). A logo, a colour or a voice is not invented: an unknown stays unset, and unset
  properties fall back to the recorded site's own look, then to the default look.
- The brand folder may hold real brand names; the plugin folder never does (a test checks it). Never copy brand
  material into the plugin.
- More than one brand is fine. The panel shows a brand choice per tutorial when there are several.
