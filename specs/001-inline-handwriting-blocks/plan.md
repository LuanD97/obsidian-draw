# Implementation Plan: Inline Handwriting Blocks

**Branch**: `001-inline-handwriting-blocks` | **Date**: 2026-09-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-inline-handwriting-blocks/spec.md`

## Summary

Build the v1 Obsidian plugin: an "Insert handwriting block" command, a code block processor that
shows each `ink` block as a static, theme-coloured SVG preview, and a full-screen overlay editor
(pen, whole-stroke eraser, undo/redo, resizable canvas, Done) attached to `document.body`. Drawings
are stored inside the note as one fenced block with a single data line
(`v1;id=…;WxH;<base64(deflate(varint deltas))>`). Saves go through `vault.process`, locate the block
by id in the current file text, change only that line, and refuse to write when the block is missing
or duplicated. All logic lives in pure modules developed test-first; Obsidian and DOM code is a thin
shell around them. Pencil double-tap cannot be observed by web content, so tool switching is
toolbar-only (research R1).

## Technical Context

**Language/Version**: TypeScript 7.0 (strict mode), bundled by esbuild 0.28 to CommonJS `main.js`,
target ES2020

**Primary Dependencies**: `obsidian` 1.13.1 (types, external at runtime), `perfect-freehand` 1.2.3,
`fflate` 0.8.3

**Storage**: The note's own Markdown file (fenced `ink` block); no other files, no settings in v1

**Testing**: Vitest 5 (Node environment; `happy-dom` 20 for DOM-bound tests). The `obsidian` npm
package is types-only, so tested modules use `import type` only and runtime Obsidian classes appear
only in glue (`main.ts`); fake `Vault` for
integration tests, golden fixtures, manual iPad checklist in [quickstart.md](./quickstart.md)

**Target Platform**: Obsidian ≥ 1.5.7 on iPadOS (primary, WebKit) and desktop (previews only)

**Project Type**: Obsidian community plugin (single TypeScript project)

**Performance Goals**: Ink follows the Pencil without visible lag: `pointermove` handler ≤ 4 ms at
p95 and no dropped frames during 10 s of writing on the iPad (SC-002; one live-stroke repaint per
pointer event); editor open ≤ 1 s; 20 previews rendered ≤ 1 s

**Constraints**: Block data on one line; dense block ≤ 30 KB; no Node or Electron APIs; offline;
per-canvas backing store ≤ 16,777,216 px with DPR ≤ 2; canvases freed on close

**Scale/Scope**: One user, notes with up to ~20 drawings, drawings up to 4096 × 4096 units,
~25 source files

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Pre-research | Post-design |
|-----------|------|--------------|-------------|
| I. TDD | Every module has a test target; logic is separated from Obsidian/DOM glue; manual checklist exists for device-only behaviour | ✅ planned | ✅ [contracts/core-api.md](./contracts/core-api.md) lists every pure module; adapters take fakes; `openEditorFlow` (save views before reading) is tested; remaining thin glue is exempt under constitution v1.1.0; manual checklist in [quickstart.md](./quickstart.md) |
| II. Inline, merge-friendly storage | One-line payload, version + id in header, RDP → delta → varint → deflate → base64, size bound tested, golden fixtures, round-trip tests | ✅ planned | ✅ [contracts/block-format.md](./contracts/block-format.md); R5, R6 |
| III. Never lose user data | `vault.process` only; id lookup in fresh text; refuse on missing/duplicate; byte preservation tested; invalid blocks never rewritten | ✅ planned | ✅ R7, R8; `applyBlockUpdate` contract; SC-003 suite |
| IV. iPad-first, mobile-safe | `isDesktopOnly:false`; SVG previews; overlay on `document.body`; bounded canvases freed on close; touch CSS + non-passive `touchstart`; pen-only input, hover ignored, coalesced events | ✅ planned | ✅ R10, R13, R14; [contracts/plugin-surface.md](./contracts/plugin-surface.md) |
| V. Lightweight and simple | Only small runtime deps, each justified with size; no tldraw; no speculative features; no Ink code | ✅ planned | ✅ Two runtime deps (see Complexity Tracking); no settings tab, no pan/zoom, no double-tap heuristics |
| Technical constraints | TS strict, esbuild, headless tests, no network/iCloud | ✅ | ✅ |
| Workflow gates | typecheck + tests + build before merge; on-device checklist | ✅ | ✅ `npm run typecheck`, `npm test`, `npm run build`; quickstart checklist |

Result: **PASS** at both checkpoints, with no violations to justify.

## Project Structure

### Documentation (this feature)

```text
specs/001-inline-handwriting-blocks/
├── plan.md              # This file
├── research.md          # Phase 0 decisions (R1–R16)
├── data-model.md        # Entities, validation, save-state transitions
├── quickstart.md        # Build/test/deploy + manual iPad checklist
├── contracts/
│   ├── block-format.md  # Stored ink block format v1 (frozen on release)
│   ├── core-api.md      # Pure module signatures (TDD targets)
│   └── plugin-surface.md# Manifest, processor, command, overlay DOM
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (/speckit-tasks; not created here)
```

### Source Code (repository root)

```text
manifest.json
package.json               # scripts: build, dev, test, typecheck, deploy
esbuild.config.mjs
tsconfig.json
vitest.config.ts
styles.css
scripts/
└── deploy.mjs             # copies build output to <vault>/.obsidian/plugins/obsidian-draw/;
                           # vault = $OBSIDIAN_VAULT or ~/Documents/obsidian-personal
