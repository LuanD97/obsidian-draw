# Contract: Plugin Surface (what the user and Obsidian see)

## Manifest

| Key | Value |
|-----|-------|
| `id` | `obsidian-draw` |
| `name` | `Draw` (display name; final wording open) |
| `minAppVersion` | `1.5.7` (see research R3) |
| `isDesktopOnly` | `false` |

## Code block processor

- Language: `ink`. Registered with `registerMarkdownCodeBlockProcessor`.
- Output inside the block element:
  - Valid, non-empty drawing → `div.ink-preview` containing one `<svg class="ink-preview-svg">`
    (`viewBox="0 0 W H"`, `width:100%`, `max-width:Wpx`, paths with `fill="currentColor"`).
  - Valid, empty drawing → `div.ink-preview.is-empty` with the text "Tap to draw", sized W × H scaled.
  - Invalid → `div.ink-error` with the message from the block-format error table. Not tappable.
- Interaction: `pointerdown`/`mousedown` are prevented and stopped on `div.ink-preview` (so the tap
  can't move CodeMirror's cursor into the block); `pointerup` opens the editor overlay for
  `(ctx.sourcePath, id)`. Not `click`: per the Pointer Events spec, `preventDefault()` on a
  cancelable `pointerdown` for `pointerType` `pen`/`touch` suppresses the browser's compatibility
  `mousedown`/`mouseup`/`click`, so a real Pencil or finger tap never produces a `click` here.
- Works in Live Preview and Reading view. No canvas is ever created by the processor.

## Command

| Id | Name | Kind | Behaviour |
|----|------|------|-----------|
| `obsidian-draw:insert-block` | Insert handwriting block | `editorCallback` | Inserts `newBlockMarkdown` for a new drawing (default size, fresh id) at the cursor on its own lines, awaits `MarkdownView.save()`, then opens the overlay for it |

The command has an icon (`pencil`), so it can be added to the mobile toolbar via
Settings → Mobile → Toolbar.

## Editor overlay

- Attached to `document.body` as `div.ink-overlay` (fixed, inset 0, above Obsidian's UI, a dim
  scrim behind the panel). Never inside the note's editor. `div.ink-panel`, a child of the overlay,
  is the visible card holding the toolbar and surface; it sizes to fit them (roughly the drawing's
  own size plus chrome) rather than filling the screen, so the rest of the note stays visible
  (dimmed) around it. The safety property that matters — staying outside the note's editable DOM —
  comes from being attached to `document.body`, not from covering the whole screen.
- Toolbar (`div.ink-toolbar`): Pen, Eraser (with `is-active` on the active tool), Undo, Redo (with
  `disabled` when unavailable), Done. Buttons accept finger and Pencil.
- Surface (`div.ink-surface`): two stacked canvases (static and live) plus `div.ink-resize-handle`
  at the bottom-right corner. The surface has `touch-action:none; -webkit-user-select:none;
  -webkit-touch-callout:none` and a non-passive `touchstart` listener calling `preventDefault()`.
- Save and close routes (there is no system back gesture on iPad that reaches the overlay):

  | Event | Action |
  |-------|--------|
  | Done button | flush, then close |
  | Escape key (hardware keyboard) | flush, then close |
  | `visibilitychange` → `hidden` (app switch, lock screen) | flush immediately, stay open |
  | Plugin `onunload` (disabled or updated) | flush, then close |
- Failure banner (`div.ink-banner`) when a save returns `not-found` or `duplicate`, with
  **Append to note** and **Close without saving** (the latter asks for confirmation).
  When a save returns `file-missing`, the banner reads "This note no longer exists" and offers
  **Copy drawing to clipboard** (a complete `ink` block with a fresh id) and **Close without saving**.
- On close: canvases get `width = height = 0` and are removed; all listeners are released.

## Styles

`styles.css` defines only the classes above and uses Obsidian CSS variables (`--text-normal`,
`--background-primary`, `--interactive-accent`, …), so themes apply automatically.
