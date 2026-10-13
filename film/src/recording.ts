// A prepared recording as the film needs it: the `clean/` folder of the tutorial folder the render was given as its
// public dir (--public-dir <tutorial folder>/film: tools/paths.mjs), written by tools/prepare-recording.mjs. Its screens and clicks are in
// seconds from the first event.
import { staticFile } from 'remotion';

export type Size = { width: number; height: number };
export type Screen = { i: number; t: number; path: string; href: string; viewport?: Size };
export type Click = { t: number; nodeId: number; x: number; y: number; screen: number };
export type Manifest = { t0: number; viewport: Size; screens: Screen[]; clicks: Click[]; mic: { file: string; t0: number } | null };

/** The window size a screen was taken at: its own (prepare writes one per screen), else the recording's first. */
export const viewportOf = (m: Pick<Manifest, 'viewport' | 'screens'>, screen: number): Size => m.screens.find((s) => s.i === screen)?.viewport ?? m.viewport;

/** Where a file of the prepared recording is served from, as an absolute URL (it is written into a rebuilt document). */
export const recordingUrl = (file = '') => new URL(staticFile('clean/' + file), location.href).href;

let manifest: Promise<Manifest> | undefined;
export function loadManifest(): Promise<Manifest> {
  return (manifest ??= fetch(recordingUrl('manifest.json')).then((r) => r.json()));
}

/** The screen in force at `seconds`: the last one taken at or before it (the first one if none is earlier). */
export function screenAt(m: Pick<Manifest, 'screens'>, seconds: number): Screen {
  return [...m.screens].reverse().find((s) => s.t <= seconds) ?? m.screens[0];
}
