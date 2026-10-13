import React from 'react';
import { Easing, interpolate, useCurrentFrame } from 'remotion';
import { circlePath, Box } from './chalkPath';

/** Draws on from frame `from` over `dur` frames. `dark`: white chalk for dark screens, red otherwise.
 *  Lives in frame coordinates (not inside the scaled screen), so its stroke width is constant while the camera moves. */
export const ChalkMark: React.FC<{ box: Box; from: number; dur?: number; seed?: number; dark?: boolean; width: number; height: number }> = ({ box, from, dur = 14, seed = 1, dark = false, width, height }) => {
  const frame = useCurrentFrame();
  const p = circlePath(box, seed);
  const k = interpolate(frame, [from, from + dur], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.3, 0, 0.2, 1) });
  const id = `chalk-${seed}`;
  return (
    <svg width={width} height={height} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
      <defs>
        {/* chalk: the edge is broken up by noise, and a grain mask eats holes into the stroke.
            userSpaceOnUse: the noise is pinned to the frame, so it does not swim as the stroke's bounding box grows. */}
        <filter id={id} filterUnits="userSpaceOnUse" x={0} y={0} width={width} height={height}>
          <feTurbulence type="fractalNoise" baseFrequency="0.35" numOctaves="2" seed={seed} result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="5" xChannelSelector="R" yChannelSelector="G" result="d" />
          <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="2" seed={seed + 3} result="g" />
          <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed={seed + 7} result="c" />
          {/* fine grain plus slow patches where the chalk skips; then a hard threshold into holes */}
          <feComposite in="g" in2="c" operator="arithmetic" k1="0" k2="0.65" k3="0.35" k4="0" result="m" />
          <feColorMatrix in="m" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -8 4.9" result="holes" />
          <feComposite in="d" in2="holes" operator="in" />
        </filter>
      </defs>
      {/* pathLength=1: the dash is measured along the real curve, so the draw-on ends exactly at the end */}
      <g filter={`url(#${id})`} fill="none" stroke={dark ? '#f5f5f0' : '#d8352a'} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={1} strokeDashoffset={1 - k} opacity={k > 0 ? 1 : 0}>
        <path d={p.d} pathLength={1} strokeWidth={15} opacity={0.3} />{/* the dusty edge */}
        <path d={p.d} pathLength={1} strokeWidth={9} />{/* the core */}
      </g>
    </svg>
  );
};
