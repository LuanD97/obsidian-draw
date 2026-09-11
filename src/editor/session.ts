import { commitStroke } from '../model/quantize';
import { formatBlockLine } from '../format/block-line';
import type { Drawing, RawPoint } from '../model/types';

export type Tool = 'pen' | 'eraser';

export class EditingSession {
	drawing: Drawing;
	tool: Tool = 'pen';
	private lastSavedLine: string;

	constructor(initialDrawing: Drawing) {
		this.drawing = initialDrawing;
		this.lastSavedLine = formatBlockLine(initialDrawing);
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
}
