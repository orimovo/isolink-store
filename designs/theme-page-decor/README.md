# Theme page decorations

Four transparent PNG assets per official theme in `assets/<theme-id>/`:

| File | Canvas | Use |
| --- | --- | --- |
| `strip-light.png` | 2048 × 160 | Ground strip on a light page |
| `strip-dark.png` | 2048 × 160 | Ground strip on a dark page |
| `peek-light.png` | 600 × 400 | Peeking mascot on a light page |
| `peek-dark.png` | 600 × 400 | Peeking mascot on a dark page |

Every PNG is below 400 KB. Strips reserve the top 50 pixels for transparency, have matching left/right boundary pixels for horizontal repetition, and run solid to the bottom edge. Peeking mascots are centred, approximately 340 pixels tall, with the torso or tentacles meeting the bottom of the canvas.

Ground artwork is scaled uniformly from the original source, preserving the proportions of flowers, stones, mushrooms and other details. Mirrored horizontal repetition fills the 2048-pixel canvas. The artwork is never stretched to the canvas width or compressed vertically after export; taller details can use the full 110-pixel allowance.

## Character references

The existing official theme illustrations in `themes/official/<theme-id>/` supply each mascot's identity. The `art["onboarding.welcome"]` illustration in each theme's `pack.json` is the primary visual reference, at source revision `e466773760e07d6cb77ce4e099cd4600dc950e25`.

Character identity takes precedence over descriptive shorthand in the initial brief. For example, Moon Bunny retains the official yellow star clip, and Space Cat retains the official cream face, lavender markings and bubble helmet.

Light assets were made with built-in image generation using those official images as references. Dark assets were made by editing their corresponding light drawing to a deeper, muted palette for a `#262826` page. Final exports preserve transparency and normalize dimensions, bottom alignment, strip seams and PNG compression.

`manifest.json` records output sizes, checksums and source references. `prompts.json` records the generation prompts. `preview.jpg` shows the mascots at 120 pixels wide on light and dark backgrounds. `strip-preview.jpg` shows larger ground-strip details in both modes.
