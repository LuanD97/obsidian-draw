import { describe, expect, it } from 'vitest';
import { CanvasModeNoteState } from '../../../src/canvas/session';

function stroke(...points: { x: number; y: number }[]): { x: number; y: number; pressure: number }[] {
	return points.map((p) => ({ x: p.x, y: p.y, pressure: 0.5 }));
}

describe('CanvasModeNoteState add-stroke path', () => {
	it('creates a new annotation with a fresh id when the pen-down point is outside every existing annotation', () => {
		const state = new CanvasModeNoteState();
		const id = state.addStroke(stroke({ x: 10, y: 10 }, { x: 20, y: 20 }));

		expect(state.annotations.size).toBe(1);
		expect(state.annotations.has(id)).toBe(true);
		expect(state.annotations.get(id)!.strokes).toHaveLength(1);
	});

	it('appends to an existing annotation when the pen-down point lands inside its stroke bounds', () => {
		const state = new CanvasModeNoteState();
		const firstId = state.addStroke(stroke({ x: 10, y: 10 }, { x: 20, y: 20 }));
		const secondId = state.addStroke(stroke({ x: 15, y: 15 }, { x: 16, y: 16 }));

		expect(secondId).toBe(firstId);
		expect(state.annotations.size).toBe(1);
		expect(state.annotations.get(firstId)!.strokes).toHaveLength(2);
	});

	it('creates a second annotation for a pen-down point outside the first annotation bounds', () => {
		const state = new CanvasModeNoteState();
		const firstId = state.addStroke(stroke({ x: 10, y: 10 }, { x: 20, y: 20 }));
		const secondId = state.addStroke(stroke({ x: 500, y: 500 }, { x: 510, y: 510 }));

		expect(secondId).not.toBe(firstId);
		expect(state.annotations.size).toBe(2);
	});

	it('pushes one undoLedger entry per commit, naming the touched annotation id', () => {
		const state = new CanvasModeNoteState();
		const firstId = state.addStroke(stroke({ x: 10, y: 10 }, { x: 20, y: 20 }));
		const secondId = state.addStroke(stroke({ x: 15, y: 15 })); // inside the first annotation's bounds

		expect(state.undoLedger).toEqual([firstId, secondId]);
	});

	it('dirty tracks exactly the touched annotation ids', () => {
		const state = new CanvasModeNoteState();
		const firstId = state.addStroke(stroke({ x: 10, y: 10 }, { x: 20, y: 20 }));
		const secondId = state.addStroke(stroke({ x: 500, y: 500 }));

		expect(state.dirty).toEqual(new Set([firstId, secondId]));
	});

	it('generates ids via the injected generator, for deterministic tests', () => {
		let n = 0;
		const state = new CanvasModeNoteState([], { generateId: () => `fixedid${n++}` });
		const id = state.addStroke(stroke({ x: 1, y: 1 }));
		expect(id).toBe('fixedid0');
	});

	it('treats a pen-down point "over text" exactly like one in blank margin space — no separate code path (US2)', () => {
		// addStroke has no notion of "margin" vs "text": it only ever sees
		// numeric points. Two pen-downs at unrelated locations (standing in for
		// "in the margin" and "over typed text") go through the exact same
		// resolution logic and each start their own annotation, confirming
		// there is nothing region-specific to branch on (research.md R3).
		const state = new CanvasModeNoteState();
		const marginId = state.addStroke(stroke({ x: 5, y: 100 }));
		const overTextId = state.addStroke(stroke({ x: 300, y: 100 }));

		expect(marginId).not.toBe(overTextId);
		expect(state.annotations.size).toBe(2);
	});

	it('stores a stroke that starts in the margin and continues far into the text column as one unbroken stroke (US3)', () => {
		const state = new CanvasModeNoteState();
		const id = state.addStroke(stroke({ x: 5, y: 100 }, { x: 100, y: 105 }, { x: 320, y: 98 }));

		expect(state.annotations.size).toBe(1);
		const annotation = state.annotations.get(id)!;
		expect(annotation.strokes).toHaveLength(1);
		expect(annotation.strokes[0]!.points).toHaveLength(3);
	});
});
