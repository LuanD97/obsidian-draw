# Data Model: Canvas Mode — Live Strokes Over Typed Text

Phase 1 output for [plan.md](./plan.md). The on-disk encoding is defined in
[contracts/canvas-annotation-format.md](./contracts/canvas-annotation-format.md) and
[contracts/canvas-mode-toggle.md](./contracts/canvas-mode-toggle.md); this file describes the
in-memory entities. `Point`, `Stroke`, and undo `Command` reuse spec 001's
[data-model.md](../001-inline-handwriting-blocks/data-model.md) definitions from
`src/model/types.ts` and `src/model/history.ts` unchanged.

## Annotation

One anchored group of strokes — the unit stored as a single `ink-canvas` block.

| Field | Type | Rules |
|-------|------|-------|
| `id` | string | 8 chars `[0-9a-z]`; unique within the note; never changes after creation (same shape as Block Mode's block id, reusing `format/id.ts`) |
| `strokes` | `Stroke[]` | Drawing order; may be empty; first point of each stroke is an absolute, signed `(x, y)` offset from the annotation's anchor point (see below), reusing `format/codec.ts` unchanged |

Unlike Block Mode's `Drawing`, an `Annotation` has **no `width`/`height`**: there is no bounded
canvas, so coordinates are only sanity-bounded on decode (research.md R6), not clamped to a fixed
box.

## Anchor (derived, not stored)

The anchor is not a field of the annotation — it is wherever the annotation's `ink-canvas` block
currently sits in the file, resolved fresh every render (research.md R3):

| Concept | How it's obtained |
|---------|--------------------|
| Anchor point (screen coords) | `EditorView.coordsAtPos(blockStartPos)` for the block's (hidden) start line, in the currently rendered document |
| "Which paragraph is this beside" | Implicit: whatever paragraph immediately precedes the block's line in the file |

This is why there is no `AnchorFingerprint` entity and no matching/fallback logic: paragraph-relative
anchoring (FR-002) falls out of normal Markdown reflow once the block's line is placed right after
its paragraph.

## AnnotationLocation (result of finding an annotation in the note text)

Mirrors spec 001's `BlockLocation`, produced by the extended `document/locate.ts` (fence language
parameterized to `ink-canvas`) via the thin `src/canvas/locate.ts` wrapper.

| Variant | Fields | Meaning |
|---------|--------|---------|
| `found` | `start`, `end` (character offsets of the payload line), `prefix` | Exactly one `ink-canvas` block with this id |
| `not-found` | — | No `ink-canvas` block with this id |
| `duplicate` | `count` | The id appears in more than one `ink-canvas` block |

## AnnotationBlockRef (result of scanning the whole note)

Produced by `src/canvas/scan.ts` on note open / document change, to discover every annotation
present without already knowing its id.

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Parsed from the block header |
| `blockStart`, `blockEnd` | integer | Character offsets of the full fenced block (fence to fence), used by the CM6 decoration (R4) |
| `payloadStart`, `payloadEnd` | integer | Character offsets of just the payload line, used for save-time updates |

## CanvasModeNoteState

The in-memory state for one note currently open with Canvas Mode active (`src/canvas/session.ts`).

| Field | Type | Notes |
|-------|------|-------|
| `file` | Obsidian file object (`TFile`) | Same rationale as spec 001's `EditingSession.file`: Obsidian keeps this current across renames |
| `annotations` | `Map<id, Annotation>` | Loaded from `scan.ts` on open; kept in sync as strokes are added |
| `history` | `Command[]` (undo) / `Command[]` (redo) | Reuses spec 001's `model/history.ts` shape, each `Command` additionally carries `annotationId` (research.md R10) |
| `dirty` | `Set<id>` | Annotation ids with unsaved changes, drained by the save queue |

### Save flow per annotation

Reuses spec 001's save-state machine (`EditingSession`'s `clean → dirty → saving → …` transitions,
including `orphaned` on `not-found`/`duplicate`/`file-missing`), applied per annotation id instead
of once per session:

- **New annotation** (pen-down outside any existing annotation's stroke bounds): on first commit,
  `src/canvas/insert.ts`'s `insertAnnotationAfterParagraph(text, pos, blockMarkdown)` finds the end
  of the paragraph containing/nearest-before the pen-down position in the *current* file text and
  inserts a blank line plus the new block — never trusting a stale position captured when Canvas
  Mode was turned on.
- **Existing annotation** (pen-down within an existing annotation's stroke bounds, or continuing one
  mid-gesture): `src/canvas/update.ts`'s `applyAnnotationUpdate` locates it fresh by id via
  `locateAnnotation` and replaces only its payload line, byte-identical elsewhere — the same
  guarantee spec 001 tests for `applyBlockUpdate`.
- **Orphaned** (id not found, or duplicated, at save time — e.g., another device deleted or
  duplicated the block via sync): surfaces the same kind of recoverable notice Block Mode shows,
  scoped to that one annotation; other annotations in the note continue saving normally.

## Frontmatter flag

| Key | Type | Meaning |
|-----|------|---------|
| `canvas-mode` | boolean | `true` while Canvas Mode is turned on for this note; absent or `false` means off. Read/written via Obsidian's `FileManager.processFrontMatter` (research.md R5), not hand-parsed YAML. |
