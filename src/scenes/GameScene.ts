import Phaser from 'phaser';
import { DEFAULT_VOLUME, NEXT_BIRD_DELAY_MS, GOAL_MIN, GOAL_MAX, GOAL_TOLERANCE, round2, fmt } from '../config';
import { layout } from '../layout';
import SliderBar from '../objects/SliderBar';
import Bird, { POSE } from '../objects/Bird';
import Slingshot from '../objects/Slingshot';
import VolumeController, { getAudio } from '../audio/VolumeController';
import type { CollisionPair } from '../util/impact';
import type { HudState } from './UIScene';

/**
 * Slingshot -> bird -> bar -> volume. Pigs and forts are deliberately absent
 * for now; this is the core loop on its own.
 */
export default class GameScene extends Phaser.Scene {
  private bar!: SliderBar;
  private sling!: Slingshot;
  private audio!: VolumeController;
  private bird: Bird | null = null;

  private goal = 0;
  private solved = false;

  constructor() {
    super('Game');
  }

  create(): void {
    this.buildWorld();

    this.bar = new SliderBar(this, DEFAULT_VOLUME);
    this.audio = getAudio();
    this.audio.setVolume(this.bar.volume);

    // With no start screen there is no gesture to unlock audio on, so the
    // first pointer press anywhere - which will be the first drag - doubles
    // as it. Browsers keep the AudioContext suspended until then.
    this.input.once('pointerdown', () => { void this.audio.unlock(); });

    this.newGoal();

    this.sling = new Slingshot(this);
    this.sling.onLaunch = (bird) => {
      this.bird = bird;
      this.audio.playSfx('fly');
    };

    this.wireCollisions();
    this.loadBird();
  }

  override update(): void {
    const bird = this.bird;
    if (!bird) return;

    bird.sync();
    if (bird.state !== 'FLYING') return;

    if (bird.outOfBounds()) {
      this.retire(bird, false);
      return;
    }
    if (bird.checkSettled()) {
      bird.state = 'SETTLED';
      const onBar = bird.isTouching(this.bar.body.id) && layout.spansX(bird.x);
      if (onBar) this.commit(bird);
      this.retire(bird, onBar);
    }
  }

  /** Dev-only probe for the calibration and goal harnesses. */
  debugBird(): {
    x: number; y: number; state: string; pose: string;
    vol: number; goal: number; solved: boolean;
  } {
    const b = this.bird;
    const common = { vol: this.bar.volume, goal: this.goal, solved: this.solved };
    if (!b) return { x: -1, y: -1, state: 'NONE', pose: '-', ...common };
    return { x: b.x, y: b.y, state: b.state, pose: b.sprite.texture.key, ...common };
  }

  /** Dev-only: audio graph status. */
  debugAudio(): ReturnType<VolumeController['status']> {
    return this.audio.status();
  }

  /** Dev-only: set the displayed volume without judging it. */
  debugSetVolume(v: number): void {
    this.bar.setVolume(v);
    this.emitHud();
  }

  /** Dev-only: resolve a landing at an exact x, bypassing the physics. */
  debugLandAt(x: number): void {
    this.applyLanding(x);
  }

  // --- world ---------------------------------------------------------------

  private buildWorld(): void {
    const L = layout;
    this.add.image(L.bg.x, L.bg.y, 'background')
      .setOrigin(0, 0)
      .setDisplaySize(L.bg.w, L.bg.h)
      .setDepth(0);

    // Open the top so high arcs are not bounced off a ceiling.
    this.matter.world.setBounds(
      0, -L.u(600), L.W, L.H + L.u(600),
      L.u(64), true, true, false, true,
    );

    this.matter.add.rectangle(
      L.W / 2, L.groundY + L.groundBand / 2, L.W, L.groundBand,
      { isStatic: true, label: 'ground', friction: 0.9 },
    );

    this.buildSlingshot();
  }

