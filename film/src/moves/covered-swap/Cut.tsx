import React from 'react';
import { H, W } from '../../kit/stage';
import type { CutProps } from '../contract';
import { SWAP, coverAt } from './move.ts';

// (no sound of its own: the click that caused the page change is the sound of this cut)
const CoveredSwap: React.FC<CutProps> = ({ k, outgoing, incoming }) => {
  const shot = k < SWAP ? outgoing : incoming;
  return shot ? <div style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, transformOrigin: '50% 50%', transform: `scale(${coverAt(k).toFixed(5)})` }}>{shot}</div> : null;
};
export default CoveredSwap;
