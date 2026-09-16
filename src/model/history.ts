import type { Drawing, Size, Stroke } from './types';

export type Command =
	| { kind: 'add'; stroke: Stroke }
	| { kind: 'erase'; removed: { index: number; stroke: Stroke }[] }
	| { kind: 'resize'; from: Size; to: Size };

function applyForward(d: Drawing, c: Command): Drawing {
	switch (c.kind) {
		case 'add':
			return { ...d, strokes: [...d.strokes, c.stroke] };
		case 'erase': {
			const removedIndices = new Set(c.removed.map((r) => r.index));
			return { ...d, strokes: d.strokes.filter((_, i) => !removedIndices.has(i)) };
		}
		case 'resize':
			return { ...d, width: c.to.width, height: c.to.height };
	}
}

function applyBackward(d: Drawing, c: Command): Drawing {
	switch (c.kind) {
		case 'add':
			return { ...d, strokes: d.strokes.slice(0, -1) };
		case 'erase': {
			// c.removed is in ascending index order, so re-inserting one at a
			// time at its recorded index reconstructs the original array: each
			// insertion only shifts strokes that come after it, which haven't
			// been reinserted yet.
			const strokes = [...d.strokes];
			for (const { index, stroke } of c.removed) {
				strokes.splice(index, 0, stroke);
			}
			return { ...d, strokes };
		}
		case 'resize':
			return { ...d, width: c.from.width, height: c.from.height };
	}
}

export class History {
	private undoStack: Command[] = [];
	private redoStack: Command[] = [];

	apply(d: Drawing, c: Command): Drawing {
		this.undoStack.push(c);
		this.redoStack = [];
		return applyForward(d, c);
	}

	undo(d: Drawing): Drawing {
		const c = this.undoStack.pop();
		if (!c) return d;
		this.redoStack.push(c);
		return applyBackward(d, c);
	}

	redo(d: Drawing): Drawing {
		const c = this.redoStack.pop();
		if (!c) return d;
		this.undoStack.push(c);
		return applyForward(d, c);
	}

	canUndo(): boolean {
		return this.undoStack.length > 0;
	}

	canRedo(): boolean {
		return this.redoStack.length > 0;
	}
}
