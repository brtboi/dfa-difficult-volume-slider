/** The shape of a Matter collision pair that we actually read from. */
export interface CollisionPair {
  bodyA: MatterJS.BodyType;
  bodyB: MatterJS.BodyType;
  collision: { normal: { x: number; y: number } };
}

/**
 * Relative closing speed along the collision normal.
 *
 * Used as the damage proxy for both pigs and planks: it reads a direct hit, a
 * crushing plank and a hard landing the same way, while ignoring bodies that
 * are merely resting against each other.
 */
export function impactSpeed(pair: CollisionPair): number {
  const { bodyA, bodyB, collision } = pair;
  const n = collision.normal;
  const rvx = bodyA.velocity.x - bodyB.velocity.x;
  const rvy = bodyA.velocity.y - bodyB.velocity.y;
  return Math.abs(rvx * n.x + rvy * n.y);
}
