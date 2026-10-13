// A recording with pauses is a list of segments of wall-clock time. Everything downstream (the manifest, the pointer
// path, the gestures, the microphone's start) runs on one gap-free clock: the time inside a pause is left out, and
// what comes after moves back by the pauses before it. The microphone take already has no gaps (the recorder pauses
// it), so collapsing the events puts the two clocks back together.
/** The clock function for `segments` ([{ from, to }], ms; `to` null = open): t -> t on the gap-free clock, or null inside a gap. */
export function collapse(segments) {
  const s = [...segments].filter((x) => Number.isFinite(x?.from)).sort((a, b) => a.from - b.from);
  const gaps = [];
  for (let i = 1; i < s.length; i++) if (Number.isFinite(s[i - 1].to) && s[i].from > s[i - 1].to) gaps.push({ from: s[i - 1].to, to: s[i].from });
  return (t) => {
    let cut = 0;
    for (const g of gaps) {
      if (t >= g.to) cut += g.to - g.from;
      else if (t > g.from) return null;
    }
    return t - cut;
  };
}

/** A recording the recorder says was resumed from `pauses` pauses needs that many gaps to take out: at least
 *  pauses + 1 segments, each with a start, all but the last closed. True when what arrived does not account for
 *  them, so the recording must not be read as one stretch (what was done during a pause would be kept). */
export function pausesMissing(pauses, segments) {
  if (!(pauses > 0)) return false;
  if (!Array.isArray(segments) || segments.length < pauses + 1) return true;
  return !segments.every((s, i) => Number.isFinite(s?.from) && (Number.isFinite(s.to) || (i === segments.length - 1 && s.to === null)));
}

/** The events on the gap-free clock, those inside a gap dropped. */
export function collapseEvents(events, segments) {
  const f = collapse(segments), out = [];
  for (const e of events) { const t = f(e.timestamp); if (t !== null) out.push({ ...e, timestamp: t }); }
  return out;
}
