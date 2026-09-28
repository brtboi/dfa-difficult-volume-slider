import Phaser from 'phaser';
import { BIRD, REST_ANGULAR_SPEED, REST_FRAMES, MIN_FLIGHT_FRAMES } from '../config';
import { layout } from '../layout';

export type BirdState = 'READY' | 'DRAGGING' | 'FLYING' | 'SETTLED' | 'SPENT';

/**
 * Between the two halves of the slingshot: the near (left) prong draws over
 * the bird, the far (right) prong behind it.
 */
const DEPTH_BIRD = 100;

/** Pose per state: calm in the pouch, furious in flight, winded on impact. */
export const POSE = {
  ready: 'bird',
  flying: 'bird_fly',
  landed: 'bird_hit',
} as const;

/**
 * A launchable bird: a Matter circle plus an image kept in sync with it.
 *
 * Body and sprite are separate on purpose. Phaser's Matter.Sprite couples
 * display scale to body scale, which makes "36px body, 42px art" awkward to
 * express; syncing manually costs three lines and stays predictable.
 */
export default class Bird {
  readonly body: MatterJS.BodyType;
  readonly sprite: Phaser.GameObjects.Image;

  state: BirdState = 'READY';

  private readonly scene: Phaser.Scene;
  /** Matter body ids currently in contact, maintained by GameScene. */
  private readonly contacts = new Set<number>();
  private restFrames = 0;
  private flightFrames = 0;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;

    this.body = scene.matter.add.circle(x, y, layout.birdRadius, {
      label: 'bird',
      restitution: BIRD.restitution,
      friction: BIRD.friction,
      frictionAir: BIRD.frictionAir,
      density: BIRD.density,
      // Opt out of Matter's sleeping system. The bird sits motionless on the
      // sling, which is enough for Matter to put it to sleep, and a sleeping
      // body reports isSleeping the instant it launches — settling the shot
      // on frame one. Rest is detected from the velocity counter below
      // instead, which is deterministic.
      sleepThreshold: Number.MAX_SAFE_INTEGER,
    }) as MatterJS.BodyType;

    // Parked on the sling until launched.
    scene.matter.body.setStatic(this.body, true);

    this.sprite = scene.add.image(x, y, POSE.ready)
      .setDisplaySize(layout.birdDisplay, layout.birdDisplay)
      .setDepth(DEPTH_BIRD);
  }

  /** Swap the artwork, keeping the on-screen size (frames differ in aspect). */
  setPose(key: string): void {
    this.sprite.setTexture(key);
    this.sprite.setDisplaySize(layout.birdDisplay, layout.birdDisplay);
  }

  get x(): number { return this.body.position.x; }
  get y(): number { return this.body.position.y; }

  /** Copy body transform onto the art. Called every frame. */
  sync(): void {
    this.sprite.setPosition(this.body.position.x, this.body.position.y);
    this.sprite.setRotation(this.body.angle);
  }

  moveTo(x: number, y: number): void {
    this.scene.matter.body.setPosition(this.body, { x, y }, false);
  }

  launch(vx: number, vy: number): void {
    this.scene.matter.body.setStatic(this.body, false);
    this.scene.matter.body.setVelocity(this.body, { x: vx, y: vy });
    this.scene.matter.body.setAngularVelocity(this.body, 0.12);
    this.setPose(POSE.flying);
    this.state = 'FLYING';
    this.restFrames = 0;
    this.flightFrames = 0;
  }

  // --- contact tracking, driven by GameScene's world collision events ------

  addContact(id: number): void { this.contacts.add(id); }
  removeContact(id: number): void { this.contacts.delete(id); }
  isTouching(id: number): boolean { return this.contacts.has(id); }

  // --- flight resolution ---------------------------------------------------

  outOfBounds(): boolean {
    const { x, y } = this.body.position;
    const k = layout.killPlane;
    return y > k.maxY || x > k.maxX || x < k.minX;
  }

  /** True once the bird has been slow enough for long enough to call it stopped. */
  checkSettled(): boolean {
    // Ignore the first few frames: velocity-derived values lag a step behind
    // and would read as "stopped" before the body has actually moved.
    this.flightFrames += 1;
    if (this.flightFrames < MIN_FLIGHT_FRAMES) return false;

    const slow = this.body.speed < layout.restSpeed
      && this.body.angularSpeed < REST_ANGULAR_SPEED;

    this.restFrames = slow ? this.restFrames + 1 : 0;
    return this.restFrames >= REST_FRAMES;
  }

  destroy(): void {
    this.scene.matter.world.remove(this.body);
    this.sprite.destroy();
  }
}
