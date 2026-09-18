# Contract: Canvas Mode Toggle & Command Surface

## Command

**"Turn note into canvas"** — registered via `Plugin.addCommand`, available from the command
palette and the mobile toolbar (FR-001a), operating on the active note.

- **When off → invoked**: sets frontmatter `canvas-mode: true` via
  `app.fileManager.processFrontMatter` (atomic, per research.md R5); activates the CM6 ViewPlugin
  (research.md R4) and the pointer-capture listener (research.md R1) for that note's active editor
  view; scans the note for existing `ink-canvas` blocks (`src/canvas/scan.ts`) to populate
  `CanvasModeNoteState.annotations`.
- **When on → invoked**: sets `canvas-mode: false`; deactivates the ViewPlugin and pointer-capture
  for that editor view. Existing `ink-canvas` blocks are left untouched in the file (turning Canvas
  Mode off is not destructive) — they simply stop rendering as annotations until the mode is turned
  back on.
- **Does not affect** the existing "Insert handwriting block" command (Block Mode) in any way
  (FR-001a): a note may have Block Mode blocks, Canvas Mode annotations, or both, independently of
  each other and of this toggle.

## Activation scope

Canvas Mode's ViewPlugin/pointer-capture are active only while:
1. `canvas-mode: true` is set in the note's frontmatter, **and**
2. That note is the active file in an open Markdown editor view (Live Preview).

Switching to a different note deactivates the previous note's overlay; opening a `canvas-mode: true`
note (including via startup restore of the last session) reactivates it automatically — the user
does not need to re-run the command every time they open the note, only to turn the mode on or off.

## Frontmatter shape

```yaml
---
canvas-mode: true
---
```

- Coexists with any other frontmatter keys the note already has; only this one key is added/changed.
- `false` or absent are both treated as "off" — the plugin does not distinguish "never turned on" from
  "explicitly turned off," since there is no behavioral difference.
- A `canvas-mode` value of any other type (string, number, etc.) is treated as absent/off rather than
  erroring, consistent with FR-010's "malformed input degrades harmlessly" principle applied to
  frontmatter as well as to annotation blocks.

## Degradation without the plugin

A note with `canvas-mode: true` and some `ink-canvas` blocks, opened in an Obsidian without this
plugin installed, or in this plugin's Reading view before/if R8 (Reading view support) is reached,
shows: the frontmatter as an ordinary property (or raw YAML, depending on Obsidian's frontmatter
settings) and each `ink-canvas` block as an inert, valid fenced code block — never as broken syntax,
never rewritten. This mirrors Block Mode's existing graceful-degradation guarantee for the `ink`
block format.
