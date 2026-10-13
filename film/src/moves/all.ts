// Every move the film can mount: the library's registry (index.ts, generated, tracked) joined with the synced
// tutorial's one-offs (../oneoffs/index.ts, generated, gitignored; empty when none is synced). The film imports
// from here; node never does (it reads the pure sides through tools/moves.mjs).
import type React from 'react';
import type { MoveModule } from './contract';
import * as lib from './index';
import * as one from '../oneoffs/index';

export const PURE: Record<string, MoveModule> = { ...lib.PURE, ...one.PURE };
export const MOVES: Record<string, React.FC<any>> = { ...lib.MOVES, ...one.MOVES };
export const CUTS: Record<string, React.FC<any>> = { ...lib.CUTS, ...one.CUTS };
export const STAGES: Record<string, React.FC<any>> = { ...lib.STAGES, ...one.STAGES };
export const moveOf = (name: string): MoveModule | null => PURE[name] ?? null;