src/
├── main.ts                # Plugin class: registers processor + command (thin)
├── model/
│   ├── types.ts
│   ├── simplify.ts        # RDP
│   ├── quantize.ts        # commitStroke
│   ├── erase.ts           # hit testing
│   ├── history.ts         # undo/redo commands
│   └── canvas-size.ts     # default/min/clamp/fit
├── format/
│   ├── varint.ts
│   ├── errors.ts          # DecodeError (shared by codec and block-line)
│   ├── codec.ts           # strokes <-> base64 payload
│   ├── block-line.ts      # header grammar, DecodeError, newBlockMarkdown
│   └── id.ts
├── document/
│   ├── locate.ts          # fence scanner, find block by id
│   ├── update.ts          # applyBlockUpdate, appendBlock
│   └── insert.ts          # insertionText
├── render/
│   ├── outline.ts         # perfect-freehand -> SVG path
│   └── svg-preview.ts     # preview <svg> builder
├── editor/
│   ├── input-filter.ts    # classifyPointer
│   ├── geometry.ts        # toCanvasPoint (client -> canvas units)
│   ├── save-queue.ts      # debounce + serialised saves
│   ├── session.ts         # EditingSession state (tool, drawing, history, dirty)
│   ├── canvas-layers.ts   # bounded static/live canvases (DOM)
│   └── overlay.ts         # overlay DOM, toolbar, resize handle, banner (DOM)
└── obsidian/
    ├── vault-save.ts      # saveBlock / appendNewBlock over vault.process
    ├── flows.ts           # openEditorFlow: save open views, then read/locate/parse/open (tested)
    ├── preview-processor.ts
    ├── insert-command.ts
    └── column-width.ts    # measure default width from the active view

tests/
├── unit/                  # mirrors src/model, src/format, src/document, src/render, src/editor
├── dom/                   # happy-dom: svg-preview, overlay contract, canvas freeing
├── integration/           # fake vault: concurrent-change suite, append flow, git merge (temp repo)
└── fixtures/
    ├── v1/                # golden blocks (append-only)
    └── handwriting.ts     # seeded synthetic stroke generator for size tests
```

**Structure Decision**: Single Obsidian plugin project at the repository root, using the sample-plugin
layout (`manifest.json`, `main.js`, `styles.css` at root). Pure logic is split by concern
(`model`, `format`, `document`, `render`, `editor` state) so each is testable in Node; only
`editor/canvas-layers.ts`, `editor/overlay.ts` and `src/obsidian/*` touch the DOM or the Obsidian
API, and they stay thin.

## Complexity Tracking

No constitution violations. Runtime dependencies are listed here because principle V requires each
to be justified with its bundle impact:

| Dependency | Why needed | Approx. bundle impact | Simpler alternative rejected because |
|------------|------------|-----------------------|--------------------------------------|
| `perfect-freehand` 1.2.3 | Pressure-sensitive stroke outlines for both SVG preview and canvas | ~3 KB min | Hand-rolled variable-width strokes would duplicate a small, well-tested library and look worse |
| `fflate` 0.8.3 (`deflateSync`/`inflateSync` only, tree-shaken) | Compression to meet the ≤ 30 KB block budget | ~8–10 KB min | `CompressionStream` is async-only and not guaranteed in all WebKit versions Obsidian ships; no compression misses the size target |
