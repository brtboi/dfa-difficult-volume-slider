import Phaser from 'phaser';
import { PALETTE } from '../ui/theme';
import { layout } from '../layout';
import type Bird from './Bird';

/**
 * Drag-and-release aiming.
 *
 * Deliberately NOT a Matter constraint: a spring makes the release impulse
 * depend on how the solver happens to settle, which is miserable to tune.
 * Here the bird is static while dragging and gets an explicit velocity on
 * release, so pull distance maps to launch speed exactly.
 */
export default class Slingshot {
  private readonly scene: Phaser.Scene;
  private readonly bands: Phaser.GameObjects.Graphics;
  private bird: Bird | null = null;
  private dragging = false;
  private enabled = true;

  /** Fired with the launched bird once the pouch is released. */
  onLaunch?: (bird: Bird) => void;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    // Over the slingshot, under the bird.
    this.bands = scene.add.graphics().setDepth(90);

    scene.input.on('pointerdown', this.handleDown, this);
    scene.input.on('pointermove', this.handleMove, this);
    scene.input.on('pointerup', this.handleUp, this);
  }

  /** Hand the sling a fresh bird to hold. */
  load(bird: Bird): void {
    this.bird = bird;
    bird.state = 'READY';
    bird.moveTo(layout.anchor.x, layout.anchor.y);
    bird.sync();
    this.draw();
  }

  /** Once the volume is set the run is over; stop accepting shots. */
  disable(): void {
    this.enabled = false;
    this.dragging = false;
    this.bands.clear();
    const bird = this.bird;
    this.bird = null;
    if (bird) {
      this.scene.tweens.add({
        targets: bird.sprite, alpha: 0, duration: 400,
        onComplete: () => bird.destroy(),
      });
    }
  }

  private handleDown(pointer: Phaser.Input.Pointer): void {
    const bird = this.bird;
    if (!this.enabled || !bird || bird.state !== 'READY') return;

    const d = Phaser.Math.Distance.Between(
      pointer.worldX, pointer.worldY, layout.anchor.x, layout.anchor.y,
    );
    if (d > layout.grabRadius) return;

    this.dragging = true;
    bird.state = 'DRAGGING';
    this.handleMove(pointer);
  }

  private handleMove(pointer: Phaser.Input.Pointer): void {
    const bird = this.bird;
    if (!this.enabled || !this.dragging || !bird) return;

    // Clamp the pull into a disc around the anchor.
    const dx = pointer.worldX - layout.anchor.x;
    const dy = pointer.worldY - layout.anchor.y;
    const dist = Math.hypot(dx, dy);
    const scale = dist > layout.maxPull ? layout.maxPull / dist : 1;

    bird.moveTo(layout.anchor.x + dx * scale, layout.anchor.y + dy * scale);
    bird.sync();
    this.draw();
  }

  private handleUp(): void {
    const bird = this.bird;
    if (!this.dragging || !bird) return;

    this.dragging = false;

    const dx = layout.anchor.x - bird.x;
    const dy = layout.anchor.y - bird.y;

    // A nudge too small to count: put it back rather than dribbling it.
    if (Math.hypot(dx, dy) < layout.u(12)) {
      bird.state = 'READY';
      bird.moveTo(layout.anchor.x, layout.anchor.y);
      bird.sync();
      this.draw();
      return;
    }

    bird.launch(dx * layout.launchK, dy * layout.launchK);
    this.bird = null;
    this.bands.clear();
    this.onLaunch?.(bird);
  }

  /** Bands from each prong tip to the pouch. */
  private draw(): void {
    const g = this.bands;
    g.clear();
    const bird = this.bird;
    if (!bird) return;

    g.lineStyle(layout.u(7), PALETTE.ink, 1);
    g.beginPath();
    g.moveTo(layout.forkL.x, layout.forkL.y);
    g.lineTo(bird.x, bird.y);
    g.moveTo(layout.forkR.x, layout.forkR.y);
    g.lineTo(bird.x, bird.y);
    g.strokePath();
  }

  destroy(): void {
    this.scene.input.off('pointerdown', this.handleDown, this);
    this.scene.input.off('pointermove', this.handleMove, this);
    this.scene.input.off('pointerup', this.handleUp, this);
    this.bands.destroy();
  }
}
