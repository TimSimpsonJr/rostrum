// The panel's progress bar, baked as one script-free SVG with SMIL (drawn in an Svg with isInteractive, so it runs).
// A port of docs/stage-b/mockups/make-bars.py, which is itself the playground's model (progress-playground.html)
// plus what baking needs: the loop closes after LOOP seconds, so every speed is rounded to one that comes back to
// where it began. The field is a fixed world the length of the track; the pill only uncovers more of it, so nothing
// about the motion changes with the progress. Nothing is lit past the pill. A finished bar has no patches: it twinkles.
// Numbers that are not in SETTINGS are the baker's (W, LOOP, STEPS); do not tune here: tune the playground, copy its
// JSON into bar-settings.json, then into SETTINGS, and run hooks/bar.test.mjs.
import type { Mode } from './track.ts'

export const SETTINGS = {
  progress: 70, text: 'Rendering', drift: 7, speedVar: 0.2, patch: 1, sizeVar: 0.2, count: 14, birthRate: 0.85, deathRate: 0.85,
  lifetime: 0.65, vertical: 0.55, runoff: 0.35, wander: 0.5, wanderAmount: 0.5, trail: 15, trailFade: 0.15, tick: 20, stepX: false,
  evolve: 0, detailScale: 2.25, detail: 0.4, soft: 0.04, cover: 0.5, lit: 1, half: 0.6, rest: 0.3, noise: 0.08, noiseSpeed: 1.2,
  reach: 110, far: 0.4, rows: 5, cell: 3, gap: 1.4, track: 24, accentDark: '#2C84FF', accentLight: '#1F6FEB', doneColour: '#3DD068',
  doneLight: '#1FA347', greenWhenDone: true, doneLevel: 0.7, doneTwinkle: 0.17, doneTwinkleSpeed: 0.8,
}
const S = SETTINGS
export const W = 300
// ponytail: the host gives a pane's width in columns and takes an Svg's in CSS pixels, and says nowhere how wide a
// column is. 8 px is a low guess from the live pane (39 columns, about 380 px across): too low only leaves air between
// the bar and its percentage, too high pushes the percentage into the card's border. Measure and set if it matters.
const COL_PX = 8
/** Columns of a card's row that are not the bar's: the border and padding each side (6), the gap (1), "100%" (4). */
const NOT_BAR_COLS = 11
/** The bar's drawn width in a pane `cols` columns wide: what the card's row has room for, the baked width at most. */
export const barWidth = (cols: number): number => Math.round(Math.max(120, Math.min(W, ((Number.isFinite(cols) ? cols : 0) - NOT_BAR_COLS) * COL_PX)))
/** A baked bar at another width: its own markup, scaled whole by its viewBox (nothing is baked again). */
export function sized(svg: string, width: number): { source: string; width: number; height: number } {
  const height = Math.round(S.track * width / W)
  return { source: width === W ? svg : svg.replace(`width="${W}" height="${S.track}" viewBox=`, `width="${width}" height="${height}" viewBox=`), width, height }
}
export const LOOP = 6               // seconds: a slot's cycle, the longest a patch lives, the baked loop (the playground's LIFE)
const LIFE = LOOP
const STEPS = 72                    // samples per loop of a running bar (12 a second); a finished one only twinkles
const STEPS_DONE = 36
const REF_COLS = 38                 // "patches at once" is a density: that many per REF_COLS columns of track
const FONT = "'Segoe UI', system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif"
const DONE_INK = '#0A2912'          // white fails on the bright green

