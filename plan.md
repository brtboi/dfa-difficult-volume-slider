# Angry Birds Volume Slider — Implementation Plan

## Context

This is a "difficult volume slider" — a deliberately user-hostile interface exercise. Instead of dragging a handle, you launch a bird from a slingshot and wherever it comes to rest on a horizontal bar becomes the volume. Forts with pigs on top are built *on that bar*, physically occupying landing spots, so reaching a given volume means knocking the structure out of the way first.

The repo is empty (`git init` only, no commits). Everything below is new code. Frontend only, runs locally, Phaser 3 + Matter physics.

**Scope change from the original ask:** the "must kill all pigs before the slider unlocks" rule is **removed**. The slider is live from the very first shot. Pigs and structures are pure physical obstruction plus flavor — they block the bar, they don't gate it.

## Stack

- **Vite 8** (dev server + build), **Phaser 3.90**, **TypeScript** (strict, `tsc --noEmit` gates the build).
- `npm install phaser` now resolves to **Phaser 4**, a renderer rewrite with a different API. The dependency is pinned to `3.90.0` deliberately — do not bump it without reworking the Matter calls.
- Matter comes bundled inside Phaser as `Phaser.Physics.Matter` — do **not** `npm install matter-js` separately. Configure it via `physics: { default: 'matter' }`. Raw Matter is reachable at `this.matter.body`, `Phaser.Physics.Matter.Matter` if needed.
- **Assets are optional.** `src/assets.ts` is a manifest of sprite/audio keys; `BootScene` loads each one and substitutes a generated `Phaser.Graphics` texture for anything that 404s. The game runs on a fresh clone with an empty `public/assets/` tree and improves as real files are dropped in — no code change needed.

## File layout

```
index.html                       canvas host + "click to start" overlay
package.json                     phaser 3.90 (pinned), vite, typescript
tsconfig.json                    strict
vite.config.ts                   appType 'mpa' so missing assets 404 properly
.gitignore                       node_modules, dist, public/assets/audio/*.mp3
public/assets/sprites/           drop sprites here (README lists names + sizes)
public/assets/audio/             drop audio here; *.mp3 is gitignored
src/main.ts                      Phaser.Game config, scene registration
src/config.ts                    every tuning constant, single source of truth
src/assets.ts                    optional-asset manifest (sprite + audio keys)
src/scenes/BootScene.ts          audio load, AudioContext unlock gate
src/scenes/GameScene.ts          world build + round state machine
src/scenes/UIScene.ts            parallel HUD scene (volume readout, birds left, buttons)
src/objects/Slingshot.ts         drag/aim/release, elastic band rendering
src/objects/Bird.ts              body, flight state, rest detection
src/objects/Pig.ts               body, HP, damage, pop
src/objects/Structure.ts         plank/block factory + fort layout definitions
src/objects/SliderBar.ts         track body, knob, x→volume mapping, fill render
src/audio/VolumeController.ts    AudioContext, GainNode, resume, synth fallback
src/util/impact.ts               impact-speed helper shared by Pig and Structure
```

## World geometry (1280 × 720, `Scale.FIT` + `CENTER_BOTH`)

| Thing | Value |
|---|---|
| Ground (static) | y = 700 |
| Slingshot base | x = 180 |
| Slingshot anchor (pull origin) | (180, 430) |
| Slider bar (static body) | x 400 → 1200, center y = 600, height 24 → **top surface y = 588** |
| Fort footprint | x 520 → 1160, resting on the bar's top surface |
| World bounds | `setBounds` with **top disabled** so high arcs don't bounce off a ceiling |
| Kill plane | `bird.y > 900 \|\| bird.x > 1400 \|\| bird.x < -100` → shot is spent |

Put these in `src/config.ts` as `BAR_LEFT`, `BAR_RIGHT`, `BAR_TOP`, `SLING_ANCHOR`, etc. Everything else imports from there — no magic numbers in scene code.

## Core mechanics

### Slingshot — kinematic drag, not a Matter constraint

Do **not** use a Matter spring/constraint. It's finicky to tune and the release impulse is hard to predict. Instead:

1. Bird spawns at the anchor as a **static** body (`setStatic(true)`).
2. `pointerdown` within grab radius → `DRAGGING`. Each `pointermove`, set bird position to the pointer, clamped to `MAX_PULL` (start at 130px) from the anchor.
3. Render the two elastic bands every frame with a `Graphics` object: fork tip → bird, bird → other fork tip. Redraw the bird on top.
4. `pointerup` → `setStatic(false)`, then
   ```js
   const dx = ANCHOR.x - bird.x, dy = ANCHOR.y - bird.y;
   bird.setVelocity(dx * LAUNCH_K, dy * LAUNCH_K);  // LAUNCH_K ≈ 0.18
   ```
   Matter velocity is px-per-step, so a 130px pull at k=0.18 gives ~23 px/step. Tune `LAUNCH_K` and `GRAVITY_Y` (start 1.4) together.

