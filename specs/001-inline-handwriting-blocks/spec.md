# Feature Specification: Inline Handwriting Blocks

**Feature Branch**: `001-inline-handwriting-blocks`

**Created**: 2026-09-11

**Status**: Draft

**Input**: User description: "Full v1 slice of the obsidian-draw plugin (see CLAUDE.md): insert a
handwriting block into a note, see a static inline preview, tap it to edit in a full-screen overlay
(pen, whole-stroke eraser by default, undo/redo, Done), and save back into the note's inline `ink`
code block. Eraser: whole-stroke by default; the user would like Apple Pencil double-tap to switch
to erase mode if possible. Canvas: defaults to the full width of the document, and the canvas is
resizable by the user. Pen: one pressure-sensitive pen whose colour adapts to light/dark theme;
fingers never draw."

## Clarifications

### Session 2026-09-11

- Q: Which fallback should toggle pen/eraser when Pencil double-tap is not available to the
  plugin? → A: Toolbar button only; no extra gesture.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Write a new handwriting block in a note (Priority: P1)

While typing a note on the iPad, the user wants to jot something by hand. They run "Insert
handwriting block" (from the command palette or the mobile toolbar). A full-screen drawing surface
opens immediately. They write with the Apple Pencil, tap Done, and are back in the note, where the
handwriting now appears inline between the surrounding text. The drawing is stored inside the note
itself, so there is no separate drawing file.

**Why this priority**: This is the core value of the plugin. Without it nothing else matters, and on
its own it already replaces the user's current workflow of separate drawing files plus embeds.

**Independent Test**: In an empty note, run the insert command, write a word with the Pencil, tap
Done. The word is visible inline in the note, and the note's own file contains exactly one new
handwriting block and no new files exist in the vault.

**Acceptance Scenarios**:

1. **Given** a note open in the editor with the cursor on a line, **When** the user runs "Insert
   handwriting block", **Then** an empty block is inserted at the cursor position and the
   full-screen editor opens with an empty canvas as wide as the note's text column.
2. **Given** the editor is open, **When** the user draws with the Pencil, **Then** ink follows the
   Pencil tip, with line thickness varying with pressure.
3. **Given** the user has drawn strokes, **When** they tap Done, **Then** the editor closes, the note
   shows a static preview of the drawing in place of the block, and the note file contains the
   drawing data.
4. **Given** the editor is open, **When** the user touches the canvas with a finger or rests their
   palm on it, **Then** no ink is drawn.
5. **Given** the app uses a dark theme, **When** the drawing is shown in the editor or the preview,
   **Then** strokes appear light on dark; in a light theme they appear dark on light. The same
   stored drawing works in both.

---

### User Story 2 - Edit an existing drawing (Priority: P2)

The user comes back to a note and wants to add to or correct a drawing. They tap the inline preview,
the editor opens with the existing strokes, and they add strokes, erase strokes they don't want, and
use undo/redo to step back and forth. Tapping Done updates the drawing in the note.

**Why this priority**: Handwriting is rarely right the first time. Without editing, a mistake means
deleting the block and starting over.

**Independent Test**: Open a note that already contains a drawing, tap it, erase one stroke, add one
stroke, undo the new stroke, redo it, tap Done. The preview and the stored drawing reflect exactly
those changes.

**Acceptance Scenarios**:

1. **Given** a note containing a drawing, shown in either the live editing view or the reading
   view, **When** the user taps the preview, **Then** the full-screen editor opens showing the
   existing strokes.
2. **Given** the eraser is active, **When** the user touches any part of a stroke with the Pencil,
   **Then** that whole stroke is removed.
3. **Given** the user has made changes, **When** they tap Undo repeatedly, **Then** each change
   (stroke added, stroke erased, canvas resized) is reverted in reverse order, and Redo re-applies
   them.
4. **Given** the user has lifted the Pencil after a change, **When** about half a second passes
   without further input, **Then** the change is saved to the note even if the user never taps Done.
5. **Given** the editor is open, **When** the user taps Done, presses Escape on a keyboard, or leaves
   the app (switches apps or locks the iPad), **Then** all changes are saved; leaving the app keeps
   the editor open.

---

### User Story 3 - Safe saving while the note changes underneath (Priority: P3)

