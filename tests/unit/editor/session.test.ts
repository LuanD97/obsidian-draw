import { describe, expect, it } from 'vitest';
import { EditingSession } from '../../../src/editor/session';
import { formatBlockLine } from '../../../src/format/block-line';
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
