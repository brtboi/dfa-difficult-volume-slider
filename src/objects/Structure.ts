// STUB - plan.md step 6.
// Data-driven fort layouts built on the bar's top surface between FORT_LEFT and
// FORT_RIGHT. Planks carry per-material density and hp from MATERIALS and are
// removed with a fade at 0 hp.

import type { MaterialName } from '../config';

export interface PlankSpec {
  t: 'plank';
  x: number; y: number; w: number; h: number;
  mat: MaterialName;
  angle?: number;
}

export interface PigSpawnSpec {
  t: 'pig';
  x: number; y: number;
}

export type FortPiece = PlankSpec | PigSpawnSpec;
export type Fort = readonly FortPiece[];

export default class Structure {}
