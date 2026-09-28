/**
 * Tuning constants in reference space (a 1280x720 stage).
 *
 * Anything positional lives in src/layout.ts, which scales this reference
 * stage to the real viewport. No magic numbers anywhere else.
 */

export const FORT_LEFT = 400;
export const FORT_RIGHT = 1200;

// --- Physics ----------------------------------------------------------------
/**
 * World gravity in reference units; layout scales it with the stage.
 *
 * 1.4 is the original value. Lowering it stretches the same arc over more
 * time, which reads as sluggish; raising it speeds everything up. Launch
 * power has to move with it (range goes as v^2/g) or the reachable band
 * shifts - see REF_LAUNCH_K in layout.ts.
 */
export const GRAVITY_Y = 1.4;

export interface BodySpec {
  radius: number;
  restitution: number;
  friction: number;
  frictionAir: number;
  density: number;
}

export const BIRD: Readonly<BodySpec> = {
  radius: 18,
  // Low bounce and high friction on purpose: the bird should stop close to
  // where it lands. Difficulty belongs in the aiming, not in an unpredictable
  // roll along the bar, which otherwise makes the low end unreachable.
  restitution: 0.12,
  friction: 0.9,
  // Very little drag. At 0.01 the bird bled roughly half its apex height on
  // the way up, which made every shot feel flat and heavy; a projectile's
  // apex is fixed at a quarter of its range, and drag was the only thing
  // stopping it reaching that.
  frictionAir: 0.002,
  density: 0.004,
};

export interface PigSpec extends BodySpec {
  maxHp: number;
  damageThreshold: number;
  damageScale: number;
}

export const PIG: Readonly<PigSpec> = {
  radius: 16,
  restitution: 0.3,
  friction: 0.5,
  frictionAir: 0.01,
  density: 0.0015,
  maxHp: 100,
  damageThreshold: 4,
  damageScale: 14,
};

export interface Material {
  density: number;
  hp: number;
  color: number;
  stroke: number;
}

// Wood only for now. Add 'stone' | 'ice' back to MaterialName and this record
// (plus their sprite keys in assets.ts) when those textures exist.
export type MaterialName = 'wood';

export const MATERIALS: Readonly<Record<MaterialName, Material>> = {
  wood: { density: 0.0012, hp: 60, color: 0xb5793a, stroke: 0x8a5626 },
};

export const REST_ANGULAR_SPEED = 0.05;
export const REST_FRAMES = 30;
export const MIN_FLIGHT_FRAMES = 10;

// --- Round rules ------------------------------------------------------------
export const BIRDS_PER_ROUND = 4;
export const BONUS_BIRDS_ALL_PIGS = 2;
export const NEXT_BIRD_DELAY_MS = 1200;
export const DEBRIS_CLEAR_MS = 1500;
export const DEBRIS_SWEEP_MS = 500;

// --- Audio ------------------------------------------------------------------
export const VOLUME_RAMP_S = 0.08;
export const DEFAULT_VOLUME = 50;

// --- Goal ------------------------------------------------------------------
/** Volume is tracked and compared at this many decimal places. */
export const VOLUME_DP = 2;
/** How close counts as a hit, in percentage points. */
export const GOAL_TOLERANCE = 0.5;
// The goal always sits past the midpoint, beyond the fort.
export const GOAL_MIN = 55;
export const GOAL_MAX = 92;

/**
 * Where the fort stands, as a percentage of the track. Always before 30%,
 * and kept to the far end of that window: nearer the slingshot it sits under
 * the trajectory's apex, where even a flat shot sails over it.
 */
export const FORT_MIN = 21;
export const FORT_MAX = 28;

/** Round to the displayed precision. All comparisons use this. */
export const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Always two decimals, e.g. "7.40". */
export const fmt = (n: number): string => n.toFixed(VOLUME_DP);

// --- Debug / feature flags --------------------------------------------------
export const DEBUG_PHYSICS = false;
export const SHOW_GHOST_TRAIL = false;

// --- Stage ------------------------------------------------------------------
export const BACKGROUND = '#fdf8ef';

