import { round2, GRAVITY_Y } from './config';

/**
 * Everything on screen is authored against a 720-unit-tall reference stage and
 * scaled to the real viewport, so the game fills the window edge to edge and
 * renders into a backing store at device resolution (no upscaled, soft text).
 *
 * Physics scales with it. If every length is multiplied by S and gravity is
 * too, trajectories stay geometrically similar, so the tuned feel survives any
 * window size. Only the aspect ratio needs a correction, since a wider window
 * makes the bar longer without making the stage taller - see `launchK`.
 */
export const REF_H = 720;
export const REF_W = 1280;

/**
 * Where the painted grass surface sits in background.png. The physics ground
 * is pinned to this so the bird lands on the grass rather than floating over
 * it or sinking into the soil.
 */
export const GRASS_Y = 525;

/** How far down the viewport that grass line should sit. */
export const GRASS_SCREEN_FRAC = 0.80;

/**
 * The reach the launch power was calibrated against, and the pull-to-speed
 * constant for it.
 *
 * Calibrated so a FULL draw lands at the far end of the track. Set it higher
 * and only a sliver of the draw is usable - everything past it sails off the
 * screen - which trains you to barely pull at all and makes every shot feel
 * flat and underpowered.
 */
const REF_REACH = 1240 - 122;
const REF_LAUNCH_K = 0.118;

export interface Layout {
  W: number;
  H: number;
  /** Scale from reference units to world units. */
  S: number;

  /** Background placement, scaled to cover the viewport. */
  bg: { x: number; y: number; w: number; h: number };

  groundY: number;
  groundBand: number;

  slingBaseX: number;
  slingW: number;
  slingH: number;
  anchor: { x: number; y: number };
  forkL: { x: number; y: number };
  forkR: { x: number; y: number };
  maxPull: number;
  grabRadius: number;
  /** Gravity-free travel, as a multiple of how far the bird was drawn back. */
  freeFlightRatio: number;
  launchK: number;
  gravityY: number;

  barLeft: number;
  barRight: number;
  barSpan: number;
  /** The trough is drawn wider than the value range so the knob, which is
   *  taller than the track, never hangs off either end. */
  barPad: number;
  barDrawLeft: number;
  barDrawRight: number;
  barDrawSpan: number;
  knobRadius: number;
  barCenterY: number;
  barHeight: number;
  barTop: number;

  birdRadius: number;
  birdDisplay: number;
  restSpeed: number;

  killPlane: { maxY: number; maxX: number; minX: number };

  /** Reference px -> world px. */
  u: (n: number) => number;
  /** Reference px -> a CSS font size string. */
  font: (n: number) => string;

  xToVolume: (x: number) => number;
  volumeToX: (v: number) => number;
  spansX: (x: number) => boolean;
}

export function computeLayout(W: number, H: number): Layout {
  // Cover, not fit: the background must reach every edge. The vertical term
  // is driven by where we want the grass line to land rather than by plain
  // cover, which is what pushes the whole scene down the frame.
  const S = Math.max(W / REF_W, (H * GRASS_SCREEN_FRAC) / GRASS_Y);
  const u = (n: number): number => n * S;

  // Never leave a gap at the top, and never above the bottom edge.
  let bgY = Math.min(0, H * GRASS_SCREEN_FRAC - GRASS_Y * S);
  if (bgY + REF_H * S < H) bgY = H - REF_H * S;

  const bg = { x: (W - REF_W * S) / 2, y: bgY, w: REF_W * S, h: REF_H * S };
  const groundY = bg.y + GRASS_Y * S;
  const groundBand = Math.max(H - groundY, u(40));

  const barHeight = u(18);
  // Floating just clear of the grass: close enough to read as lying on the
  // ground, high enough that its drop shadow separates it from the foliage.
  const barCenterY = groundY - barHeight / 2 - u(16);
  // Set back from the slingshot and capped in length, so the track occupies a
  // slice of the stage rather than spanning the whole width.
  const barLeft = u(470);
  const barRight = Math.min(W - u(120), barLeft + u(700));
  const barSpan = barRight - barLeft;
  // Fits inside the track's half-height so the knob nests in the groove
  // instead of its outline doubling up with the trough's cap.
  const knobRadius = u(9.5);
  const barPad = knobRadius + u(2);
  const barDrawLeft = barLeft - barPad;
  const barDrawRight = barRight + barPad;

  // Seated down inside the V, where the prongs converge, so the bird clearly
  // overlaps both and the near/far prong split reads as depth.
  const anchor = { x: u(122), y: groundY - u(148) };

  // Keep the far end of the bar reachable however wide the window is.
  // Range goes with velocity squared, so power goes with the square root.
  const launchK = REF_LAUNCH_K * Math.sqrt((barRight - anchor.x) / (REF_REACH * S));

  const xToVolume = (x: number): number =>
    round2(Math.min(1, Math.max(0, (x - barLeft) / barSpan)) * 100);
  const volumeToX = (v: number): number =>
    barLeft + (Math.min(100, Math.max(0, v)) / 100) * barSpan;

  return {
    W, H, S, bg,
    groundY, groundBand,
    slingBaseX: u(120),
    slingW: u(63),
    slingH: u(200),
    anchor,
    forkL: { x: u(101), y: groundY - u(188) },
    forkR: { x: u(143), y: groundY - u(188) },
    maxPull: u(165),
    grabRadius: u(90),
    freeFlightRatio: 1.5,
    launchK,
    gravityY: GRAVITY_Y * S,
    barLeft, barRight, barSpan, barCenterY, barHeight,
    barPad, barDrawLeft, barDrawRight,
    barDrawSpan: barDrawRight - barDrawLeft,
    knobRadius,
    barTop: barCenterY - barHeight / 2,
    birdRadius: u(18),
    birdDisplay: u(42),
    restSpeed: 0.25 * S,
    killPlane: { maxY: H + u(180), maxX: W + u(160), minX: -u(100) },
    u,
    font: (n: number): string => `${Math.round(n * S)}px`,
    xToVolume, volumeToX, spansX: (x) => x >= barLeft && x <= barRight,
  };
}

/** Device-pixel viewport size, capped so huge DPRs do not blow up the canvas. */
export function viewportSize(): { W: number; H: number } {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  return {
    W: Math.max(640, Math.round(window.innerWidth * dpr)),
    H: Math.max(400, Math.round(window.innerHeight * dpr)),
  };
}

/** The active layout, replaced on resize. */
export let layout: Layout = computeLayout(REF_W, REF_H);

export function setLayout(l: Layout): void {
  layout = l;
}