**No trajectory preview.** That's the difficulty. Optionally leave faint dots marking where previous shots passed — makes it learnable without making it easy. Gate it behind `config.SHOW_GHOST_TRAIL`.

### Bird rest detection

```js
matter.add.circle(x, y, 18, {
  label: 'bird', restitution: 0.4, friction: 0.6,
  frictionAir: 0.008, density: 0.004
})
```

Enable `enableSleeping: true` in the Matter world config. A bird counts as settled when **either**:
- Matter fires `sleepStart` on its body, **or**
- `speed < 0.25 && angularSpeed < 0.05` held for 30 consecutive frames (belt-and-braces; sleeping can be flaky on slopes).

On settle, the bird commits a volume **only if it's resting on the bar**: `x` within `[BAR_LEFT, BAR_RIGHT]` **and** the bar body is in its live contact set. Maintain that set in `Bird.ts` from `collisionstart` / `collisionend` — don't infer contact from y-position alone, or a bird wedged against the bar's side will false-positive.

A bird that settles on the ground, on debris, or rolls off the bar is **spent** — no volume change. Next bird loads after ~1.2s.

### Volume mapping

```js
const t = Phaser.Math.Clamp((bird.x - BAR_LEFT) / (BAR_RIGHT - BAR_LEFT), 0, 1);
const volume = Math.round(t * 100);
```

Apply with a short ramp so it doesn't click:
```js
gain.gain.linearRampToValueAtTime(volume / 100, ctx.currentTime + 0.08);
```
`SliderBar.ts` renders the committed knob at that x plus a filled track segment to its left, so it still reads as a slider.

### Pigs

```js
matter.add.circle(x, y, 16, {
  label: 'pig', restitution: 0.3, friction: 0.5, density: 0.0015
})
```

Damage on `collisionstart` using a shared helper — relative velocity projected onto the collision normal:

```js
// src/util/impact.ts
export function impactSpeed(pair) {
  const { bodyA, bodyB, collision } = pair;
  const n = collision.normal;
  const rvx = bodyA.velocity.x - bodyB.velocity.x;
  const rvy = bodyA.velocity.y - bodyB.velocity.y;
  return Math.abs(rvx * n.x + rvy * n.y);
}
```

Pig starts at `hp = 100`. If `impactSpeed(pair) > PIG_DAMAGE_THRESHOLD` (start at 4), subtract `(speed - threshold) * PIG_DAMAGE_SCALE`. At `hp <= 0` → pop: particle burst, remove body, decrement the pig counter. This handles direct hits, being crushed by a falling plank, and fall damage uniformly.

Register one world-level `collisionstart` listener in `GameScene` and dispatch by `body.label` — much cheaper than per-body listeners.

**Pigs aren't a gate, so give them a reward:** clearing every pig in the round grants **+2 bonus birds**. Optional but it's what keeps them worth shooting at.

### Structures

Data-driven layouts in `Structure.ts`:

```js
const FORTS = [
  [ {t:'plank', x:640, y:520, w:20, h:140, mat:'wood'},
    {t:'plank', x:760, y:520, w:20, h:140, mat:'wood'},
    {t:'plank', x:700, y:442, w:160, h:20, mat:'wood'},
    {t:'pig',   x:700, y:410},
    ... ],
  // 3–4 layouts of increasing nastiness, picked at random per round
];
```

Materials carry density + HP: `wood {d:0.0012, hp:60}`, `stone {d:0.003, hp:200}`, `ice {d:0.0008, hp:25}`. Planks take damage from the same `impactSpeed` helper and are removed (with a fade tween) at 0 HP.

**Debris cleanup matters.** Broken planks and dead-pig remnants settling on the bar would make volumes unreachable. So: any non-bird body at rest on the bar's top surface for >1.5s fades out and is removed. Run this as a 500ms timer sweep in `GameScene`, not per-frame.

## Round state machine (`GameScene`)

```
IDLE ──"Change volume"──▶ BUILDING ──▶ AIMING ⇄ FLYING ──▶ SETTLED
                             ▲                                 │
                             └──── out of birds, no landing ────┘
```

