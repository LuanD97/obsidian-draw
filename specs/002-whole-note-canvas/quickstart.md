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
