# Research: Canvas Mode — Live Strokes Over Typed Text

Phase 0 output for [plan.md](./plan.md). Each item marked **(spike-validated)** is a technical bet
this exploration exists to test on-device; a negative on-device result there is itself a valid
finding for the go/no-go recommendation (FR-011), not a plan failure — record it in this file when
it happens, the same way spec 001's R5 recorded RDP simplification failing on-device.

## R1. Capturing pen input across the whole note (spike-validated — revised on-device)

- **Decision**: Attach a single `pointerdown`/`pointermove`/`pointerup`/`pointercancel` listener to
  `.cm-scroller` with `{ capture: true, passive: false }`. On pen contact (`classifyPointer(event)
  === 'pen'`, reusing spec 001's `editor/input-filter.ts` unchanged), call `preventDefault()` and
  route the stroke to the overlay; otherwise let the event continue unmodified so touch/mouse
  scrolling, selection, and cursor placement behave exactly as before Canvas Mode existed.
- **Rationale**: This is the only interception point that sees every pen contact over both margins
  and text before Obsidian's own editor handlers act on it, without needing a pointer-events trick
  that would also have to distinguish pen from touch at the CSS layer (CSS cannot do that). Reusing
  `classifyPointer` keeps the pen/finger/hover distinction identical to Block Mode's already-tested
  logic instead of a second implementation.
- **Alternatives considered**: A transparent full-note overlay with `pointer-events: auto` at all
  times was rejected because it would swallow every touch/mouse interaction with the note (no way to
  scroll or place the cursor with a finger while Canvas Mode is on) unless it re-dispatches non-pen
  events to the element underneath, which is more fragile than not intercepting them in the first
  place.
- **Risk, confirmed on-device and fixed**: CM6/Obsidian did **not** pre-empt the pointerdown itself —
  the original risk as written didn't materialize. What actually happened instead: on the first
  on-device pass, the Pencil scrolled the note instead of drawing (no ink appeared at all). WebKit's
  compositor can commit to a `touch-action`-driven pan before a `pointerdown`'s `preventDefault()` is
  seen to matter, and `preventDefault()` on the pointer events alone — the only thing implemented
  pre-device-testing — was not enough to stop it, matching the exact caveat already on record in
  `CLAUDE.md`'s "Touch defaults" section (`preventDefault()` on `touchstart`, not just on the pointer
  events). Since `.cm-scroller` must keep panning for finger touch (unlike Block Mode's dedicated
  drawing panel, which sets `touch-action: none` unconditionally), the fix additionally listens for
  `touchstart` and toggles `touch-action: none` on the scroller **only for the duration of a stylus
  contact**, detected via WebKit's non-standard `Touch.touchType` (`'stylus'` vs `'direct'`) since
  neither CSS nor `pointerType` alone can make that distinction up front; it's restored on
  `touchend`/`touchcancel`/deactivation. See `src/canvas/pointer-capture.ts`. Once this was in place,
  Pencil input was confirmed captured and ink appeared on-device — R1's core bet (a capturing-phase
  listener on `.cm-scroller` is a viable interception point at all) is **confirmed**; the
  `touch-action` toggle was the missing piece, not a change to the interception point itself.

## R2. Overlay placement and scroll sync (spike-validated)

