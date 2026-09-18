# Draw (obsidian-draw)

An [Obsidian](https://obsidian.md) plugin for handwriting with an Apple Pencil, where each
drawing is stored **inline in the note's Markdown file** instead of as a separate `.svg` or
drawing file.

A drawing looks like this in the raw note:

````md
```ink
v1;id=k3f9x2ab;700x260;<base64 of compressed, delta-encoded strokes>
```
````

...and renders as a small, theme-coloured sketch wherever that block sits in your text. Tap it
to open a Pencil-friendly editor; tap Done (or tap outside it) to save and close.

## Why inline?

Most handwriting/drawing plugins keep the drawing in its own file and embed it, which means an
extra file per doodle and an editor pane that has to stay in sync with it. This plugin keeps
everything in the one note file:

- **Nothing to keep in sync.** The note is the drawing.
- **Git-friendly.** Each block's data lives on a single line, so if you edit different parts of
  a note on different devices and sync with git, unrelated changes merge cleanly. A conflict
  only happens if the *same* drawing was edited on both sides.
- **Small and self-contained.** Strokes are quantised, delta-encoded, varint-packed, deflated and
  base64'd — a dense block is typically well under 30 KB.

See [`specs/001-inline-handwriting-blocks/contracts/block-format.md`](specs/001-inline-handwriting-blocks/contracts/block-format.md)
for the full, frozen v1 format.

## Requirements

- Obsidian ≥ 1.5.7.
- Works on iPad with Apple Pencil (the primary target), and loads on desktop, but only pen
  input draws — the editor ignores touch/mouse/hover for strokes (see
  [Known limitations](#known-limitations)).

## Installing

This plugin isn't (yet) published to Obsidian's Community Plugins directory, so install it by
building it and copying it into your vault:

```bash
git clone https://github.com/LuanD97/obsidian-draw.git
cd obsidian-draw
npm install
npm run build
```

Then copy `main.js`, `manifest.json` and `styles.css` into
`<YourVault>/.obsidian/plugins/obsidian-draw/` (create the folder if it doesn't exist).

If your vault lives at a predictable path, `npm run deploy` does the build-and-copy for you:

```bash
npm run deploy                                   # copies into ~/Documents/obsidian-personal
OBSIDIAN_VAULT=/path/to/your/vault npm run deploy  # or any other vault
```

Finally, in Obsidian: **Settings → Community plugins** → make sure community plugins are
enabled → find **Draw** in the list and turn it on. If you copied files in while Obsidian was
running, reload the app (or disable/enable the plugin) to pick them up.

## Usage

- **Insert a drawing**: run the **Insert handwriting block** command (Cmd/Ctrl+P → search "Insert
  handwriting block"), or add it to the mobile toolbar (**Settings → Mobile → Toolbar**, it has a
  pencil icon) so it's one tap away. This inserts an empty block at the cursor and opens the
  editor immediately.
- **Edit an existing drawing**: tap its preview in the note. This works in both Live Preview and
  Reading view.
- **In the editor panel**: a small toolbar along the top has Pen, Eraser, Undo, Redo and Done.
  - Draw with the Pencil; fingers and palms are ignored while drawing (so you can rest your hand
    on the screen).
  - Drag the handle at the bottom-right corner of the canvas to resize it.
  - **Done**, tapping the dimmed area outside the panel, or pressing **Escape** on a hardware
    keyboard all save and close.
  - Changes also autosave about 500ms after you lift the pen, so switching apps mid-drawing
    doesn't lose work.

## How it's stored

Each block is a fenced ` ```ink ` code block containing one line:
`v1;id=<8-char id>;<width>x<height>;<payload>`. The payload is your strokes — coordinates
rounded to integers, pressure quantised to 0–255, delta-encoded, varint-packed, DEFLATEd and
base64'd. The full grammar, error handling, and byte-exact examples are in
[`specs/001-inline-handwriting-blocks/contracts/block-format.md`](specs/001-inline-handwriting-blocks/contracts/block-format.md).
The format is frozen as of v1: future versions of the plugin will always be able to read a v1
block, even if a later version changes how it writes new ones.

## Known limitations

- **No Pencil double-tap tool switching.** iPadOS doesn't expose Apple Pencil's double-tap
  gesture to third-party apps like Obsidian, so switching between Pen and Eraser is done from the
  toolbar rather than by double-tapping the Pencil. See
  [`specs/001-inline-handwriting-blocks/research.md`](specs/001-inline-handwriting-blocks/research.md) (R1) for the underlying platform constraint.
- **No search or OCR.** Handwriting is stored as strokes, not recognised text, and isn't
  searchable.
- **Not on the Community Plugins directory yet** — see [Installing](#installing) for the manual
  build-and-copy route.

## Development

```bash
npm install
npm test          # unit + DOM + integration tests (Vitest)
npm run typecheck # tsc --noEmit
npm run build     # esbuild -> main.js
npm run deploy    # build, then copy main.js/manifest.json/styles.css into a vault's plugin folder
```

All three of `npm test`, `npm run typecheck` and `npm run build` must pass before merging. The
project follows test-driven development (see
[`.specify/memory/constitution.md`](.specify/memory/constitution.md)); the full spec, design
docs and task list for the current feature live under
[`specs/001-inline-handwriting-blocks/`](specs/001-inline-handwriting-blocks/), including a
manual on-device validation checklist in
[`quickstart.md`](specs/001-inline-handwriting-blocks/quickstart.md).
