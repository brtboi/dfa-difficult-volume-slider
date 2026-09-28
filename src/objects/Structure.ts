import Phaser from 'phaser';
import { MATERIALS, PIG } from '../config';
import { layout } from '../layout';
import { impactSpeed, type CollisionPair } from '../util/impact';

/** Two hits: the first splinters the piece, the second finishes it. */
export type Condition = 'healthy' | 'damaged';

/** Both frames come straight out of wood.png. */
const CONDITION_TEXTURE: Record<Condition, string> = {
  healthy: 'wood_beam',
  damaged: 'wood_beam_damaged',
};

/** Below this closing speed a contact is a nudge, not a hit. */
const HIT_THRESHOLD = 3.2;

/**
 * A collapse keeps generating contacts for a second or more as the tower
 * tumbles, which would carry a piece from healthy straight to gone on a
 * single shot. Holding the window open for longer than a collapse lasts
 * means one shot does one step of damage, which is the intent.
 */
const HIT_COOLDOWN_MS = 1200;

/**
 * Wreckage resting on the track blocks the bird from landing there. Only the
 * wreckage sitting *on the goal* is cleared, since that is the one case that
 * would make the run unwinnable; everything else stays where it falls.
 */
const DEBRIS_CLEAR_MS = 1400;
/** Half-width of the protected window around the goal, in track percent. */
const GOAL_GUARD_PCT = 7;

/** A single destructible wooden piece: Matter body + sprite + crack overlay. */
class Plank {
  readonly body: MatterJS.BodyType;
  private readonly sprite: Phaser.GameObjects.Image;
  private readonly w: number;
  private readonly h: number;

  condition: Condition = 'healthy';
  dead = false;
  private lastHit = -Infinity;
  private stillSince: number | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    x: number, y: number, w: number, h: number, angle: number,
  ) {
    this.w = w;
    this.h = h;

    this.body = scene.matter.add.rectangle(x, y, w, h, {
      label: 'plank',
      density: MATERIALS.wood.density,
      friction: 0.8,
      frictionStatic: 1,
      restitution: 0.05,
      angle,
    }) as MatterJS.BodyType;

    // The beam art is horizontal; uprights reuse it rotated.
    this.sprite = scene.add.image(x, y, CONDITION_TEXTURE.healthy)
      .setDisplaySize(w, h)
      .setRotation(angle)
      .setDepth(60);
  }

  sync(): void {
    if (this.dead) return;
    const { x, y } = this.body.position;
    this.sprite.setPosition(x, y).setRotation(this.body.angle);
  }

  /** True once this piece has been lying still on top of the goal. */
  isBlockingGoal(now: number, goalPct: number): boolean {
    if (this.dead) return false;
    const L = layout;
    const { x, y } = this.body.position;

    const onGoal = Math.abs(L.xToVolume(x) - goalPct) < GOAL_GUARD_PCT
      && y > L.barCenterY - L.u(46) && y < L.barCenterY + L.u(20);

    if (!onGoal || this.body.speed > 0.4 * L.S) {
      this.stillSince = null;
      return false;
    }
    this.stillSince ??= now;
    return now - this.stillSince > DEBRIS_CLEAR_MS;
  }

  /**
   * First solid hit splinters it and it stays put; the next one destroys it.
   * Returns true if the piece is gone.
   */
  damage(now: number): boolean {
    if (now - this.lastHit < HIT_COOLDOWN_MS) return false;
    this.lastHit = now;

    if (this.condition === 'healthy') {
      this.condition = 'damaged';
      this.sprite.setTexture(CONDITION_TEXTURE.damaged)
        .setDisplaySize(this.w, this.h);
      this.scene.cameras.main.shake(90, 0.003);
      return false;
    }
    this.destroy();
    return true;
  }

  destroy(): void {
    if (this.dead) return;
    this.dead = true;
    this.scene.matter.world.remove(this.body);
    this.scene.tweens.add({
      targets: this.sprite,
      alpha: 0, scaleX: this.sprite.scaleX * 1.25, scaleY: this.sprite.scaleY * 1.25,
      duration: 260,
      onComplete: () => this.sprite.destroy(),
    });
  }
}

/** How long a wounded pig lies there before it expires. */
const PIG_EXPIRY_MS = 900;
/** Hard cap, so a pig wedged somewhere still eventually goes. */
const PIG_MAX_LIFE_MS = 5000;

/**
 * Matter's sleeping is what stops a resting stack from drifting - without it
 * a circular pig slowly rolls off a flat beam on its own from numerical
 * jitter. But removing a body does not wake whatever was resting on it, so
 * anything destroyed has to wake its neighbours explicitly.
 */
function wake(body: MatterJS.BodyType): void {
  const b = body as MatterJS.BodyType & { sleepCounter?: number };
  b.isSleeping = false;
  b.sleepCounter = 0;
}

/** The pig perched on top. Falls with the fort; wounded pigs die shortly after. */
class Pig {
  readonly body: MatterJS.BodyType;
  private readonly sprite: Phaser.GameObjects.Image;
  dead = false;
  private hurtAt: number | null = null;
  private restingSince: number | null = null;
  private lastHit = -Infinity;

  constructor(private readonly scene: Phaser.Scene, x: number, y: number, r: number) {
    this.body = scene.matter.add.circle(x, y, r, {
      label: 'pig',
      density: PIG.density,
      friction: PIG.friction,
      restitution: PIG.restitution,
    }) as MatterJS.BodyType;

    this.sprite = scene.add.image(x, y, 'pig')
      .setDisplaySize(r * 2.2, r * 2.2)
      .setDepth(62);
  }