export function hash(c: number, r: number, salt: number): number {
  let x = (Math.imul(c, 73856093) ^ Math.imul(r, 19349663) ^ Math.imul(salt, 83492791)) >>> 0
  x = Math.imul(x ^ (x >>> 13), 1274126177) >>> 0
  x = (x ^ (x >>> 16)) >>> 0
  return (x % 1000) / 1000
}
const mod = (n: number, m: number) => ((n % m) + m) % m
const lerp = (a: number, b: number, k: number) => a + (b - a) * k
/** Python's round(): a half goes to the even neighbour (make-bars.py sizes the pill with it). */
const roundEven = (v: number) => { const f = Math.floor(v); return v - f === 0.5 ? f + (f % 2) : Math.round(v) }
/** Smooth value noise, repeating every `px` in x and every `pt` in t. */
export function noise(x: number, y: number, t: number, px: number, pt: number, salt: number): number {
  const x0 = Math.floor(x), y0 = Math.floor(y), t0 = Math.floor(t), fx = x - x0, fy = y - y0, ft = t - t0
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), st = ft * ft * (3 - 2 * ft)
  const v = (i: number, j: number, k: number) => hash(mod(i, px) + 31 * mod(k, pt), j, salt)
  const plane = (k: number) => lerp(lerp(v(x0, y0, k), v(x0 + 1, y0, k), sx), lerp(v(x0, y0 + 1, k), v(x0 + 1, y0 + 1, k), sx), sy)
  return lerp(plane(t0), plane(t0 + 1), st)
}
export function smooth(v: number, lo: number, hi: number): number {
  if (hi <= lo) return v >= lo ? 1 : 0
  const k = Math.min(1, Math.max(0, (v - lo) / (hi - lo)))
  return k * k * (3 - 2 * k)
}
/** How far up or down (-1..1) a patch has strayed `t` seconds into its life. */
export function wander(slot: number, g: number, t: number): number {
  const u = t * 0.9 + hash(slot, g, 34) * 5, k = Math.floor(u), e = smooth(u - k, 0.3, 0.7)
  const a = hash(slot * 13 + 20, g * 64 + k, 33), b = hash(slot * 13 + 20, g * 64 + k + 1, 33)
  return (a + (b - a) * e - 0.5) * 2
}
/** The detail noise's speeds nearest the asked ones that close the loop, and how many lattice cells it repeats after. */
function periods() {
  const bx = Math.max(4, roundEven(S.drift * 0.67 * LOOP / S.detailScale)), driftB = bx * S.detailScale / LOOP
  const bt = Math.max(2, roundEven(S.evolve * 1.25 * LOOP)), evolveB = S.evolve > 0 ? bt / LOOP : 0
  return { bx, bt, driftB, evolveB }
}
const PER = periods()