- **Decision**: Insert one absolutely-positioned `div.canvas-mode-overlay` as a sibling of
  `.cm-content`, inside `.cm-scroller`, sized to the scroller's full scrollable width and height
  (not just the centered readable-line column), with `pointer-events: none` by default. This makes
  it scroll natively with the note (it's a normal child of the same scrolling container) with no
  manual scroll-offset bookkeeping, and keeps it outside `.cm-content`'s `contenteditable` region
  (constitution IV, Scribble avoidance).
- **Rationale**: `.cm-scroller` is the single scrolling ancestor CodeMirror uses; anything inside it
  moves in lockstep with the text without a `scroll` event handler. Spanning the full scroller width
  (not just the column) is what makes drawing in the visual margins possible at all — the margins are
  empty space inside `.cm-scroller` but outside `.cm-content`.
- **Alternatives considered**: A `document.body`-attached overlay (Block Mode's approach) was
  rejected here because Block Mode's overlay is a modal panel that opens/closes over a static
  background; Canvas Mode's overlay must track continuous scrolling of live, reflowing content,
  which is what being a scroll-sibling gives for free.

## R3. Anchoring strategy: position in the file, not a content fingerprint (spike-validated)

- **Decision**: An annotation's anchor is simply where its `ink-canvas` block sits in the file:
  placed as its own line immediately after the paragraph it was drawn beside. On render, the block's
  own (hidden) line position is resolved with CodeMirror's `EditorView.coordsAtPos()` to get its
  on-screen `(x, y)`; the annotation's strokes are drawn with that point as their coordinate origin.
  No separate content-hash or line-number anchor is stored.
- **Rationale**: This satisfies FR-002 (reflows with the paragraph, not a fixed page coordinate) using
  exactly the mechanism Markdown already gives for free — normal text reflow moves the block's line
  along with the paragraph before it, the same way spec 001's blocks already move with the note when
  unrelated text changes elsewhere. It also means the *existing*, already-tested id-based locate/update
  machinery from spec 001 (`document/locate.ts`, `document/update.ts`) is directly reusable for saving,
  with no new fingerprint-matching module to write and test from scratch — a meaningful scope reduction
  for a one-branch spike (Principle V).
- **Alternatives considered**: A content-fingerprint anchor (hash of the paragraph's text, matched on
  reload) was the original idea in the spec's Assumptions. Rejected for the spike because it adds a
  whole matching/fallback module whose only benefit over position-in-file is surviving a paragraph
  being *moved* elsewhere in the note without dragging its annotation along — not a scenario in any of
  the three prioritized user stories. Documented as a known limitation (see Edge Cases outcomes in
  quickstart.md), and as future work if Canvas Mode proceeds past the spike.
- **Consequence for the "paragraph deleted" edge case**: if the anchored paragraph is deleted
  entirely, the block's line simply becomes adjacent to whatever text now precedes it (or the top of
  the note, if it was first). This is a graceful, non-corrupting degradation — recorded as an
  "acceptable limitation" outcome, not a "blocks this approach" one.

## R4. Hiding raw `ink-canvas` block source in Live Preview (spike-validated)

- **Decision**: A CodeMirror `ViewPlugin` scans the visible document range each update for
  `ink-canvas` fences (via the extended `document/locate.ts` scanner) and provides a
  `Decoration.replace()` spanning each block's full range (opening fence through closing fence)
  with a zero-size widget, so it takes no visual space and never shows raw base64 to the user.
- **Rationale**: Canvas Mode annotations are never meant to be read or edited as text — unlike Block
  Mode blocks, which the user deliberately taps to open an editor. Leaving them visible as raw fenced
  blocks between paragraphs would defeat the "draw in the margin" experience entirely.
- **Risk**: interaction with Obsidian's own Live Preview decorations (which already hide fence
  markers for known languages) is untested; a plain `ink-canvas` info string is unlikely to collide
  with any built-in renderer, but this needs on-device confirmation (quickstart item 3). If a user's
  cursor lands inside a hidden range, CodeMirror's default behavior is to reveal the source for that
  line — acceptable for a spike (a rare, recoverable edge case) rather than something this plan tries
  to prevent outright.

## R5. Canvas Mode on/off persistence

- **Decision**: A YAML frontmatter key, `canvas-mode: true`, read/written through Obsidian's
  `FileManager.processFrontMatter` (which is itself an atomic, id-free read-modify-write, consistent
  with constitution III). The "Turn note into canvas" command toggles this key and, when turning on,
  activates the ViewPlugin/pointer-capture for that note's active editor.
