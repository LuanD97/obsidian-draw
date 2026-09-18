# Feature Specification: Canvas Mode — Live Strokes Over Typed Text

**Feature Branch**: `002-whole-note-canvas`

**Created**: 2026-09-18

**Status**: Planned (spec + plan complete; see [plan.md](./plan.md))

**Input**: User description: "in a separate worktree of this repo, I want to explore the feature where instead of the strokes being stored in a discrete canvas, whether I can have strokes for live editing of typed text on the margins etc. so the whole .md file is a canvas"

**Nature of this feature**: This is a **feasibility exploration** for a new, additive mode of the
plugin — it does not replace or diminish spec 001. To keep the two short and distinct:

- **Block Mode** — the existing, shipping design from spec 001
  (`specs/001-inline-handwriting-blocks/`): handwriting lives inside a discrete, bounded `ink` code
  block, inserted with the "Insert handwriting block" command.
- **Canvas Mode** — what this spec explores: a mode of operation, turned on per note with its own
  command, in which the whole `.md` file becomes the drawing surface — strokes can be drawn in the
  margins or directly over typed text rather than being confined to a block.

Block Mode and Canvas Mode are two separate, coexisting commands/modes of the same plugin, not two
competing designs for the same feature. Success here is a clear, evidence-backed go/no-go
recommendation on Canvas Mode, not necessarily a production-ready feature.

## Clarifications

### Session 2026-09-18

- Q: What is the relationship between this exploration and the existing bounded block feature (spec 001), and what should each be called for short? → A: This is an additive **Canvas Mode**, not a replacement for the existing **Block Mode** (spec 001); the two coexist as separate plugin commands/modes.
- Q: How does the user invoke each mode? → A: Two separate commands — the existing "Insert handwriting block" command (Block Mode) is unchanged; a new command turns the current note into Canvas Mode.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Annotate the margin beside a paragraph (Priority: P1)

As the user, I write a short handwritten note in the blank margin space beside a paragraph of typed
text, the way I would jot a note in the margin of a printed page — without opening a separate,
bounded drawing frame first.

**Why this priority**: This is the core value proposition being explored: annotation that lives
next to text in the page's natural layout, rather than being boxed into a Block Mode block.
If this doesn't feel natural or can't be made reliable, the rest of the exploration is moot.

**Independent Test**: Open a note with typed paragraphs, draw a short mark with Apple Pencil in the
margin beside one paragraph, close and reopen the note, and confirm the mark renders in the same
visual position relative to that paragraph.

**Acceptance Scenarios**:

1. **Given** a note with typed text and empty margin space beside a paragraph, **When** the user
   draws a stroke in that margin with Apple Pencil, **Then** the stroke is saved and, after the note
   is closed and reopened, renders in the same position relative to that paragraph.
2. **Given** a margin annotation exists beside a paragraph, **When** the user edits text elsewhere in
   the note (adding or removing lines above that paragraph), **Then** the annotation stays visually
   next to the same paragraph rather than drifting to a different one or to the wrong vertical
   position.

---

### User Story 2 - Mark up existing typed text (Priority: P2)

As the user, I draw a stroke that overlaps specific typed text — circling a word, underlining a
phrase — so I can mark up existing content the way I would with a pen on a printed page.

**Why this priority**: Extends the annotation idea from blank margin space to marking up existing
content, which is a common handwriting-over-text use case and tests whether strokes can coexist
visually with live, editable text rather than only with empty space.

**Independent Test**: Circle a specific word in a paragraph with Apple Pencil; confirm the circle
stays visually aligned with that word after the note is reopened and after unrelated edits elsewhere.

**Acceptance Scenarios**:

1. **Given** a paragraph of typed text, **When** the user draws a circle around one word, **Then**
   the circle is saved and renders around that same word after the note is reopened.
2. **Given** a circled word, **When** the user retypes or reformats surrounding sentences without
   changing the circled word itself, **Then** the circle remains around that word.

---

### User Story 3 - Connect a margin note to text with a spanning stroke (Priority: P3)

As the user, I draw an arrow or line from a note in the margin to a specific word or phrase in the
main text, spanning across the margin/text boundary in one continuous stroke.

**Why this priority**: This is the clearest capability Block Mode cannot offer at all, since a block
is a fixed rectangle. Validating it demonstrates the specific advantage this exploration is meant to
test, but it depends on Stories 1 and 2 already working.

**Independent Test**: Draw a single stroke that starts in the margin and ends pointing at a word in
the text; confirm it renders as one continuous mark spanning both regions after reopening the note.

**Acceptance Scenarios**:

1. **Given** a margin annotation and nearby typed text, **When** the user draws one continuous
   stroke connecting the two, **Then** the stroke is saved and renders as a single unbroken mark
   spanning both regions.

---

### Edge Cases

- What happens to a margin annotation anchored beside a paragraph that is later deleted entirely?
- What happens on a narrow viewport (e.g., iPad in split-screen or portrait mode) where there is
  little or no visible margin to draw in?
