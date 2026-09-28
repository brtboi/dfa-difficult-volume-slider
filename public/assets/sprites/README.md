# Drop sprite PNGs here

Every file is **optional**. Anything missing is replaced at runtime by a
generated placeholder, so the game always runs. Filenames must match exactly.

| Filename               | Suggested size | Notes |
|------------------------|----------------|-------|
| `bird.png`             | 72 x 69        | **Present.** Radius-18 body -> 36px on screen. |
| `pig.png`              | 64 x 64        | **Present.** Radius-16 body -> 32px on screen. |
| `pig_hurt.png`         | 64 x 63        | **Present.** Swapped in at low HP. |
| `slingshot.png`        | 171 x 540      | **Present.** Anchored bottom-centre on the ground. |
| `slingshot_back.png`   | ~171 x 540     | Optional rear prong, drawn behind the bird. |
| `background.png`       | 1280 x 720     | Sky + hills. |
| `wood.png`             | 500 x 390      | **Present.** This is a sprite *atlas* (sheet of planks/beams/shapes), not a tile — step 6 slices frames from it. |
| `debris.png`           | ~16 x 16       | Particle for the pig pop / plank break. |

Sprites are sized at **2x their on-screen size**, so they stay crisp when
`Scale.FIT` upscales the 1280x720 canvas on a large monitor.

PNG with real transparency, not a white background.

Zero-friction sources: [Kenney.nl](https://kenney.nl/assets) (CC0) and
[OpenGameArt](https://opengameart.org) both have physics-puzzle packs that fit.

To add a key not listed here, append it to `src/assets.js`.
