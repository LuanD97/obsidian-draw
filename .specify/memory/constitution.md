<!--
Sync Impact Report
==================
Version change: (unversioned template) → 1.0.0
Bump rationale: Initial ratification of the constitution for a greenfield project.

Modified principles (template placeholder → new title):
  - [PRINCIPLE_1_NAME] → I. Test-Driven Development (NON-NEGOTIABLE)
  - [PRINCIPLE_2_NAME] → II. Inline, Merge-Friendly Storage
  - [PRINCIPLE_3_NAME] → III. Never Lose User Data
  - [PRINCIPLE_4_NAME] → IV. iPad-First, Mobile-Safe
  - [PRINCIPLE_5_NAME] → V. Lightweight and Simple

Added sections:
  - Technical Constraints (from [SECTION_2_NAME])
  - Development Workflow & Quality Gates (from [SECTION_3_NAME])
  - Governance (filled in)

Removed sections: none

Templates reviewed (not modified by this command; they read the constitution at runtime):
  - .specify/templates/plan-template.md ("Constitution Check" gate) — compatible
  - .specify/templates/spec-template.md — compatible
  - .specify/templates/tasks-template.md — ⚠ marks test tasks "OPTIONAL - only if requested";
    Principle I overrides this for this project: test tasks are mandatory and precede the
    implementation tasks they cover. /speckit-tasks must honour the constitution.

Deferred TODOs: none
-->

# obsidian-draw Constitution

## Core Principles

### I. Test-Driven Development (NON-NEGOTIABLE)

All production code is written test-first, following the Red → Green → Refactor cycle.

- A failing test MUST exist and MUST be observed failing before the code that makes it pass is
  written. No production code is added without a test that demanded it.
- Implement only the minimum needed to turn the test green, then refactor with all tests green.
- Bug fixes MUST start with a regression test that reproduces the bug.
- Logic MUST be kept out of Obsidian and DOM glue so it can be tested headless: stroke model,
  simplification, encode/decode, block parsing and locating, save-back text transforms, undo/redo
  history, eraser hit-testing and input filtering (pen vs. touch vs. hover) are pure modules.
- Obsidian APIs (`Plugin`, `Vault`, `MarkdownPostProcessorContext`, etc.) MUST be reached through
  thin adapters so tests can substitute fakes.
- Behaviour that cannot be automated (real Apple Pencil input, iOS canvas memory, Scribble,
  Live Preview widget swapping) MUST be covered by a written manual test checklist in the
  feature's spec directory and executed on the iPad before the feature is considered done.
- Task lists MUST place test tasks before the implementation tasks they cover.

Rationale: the storage format and save-back path touch the user's notes directly; bugs there
corrupt data synced across devices. Tests written first keep that logic small, isolated, and
provably correct.

### II. Inline, Merge-Friendly Storage

Drawings live inside the note's `.md` file, never in separate drawing files.

- Each drawing is one fenced code block with language `ink`, whose payload is a **single line**
  so git's line-based merge only conflicts when the same drawing is edited on two devices.
- Every block MUST carry a format version and a stable, unique id in its header
  (e.g. `v1;id=a8f3;700x260;<data>`). The exact header grammar is fixed by the first
  implementation and then versioned.
- The encoding pipeline is: Ramer–Douglas–Peucker simplification → integer rounding and
  delta encoding (pressure retained) → varint packing → compression → base64.
- Size budget: a dense block SHOULD encode to roughly 5–30 KB; encoder tests MUST assert size
  bounds on representative fixtures.
- Decoding MUST be backward compatible: every released format version stays decodable, enforced
  by golden fixture tests that are never deleted. Format changes require a version bump.
- Encode → decode MUST round-trip within the documented simplification tolerance.

Rationale: the whole point of the plugin is avoiding separate files while staying friendly to
git sync; format stability is a promise to every note already written.

### III. Never Lose User Data

Writes to the vault are atomic, targeted, and conservative.

- All saves MUST go through `app.vault.process(file, fn)` (atomic read-modify-write).
- A block MUST be located by its id inside `fn`, against the current file contents. Line numbers
  from `ctx.getSectionInfo()` or any earlier read MUST NOT be trusted for writing.
- If the target block cannot be found (deleted, duplicated id, file changed by sync), the save
  MUST NOT modify the file; it MUST surface a notice and keep the drawing recoverable
  (e.g. offer to insert it as a new block or copy it).
- A save MUST change only the target block's payload line; all other bytes of the file are
  preserved exactly. Tests MUST verify this byte-for-byte.
- Malformed or unknown-version blocks MUST render a harmless error placeholder and MUST never be
  rewritten automatically.

