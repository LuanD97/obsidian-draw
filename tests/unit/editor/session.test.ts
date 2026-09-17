import { describe, expect, it, vi } from 'vitest';
import { EditingSession } from '../../../src/editor/session';
import { formatBlockLine, parseBlockLine } from '../../../src/format/block-line';
import type { Drawing, RawPoint } from '../../../src/model/types';

function freshDrawing(): Drawing {
	return { version: 1, id: 'aaaaaaaa', width: 700, height: 260, strokes: [] };
}

describe('EditingSession (pen part)', () => {
	it('is clean with tool "pen" when newly constructed', () => {
		const session = new EditingSession(freshDrawing());
		expect(session.dirty).toBe(false);
		expect(session.tool).toBe('pen');
	});

	it('addStroke commits the raw points via commitStroke and marks the session dirty', () => {
		const session = new EditingSession(freshDrawing());
		const raw: RawPoint[] = [
			{ x: 1.4, y: 1.6, pressure: 0.5 },
			{ x: 50, y: 50, pressure: 0.5 },
		];
		session.addStroke(raw);
		expect(session.dirty).toBe(true);
		expect(session.drawing.strokes.length).toBe(1);
		// commitStroke rounds coordinates to integers
		expect(Number.isInteger(session.drawing.strokes[0]?.points[0]?.x)).toBe(true);
	});

	it('currentLine() equals formatBlockLine(drawing)', () => {
		const session = new EditingSession(freshDrawing());
		session.addStroke([
			{ x: 0, y: 0, pressure: 0.4 },
			{ x: 20, y: 20, pressure: 0.6 },
		]);
		expect(session.currentLine()).toBe(formatBlockLine(session.drawing));
	});

	it('markSaved(line) makes the session clean when it matches currentLine()', () => {
		const session = new EditingSession(freshDrawing());
		session.addStroke([
			{ x: 0, y: 0, pressure: 0.4 },
			{ x: 20, y: 20, pressure: 0.6 },
		]);
		expect(session.dirty).toBe(true);
		session.markSaved(session.currentLine());
		expect(session.dirty).toBe(false);
	});

	it('dirty is computed as currentLine() !== lastSavedLine', () => {
		const session = new EditingSession(freshDrawing());
		session.addStroke([
			{ x: 0, y: 0, pressure: 0.4 },
			{ x: 20, y: 20, pressure: 0.6 },
		]);
		session.markSaved(session.currentLine());
		expect(session.dirty).toBe(false);

		// a further change after markSaved makes it dirty again
		session.addStroke([
			{ x: 100, y: 100, pressure: 0.4 },
			{ x: 120, y: 100, pressure: 0.6 },
		]);
		expect(session.dirty).toBe(true);
		expect(session.currentLine()).not.toBe(formatBlockLine(freshDrawing()));
	});
});

describe('EditingSession (eraser, undo/redo, onChange)', () => {
	it('setTool switches the active tool', () => {
		const session = new EditingSession(freshDrawing());
		session.setTool('eraser');
		expect(session.tool).toBe('eraser');
		session.setTool('pen');
		expect(session.tool).toBe('pen');
	});

	it('beginErase + several eraseAt + endErase records one erase command removing every hit stroke', () => {
		const session = new EditingSession(freshDrawing());
		session.addStroke([{ x: 0, y: 0, pressure: 0.5 }, { x: 10, y: 0, pressure: 0.5 }]);
		session.addStroke([{ x: 100, y: 100, pressure: 0.5 }, { x: 110, y: 100, pressure: 0.5 }]);
		session.addStroke([{ x: 200, y: 200, pressure: 0.5 }, { x: 210, y: 200, pressure: 0.5 }]);
		session.setTool('eraser');

		session.beginErase();
		session.eraseAt({ x: 5, y: 0 }); // hits stroke 0
		session.eraseAt({ x: 105, y: 100 }); // hits stroke 1
		session.eraseAt({ x: 105, y: 100 }); // same stroke again, no duplicate removal
		session.endErase();

		expect(session.drawing.strokes.length).toBe(1);
		expect(session.drawing.strokes[0]?.points[0]?.x).toBe(200);
	});

	it('endErase with no hits records nothing', () => {
		const session = new EditingSession(freshDrawing());
		session.addStroke([{ x: 0, y: 0, pressure: 0.5 }, { x: 10, y: 0, pressure: 0.5 }]);
		session.markSaved(session.currentLine());
		session.setTool('eraser');

		session.beginErase();
		session.eraseAt({ x: 2000, y: 2000 }); // misses everything
		session.endErase();

		expect(session.drawing.strokes.length).toBe(1);
		expect(session.dirty).toBe(false);

		// undo still undoes the earlier addStroke, proving no erase command
		// was recorded in between
		session.undo();
		expect(session.drawing.strokes.length).toBe(0);
	});

	it('undo/redo update the drawing', () => {
		const session = new EditingSession(freshDrawing());
		session.addStroke([{ x: 0, y: 0, pressure: 0.5 }, { x: 10, y: 0, pressure: 0.5 }]);
		expect(session.drawing.strokes.length).toBe(1);

		session.undo();
		expect(session.drawing.strokes.length).toBe(0);

		session.redo();
		expect(session.drawing.strokes.length).toBe(1);
	});

	it('undoing back to the last saved line makes the session clean again', () => {
		const session = new EditingSession(freshDrawing());
		session.markSaved(session.currentLine());
		session.addStroke([{ x: 0, y: 0, pressure: 0.5 }, { x: 10, y: 0, pressure: 0.5 }]);
		expect(session.dirty).toBe(true);

		session.undo();
		expect(session.dirty).toBe(false);
	});

	it('onChange fires after each pen-up, erase contact, undo and redo', () => {
		const session = new EditingSession(freshDrawing());
		session.addStroke([{ x: 0, y: 0, pressure: 0.5 }, { x: 10, y: 0, pressure: 0.5 }]);

		const onChange = vi.fn();
		session.onChange = onChange;

		session.addStroke([{ x: 100, y: 100, pressure: 0.5 }, { x: 110, y: 100, pressure: 0.5 }]);
		expect(onChange).toHaveBeenCalledTimes(1);

		session.setTool('eraser');
		session.beginErase();
		session.eraseAt({ x: 5, y: 0 });
		session.endErase();
		expect(onChange).toHaveBeenCalledTimes(2);

		session.undo();
		expect(onChange).toHaveBeenCalledTimes(3);

		session.redo();
		expect(onChange).toHaveBeenCalledTimes(4);
	});
});

