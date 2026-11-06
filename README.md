<p align="center">
  <img src="assets/isolink-mark.svg" width="96" height="96" alt="Isolink">
</p>

<h1 align="center">Isolink store</h1>

<p align="center">Theme packs, cards and effects for <a href="https://isolink.app">Isolink</a>, the private, off-grid messenger.<br>Anyone can add one by pull request.</p>

---

Everything here shows up in the app under **Theme Studio → Library → Browse**, **My cards → Browse** and the camera's **Store**. Isolink's cards tagged `template` are the app's New card templates. The app stays small because these are downloads, not built in.

Apps never talk to GitHub. Relays pull this store, check its signatures, and hand packs to their members over the connection they already have. So nobody's IP, searches or picks reach GitHub or anyone else.

## Add your theme pack, card, effects or app

1. **Make it.** In Isolink, make a look in Theme Studio or a card in Card Studio, then save it as a file from its Share sheet (an `.isotheme` or `.isocard`). Or write one by hand from the format guides: [theme packs](https://isolink.app/docs/themes.html) and [cards](https://isolink.app/docs/cards.html). An AI model can write one from those pages too.
2. **Check it.** Drop the file into the [theme pack checker](https://isolink.app/tools.html), which runs the app's own validator in your browser.
3. **Fork this repo** and add **one folder** under `themes/community/`, `cards/community/` or `effects/community/` (see below). Copy one from [`examples/`](examples/) to start.
4. **Open a pull request.** The check runs on it within a minute or two and says exactly what to fix.
5. **A maintainer reviews it** and merges it. Within the hour it is signed and published, and it appears in Browse.

To change your pack later, edit its folder and raise `version` in `listing.json` by one.

### A theme pack

```
themes/community/moon-garden/
  pack.json            the pack (format: theme pack spec)
  listing.json         who made it, licence, version
  assets/head.png      pictures the pack names (optional)
  sounds/drip.wav      notification sounds the pack names (optional)
  preview-light.png    thumbnails for Browse (optional)
  preview-dark.png
```

Any folder may add `translations.json`, its name, `desc` and, for a card, its lines in the app's other languages (`es`, `fr`, `de`, `pt`, `zh`, `ar`), so Browse shows it in each person's language:

```json
{
  "de": { "name": "Mondgarten", "desc": "Kleine Pilzblasen auf moosigem Waldboden." },
  "fr": { "name": "Jardin lunaire" }
}
```

A card's `lines` map each line as written in the card to its translation: `"lines": { "Tent": "Zelt" }`.

`pack.json` is an ordinary v2 theme pack, with two differences:

- its `"id"` is the folder's name (`"moon-garden"`), and
- a picture can be a PNG file beside it instead of base64, so reviews are readable:

```json
"assets": {
  "head": { "file": "assets/head.png" }
}
```

and a notification sound can be a WAV file beside it too (PCM, at most 5 seconds and 512 KB, up to four):

```json
"sounds": [
  { "name": "Drip", "file": "sounds/drip.wav" }
]
```

Only have an exported `.isotheme`? Open the pull request with it in the folder and say so; a maintainer will unpack it into `pack.json` for you.

### A story pack

Backgrounds, fonts, motions, filters, layouts and frames for text stories:

```
stories/community/neon-nights/
  story.json           the pack
  listing.json         who made it, licence, version
  fonts/neon.ttf       fonts the pack names (TrueType or OpenType, up to 1 MB each)
  preview-light.png    thumbnails for Story packs (optional)
  preview-dark.png
```

```json
{
  "v": 1, "id": "neon-nights", "name": "Neon nights",
  "backgrounds": [{"id": "grid", "name": "Grid", "colors": [4279370015], "pattern": "grid", "motion": "pan"}],
  "fonts": [{"id": "neon", "name": "Neon", "font": {"file": "fonts/neon.ttf"}}],
  "motions": [{"id": "flicker", "name": "Flicker", "base": "flicker", "speed": 1.2}],
  "filters": [{"id": "glow", "name": "Glow", "overlay": "glow", "strength": 0.9}]
}
```

A background is one to four colours (`0xAARRGGBB`) with an `angle`, an optional `pattern` (`dots`, `grid`, `lines`, `stripes`), `motion` (`drift`, `pulse`, `pan`) and `image` (`{"file": "x.png"}`). A motion tunes one of the app's own (`fade`, `pop`, `type`, `wave`, `bounce`, `glitch`, `flicker`, `slide`, `zoom`) with `speed` and `amount`. A filter is a 4x5 colour `matrix`, an `overlay` (`grain`, `scanlines`, `halftone`, `vignette`, `glow`, `split`) or both. A layout places the story in `slots`, drawn in order: one `text` slot for the words, and any `image` or `emoji` slots, each with `x`, `y`, `w` and `h` as a percentage of the story (`40` or `"40%"`), `"24dp"` (as on a story 360 wide) or `"120px"` (as on one 1080 wide), an optional `radius`, and for an image slot a `generate` prompt the app and bots start from, or for an emoji slot the `emoji` it starts with. A frame goes along the bottom or all round (`place`: `bottom` or `full`) with a set `width` in the same units, and is one of the app's own (`base`: `waves`, `snow`, `leaves`, `hills`) in up to four `colors`, an `image` (`{"file": "frame.png"}`) or both:

```json
"layouts": [{"id": "postcard", "name": "Postcard", "slots": [
  {"id": "pic", "kind": "image", "x": 6, "y": 9, "w": 88, "h": 42, "radius": "24dp", "generate": "A sunny beach"},
  {"id": "words", "kind": "text", "x": 8, "y": 54, "w": 84, "h": 20},
  {"id": "shell", "kind": "emoji", "x": 74, "y": 46, "w": 16, "h": 9, "emoji": "🐚"}]}],
"frames": [{"id": "surf", "name": "Surf", "base": "waves", "width": 30, "colors": [4288603104, 4282366153]}]
```

A frame can also be layers (`"base": "layers"`), which can draw new looks with no app update. It runs along any `edges` (`top`, `bottom`, `left`, `right`) in up to eight `colors`, with up to eight `layers` drawn in order:

- `strip` along the edges: a `look` (`waves`, `hills`, `snow`, `leaves`, `grass`, `flowers`, `clouds`, `stars`, `bunting`, `hearts`, `scallop`, `confetti`, `band`, `zigzag`, `dots`) or `image` (`{"file": "frames/x.png"}`, a see-through PNG up to 256 KB, repeated with `tile` `mirror` or `loop`)
- `fall`: up to 150 things falling or rising (`snow`, `rain`, `leaves`, `petals`, `confetti`, `hearts`, `stars`, `bubbles`, an `emoji` or an `image`)
- `beam`: light beams from `at` anchors (`top`, `bottom-left`, `center`, …)
- `glow`: a soft glow at `at` anchors

Each layer can set `move` (`still`, `drift`, `sway`, `bob`, `pulse`, `fall`, `rise`, `sweep`, `spin`), `speed` (0 to 5), `amount`, `size`, `opacity`, `count`, its own `colors`, `hue` (colour cycles per second, up to 2), `blink` (up to 3 a second), `blend` (`add` for light) and a `seed`. [`stories/official/party/`](stories/official/party/) has lasers:

```json
{"id": "lasers", "name": "Lasers", "base": "layers", "edges": ["bottom"], "width": 18,
 "colors": [4294912982, 4278248959, 4286381903, 4294959437],
 "layers": [
  {"kind": "glow", "at": ["bottom"], "move": "pulse", "speed": 2, "blend": "add", "opacity": 0.7},
  {"kind": "beam", "at": ["bottom-left", "bottom-right"], "count": 4, "move": "sweep", "hue": 0.25, "blend": "add"},
  {"kind": "strip", "look": "band", "colors": [4279503398]}]}
```

Tag it with what it has (`backgrounds`, `fonts`, `motions`, `filters`, `layouts`, `frames`) so Story packs can filter it. Packs with layouts or frames need `"minApp": "0.26.21"`, and packs with layered frames `"minApp": "0.26.33"`.

### A card

```
cards/community/kit-list/
  card.json            the card's JSON (format: cards guide), or card.isocard exported from Card Studio
  listing.json
  preview-light.png    optional
  preview-dark.png
```

A scripted card that reaches the web must list every site it uses in `sites`. Browse shows them before anyone gets the card.

### Effects

```
effects/community/party/
  effects.json         the pack: its effects and their layers
  listing.json
  assets/*.png         optional, for stickers and frames
```

An effect is layers on a face or a photo: stickers (an emoji or a PNG), warps, a colour filter, particles and frames. Stickers sit on places on the face (`eyes`, `nose`, `mouth`, `top`, …) and follow it in the camera. The format is in [docs/theme-store.md](https://github.com/waggr-gb/Isolink/blob/main/docs/theme-store.md#extras-effect-packs-and-story-styles), and [`effects/official/`](effects/official/) has examples.

### An app

```
apps/community/plant-care/
  app.json             its id, name, icon, accent, schema and starter rows
  schema.json          the schema, when it isn't in app.json (optional)
  listing.json
  translations.json    optional
```

An app is a database to start from: tables of typed fields (text, markdown, number, yes or no, date, choice, tags, counter, person, link, a row of another table). Get makes one on the phone, encrypted end to end, which the person can share, sync over relays or only nearby, and let bots read. The schema format is in [designs/custom-databases.md](https://github.com/waggr-gb/Isolink/blob/main/docs/databases.md); [`apps/official/`](apps/official/) has examples.

```json
{
  "id": "plant-care",
  "name": "Plant care",
  "icon": "star",
  "schema": { "tables": { "plants": { "title": "name", "fields": {
    "name": { "type": "text", "required": true },
    "watered": { "type": "date" }
  } } } },
  "starter": { "plants": [{ "name": "Monstera" }] }
}
```

### listing.json

```json
{
  "version": 1,
  "by": "Your name",
  "licence": "CC-BY-4.0",
  "desc": "Little mushroom bubbles on a mossy forest floor.",
  "tags": ["cute", "forest"],
  "minApp": "0.25.0"
}
```

| Field | Needed | Rule |
| --- | --- | --- |
| `version` | yes | A whole number from 1. Raise it with every change. |
| `by` | yes | Your name as shown in the app, at most 64 characters. Not "Isolink". |
| `licence` | yes | An [SPDX id](https://spdx.org/licenses/). We suggest `CC-BY-4.0` or `CC0-1.0`. |
| `desc` | no | At most 200 characters. |
| `tags` | no | At most 8, lower case letters, digits and `-`. |
| `minApp` | no | The oldest Isolink version it needs, e.g. `0.25.0`. Older apps won't list it. |

Thumbnails are PNGs of at most 640 px a side and 200 KB: a chat in your look works best, 4:3. Without one, Browse draws a tile in the pack's accent colour.

## What gets merged

- **Your own work**, or work you may share under the licence you give. No logos, characters or artwork you don't have the rights to.
- **Fits the app's limits.** The check enforces them: the app's own validator and picture limits, and at most 5 MB a pack.
- **Readable.** Bubble text must stay readable in light and dark mode.
- **Safe.** Cards reach only the sites they list, and nothing that tracks people.
- **One pack or card per pull request**, in its own folder. A PR may not touch anything outside `themes/community/` or `cards/community/`.

## How it's kept safe

- The pull request check runs on GitHub's runners with no secrets. It can't reach the signing keys.
- After a maintainer merges, Isolink's build machine signs each theme pack and the store's index, and publishes them to the [`store`](../../tree/store) branch. Community packs are signed with a store key, not Isolink's own, so the app labels them "by *you* · Reviewed for the Isolink store", never as Isolink's.
- The app checks the index's signature, then each download's size and SHA-256, then the pack's own signature, before saving anything. A relay or anyone in between can't change a pack.
- Packs in `themes/official/` and `cards/official/` are made by Isolink and show "Isolink ✓".

## This repo

```
themes/official/   Isolink's own theme packs
themes/community/  everyone else's
cards/official/
cards/community/
examples/          copy one to start (not published)
assets/            this README's pictures
```

The [`store`](../../tree/store) branch holds what apps get: `index.json`, the signed `.isotheme` and `.isocard` files and their thumbnails. It is built for you; don't edit it.

Run a relay? Relays will pull this store by default, and their owners can add other stores or turn it off.