  sync(): void {
    if (this.dead) return;
    this.sprite.setPosition(this.body.position.x, this.body.position.y)
      .setRotation(this.body.angle);
  }

  damage(now: number): boolean {
    if (now - this.lastHit < HIT_COOLDOWN_MS) return false;
    this.lastHit = now;

    // Already wounded and hit again: finish it now.
    if (this.hurtAt !== null) {
      this.destroy();
      return true;
    }

    const { displayWidth: w, displayHeight: h } = this.sprite;
    this.sprite.setTexture('pig_hurt').setDisplaySize(w, h);
    this.hurtAt = now;
    return false;
  }

  /**
   * A wounded pig expires shortly after it comes to rest.
   *
   * Timing it from the moment of the hit instead meant it popped mid-tumble,
   * vanishing in mid-air on the way down rather than falling with the fort.
   */
  tick(now: number): boolean {
    if (this.dead || this.hurtAt === null) return false;

    if (this.body.speed > 0.6 * layout.S) {
      this.restingSince = null;
    } else {
      this.restingSince ??= now;
    }

    const settled = this.restingSince !== null
      && now - this.restingSince > PIG_EXPIRY_MS;
    if (!settled && now - this.hurtAt < PIG_MAX_LIFE_MS) return false;

    this.destroy();
    return true;
  }

  destroy(): void {
    if (this.dead) return;
    this.dead = true;
    this.scene.matter.world.remove(this.body);
    this.scene.tweens.add({
      targets: this.sprite,
      alpha: 0, scaleX: 1.6, scaleY: 1.6, duration: 240,
      onComplete: () => this.sprite.destroy(),
    });
  }
}

/**
 * A small fort standing on the slider: two uprights, a beam across the top,
 * and a pig on the roof. It sits between the slingshot and the goal flag, so
 * a flat shot into the target zone runs straight through it.
 */
export default class Structure {
  private readonly planks: Plank[] = [];
  private readonly pig: Pig;
  private readonly byBodyId = new Map<number, Plank | Pig>();

  constructor(scene: Phaser.Scene, centerX: number) {
    const L = layout;
    const top = L.barCenterY - L.barHeight / 2;

    // Tall enough to stand in the way of a shot aimed at the goal. A short
    // fort here sits below the arc and never gets touched.
    const postW = L.u(16);
    const postH = L.u(190);
    const beamW = L.u(112);
    const beamH = L.u(18);
    const gap = L.u(78);

    const postY = top - postH / 2;
    for (const dx of [-gap / 2, gap / 2]) {
      this.planks.push(new Plank(scene, centerX + dx, postY, postH, postW, Math.PI / 2));
    }

    const beamY = top - postH - beamH / 2;
    this.planks.push(new Plank(scene, centerX, beamY, beamW, beamH, 0));

    const pigR = L.u(15);
    this.pig = new Pig(scene, centerX, beamY - beamH / 2 - pigR, pigR);

    for (const p of this.planks) this.byBodyId.set(p.body.id, p);
    this.byBodyId.set(this.pig.body.id, this.pig);
  }

  sync(now: number, goalPct: number): void {
    let removed = false;

    for (const p of this.planks) {
      p.sync();
      if (p.isBlockingGoal(now, goalPct)) {
        this.byBodyId.delete(p.body.id);
        p.destroy();
        removed = true;
      }
    }
    this.pig.sync();
    if (this.pig.tick(now)) {
      this.byBodyId.delete(this.pig.body.id);
      removed = true;
    }

    if (removed) this.wakeAll();
  }

  /** Nudge every surviving piece awake, so nothing is left hanging. */
  wakeAll(): void {
    for (const p of this.planks) if (!p.dead) wake(p.body);
    if (!this.pig.dead) wake(this.pig.body);
  }

  /** Route a collision to whichever piece was struck. */
  handleCollision(pair: CollisionPair, now: number): void {
    const speed = impactSpeed(pair);
    if (speed < HIT_THRESHOLD * layout.S) return;

    for (const id of [pair.bodyA.id, pair.bodyB.id]) {
      const piece = this.byBodyId.get(id);
      if (!piece || piece.dead) continue;
      if (piece.damage(now)) this.byBodyId.delete(id);
      // Whatever was stacked on it has to start falling.
      this.wakeAll();
    }
  }

  /** Dev probe: live body state of every piece. */
  bodyStates(): Array<Record<string, unknown>> {
    const rows = this.planks.map((p, i) => ({
      piece: `plank${i}`, dead: p.dead,
      y: Math.round(p.body.position.y), sleeping: p.body.isSleeping,
      speed: Number(p.body.speed.toFixed(2)),
    }));
    rows.push({
      piece: 'pig', dead: this.pig.dead,
      y: Math.round(this.pig.body.position.y), sleeping: this.pig.body.isSleeping,
      speed: Number(this.pig.body.speed.toFixed(2)),
    });
    return rows;
  }

  /** Dev probe: condition of each piece, destroyed ones included. */
  conditions(): string[] {
    return [
      ...this.planks.map((p) => (p.dead ? 'gone' : p.condition)),
      this.pig.dead ? 'pig:gone' : 'pig:ok',
    ];
  }

  get standing(): number {
    return this.planks.filter((p) => !p.dead).length + (this.pig.dead ? 0 : 1);
  }

  destroy(): void {
    for (const p of this.planks) p.destroy();
    this.pig.destroy();
  }
}
