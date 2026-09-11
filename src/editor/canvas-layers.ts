import { strokeOutlinePath } from '../render/outline';
import type { Size, Stroke } from '../model/types';

const MAX_CANVAS_PIXELS = 16_777_216;
const MAX_DPR_SCALE = 2;

export function backingScale(size: Size, dpr: number): number {
	const budgetScale = Math.sqrt(MAX_CANVAS_PIXELS / (size.width * size.height));
	return Math.min(dpr, MAX_DPR_SCALE, budgetScale);
}

export function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, colour: string): void {
	const path = new Path2D(strokeOutlinePath(stroke));
	ctx.fillStyle = colour;
	ctx.fill(path);
}

function makeCanvas(doc: Document, size: Size, scale: number): HTMLCanvasElement {
	const canvas = doc.createElement('canvas');
	canvas.width = Math.round(size.width * scale);
	canvas.height = Math.round(size.height * scale);
	canvas.style.position = 'absolute';
	canvas.style.left = '0';
	canvas.style.top = '0';
	canvas.style.width = '100%';
	canvas.style.height = '100%';
	return canvas;
}

export class CanvasLayers {
	readonly static: HTMLCanvasElement;
	readonly live: HTMLCanvasElement;
	private readonly scale: number;

	constructor(doc: Document, container: HTMLElement, size: Size, dpr: number) {
		this.scale = backingScale(size, dpr);
		this.static = makeCanvas(doc, size, this.scale);
		this.live = makeCanvas(doc, size, this.scale);
		container.appendChild(this.static);
		container.appendChild(this.live);
	}

	private context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
		return canvas.getContext('2d') as CanvasRenderingContext2D;
	}

	redrawStatic(strokes: Stroke[], colour: string): void {
		const ctx = this.context(this.static);
		ctx.clearRect(0, 0, this.static.width, this.static.height);
		ctx.save();
		ctx.scale(this.scale, this.scale);
		for (const stroke of strokes) {
			drawStroke(ctx, stroke, colour);
		}
		ctx.restore();
	}

	drawLive(stroke: Stroke, colour: string): void {
		const ctx = this.context(this.live);
		ctx.clearRect(0, 0, this.live.width, this.live.height);
		ctx.save();
		ctx.scale(this.scale, this.scale);
		drawStroke(ctx, stroke, colour);
		ctx.restore();
	}

	free(): void {
		this.static.width = 0;
		this.static.height = 0;
		this.live.width = 0;
		this.live.height = 0;
		this.static.remove();
		this.live.remove();
	}
}
