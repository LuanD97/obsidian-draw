# Data Model: Inline Handwriting Blocks

Phase 1 output for [plan.md](./plan.md). The on-disk encoding is defined in
[contracts/block-format.md](./contracts/block-format.md); this file describes the in-memory entities.

## Point

One sampled Pencil position, already quantised.

| Field | Type | Rules |
|-------|------|-------|
| `x` | integer | Canvas units, 0 ≤ x ≤ canvas width once committed (points outside are clamped at commit) |
| `y` | integer | Canvas units, 0 ≤ y ≤ canvas height once committed |
| `p` | integer | Pressure 0–255 (from `PointerEvent.pressure × 255`, rounded) |

## Stroke

One continuous Pencil contact, from pen-down to pen-up.

| Field | Type | Rules |
|-------|------|-------|
| `points` | `Point[]` | ≥ 1 point. A single-point stroke is a dot. Produced by RDP (ε = 0.5) + quantisation at commit and never re-simplified afterwards |

Derived (not stored): bounding box, used by the eraser and the minimum canvas size.

## Drawing (a handwriting block)

| Field | Type | Rules |
|-------|------|-------|
| `version` | integer | `1` for this feature |
| `id` | string | 8 chars `[0-9a-z]`; unique within the note; never changes after creation |
| `width` | integer | Canvas units; 64 ≤ width ≤ 4096 |
| `height` | integer | Canvas units; 64 ≤ height ≤ 4096 |
| `strokes` | `Stroke[]` | Drawing order; may be empty |

Validation on decode: header fields must parse, version must be supported, size must be in range,
and the payload must decode completely with no trailing bytes. Any failure produces a
`DecodeError` (kind: `malformed` or `unsupported-version`) and the block is shown as an error
placeholder and never rewritten (FR-008).

Invariant on save: every stroke's bounding box lies inside `width × height` (guaranteed by clamping
at commit and the resize minimum).

## BlockLocation (result of finding a block in the note text)

| Variant | Fields | Meaning |
|---------|--------|---------|
| `found` | `lineStart`, `lineEnd` (character offsets of the payload after the prefix, excluding the line ending), `prefix` | Exactly one `ink` block with this id |
| `not-found` | — | No `ink` block with this id |
| `duplicate` | `count` | The id appears in more than one `ink` block |

## Command (undo/redo history entry)

| Variant | Fields | Undo | Redo |
|---------|--------|------|------|
| `add` | `stroke` | remove last-added stroke | re-append it |
| `erase` | `removed: { index, stroke }[]` (ascending index) | re-insert each at its index | remove them again |
| `resize` | `from: {w,h}`, `to: {w,h}` | set size to `from` | set size to `to` |

History = `undo: Command[]`, `redo: Command[]`. Any new command clears `redo`. History lives only for
one editing session (FR-014).

## EditingSession

Owns one drawing while the overlay is open.

| Field | Type | Notes |
|-------|------|-------|
| `file` | Obsidian file object (`TFile`) | Where the block lives. Obsidian keeps this object current across renames and moves, so the session never stores a path |
| `id` | string | Target block id (may change once, after "Append to note") |
| `drawing` | Drawing | Current state |
| `tool` | `'pen' \| 'eraser'` | Starts as `pen` |
| `history` | History | See above |
| `dirty` | boolean | True if `drawing` differs from the last saved line |
| `saveState` | see below | |

### Save state transitions

```text
          change                 debounce 500 ms / close
 clean ───────────▶ dirty ─────────────────────────────▶ saving
   ▲                 ▲  │                                  │
   │                 │  └──── change while saving ────────▶│ (queued: one follow-up save)
   │                 │                                     │
   └──── write ok ───┴──────────── write ok, more queued ──┤
                                                           │ block not-found / duplicate
                                                           ▼
                                                        orphaned ──"Append to note"──▶ saving (new id)
                                                           │
                                                           └──"Close without saving" (confirmed)──▶ closed
```

- Closing from `clean` closes immediately without touching the note (FR-027).
- Closing from `dirty`/`saving` flushes and waits; if the result is `orphaned`, the overlay stays open.
- The outcome of every save, whether an autosave or a flush, reaches the session through the save
  queue's `onOutcome`, so `orphaned` is entered as soon as any save fails, not only on Done.
  Autosave is paused while orphaned.
- The save function reads `session.id` each time it runs, so saves follow the id switch after
  "Append to note".
- A save on a note that no longer exists returns `file-missing` → `orphaned`. The banner then offers
  "Copy drawing to clipboard" (a complete block with a fresh id) instead of "Append to note".

## CanvasSize rules

- **Default on insert**: `width = clamp(measuredColumnWidth, 200, 2000)` (fallback 700), `height = 260`.
- **Minimum while resizing**: `max(64, strokesBBox.right + 4)` × `max(64, strokesBBox.bottom + 4)`.
- **Maximum while resizing**: the larger of the current size and the overlay's available area at
  scale 1, never above 4096 (a canvas is never shrunk just because the screen is smaller).
- **Conflict rule**: if the minimum exceeds the maximum, the minimum wins; strokes are never cut off.
- **Display scale** (editor and preview): `min(1, availableWidth / width[, availableHeight / height])`.