- **Rationale**: Simple, human-readable, inline in the note (constitution II), and Obsidian already
  ships a purpose-built API for frontmatter that avoids hand-rolling YAML parsing.
- **Alternatives considered**: Inferring the mode from the mere presence of `ink-canvas` blocks was
  rejected — it would make the mode impossible to turn off without deleting content, and a note with
  zero annotations yet couldn't be marked "on."

## R6. Stroke payload reuse

- **Decision**: Reuse `format/codec.ts` (`encodePayload`/`decodePayload`) and `format/varint.ts`
  unchanged. Canvas Mode's decode path calls `decodePayload(payload, SANITY_BOUND, SANITY_BOUND)`
  with a large fixed sanity bound (not a real canvas size) purely to reject corrupt data with
  wildly out-of-range coordinates, matching constitution III's "decoders MUST reject" intent without
  reintroducing a fixed drawing area.
- **Rationale**: The payload grammar (zigzag-varint absolute first point, varint deltas, deflate,
  base64) already supports negative absolute coordinates for `x0`/`y0` — which is exactly what's
  needed for a stroke's first point to sit to the left of or above its anchor (e.g., a margin note
  anchored at a paragraph's start but drawn slightly above it). No format change is needed; only the
  *bounds used for validation* differ from Block Mode's real width/height.
- **Alternatives considered**: A new payload format without bounds checking was rejected — corrupt
  or hostile data should still fail closed, per constitution III and FR-010.

## R7. Spanning strokes across the margin/text boundary

- **Decision**: A stroke's anchor is decided once, by whichever paragraph is nearest to the stroke's
  *first* point (`pointerdown`), using the same "which annotation/paragraph is this near" resolution
  used for starting a new annotation. The rest of the stroke — including the part that crosses into
  or out of the margin — is stored as one unbroken stroke in that annotation, with no coordinate
  clamping (unlike Block Mode, which clamps to `[0, width] × [0, height]`).
- **Rationale**: FR-011/US3 explicitly requires one continuous stroke spanning both regions; splitting
  it at the margin/text boundary would visually break the connecting line the feature is meant to
  validate.

## R8. Reading view

