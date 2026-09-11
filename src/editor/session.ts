import { commitStroke } from '../model/quantize';
import { formatBlockLine } from '../format/block-line';
import type { Drawing, RawPoint } from '../model/types';
import type { SaveOutcome } from './save-queue';

export type Tool = 'pen' | 'eraser';

export class EditingSession {
	drawing: Drawing;
	tool: Tool = 'pen';
	private lastSavedLine: string;

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

	addStroke(raw: RawPoint[]): void {
		const stroke = commitStroke(raw, this.drawing.width, this.drawing.height);
		this.drawing = { ...this.drawing, strokes: [...this.drawing.strokes, stroke] };
	}

	// Save-state transitions (orphaned banner, "Append to note", etc.) land in
	// User Story 3 (T077/T081); until then this is an intentional no-op so
	// callers can wire the save queue's onOutcome to it now.
	handleOutcome(_outcome: SaveOutcome): void {}
}
