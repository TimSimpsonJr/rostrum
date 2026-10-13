# The kit's sounds: sources

Every `.wav` in this folder is in the public domain (Creative Commons 0). Nothing is synthesised; every file is a
cut from one recording. `film/src/kit/sound.tsx` (`SFX`) lists the families and how many takes each has.

The pack: "Book Foley Pack #1" by Joao_Janz, Creative Commons 0, https://freesound.org/people/Joao_Janz/packs/30986/.
All families except the whooshes and the riffles are cut from it.

The whooshes (`whoosh-*`, `whoosh-pass-*`, `whoosh-cut-*`) and the riffles (`riffle-*`) are cut from three single
Freesound recordings, each Creative Commons 0:

- Freesound sound 494797 by brandondelehoy, "jacketcloth rustle 9", https://freesound.org/s/494797/
- Freesound sound 391448 by saturdaysoundguy, "shirt whoosh 1", https://freesound.org/s/391448/
- Freesound sound 172304 by Tomoyo Ichijouji, "bookpageshuffle", https://freesound.org/s/172304/ (`riffle-4` is the long riffle of a whole stack, named `riffle-13` where these files came from)

Softened: every file has a high shelf of -7 dB above 3.5 kHz and a low-pass at 9 kHz, so the effects sit under a
narration. They play at the approved level (`APPROVED_DB` in `sound.tsx`) plus each family's own trim.