The user's vault is synced between devices with git. A note may change while a drawing is open: the
user may have typed elsewhere in the same note on another device and pulled, or other blocks may
have moved. Saving a drawing must update exactly that drawing and nothing else, and must never
silently lose either the drawing or the other content.

**Why this priority**: Losing handwriting or typed text is the worst possible failure. It is lower
than P1/P2 only because it has no value without them; it is required before real use.

**Independent Test**: Open a drawing for editing, change the note file externally (add lines above
the block, edit text below it), then draw and tap Done. The drawing is updated, the external changes
are intact, and every byte outside the drawing's data line is unchanged.

**Acceptance Scenarios**:

1. **Given** a drawing is open in the editor and text is added above it in the note, **When** the
   drawing is saved, **Then** the correct block is updated and the added text is untouched.
2. **Given** a note with several drawings, **When** one of them is saved, **Then** only that
   drawing's data changes.
3. **Given** a drawing is open and its block is deleted from the note (by the user or by a sync),
   **When** a save happens, **Then** the note is not modified, the user is told the block could not
   be found, and the drawing is kept so the user can re-insert it as a new block.
4. **Given** the same note had different parts edited on two devices (neither edit touched the same
   drawing), **When** the changes are merged by git, **Then** the merge completes without conflict.
5. **Given** a block whose content is damaged or from an unknown newer format, **When** the note is
   displayed, **Then** a clear placeholder is shown instead of a preview, and the block is never
   rewritten automatically.

---

### User Story 4 - Resize the canvas (Priority: P4)

The default canvas is as wide as the note and a short strip tall. Sometimes the user needs more room
(a diagram) or less (a small signature-sized scribble). In the editor they can resize the canvas;
the new size is kept with the drawing and the inline preview takes up the matching space.

**Why this priority**: The default covers most short handwriting; resizing is important but not
blocking for first use.

**Independent Test**: Open the editor, make the canvas taller and narrower, tap Done. The inline
preview occupies the new proportions, and reopening the editor shows the same size.

**Acceptance Scenarios**:

1. **Given** a new block, **When** the editor opens, **Then** the canvas is as wide as the note's
   text column on that device and a default height (a few lines of handwriting).
2. **Given** the editor is open, **When** the user drags the canvas resize control, **Then** the
   canvas width and/or height changes and existing strokes keep their size and position.
3. **Given** there are strokes near the edge, **When** the user tries to shrink the canvas past them,
   **Then** the canvas stops at the smallest size that still contains all strokes.
4. **Given** a drawing wider than the note's current text column (e.g. created in landscape, viewed
   in portrait), **When** the preview is shown, **Then** it scales down proportionally to fit the
   column; a drawing narrower than the column is shown at its own size.

---

### User Story 5 - Switch tools from the toolbar (Priority: P5)

The user switches between pen and eraser with one tap on the toolbar, using either the Pencil or a
finger, and can always see which tool is active. Apple Pencil double-tap would be the natural
shortcut, but it is not available to plugins (research R1), so it is not part of v1.

**Why this priority**: A convenience on top of the toolbar eraser button, which already delivers the
function.

**Independent Test**: In the editor with the pen active, tap Eraser with the Pencil; the eraser
becomes active and the toolbar shows it. Tap Pen with a finger; the pen is active again.

**Acceptance Scenarios**:

1. **Given** the pen is active, **When** the user taps the Eraser button (Pencil or finger), **Then**
   the eraser becomes active and the toolbar indicates it.
2. **Given** the eraser is active, **When** the user taps the Pen button, **Then** the pen becomes
   active.
3. **Given** Pencil double-tap cannot be detected on the user's device, **When** the user wants to
   switch tools, **Then** they tap the pen or eraser button in the toolbar (with a finger or the
   Pencil); no other gesture is added.

---

### Edge Cases

- **Empty drawing**: tapping Done without drawing keeps the (empty) block in the note, shown as a
  small "tap to draw" placeholder, so the user can come back to it or delete it as ordinary text.
- **Copied block**: the user copies a block and pastes it elsewhere, so two blocks share an
  identity. Saving must not guess which to update; the user is warned and the drawing is kept.
