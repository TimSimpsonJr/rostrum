// The phases of a long step (prepare, build) as the panel's bar shows them: a label in the pill and one number for the
// whole step. The build's phases are the design's six, after `making`: new film pieces being made in the chat before
// anything is staged, which may last hours, so it holds a small fixed place at the foot of the bar (not 0: the bar
// reads as begun) and the six share the rest in the proportions they had. Checking has up to three passes; rendering
// carries a true fraction from Remotion. The spans are fixed shares of the bar, so the number only ever grows.
export const BUILD = {
  making: { label: 'Making new pieces', from: 3, to: 5 },
  shotlist: { label: 'Writing the shot list', from: 5, to: 15 },
  measure: { label: 'Measuring the screens', from: 15, to: 24 },
  staging: { label: 'Staging shots', from: 24, to: 48 },
  checking: { label: 'Checking frames', from: 48, to: 72 },
  sweep: { label: 'Final check for private data', from: 72, to: 76 },
  render: { label: 'Rendering', from: 76, to: 100 },
};
export const PREPARE = {
  scrub: { label: 'Cleaning the recording', from: 0, to: 40 },
  gestures: { label: 'Reading your gestures', from: 40, to: 50 },
  transcribe: { label: 'Listening to the narration', from: 50, to: 100 },
};
export const PASSES = 3;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** { phase, label, pct } for a phase. `extra.pass` (checking, 1..3) and `extra.fraction` (render, 0..1) move inside the phase's span. */
export function progressOf(phase, extra = {}) {
  const p = Object.hasOwn(BUILD, phase) ? BUILD[phase] : Object.hasOwn(PREPARE, phase) ? PREPARE[phase] : null;
  if (!p) throw new Error(`unknown phase ${String(phase).slice(0, 20)}`);
  if (phase === 'checking') {
    const pass = clamp(Math.round(Number(extra.pass) || 1), 1, PASSES);
    return { phase, label: `${p.label} ${pass}/${PASSES}`, pct: Math.round(p.from + (p.to - p.from) * (pass - 1) / PASSES) };
  }
  if (phase === 'render') {
    const f = clamp(Number(extra.fraction) || 0, 0, 1);
    return { phase, label: f >= 1 ? 'Built' : p.label, pct: Math.round(p.from + (p.to - p.from) * f) };
  }
  return { phase, label: p.label, pct: p.from };
}
