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

**Status: implementation complete; on-device validation in progress, not finished.** `/speckit-implement`
verified typecheck/automated tests/build in an environment with no iPad and no Safari Web Inspector
attached; a first round of real on-device testing has since happened (via the user, relayed back
through chat rather than Safari Web Inspector directly), found and fixed three real bugs, and
confirmed the core drawing mechanism works. **The manual iPad checklist above (items 1–12) is still
only partially run** — do not treat this section as satisfying FR-011 on its own yet; several items
below are still open, most importantly reflow (item 5), reopening after a save (item 4), and US2/US3
(items 6–7).

### On-device findings so far (this round)

Three bugs were found and fixed purely from user reports in chat (no direct console/Web Inspector
access this round — see research.md R1/R11 for full detail):

1. **Pencil scrolled the note instead of drawing, no ink appeared.** Fixed: `pointer-capture.ts` now
   also toggles `touch-action: none` on `.cm-scroller` for the duration of a stylus contact
   (detected via WebKit's `Touch.touchType`), restoring it on touch end — `preventDefault()` on the
   pointer events alone (the pre-device-testing implementation) was not enough to stop WebKit's
   compositor-driven pan. **Confirmed fixed**: the user reported ink now appears when drawing.
2. **Toggling Canvas Mode on didn't activate it** (frontmatter showed `canvas-mode: true`, ticked,
   but nothing was captured) until switching notes away and back. Fixed: activation now acts on the
   boolean just written to frontmatter instead of re-reading `metadataCache` immediately afterward,
   which doesn't reliably reflect the write yet at that exact moment.
3. **Plugin failed to load** (a crash loop on every subsequent Obsidian launch, since `canvas-mode:
   true` stayed set on the note and startup re-activation hit the same crash every time). Fixed: the
   overlay DOM insertion no longer assumes `.cm-content` is a direct child of `.cm-scroller`
   (`insertBefore` → `appendChild`), and every activation boundary now catches and logs/notifies
   instead of throwing.

None of these three were predicted before implementation, and none could have been found without a
real device — exactly the category of risk this spike exists to surface (R1 was right to flag this
area as the highest-risk, device-only bet, even though the *specific* failure mode differed from what
was anticipated).

### On-device findings, round two (input lag + scroll desync)

A second round reported input feeling slow, ink "desyncing" from its paragraph on scroll, and the
note's scrollable area growing with blank space above the content after scrolling. Root-caused
against `@codemirror/view`'s own source/types (not guessed): the redraw path recomputed
`coordsAtPos()` per annotation on every pointer move with no frame throttling (the lag), and the
session only refreshed anchors/overlay size on `ViewUpdate.docChanged`, missing that CM6 corrects its
internal height estimates — and fires `geometryChanged`/`heightChanged`, not `docChanged` — as
previously off-screen content gets measured for real while scrolling (the desync). Both fixed; see
research.md R12 for full detail.

### On-device findings, round three (lag scaling with note length, blank space still growing, reopen failure)

