import { round2 } from './config';

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

/** The reach the launch power was originally calibrated against. */
const REF_REACH = 1240 - 122;
const REF_LAUNCH_K = 0.19;

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
  // Cover, not fit: the background must reach every edge, and everything else
  // scales with it so the art stays in proportion to the painted scene.
  const S = Math.max(W / REF_W, H / REF_H);
  const u = (n: number): number => n * S;

  const bg = { x: (W - REF_W * S) / 2, y: (H - REF_H * S) / 2, w: REF_W * S, h: REF_H * S };
  const groundY = bg.y + GRASS_Y * S;
  const groundBand = Math.max(H - groundY, u(40));

  const barHeight = u(22);
  // Resting on the grass: the track's bottom edge sits on the ground line, so
  // the bar reads as lying on the ground rather than floating over it.
  const barCenterY = groundY - barHeight / 2;
  // Close enough to the slingshot that a short lob still lands on the track.
  // Push this right and the low end of the slider becomes unreachable: the
  // bird drops onto the grass before the bar begins.
  const barLeft = u(240);
  const barRight = W - u(40);
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
    launchK,
    gravityY: 1.4 * S,
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
