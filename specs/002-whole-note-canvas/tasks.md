---
description: "Task list for Canvas Mode — Live Strokes Over Typed Text (002)"
---

# Tasks: Canvas Mode — Live Strokes Over Typed Text

**Input**: Design documents from `specs/002-whole-note-canvas/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: MANDATORY for pure logic, per the constitution (Principle I, non-negotiable): every
implementation task for a pure module is preceded by a test task, run and seen failing first. Thin
glue with no branching and no data-handling decisions (CM6 registration, DOM measurement, wiring
Obsidian objects into tested functions) is exempt under constitution v1.1.0 and is marked "Glue";
it is instead covered by the manual iPad checklist in [quickstart.md](./quickstart.md). Per
plan.md's Technical Context, the CM6 `ViewPlugin` and capturing-phase pointer interception
specifically (`src/canvas/view-plugin.ts`, `src/canvas/pointer-capture.ts`) cannot be faithfully
unit-tested headless — they get DOM-level smoke tests where feasible plus the on-device checklist,
not full behavioral coverage.

**Organization**: Tasks are grouped by user story (US1–US3, from spec.md) so each can be validated
independently. This is a feasibility spike (spec.md "Nature of this feature"): scope is deliberately
kept to what the three user stories need, not a production-hardening pass.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: User story the task belongs to (US1–US3)
- "Red" = write the test, run `npx vitest run <file>` and confirm it fails for the expected reason.
  "Green" = implement the minimum to pass, then refactor with the suite green.

## Path Conventions

Same single Obsidian plugin project as spec 001: `src/`, `tests/` at the repository root (see
plan.md → Project Structure). New code lives under `src/canvas/`; `src/document/locate.ts` is
extended in place (a fence-language parameter); everything else spec 001 built
(`model/`, `format/`, `render/`, `editor/input-filter.ts`, `editor/save-queue.ts`) is reused
unchanged and imported directly, never copied.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Nothing new to scaffold — this feature builds inside spec 001's existing toolchain
(package.json, tsconfig, esbuild, vitest, manifest all already exist and are shared).

- [X] T001 Create the `src/canvas/` and `tests/unit/canvas/`, `tests/dom/canvas/`,
  `tests/integration/canvas/` directories (empty, so subsequent tasks have somewhere to write); confirm
  `npm run typecheck && npm test && npm run build` still pass unchanged before any new code is added

**Checkpoint**: Existing spec 001 suite still green; new directories exist.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared storage format (`cv1` header grammar), the generalized block scanner, and
the frontmatter toggle — every user story's annotations need all three to be saved, found, and
rendered at all.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 [P] Red: extend `tests/unit/document/locate.test.ts` with cases for a `fenceInfo`
  parameter: `locateBlock(text, id, 'ink')` behaves exactly as before (default/back-compat);
  `locateBlock(text, id, 'ink-canvas')` finds an `ink-canvas` block and ignores same-id `ink` blocks
  in the same text, and vice versa; existing no-argument-for-fenceInfo call sites (Block Mode) keep
  compiling and passing untouched
- [X] T003 Green: extend `src/document/locate.ts`'s `locateBlock` with a `fenceInfo = 'ink'` parameter
  (default preserves current behavior), replacing the hardcoded `open.info === 'ink'` check, to pass
  T002; run the full existing spec 001 suite to confirm zero regressions (contracts/canvas-annotation-format.md;
  plan.md Project Structure — "Extended module reused by both features")
- [X] T004 [P] Red: tests for `parseAnnotationLine`/`formatAnnotationLine` in
  `tests/unit/canvas/annotation-line.test.ts`: round-trip a `cv1;id=<id>;<payload>` line, including a
  payload whose first point has negative `x0`/`y0`; empty payload formats as `cv1;id=<id>;`; rejections
  (`malformed`) for a missing field, a wrong-length/charset id, invalid payload characters; `cv2;…` →
  `unsupported-version`; trailing whitespace ignored (contracts/canvas-annotation-format.md)
- [X] T005 Green: implement `src/canvas/annotation-line.ts` (delegates payload encode/decode to
  `format/codec.ts` unchanged, passing a fixed large sanity bound instead of a real width/height per
  research.md R6) to pass T004 (depends on: none — `format/codec.ts` already exists from spec 001)
- [X] T006 [P] Red: tests for `listAnnotationBlocks` in `tests/unit/canvas/scan.test.ts`: a note with
  two `ink-canvas` blocks and one `ink` block returns exactly the two `ink-canvas` refs, each with
  correct `id`, `blockStart`/`blockEnd` (fence-to-fence) and `payloadStart`/`payloadEnd`; an empty note
  returns `[]`; a malformed `ink-canvas` block is still returned as a ref (so the caller can decide to
  skip it) rather than throwing (data-model.md AnnotationBlockRef)
- [X] T007 Green: implement `src/canvas/scan.ts`'s `listAnnotationBlocks` (built on the extended
  `document/locate.ts` scanning logic) to pass T006 (depends on T003)
- [X] T008 [P] [US1] Red: tests for `locateAnnotation` in `tests/unit/canvas/locate.test.ts`:
  thin-wrapper cases mirroring `locateBlock`'s `found`/`not-found`/`duplicate` variants for the
  `ink-canvas` fence language (data-model.md AnnotationLocation)
- [X] T009 Green: implement `src/canvas/locate.ts`'s `locateAnnotation` (calls the extended
  `locateBlock(text, id, 'ink-canvas')`) to pass T008 (depends on T003)
- [X] T010 [P] Red: tests for `applyAnnotationUpdate` in `tests/unit/canvas/update.test.ts`: replaces
  only the target annotation's payload line, byte-identical elsewhere (mirrors spec 001's
  `applyBlockUpdate` byte-preservation guarantee); `not-found`/`duplicate` leave text unchanged
- [X] T011 Green: implement `src/canvas/update.ts`'s `applyAnnotationUpdate` (thin wrapper over
  `document/update.ts`'s `applyBlockUpdate`, using `locateAnnotation`) to pass T010 (depends on T009)
- [X] T012 [P] Red: tests for `isCanvasModeEnabled`/`setCanvasModeEnabled` in
  `tests/unit/canvas/frontmatter.test.ts`, against a fake frontmatter object: `true` → enabled;
  `false`/absent/any non-boolean value → disabled; setting `true` then `false` round-trips; setting the
  flag does not touch other existing keys (contracts/canvas-mode-toggle.md)
- [X] T013 Green: implement `src/canvas/frontmatter.ts` to pass T012 (pure function operating on a
  plain object shape compatible with Obsidian's `processFrontMatter` callback argument; the actual
  `app.fileManager.processFrontMatter` call is glue, wired in T033)

**Checkpoint**: `npm test` green. The `cv1` format, generalized scanner/locate/update, and frontmatter
toggle logic are ready for every user story to build on.

---

## Phase 3: User Story 1 - Annotate the margin beside a paragraph (Priority: P1) 🎯 MVP

**Goal**: Turn Canvas Mode on, draw a short mark in blank margin space beside a paragraph with the
Pencil, and have it render in the same relative position after closing/reopening the note and after
unrelated text is added/removed above it.

**Independent Test**: Open a note with typed paragraphs, run "Turn note into canvas", draw a short
mark in the margin beside one paragraph, close and reopen the note, confirm the mark renders in the
same position relative to that paragraph (quickstart manual items 1–5).

### Tests for User Story 1 (write first, confirm they fail) ⚠️

- [X] T014 [P] [US1] Red: tests for `insertAnnotationAfterParagraph` in
  `tests/unit/canvas/insert.test.ts`: given a document position anywhere inside a paragraph, inserts a
  blank line plus the new `ink-canvas` block immediately after that paragraph's end and before the next
  paragraph (or end of file); a position on the note's last paragraph appends at the end of the file; a
  position on a paragraph immediately followed by an existing `ink-canvas`/`ink` block inserts after
  that existing block, not before it; leaves all other text byte-identical; works against CRLF text
- [X] T015 [P] [US1] Red: tests for `layout` helpers in `tests/unit/canvas/layout.test.ts`: given a
  `.cm-scroller` width and a `.cm-content` width + left offset (as plain numbers, no DOM), compute the
  left-margin and right-margin bands available beside the content column; a scroller no wider than the
  content column yields zero-width margins on both sides (research.md R9 — feeds the "no visible
  margin" edge case, doesn't special-case it)
- [X] T016 [P] [US1] Red: DOM tests (happy-dom) for `src/canvas/view-plugin.ts` in
  `tests/dom/canvas/view-plugin.test.ts`: given a doc string containing one `ink-canvas` block, the
  computed decoration set replaces exactly the block's full range (fence to fence) with a zero-size
  widget; a doc with an `ink` block only produces no decorations; recomputing after a doc change that
  moves the block's position updates the decoration range accordingly
- [X] T017 [P] [US1] Red: DOM tests (happy-dom) for `src/canvas/pointer-capture.ts` in
  `tests/dom/canvas/pointer-capture.test.ts`: a `pointerdown` with `pointerType: 'pen'` dispatched on a
  child of the capture root is intercepted (`defaultPrevented` true, injected `onPenStart` called with
  the event and local coordinates); a `pointerType: 'touch'`/`'mouse'` event is left alone
  (`defaultPrevented` false, `onPenStart` not called); reuses `classifyPointer` from
  `editor/input-filter.ts` unchanged rather than reimplementing pen detection
- [X] T018 [US1] Red: tests for the add-stroke path of `CanvasModeNoteState` in
  `tests/unit/canvas/session.test.ts`: starting a stroke at a point not inside any existing
  annotation's bounds creates a new `Annotation` with a fresh id and marks it dirty; a stroke that
  lands inside an existing annotation's stroke bounds appends to that annotation instead; each commit
  pushes an entry onto the session's `undoLedger` naming the touched annotation id; `dirty` tracks
  exactly the touched annotation ids
- [X] T019 [P] [US1] Red: integration test `tests/integration/canvas/save-new-annotation.test.ts`
  using the existing `FakeVault` (`tests/integration/fake-vault.ts`, reused unchanged): saving a
  brand-new annotation inserts its block right after the paragraph nearest the recorded pen-down
  position in the *current* stored text (not a stale copy read when Canvas Mode was turned on);
  saving an existing annotation a second time updates only its payload line

### Implementation for User Story 1

- [X] T020 [P] [US1] Green: implement `src/canvas/insert.ts`'s `insertAnnotationAfterParagraph` to
  pass T014 (paragraph = a blank-line-delimited run of lines, reusing the blank-line/fence-aware line
  scanning approach already proven in `document/locate.ts`)
- [X] T021 [P] [US1] Green: implement `src/canvas/layout.ts`'s margin-band calculation to pass T015
  (pure arithmetic; the DOM measurement that feeds it is glue, added in T024)
- [X] T022 [US1] Green: implement `src/canvas/view-plugin.ts`'s decoration computation to pass T016
  (depends on T007 `listAnnotationBlocks`); wiring it as an actual registered CM6 `ViewPlugin` inside a
  live `EditorView` is glue, done in T033
- [X] T023 [US1] Green: implement `src/canvas/pointer-capture.ts`'s filter/dispatch logic to pass T017
  (depends on `editor/input-filter.ts`, reused unchanged); attaching it to a real `.cm-scroller` with
  `{ capture: true, passive: false }` is glue, done in T033 (research.md R1)
- [X] T024 [US1] Glue: implement DOM measurement for margin geometry — read `.cm-scroller` and
  `.cm-content` `getBoundingClientRect()`/computed padding and pass the numbers into
  `src/canvas/layout.ts` (no branching of its own; extends the pattern already used by
  `obsidian/column-width.ts`)
- [X] T025 [US1] Green: implement `CanvasModeNoteState`'s add-stroke/new-vs-existing-annotation
  resolution and `undoLedger` bookkeeping in `src/canvas/session.ts` to pass T018 (depends on T005,
  `model/quantize.ts`'s `commitStroke` reused unchanged for point quantization, `model/erase.ts`'s
  bounding-box logic reused for "is this point inside an existing annotation")
- [X] T026 [US1] Green: implement the save path (new annotation → `insertAnnotationAfterParagraph` +
  `newAnnotationMarkdown`; existing annotation → `applyAnnotationUpdate`) wired through the existing
  `editor/save-queue.ts` `SaveQueue` (reused unchanged, one instance per open Canvas Mode note) to pass
  T019 (depends on T005, T009, T011, T020)
- [ ] T027 [US1] Glue: implement `isCanvasModeEnabled`/toggle wiring — the "Turn note into canvas"
  command (`src/canvas/frontmatter.ts` + `app.fileManager.processFrontMatter`, per
  contracts/canvas-mode-toggle.md), registering/deregistering the CM6 `ViewPlugin` (T022) and pointer
  capture (T023) for the active editor view; no data-handling decisions of its own
- [ ] T028 [US1] Glue: wire `src/main.ts`: register the "Turn note into canvas" command (addable to the
  mobile toolbar per FR-001a), activate/deactivate Canvas Mode when the active leaf changes to/from a
  `canvas-mode: true` note (contracts/canvas-mode-toggle.md "Activation scope"), hold the
  `CanvasModeNoteState`/`SaveQueue` per open note
- [ ] T029 [US1] Write `styles.css` additions for `.canvas-mode-overlay` (`position: absolute`,
  `pointer-events: none`, sized to the scroller) and any live-stroke drawing layer, using only
  Obsidian CSS variables (mirrors spec 001's `.ink-overlay`/`.ink-surface` conventions)
- [ ] T030 [US1] Gate: `npm run typecheck && npm test && npm run build`; then `npm run deploy` and run
  quickstart manual items 1–5 on the iPad. Record results, including the research.md R1/R2/R4 risk
  items explicitly (pointer capture not pre-empted, overlay tracks scroll, raw block stays hidden) —
  a failure here is a valid spike finding to record in research.md, not necessarily a blocker to fix

**Checkpoint**: Margin annotations can be drawn, saved inline, and reflow correctly with their
paragraph. This alone is enough to judge the core value proposition (SC-001).

---

## Phase 4: User Story 2 - Mark up existing typed text (Priority: P2)

**Goal**: Draw a stroke overlapping existing typed text (circle a word, underline a phrase) and have
it stay visually aligned with that text after reopening the note and after unrelated edits elsewhere.

**Independent Test**: Circle a specific word; confirm the circle stays aligned with that word after
reopening the note and after retyping/reformatting surrounding sentences (quickstart manual item 6).

### Tests for User Story 2 (write first, confirm they fail) ⚠️

- [ ] T031 [P] [US2] Red: extend `tests/unit/canvas/session.test.ts`: a stroke whose pen-down point is
  over existing typed text (not blank margin space) still resolves to the nearest preceding paragraph
  as its anchor, exactly like a margin stroke — there is no separate code path for "over text" vs.
  "in the margin" (US2 Acceptance Scenario 1, confirms R3's anchoring is position-based, not
  region-based)
- [ ] T032 [P] [US2] Red: extend `tests/dom/canvas/pointer-capture.test.ts`: a pen `pointerdown`
  directly over a `.cm-line` element (simulated) is still intercepted and prevented, confirming the
  capture listener isn't scoped only to margin/empty areas

### Implementation for User Story 2

- [ ] T033 [US2] Green: confirm T031/T032 pass against the User Story 1 implementation with no
  production code changes required (per research.md R3, anchoring is already position-based and R1's
  capture listener is already note-wide); if either test exposes a gap, fix it test-first here rather
  than in US1's files retroactively
- [ ] T034 [US2] Gate: `npm run typecheck && npm test && npm run build`; deploy and run quickstart
  manual item 6 on the iPad. Record whether marking up live text felt reliable — this is the story
  most likely to surface CM6/Obsidian decoration interaction issues (research.md R4's risk)

**Checkpoint**: Both blank-margin and over-text annotation are validated with the same underlying
mechanism — confirms the anchoring model generalizes rather than needing per-region special-casing.

---

## Phase 5: User Story 3 - Connect a margin note to text with a spanning stroke (Priority: P3)

**Goal**: Draw one continuous stroke starting in the margin and ending on a word in the text; it
renders as a single unbroken mark after reopening the note.

**Independent Test**: Draw one continuous stroke connecting a margin note to nearby text; confirm it
renders as one continuous mark after reopening (quickstart manual item 7).

### Tests for User Story 3 (write first, confirm they fail) ⚠️

- [ ] T035 [P] [US3] Red: extend `tests/unit/canvas/annotation-line.test.ts`/`codec` usage: a stroke
  whose points range far outside a small margin-sized bounding box (e.g., spanning 300+ canvas units)
  round-trips exactly through `parseAnnotationLine`/`formatAnnotationLine`, confirming no clamping is
  applied anywhere in the Canvas Mode encode path (research.md R7, contrasted explicitly with Block
  Mode's `[0,width]×[0,height]` clamp)
- [ ] T036 [P] [US3] Red: extend `tests/unit/canvas/session.test.ts`: a stroke started at a margin
  point and continued to a point far into the text column is stored as a single stroke in one
  annotation (the one anchored to the paragraph nearest the start point), never split into two
  annotations or truncated at the margin/text boundary

### Implementation for User Story 3

- [ ] T037 [US3] Green: confirm T035/T036 pass with no production changes (per research.md R6's
  unbounded sanity check and R7's single-anchor-per-stroke rule, already implemented in Phase 2/3); if
  a gap is found (e.g., an accidental clamp inherited from reusing Block Mode code paths), fix it
  test-first
- [ ] T038 [US3] Gate: `npm run typecheck && npm test && npm run build`; deploy and run quickstart
  manual item 7 on the iPad

**Checkpoint**: All three user stories validated. This is the capability Block Mode structurally
cannot offer (plan.md Summary) — its result is the strongest single input to the go/no-go call.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Edge-case outcomes and the spike's required conclusion (FR-011, SC-002, SC-004).

- [ ] T039 [P] Red then Green: tests + implementation for the "paragraph deleted" and "duplicate
  annotation id" edge cases in `tests/integration/canvas/reflow-save.test.ts` (FakeVault-based,
  mirrors spec 001's concurrent-edits suite pattern): deleting an annotation's anchor paragraph leaves
  the file uncorrupted and the block reattached to whatever now precedes it; a duplicated `ink-canvas`
  id behaves like Block Mode's `duplicate` outcome (save refused, user-visible, drawing kept) rather
  than silently picking one
- [ ] T040 [P] Run the "no visible margin" and "plugin-absent degradation" checks from quickstart
  manual items 10 and 12; no code change expected — record the outcome
- [ ] T041 [P] Run quickstart manual items 8 (erase/undo), 9 (deleted paragraph, on-device), and 11
  (Block Mode coexistence) — record outcomes, including whether "Insert handwriting block" and
  "Turn note into canvas" interfered in any way (FR-001a)
- [ ] T042 Full gate: `npm run typecheck && npm test && npm run build`, all green, on the final state
  of all three user stories together
- [ ] T043 Write the `## Go/No-Go Recommendation` section in quickstart.md (or a sibling
  `recommendation.md`) per its "Concluding the spike" instructions: which stories felt natural, which
  research.md items were confirmed vs. revised on-device (update research.md itself for any revision,
  following the precedent of spec 001's R5), and the edge-case outcome table required by SC-002
  (depends on T030, T034, T038, T039, T040, T041)

**Checkpoint**: FR-011/SC-004 satisfied — a written, evidence-backed go/no-go recommendation exists.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories (the `cv1` format, scanner,
  locate/update wrappers, and frontmatter toggle are needed by every story).
- **User Story 1 (Phase 3)**: Depends on Foundational. No dependency on US2/US3.
- **User Story 2 (Phase 4)**: Depends on Foundational **and** on US1's implementation existing to
  confirm against (T033 is a "no new code" checkpoint, not independent implementation) — this is
  intentional: the whole point of R3's anchoring design is that margin and over-text annotation share
  one mechanism, so US2 is a validation pass on US1's code, not a parallel build.
- **User Story 3 (Phase 5)**: Same relationship as US2 — depends on Foundational and validates
  US1/US2's shared implementation rather than adding a parallel one.
- **Polish (Phase 6)**: Depends on US1–US3 all being validated.

### Within Each User Story

- Tests (Red) before implementation (Green), per constitution Principle I.
- `session.ts` tasks depend on `annotation-line.ts`, `insert.ts`, `locate.ts`/`update.ts` existing
  (Phase 2), since saving needs all of them.
- Glue tasks (view-plugin registration, pointer-capture attachment, `main.ts` wiring) come last in
  each story, after their underlying pure logic is green.

### Parallel Opportunities

- Phase 2: T002, T004, T006, T008, T010, T012 (all Red tasks, different files) in parallel; their
  Green tasks follow each one's own Red task.
- Phase 3: T014, T015, T016, T017 (Red tasks, different files) in parallel; T020, T021 in parallel
  after their Reds.
- Phase 4 and 5 are small enough (one confirm-and-gate task each) that parallelism isn't meaningful.
- Phase 6: T039, T040, T041 in parallel (independent checklist items / independent test file).

---

## Parallel Example: Phase 2 (Foundational)

```bash
# Red phase, all at once (different files):
Task: "T002 extend locateBlock tests for a fenceInfo parameter in tests/unit/document/locate.test.ts"
Task: "T004 annotation-line tests in tests/unit/canvas/annotation-line.test.ts"
Task: "T006 scan tests in tests/unit/canvas/scan.test.ts"
Task: "T012 frontmatter tests in tests/unit/canvas/frontmatter.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup → Phase 2 Foundational.
2. Phase 3 (US1) → T030 gate: deploy and run quickstart items 1–5 on the iPad.
3. **Stop and validate**: research.md R1 (pointer capture) and R2 (overlay scroll sync) are the
   highest-risk, device-only bets in this whole spike — if either fails badly on-device, that alone
   may be enough to answer the go/no-go question before US2/US3 are built at all.

### Incremental Delivery

- US1 → the core margin-annotation experience, and the riskiest technical bet.
- US2 → confirms the same mechanism generalizes to marking up live text (mostly a validation pass).
- US3 → confirms spanning strokes, Canvas Mode's clearest advantage over Block Mode.
- Polish → the required go/no-go write-up, which is this spike's actual deliverable (FR-011).

## Notes

- This is a spike: several "implementation" tasks in US2/US3 are deliberately "confirm, don't build"
  tasks (T033, T037), because the design in research.md R3/R6/R7 was chosen specifically so those
  stories fall out of US1's mechanism rather than needing their own code paths. If a confirm task
  fails, fix test-first in the Foundational/US1 file it traces back to, not by adding a new
  US2/US3-specific code path.
- Commit after each Red/Green pair, per constitution workflow gate 2.
- No golden fixtures are added for `cv1` (contracts/canvas-annotation-format.md — deferred for a spike
  format).
- `main.js` remains a git-ignored build artifact; `npm run deploy` is the only way build output
  reaches the vault, same as spec 001.
