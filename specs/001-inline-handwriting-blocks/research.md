# Research: Inline Handwriting Blocks

Phase 0 output for [plan.md](./plan.md). Each entry records a decision, why it was made, and what
else was considered. There are no open NEEDS CLARIFICATION items.

## R1. Apple Pencil double-tap (FR-015, User Story 5)

- **Decision**: Do not implement double-tap detection in v1. Switching tools is done only with the
  toolbar pen/eraser buttons (FR-016, per the 2026-09-11 clarification).
- **Rationale**: Double-tap and squeeze are delivered to native apps through `UIPencilInteraction`,
  a UIKit API attached to native views. There is no web standard or WebKit event that exposes these
  gestures to JavaScript, so a plugin running inside Obsidian's web view cannot observe them.
  FR-015 applies only "where the device makes it available", which is never the case for a plugin
  today, so the toolbar is the complete v1 behaviour. Any future Obsidian API for it can be adopted
  in a later feature.
- **Alternatives considered**: Heuristics such as detecting two quick pen taps on the canvas were
  rejected: they collide with drawing dots (e.g. "i", ":") and would not be the real Pencil gesture.
- **Sources**: [Apple: UIPencilInteraction](https://developer.apple.com/documentation/uikit/uipencilinteraction),
  [Apple: Handling double taps from Apple Pencil](https://developer.apple.com/documentation/applepencil/handling-double-taps-from-apple-pencil),
  [Apple Developer Forums: detecting Pencil from JS in Safari](https://developer.apple.com/forums/thread/730985).

## R2. Toolchain

- **Decision**: TypeScript 7.0 (strict), esbuild 0.28 (bundle to a single CommonJS `main.js`,
  target `es2020`, externals `obsidian`, `electron`, `@codemirror/*`), Vitest 5 for tests with the
  `node` environment by default and `happy-dom` for the few DOM-bound tests. `obsidian` 1.13.1 type
  definitions. Node 22 on the Linux dev machine.
- **Rationale**: Matches the Obsidian sample-plugin layout required by the constitution. Vitest runs
  TypeScript directly, is fast, and supports per-file environments, which keeps pure modules in plain
  Node. happy-dom is lighter than jsdom and sufficient for building SVG/DOM structures.
- **Alternatives considered**: Jest (needs extra TS transform config; slower). jsdom (heavier, no
  capability we need). If TypeScript 7's native compiler has any incompatibility with the Obsidian
  typings, fall back to TypeScript 6.x for `tsc --noEmit`; esbuild does the actual transpiling, so
  runtime output is unaffected.

## R3. Minimum Obsidian version

- **Decision**: `minAppVersion: "1.5.7"`, compiled against the 1.13.1 typings.
- **Rationale**: The newest API the plugin relies on is `Vault.getFileByPath` (`@since 1.5.7`);
  `Vault.process` is `@since 1.1.0`. Setting the minimum to the real requirement rather than to the
  newest release avoids locking out an iPad that hasn't updated yet. Confirm the iPad's version is at
  least 1.5.7 (Settings → About) during the first on-device test.
- **Alternatives considered**: Pinning to the current release (1.13.x): stricter than necessary.

## R4. Block line grammar and identity (FR-003, FR-004)

- **Decision**: The fenced block has language `ink` and exactly one content line:
  `v1;id=<8 chars [0-9a-z]>;<W>x<H>;<payload>`. See [contracts/block-format.md](./contracts/block-format.md).
  Ids are generated with `crypto.getRandomValues` (36^8 ≈ 2.8 × 10^12 values).
- **Rationale**: One line keeps git merges line-local. `;`-separated fields are trivial to parse,
  readable in raw Markdown, and extendable in later versions. 8 random base-36 characters make an
  accidental collision within a vault negligible while staying short.
- **Alternatives considered**: JSON header (noisier, quoting issues); id in the fence info string
  (```` ```ink a8f3 ````), rejected because some Markdown tools treat extra info-string words
  inconsistently and it splits the data across two lines.

## R5. Stroke encoding (FR-026, SC-004)

- **Decision**:
  1. At stroke commit, quantise x, y to integer canvas units (1 unit = 1 CSS px at the block's
     stored size) and pressure to an integer 0–255; drop a point only if it is an exact
     `(x, y, pressure)` duplicate of the point before it (a genuinely redundant sample landing on
     the same rounded pixel at the same pressure). No geometric simplification runs.
  2. Binary layout: `uvarint strokeCount`, then per stroke `uvarint pointCount`, first point as
     zigzag-varint x, y and uvarint p, following points as zigzag-varint deltas (dx, dy, dp).
  3. Compress with fflate `deflateSync` (raw DEFLATE, level 9), then standard base64 (RFC 4648 with
     padding). An empty drawing has an empty payload.
- **Rationale**: v1 originally simplified with Ramer–Douglas–Peucker (ε = 0.5 canvas units) before
  quantising, per CLAUDE.md's encoding pipeline. On-device testing (User Story 2) showed this
  producing visible blank/gappy patches in the re-rendered stroke: RDP measures only positional
  deviation, so a pen-down/pen-up taper (position barely moves while pressure ramps hard) always
  collapsed to 1–2 points regardless of epsilon, discarding most of the pressure signal perfect-freehand
  needs for a smooth taper. Measured against the seeded dense-handwriting fixture
  (`tests/fixtures/handwriting.ts`, 700×260, 6 rows × 14 glyphs ≈ 84 strokes), quantising without any
  geometric simplification came to 12.8 KB — comfortably inside the 30 KB budget (SC-004) with no need
  to trade fidelity for size. `simplify.ts` (the RDP module) was removed rather than kept unused.
- **Alternatives considered**: A pressure-aware RDP variant (also normalise a pressure-deviation term
  into the keep/drop decision) fixed the worst case but a duplicate-position point with a different
  pressure was still silently dropped by the quantiser's position-only dedupe run afterwards, and the
  measured size headroom made the extra complexity unnecessary. Half-unit quantisation (finer, ~10%
  larger): unneeded once simplification was dropped, since fidelity is no longer the bottleneck. gzip/
  zlib containers (a few bytes of extra header, no benefit). base64url (no real benefit inside a code
  block; standard base64 works with `atob`/`btoa` everywhere).

## R6. Determinism and "no change means no write" (FR-027)

- **Decision**: Quantisation happens once, when a stroke is committed. The model only ever holds
  quantised strokes, and the encoder is a pure serialisation of them, so
  `encode(decode(line)) === line` for every line the plugin produced. The editing session tracks a
  dirty flag; closing a clean session does not call the save path at all.
- **Rationale**: Committing a stroke exactly once and never reprocessing already-quantised points
  avoids the stored data drifting across saves, and the dirty flag guarantees an untouched note even
  if a future compressor version were not byte-stable.
- **Alternatives considered**: Keep full-precision points during the session and quantise on save
  (what you see would differ slightly from what reopens).

## R7. Locating and updating a block in the note (FR-022, FR-023, FR-025)

- **Decision**: A pure line scanner finds fenced code blocks (opening fence of ≥ 3 backticks or
  tildes, closing fence of the same character and at least the same length, per CommonMark) whose
  info string is exactly `ink`. It supports a common line prefix of indentation and blockquote/callout
  markers (`> `), which is kept byte-for-byte. For the target id it returns `found` (with the exact
  character range of the payload line), `not-found`, or `duplicate`. The update replaces only that
  line's content after the prefix and keeps the line ending (`\n` or `\r\n`).
- **Rationale**: Line numbers from `ctx.getSectionInfo()` go stale after typing or sync (constitution
  III). Scanning the fresh file text inside `vault.process` is cheap for note-sized files and
  deterministic to test.
- **Alternatives considered**: Regex over the whole file (fragile with nested fences and prefixes);
  a full Markdown parser dependency (heavy; violates principle V).

## R8. Save path and editor-buffer consistency (FR-021, FR-024, FR-025)

- **Decision**:
  - All writes go through `app.vault.process(file, fn)`. `fn` calls the pure `applyBlockUpdate`; on
    `not-found`/`duplicate` it returns the text unchanged and the adapter reports the failure.
  - After "Insert handwriting block" writes the new block into the editor with `Editor.replaceRange`,
    the plugin awaits `MarkdownView.save()` before opening the overlay. Before opening the overlay from
    a preview, it also awaits `save()` on any open `MarkdownView` of that file. This flushes pending
    typing to disk so `vault.process` never sees an older file than the editor shows.
  - Saves are serialised: at most one in flight; changes arriving meanwhile coalesce into one follow-up
    save. Autosave fires 500 ms after the last pen-up (debounced); closing the overlay flushes
    immediately and awaits completion.
  - On failure the overlay stays open with a banner: "This drawing's block was not found in the note"
    (or "…appears more than once"), with **Append to note** (appends a new block with a fresh id at the
    end of the note via `vault.process`, then continues saving to it) and **Close without saving**
    (asks for confirmation).
- **Rationale**: Atomic read-modify-write plus id lookup is the constitution's data-safety rule.
  Flushing the editor avoids the only known race (unsaved typing vs. disk). Appending at the end of
  the note is atomic and always possible; inserting "at the cursor" is ambiguous while the overlay
  covers the note, so FR-025 now says "append it to the note as a new block".
- **Alternatives considered**: Writing through the `Editor` API (not available in Reading view or when
  the note isn't open; not atomic with respect to sync writes). Copy to clipboard as the only recovery
  (easy to lose if the user copies something else).

## R9. Rendering and theme (FR-005 – FR-007, FR-012)

- **Decision**: Stroke outlines come from `perfect-freehand` `getStroke(points, { size: 3,
  thinning: 0.6, smoothing: 0.5, streamline: 0.5, simulatePressure: false })`, turned into an SVG path
  (quadratic-curve smoothing of the outline polygon). The inline preview is an `<svg>` with
  `viewBox="0 0 W H"`, `width: 100%`, `max-width: Wpx`, and paths filled with `currentColor`, where the
  colour is `var(--text-normal)`. The editor canvas fills with the computed value of `--text-normal`
  and re-reads it on the workspace `css-change` event.
- **Rationale**: `currentColor` makes light/dark adaptation automatic in previews, with no stored
  colour and no re-render. SVG scales down cleanly for narrow columns (FR-006). The same outline
  function feeds both SVG and canvas, so preview and editor match.
- **Alternatives considered**: Rendering previews to `<img>` data URLs (can't follow theme colour);
  canvas previews (forbidden by constitution IV).

## R10. Canvas memory on iOS

- **Decision**: The editor uses two stacked canvases: a static layer for committed strokes and a live
  layer for the stroke being drawn. The backing store uses `min(devicePixelRatio, 2)`, reduced further
  so that each canvas stays at or below 16,777,216 pixels. On close both are set to
  `width = height = 0` and removed.
- **Rationale**: iOS enforces a total canvas memory budget; blank canvases are the symptom. Two
  bounded layers keep live drawing cheap (only the current stroke is repainted per pointer event) while
  staying well under the budget.
- **Alternatives considered**: A single canvas redrawn fully on every move (slower with dense
  drawings); an SVG editor surface (DOM churn during fast writing).

## R11. Editor layout, resizing and rotation (FR-017 – FR-020, FR-030)

- **Decision**: The overlay fits the canvas into the available area below the toolbar at scale
  `min(1, availableW / W, availableH / H)`, centred. Pointer coordinates are mapped back to canvas
  units through that scale. Resizing uses a handle at the bottom-right corner (a separate element, so
  a pen on it never draws) and is bounded by: minimum = bounding box of all strokes (plus a 4-unit
  margin) and at least 64 × 64; maximum = the larger of the current size and the available area at
  scale 1, capped at 4096, so a resize never shrinks a canvas just because the screen is smaller;
  when minimum exceeds maximum, minimum wins. Rotation or window resize
  just recomputes the fit. Each resize is one undo step.
- **Rationale**: Fitting instead of panning avoids a pan/zoom feature (out of scope) and handles
  rotation without distortion. Keeping scale 1 whenever the canvas fits makes handwriting size in
  the editor match the preview.
- **Alternatives considered**: A scrollable editor with finger panning (more input code, conflicts
  with `touch-action: none`); resizing from the preview in the note (the Live Preview cursor problem).

## R12. Default canvas width (FR-017)

- **Decision**: At insert time, measure the width of the active Markdown view's content column
  (`.cm-content` in Live Preview/source mode, `.markdown-preview-sizer` in Reading view), minus its
  horizontal padding, rounded down to an integer and clamped to [200, 2000]; fall back to 700 if the
  measurement fails. The default height is 260.
- **Rationale**: That column already reflects the "readable line width" setting and the device's
  orientation, which is what "as wide as the document" means. The exact selectors are verified in
  Safari Web Inspector on the iPad; the measurement function takes the element as input, so it stays
  unit-testable.
- **Alternatives considered**: Obsidian's `--file-line-width` CSS variable (ignores the setting being
  off and the actual screen width).

## R13. Opening the editor from a preview without disturbing Live Preview

- **Decision**: The preview container handles `pointerdown`/`mousedown` with `preventDefault()` and
  `stopPropagation()`, and opens the overlay on `click`. The processor registers a `MarkdownRenderChild`
  through `ctx.addChild` so listeners are removed when CodeMirror re-renders or virtualises the block.
- **Rationale**: Stopping the press stops CodeMirror from moving the cursor into the block, which is
  what swaps the widget for source text (constitution IV). The `MarkdownRenderChild` gives correct
  cleanup on re-render.
- **Alternatives considered**: A CodeMirror widget/extension of our own (more code; the code block
  processor already works in both views).

## R14. Input handling (FR-011)

- **Decision**: A pure `classifyPointer({ type, pointerType, buttons })` returns `draw`, `ignore` or
  `end`. Only `pointerType === 'pen'` with a pressed button draws; pen `pointermove` with
  `buttons === 0` (hover) is ignored; touch and mouse on the canvas are ignored. Moves use
  `getCoalescedEvents()` when the function exists. The canvas has `touch-action: none`,
  `-webkit-user-select: none` and `-webkit-touch-callout: none`, and a `touchstart` listener with
  `{ passive: false }` that calls `preventDefault()`. Toolbar buttons are ordinary buttons outside the
  canvas and accept finger or Pencil taps.
- **Rationale**: These are the iPad pitfalls listed in the constitution. A pure classifier makes the
  rules testable without a device.
- **Alternatives considered**: Allowing mouse drawing on desktop: excluded by constitution IV and not
  needed for v1. Desktop is used for previews and layout checks.

## R15. Undo/redo and erasing (FR-013, FR-014)

- **Decision**: A command history of `add(stroke)`, `erase(strokes with their indices)` and
  `resize(from, to)`. Everything erased during one pen contact is one `erase` step. Redo is cleared by
  any new command. Eraser hit test: a stroke is hit when the eraser point is within
  `eraserRadius (8 units) + strokeHalfWidth` of any segment of the stroke, with a bounding-box reject
  first.
- **Rationale**: Command objects keep undo exact and cheap. Grouping per contact matches how people
  think about "one erase". Segment distance is robust even with RDP-simplified strokes that have few
  points.
- **Alternatives considered**: Snapshot-based undo (simpler, but memory grows with dense drawings).

## R16. Testing strategy (constitution I)

- **Decision**:
  - Unit tests (Node) for every pure module: varint, base64, codec, header, id, simplify, quantise,
    history, erase, canvas-size, locate, update, insert text, input classifier, autosave scheduler
    (fake timers), outline→path.
  - DOM tests (happy-dom) for the SVG preview builder and the overlay's DOM contract (buttons present,
    active tool state, CSS properties set, canvas freed on close).
  - Integration tests with a fake `Vault` whose `process` can apply a concurrent change between read and
    write, covering the SC-003 scenarios (≥ 20 cases) and byte-for-byte preservation.
  - Golden fixtures in `tests/fixtures/v1/`, never deleted (constitution II).
  - Size tests with a seeded synthetic-handwriting generator asserting a dense block ≤ 30 KB (SC-004).
  - A manual iPad checklist (in [quickstart.md](./quickstart.md)) for Pencil input, palm rejection,
    Scribble, Live Preview behaviour, canvas memory, rotation, and latency.
- **Rationale**: Covers everything automatable headless; leaves only real-device behaviour to the
  manual gate.