export type Patch = { slot: number; R: number; amp: number; A: number; pts: { x: number; y: number; w: number }[] }
/** The patches alive at `time`: radius, strength, presence, and the head's place now and at a few earlier moments (the trail). K = 1: a slot repeats its one generation, so the loop closes. */
export function patches(time: number, worldCols: number, K = 1): Patch[] {
  const lead = S.drift * LIFE * (1 + 0.7 * S.speedVar)
  const nEdge = S.count * 1.6 * (1 - S.birthRate), nMid = S.count * 1.6 * S.birthRate * (worldCols + lead) / (0.8 * REF_COLS) * 0.32
  const out: Patch[] = [], n = Math.floor(0.5 + nEdge + nMid), pEdge = nEdge / Math.max(0.001, nEdge + nMid), top = S.rows - 1, steep = S.rows / 1.6, NT = S.trail > 0 ? 5 : 0
  for (let slot = 0; slot < n; slot++) {
    const brief = hash(slot, 2, 31) < S.deathRate, turns = brief ? Math.min(3, Math.max(1, Math.floor(1 / Math.max(0.15, S.lifetime)))) : 1, cycle = LIFE / turns
    const tt = time + hash(slot, 1, 31) * LIFE, gen = Math.floor(tt / cycle), tau = tt - gen * cycle, g = mod(gen, turns * K)
    const H = (k: number) => hash(slot * 13 + k, g, 32)
    const kind = brief ? 1 : H(1) < S.runoff ? 2 : 0, roam = H(11) < S.wander ? S.wanderAmount : 0
    let R = Math.max(0.8, S.patch * (1 + S.sizeVar * (H(2) - 0.5) * 1.4))
    const vx = S.drift * (1 + S.speedVar * (H(3) - 0.5) * 1.4)
    const mid = H(4) >= pEdge, x0 = mid ? H(5) * (worldCols + lead) - lead : -R - 2 * H(5), y0 = H(6) * top, d = H(7) < 0.5 ? -1 : 1
    let vy = 0, life = cycle
    if (kind === 1) { life = cycle * (0.55 + 0.4 * H(8)); if (H(9) < Math.min(1, S.vertical * 1.5)) vy = d * steep * S.vertical * (0.5 + H(10)) }
    if (kind === 2) vy = d * steep * (0.35 + S.vertical) * (0.6 + 0.8 * H(10))
    if (tau > life) continue
    const tq = Math.floor(tau * S.tick) / S.tick
    R = Math.max(1, Math.floor(0.5 + R * (mid ? 0.3 + 0.7 * smooth(tq, 0, 0.6) : 1) * (kind === 1 ? 0.4 + 0.6 * Math.min(1, (life - tq) / 0.9) : 1) * (1 + S.sizeVar * 0.35 * wander(slot + 7, g, tq * 0.6))))
    const A = Math.min(Math.min(1, tau / (mid ? 0.2 : 0.25)), Math.min(1, (life - tau) / (kind === 1 ? 0.9 : 0.6)))
    if (A <= 0) continue
    const pts: Patch['pts'] = []
    for (let j = 0; j <= NT; j++) {
      const t = tau - (j ? (j - 0.5) / NT * S.trail / Math.max(vx, 0.5) : 0)
      if (t < 0) break
      const ts = Math.floor(t * S.tick) / S.tick, back = j ? (j - 0.5) / NT : 0
      let x = x0 + vx * t
      const y = Math.floor(0.5 + y0 + vy * ts + (roam ? roam * wander(slot, g, ts) : 0))
      if (S.stepX) x = Math.floor(0.5 + x)
      pts.push({ x, y, w: j ? (1 - 0.5 * S.trailFade) * Math.exp(-back * (0.5 + 3 * S.trailFade)) * smooth(1 - back, 0, 0.3) : 1 })
    }
    out.push({ slot, R, amp: 0.75 + 0.25 * H(12), A, pts })
  }
  return out
}
/** The finished bar: nothing travels, no trails; an evenly lit field, each cell twinkling on its own. */
export function still(c: number, r: number, time: number): number {
  const turns = S.doneTwinkleSpeed > 0 ? Math.max(1, roundEven(S.doneTwinkleSpeed * (0.6 + 0.8 * hash(c, r, 7)) * LOOP)) : 0
  return Math.min(1, Math.max(0, S.doneLevel + S.doneTwinkle * Math.sin(6.2832 * (time * turns / LOOP + hash(c, r, 8)))))
}
/** The strength of the cell in column c, row r at `time`; `back` is how far the cell is behind the pill, in px. */
export function level(c: number, r: number, time: number, back: number, list: Patch[]): number {
  let a = 0, tail = 0
  for (const q of list) {
    const h0 = q.pts[0]!
    if (Math.abs(c - h0.x) > 2 * q.R + S.trail + 1) continue
    const bump = 1 - 0.5 * Math.hypot(c - h0.x, r - h0.y) / q.R
    if (bump > 0) { const own = hash(c + 57 * q.slot, r, 13) * 0.75; a = 1 - (1 - a) * (1 - q.amp * bump * smooth(q.A, own, own + 0.2)) }
    for (let j = 1; j < q.pts.length; j++) { const s = q.pts[j]!, near1 = 1 - Math.hypot(c - s.x, r - s.y) / q.R; if (near1 > 0) tail = Math.max(tail, q.amp * q.A * near1 * s.w) }
  }
  const b = noise((c - time * PER.driftB) / S.detailScale, r / (S.detailScale * 0.65), time * PER.evolveB, PER.bx, PER.bt, 12)
  const f = a + S.detail * (b - 0.5) * 0.5 + (hash(c, r, 5) - 0.5) * 0.14
  const cut = 1 - S.cover, halfOn = smooth(f, cut - S.soft, cut + S.soft), litOn = smooth(f, cut + 0.085 - S.soft, cut + 0.085 + S.soft)
  let v = S.rest + (S.half - S.rest) * halfOn + (S.lit - S.half) * litOn
  const hold = hash(c, r, 9) * 0.6
  v += (S.half - S.rest) * tail * smooth(tail, hold, hold + 0.15) * (1 - halfOn)
  const turns = S.noiseSpeed > 0 ? Math.max(1, roundEven(S.noiseSpeed * (0.6 + 0.8 * hash(c, r, 7)) * LOOP)) : 0
  v += S.noise * Math.sin(6.2832 * (time * turns / LOOP + hash(c, r, 8))) * (1 - halfOn)
  const near = S.far + (1 - S.far) * Math.exp(-Math.max(0, back) / Math.max(1, S.reach))
  return Math.min(1, Math.max(0, v * (0.75 + 0.25 * near + (near - 0.75 - 0.25 * near) * halfOn)))
}
/** A value as make-bars.py writes it: two decimals, no leading zero, no trailing zeros, "1" for one. */
export function fmt(v: number): string {
  const s = v.toFixed(2)
  if (s === '1.00') return '1'
  return (s.startsWith('0') ? s.slice(1) : s).replace(/0+$/, '') || '0'
}
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')

