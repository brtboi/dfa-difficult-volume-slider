import Phaser from 'phaser';
import { IMAGES, AUDIO } from '../assets';

/** Loads the assets, then waits for the gesture that unlocks audio. */
export default class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      console.error(
        `[assets] failed to load "${file.key}" from ${file.url} — ` +
        'remove it from src/assets.ts or add the file.',
      );
    });

    for (const [key, path] of IMAGES) this.load.image(key, path);
    for (const [key, paths] of AUDIO) this.load.audio(key, paths);
  }

  create(): void {
    // No start screen. Audio cannot begin until the player interacts, so
    // GameScene unlocks the AudioContext on the first pointer press instead.
    this.scene.start('Game');
    this.scene.launch('UI');
  }
}
