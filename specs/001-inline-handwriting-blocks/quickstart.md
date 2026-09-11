# Quickstart & Validation: Inline Handwriting Blocks

How to build, test and validate this feature end to end. Behaviour details live in
[contracts/](./contracts/) and [data-model.md](./data-model.md).

## Prerequisites

- Node 22+ and npm on the Linux dev machine.
- Obsidian ≥ 1.5.7 on the iPad (check Settings → About).
- The vault's local clone on the dev machine: `~/Documents/obsidian-personal/`. Its `.gitignore`
  does not exclude `.obsidian/plugins/obsidian-draw/`, so the built files travel to the iPad with
  the normal git sync.
- For on-device debugging: the Mac with Safari → Develop → [iPad] → Obsidian.

## Build and test

```bash
npm install
npm test               # unit + DOM + integration tests (Vitest)
npm run typecheck      # tsc --noEmit
npm run build          # esbuild → main.js
```

All three must pass before merging (constitution quality gates).

## Deploy to the vault

```bash
npm run deploy   # builds, then copies main.js, manifest.json, styles.css into
                 # ~/Documents/obsidian-personal/.obsidian/plugins/obsidian-draw/
                 # (override with OBSIDIAN_VAULT=/other/vault npm run deploy)
```

Then commit and push the vault (`~/Documents/obsidian-personal`) with git, pull it on the iPad with
Obsidian Git, and enable "Draw" in Settings → Community plugins (reload Obsidian after updates).
The deploy script only writes inside that one plugin folder; it never commits or pushes the vault.

## Automated validation (runs in `npm test`)

| Scenario | Proves |
|----------|--------|
| Golden v1 fixtures decode and re-encode byte-identically | FR-028, block-format contract |
| Seeded dense handwriting block encodes to ≤ 30 KB | FR-026, SC-004 |
| Encode → decode round-trip within RDP tolerance | Principle II |
| Concurrent-change suite (≥ 20 cases: lines added above/below, other blocks edited, CRLF, callout prefix, block deleted, block duplicated) | FR-022 – FR-025, SC-003 |
| Save leaves every byte outside the payload line unchanged | FR-023 |
| Clean session close performs no write | FR-027 |
| Two-branch git merge of a note edited in different places merges cleanly (test creates a temp repo) | SC-005 |
| Pointer classifier: pen draws, touch/mouse/hover ignored | FR-011, SC-007 (logic part) |
| History: add/erase/resize undo and redo in order | FR-014 |

## Manual iPad checklist (on-device gate)

Run each after deploying. Record pass/fail with the date and plugin commit in the PR description.

1. **Insert**: in a note, run "Insert handwriting block" from the mobile toolbar. The overlay opens
   within about a second; the canvas is as wide as the note text. (US1, SC-001)
2. **Write**: write a sentence. Ink follows the tip with no visible lag and varies with pressure.
   Then measure: in Safari on the Mac → Develop → [iPad] → Obsidian → Timelines, record 10 s of
   continuous writing. Pass if the `pointermove` handler is ≤ 4 ms at p95 and the frame track shows
   no dropped frames while writing. (US1, SC-002)
3. **Palm and fingers**: write a full canvas with your palm resting on the screen; tap the canvas with
   a finger. No stray marks. (FR-011, SC-007)
4. **Hover**: hold the Pencil just above the screen and move it. Nothing is drawn.
5. **Done**: tap Done. The preview appears in the note; the raw Markdown shows one `ink` block with a
   single data line. (US1)
6. **Theme**: switch light/dark. Preview and editor strokes change colour. (FR-007)
7. **Reopen in Live Preview and Reading view**: tap the preview in each. The overlay opens, the cursor
   never jumps into the block, and the block doesn't turn into source text. (US2, R13)
8. **Erase and undo**: erase two strokes in one motion, undo (both return), redo, add a stroke, Done.
   (US2)
9. **Autosave**: draw a stroke, wait 1 second, switch to another app and back. The stroke is saved.
10. **Resize**: make the canvas taller and narrower; try to shrink it past a stroke (it stops).
    Done; the preview has the new shape. (US4)
11. **Rotation**: rotate the iPad while the overlay is open. The canvas refits without distortion.
    (FR-030)
12. **Stress**: open and close the editor 50 times, then write for several minutes in one session.
    The canvas never goes blank. (SC-006)
13. **Scribble**: write in the overlay with Scribble enabled in iPadOS settings. No text is inserted
    into the note.
14. **Sync safety**: open a drawing; on another device, add a line above the block and push; pull on
    the iPad (Obsidian Git) while the overlay is open; draw and tap Done. Both changes survive. (US3)
15. **Deleted block**: open a drawing, delete its block from the note on another device and sync, then
    draw. The banner appears; "Append to note" adds the drawing at the end of the note. (FR-025)
16. **Many blocks**: a note with 20 drawings opens and shows all previews within about a second.
    (SC-008)
