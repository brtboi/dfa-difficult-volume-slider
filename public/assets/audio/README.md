# Drop audio here

All optional. Without `theme.mp3` the game synthesises a looping arpeggio so the
volume change is still audible.

| Filename          | Notes |
|-------------------|-------|
| `theme.mp3`       | **Present.** Background music loop. |

No sound effects for now — the SFX keys were removed from `src/assets.ts`.
Re-add them there when you want them.

`.ogg` also works for the theme — see the `AUDIO` manifest in `src/assets.js`.

**Audio files are gitignored** (`public/assets/audio/*.mp3`), so anything
copyrighted you drop here stays local and is never committed.
