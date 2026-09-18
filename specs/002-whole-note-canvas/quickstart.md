# Quickstart & Validation: Canvas Mode

How to build, test and validate this spike end to end. Behaviour details live in
[contracts/](./contracts/) and [data-model.md](./data-model.md). This spike shares its build/test
toolchain with spec 001 — see that feature's [quickstart.md](../001-inline-handwriting-blocks/quickstart.md)
for prerequisites (vault path, Safari Web Inspector setup) not repeated here.

## Build and test

```bash
npm install
npm test               # unit + DOM + integration tests (Vitest)
npm run typecheck      # tsc --noEmit
npm run build           # esbuild → main.js
```

## Deploy to the vault

```bash
npm run deploy   # same script as spec 001; copies main.js, manifest.json, styles.css
```

Commit and push the vault, pull on the iPad, reload Obsidian.

## Automated validation (runs in `npm test`)

| Scenario | Proves |
|----------|--------|
| `annotation-line` parse/build round-trips a `cv1` header, including negative `x0`/`y0` | contracts/canvas-annotation-format.md |
| `document/locate.ts` finds/duplicates/not-founds by id for an arbitrary fence language (`ink` and `ink-canvas` cases both covered) | Project Structure — extended module reused by both features |
| `scan.ts` discovers every `ink-canvas` block in a note with mixed `ink` and `ink-canvas` blocks, ignoring the former | data-model.md AnnotationBlockRef |
| `insertAnnotationAfterParagraph` inserts a new block right after the correct paragraph, given a position anywhere inside that paragraph, without disturbing other text | data-model.md "New annotation" save flow |
| `applyAnnotationUpdate` changes only the target annotation's payload line, byte-identical elsewhere, mirroring spec 001's byte-preservation suite | Constitution III |
| `frontmatter.ts` sets/reads/clears `canvas-mode` without disturbing other frontmatter keys | contracts/canvas-mode-toggle.md |
| Decode rejects out-of-sanity-bound coordinates | research.md R6 |

## Manual iPad checklist (on-device gate — this spike lives or dies here)

Run each after deploying. Record pass/fail with date and commit, plus any research.md finding it
prompts (an item failing here is expected to update research.md, not just this checklist).

1. **Pointer capture doesn't get pre-empted**: turn on Canvas Mode, draw a short mark in a margin.
   Confirm no stray cursor placement or text selection happens instead. (research.md R1)
2. **Overlay tracks scroll**: draw a mark, scroll the note, confirm the mark stays visually anchored
   to its paragraph rather than to a fixed screen position. (research.md R2, FR-002)
3. **Raw block stays hidden**: after drawing, confirm the note's Live Preview shows no visible
   `ink-canvas` fence or base64 text anywhere. Tap directly on/near the annotation's line to see
   whether the cursor landing there reveals raw source, and record the result either way.
   (research.md R4)
4. **US1 — margin annotation**: write a short mark in blank margin space beside a paragraph. Close
   and reopen the note. It renders in the same position relative to that paragraph. (US1, SC-001, SC-003)
5. **US1 — reflow**: add several lines of typed text above the annotated paragraph. Confirm the
   annotation stays with its paragraph, not at a fixed vertical position. (US1 Acceptance Scenario 2)
6. **US2 — mark up text**: circle a specific word. Reopen the note; the circle still surrounds that
   word. Edit surrounding sentences without touching the circled word; the circle stays put. (US2)
7. **US3 — spanning stroke**: draw one continuous stroke from the margin to a word in the text.
   Reopen the note; it renders as a single unbroken mark. (US3)
8. **Erase and undo**: erase a stroke, undo, redo — mirrors Block Mode's existing behavior. (FR-009)
9. **Deleted paragraph**: delete the paragraph an annotation is anchored to entirely. Confirm the
   file doesn't corrupt and the annotation's block reattaches to whatever now precedes it — record
   whether the resulting visual position is acceptable. (Edge Cases, research.md R3)
10. **No margin (split-screen/portrait)**: put Obsidian in split-screen so there's little/no visible
    margin. Confirm drawing over text (US2) still works, and record how a margin-style annotation
    degrades. (Edge Cases, research.md R9)
11. **Mode toggle is inert on Block Mode**: with Canvas Mode on, run "Insert handwriting block" in
    the same note. Confirm both coexist without interfering. (FR-001a)
12. **Plugin-absent degradation**: view the note's raw Markdown (or open it in a plain text editor).
    Confirm the frontmatter and `ink-canvas` blocks are ordinary, valid Markdown with no visual
    corruption. (contracts/canvas-mode-toggle.md)

## Concluding the spike

After the checklist above, write the go/no-go recommendation required by FR-011/SC-004 as a new
`## Go/No-Go Recommendation` section appended to this file (or a sibling `recommendation.md` if it
grows long), covering: which user stories felt natural vs. which didn't, which research.md items
were confirmed vs. revised on-device, and the edge-case outcome table required by SC-002.

## Go/No-Go Recommendation

**Status: implementation complete, on-device validation not yet run.** This section covers what
`/speckit-implement` was able to verify (typecheck, automated tests, production build) in an
environment with no iPad and no Safari Web Inspector attached, and is explicit about what it could
not verify. **The manual iPad checklist above (items 1–12) is still required before a real go/no-go
call can be made** — do not treat this section as satisfying FR-011 on its own; treat it as the
automated half of that requirement, with the on-device half still outstanding.

