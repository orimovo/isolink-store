<p align="center">
  <img src="assets/isolink-mark.svg" width="96" height="96" alt="Isolink">
</p>

<h1 align="center">Isolink store</h1>

<p align="center">Theme packs and cards for <a href="https://isolink.app">Isolink</a>, the private, off-grid messenger.<br>Anyone can add one by pull request.</p>

---

Everything here shows up in the app under **Theme Studio → Library → Browse** and **My cards → Browse**. The app stays small because these are downloads, not built in.

Apps never talk to GitHub. Relays pull this store, check its signatures, and hand packs to their members over the connection they already have. So nobody's IP, searches or picks reach GitHub or anyone else.

## Add your theme pack or card

1. **Make it.** In Isolink, make a look in Theme Studio or a card in Card Studio, then save it as a file from its Share sheet (an `.isotheme` or `.isocard`). Or write one by hand from the format guides: [theme packs](https://isolink.app/docs/themes.html) and [cards](https://isolink.app/docs/cards.html). An AI model can write one from those pages too.
2. **Check it.** Drop the file into the [theme pack checker](https://isolink.app/tools.html), which runs the app's own validator in your browser.
3. **Fork this repo** and add **one folder** under `themes/community/` or `cards/community/` (see below). Copy one from [`examples/`](examples/) to start.
4. **Open a pull request.** The check runs on it within a minute or two and says exactly what to fix.
5. **A maintainer reviews it** and merges it. Within the hour it is signed and published, and it appears in Browse.

To change your pack later, edit its folder and raise `version` in `listing.json` by one.

### A theme pack

```
themes/community/moon-garden/
  pack.json            the pack (format: theme pack spec)
  listing.json         who made it, licence, version
  assets/head.png      pictures the pack names (optional)
  preview-light.png    thumbnails for Browse (optional)
  preview-dark.png
```

`pack.json` is an ordinary v2 theme pack, with two differences:

- its `"id"` is the folder's name (`"moon-garden"`), and
- a picture can be a PNG file beside it instead of base64, so reviews are readable:

```json
"assets": {
  "head": { "file": "assets/head.png" }
}
```

Only have an exported `.isotheme`? Open the pull request with it in the folder and say so; a maintainer will unpack it into `pack.json` for you.

### A card

```
cards/community/kit-list/
  card.json            the card's JSON (format: cards guide), or card.isocard exported from Card Studio
  listing.json
  preview-light.png    optional
  preview-dark.png
```

A scripted card that reaches the web must list every site it uses in `sites`. Browse shows them before anyone gets the card.

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
