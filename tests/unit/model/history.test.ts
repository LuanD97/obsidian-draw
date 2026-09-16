import { describe, expect, it } from 'vitest';
import { History } from '../../../src/model/history';
import type { Drawing, Stroke } from '../../../src/model/types';

function freshDrawing(strokes: Stroke[] = []): Drawing {
	return { version: 1, id: 'aaaaaaaa', width: 700, height: 260, strokes };
}

function stroke(x: number): Stroke {
	return { points: [{ x, y: 0, p: 100 }] };
}

describe('History', () => {
	describe('add command', () => {
		it('undo removes the last-added stroke, redo re-appends it', () => {
			const history = new History();
			let drawing = freshDrawing();
			drawing = history.apply(drawing, { kind: 'add', stroke: stroke(1) });
			expect(drawing.strokes).toHaveLength(1);

			drawing = history.undo(drawing);
			expect(drawing.strokes).toHaveLength(0);

			drawing = history.redo(drawing);
			expect(drawing.strokes).toHaveLength(1);
			expect(drawing.strokes[0]).toEqual(stroke(1));
		});
	});

	describe('erase command', () => {
		it('undo re-inserts every removed stroke at its original index, redo removes them again', () => {
			const history = new History();
			let drawing = freshDrawing([stroke(0), stroke(1), stroke(2), stroke(3), stroke(4)]);

			drawing = history.apply(drawing, {
				kind: 'erase',
				removed: [
					{ index: 1, stroke: stroke(1) },
					{ index: 3, stroke: stroke(3) },
				],
			});
			expect(drawing.strokes.map((s) => s.points[0]?.x)).toEqual([0, 2, 4]);

			drawing = history.undo(drawing);
			expect(drawing.strokes.map((s) => s.points[0]?.x)).toEqual([0, 1, 2, 3, 4]);

			drawing = history.redo(drawing);
			expect(drawing.strokes.map((s) => s.points[0]?.x)).toEqual([0, 2, 4]);
		});
	});

	it('a new command clears redo', () => {
		const history = new History();
		let drawing = freshDrawing();
		drawing = history.apply(drawing, { kind: 'add', stroke: stroke(1) });
		drawing = history.undo(drawing);
		expect(history.canRedo()).toBe(true);

		drawing = history.apply(drawing, { kind: 'add', stroke: stroke(2) });
		expect(history.canRedo()).toBe(false);
		expect(drawing.strokes).toHaveLength(1);
	});

	it('canUndo/canRedo flags track the stacks', () => {
		const history = new History();
		let drawing = freshDrawing();
		expect(history.canUndo()).toBe(false);
		expect(history.canRedo()).toBe(false);

		drawing = history.apply(drawing, { kind: 'add', stroke: stroke(1) });
		expect(history.canUndo()).toBe(true);
		expect(history.canRedo()).toBe(false);

		drawing = history.undo(drawing);
		expect(history.canUndo()).toBe(false);
		expect(history.canRedo()).toBe(true);
	});

	it('undo on empty history is a no-op', () => {
		const history = new History();
		const drawing = freshDrawing([stroke(1)]);
		const result = history.undo(drawing);
		expect(result).toEqual(drawing);
		expect(history.canUndo()).toBe(false);
	});
});
