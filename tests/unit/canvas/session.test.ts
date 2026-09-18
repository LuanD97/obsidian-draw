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
});