Rationale: the file can change underneath the editor through typing or git sync; a stale write
silently destroys the user's work on every synced device.

### IV. iPad-First, Mobile-Safe

The primary target is Obsidian on iPad with Apple Pencil; desktop is secondary.

- `manifest.json` MUST set `isDesktopOnly: false`; no Node.js or Electron APIs may be used.
- Inline previews are static SVG rendered by `registerMarkdownCodeBlockProcessor('ink', ...)`,
  never live canvases.
- Editing happens in a full-screen overlay attached to `document.body`, outside the
  contenteditable editor (avoids Live Preview widget swapping and Scribble).
- Canvases MUST be sized to `devicePixelRatio` with an upper bound, and freed on close by setting
  `width = height = 0`.
- Drawing surfaces MUST set `touch-action: none`, `-webkit-user-select: none`,
  `-webkit-touch-callout: none`, and call `preventDefault()` on `touchstart` registered with
  `{ passive: false }`.
- Only `pointerType === 'pen'` draws; fingers and palms never create strokes; Pencil hover
  events (pointermove without pressed buttons) are ignored; `getCoalescedEvents()` is used when
  detected at runtime.

Rationale: these are the known WebKit and iPadOS failure modes that broke the previous tool;
each is a hard requirement, not an optimisation.

### V. Lightweight and Simple

Prefer the smallest design and dependency set that meets the need.

- Runtime dependencies are limited to small, purpose-built libraries (`perfect-freehand` for
  stroke outlines, `fflate` or similar for compression). Heavy frameworks such as tldraw MUST NOT
  be used.
- Any new runtime dependency MUST be justified in the plan's Complexity Tracking with its bundle
  size impact.
- Features not in the current spec are not built speculatively (YAGNI). Searchable handwriting
  and OCR are explicitly out of scope.
- The code base MUST NOT derive from or copy code from the Ink plugin (CC BY-NC-ND 4.0).

Rationale: a small plugin loads fast on mobile, is easy to reason about, and keeps the bundle
and memory footprint low on the iPad.

## Technical Constraints

- Language: TypeScript in strict mode; build with esbuild following the Obsidian sample-plugin
  layout. Build outputs are `main.js`, `manifest.json` and `styles.css`.
- Unit and integration tests MUST run headless in Node on the Linux development machine without
  a running Obsidian instance (e.g. Vitest), using fakes for Obsidian and DOM-only APIs where
  needed.
- The plugin MUST work with the vault stored locally on the iPad and synced by git
  (Obsidian Git); it MUST NOT depend on iCloud or any network service.
- Rendered notes SHOULD degrade gracefully outside Obsidian (the fenced block remains a valid,
  inert code block).

## Development Workflow & Quality Gates

1. **Spec → Plan → Tasks → Implement** via the Spec Kit commands. Each plan MUST pass the
   Constitution Check against every principle above before design work and again after it.
2. **Red → Green → Refactor** for every task (Principle I). Commits SHOULD make the cycle
   visible: the failing test lands with or before its implementation, never after.
3. **Gates before a change is merged to `main`:**
   - Type check passes (`tsc --noEmit`).
   - Full test suite passes, including golden format fixtures and save-back byte-preservation
     tests.
   - Production build succeeds.
4. **On-device gate:** any change that touches input handling, the overlay, rendering, or
   saving MUST pass its manual iPad checklist (debugged via Safari Web Inspector from the Mac)
   before the feature is marked complete. `app.emulateMobile(true)` on desktop is acceptable for
   layout checks only.
5. **Format changes** (Principle II) require a new version tag in the header, a new golden
   fixture, and a passing test that all older fixtures still decode.

## Governance

- This constitution supersedes other practices and guidance in this repository. Where
  `CLAUDE.md` or other notes conflict with it, the constitution wins until amended.
- Amendments are made through `/speckit-constitution`, recorded with a Sync Impact Report at the
  top of this file, and committed with a message describing the change.
- Versioning follows semantic versioning:
  - MAJOR: a principle is removed or redefined in a backward-incompatible way.
  - MINOR: a principle or section is added or materially expanded.
  - PATCH: clarifications and wording fixes with no change in meaning.
- Compliance is reviewed at every `/speckit-plan` (Constitution Check) and `/speckit-analyze`.
  Any deviation MUST be recorded in the plan's Complexity Tracking with a justification and the
  simpler alternative that was rejected; unjustified deviations block implementation.
- `CLAUDE.md` holds runtime development guidance and project context; it MUST stay consistent
  with this document.

**Version**: 1.0.0 | **Ratified**: 2026-09-11 | **Last Amended**: 2026-09-11