- **Note renamed or deleted while editing**: a rename or move (e.g. arriving through sync) does not
  interrupt saving. If the note is deleted, the user is told and can copy the drawing to paste
  elsewhere.
- **Many blocks**: a note with many drawings (e.g. 20) opens and scrolls without noticeable delay.
- **Rotation / split view**: the device is rotated or Obsidian is resized while the editor is open;
  the editor stays usable and the drawing is not distorted or lost.
- **App backgrounded**: the user switches apps mid-edit; changes made before leaving are already
  saved.
- **Pencil hover**: moving the Pencil above the screen without touching it never draws.
- **Theme change**: switching light/dark while a note is open re-colours previews without editing
  the note.
- **Very dense drawing**: a canvas filled with small handwriting stays within the size budget and
  still opens and saves smoothly.
- **Note viewed outside Obsidian** (e.g. on a git hosting site): the block shows as an inert code
  block and the rest of the note reads normally.
- **Desktop**: previews display on desktop; drawing input there is limited (see Assumptions).

## Requirements *(mandatory)*

### Functional Requirements

**Creating blocks**

- **FR-001**: Users MUST be able to insert a new, empty handwriting block at the cursor with a
  command named "Insert handwriting block", available from the command palette and addable to the
  mobile toolbar.
- **FR-002**: Inserting a block MUST immediately open the editor for that block.
- **FR-003**: Each block MUST be stored inside the note file as a single fenced block whose drawing
  data occupies exactly one line, with no separate file created.
- **FR-004**: Each block MUST carry a format version and an identity that is unique within the note
  and stays the same across saves.

**Viewing**

- **FR-005**: The system MUST show each block as a static, non-editable picture of the drawing in
  both the live editing view and the reading view.
- **FR-006**: Previews MUST scale down proportionally to fit the text column when the drawing is
  wider than it, and MUST otherwise show at the drawing's own size.
- **FR-007**: Strokes MUST render in a colour that contrasts with the current theme (dark on light,
  light on dark) without any change to the stored drawing.
- **FR-008**: Blocks that are damaged or use an unsupported format version MUST show a readable
  placeholder message instead of a preview and MUST NOT be modified automatically.

**Editing**

- **FR-009**: Tapping a preview MUST open the editor for that block, full-screen and separate from
  the note's text editing area, so that note text editing, cursor movement and handwriting-to-text
  conversion cannot interfere with drawing.
- **FR-010**: The editor MUST provide: pen, eraser, undo, redo, canvas resize, and Done.
- **FR-011**: Only Pencil (stylus) contact MUST produce ink or erase; finger and palm contact MUST
  never create or erase strokes. Pencil hover MUST never draw.
- **FR-012**: The pen MUST vary line thickness with Pencil pressure, in a single colour that adapts
  to the theme (FR-007).
- **FR-013**: The eraser MUST remove a whole stroke when the Pencil touches any part of it.
- **FR-014**: Undo/redo MUST cover every change made during the current editing session (stroke
  added, stroke erased, canvas resized). History does not need to survive closing the editor.
- **FR-015**: The active tool MUST always be visible in the toolbar. Apple Pencil double-tap and
  squeeze are not available to plugins (research R1), so v1 offers no Pencil gesture for switching
  tools.
- **FR-016**: Where Pencil double-tap is not available, the toolbar pen and eraser buttons MUST be
  the only way to switch tools; no fallback gesture is added. The buttons MUST respond to both
  finger and Pencil taps.

**Canvas size**

- **FR-017**: A new block's canvas MUST default to the full width of the note's text column on the
  device where it is created, with a default height of roughly three lines of handwriting.
- **FR-018**: Users MUST be able to resize the canvas width and height in the editor; resizing MUST
  NOT move, scale or delete existing strokes.
- **FR-019**: The canvas MUST NOT shrink smaller than the area needed to contain all existing
  strokes.
- **FR-020**: The chosen size MUST be stored with the drawing and used by both the editor and the
  preview.

**Saving and data safety**

- **FR-021**: Changes MUST be saved when the editor is closed (Done, Escape, or the plugin being
  disabled or updated), immediately when the user leaves the app, and automatically about half a
  second after the Pencil is lifted.
