import { commitStroke } from '../model/quantize';
import { formatBlockLine } from '../format/block-line';
import { hitStrokes, ERASER_RADIUS } from '../model/erase';
import { History } from '../model/history';
import { clampSize, minSize } from '../model/canvas-size';
import type { Drawing, RawPoint, Size, Stroke } from '../model/types';
import type { SaveOutcome } from './save-queue';

export type Tool = 'pen' | 'eraser';

export class EditingSession {
	drawing: Drawing;
	tool: Tool = 'pen';
	onChange: (() => void) | null = null;
	private lastSavedLine: string;
	private readonly history = new History();
	private eraseHits = new Set<number>();

	constructor(initialDrawing: Drawing) {
		this.drawing = initialDrawing;
		this.lastSavedLine = formatBlockLine(initialDrawing);
	}

	get id(): string {
		return this.drawing.id;
	}

	get dirty(): boolean {
		return this.currentLine() !== this.lastSavedLine;
	}

	currentLine(): string {
		return formatBlockLine(this.drawing);
	}

	markSaved(line: string): void {
		this.lastSavedLine = line;
	}

	setTool(tool: Tool): void {
		this.tool = tool;
	}

	addStroke(raw: RawPoint[]): void {
		const stroke = commitStroke(raw, this.drawing.width, this.drawing.height);
		this.drawing = this.history.apply(this.drawing, { kind: 'add', stroke });
		this.onChange?.();
	}

	beginErase(): void {
		this.eraseHits = new Set();
	}

	eraseAt(at: { x: number; y: number }): void {
		for (const i of hitStrokes(this.drawing.strokes, at, ERASER_RADIUS)) {
			this.eraseHits.add(i);
		}
	}

	endErase(): void {
		if (this.eraseHits.size === 0) return;
		const removed = [...this.eraseHits]
			.sort((a, b) => a - b)
			.map((index) => ({ index, stroke: this.drawing.strokes[index] as Stroke }));
		this.eraseHits = new Set();
		this.drawing = this.history.apply(this.drawing, { kind: 'erase', removed });
		this.onChange?.();
	}

	undo(): void {
		this.drawing = this.history.undo(this.drawing);
		this.onChange?.();
	}

	redo(): void {
		this.drawing = this.history.redo(this.drawing);
		this.onChange?.();
	}

	canUndo(): boolean {
		return this.history.canUndo();
	}

	canRedo(): boolean {
		return this.history.canRedo();
	}

	// Commits one completed drag: the overlay shows a live preview of the
	// dragged size itself and calls this once, on release, with the final
	// wanted size and the max bound for that drag (its min always comes from
	// the current strokes, so a resize can never cut one off).
	resize(want: Size, max: Size): void {
		const clamped = clampSize(want, minSize(this.drawing.strokes), max);
		if (clamped.width === this.drawing.width && clamped.height === this.drawing.height) return;
		const from: Size = { width: this.drawing.width, height: this.drawing.height };
		this.drawing = this.history.apply(this.drawing, { kind: 'resize', from, to: clamped });
		this.onChange?.();
	}

	// Save-state transitions (orphaned banner, "Append to note", etc.) land in
	// User Story 3 (T077/T081); until then this is an intentional no-op so
	// callers can wire the save queue's onOutcome to it now.
	handleOutcome(_outcome: SaveOutcome): void {}
}