### What was verified automatically

- `npm run typecheck`, `npm test` (292 tests across 36 files), and `npm run build` all pass on the
  final state of all three user stories together (T042).
- Every pure module listed in tasks.md is implemented test-first: the `cv1` header grammar
  (including negative first-point offsets and no clamping on a 300+-unit spanning stroke), the
  generalized fence scanner shared with Block Mode, paragraph/fence-aware insertion-point finding
  (CRLF-safe), margin-band and overlay-point arithmetic, the CM6 decoration set that hides raw
  `ink-canvas` source, the capturing-phase pointer filter (reusing `classifyPointer` unchanged, and
  confirmed to intercept a pen event dispatched directly on a simulated `.cm-line`), and
  `CanvasModeNoteState`'s new-vs-existing-annotation resolution, undo ledger and dirty tracking.
- US2 (mark up existing text) and US3 (spanning strokes) both required **zero new production code**
  once US1's mechanism existed — T033 and T037 confirmed this by adding their tests directly against
  the US1 implementation and watching them pass unmodified, which is itself a positive signal for
  R3's core bet (anchoring is position-based, not region-based) and R6/R7 (the payload format is
  already unbounded and single-stroke-per-annotation by construction).
- Two edge cases (paragraph deleted, duplicate annotation id) round-trip correctly through the save
  path with the file left uncorrupted (T039). Writing that test caught one real bug, since fixed:
  `saveDirtyAnnotations` originally folded a whole batch's outcomes into one aggregate kind, so a
  `duplicate` (save refused) on one annotation could be masked by an `updated` on another in the same
  debounced tick, silently dropping the failed one from future retries. It now returns a per-id
  outcome map instead, and only ids that actually persisted are cleared from `dirty`.

### What could not be verified (no device available)

The CM6 `ViewPlugin`/pointer-capture wiring, the live overlay (`src/canvas/live-session.ts`), and
`main.ts`'s activation glue are, by design (constitution v1.1.0's glue exemption, plan.md's Technical
Context), not unit-testable — they depend on a real CM6 `EditorView`, real Pencil input, and real
iPad rendering/scroll behaviour. None of quickstart items 1–12 were run. In particular:

- **R1 (pointer capture not pre-empted)** and **R2 (overlay scroll sync)** — flagged in research.md
  as "the highest-risk, device-only bets in this whole spike" — are unconfirmed. The implementation
  attaches a capturing-phase listener to `EditorView.scrollDOM` and positions the overlay as a
  sibling of `EditorView.contentDOM` sized to its scrollable area, per R1/R2's decisions, but whether
  Obsidian/CM6 pre-empts the pointerdown before it, and whether the overlay's JS-driven resize
  actually keeps pace with reflow, is exactly the kind of thing this spike exists to test on-device.
- **R4 (hiding raw block source)**: the decoration logic is unit-tested (`computeAnnotationDecorations`
  builds a real `@codemirror/state` `DecorationSet`), but its interaction with Obsidian's own Live
  Preview decorations, and what happens when a cursor lands inside the hidden range, is unverified.
- **Anchor precision**: for a brand-new annotation, the stored anchor is `coordsAtPos` of where
  `findInsertionPoint` says the block *will* be inserted, evaluated against the pre-insertion
  document — this is a deliberate approximation (documented in `src/canvas/live-session.ts`), not a
  guarantee that a stroke re-renders at the exact pixel it was drawn at, especially for a multi-line
  paragraph. Whether this reads as "close enough" or "visibly jumps" is an on-device judgement call.
- Quickstart items 8 (erase/undo), 9 (deleted paragraph, on-device), 10 (no visible margin), 11
  (Block Mode coexistence), and 12 (plugin-absent degradation) are all unrun.

### Edge-case outcome table (SC-002)

| Edge case | Automated result | On-device result |
|---|---|---|
| Paragraph deleted | File uncorrupted, block updates in place, effectively reattaches to whatever now precedes it (T039) | Not run |
| Duplicate annotation id | Save refused, both copies kept, file unchanged (T039, both direct and batched paths) | Not run |
| No visible margin (split-screen) | N/A — needs real layout | Not run |
| Plugin-absent degradation | N/A — inert-Markdown claim follows from the `ink-canvas` fence format alone, not exercised without the plugin | Not run |
| Malformed/unsupported-version annotation | Skipped on render, never rewritten (annotation-line.test.ts rejections) | Not run |

### Recommendation

Proceed to the on-device checklist before deciding go/no-go. The mechanism is coherent and the
hardest part to get wrong by construction — file integrity — is solid: every save path is
test-covered, and the newly-fixed duplicate-id bug shows that coverage catching a real defect before
it reached a device. What remains unknown is entirely in the category the spike was designed to
surface (R1/R2's device-only bets), so **this is not a "ship it" recommendation and not a "kill it"
recommendation — it's "run the checklist next."** If R1 or R2 fail outright on-device, that alone is
enough to answer the go/no-go question per plan.md's Implementation Strategy, before spending more
time on polish.
