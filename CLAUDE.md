# obsidian-draw — handoff notes

An Obsidian plugin for handwriting with Apple Pencil on iPad, where the drawings are
stored **inline in the note's `.md` file** rather than as separate `.svg`/drawing files.

Status: **spec 001 (Block Mode — "Insert handwriting block") is implemented and working.** It lives in
`specs/001-inline-handwriting-blocks/` (spec, plan, research, data model, contracts, quickstart,
tasks) on branch `001-inline-handwriting-blocks`.

**Spec 002 (Canvas Mode — "Turn note into canvas") is a feasibility spike, implementation complete,
on-device validation in progress** on branch `002-whole-note-canvas`
(`specs/002-whole-note-canvas/`). Canvas Mode lets the user draw anywhere over a note's rendered Live
Preview (margins and typed text alike), anchored to the nearest paragraph, instead of Block Mode's
explicit fixed-size blocks — see that spec's `spec.md`/`plan.md` for the full design and
`quickstart.md`'s "Go/No-Go Recommendation" for current on-device status. **Read
`specs/002-whole-note-canvas/research.md`'s R1/R11 before touching `src/canvas/live-session.ts`,
`src/canvas/pointer-capture.ts`, or `src/main.ts`'s Canvas Mode wiring** — three real bugs were
already found and fixed there purely from on-device reports (a WebKit `touch-action`/pen-vs-touch
scrolling conflict, an Obsidian metadata-cache race on the frontmatter toggle, and a `.cm-content`
DOM-structure assumption that crashed the whole plugin on startup), and that section explains why
each one wasn't and couldn't have been caught by the automated test suite.

Both specs follow `.specify/memory/constitution.md` (v1.1.0): test-first for all logic, with thin
glue (registering commands/extensions, DOM measurement, wiring Obsidian/CM6 objects into tested
functions) exempt but covered by each spec's manual on-device checklist instead. Where these notes
and a spec differ, the spec and constitution win.

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
v1;id=k3f9x2ab;700x260;<base64 of compressed, delta-encoded strokes>
```
````

- The data is kept on **one line** so git's line-based merge still works when different
  parts of the same note change on different devices. A conflict only occurs if the same
  drawing is edited on both devices.
- Each block has a stable 8-character **id** (`[0-9a-z]{8}`) in its header, so a save can find
  it again after the file has changed underneath. The v1 format is final and specified in
  `specs/001-inline-handwriting-blocks/contracts/block-format.md`; it is frozen once released.
- Encoding pipeline:
  1. Round each stroke's coordinates to integers and pressure to 0–255, dropping a point only if
     it's an exact duplicate of the one before it. No geometric simplification (e.g. RDP): it was
     tried and dropped after User Story 2 on-device testing showed it collapsing a pen-down/pen-up
     taper to 1–2 points regardless of epsilon, discarding the pressure ramp and leaving blank/gappy
     patches on re-render — see `specs/001-inline-handwriting-blocks/research.md` R5. A dense block
     stays well inside the size budget without it.
  2. Delta-encode the (now quantised) coordinates, keeping pressure.
  3. Pack as varints, compress (e.g. `fflate`), then base64.
- Target size: roughly 5–30KB for a dense block. Anything like tldraw-sized JSON is too big.

### Rendering and editing: static inline preview, tap to edit in a panel outside the note

- **Inline:** `registerMarkdownCodeBlockProcessor('ink', ...)` renders a lightweight
  **static SVG** preview. This works in Live Preview and Reading view, and it's harmless
  if CodeMirror re-renders or virtualises the block.
- **Editing:** tapping the preview opens a card (`div.ink-panel`, sized to the drawing,
  not the screen) over a dim scrim (`div.ink-overlay`, fixed and attached to
  **`document.body`**), containing the canvas, pen, eraser, undo/redo and a Done button.
  The card and scrim are outside the note's editable DOM — never inside the
  contenteditable editor — which is what avoids the iPad failure modes listed below;
  that safety property is about staying outside the editable DOM, not about covering
  the whole screen, so the rest of the note stays visible (dimmed) around the card.
  Inline editing inside the note itself (typing/drawing directly in the note's own
  flow, no separate surface at all) is a possible later improvement, not v1.
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

For spec 001 (v1, Block Mode), steps 1–5 were superseded by
`specs/001-inline-handwriting-blocks/tasks.md` and are now done. **Spec 002 (Canvas Mode)** is the
realization of the "Inline editing mode" idea below, tracked separately in
`specs/002-whole-note-canvas/`; see its `tasks.md` and `quickstart.md`'s Go/No-Go section for what's
left (on-device checklist items 2–12 as of this writing).

1. Scaffold the plugin: manifest, esbuild config, `main.ts` with the code block
   processor and the insert command.
2. Implement the stroke model and the encode/decode functions, with unit tests covering
   round-trip correctness and size.
3. Build the overlay editor: canvas, perfect-freehand, pen-only input, undo, eraser.
4. Implement save-back through `vault.process` plus id lookup; test with concurrent edits.
5. Test on the iPad through Safari Web Inspector.
6. Later / optional:
   - Inline editing mode. → now spec 002 (Canvas Mode), in progress.
   - An "export block to SVG" command.
   - A migration command that converts existing Ink drawings to inline blocks.
