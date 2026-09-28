/**
 * One palette and one typeface for the whole game.
 *
 * Everything is pulled from the sprite art: warm wood browns, the bird's
 * crimson, cartoon-weight outlines. The stage itself is background.png, so
 * only the slider chrome and type are coloured here.
 */

export const PALETTE = {
  // The cartoon outline weight that every sprite already uses
  ink: 0x3e2a18,
  inkSoft: 0x8a7256,

  // Slider
  trackBg: 0xf6ecd8,
  trackInner: 0xe3d2b2,
  fillTop: 0xffc957,
  fillBottom: 0xef8f1c,
  knobFace: 0xfff8ea,

  // Semantics
  goal: 0xd9264f,
  win: 0x2f9e5f,
  shadow: 0x3e2a18,
} as const;

export const FONT = '"Fredoka", system-ui, -apple-system, sans-serif';

/** Phaser text colours want CSS strings. */
export const css = (hex: number): string => `#${hex.toString(16).padStart(6, '0')}`;