describe('EditingSession (resize)', () => {
	it('resize clamps the requested size with minSize(strokes) and the supplied max', () => {
		const session = new EditingSession(freshDrawing());
		session.addStroke([
			{ x: 0, y: 0, pressure: 0.5 },
			{ x: 500, y: 200, pressure: 0.5 },
		]); // pushes minSize's floor up past 64x64

		session.resize({ width: 10, height: 10 }, { width: 2000, height: 2000 });
		expect(session.drawing.width).toBeGreaterThanOrEqual(500);
		expect(session.drawing.height).toBeGreaterThanOrEqual(200);

		session.resize({ width: 9999, height: 9999 }, { width: 2000, height: 2000 });
		expect(session.drawing.width).toBe(2000);
		expect(session.drawing.height).toBe(2000);
	});

	it('marks the session dirty and fires onChange once for a completed resize', () => {
		const session = new EditingSession(freshDrawing());
		session.markSaved(session.currentLine());
		const onChange = vi.fn();
		session.onChange = onChange;

		session.resize({ width: 900, height: 400 }, { width: 2000, height: 2000 });

		expect(session.dirty).toBe(true);
		expect(onChange).toHaveBeenCalledTimes(1);
		expect(session.drawing.width).toBe(900);
		expect(session.drawing.height).toBe(400);
	});

	it('does nothing (no history entry, no onChange) when the clamped size equals the current one', () => {
		const session = new EditingSession(freshDrawing());
		const onChange = vi.fn();
		session.onChange = onChange;

		session.resize({ width: 700, height: 260 }, { width: 2000, height: 2000 });

		expect(onChange).not.toHaveBeenCalled();
		expect(session.canUndo()).toBe(false);
	});

	// The overlay's live resize drag divides a pointer delta by the fit scale
	// (surface pixels -> canvas units), which is rarely exactly 1, so the
	// wanted size handed to resize() is routinely fractional. If that leaked
	// into drawing.width/height, the saved line's `WxH` header (grammar
	// `\d+x\d+`, no decimal point) would fail to parse on the very next
	// read/reopen - surfacing to the user as "Can't read this drawing".
	it('a fractional resize still round-trips through the block line format', () => {
		const session = new EditingSession(freshDrawing());
		session.resize({ width: 743.7, height: 304.2 }, { width: 2000, height: 2000 });
		expect(Number.isInteger(session.drawing.width)).toBe(true);
		expect(Number.isInteger(session.drawing.height)).toBe(true);

		// Draw beyond the old 700x260 bounds, into the newly enlarged area.
		session.addStroke([
			{ x: 720, y: 290, pressure: 0.5 },
			{ x: 740, y: 300, pressure: 0.6 },
		]);

		const line = session.currentLine();
		expect(() => parseBlockLine(line)).not.toThrow();
		expect(parseBlockLine(line).strokes).toEqual(session.drawing.strokes);
	});

	it('undo/redo restore the size through the same history as pen/eraser commands', () => {
		const session = new EditingSession(freshDrawing());
		session.resize({ width: 900, height: 400 }, { width: 2000, height: 2000 });

		session.undo();
		expect(session.drawing.width).toBe(700);
		expect(session.drawing.height).toBe(260);

		session.redo();
		expect(session.drawing.width).toBe(900);
		expect(session.drawing.height).toBe(400);
	});
});
