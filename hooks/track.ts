// The six-dot stage track (Record, Script, Approve, Narration, Build, Review): done dots filled, the current one
// hollow, the rest dim; blue while under way, green with all six done. One of the panel's two own drawings.
export type Mode = 'light' | 'dark'
export const ACCENT = { dark: '#2C84FF', light: '#1F6FEB' } as const
export const GREEN = { dark: '#3DD068', light: '#1FA347' } as const
const DIM = '#9C9A92'
const SURFACE = { dark: '#262624', light: '#FAF9F5' } as const
const X = [5, 43, 81, 119, 157, 195]

/** The track with `done` of six steps done (0..6). */
export function trackSvg(done: number, mode: Mode): string {
  const n = Math.max(0, Math.min(6, Math.floor(done)))
  const colour = n >= 6 ? GREEN[mode] : ACCENT[mode]
  const filled = X.slice(0, n).map((x) => `<circle cx="${x}" cy="${5}" r="4"/>`).join('')
  const current = n < 6 ? `<circle cx="${X[n]}" cy="5" r="3.75" fill="${SURFACE[mode]}" stroke="${colour}" stroke-width="2.5"/>` : ''
  const rest = X.slice(n + 1).map((x) => `<circle cx="${x}" cy="5" r="3"/>`).join('')
  const to = n >= 6 ? 195 : X[n]
  return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="10" viewBox="0 0 200 10" role="img" aria-label="Step ${Math.min(n + 1, 6)} of 6">`
    + `<path d="M5 5H195" stroke="${DIM}" stroke-opacity=".45" stroke-width="2"/>`
    + `<path d="M5 5H${to}" stroke="${colour}" stroke-width="2"/>`
    + `<g fill="${colour}">${filled}</g>${current}${rest ? `<g fill="${DIM}">${rest}</g>` : ''}</svg>`
}

/** The same on a surface with no Svg (the terminal). */
export function trackText(done: number): string {
  const n = Math.max(0, Math.min(6, Math.floor(done)))
  return '●'.repeat(n) + (n < 6 ? '◉' : '') + '·'.repeat(Math.max(0, 5 - n))
}

/** The recorder's light in the status line: a round dot, green while it is connected and a neutral grey while not. */
export function dotSvg(isOn: boolean, mode: Mode): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 8 8"><circle cx="4" cy="4" r="4" fill="${isOn ? GREEN[mode] : DIM}"/></svg>`
}