  /**
   * Two real half-sprites rather than one image, so the bird (depth 100) can
   * sit *between* the prongs: the left half draws over it, the right half
   * behind it. They meet at slingBaseX, each anchored to its inner edge.
   *
   * These are separate files on purpose - setCrop on a single image shifts
   * the visible region when the origin is not top-left, which silently
   * swapped the halves.
   */
  private buildSlingshot(): void {
    const L = layout;
    const halfW = L.slingW / 2;

    this.add.image(L.slingBaseX, L.groundY, 'slingshot_right')
      .setOrigin(0, 1)
      .setDisplaySize(halfW, L.slingH)
      .setDepth(80);    // far prong, behind the bird

    this.add.image(L.slingBaseX, L.groundY, 'slingshot_left')
      .setOrigin(1, 1)
      .setDisplaySize(halfW, L.slingH)
      .setDepth(110);   // near prong, in front of it
  }

  /**
   * One world-level listener that feeds the bird's contact set. Cheaper than
   * per-body handlers, and the bird needs to know what it is *resting on*,
   * not just what it hit.
   */
  private wireCollisions(): void {
    const forEachBirdPair = (
      pairs: CollisionPair[],
      fn: (bird: Bird, otherId: number) => void,
    ): void => {
      const bird = this.bird;
      if (!bird) return;
      for (const { bodyA, bodyB } of pairs) {
        if (bodyA.id === bird.body.id) fn(bird, bodyB.id);
        else if (bodyB.id === bird.body.id) fn(bird, bodyA.id);
      }
    };

    this.matter.world.on('collisionstart', (e: { pairs: CollisionPair[] }) => {
      forEachBirdPair(e.pairs, (bird, id) => {
        bird.addContact(id);
        // First thing it touches after launch: swap to the impact pose.
        if (bird.state === 'FLYING') bird.setPose(POSE.landed);
      });
    });
    this.matter.world.on('collisionend', (e: { pairs: CollisionPair[] }) => {
      forEachBirdPair(e.pairs, (bird, id) => bird.removeContact(id));
    });
  }

  // --- round flow ----------------------------------------------------------

  private loadBird(): void {
    const bird = new Bird(this, layout.anchor.x, layout.anchor.y);
    this.bird = bird;
    this.sling.load(bird);
  }

  /** The target for the run, never close enough to the starting volume to be free. */
  private newGoal(): void {
    do {
      this.goal = round2(GOAL_MIN + Math.random() * (GOAL_MAX - GOAL_MIN));
    } while (Math.abs(this.goal - this.bar.volume) <= GOAL_TOLERANCE);

    this.bar.setGoal(this.goal);
    this.emitHud();
  }

  /**
   * Current HUD state. UIScene pulls this once on create: both scenes start
   * in the same tick, so an event emitted here during create() would fire
   * before UIScene has subscribed.
   */
  hudState(): HudState {
    return { volume: this.bar.volume, goal: this.goal };
  }

  private emitHud(message?: string, won = false): void {
    this.events.emit('hud', {
      ...this.hudState(),
      ...(message !== undefined ? { message } : {}),
      won,
    });
  }

  private commit(bird: Bird): void {
    this.applyLanding(bird.x);
  }

  /** Resolve a landing at world x: set the volume, then judge it. */
  private applyLanding(x: number): void {
    const v = this.bar.setVolume(layout.xToVolume(x));
    this.audio.setVolume(v);
    this.bar.flash();

    const off = Math.abs(v - this.goal);

    if (off <= GOAL_TOLERANCE) {
      this.solved = true;
      this.emitHud(`${fmt(v)}%  \u2014  volume set.`, true);
      this.cameras.main.flash(260, 120, 220, 150);
      // Drop our handle too: disable() destroys any bird still on the sling,
      // and update() would go on syncing a destroyed sprite.
      this.sling.disable();
      this.bird = null;
      return;
    }

    this.emitHud(`${fmt(v)}%  \u2014  off by ${fmt(off)}%`);
  }

  /** Clear the spent bird and reload the sling. */
  private retire(bird: Bird, landed: boolean): void {
    bird.state = 'SPENT';
    this.bird = null;

    const delay = landed ? NEXT_BIRD_DELAY_MS : NEXT_BIRD_DELAY_MS * 0.6;
    this.tweens.add({
      targets: bird.sprite,
      alpha: 0,
      duration: 280,
      delay: delay - 280,
      onComplete: () => {
        bird.destroy();
        // Once the goal is met the volume is set; stop handing out birds.
        if (!this.solved) this.loadBird();
      },
    });
  }
}
