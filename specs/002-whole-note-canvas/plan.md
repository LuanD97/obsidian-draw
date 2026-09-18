# Implementation Plan: Canvas Mode — Live Strokes Over Typed Text

**Branch**: `002-whole-note-canvas` | **Date**: 2026-09-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/002-whole-note-canvas/spec.md`

## Summary

Build a feasibility spike for Canvas Mode: a per-note command ("Turn note into canvas") that lets
the user draw with Apple Pencil anywhere over a note's rendered Live Preview — margins and typed
text alike — with strokes anchored to the paragraph they were drawn beside. Each annotation is
stored as its own single-line `ink-canvas` fenced block, textually placed immediately after the
paragraph it belongs to, so normal Markdown reflow keeps it beside that paragraph for free — no
separate anchor-matching logic is needed. A capturing-phase pointer filter (reusing Block Mode's
`classifyPointer`) intercepts pen input over the whole note; a transparent overlay layer, inserted
as a sibling of CodeMirror's contenteditable `.cm-content` inside `.cm-scroller`, renders live and
committed strokes and scrolls natively with the note. Raw `ink-canvas` block source is hidden from
Live Preview via a CodeMirror decoration. The stroke payload codec, undo history, eraser hit-testing,
and vault-write safety rules are reused unchanged from spec 001 (Block Mode); only the header
grammar (no fixed width/height — Canvas Mode has no bounded canvas) and the block-locating scanner
(generalized to a configurable fence language) are new. The spike concludes with a written go/no-go
recommendation, not a production-ready feature.

## Technical Context

**Language/Version**: TypeScript (strict mode), bundled by esbuild to CommonJS `main.js`, same
toolchain as spec 001 — no new build tooling.

**Primary Dependencies**: `obsidian` (types, external at runtime), `perfect-freehand` (reused,
unchanged), `fflate` (reused, unchanged). No new runtime dependency — see Complexity Tracking.

**Storage**: The note's own Markdown file only. Two additions to the file, both inline:
1. A YAML frontmatter key (`canvas-mode: true`) marking the note as Canvas Mode-enabled.
2. Zero or more single-line `ink-canvas` fenced blocks, each placed immediately after the paragraph
   it is anchored to.

No settings file, no per-vault state, no separate drawing files.

**Testing**: Vitest (Node), `happy-dom` for DOM-bound tests — same setup as spec 001. Pure modules
(scanning, header grammar, insertion-point-finding) are unit-tested; the CodeMirror ViewPlugin and
capturing-phase pointer interception are covered by a manual iPad checklist in
[quickstart.md](./quickstart.md), since CM6's live layout and real Pencil input cannot be
faithfully exercised headless (constitution I).

**Target Platform**: Obsidian on iPadOS (primary), Live Preview only. Reading view is a stretch
goal (spec Assumptions); if not reached, Canvas Mode notes render inert, valid Markdown in Reading
view (frontmatter + fenced blocks with no visual annotation), which is an explicit, acceptable
degradation for this spike, not a defect.

**Project Type**: Obsidian community plugin (single TypeScript project, same repo as spec 001).

**Performance Goals**: Live stroke feedback with no visible lag while drawing (same bar as Block
Mode, SC-002 of spec 001): pointermove handling at p95 ≤ 4 ms, no dropped frames during continuous
writing. Opening a Canvas Mode note with up to ~20 annotations renders all of them within about a
second (parallel to spec 001's SC-008), though this spike does not require hitting that bar — see
Success Criteria SC-001/SC-004, which ask for a go/no-go judgement, not a shipped perf guarantee.

**Constraints**: Annotation payload stays on one line (git merge-friendliness for the *format*, not
required to hold for concurrent edits to the *same* annotation per FR-008); drawing surface stays
outside `.cm-content`'s contenteditable DOM (Scribble/Live-Preview-swap avoidance, constitution IV);
only `pointerType === 'pen'` draws; no Node/Electron APIs; canvases sized to devicePixelRatio with
an upper bound and freed on close, per constitution IV.

**Scale/Scope**: One user, one note open in Canvas Mode at a time, up to a handful of annotations
per note during manual testing (enough to exercise reflow and spanning strokes, not a stress test).
Estimated new source: ~10 files under `src/canvas/`, reusing ~8 existing modules from spec 001
unchanged and extending 1 (`document/locate.ts`) with a fence-language parameter.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Pre-research | Post-design |
|-----------|------|---------------|-------------|
| I. TDD | Pure logic (scanning, header grammar, paragraph-boundary insertion) test-first; CM6/DOM/Pencil glue covered by manual checklist per the constitution's glue exemption | ✅ planned | ✅ [contracts/canvas-annotation-format.md](./contracts/canvas-annotation-format.md) and [data-model.md](./data-model.md) list every pure module; manual checklist in [quickstart.md](./quickstart.md); R1–R4 in research.md flag the CM6/pointer-capture risk explicitly as spike-validated, not unit-tested |
| II. Inline, merge-friendly storage | Stored only in the note's own `.md`; one payload per line; version tag in header | ✅ planned | ✅ [contracts/canvas-annotation-format.md](./contracts/canvas-annotation-format.md); reuses spec 001's already-adopted quantize→delta→varint→deflate→base64 pipeline with **no RDP simplification**, matching the precedent recorded in spec 001's research.md R5 (the constitution's principle II text still names RDP; that drift was already accepted for spec 001 and is not reopened here — see Note below) |
| III. Never lose user data | Writes via `vault.process`; blocks located by id against current text, never stale line numbers; save refuses to write on `not-found`/`duplicate`; unknown/malformed annotations never rewritten | ✅ planned | ✅ [data-model.md](./data-model.md) `AnnotationLocation`/save outcomes reuse spec 001's `BlockLocation`/`applyBlockUpdate` machinery directly |
| IV. iPad-first, mobile-safe | Drawing surface outside contenteditable DOM; pen-only input; canvases bounded and freed; touch defaults set | ✅ planned | ✅ R2 (overlay placement), R1 (pointer capture) in research.md |
| V. Lightweight and simple | No new runtime dependency; reuse over duplication; scope limited to the spike's 3 user stories (YAGNI) | ✅ planned | ✅ Complexity Tracking below: zero new dependencies |
| Technical constraints | TS strict, esbuild, headless tests where possible, no network/iCloud | ✅ | ✅ unchanged from spec 001 |
| Workflow gates | typecheck + tests + build before merge; on-device checklist for anything touching input/rendering/saving | ✅ | ✅ quickstart.md |

**Note on Principle II drift**: the ratified constitution text (v1.1.0) still lists
Ramer–Douglas–Peucker simplification as a pipeline step. Spec 001 already dropped it after on-device
testing (documented in its research.md R5) without amending the constitution. This plan follows the
codebase's actual, already-precedented practice (no RDP) rather than reopen that decision; it is
flagged here for visibility, not as a new violation this feature introduces.

Result: **PASS** at both checkpoints, with no new violations to justify.

## Project Structure

### Documentation (this feature)

```text
specs/002-whole-note-canvas/
├── plan.md              # This file
├── research.md          # Phase 0 decisions (R1–R10)
├── data-model.md         # Entities, save-state transitions
├── quickstart.md         # Build/test/deploy + manual iPad checklist
├── contracts/
│   ├── canvas-annotation-format.md  # ink-canvas block format (spike, not frozen)
│   └── canvas-mode-toggle.md        # Frontmatter marker + command surface
├── checklists/
│   └── requirements.md   # Spec quality checklist (already passed)
└── tasks.md               # Phase 2 output (/speckit-tasks; not created here)
```

### Source Code (repository root)

```text
src/
├── model/                 # REUSED unchanged: types.ts, quantize.ts, erase.ts, history.ts
├── format/                # REUSED unchanged: varint.ts, errors.ts, codec.ts, id.ts
├── document/
│   └── locate.ts           # EXTENDED: fence language becomes a parameter (was hardcoded 'ink')
├── render/                # REUSED unchanged: outline.ts, svg-preview.ts (previews if Reading view is reached)
├── editor/                # REUSED unchanged: input-filter.ts (classifyPointer), save-queue.ts
└── canvas/                 # NEW — Canvas Mode-specific
    ├── annotation-line.ts  # cv1 header grammar (parse/build); payload delegates to format/codec.ts
    ├── scan.ts              # listAnnotationBlocks(text) — full-note discovery on open
    ├── locate.ts            # locateAnnotation(text, id) — thin wrapper over the extended document/locate.ts
    ├── insert.ts            # insertAnnotationAfterParagraph(text, pos, blockMarkdown)
    ├── update.ts            # applyAnnotationUpdate — thin wrapper over document/update.ts
    ├── frontmatter.ts        # isCanvasModeEnabled / setCanvasModeEnabled (frontmatter read/write)
    ├── layout.ts             # margin/column geometry for the overlay (extends obsidian/column-width.ts)
    ├── view-plugin.ts        # CM6 ViewPlugin: hides raw ink-canvas ranges, exposes coordsAtPos anchors (glue)
    ├── pointer-capture.ts    # capturing-phase pointerdown/move/up filter over .cm-scroller (glue)
    └── session.ts            # in-memory annotation list + undo history for the open Canvas Mode note

tests/
├── unit/canvas/            # annotation-line, scan, insert, frontmatter (pure, test-first)
├── unit/document/
│   └── locate.test.ts       # extended cases for the new fence-language parameter
├── dom/canvas/              # view-plugin decoration + pointer-capture DOM tests (happy-dom)
└── integration/canvas/      # multi-annotation save/reflow suite (FakeVault, mirrors spec 001's concurrent-edits suite)
```

**Structure Decision**: Extend the existing single-project layout rather than start a new module
tree from scratch. Canvas Mode gets its own `src/canvas/` namespace for code that has no Block Mode
equivalent (frontmatter toggle, paragraph-boundary insertion, the CM6 view plugin, pointer capture),
while reusing spec 001's `model/`, `format/`, `render/`, and `editor/input-filter.ts`/`save-queue.ts`
modules unchanged. Only `document/locate.ts` is modified in place (a fence-language parameter),
because duplicating its fence-scanning logic for a second hardcoded language would violate
Principle V for no real benefit.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No constitution violations and no new runtime dependencies. Nothing to record.
