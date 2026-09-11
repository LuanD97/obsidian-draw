# obsidian-draw — handoff notes

An Obsidian plugin for handwriting with Apple Pencil on iPad, where the drawings are
stored **inline in the note's `.md` file** rather than as separate `.svg`/drawing files.

Status: design agreed in conversation, no code written yet. The repo is empty apart
from a placeholder `README.md`.

## Why this exists

- The user currently uses the **Ink** plugin (daledesilva/obsidian_ink). It works, but
  separate drawing files plus embeds are annoying, and the Ink editor pane previously
  disappeared or behaved badly on iPad.
- We are building a new plugin rather than forking Ink:
  - Ink is licensed **CC BY-NC-ND 4.0** (no derivatives), so a modified version can't be shared.
  - Ink always stores drawings in separate files (tldraw JSON), which is the thing the user wants to avoid.

## User setup

- **Primary device:** iPad with Apple Pencil.
- **Development machine:** Linux, where this repo lives. The user also has a **Mac**, which
  can attach Safari Web Inspector to Obsidian on the iPad for debugging.
- **Vault sync:** git, using the Obsidian Git plugin on the iPad, with iSH available as a
  shell. The vault is stored locally on the iPad, deliberately **not in iCloud**.
- **Usage:** small handwriting blocks mixed in with typed text, not whole handwritten pages.
- **Out of scope:** searchable handwriting and OCR.
- **Nice to have, not required:** notes looking reasonable outside Obsidian.

## Agreed design

### Storage: one fenced block per drawing, with the data on a single line

````md
```ink
v1;700x260;<base64 of compressed, delta-encoded strokes>
```
````

- The data is kept on **one line** so git's line-based merge still works when different
  parts of the same note change on different devices. A conflict only occurs if the same
  drawing is edited on both devices.
- Each block needs a stable **id** so a save can find it again after the file has changed
  underneath. Put it in the header, e.g. `v1;id=a8f3;700x260;...`. The exact format is
  still open; finalise it in the first implementation.
- Encoding pipeline:
  1. Simplify each stroke with Ramer–Douglas–Peucker.
  2. Round coordinates to integers and delta-encode them, keeping pressure.
  3. Pack as varints, compress (e.g. `fflate`), then base64.
- Target size: roughly 5–30KB for a dense block. Anything like tldraw-sized JSON is too big.

### Rendering and editing: static inline preview, tap to edit in a full-screen overlay

- **Inline:** `registerMarkdownCodeBlockProcessor('ink', ...)` renders a lightweight
  **static SVG** preview. This works in Live Preview and Reading view, and it's harmless
  if CodeMirror re-renders or virtualises the block.
- **Editing:** tapping the preview opens a **full-screen overlay attached to
  `document.body`**, outside the editor, containing the canvas, pen, eraser, undo/redo
  and a Done button. This avoids the iPad failure modes listed below. Inline editing
  inside the note is a possible later improvement, not v1.
- **Stroke rendering:** use `perfect-freehand` (pressure-sensitive outlines). Do **not**
  use tldraw; it's too heavy for this job.
- **Saving:**
  - Save on Done, plus a debounced autosave around 500ms after the pen lifts.
  - Write through `app.vault.process(file, fn)` so the read-modify-write is atomic.
  - Locate the block by its id. Don't trust stale line numbers from
    `ctx.getSectionInfo(el)`, because the file may have changed via typing or sync.
- **Commands:** "Insert handwriting block" inserts an empty block at the cursor and
  opens the overlay. It should also be usable from the mobile toolbar.

### iPad / WebKit pitfalls the design must handle

1. **Live Preview swaps widgets for source** when the cursor enters the block, and a
   Pencil tap can move the cursor. This is the likely cause of Ink's "disappearing
   editor", and the overlay design sidesteps it.
2. **iOS canvas memory cap:** canvases go blank when the total limit is exceeded.
   - Size canvases to `devicePixelRatio` but keep them bounded.
   - Free a canvas on close by setting `width = height = 0`.
   - Inline previews are SVG, never live canvases.
3. **Scribble** (iPadOS turns Pencil writing into text in editable regions): keep the
   drawing surface out of the contenteditable editor, which the overlay does.
4. **Touch defaults:**
   - Set `touch-action: none`, `-webkit-user-select: none` and `-webkit-touch-callout: none`.
   - Call `preventDefault()` on `touchstart` registered with `{ passive: false }`.
5. **Input:**
   - Only draw when `pointerType === 'pen'`; fingers and palms are ignored (or pan).
   - Use `getCoalescedEvents()` if available, detected at runtime.
   - Ignore Pencil **hover** events (pointermove with no buttons pressed on newer iPads).
6. **manifest:** set `isDesktopOnly: false`. Use no Node or Electron APIs.

## Dev workflow

- Build on this machine with the standard Obsidian sample-plugin setup (TypeScript + esbuild).
- Copy or sync the build (`main.js`, `manifest.json`, `styles.css`) into the vault's
  `.obsidian/plugins/obsidian-draw/`; git sync then carries it to the iPad.
- **Debugging:**
  - On the iPad: Safari Web Inspector from the Mac.
  - Quick layout checks on desktop: run `app.emulateMobile(true)` in the dev console.
    This does not reproduce Pencil behaviour.

## Suggested next steps

1. Scaffold the plugin: manifest, esbuild config, `main.ts` with the code block
   processor and the insert command.
2. Implement the stroke model and the encode/decode functions, with unit tests covering
   round-trip correctness and size.
3. Build the overlay editor: canvas, perfect-freehand, pen-only input, undo, eraser.
4. Implement save-back through `vault.process` plus id lookup; test with concurrent edits.
5. Test on the iPad through Safari Web Inspector.
6. Later / optional:
   - Inline editing mode.
   - An "export block to SVG" command.
   - A migration command that converts existing Ink drawings to inline blocks.