- **FR-022**: A save MUST find its block by identity in the note's current contents at the moment of
  saving, never by a remembered position.
- **FR-023**: A save MUST change only the target block's data line; every other character of the
  note MUST be preserved exactly.
- **FR-024**: A save MUST be applied as a single atomic update to the note, so concurrent edits to
  the note are never overwritten.
- **FR-025**: If the target block cannot be found, or its identity appears more than once, the save
  MUST NOT modify the note; the user MUST be notified and offered a way to keep the drawing (append
  it to the note as a new block).
- **FR-026**: A dense, full-width block of handwriting MUST add at most 30 KB (30,720 bytes) to the
  note (measured by SC-004).
- **FR-027**: Reopening and saving a drawing without changes MUST NOT alter the note.
- **FR-028**: Drawings saved by any released version of the plugin MUST remain viewable and
  editable by later versions.

**Platform**

- **FR-029**: The plugin MUST work on Obsidian for iPad and MUST NOT require desktop-only
  capabilities, network access or cloud storage.
- **FR-030**: The editor MUST remain visible and usable for the whole editing session, including
  after device rotation and after repeatedly opening and closing it.

### Key Entities

- **Handwriting block**: one drawing embedded in a note. Has an identity, a format version, a canvas
  size (width × height), and a list of strokes. Lives entirely inside the note's text.
- **Stroke**: one continuous Pencil contact from touch-down to lift. An ordered series of points,
  each with a position and pressure. The unit of erasing and undo.
- **Canvas**: the drawable area of a block, defined by its width and height. Defaults to the note's
  column width; user-resizable.
- **Editing session**: the period between opening the editor for a block and closing it. Owns the
  undo/redo history and the currently active tool (pen or eraser).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From running the insert command, the user can start writing within 1 second.
- **SC-002**: Ink follows the Pencil tip without visible lag: during 10 seconds of continuous
  handwriting on the user's iPad, handling each Pencil movement takes at most 4 ms in 95% of cases
  and no frames are dropped, as measured with the device's web inspector timeline.
- **SC-003**: In a scripted test of at least 20 cases where the note changes while a drawing is open
  (text added above/below, other blocks edited, block deleted, block duplicated), no typed text is
  ever lost and no drawing is ever lost or written to the wrong block.
- **SC-004**: A canvas filled edge to edge with ordinary handwriting adds at most 30 KB to the note.
- **SC-005**: When two devices edit different parts of the same note (not the same drawing), 100% of
  git merges complete without conflict.
- **SC-006**: Opening and closing the editor 50 times in a row, and 30 minutes of continuous
  writing, produce no blank, vanished or frozen editor.
- **SC-007**: Writing a full page of notes with a palm resting on the screen produces zero
  unintended strokes.
- **SC-008**: A note containing 20 drawings displays all previews within 1 second of opening.
- **SC-009**: The user can complete the full loop (insert, write, Done, reopen, erase a stroke,
  Done) on the iPad on the first attempt without instructions, checked by running quickstart manual items
  1, 5, 7 and 8 in one sitting.

## Assumptions

- The primary environment is Obsidian on iPad with Apple Pencil; the vault is stored on the device
  and synced with git. Desktop is secondary.
- On desktop, previews display normally; drawing with a mouse is not a v1 goal (only stylus input
  draws, per the project constitution). Desktop may be used for layout checks.
- Apple Pencil double-tap may not be available to plugins inside Obsidian on iPad; the toolbar
  eraser button is always the guaranteed way to switch tools, and the double-tap toggle is provided
  only where it can be detected.
- There is one pen colour (theme-adaptive) and one pressure-sensitive width in v1; colour and width
  choices are out of scope.
- The editor has no "Cancel / discard changes" action; undo is the way to back out of changes.
- Canvas resizing is done in the editor only, not by dragging the preview inside the note.
- "Width of the document" means the width of the note's readable text column on the device where
  the block is created; the stored size is fixed from then on and previews scale down only when the
  column is narrower.
- Out of scope for this feature: handwriting search/OCR, drawing directly inside the note without
  the full-screen editor, exporting drawings to image files, migrating drawings from the Ink plugin,
  multiple pen colours/widths, partial (pixel) erasing, selection/move/lasso tools, zoom and pan.
