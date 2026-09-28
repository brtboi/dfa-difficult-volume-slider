import Phaser from 'phaser';
import { DEBUG_PHYSICS, BACKGROUND } from './config';
import { computeLayout, viewportSize, setLayout, layout } from './layout';
import BootScene from './scenes/BootScene';
import GameScene from './scenes/GameScene';
import UIScene from './scenes/UIScene';

// Canvas text does not trigger @font-face loading, and Phaser measures and
// caches a string the moment it is created - a face that arrives late renders
// in the fallback and never reflows. So force the fetch, then wait.
await Promise.all(
  ['400', '500', '600', '700'].map((w) => document.fonts.load(`${w} 16px Fredoka`)),
);
await document.fonts.ready;

const { W, H } = viewportSize();
setLayout(computeLayout(W, H));

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  // The game size is the viewport in *device* pixels, so the backing store
  // matches the screen and text is rendered sharp rather than upscaled.
  // FIT with a matching aspect ratio fills the window with no letterboxing.
  width: W,
  height: H,
  backgroundColor: BACKGROUND,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  render: { antialias: true, roundPixels: false },
  physics: {
    default: 'matter',
    matter: {
      gravity: { x: 0, y: layout.gravityY },
      enableSleeping: true,
      debug: DEBUG_PHYSICS,
    },
  },
  scene: [BootScene, GameScene, UIScene],
};

const game = new Phaser.Game(config);

// Re-lay-out on resize. Geometry is baked into the bodies at create() time,
// so the cheapest correct response is to rebuild the scenes.
let resizeTimer: ReturnType<typeof setTimeout> | undefined;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const next = viewportSize();
    setLayout(computeLayout(next.W, next.H));
    game.scale.resize(next.W, next.H);
    game.scene.stop('UI');
    game.scene.stop('Game');
    game.scene.start('Game');
    game.scene.start('UI');
    // Gravity lives on the shared engine, so update it after the restart.
    game.scene.getScene('Game').matter.world.setGravity(0, layout.gravityY);
  }, 180);
});

if (import.meta.env.DEV) {
  (window as unknown as { __game: Phaser.Game }).__game = game;
}

export default game;
