---
description: "Task list for Inline Handwriting Blocks (001)"
---

# Tasks: Inline Handwriting Blocks

**Input**: Design documents from `specs/001-inline-handwriting-blocks/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: MANDATORY. The constitution (Principle I, non-negotiable) requires test-driven development:
every implementation task is preceded by a test task, and the test MUST be run and seen failing
before the implementation is written. This overrides the template's "tests are optional" default.
Thin glue with no branching and no data-handling decisions (registration, DOM measurement, passing
Obsidian objects into tested functions) is exempt under constitution v1.1.0 and is marked "Glue";
it is checked by the on-device checklist instead.

**Organization**: Tasks are grouped by user story so each story can be implemented and validated
independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: User story the task belongs to (US1–US5)
- "Red" = write the test, run `npx vitest run <file>` and confirm it fails for the expected reason.
  "Green" = implement the minimum to pass, then refactor with the suite green.

## Path Conventions

Single Obsidian plugin project at the repository root: `src/`, `tests/`, `manifest.json`,
`styles.css` (see plan.md → Project Structure). Signatures come from
[contracts/core-api.md](./contracts/core-api.md).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Toolchain able to typecheck, test and build an empty plugin.

- [ ] T001 Create `package.json` (name `obsidian-draw`, private) with scripts `dev` (`node esbuild.config.mjs`), `build` (`node esbuild.config.mjs production`), `test` (`vitest run`), `typecheck` (`tsc --noEmit`), `deploy` (`npm run build && node scripts/deploy.mjs`); dependencies `perfect-freehand@1.2.3`, `fflate@0.8.3`; devDependencies `typescript@7.0.2`, `esbuild@0.28.2`, `vitest@5.0.0`, `happy-dom@20.14.3`, `obsidian@1.13.1`, `@types/node@22`, `builtin-modules@5.3.0`; run `npm install` to create `package-lock.json`
- [ ] T002 [P] Create `tsconfig.json`: `strict`, `noUncheckedIndexedAccess`, `noEmit`, `target`/`lib` ES2020 + DOM + DOM.Iterable, `module` ESNext, `moduleResolution` bundler, `isolatedModules`, `verbatimModuleSyntax` (forces `import type` for type-only imports, so tested modules visibly never load runtime values from the type-only `obsidian` package), `include` [`src`, `tests`]; if TypeScript 7 rejects the Obsidian typings, pin `typescript@6` instead (research R2)
- [ ] T003 [P] Create `esbuild.config.mjs` following the Obsidian sample plugin: entry `src/main.ts`, bundle, `format: 'cjs'`, `target: 'es2020'`, externals `obsidian`, `electron`, `@codemirror/*`, `@lezer/*` and `builtin-modules`, outfile `main.js`, inline sourcemap + watch when not `production`, minify and no sourcemap in `production`; `platform: 'browser'`, plus a small esbuild plugin that fails the build if any file under `src/` imports a Node built-in (list from `builtin-modules`), so Node APIs can't slip in and break only on the iPad (FR-029)
- [ ] T004 [P] Create `vitest.config.ts`: `include: ['tests/**/*.test.ts']`, default `environment: 'node'`; DOM tests opt in with a `// @vitest-environment happy-dom` first-line comment. Add `tests/setup/dom-stubs.ts` via `setupFiles` (a no-op when `window` is undefined): happy-dom has no 2D canvas or `Path2D`, so stub `HTMLCanvasElement.prototype.getContext('2d')` with a recording context (records `fillStyle`, `fill`, `clearRect` calls) and a minimal `Path2D`; add `PointerEvent`/`TouchEvent` fallbacks built on `MouseEvent`/`UIEvent` if happy-dom lacks them
- [ ] T005 [P] Create `manifest.json` per [contracts/plugin-surface.md](./contracts/plugin-surface.md) (`id` `obsidian-draw`, `name` `Draw`, `version` `0.1.0`, `minAppVersion` `1.5.7`, `isDesktopOnly` false, description, author `Luan Dinh`) and `versions.json` `{ "0.1.0": "1.5.7" }`
- [ ] T006 [P] Extend `.gitignore` with `node_modules/`, `main.js`, `*.js.map`, `coverage/`
- [ ] T007 [P] Create `scripts/deploy.mjs`: vault = `process.env.OBSIDIAN_VAULT` or `~/Documents/obsidian-personal`; exit with an error if `<vault>/.obsidian` does not exist; create `<vault>/.obsidian/plugins/obsidian-draw/`; copy `main.js`, `manifest.json`, `styles.css` into it; print the destination; never run git
- [ ] T008 Create a minimal `src/main.ts` (`export default class DrawPlugin extends Plugin` with empty `onload`/`onunload`) and an empty `styles.css`; verify `npm run typecheck`, `npx vitest run --passWithNoTests` and `npm run build` all succeed (depends on T001–T005)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Stored format, block location/update and stroke outlines, which every story uses.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T009 [P] Create the shared types `Point`, `Stroke`, `Drawing`, `RawPoint`, `Size` in `src/model/types.ts` (types only)
- [ ] T010 [P] Red: tests for `writeUvarint`/`writeSvarint`/`ByteReader` in `tests/unit/format/varint.test.ts`: round-trips of 0, 1, 127, 128, 16383, 16384, 2^31−1; zigzag mapping (0→0, −1→1, 1→2, −64, 63, −2^30); `ByteReader.uvarint()` throws on a truncated varint; `done()` is true only after all bytes are read
- [ ] T011 Green: implement `src/format/varint.ts` to pass T010
- [ ] T012 [P] Red: tests for `generateId` in `tests/unit/format/id.test.ts`: 8 characters matching `^[0-9a-z]{8}$`; deterministic with an injected random source; bytes ≥ 252 are rejected and redrawn (no modulo bias); 10,000 generated ids are unique
- [ ] T013 Green: implement `src/format/id.ts` (default source `crypto.getRandomValues`) to pass T012
- [ ] T014 Red: tests for `encodePayload`/`decodePayload` in `tests/unit/format/codec.test.ts`: empty strokes ↔ `''`; a single-point stroke; several multi-point strokes round-trip exactly; the same input always gives the same string; `decodePayload` throws `DecodeError` kind `malformed` for invalid base64, a corrupt DEFLATE stream, trailing bytes, a truncated varint, `pointCount = 0`, pressure > 255 and coordinates outside `[0,width]×[0,height]` (layout per [contracts/block-format.md](./contracts/block-format.md); depends on T011)
- [ ] T015 Green: implement `src/format/errors.ts` (`DecodeError` with `kind`) and `src/format/codec.ts` (varint layout → fflate `deflateSync` level 9 / `inflateSync` → chunked `btoa`/`atob`) to pass T014
- [ ] T016 Red: tests for `formatBlockLine`/`parseBlockLine`/`newBlockMarkdown` in `tests/unit/format/block-line.test.ts`: round-trip; empty drawing formats as `v1;id=<id>;700x260;`; rejections (`malformed`) for a missing or extra field, an id of the wrong length or charset, a size of 63 or 4097, a non-integer size, invalid payload characters; `v2;…` → `unsupported-version`; trailing whitespace ignored; `newBlockMarkdown` returns exactly ```` "```ink\n<line>\n```\n" ```` (depends on T015)
- [ ] T017 Green: implement `src/format/block-line.ts` (re-exporting `DecodeError`) to pass T016
- [ ] T018 [P] Create the seeded synthetic handwriting generator `tests/fixtures/handwriting.ts`: mulberry32 PRNG; `generateHandwriting(seed, width, height, { rows, glyphsPerRow })` returns `RawPoint[][]` of cursive-like wobbling strokes (~40–80 raw points each, pressure 0.3–0.9) filling the canvas edge to edge
- [ ] T019 Red: golden test `tests/unit/format/golden.test.ts`: for every `tests/fixtures/v1/*.md`, extract the block line and assert `parseBlockLine(line)` deep-equals the sibling `*.json` and `formatBlockLine(json) === line`; when `UPDATE_GOLDEN=1` and a fixture is missing, write it (never overwrite an existing file)
- [ ] T020 Generate the golden fixtures once with `UPDATE_GOLDEN=1 npx vitest run tests/unit/format/golden.test.ts`: `tests/fixtures/v1/empty.{md,json}`, `dot.{md,json}` (one single-point stroke), `sentence.{md,json}` (≈30 strokes from the T018 generator at seed 1, already quantised); inspect them, then run the test without the variable and confirm it passes. Fixtures are append-only from now on (depends on T017–T019)
- [ ] T021 [P] Red: tests for `locateBlock` in `tests/unit/document/locate.test.ts`: one block → `found` with exact `start`/`end` of the payload; several blocks with different ids; `not-found`; the same id in two blocks → `duplicate` with count 2; `~~~` fences; a four-backtick fence; an ```` ```ink ```` block nested inside an outer ```` ````md ```` fence is NOT counted; info string must be exactly `ink` (`inked`, `ink2` ignored; trailing spaces allowed); prefixes `> `, `> > ` and two-space indentation → `found` with that `prefix`; CRLF files (`end` excludes `\r`); an unclosed fence at end of file; blank lines around the content line
- [ ] T022 Green: implement `src/document/locate.ts` (line scanner per research R7) to pass T021
- [ ] T023 [P] Red: tests for `applyBlockUpdate` and `appendBlock` in `tests/unit/document/update.test.ts`: `updated` result equals `text.slice(0,start) + newLine + text.slice(end)` byte-for-byte; the same line → `unchanged` with identical text; `not-found`/`duplicate` return the input unchanged; CRLF and a `> ` prefix are preserved; `appendBlock` adds exactly one separating newline when the text doesn't end with one and leaves existing text untouched (uses `locateBlock`: can be written alongside T021, run after T022)
- [ ] T024 Green: implement `src/document/update.ts` to pass T023
- [ ] T025 [P] Red: tests for `strokeOutlinePath` in `tests/unit/render/outline.test.ts`: returns a non-empty path starting with `M` and ending with `Z`; a single-point stroke gives a closed dot path; deterministic output; a stroke with pressure 230 yields a wider outline than the same stroke at pressure 50 (compare the bounding box of the path's numbers)
- [ ] T026 Green: implement `src/render/outline.ts` with perfect-freehand options from research R9 (pressure = `p / 255`) and quadratic-curve path conversion to pass T025

**Checkpoint**: `npm test` green. Format, location/update and outlines are ready.

---

## Phase 3: User Story 1 - Write a new handwriting block in a note (Priority: P1) 🎯 MVP

**Goal**: "Insert handwriting block" → overlay → write with the Pencil → Done → inline, theme-coloured
preview; the drawing is stored in the note.

**Independent Test**: In an empty note, run the command, write a word, tap Done. The word shows
inline, the note contains exactly one `ink` block, and no new vault files exist (quickstart manual
items 1–6).

### Tests for User Story 1 (write first, confirm they fail) ⚠️

- [ ] T027 [P] [US1] Red: tests for `simplify` in `tests/unit/model/simplify.test.ts`: collinear points collapse to their endpoints; a right-angle corner is kept; deviation ≤ ε = 0.5 is dropped and > 0.5 kept; kept points keep their pressure; inputs of 1 or 2 points are returned unchanged
- [ ] T028 [P] [US1] Red: tests for `commitStroke` in `tests/unit/model/quantize.test.ts`: coordinates rounded to integers and clamped to `[0,width]×[0,height]`; pressure → `round(pressure × 255)` clamped to 0–255; consecutive duplicate points after rounding are removed but at least one point remains; the result is never re-simplified by later calls
- [ ] T029 [P] [US1] Red: tests for `defaultSize`, `contentWidth`, `fitScale` in `tests/unit/model/canvas-size.test.ts`: `defaultSize(null)` → 700×260; 150 → 200 wide; 3000 → 2000 wide; 812.7 → 812 wide; `contentWidth(clientWidth, padL, padR)` subtracts padding; `fitScale` returns 1 when the size fits and `min(availW/w, availH/h)` otherwise
- [ ] T030 [P] [US1] Red: tests for `toCanvasPoint` in `tests/unit/editor/geometry.test.ts`: maps client coordinates through the surface rectangle and display scale into canvas units (scale 1 and scale 0.5), returning floats
- [ ] T031 [P] [US1] Red: tests for `insertionText` in `tests/unit/document/insert.test.ts`: an empty current line → block markdown only; a non-empty line → a leading `\n` so the block starts on its own line; output always ends with a newline
- [ ] T032 [P] [US1] Red: tests for `classifyPointer` in `tests/unit/editor/input-filter.test.ts`: pen `pointerdown` with buttons 1 → `draw`; pen `pointermove` with buttons 1 → `draw`; pen `pointermove` with buttons 0 (hover) → `ignore`; pen `pointerup`/`pointercancel` → `end`; every `touch` and `mouse` event → `ignore`
- [ ] T033 [P] [US1] Red: tests for `SaveQueue` in `tests/unit/editor/save-queue.test.ts` with Vitest fake timers: `schedule` saves once 500 ms after the last call with the latest line; `flush()` saves immediately and cancels the timer; a `schedule` during an in-flight save produces exactly one follow-up save with the newest line; `flush()` waits for an in-flight save; `flush()` with nothing pending resolves `null`; the save outcome is returned from `flush()`; the injected `onOutcome` is called with the outcome of every save, both debounced and flushed
- [ ] T034 [P] [US1] Red: tests for the pen part of `EditingSession` in `tests/unit/editor/session.test.ts`: a new session is clean with tool `pen`; `addStroke(raw)` commits via `commitStroke` and makes it dirty; `currentLine()` equals `formatBlockLine(drawing)`; `markSaved(line)` makes it clean; dirty is computed as `currentLine() !== lastSavedLine`
- [ ] T035 [P] [US1] Red: integration test `tests/integration/roundtrip-size.test.ts`: raw strokes from the T018 generator (seed 42) filling a 700×260 canvas and, separately, an 1000×700 canvas → `commitStroke` each → `formatBlockLine` → the line is ≤ 30,720 bytes (SC-004) and `parseBlockLine` returns the committed strokes exactly; every committed point lies within 1.0 unit of the raw polyline (RDP ε + rounding)
- [ ] T036 [P] [US1] Red: tests for the basic `saveBlock` path in `tests/integration/vault-save.test.ts`, using a `FakeVault` (in `tests/integration/fake-vault.ts`) whose `process(file, fn)` reads the stored text, applies `fn` and stores the result: a found block → `updated` and new text stored; an identical line → `unchanged`
- [ ] T037 [P] [US1] Red: DOM tests for `buildPreviewSvg` in `tests/dom/svg-preview.test.ts` (happy-dom): class `ink-preview-svg`; `viewBox="0 0 W H"`; style `width:100%` and `max-width:Wpx`; one `<path>` per stroke with `fill="currentColor"`; an empty drawing produces no paths
- [ ] T038 [P] [US1] Red: DOM tests for `CanvasLayers` in `tests/dom/canvas-layers.test.ts`: `backingScale(size, dpr)` is `min(dpr, 2)` and further reduced so `w×h×scale² ≤ 16,777,216`; creating layers yields two stacked canvases with backing sizes from `backingScale`; `free()` sets both canvases' `width` and `height` to 0 and detaches them
- [ ] T039 [P] [US1] Red: DOM tests for the overlay shell in `tests/dom/overlay.test.ts`: `openOverlay(...)` appends `div.ink-overlay` directly to `document.body`; the toolbar contains Pen (with `is-active`) and Done; `div.ink-surface` has `touch-action: none`, `-webkit-user-select: none`, `-webkit-touch-callout: none`; a cancelable `touchstart` on the surface ends up `defaultPrevented`; Done calls the injected `flush` and then removes the overlay and frees the canvases; Done on an unchanged (clean) session closes without the save function ever being called (FR-027); a pen `pointermove` whose event lacks `getCoalescedEvents` is still drawn; invoking the injected theme-change callback redraws the static layer with the newly read `--text-normal` colour (FR-007)
- [ ] T040 [P] [US1] Red: DOM tests for the code block processor render function `renderInkBlock(source, el, { sourcePath, openEditor })` in `tests/dom/preview-processor.test.ts` (the module must load without the `obsidian` runtime, i.e. `import type` only): a valid block renders `div.ink-preview` containing the SVG; an empty drawing renders `div.ink-preview.is-empty` with "Tap to draw"; a malformed block renders `div.ink-error` "Can't read this drawing"; `v2` renders `div.ink-error` "Made with a newer version of the plugin"; no `<canvas>` is ever created
- [ ] T041 [P] [US1] Red: tests for `openEditorFlow(deps)` in `tests/integration/open-flow.test.ts`, with fakes for `openViews()` (each `save()` records its call), `read(file)`, `isOverlayOpen()`, `openOverlay(file, drawing)` and `notice(msg)`: every open view's `save()` has resolved **before** `read` is called (recorded call order); a found, valid block opens the overlay with the parsed drawing; a missing block and a malformed block each show a notice and open nothing; a call while an overlay is already open does nothing (not even `save`/`read`); the flow creates the `EditingSession` and a `SaveQueue` whose save function reads `session.id` at call time (switch the session's id, trigger a save, assert the new id reaches `saveBlock`) and whose `onOutcome` feeds `session.handleOutcome`

### Implementation for User Story 1

- [ ] T042 [P] [US1] Green: implement `src/model/simplify.ts` (iterative RDP on x,y) to pass T027
- [ ] T043 [US1] Green: implement `commitStroke` in `src/model/quantize.ts` (simplify ε 0.5 → round → clamp → dedupe) to pass T028 (depends on T042)
- [ ] T044 [P] [US1] Green: implement `defaultSize`, `contentWidth`, `fitScale` in `src/model/canvas-size.ts` to pass T029
- [ ] T045 [P] [US1] Green: implement `toCanvasPoint` in `src/editor/geometry.ts` to pass T030
- [ ] T046 [P] [US1] Green: implement `insertionText` in `src/document/insert.ts` to pass T031
- [ ] T047 [P] [US1] Green: implement `classifyPointer` in `src/editor/input-filter.ts` to pass T032
- [ ] T048 [P] [US1] Green: implement `SaveQueue` in `src/editor/save-queue.ts` (injectable timers, one in-flight save, coalescing, `onOutcome` after every save) to pass T033
- [ ] T049 [US1] Green: implement the pen part of `EditingSession` in `src/editor/session.ts` to pass T034 (depends on T043, T017)
- [ ] T050 [US1] Run T035; if the size budget fails, adjust only the encoder internals allowed by research R5 (not the frozen grammar) until it passes (depends on T043)
- [ ] T051 [P] [US1] Green: implement `saveBlock` (found → `updated`/`unchanged`) in `src/obsidian/vault-save.ts` over a `ProcessingVault` interface to pass T036
- [ ] T052 [P] [US1] Green: implement `buildPreviewSvg` in `src/render/svg-preview.ts` to pass T037 (uses T026)
- [ ] T053 [P] [US1] Green: implement `CanvasLayers` in `src/editor/canvas-layers.ts` (static + live canvas, `backingScale`, `drawStroke(ctx, stroke, colour)` via `strokeOutlinePath` + `Path2D`, `redrawStatic(strokes)`, `drawLive(stroke)`, `free()`) to pass T038
- [ ] T054 [US1] Green: implement the overlay shell in `src/editor/overlay.ts` to pass T039: fixed full-screen `div.ink-overlay` on `document.body`, toolbar (Pen, Done), surface sized by `fitScale`, touch CSS + `{ passive: false }` `touchstart` → `preventDefault()`; pen loop: `pointerdown`/`pointermove` (using `getCoalescedEvents()` when it exists) filtered by `classifyPointer`, mapped by `toCanvasPoint`, drawn on the live layer; on `end` → `session.addStroke` → `redrawStatic`; stroke colour = computed `--text-normal`, re-read with a static-layer redraw whenever the injected theme-change callback fires (wired to the workspace `css-change` event in glue); Done → `await flush()` → `free()` → remove (depends on T045, T047, T049, T053)
- [ ] T055 [US1] Green: implement `renderInkBlock(source, el, { sourcePath, openEditor })` in `src/obsidian/preview-processor.ts` (parse → preview / empty placeholder / error placeholder; pure DOM, `import type` only from `obsidian`) to pass T040 (depends on T052)
- [ ] T056 [US1] (depends on T044) Implement `measureColumnWidth(view)` in `src/obsidian/column-width.ts`: read `.cm-content` (or `.markdown-preview-sizer` in Reading view) `clientWidth` and computed padding, return `contentWidth(...)` or `null` (research R12). Glue: exempt from test-first under constitution v1.1.0; checked by quickstart item 1
- [ ] T057 [US1] Green: implement `openEditorFlow(deps)` in `src/obsidian/flows.ts` to pass T041: return early if `isOverlayOpen()`; `await Promise.all(openViews().map(v => v.save()))`; `read(file)`; `locateBlock` + `parseBlockLine`; notice on `not-found`/`duplicate`/`DecodeError`; otherwise create the `EditingSession` and a `SaveQueue` whose save calls `saveBlock(vault, file, session.id, line)` (id read at call time, so it follows the switch after Append to note) and whose `onOutcome` calls `session.handleOutcome`, then `openOverlay(file, session, queue)` (depends on T048, T051, T054)
- [ ] T058 [US1] Glue: implement the `insert-block` command in `src/obsidian/insert-command.ts`: `editorCallback` → `defaultSize(measureColumnWidth(view))` → new `Drawing` with `generateId()` → `insertionText` inserted at the end of the cursor line with `editor.replaceRange` → `openEditorFlow` for `(view.file, id)` with `openViews = [view]` (the tested flow saves the view before reading); icon `pencil`; no branching of its own (depends on T046, T056, T057)
- [ ] T059 [US1] Glue: wire `src/main.ts`: `registerMarkdownCodeBlockProcessor('ink', (src, el, ctx) => { ctx.addChild(new MarkdownRenderChild(el)); renderInkBlock(src, el, { sourcePath: ctx.sourcePath, openEditor }) })` (the only place a runtime `obsidian` class is used) and `addCommand` for `insert-block`; hold the open overlay reference (exposed to `openEditorFlow` as `isOverlayOpen`) and close it with `close({ reason: 'unload' })` in `onunload` (the overlay flushes before closing); registration only, no branching logic (depends on T055, T058)
- [ ] T060 [P] [US1] Write `styles.css` for `.ink-preview`, `.ink-preview.is-empty`, `.ink-preview-svg` (`color: var(--text-normal)`), `.ink-error`, `.ink-overlay`, `.ink-toolbar`, `.ink-surface`, button `is-active` state, using only Obsidian CSS variables (contracts/plugin-surface.md)
- [ ] T061 [US1] Gate: `npm run typecheck && npm test && npm run build`; then `npm run deploy`, commit/push the vault, and run quickstart manual items 1–6 on the iPad (Safari Web Inspector attached). Record results; fix regressions test-first

**Checkpoint**: MVP usable on the iPad: insert, write, Done, inline preview.

---

## Phase 4: User Story 2 - Edit an existing drawing (Priority: P2)

**Goal**: Tap a preview to reopen it; whole-stroke eraser; undo/redo; autosave 500 ms after pen-up;
every close route saves.

**Independent Test**: Open a note with a drawing, tap it, erase one stroke, add one, undo, redo, Done.
The preview and the stored line reflect exactly that (quickstart items 7–9).

### Tests for User Story 2 (write first, confirm they fail) ⚠️

- [ ] T062 [P] [US2] Red: tests for `hitStrokes` in `tests/unit/model/erase.test.ts`: a point within `radius + strokeHalfWidth` of a segment hits; a point just outside misses; a single-point (dot) stroke can be hit; a stroke whose bounding box is far away is rejected without segment checks (spy or counter); returns indices in ascending order
- [ ] T063 [P] [US2] Red: tests for `History` in `tests/unit/model/history.test.ts`: `add` undo/redo; `erase` of several strokes re-inserts each at its original index on undo and removes them again on redo; a new command clears redo; `canUndo`/`canRedo` flags; undo on empty history is a no-op
- [ ] T064 [US2] Red: extend `tests/unit/editor/session.test.ts`: `setTool('eraser')`; `beginErase()` + several `eraseAt(p)` + `endErase()` records one `erase` command containing every stroke removed during that contact; `undo()`/`redo()` update the drawing; undoing back to the last saved line makes the session clean again; `onChange` fires after each pen-up, erase contact, undo and redo
- [ ] T065 [US2] Red: extend `tests/dom/overlay.test.ts`: toolbar also has Eraser, Undo, Redo; Undo/Redo carry `disabled` when unavailable; tapping Eraser moves `is-active` to it; an `Escape` keydown closes via `flush`; a `visibilitychange` with `document.visibilityState === 'hidden'` calls `flush` and the overlay stays open; `close({ reason: 'unload' })` flushes before removing the overlay; a session change calls the injected `schedule(line)` (autosave)
- [ ] T066 [US2] Red: extend `tests/dom/preview-processor.test.ts`: `pointerdown` and `mousedown` on `div.ink-preview` are `defaultPrevented` and do not propagate to a parent listener; `click` calls the injected `openEditor(sourcePath, id)`; `div.ink-error` is not clickable

### Implementation for User Story 2

- [ ] T067 [P] [US2] Green: implement `hitStrokes` in `src/model/erase.ts` (eraser radius 8 units, bbox reject, point-to-segment distance) to pass T062
- [ ] T068 [P] [US2] Green: implement `History` in `src/model/history.ts` to pass T063
- [ ] T069 [US2] Green: extend `src/editor/session.ts` with tools, erase contacts, undo/redo and `onChange` to pass T064 (depends on T067, T068)
- [ ] T070 [US2] Green: extend `src/editor/overlay.ts` to pass T065: Eraser/Undo/Redo buttons and states; eraser loop (pen contact → `beginErase`/`eraseAt`/`endErase`, then `redrawStatic`); session `onChange` → `schedule(currentLine())`; Escape closes through `flush`; `visibilitychange` → hidden flushes without closing; an unload close flushes first (routes per contracts/plugin-surface.md) (depends on T069)
- [ ] T071 [US2] Green: extend `src/obsidian/preview-processor.ts` with the press suppression and click → `openEditor` behaviour to pass T066
- [ ] T072 [US2] Glue: wire preview taps in `src/main.ts`: `openEditor(sourcePath, id)` resolves the file with `app.vault.getFileByPath` and calls `openEditorFlow` (T057) with the real vault and every open `MarkdownView` of that file as `openViews` (research R8); no branching of its own (depends on T057, T070, T071)
- [ ] T073 [US2] Gate: typecheck, tests, build, deploy; run quickstart manual items 7–9 on the iPad (Live Preview and Reading view, cursor never enters the block, erase/undo/redo, autosave after app switch)

**Checkpoint**: Drawings can be reopened and corrected; autosave works.

---

## Phase 5: User Story 3 - Safe saving while the note changes underneath (Priority: P3)

**Goal**: Saves hit exactly the right block even after external changes; missing or duplicated blocks
never cause a write, and the drawing stays recoverable.

**Independent Test**: With a drawing open, change the note externally (lines above, text below,
other blocks), then save. Only the payload line changes (quickstart items 14–15).

### Tests for User Story 3 (write first, confirm they fail) ⚠️

- [ ] T074 [P] [US3] Verify (expected to pass on existing code; any failing case becomes a Red test with its own fix): concurrent-change suite `tests/integration/concurrent-edits.test.ts` using `FakeVault` with a hook that mutates the stored text after the session opened and before `saveBlock` runs. At least 20 cases, each asserting the exact expected file text: lines added above; lines added below; text edited directly before the opening fence and directly after the closing fence; another `ink` block added before; another block's payload changed; another block deleted; the target moved to a different position; the note converted to CRLF; the target inside a callout (`> `); the target inside nested blockquotes; YAML frontmatter added; a heading inserted between two blocks; the whole note duplicated below a separator (→ `duplicate`, no write); the target block deleted (→ `not-found`, no write); the target block's fence language changed to `text` (→ `not-found`); the target payload replaced by a sync with a newer line (our save wins, rest untouched); empty note (→ `not-found`); the file emptied and rewritten with the same block (→ `updated`); unicode text around the block preserved; trailing whitespace lines preserved; the file renamed/moved while open (saving through the held file object → `updated` in the renamed file); the file deleted while open (`process` rejects → `file-missing`, no exception escapes)
- [ ] T075 [P] [US3] Red: extend `tests/integration/vault-save.test.ts`: `saveBlock` → `not-found`/`duplicate` leaves the stored text byte-identical; a `process` rejection for a missing file resolves `file-missing` instead of throwing; `appendNewBlock` appends `newBlockMarkdown` with a fresh id (different from the old one) and preserves all existing text
- [ ] T076 [P] [US3] Verify (expected to pass; a failure is recorded in research.md): git merge test `tests/integration/git-merge.test.ts` (Node `child_process`, temp dir, skipped if `git` is unavailable): base note with typed text and two `ink` blocks; branch A edits the first paragraph and block 1; branch B edits the last paragraph and block 2; `git merge` completes with no conflict and the result contains both edits (SC-005); a control case where both branches edit block 1 does conflict
- [ ] T077 [US3] Red: extend `tests/unit/editor/session.test.ts` with save-state transitions from data-model.md: `handleOutcome` with `not-found`/`duplicate`/`file-missing` → `orphaned` (recording which), whether the save came from an autosave or from Done; while orphaned `wantsAutosave()` is false; `appendToNote()` → saving under a new id (`session.id` changes), then clean; closing while `orphaned` is refused unless the "close without saving" confirmation is given
- [ ] T078 [US3] Red: extend `tests/dom/overlay.test.ts`: when an autosave's `onOutcome` reports `not-found` (no Done tap), the session becomes `orphaned` and `div.ink-banner` appears at once with the matching message and **Append to note** / **Close without saving** buttons; no `schedule` calls happen while the banner shows; for `file-missing` the banner reads "This note no longer exists" and offers **Copy drawing to clipboard** (writes `newBlockMarkdown` with a fresh id through an injected clipboard function) instead of Append to note; Done does not close while orphaned; **Close without saving** calls the injected `confirm` and closes only when it returns true

### Implementation for User Story 3

- [ ] T079 [US3] Green: extend `src/obsidian/vault-save.ts` with `not-found`/`duplicate`/`file-missing` outcomes and `appendNewBlock` to pass T075, and make T074 pass (fix `locate.ts`/`update.ts` test-first if any case exposes a bug)
- [ ] T080 [US3] Verify: check that T076 passes against the current format; if a case conflicts unexpectedly, record the finding in research.md and adjust only what the constitution allows
- [ ] T081 [US3] Green: extend `src/editor/session.ts` with `handleOutcome`, the `orphaned` state (autosave paused via `wantsAutosave()`), `appendToNote()` and id switching to pass T077
- [ ] T082 [US3] Green: extend `src/editor/overlay.ts` with the failure banner (shown as soon as any save's outcome makes the session orphaned, not only on Done; `file-missing` variant with Copy drawing to clipboard via `navigator.clipboard.writeText`), no autosave scheduling while orphaned, and guarded closing to pass T078; wire `appendToNote` to `appendNewBlock` in `src/main.ts` (depends on T079, T081)
- [ ] T083 [US3] Gate: typecheck, tests, build, deploy; run quickstart manual items 14–15 on the iPad with a second device or git push from the dev machine

**Checkpoint**: Data safety verified automatically (≥ 20 cases) and on device.

---

## Phase 6: User Story 4 - Resize the canvas (Priority: P4)

**Goal**: Resize the canvas in the editor within stroke and screen bounds; the size is stored and the
preview follows; rotation refits without distortion.

**Independent Test**: Make the canvas taller and narrower, tap Done. The preview has the new
proportions and reopening shows the same size (quickstart items 10–11).

### Tests for User Story 4 (write first, confirm they fail) ⚠️

- [ ] T084 [P] [US4] Red: extend `tests/unit/model/canvas-size.test.ts`: `minSize(strokes)` = max(64, bbox right + 4) × max(64, bbox bottom + 4), and 64×64 for no strokes; `clampSize(want, min, max)` clamps each dimension and caps at 4096, and when min > max the min wins; `resizeBounds(current, strokes, available)` returns `{ min: minSize(strokes), max: larger of current and available, capped at 4096 }`, so a 1100-wide canvas with 800 available keeps width 1100 when only its height is dragged
- [ ] T085 [P] [US4] Red: extend `tests/unit/model/history.test.ts` and `tests/unit/editor/session.test.ts`: a `resize` command changes only width/height (strokes untouched), undo/redo restore sizes; `session.resize(size)` clamps with `minSize` and the supplied max, marks the session dirty and fires `onChange` once per completed drag
- [ ] T086 [US4] Red: extend `tests/dom/overlay.test.ts`: `div.ink-resize-handle` exists outside the canvases; a pen `pointerdown` on the handle never starts a stroke; dragging the handle calls `session.resize` once on release; a window `resize` event recomputes the fit scale without changing the drawing

### Implementation for User Story 4

- [ ] T087 [P] [US4] Green: implement `minSize`, `clampSize` (min wins over max) and `resizeBounds` in `src/model/canvas-size.ts` to pass T084
- [ ] T088 [US4] Green: add the `resize` command to `src/model/history.ts` and `resize()` to `src/editor/session.ts` to pass T085 (depends on T087)
- [ ] T089 [US4] Green: add the resize handle (finger or pen drag, live outline while dragging, commit on release, bounds from `resizeBounds`: max = larger of the current size and the available area at scale 1, min wins) and the window/orientation refit to `src/editor/overlay.ts`; style `.ink-resize-handle` in `styles.css`; pass T086 (depends on T088)
- [ ] T090 [US4] Gate: typecheck, tests, build, deploy; run quickstart manual items 10–11 on the iPad

**Checkpoint**: Canvas size is user-controlled and survives reopening and rotation.

---

## Phase 7: User Story 5 - Switch tools from the toolbar (Priority: P5)

**Goal**: Quick, always-visible tool switching. Pencil double-tap is not exposed to plugins
(research R1), so the toolbar is the complete v1 behaviour (FR-015, FR-016).

**Independent Test**: With the pen active, tap Eraser with the Pencil and then with a finger; the
active tool and the toolbar highlight follow each tap.

- [ ] T091 [US5] Red: extend `tests/dom/overlay.test.ts`: Pen and Eraser buttons respond to `click` events originating from `pointerType` `pen` and `touch`; `is-active` always marks exactly one tool; pressing Pen/Eraser does not add to undo history
- [ ] T092 [US5] Green: adjust `src/editor/overlay.ts` if T091 exposes gaps (e.g. pen `pointerdown` on toolbar buttons being swallowed by the surface's handlers)
- [ ] T093 [P] [US5] Document in `README.md` (Known limitations) that Apple Pencil double-tap/squeeze cannot reach Obsidian plugins, with links from research R1

**Checkpoint**: All five stories complete.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T094 [P] Write `README.md`: what the plugin does, install via the vault's plugin folder, usage (command, mobile toolbar, editing), stored format summary linking contracts/block-format.md, development commands from quickstart.md
- [ ] T095 [P] Update `CLAUDE.md` "Status" and "Suggested next steps" to reflect the implemented v1 and point at `specs/001-inline-handwriting-blocks/`
- [ ] T096 [P] Reconcile [contracts/core-api.md](./contracts/core-api.md) and [plan.md](./plan.md) with the final module signatures and file list
- [ ] T097 Record the production `main.js` size in plan.md Complexity Tracking; if it exceeds ~60 KB, investigate the import graph (e.g. fflate not tree-shaken)
- [ ] T098 Full gate: `npm run typecheck && npm test && npm run build`, all green
- [ ] T099 Deploy and run the complete quickstart manual iPad checklist (items 1–16, including stress item 12, Scribble item 13 and 20-block item 16); record pass/fail with date and commit in the PR description

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup; blocks all stories.
- **US1 (Phase 3)**: depends on Foundational. MVP.
- **US2 (Phase 4)**: depends on US1 (reuses session, overlay, SaveQueue, processor).
- **US3 (Phase 5)**: depends on US1's save path; independent of US2 and US4 at the module level, but
  its overlay banner task (T082) touches `overlay.ts`, so run it after US2 to avoid conflicts.
- **US4 (Phase 6)**: depends on US1; touches `overlay.ts`/`session.ts`/`history.ts`, so run after US2.
- **US5 (Phase 7)**: depends on US2 (Eraser button).
- **Polish (Phase 8)**: after all stories.

Recommended order for one developer: Setup → Foundational → US1 → US2 → US3 → US4 → US5 → Polish.

### Within Each Story

- Red test tasks come first; each Green task names the test it must pass.
- Pure modules (model/format/document/render) before editor state, editor state before DOM, DOM
  before Obsidian wiring.
- Finish each story with its gate task (typecheck, tests, build, on-device items).

### Key task dependencies

- T011 → T014 → T015 → T016 → T017 → T019/T020
- T021 → T022 → T023 → T024
- T042 → T043 → T049 → T054; T054 + T041 → T057 → T058 → T059
- T067 + T068 → T069 → T070 → T072
- T079 + T081 → T082
- T087 → T088 → T089

## Parallel Opportunities

- Setup: T002–T007 in parallel after T001.
- Foundational: T009, T010, T012, T018, T021, T025 can start together; their Green tasks follow
  their own Red task.
- US1: all Red tasks T027–T041 in parallel; then Green tasks T042, T044–T048, T051–T053, T060
  in parallel.
- US2: T062, T063 in parallel; T067, T068 in parallel.
- US3: T074, T075, T076 in parallel.
- US4: T084, T085 in parallel.

### Parallel Example: User Story 1

```bash
# Red phase, all at once (different files):
Task: "T027 simplify tests in tests/unit/model/simplify.test.ts"
Task: "T028 commitStroke tests in tests/unit/model/quantize.test.ts"
Task: "T032 classifyPointer tests in tests/unit/editor/input-filter.test.ts"
Task: "T033 SaveQueue tests in tests/unit/editor/save-queue.test.ts"
Task: "T037 buildPreviewSvg DOM tests in tests/dom/svg-preview.test.ts"

# Green phase, independent modules:
Task: "T042 implement src/model/simplify.ts"
Task: "T047 implement src/editor/input-filter.ts"
Task: "T048 implement src/editor/save-queue.ts"
Task: "T052 implement src/render/svg-preview.ts"
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup → Phase 2 Foundational.
2. Phase 3 (US1) → T061 gate: deploy to `~/Documents/obsidian-personal`, sync, test on the iPad.
3. **Stop and validate** before continuing: the Pencil input and Live Preview behaviour are the
   highest-risk parts and only show up on the device.

### Incremental Delivery

- US1 → usable writing. US2 → editing. US3 → sync-safe. US4 → resizing. US5 → toolbar polish.
- Each story ends with a deploy and its on-device checklist items, so problems surface early.

## Notes

- Commit after each Red/Green pair (test with or before implementation) so the TDD cycle is visible
  in history (constitution workflow gate 2).
- Golden fixtures (T020) are append-only; never edit or delete them.
- `main.js` is a build artifact: it is git-ignored here and copied into the vault by `npm run deploy`.
- The deploy script writes only to `.obsidian/plugins/obsidian-draw/` in the vault and never runs
  git; committing and pushing the vault is a manual step.