- `BUILDING` — rebuild a randomly chosen fort, respawn pigs, `birdsRemaining = 4`.
- `AIMING` — bird on the sling, waiting for drag.
- `FLYING` — after release; poll rest/kill-plane each frame.
- On settle **on the bar** → commit volume, knob-flash tween, HUD "Volume set to 73%", → `IDLE`.
- On settle **off the bar** → `birdsRemaining--`; if any left → `AIMING`, else the round resets: rebuild fort, restore birds, volume unchanged, snarky HUD line.
- From `IDLE`, the "Change volume" button → `BUILDING`. **The fort rebuilds every time you want to adjust** — per your choice, that's the recurring tax.

## Audio

`VolumeController.ts` owns a Web Audio graph:

```
<audio loop src="/audio/theme.mp3">  →  MediaElementAudioSourceNode  →  GainNode  →  destination
```

- **Autoplay policy:** the `AudioContext` starts `suspended`. `BootScene` shows a full-screen "click to start" overlay; the first `pointerdown` calls `ctx.resume()` and `audioEl.play()`. Without this the track silently never starts in Chrome.
- **The Angry Birds theme is copyrighted** — the plan doesn't fetch or commit it. Drop your own file at `public/assets/audio/theme.mp3` and keep `public/audio/*.mp3` in `.gitignore`.
- **Fallback:** if the fetch 404s, `VolumeController` synthesizes a looping arpeggio from `OscillatorNode`s through the same GainNode. The volume slider is then demonstrably audible on a fresh clone with zero assets.
- Optional SFX (launch whoosh, pig pop, wood crack) route through a **separate** gain node so they aren't muted when the music volume goes to 0 — otherwise setting volume to 0% makes the game feel broken.

## HUD (`UIScene`, launched in parallel via `this.scene.launch`)

Top-left: `VOLUME 73%` large, plus the mirrored fill bar. Top-right: birds remaining (icons), pigs remaining. Center-bottom on `IDLE`: a **"Change volume"** button. Transient center message for round events.

## Build order

1. **Scaffold** — `npm create vite`, strip to vanilla, add `phaser`, `main.ts` with Matter config, an empty `GameScene` drawing the ground and bar. Verify the canvas scales.
2. **`SliderBar.ts`** — static body, x→volume mapping, knob + fill rendering. Hard-code a volume to confirm the render.
3. **`VolumeController.ts`** + the unlock overlay. Wire a temporary keyboard `←`/`→` to change volume so you can confirm audio ramps *before* any physics exists.
4. **`Slingshot.ts` + `Bird.ts`** — drag, band rendering, launch, kill plane, rest detection. Tune `LAUNCH_K` / `GRAVITY_Y` until the far end of the bar is reachable at near-full pull.
5. **Commit path** — bird settles on the bar → real volume change. The core loop is now playable and *this is the milestone that proves the concept*.
6. **`Structure.ts` + `Pig.ts`** — forts, HP, `impactSpeed` damage, pig pop, debris cleanup sweep.
7. **Round state machine + `UIScene`** — bird economy, fort rebuild on re-adjust, bonus birds, all HUD.
8. **Polish** — particles, camera shake on impact, screen-edge trail dots, tune fort layouts so every volume from 0–100 is *reachable but annoying*.

Steps 1–5 are the real deliverable; 6–8 are the difficulty layer.

## Verification

```bash
npm install
npm run dev     # http://localhost:5173
```

Set `physics.matter.debug: true` in `config.ts` while working on steps 4–6 to see collision bodies.

Manual checklist:

- [ ] Click-to-start overlay dismisses and music begins (or the fallback synth does, with no mp3 present).
- [ ] Dragging the bird shows bands; the pull clamps at `MAX_PULL`; release launches along the expected arc.
- [ ] A bird resting on the **far left** of the bar sets volume near 0 and the music is near-silent; **far right** → ~100 and full volume. Audible, not just a number change.
- [ ] A bird landing on the ground, rolling off the bar, or flying off-screen consumes a bird and does **not** change the volume.
- [ ] Every volume band 0–100 is physically reachable at some pull — walk the bar in ~10% steps and confirm no dead zones.
- [ ] Direct hits pop pigs; falling planks crush them; a gentle roll-into does not.
- [ ] Debris resting on the bar clears within ~1.5s and never permanently blocks a landing spot.
- [ ] Running out of birds rebuilds the fort and leaves the volume untouched.
- [ ] "Change volume" from `IDLE` rebuilds a fresh fort with a full bird count.
- [ ] `npm run build && npx vite preview` serves a working production bundle (build runs `tsc --noEmit` first).

No automated tests — this is a physics toy where correctness is judged by feel. If you want one safety net, unit-test the pure functions (`impactSpeed`, the x→volume mapping in `SliderBar`) with Vitest; everything else needs a human at the controls.