The scroll desync itself was confirmed fixed ("scribbles now stay attached to the note"), but three
more symptoms showed up: input lag now scaled with note length (small notes near-instant, long notes
appreciably laggy — the R12 fix throttled *frequency* but not *cost per frame*), the note's scrollable
area still grew with blank space above the content on scroll (R12's fix kept anchors correct but never
addressed the overlay's own size tracking), and — most seriously — a note once turned into a canvas
could no longer be reopened at all after being closed (Obsidian showing a generic "failed to open"
error).

The first two were traced to R2's original decision to size the overlay to the whole note rather than
the viewport, which is now reversed — see research.md R13. The third produced one confirmed, separate
bug on inspection (`main.ts`'s `syncCanvasSession` trusting a stale cached-file comparison instead of
the live plugin's own session state — research.md R14), but that fix is **not confirmed to be the full
explanation** for the reported error; it needs a repro to know whether this is a plugin-activation
failure (Canvas Mode silently not restarting) or actual file corruption (the note's raw Markdown
itself failing to open even outside this plugin).

### On-device findings, round four (R13/R14 partially confirmed; distortion and reopen both persist)

R13 helped: the user confirmed "the behaviour has definitely improved on the scroll vertical sync."
But two things did not fully resolve:

- **A residual "distortion,"** more likely the longer the note but not a strict one-page/multi-page
  cutoff. Root-caused to a second, distinct bug — static annotations were still painted at an anchor
  *cached* by the last `loadStatic()` call, which can go stale in the window between a CM6 layout
  correction and the next `geometryChanged` event. Fixed by re-resolving each on-screen candidate's
  anchor fresh on every redraw instead of trusting the cache to paint with — see research.md R15.
  **Not yet on-device confirmed.**
- **The reopen failure is still present.** R14's fix (checking the live plugin's session instead of a
  cached file reference) did not resolve it. File corruption has been ruled out (the user confirmed the
  note's `ink-canvas` blocks look intact in git's diff view), narrowing this to a plugin- or
  Obsidian-activation-path failure, but the actual mechanism is still unknown. **This needs a repro from
  the user to make further progress on**, not another guess: (a) does "exit the page" mean switching to
  a different note within Obsidian, or fully closing/backgrounding the app and reopening it later — these
  point at different code paths (`active-leaf-change`/`file-open` vs. `onLayoutReady`); (b) the exact
  console output from Safari Web Inspector at the moment the error appears, if it can be captured
  (CLAUDE.md's own documented debugging path for this device).

### On-device findings, round five (distortion re-diagnosed as file corruption; reopen bug pinned down and fixed)

Two clarifications from the user substantially changed the diagnosis for both open items:

- **The "distortion" correlated with the note already containing a code block, not with note length.**
  That pointed away from R15's stale-anchor theory and at `insert.ts`'s `chunkify()`: a non-ink fence
  (e.g. a ` ```js ` block) containing a blank line — extremely common — was misread as two separate
  paragraphs, and a new annotation drawn near it could be inserted *inside* the fence, breaking it into
  two malformed pieces. This is real file corruption, not a rendering bug, and a far more plausible
  explanation for visually wrong rendering than R15 (which may still be a real, separate, smaller
  effect). Fixed with direct unit-test coverage (unlike the glue-only R12–R15 fixes) — see research.md
  R16.
- **The exact reopen error was captured: "Canvas Mode couldn't find its editor extension."** That's a
  specific, known code path (`getCanvasSession` returning null), not a mystery — it means Obsidian
  hadn't finished attaching our globally-registered CM6 extension to the freshly-reopened note's
  `EditorView` yet at the moment we checked, the same class of event-fires-before-dependent-state-
  settles race as R11's frontmatter-cache timing. Fixed with a bounded retry (research.md R17).

### On-device findings, round six (both remaining items need evidence, not another guess)

R17's retry fix confirmed working for its own symptom (the "couldn't find its editor extension" Notice
no longer appears) — but "failed to open ''" still happens on reopen, unchanged, proving it was never
actually caused by that Notice/race in the first place. Separately, the "distortion" was narrowed by
the user to a Block Mode `ink` block near a Canvas Mode `ink-canvas` annotation (not a generic code
block as R16 assumed) — R16's fix is still a real, valid bug fix, just not the explanation for this
specific symptom.

Both are now genuinely open with no remaining code-review-based hypothesis worth trying blind — see
research.md's "Still open" section for exactly what's needed next (Safari Web Inspector console output
for the reopen error; a screenshot or git diff, plus which of three possible meanings "distortion"
refers to, for the adjacency issue). Checklist item 11 (Block Mode/Canvas Mode coexistence) is now the
most relevant unchecked item given the adjacency clue.

### What was verified automatically

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

### What's now confirmed vs. still open on-device

- **Quickstart item 1 (pointer capture) — confirmed working**, after the `touch-action` fix above.
  Drawing with the Pencil is captured and ink renders live on the overlay.
- **R1 (pointer capture is a viable interception point at all) — confirmed.** The *specific* risk as
  originally written (CM6/Obsidian pre-empting the pointerdown itself) did not materialize; the real
  blocker was WebKit's `touch-action` handling, now fixed (research.md R1).
- **R2 (overlay scroll sync), quickstart items 2–7, 9 — still unconfirmed.** Only "does a stroke
  appear where drawn" has been checked so far, in a single note, in one sitting. Not yet checked:
  scrolling after drawing (item 2), the raw block staying hidden (item 3), reopening the note after a
  save actually reflows the stroke correctly (item 4 fully — the anchor-resolution path in
  `saveDirtyAnnotations`/`live-session.ts` has not been exercised end-to-end on a real reload), text
  reflow keeping the annotation with its paragraph (item 5), marking up existing typed text (item 6,
  US2), a spanning stroke from margin to text (item 7, US3), and the deleted-paragraph on-device
  behavior (item 9).
- **R4 (hiding raw block source)**: the decoration logic is unit-tested (`computeAnnotationDecorations`
  builds a real `@codemirror/state` `DecorationSet`), but its interaction with Obsidian's own Live
  Preview decorations, and what happens when a cursor lands inside the hidden range, is unverified
  (item 3).
- **Anchor precision**: for a brand-new annotation, the stored anchor is `coordsAtPos` of where
  `findInsertionPoint` says the block *will* be inserted, evaluated against the pre-insertion
  document — this is a deliberate approximation (documented in `src/canvas/live-session.ts`), not a
  guarantee that a stroke re-renders at the exact pixel it was drawn at, especially for a multi-line
  paragraph. Whether this reads as "close enough" or "visibly jumps" is an on-device judgement call
  that needs a reload to check (item 4) — not yet done.
- Quickstart items 8 (erase/undo), 10 (no visible margin), 11 (Block Mode coexistence), and 12
  (plugin-absent degradation) are all still unrun.

### Edge-case outcome table (SC-002)

| Edge case | Automated result | On-device result |
|---|---|---|
| Pointer capture / basic drawing (item 1) | N/A — glue, not unit-testable | **Confirmed working**, after the `touch-action` fix |
| Paragraph deleted | File uncorrupted, block updates in place, effectively reattaches to whatever now precedes it (T039) | Not run |
| Duplicate annotation id | Save refused, both copies kept, file unchanged (T039, both direct and batched paths) | Not run |
| No visible margin (split-screen) | N/A — needs real layout | Not run |
| Plugin-absent degradation | N/A — inert-Markdown claim follows from the `ink-canvas` fence format alone, not exercised without the plugin | Not run |
| Malformed/unsupported-version annotation | Skipped on render, never rewritten (annotation-line.test.ts rejections) | Not run |

### Recommendation

Continue the on-device checklist before deciding go/no-go — **do not stop at "ink appears," that's
only item 1 of 12.** The mechanism is coherent, the highest-priority risk (Pencil input actually
reaching the drawing surface at all) is now confirmed, and file integrity — the hardest part to get
wrong by construction — is solid and test-covered (the newly-fixed duplicate-id bug shows that
coverage catching a real defect before it reached a device). But three real, unpredicted bugs came
out of a single round of on-device testing on the *first* checklist item alone (research.md R11);
that is itself evidence this category of risk is real and not yet exhausted. **The next concrete
step is quickstart items 2–7 and 9** (in particular: close the note and reopen it to check the
stroke re-renders in the same place — item 4 — since that's the first real exercise of the
anchor-resolution/save round-trip together, which has only been unit-tested in isolation so far).
This is still not a "ship it" or "kill it" call — it's "keep running the checklist, in order."