/** The bar: `pct` 0..100, `label` in the pill. Complete (100) is the green, still field. */
export function bakeBar(mode: Mode, pct: number, label: string): string {
  const H = S.track, cell = S.cell, pitch = S.cell + S.gap
  const p = Math.max(0, Math.min(100, Math.round(pct)))
  const complete = p >= 100, done = complete && S.greenWhenDone
  const colour = done ? (mode === 'dark' ? S.doneColour : S.doneLight) : mode === 'dark' ? S.accentDark : S.accentLight
  const track = mode === 'dark' ? '#FAF9F5" fill-opacity=".09' : '#141413" fill-opacity=".07'
  const w = roundEven(label.length * 6.5 + 26)                  // the host sets the type, so this is an estimate
  const x0 = Math.min(Math.max(W * p / 100 - w / 2, 0), W - w)
  const [edge, reachTo] = complete ? [W, W] : [x0 + 6, x0]
  const top = (H - (S.rows * cell + (S.rows - 1) * S.gap)) / 2
  const steps = complete ? STEPS_DONE : STEPS
  const lists = complete ? [] : Array.from({ length: steps }, (_, s) => patches(s * LOOP / steps, W / pitch))
  const cells: string[] = []
  for (let c = 0; c * pitch + 0.9 + cell <= edge; c++) {
    const x = c * pitch + 0.9
    for (let r = 0; r < S.rows; r++) {
      const vals = Array.from({ length: steps }, (_, s) => fmt(complete ? still(c, r, s * LOOP / steps) : level(c, r, s * LOOP / steps, reachTo - (x + cell), lists[s]!)))
      cells.push(`<rect x="${x.toFixed(1)}" y="${(top + r * pitch).toFixed(1)}" width="${cell}" height="${cell}" fill-opacity="${vals[0]}"><animate attributeName="fill-opacity" dur="${LOOP}s" repeatCount="indefinite" values="${[...vals, vals[0]].join(';')}"/></rect>`)
    }
  }
  const text = esc(label)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${text}, ${p}%">`
    + `<clipPath id="c"><rect width="${W}" height="${H}" rx="${H / 2}"/></clipPath><rect width="${W}" height="${H}" rx="${H / 2}" fill="${track}"/>`
    + `<g clip-path="url(#c)" fill="${colour}">${cells.join('')}</g>`
    + `<rect x="${x0.toFixed(1)}" width="${w}" height="${H}" rx="${H / 2}" fill="${colour}"/>`
    + `<text x="${(x0 + w / 2).toFixed(1)}" y="${(H / 2 + 4).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="11.5" font-weight="600" fill="${done ? DONE_INK : '#fff'}">${text}</text></svg>`
}

/** The same on a surface with no Svg (the terminal): twenty cells. */
export function barText(pct: number, label: string): string {
  const p = Math.max(0, Math.min(100, Math.round(pct))), on = Math.round(p / 5)
  return `[${'#'.repeat(on)}${'-'.repeat(20 - on)}] ${p}% ${label}`
}
