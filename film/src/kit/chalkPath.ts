export type Box = { x: number; y: number; w: number; h: number };
const rnd = (seed: number, i: number) => { const x = Math.sin(seed * 9301 + i * 49297) * 233280; return x - Math.floor(x); };

/** An ellipse round `box`, drawn by hand: radius wobble, a start that overshoots its end, never inside the box. */
export function circlePath(box: Box, seed: number, pad = 18) {
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  const rx = (box.w / 2) * Math.SQRT2 + pad, ry = (box.h / 2) * Math.SQRT2 + pad; // the ellipse through the corners, plus air
  const N = 48, turn = 1.08; // 8% past a full turn: the pen overlaps where it began
  const start = -Math.PI * (0.55 + 0.2 * rnd(seed, 0));
  const points: [number, number][] = [];
  for (let i = 0; i <= N; i++) {
    const k = i / N, a = start + k * turn * 2 * Math.PI;
    // slow wobble: random values every 8 points, eased between, so the hand wavers without kinks (never below 1 = the box corners)
    const j = Math.floor(i / 8), f = (i % 8) / 8, s = f * f * (3 - 2 * f);
    const wob = 1 + 0.08 * (rnd(seed, 10 + j) * (1 - s) + rnd(seed, 11 + j) * s) + 0.06 * k; // drifting outward
    points.push([cx + rx * wob * Math.cos(a), cy + ry * wob * Math.sin(a)]);
  }
  // a smooth curve through the midpoints, so the stroke has no facets
  const f1 = (n: number) => n.toFixed(1), mid = (i: number) => `${f1((points[i][0] + points[i + 1][0]) / 2)} ${f1((points[i][1] + points[i + 1][1]) / 2)}`;
  let d = `M${f1(points[0][0])} ${f1(points[0][1])} L${mid(0)}`;
  for (let i = 1; i < N; i++) d += ` Q${f1(points[i][0])} ${f1(points[i][1])} ${mid(i)}`;
  d += ` L${f1(points[N][0])} ${f1(points[N][1])}`;
  let length = 0;
  for (let i = 1; i < points.length; i++) length += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  return { d, points, length };
}