- **Decision**: Out of scope for this spike unless time remains after User Stories 1–3 are validated
  in Live Preview (per the spec's Assumptions). If reached, render a static SVG preview per
  annotation via `registerMarkdownCodeBlockProcessor('ink-canvas', ...)`, reusing
  `render/svg-preview.ts` unchanged, positioned via normal document flow rather than an anchor
  point (Reading view has no live cursor/caret concerns, so this is simpler than the Live Preview
  case). If not reached, a Canvas Mode note in Reading view (or any Obsidian install without this
  plugin) shows only its frontmatter and ordinary fenced code blocks — inert and harmless, never
  corrupted (FR-010's "malformed/unrecognized" guarantee extended to "plugin absent").

## R9. No visible margin (narrow viewport / split-screen)

- **Decision**: No special handling. The overlay still spans the full `.cm-scroller`, so drawing
  directly over text (US2) continues to work; a margin-specific annotation simply has nowhere empty
  to sit and will visually overlap adjacent text. Recorded as an accepted limitation for the spike
  (SC-002), not something this plan attempts to solve (e.g., by reflowing text to make room), which
  would be a much larger feature.

## R10. Undo/erase scope

- **Decision**: Reuse spec 001's `model/history.ts` `History` class and `Command` type completely
  unchanged, one `History` instance per annotation (each annotation is treated as a `Drawing`-shaped
  value for history purposes, with `width`/`height` unused zeros since Canvas Mode never resizes).
  Session-wide undo/redo ordering across annotations is a thin, separate ledger in
  `src/canvas/session.ts`: a chronological list of annotation ids, one entry per applied command,
  telling session-level "Undo" which per-annotation `History` to call next. Erase hit-testing reuses
  `model/erase.ts` unchanged, scoped to whichever annotation's strokes the eraser gesture overlaps.
- **Rationale**: `History.apply`/`undo`/`redo` are written against a single `Drawing`'s state, not a
  collection — bolting a multi-entity concept onto that class would mean either changing its public
  shape (churn for Block Mode's already-tested, working code) or duplicating it. Wrapping it per
  annotation and keeping the cross-annotation ordering as a separate, new piece of session state
  reuses the tested class byte-for-byte and keeps the new piece (the ledger) small enough to unit
  test directly. FR-009 only asks for parity with Block Mode's undo/eraser behavior, not any
  specific cross-annotation semantics beyond "the last thing done is the first thing undone."

## R11. Activation glue: two on-device-only bugs found in `main.ts`/`live-session.ts`

Neither of these was predicted pre-implementation; both were found from real on-device reports
during the first round of manual testing, not from the automated suite (both are exactly the kind of
undocumented-Obsidian/CM6-internals risk that glue code, by nature, can't be unit-tested against —
constitution v1.1.0's glue exemption). Recorded here, not just as commit messages, so a future agent
doesn't have to rediscover them.

- **Frontmatter toggle race (fixed)**: `toggleCanvasMode` originally wrote `canvas-mode` via
  `app.fileManager.processFrontMatter`, then immediately called `syncCanvasSession()`, which decides
  whether to activate by re-reading `app.metadataCache.getFileCache(file)?.frontmatter`.
  `processFrontMatter`'s returned promise does not guarantee the metadata cache has already been
  re-parsed by the time it resolves, so that immediate re-read could still observe the *pre-toggle*
  value and skip activation — the frontmatter property showed as ticked (the write itself succeeded),
  but no session, and therefore no pointer capture, was ever created. Nothing re-triggered activation
  until an unrelated `active-leaf-change`/`file-open` fired later with the by-then-updated cache
  (e.g. switching notes away and back), which is why the failure looked intermittent rather than
  reliably reproducible. **Fix**: `toggleCanvasMode` now activates/deactivates directly from the
  boolean it just wrote, never round-tripping through the cache for its own toggle.
- **`insertBefore` DOM-structure crash (fixed)**: `CanvasModeSession`'s constructor originally called
  `view.scrollDOM.insertBefore(overlayEl, view.contentDOM)`, assuming `contentDOM` is always a
  *direct* child of `scrollDOM`. That assumption didn't hold on the test device/Obsidian version and
  threw a `DOMException`, uncaught, from inside `activateCanvasSession` — reachable from
  `workspace.onLayoutReady()` at startup for any note left with `canvas-mode: true`, which turned
  "toggle it on" into a **plugin-failed-to-load crash loop on every subsequent launch** (the
  frontmatter stayed `true`, so every restart hit the same crash). **Fix**: `overlayEl` is appended
  to `scrollDOM` directly instead (`position: absolute` + `z-index` don't depend on sibling order),
  and every reachable boundary (`main.ts`'s activate/deactivate, and `CanvasLivePluginInstance`'s
  `update`/`destroy`, which CM6 calls directly as part of its own render/teardown cycle) now catches
  and logs/notifies instead of letting an exception propagate — so a *future* undocumented-internals
  surprise degrades to "Canvas Mode doesn't start for this note" instead of crashing the plugin or
  the editor again.
- **Takeaway for future glue work in this area**: `editor.cm`, CM6's exact internal DOM shape, and
  Obsidian's metadata-cache update timing are all undocumented/unspecified behavior this plugin
  depends on. Every one of the three confirmed-on-device bugs so far (this section plus R1's
  `touch-action` finding) came from exactly that category, not from the pure/tested modules. Any new
  code touching these should assume the same and fail closed (try/catch, no data-handling decisions,
  visible `Notice`/console output) rather than assume the happy path.
