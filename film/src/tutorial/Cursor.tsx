// The film's one cursor. It lives on the frame, above the camera, so its size never changes; where it goes is
// cursorPath.ts. At rest it drifts a hair (nothing rests); on each click it presses.
import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { EASE, pressEnv, tw, wander } from '../kit/ease';
import { Pointer } from '../kit/Pointer';
import { Move, Stop, cursorAt } from './cursorPath';

export { cursorAt } from './cursorPath';
export type { Move, Stop } from './cursorPath';

/** `clicks`: seconds at which it presses. `holds`: [from, to] seconds over which it stays pressed (a drag). */
export const Cursor: React.FC<{ start: Stop; moves: Move[]; clicks: number[]; holds?: [number, number][] }> = ({ start, moves, clicks, holds = [] }) => {
  const frame = useCurrentFrame(), t = frame / useVideoConfig().fps;
  const p = cursorAt(start, moves, frame), w = wander(t, 3, 2);
  return <Pointer x={p.x + w.x} y={p.y + w.y} press={Math.max(0, ...clicks.map((c) => pressEnv(t, c)), ...holds.map(([a, b]) => tw(t, a, a + 0.1, EASE.stroke) * (1 - tw(t, b, b + 0.27))))} />;
};
