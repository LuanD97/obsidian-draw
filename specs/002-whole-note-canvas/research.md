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

## R12. Redraw was `docChanged`-only; CM6 relayouts on pure scroll too (found and fixed from on-device reports)

A second round of on-device testing (after R11's three fixes let drawing actually work) reported
three symptoms: input felt "very slow to go from input to page," ink "desynced" from its paragraph
every time the note was scrolled, and the note's scrollable area grew with blank space appearing
above the content after scrolling. Both root causes were confirmed directly against
`@codemirror/view`'s own source and types (`node_modules/@codemirror/view/dist/index.d.ts`), not
guessed from symptoms alone:

- **Redraw cost (the "slow" report)**: `CanvasModeSession.redraw()` ran on every single
  `pointermove` — the Pencil samples at high frequency, further multiplied by
  `getCoalescedEvents()` — and for each redraw it called `view.coordsAtPos()` (a layout-forcing
  measurement) once per *existing* static annotation, then cleared and repainted a canvas sized to
  the entire note's scrollable area (not just the viewport), synchronously, with no frame
  throttling. **Fix**: each static annotation's anchor point is now resolved once in `loadStatic()`
  (see below for when that reruns) and cached on the `StaticAnnotation`, so `redraw()` just reads it;
  and `onPenStart`/`onPenMove` now schedule at most one `redraw()` per animation frame via
  `requestAnimationFrame` instead of one per pointer event, coalescing a burst of moves into a single
  repaint.
- **Scroll desync and growing blank space (the "desync" report)**: `CanvasLivePluginInstance.update()`
  only called back into the session on `ViewUpdate.docChanged`. But CM6 does not measure a large
  document's line heights up front — it estimates them (`heightOracle`) and represents unmeasured
  regions with resizable `BlockGapWidget` spacers inside `.cm-content`, then corrects the estimate to
  the real measured height as previously off-screen lines scroll into view, with **no document edit
  involved**. That correction sets `ViewUpdate.heightChanged`/`geometryChanged`, not `docChanged` (per
  `ViewUpdate`'s own doc comments: `geometryChanged` — "the document was modified **or** the size of
  the editor, or elements within the editor, changed"; `heightChanged` — "the height of a block
  element in the editor changed"). Because the session never re-resolved anchors or resized the
  overlay on those events, a stroke's already-painted canvas pixels went stale the moment scrolling
  triggered a height correction anywhere above it — explaining both the visual drift and the
  overlay's (and hence the scroller's) fixed-at-construction size falling out of sync with the note's
  now-corrected real height. **Fix**: the ViewPlugin now reacts to `update.geometryChanged` (a
  superset of `docChanged` per its own doc comment) instead of `update.docChanged` alone, calling a
  renamed `CanvasModeSession.onLayoutChanged()` (was `onDocChanged()`) that re-runs `loadStatic()` and
  `resizeAndRedraw()` on any layout-affecting update, not just a text edit.
- **Not yet on-device confirmed**: both fixes are typecheck/test/build-clean (`npm test` — 296 tests
  — all pass unchanged, since this area is glue per the constitution's exemption) but the actual
  on-device feel (has the lag gone, does scrolling really stop desyncing the ink) has not been
  re-checked with the user's iPad yet. Record the outcome here, the same way R11 recorded its three
  fixes' confirmation status, once that happens.
- **Takeaway**: this is the same category of risk as R1/R11 — undocumented-by-design internal CM6
  behavior (here, height-estimate correction during scroll) that the automated suite structurally
  cannot exercise (there is no real CM6 layout/measurement in a headless test environment). Any future
  redraw-triggering logic in this area should keep treating `docChanged` as insufficient on its own
  for "did the layout change" and prefer `geometryChanged`.

## R13. R2 reversed: the overlay is sized to the viewport, not the whole note (found and fixed from on-device reports)

R12's `geometryChanged` fix stopped the ink from drifting off its paragraph, but a third on-device
round reported two symptoms that survived it: input lag got worse the longer the note was (small
notes near-instant, long notes appreciably laggy), and the note's scrollable area still grew, with
blank space appearing above the content, as the user scrolled.

Both traced to the same design choice: **R2 sized `.canvas-mode-overlay` to
`.cm-content`'s measured `scrollWidth`/`scrollHeight` — a stand-in for "the whole note's height" —
and appended it inside `.cm-scroller` so it would scroll natively.** Two consequences followed that
R2 didn't anticipate:

- **Redraw cost scaled with note length, not viewport size.** Every redraw (already throttled to one
  per animation frame by R12's fix) still cleared and repainted a canvas whose pixel area was the
  *entire note's* rendered height × width, at up to 2x device pixel ratio — for a long note, that's a
  canvas many times taller than what's ever on screen at once, recomposited on every frame of a
  stroke regardless of how much of it was actually visible.
- **The overlay's own JS-measured size was exactly the fragile, ever-corrected quantity R12 diagnosed.**
  `content.scrollHeight` is CM6's *current estimate* of the document's total height (real for rendered
  lines, `BlockGapWidget`-estimated for the rest — see R12), so sizing our own overlay from it meant
  re-measuring and resizing the overlay itself every time that estimate changed while scrolling — and
  since the overlay is a `position: absolute` descendant of the scrolling `.cm-scroller`, its own
  (JS-driven, and therefore laggier than CM6's own internal layout pass) size directly determines part
  of what the user's scroll gesture feels like it's scrolling through, which is what read as "blank
  space growing at the top."

**Fix**: stop tracking the document's total height at all. `CanvasModeSession`'s overlay/canvas is now
appended to `view.dom` (CM6's outer, non-scrolling `.cm-editor` root — public, documented API) and
sized to `view.dom.clientWidth/clientHeight` (the editor's visible viewport), never the scrollable
document. Since the overlay no longer scrolls "for free" as a scrolling child, `redraw()` now
explicitly `ctx.translate(-scrollLeft, -scrollTop)`s before drawing (strokes are still stored/anchored
in absolute document-space coordinates, per R2/R3, unchanged — only the paint-time mapping onto the
canvas changed) and a `scroll` listener on `.cm-scroller` schedules a repaint (reusing the same rAF
throttle as live drawing) so already-painted ink keeps tracking scroll instead of only refreshing on
the next `geometryChanged`/pointer event. Off-screen static and session annotations are also now
skipped via a cached bounding-box vs. current-viewport intersection check
(`model/erase.ts`'s `strokesBoundingBox`/`boxesIntersect`, shared with `session.ts`'s existing
erase-target hit-testing) before paying for `strokeOutlinePath`'s perfect-freehand work, so redraw cost
no longer scales with how many annotations a note has accumulated either.

- **Alternatives considered**: keeping the overlay full-note-sized but only clearing/redrawing the
  visible sub-rectangle each frame (a smaller patch than reversing R2) was rejected as still leaving
  the overlay's *size* tied to the fragile `scrollHeight` estimate — it would have fixed the lag but
  not the blank-space growth, which came from the size measurement itself, not from what area got
  repainted.
- **Not yet on-device confirmed.** Like R12, this is typecheck/test/build-clean but unverified on the
  iPad — record the outcome here once checked, including whether the explicit scroll-triggered redraw
  introduces any visible one-frame lag of ink "catching up" during a fast scroll fling (a plausible,
  acceptable-if-so cosmetic trade-off of giving up native scrolling, not a correctness bug).
- **Takeaway**: the R2 alternatives-considered section rejected a `document.body`-attached overlay
  specifically because it would have to "track continuous scrolling of live, reflowing content,"
  reasoning that a scrolling-child overlay got that "for free." On-device evidence now shows that
  "for free" was true only for *position*, not for *cost* or *size stability* — both turned out to
  depend on the same undocumented, continuously-revised CM6 internal quantity (document height
  estimate) that R12 already flagged as unreliable to build on.

## R14. `syncCanvasSession` trusted its own cache over the live plugin's session (found alongside R13, not yet confirmed as the cause of a reopen failure)

The same round that reported R13's symptoms also reported that a note once turned into a canvas could
no longer be reopened at all (Obsidian showing a generic "failed to open" error). The root cause of
*that specific error* is not confirmed — it may be a knock-on effect of R13's redraw cost being severe
enough to stall something else, or it may be independent — but a real, separate bug was found by
inspection while investigating it: `main.ts`'s `syncCanvasSession()` decided whether to (re)activate
Canvas Mode by comparing `this.activeCanvasFile !== file` against its own cached `TFile` reference,
not by checking whether the *current* view's editor actually still had a session. Obsidian can reuse
the same `TFile` object across closing and reopening the same note's leaf, in which case CM6 tears
down the old `EditorView` (and, via `CanvasLivePluginInstance.destroy()`, its session) without
`main.ts` hearing about it — leaving `activeCanvasFile` pointing at a by-reference-equal file whose
session no longer exists. On reopen, the equality check read that as "already active" and skipped
creating a session for the *new* `EditorView` entirely, so Canvas Mode silently never came back for
that note. **Fix**: `syncCanvasSession` now checks `getCanvasSession(editorView)?.session` on the
current view directly — the live plugin instance is the source of truth, not `main.ts`'s cache of it.

**File integrity ruled out as the cause**: the user confirmed the note's `ink-canvas` blocks are
visible with their stroke payload intact in git's diff view, i.e. the saved Markdown itself is well-
formed and un-corrupted. That narrows "failed to open ''" to a plugin/Obsidian-activation-path failure
rather than file corruption — consistent with (though not yet proven to be explained by) this fix.
**Still not on-device confirmed** whether this fix actually resolves the reopen failure — it did not:
the user re-confirmed the reopen failure is still present after this fix shipped. The next step is a
repro from the user, not another guess: whether "exit the page" means switching to another note within
Obsidian or fully closing/backgrounding the app, and the exact console output from Safari Web Inspector
if one can be captured (see quickstart.md's on-device findings, round four).

## R15. Cached anchors go briefly stale mid-scroll on long notes ("distortion", confirmed on-device as improved-but-not-gone)

After R13 shipped, the user confirmed vertical scroll sync "definitely improved," but a residual
"distortion" remained, probabilistically more likely the longer the note — not a hard one-page/
multi-page cutoff. This is a *different* bug from R12/R13, not a leftover of either: R12 made
`onLayoutChanged()` (anchor re-resolution) run on every `geometryChanged` event, and R13 made
`redraw()` cheap enough to run every frame — but `redraw()` was still painting each static
annotation at its **anchor as cached by the most recent `loadStatic()`**, not a value re-checked
against the document's *current* layout at paint time. CM6 corrects a not-yet-fully-measured
position's real coordinates as previously off-screen content gets measured for real while scrolling
(R12's finding); that correction is exactly what `geometryChanged` fires for, but it fires as its own
event, arriving at a different point in time than a given `redraw()` call — so there is necessarily a
window, between "CM6 corrected this position" and "our next `onLayoutChanged()` re-cached it," where a
redraw can still use the stale cached anchor. The longer the note, the more corrections happen while
scrolling through never-before-rendered territory, so the more chances there are to redraw during that
window — matching "probabilistic, more likely the longer the page."

**Fix**: `redraw()` no longer draws a static annotation at its cached anchor at all. The cached value
(renamed `approxBBox` on `StaticAnnotation`) is now only a cheap pre-filter — expanded by a full
viewport's margin in every direction, to tolerate exactly this kind of staleness without wrongly
skipping something that scrolled into range — for whether an annotation is worth resolving at all.
Anything that passes the filter gets its anchor **re-resolved fresh** (a real `coordsAtPos` call)
right before it's drawn, every single redraw, so the ink is always painted at the document's *current*
truth, never a value that could be one correction behind. This keeps R12's original perf fix intact
(the expensive `coordsAtPos` call still only runs for annotations plausibly near the viewport, not
every annotation in the note) while closing the correctness gap that caused visible distortion.

- **Not yet on-device confirmed.**
- **Takeaway**: this is the second time (after R13) that a cache of something CM6 can silently correct
  mid-scroll (first the overlay's own size, now an individual annotation's screen position) caused a
  visible bug once the *other* half of the picture (redraw frequency, or filtering) was already fixed.
  Any remaining code in this area that reads a `coordsAtPos`-derived value should treat it as valid
  only for the instant it was read, not something safe to cache across frames, unless it's gated by
  something that's cheap specifically because it doesn't need to be exact (like `approxBBox` now is).

## R16. A non-ink fence containing a blank line could get split into fake paragraphs, corrupting it (found and fixed)

The "distortion" reports (R15) turned out not to be primarily a rendering bug at all. The user
narrowed it down: it correlated with the note *already containing a code block or something else*, not
with note length. That pointed at `insert.ts`'s `chunkify()`, which computes where a new annotation's
block gets inserted (and therefore what its anchor is).

`chunkify` gave "ink"/"ink-canvas" fences correct atomic treatment (scanned through to their own
matching closing fence, never split), but explicitly did *not* extend that to any other fence
language — the code comment said this was "a spike-level simplification: its lines are just non-blank
paragraph text, same as any other line." In practice this meant a fence like a ` ```js ` code block
fell through to the generic paragraph scan, which stops at the **first blank line** — and a code block
with a blank line inside it (extremely common: blank lines between functions, list items, etc.) got
misread as two separate "paragraphs" split at that internal blank line. `findInsertionPoint` could then
resolve a new annotation's insertion point to a position **inside** that fence's content, and inserting
the new `ink-canvas` block markdown there injected a second, unrelated opening/closing fence pair in
the middle of the original one — breaking it into two malformed pieces. This is document corruption,
not a cosmetic bug: once the file's fence structure was broken, everything downstream (CM6's own
Markdown parsing, syntax highlighting, our own `ink-canvas`-hiding decoration) was operating on a
malformed document, which is a far more plausible explanation for visually "distorted" rendering than
R15's (real, but apparently secondary) stale-anchor race.

**Fix**: `chunkify` now scans *any* fence through to its own matching close as one atomic chunk,
regardless of language — only "ink"/"ink-canvas" fences get `kind: 'block'` (which `findInsertionPoint`
uses to skip past *trailing ink blocks* specifically); every other fence gets `kind: 'paragraph'`,
correctly treated as one indivisible unit that a new annotation can be inserted after, never inside.
Regression tests added: a code fence containing a blank line survives byte-for-byte with the new
annotation placed after it, whether the pen-down position was inside the fence or in the paragraph
before it.

- **Not yet on-device confirmed**, though this is a pure-module fix with direct unit-test coverage
  (unlike R12/R13/R14/R15, which are glue and can only be checked on-device).
- **Takeaway**: "a spike-level simplification" is a reasonable thing to write down, but this instance of
  it was actually a silent data-integrity gap, not just a missing nice-to-have (contrast with R9's "no
  visible margin" simplification, which is genuinely just a degraded-but-safe UX outcome). Worth
  double-checking, for any future "not specially recognised" simplification in this codebase, whether
  the unhandled case can actually corrupt the file rather than just render suboptimally.
- **Correction from the user, next round**: the actual trigger was not a generic code block — it was a
  spec 001 Block Mode `ink` block near a Canvas Mode `ink-canvas` annotation (drawn strokes placed near
  each other). `chunkify` already gave `ink` the same atomic block-kind treatment as `ink-canvas` (this
  fix didn't change that), so R16's fix is real and worth keeping, but it does **not** explain the
  ink/ink-canvas-adjacency symptom the user is actually hitting. Root cause for *that* is still open —
  see the "still open" note below rather than treating R16 as closed.

## R17. `getCanvasSession` can return null for a few milliseconds after reopening a note (found and fixed)

The reopen failure (R14) persisted after that fix, and the user captured the exact error text this
time: "Canvas Mode couldn't find its editor extension." That's `main.ts`'s own Notice for
`getCanvasSession(editorView)` returning null — i.e. `view.plugin(canvasLiveViewPlugin)` found no
instance of our globally-registered `ViewPlugin` on the freshly-obtained `EditorView`. The user also
confirmed the trigger precisely: switching to a different note and back, or closing the tab and
reopening it — not a full app restart (which R11's `insertBefore` fix already covers via
`onLayoutReady`).

This is the same *class* of race as R11's frontmatter-cache timing: `registerEditorExtension`'s
extension list is applied to a newly-created `EditorView` by Obsidian slightly *after* that leaf
becomes the active view and fires `active-leaf-change`/`file-open` — so a synchronous check at the
moment those events fire can observe an `EditorView` that exists (passes `getEditorView`'s
`instanceof` check) but doesn't have our `ViewPlugin` attached yet. There is no documented "editor
extensions are now applied" event to wait for instead.

**Fix**: `activateCanvasSession` now retries up to 6 times, 50ms apart, before giving up and showing
the Notice — matching the same "fail closed, but not on the very first synchronous check" shape as
R11's fix for the analogous frontmatter-cache race. Each retry re-checks that the workspace's active
view is still the one being activated for, so a user who's already switched to something else by the
time a retry fires doesn't get a session created for a view they've left (a subsequent
`syncCanvasSession()` call already owns that decision).

- **Partially confirmed, and reveals R14/R17 were never the cause of "failed to open ''":** the user
  confirmed the "couldn't find its editor extension" Notice no longer appears after this fix — so the
  retry does what it was meant to do. But the generic Obsidian "failed to open ''" error **still
  happens on reopen**, unchanged. Since that error persisted after the one Notice it could plausibly
  have been tied to stopped firing, R14 and R17 are now confirmed to be real, legitimate fixes for a
  real (if previously conflated) problem — but neither one was ever the explanation for "failed to open
  ''". That error's actual cause is still completely open; see the "still open" note below.
- **Takeaway**: this is the *third* instance in this project of "an event fires to announce a change,
  but some dependent piece of Obsidian/CM6 state hasn't caught up to it yet" (R11's frontmatter cache,
  R12's `docChanged` vs. `geometryChanged`, now this). Any future activation/glue code reacting
  synchronously to an Obsidian workspace event should default to assuming the announced state might not
  be fully settled yet, rather than trusting the first synchronous read.

## Still open: "failed to open ''" on reopen, and ink/ink-canvas adjacency

Two items where guessing further from static analysis alone has stopped being productive — both need
evidence from the user to make real progress, rather than another speculative fix:

- **"failed to open ''"**: confirmed independent of R14/R17 (see above) and of file corruption (R14's
  note). No remaining code-review-based hypothesis in this file explains it. **Next step**: the exact
  console output from Safari Web Inspector at the moment the error appears (CLAUDE.md's own documented
  debugging path for this device) — without it, further attempts here would just be more guesses.
- **Ink/ink-canvas adjacency, re-described (not visual "distortion" — a positional jump that worsens
  with repeated scrolling)**: the user clarified precisely: drawn strokes don't stay where they were
  drawn — they jump to a *different part of the document* on scroll, and each subsequent scroll makes
  it worse, specifically when a Block Mode `ink` block coexists with a Canvas Mode `ink-canvas`
  annotation nearby. "Worse after each scroll" (progressive, not a one-time wrong value or a toggle
  between two fixed states) is the most specific clue so far and rules out a few things: R15's
  fresh-`coordsAtPos`-per-redraw fix means each redraw independently recomputes from the *current*
  document/layout state with no persisted running value in this project's own code — nothing in
  `live-session.ts` accumulates a delta across calls, so a genuinely *compounding* error is more
  consistent with something outside this plugin's control shifting *between* each redraw: most plausibly
  CM6/Obsidian re-measuring the `ink` block's real rendered SVG-preview height differently each time
  Live Preview's virtualization unmounts and remounts that widget (scrolling it out of and back into the
  rendered range), which would feed a shifting value into `coordsAtPos` for anything positioned after it
  — a hypothesis, not yet confirmed. A second, not-yet-ruled-out candidate: `coordsAtPos` at the exact
  boundary of two adjacent replace-decorations from different sources (this project's own `ink-canvas`
  hiding widget immediately after Block Mode's real, sizeable `ink` preview widget) is a known-ambiguous
  case in CM6 (which side of an atomic/replace range a boundary position resolves to), which R4's own
  "Risk" note already flagged as untested for interaction with Obsidian's Live Preview. This cannot be
  reproduced in this project's test suite (happy-dom does no real layout, so `coordsAtPos` and real
  widget heights are meaningless there) — it can only be investigated on-device or with much more
  specific reproduction detail. **Next step, needed from the user**: whether it jumps to a *consistent*
  wrong location (e.g., always near the ink block) or somewhere different each time; roughly how far it
  moves after one scroll vs. several; and whether the same thing happens with any other real,
  non-trivial-height widget near a canvas annotation (an image embed, say) or specifically only with a
  Block Mode `ink` block.

## R18. Root cause of both "still open" items: block decorations provided via a `ViewPlugin` (found and fixed)

The user captured real Safari Web Inspector console output (via Remote Control on the Mac, attached
to the iPad session) for the first time, per R14/R17's "next step." Among Obsidian's own unrelated
noise, one line was a genuine CodeMirror 6 error: `RangeError: Block decorations may not be specified
via plugins`.

That string is thrown by `@codemirror/view`'s own range-builder (`node_modules/@codemirror/view/dist/index.js`,
the `point()` method's `disallowBlockEffectsFor` check) whenever a decoration with `block: true` is
supplied by a `ViewPlugin`'s `decorations` facet rather than a `StateField`'s. That is exactly what
`src/canvas/view-plugin.ts` did: `canvasAnnotationViewPlugin` was a `ViewPlugin.fromClass(...,
{ decorations: (v) => v.decorations })`, and `computeAnnotationDecorations` (R4) returns
`Decoration.replace({ widget, block: true })` for every `ink-canvas` block. CM6 requires block-level
decorations to come from a `StateField` specifically so they're computed as part of the same state
transaction the rest of layout uses — a `ViewPlugin` only sees the already-committed state a step
later, which is exactly the ordering guarantee block decorations depend on. This throws, uncaught,
inside CM6's own render pipeline the moment any `ink-canvas` block is inside the range CM6 is building
content for — i.e. any time a canvas annotation is on-screen or about to scroll into view.

This single bug plausibly explains both remaining "still open" items at once:
- **The reopen failure**: reopening a note whose visible range includes an `ink-canvas` block would hit
  this throw during the editor's own render pass, which is a very plausible mechanism for Obsidian's
  generic "failed to open" error (a rendering exception during view construction, not a data/file
  problem — consistent with R14's file-integrity check finding the Markdown itself intact).
- **The progressive scroll-jump ("ink/ink-canvas adjacency")**: each scroll that brought an
  `ink-canvas` block into the building range would hit the same throw, aborting that render pass
  partway through — a very plausible source of a layout left in a partially-corrected state, which
  compounds on each subsequent scroll (matching the "worse after each scroll" description) far more
  directly than either of the "still open" section's two speculative hypotheses (widget height
  remeasurement, or `coordsAtPos` boundary ambiguity), neither of which is a hard CM6 error at all.

**Fix**: `canvasAnnotationViewPlugin` (a `ViewPlugin`) replaced with `canvasAnnotationField` (a
`StateField<DecorationSet>`, `provide: (f) => EditorView.decorations.from(f)`), wired into `main.ts`'s
`registerEditorExtension` in its place. `computeAnnotationDecorations` itself (the tested, pure
function) is unchanged — only how its result reaches CM6 changed, which is why this required no new
test (existing `computeAnnotationDecorations` unit tests already cover the pure logic; the StateField
wrapper is glue per constitution v1.1.0, the same category as the ViewPlugin it replaces).

- **Not yet on-device confirmed.** Typecheck, all 303 tests, and the build are clean. This needs the
  same repro (a note with a Block Mode `ink` block near a Canvas Mode `ink-canvas` annotation, Canvas
  Mode on, scroll repeatedly; then close and reopen) re-run on-device to confirm the `RangeError` no
  longer appears in the console and both symptoms are actually gone, not just plausibly explained.
- **Takeaway**: this is the first of the "still open" investigation's leads that came from actual
  console output rather than static-analysis guessing, and it found a real, deterministic, always-
  reproducible-once-triggered bug — a sharp contrast with R12–R17's glue-timing races, which were each
  probabilistic/order-dependent. Worth remembering for next time: a `ViewPlugin` must never supply a
  `block: true` decoration; if a future feature needs a block-level widget from view-derived state
  (not just document state), it needs to launder that state through a `StateField` (e.g. by dispatching
  an effect) rather than returning it directly from the plugin's `decorations` facet.

## R19. Canvas Mode annotations not persisted across close/reopen (found and fixed)

After R18 shipped, the user confirmed the scroll-jump stopped, but reported a new (or previously
masked) symptom: drawing a Canvas Mode annotation, then moving away from the note's tab, closing it,
and reopening it, the annotation was simply gone — never written to the file. Block Mode `ink` blocks,
saved from the same note in the same session, persisted fine. This narrowed it to something specific
to Canvas Mode's save path, not the underlying `vault.process`/id-lookup machinery both features share.

Two real, compounding bugs were found by inspection of `CanvasModeSession`'s save path
(`src/canvas/live-session.ts`) and its caller (`src/main.ts`):

- **The anchor pixel position was resolved too late.** `buildEntry()` — called from `flushDirty()`,
  which runs either on the 500ms debounce or from `CanvasModeSession.destroy()`'s awaited
  `queue.flush()` — called `resolveAnchorPoint()` (a `view.coordsAtPos()` call) at *flush* time to
  convert a stroke's absolute overlay-space coordinates into the anchor-relative form the file format
  stores (research.md R3). But `destroy()` runs exactly when a note's tab is being switched away from
  or closed — i.e., exactly when the EditorView `coordsAtPos()` needs may already be mid-teardown or
  detached from a live layout. A `null` result there was already handled (falling back to anchor
  `{x:0,y:0}`, i.e., a *wrong* save, not a lost one) — but `coordsAtPos()` on a torn-down view is not
  guaranteed to return `null` cleanly; if it throws instead, that exception propagates out of
  `buildEntry()`'s `Array.map()` inside `flushDirty()`, rejecting the whole flush *before*
  `saveDirtyAnnotations()` — and therefore `vault.process()` — ever runs, silently dropping every dirty
  annotation in that batch. The rejection was already caught (by `deactivateCanvasSession()`'s
  `.catch()`, logged), so nothing crashed — it just silently lost the drawing, which matches "not
  persisted" far more precisely than a merely-mispositioned save would.
  **Fix**: resolve and cache the anchor immediately in `onPenEnd()`, when the pen has just lifted and
  the view is guaranteed live and focused, instead of leaving it to whenever the flush happens to run
  later. `buildEntry()` now reads this cache first, falling back to a live `resolveAnchorPoint()` call
  only for the should-be-unreachable case of a dirty id with no cached anchor. This removes the save
  path's dependency on the view still being attached at flush time entirely, the same "resolve
  view-derived values only when the view is known-good, never speculatively later" lesson R15 already
  drew for the *render* path, now applied to the *save* path too.
- **`deactivateCanvasSession()` didn't wait for its own flush.** It called `session.destroy()` (which
  internally awaits the pending save) but never awaited that promise itself — a fire-and-forget
  `.then()/.catch()` — so `syncCanvasSession()` (called synchronously from `active-leaf-change`/
  `file-open`) immediately went on to decide whether to activate a session for whatever note was now
  active, without the previous note's write necessarily having landed yet. For a fast close-then-reopen
  of the *same* note, this meant the new session's `loadStatic()` could read the file before the old
  session's `vault.process()` write to it had completed. **Fix**: `deactivateCanvasSession()` is now
  `async` and awaited by every caller (`syncCanvasSession()`, `toggleCanvasMode()`), so the previous
  note's save is guaranteed to have settled before the next decision is made; `onunload()` remains the
  one best-effort exception, since Obsidian doesn't await it.

Both fixes are typecheck/test/build-clean (303 tests unchanged, since this area is glue with the
transform logic itself unchanged — only *when* the anchor is resolved and *whether* deactivation is
awaited changed, not what gets computed or written).

- **Not yet on-device confirmed.** Needs the same repro (draw a Canvas Mode annotation, switch tabs,
  close, reopen) re-run to confirm the annotation survives.
- **Takeaway**: this is the same "a view-derived value must be captured when the view is known to be
  live, never resolved speculatively at some later, uncertain time" lesson as R15 (render) and R18
  (decorations), now found a third time on the save path. Any future code in this area that touches
  `coordsAtPos`/`posAtCoords` should ask *when this actually runs* relative to the view's lifecycle,
  not just whether the call can return `null`.

## R20. Strict stroke-bounds containment fragmented ordinary handwriting into many annotations (found and fixed)

After R19 shipped, the user reported the same "not persisted" symptom was still present, plus a new
one: drawing Canvas Mode scribbles was visibly inserting too much blank space between typed paragraphs.
The desktop dev machine's vault clone (`~/Documents/obsidian-personal`, the same git repo that syncs to
the iPad via Obsidian Git) had no `canvas-mode`/`ink-canvas` content anywhere in its history, ruling out
inspecting an actual saved file for this round and pointing back at code review.

Both symptoms traced to `CanvasModeNoteState.resolveTarget()`/`containsPoint()` in `src/canvas/session.ts`,
which decides whether a new stroke continues an existing annotation or starts a new one. Its rule —
also data-model.md's own original wording — was **exact bounding-box containment**: a new pen-down had
to land literally inside the union of an existing annotation's strokes' bounding boxes to be grouped
with it. That's far stricter than real handwriting needs: a word written letter by letter (or a letter
drawn as several separate pen-lifts) routinely has consecutive strokes whose bounding boxes don't
overlap *at all* — e.g. the gap between two letters — despite being unambiguously "the same scribble" to
a person looking at it. Every such non-overlapping stroke started a brand new annotation, each of which
became its own separate `ink-canvas` block on save, each with its own blank-line padding
(`insert.ts`'s `insertAnnotationAfterParagraph`) — visibly growing the gap between the surrounding typed
paragraphs with every additional letter, which is exactly the "too many spaces" symptom.

This also plausibly explains (part of) the persistence symptom, independent of R19's fixes: many
separate new-annotation ids becoming dirty in the same debounce window means a single
`saveDirtyAnnotations()` batch could contain several `entry.pos !== null` (insert) entries whose offsets
were each captured independently, earlier, against the pre-batch text — inserting them one after another
inside one `vault.process` shifts the document out from under any not-yet-processed entry's stale
offset. A large enough batch of these (an entire fragmented word, easily a dozen+ annotations) makes a
resulting corrupted/nonsensical insertion far more likely than the one-or-two-new-annotations-per-batch
case the design was reasoned about for.

**Fix**: `containsPoint()` now expands the existing annotation's bounding box by a fixed
`ANNOTATION_MERGE_MARGIN` (40 overlay-space px, i.e. roughly CSS px) in every direction before testing
containment — generous enough to bridge a letter-to-letter or word-to-word gap, while staying well short
of the distance between a margin annotation and the text column or between separate lines. Regression
test added (`tests/unit/canvas/session.test.ts`): a stroke landing 15px outside an existing annotation's
bounds (simulating the next letter of a word) now joins it instead of starting a new one, while the
existing far-away (500px) test still starts a new annotation. `data-model.md`'s "New annotation"/
"Existing annotation" wording updated to match.

A second, unrelated regression from R19's own fix was also found and fixed while reviewing this code
path: `onPenEnd()`'s eager anchor-caching (added in R19) determined "is this annotation new" from
whether the id already existed in `this.state.annotations` (session-memory presence), while
`buildEntry()` determines it from `this.knownIds` (has it ever actually been *saved to disk*) — two
different questions. For a not-yet-saved annotation's second-and-later strokes, the mismatch made
`onPenEnd()` call `currentAnchorOffsetForKnown()` (which scans the file for a block that doesn't exist
yet there, falling back to end-of-document) instead of reusing the correctly-cached `newAnchorOffset`,
caching a wrong anchor pixel position for that id. Fixed by making `onPenEnd()` use the same
`this.knownIds.has(id)` check `buildEntry()` uses.

- **Not yet on-device confirmed.** Typecheck, all 304 tests (303 + the new regression test), and the
  build are clean.
- **Takeaway**: this is the same shape as R5 (spec 001's RDP simplification) and R9 — a design decision
  that looked reasonable on paper but didn't hold up against how people actually draw/write on a device,
  only found from an on-device report, not from code review or the automated suite (which only ever
  tested points that were either clearly inside or implausibly far away, never the realistic "close but
  not touching" case). Any future proximity/grouping heuristic over hand-drawn input in this codebase
  should default to a margin, not exact containment, unless there's a specific reason strokes must
  physically touch to be considered related.

## R21. The blank-line padding around every inserted block, not just fragmentation, was the real source of "too many spaces" (found and fixed)

After R20 shipped, the user reported both problems were still present, and offered a specific
diagnosis: they suspected the spacing problem was inherent to keeping `ink-canvas` blocks inline with
the text at all, not a bug in how many blocks got created. Re-reading `insertAnnotationAfterParagraph`
and `appendAtEnd` (`src/canvas/insert.ts`) with that framing confirmed it: **every single insertion**,
even a single, correctly-merged annotation (R20 reduces the *count* of blocks, not the per-block
overhead), added a blank line before the block and a blank line after it — by design
(data-model.md/the `cv1` contract originally said so explicitly: "preceded and followed by a blank
line"). The block-hiding `StateField` (`canvasAnnotationField`, R18) only ever decorates the fence's
own lines (`ref.blockStart` to `ref.blockEnd` — opening fence through closing fence, never a line
outside that range), so those blank lines were never hidden: they are permanent, real, visible vertical
space in the rendered note, one annotation at a time. R20 helped (fewer blocks fragmenting one scribble
means fewer *pairs* of blank lines), but never touched this per-block overhead, which is why the
symptom persisted even after it.

**Why the blank lines were there in the first place**: CommonMark does not actually require them. A
fenced code block interrupts a paragraph, and is itself interrupted by the next block, without any
blank line either side (e.g. `Foo\n\`\`\`\nbar\n\`\`\`` parses as paragraph "Foo" followed by a code
block "bar" — a canonical CommonMark example). The blank-line padding was a stylistic choice made
early in the design (contracts/canvas-annotation-format.md, data-model.md), not a Markdown necessity.

**Fix**: `insertAnnotationAfterParagraph`/`appendAtEnd` no longer add any blank-line padding — the
block is inserted directly adjacent to whatever text precedes/follows the insertion point, and
whatever spacing already exists in the surrounding document (e.g. a normal blank line the user typed
between two paragraphs) is left completely untouched. This required a matching fix in `chunkify`'s
plain-paragraph scan, which previously only stopped at a blank line; without a preceding blank line to
rely on, a fence directly adjacent to a paragraph would otherwise get swallowed into that paragraph's
own chunk instead of being recognised as its own atomic block chunk (the same class of correctness gap
R16 fixed for a different adjacency case). Test-first: `tests/unit/canvas/insert.test.ts` gained
coverage for zero-padding insertion and for a fence directly adjacent to a paragraph with no blank
line; all pre-existing tests were updated to the new (unpadded) expected output, and one integration
test (`tests/integration/canvas/save-new-annotation.test.ts`) likewise. `data-model.md` and
`contracts/canvas-annotation-format.md` updated to match — this is explicitly a "spike format...
expected to be revisited" per that contract's own header, so this is not a frozen-format violation.

- **Not yet on-device confirmed.** Typecheck, all 305 tests, and the build are clean.
- **Takeaway**: this is the same shape as R20 — a design decision (here, "give the block its own
  paragraph" from very early in the spec) that was never actually load-bearing (Markdown doesn't need
  it) but was assumed without being questioned until an on-device report, and specifically until the
  user reframed the question from "why is this insertion producing extra output" to "why does this
  design need surrounding blank lines at all" — a genuinely different, more productive question than
  the incremental bug-hunting R19/R20 were doing. Worth remembering: when a fix doesn't fully resolve a
  reported symptom, the next step should include re-examining the *design premise*, not just looking
  harder for another bug within the existing one.

## Future work: readable diffs for interspersed `ink-canvas` blocks (decision: git diff driver)

Queued by the user, decided but not yet implemented: rather than relocating `ink-canvas` blocks in the
file (which would require replacing R3's position-is-the-anchor design with a content-fingerprint or
stable-paragraph-id anchor — a much bigger change, and the originally-considered, then-rejected
alternative in R3), the agreed fix is a `.gitattributes` `diff` driver (`textconv`) that rewrites
`ink-canvas` blocks to something short like `[ink-canvas id=k3f9x2ab, 4.1KB]` for `git diff` display
only. This leaves the actual file and R3's anchoring completely untouched — it's a git-config addition,
not a plugin change — and directly targets the user's actual complaint (diff noise), not the
block-placement guess that turned out to have a real cost. To implement when picked up.