- What happens when text reflow causes two previously separate annotations to end up overlapping?
- What happens when the note is opened on a device or in a view that doesn't support Canvas Mode
  (e.g., another Obsidian plugin's Reading view, or a synced device without this plugin installed) —
  do annotations degrade to something inert and harmless, or do they disappear/corrupt?
- What happens when the same annotated region is edited on two devices and synced via git — is a
  conflict likely, and if so, is it visible and resolvable rather than silently dropped?
- What happens when the user draws a stroke that would need more margin space than currently exists
  (e.g., a long horizontal note beside a single short line)?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST let the user draw pen strokes anywhere in the note's rendered layout —
  including margin space beside paragraphs and directly over existing typed text — rather than only
  inside a Block Mode block.
- **FR-001a**: The system MUST expose Canvas Mode through its own dedicated command (e.g. "Turn note
  into canvas"), separate from the existing "Insert handwriting block" command that inserts a Block
  Mode block. The two commands MUST NOT interfere with each other, and a note MAY contain both a
  Block Mode block and a Canvas Mode layer at the same time.
- **FR-002**: The system MUST anchor each stroke to the specific paragraph (or other addressable
  text unit) it was drawn near, using paragraph-relative anchoring: when text is added or removed
  elsewhere in the note, an annotation stays with the paragraph it was anchored to and reflows
  vertically with it, rather than staying pinned to a fixed page coordinate.
- **FR-003**: The system MUST store stroke data inside the note's own `.md` file, never in a
  separate file, consistent with the project's inline-storage principle.
- **FR-004**: The system MUST keep typed text as plain, editable, searchable Markdown, unaffected in
  its text content by the presence of nearby annotations.
- **FR-005**: The system MUST render previously drawn annotations in their saved position whenever
  the note is (re)opened, including in a fresh Obsidian session.
- **FR-006**: Drawing input MUST be initiated only by Apple Pencil (`pointerType === 'pen'`);
  fingers, palms, and mouse/trackpad continue to scroll and select text as they do today.
- **FR-007**: Live drawing MUST happen through an overlay/canvas that is visually aligned with, and
  scrolls together with, the note's own layout (so strokes appear to sit directly on the page,
  including margins and over text), while the drawing surface itself stays outside the note's
  contenteditable editor DOM. This preserves the project's existing Scribble-avoidance and
  Live-Preview-widget-swap safeguards; true in-DOM inline editing is out of scope for this
  exploration and remains a possible later step only if this approach proves insufficient.
- **FR-008**: This exploration's persisted format only needs to work reliably for single-device use
  while the interaction model itself is being validated; git-merge-friendliness across multiple
  devices is a goal for a later, non-spike implementation and is not a pass/fail criterion here.
- **FR-009**: The system MUST let the user erase or undo a stroke drawn in Canvas Mode, consistent
  with the undo/eraser behavior already implemented for Block Mode.
- **FR-010**: A malformed, corrupted, or unrecognized Canvas Mode annotation MUST render as a
  harmless, inert placeholder and MUST NOT be silently rewritten or dropped.
- **FR-011**: The exploration MUST conclude with a documented go/no-go recommendation on whether
  Canvas Mode is viable to build as a full feature, including the specific technical risks and open
  questions encountered (see Edge Cases).

### Key Entities

- **Margin/Inline Annotation**: One or more strokes anchored to a specific text unit in the note
  (a paragraph or line), as opposed to being self-contained inside a drawing block. Carries a
  position offset relative to its anchor so it can be redrawn correctly as the anchor's on-page
  position shifts.
- **Text Anchor**: The addressable unit of typed text (e.g., a paragraph) that an annotation is
  attached to, identified stably enough that unrelated edits elsewhere in the note don't disconnect
  the annotation from it.
- **Canvas Mode Layer**: The conceptual drawing surface spanning the full rendered note — margins
  and text alike — as distinct from Block Mode's single, bounded `ink` drawing block from spec 001.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A reviewer can watch a short demo of the prototype (under 5 minutes) and judge whether
  margin annotation feels natural compared to Block Mode.
- **SC-002**: Every edge case listed above has a documented outcome by the end of the exploration —
  "handled," "acceptable limitation," or "blocks this approach" — with the reasoning recorded.
- **SC-003**: Annotations remain correctly positioned beside their anchored paragraph in 100% of
  tested reflow scenarios (text added or removed above the annotation during manual testing).
- **SC-004**: The exploration ends with a written go/no-go recommendation backed by working
  prototype code, without requiring the prototype itself to be production-ready.

## Assumptions

- This is a feasibility spike for Canvas Mode: it does not need to be production-ready, does not need
  to replace or interoperate with Block Mode's `ink` block format from spec 001, and the two remain
  separate commands/modes that coexist in the plugin.
- How Canvas Mode's on/off state for a given note is tracked on disk (e.g., a frontmatter marker vs.
  inferring it from the presence of Canvas Mode strokes) is a technical decision deferred to
  `/speckit-plan`; it does not change the user-facing scope captured here.
- The existing iPad safety constraints from the project constitution (Scribble avoidance, canvas
  memory limits, touch-action handling, pen-only input) continue to apply to whichever drawing
  surface this exploration builds.
- The exploration targets the same iPad + Apple Pencil environment as the rest of the plugin; no new
  hardware or OS assumptions are introduced.
- Reading view support is a stretch goal; the exploration may limit itself to Live Preview if
  Reading view proves out of scope for the time available, since Live Preview is the primary
  editing surface on iPad.
