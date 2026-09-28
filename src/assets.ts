/**
 * Asset manifest — only files that actually exist in public/assets/.
 *
 * Add an entry here when you add the file. Anything listed but absent will
 * 404 and log a load error, so keep this in sync with the folder.
 */

export type ImageKey =
  | 'bird' | 'bird_fly' | 'bird_hit'
  | 'pig' | 'pig_hurt'
  | 'slingshot_left' | 'slingshot_right'
  | 'background' | 'wood' | 'wood_beam' | 'wood_beam_damaged';

// Music only — no SFX for now.
export type AudioKey = 'theme';

export type AssetKey = ImageKey | AudioKey;

export const IMAGES: ReadonlyArray<readonly [ImageKey, string]> = [
  // key          path                              size
  ['bird',       'assets/sprites/bird.png'],       // 72x69,  on the sling
  ['bird_fly',   'assets/sprites/bird_fly.png'],   // 72x72,  in flight
  ['bird_hit',   'assets/sprites/bird_hit.png'],   // 72x72,  after impact
  ['pig',        'assets/sprites/pig.png'],        // 64x64
  ['pig_hurt',   'assets/sprites/pig_hurt.png'],   // 64x63,  low-HP swap
  ['slingshot_left',  'assets/sprites/slingshot_left.png'],   // 85x540, near prong
  ['slingshot_right', 'assets/sprites/slingshot_right.png'],  // 86x540, far prong
  ['background', 'assets/sprites/background.png'], // 1280x720, grass at y=525
  ['wood',       'assets/sprites/wood.png'],       // 500x390 ATLAS, see note
  ['wood_beam',  'assets/sprites/wood_beam.png'],           // 169x21, atlas frame 15
  ['wood_beam_damaged', 'assets/sprites/wood_beam_damaged.png'], // 169x21, atlas frame 18
];

/** Played through the SFX gain on launch; loaded by VolumeController. */
export const SFX_FLY_URL = 'assets/audio/angry-birds-flying-sound.mp3';

export const AUDIO: ReadonlyArray<readonly [AudioKey, string[]]> = [
  ['theme', ['assets/audio/theme.mp3']],
];

export const THEME_URL = 'assets/audio/theme.mp3';

/**
 * bird_fly.png and bird_hit.png are sliced out of the four-pose sheet
 * bird_angry.png, which is kept as the source art but is not loaded.
 *
 * NOTE: wood.png is a sprite ATLAS (a sheet of planks, beams, squares, circles
 * and triangles), not a tileable texture. Step 6 must slice frames out of it
 * rather than stretching the whole sheet across a plank body.
 */
