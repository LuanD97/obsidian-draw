import { describe, expect, it } from 'vitest';
import { commitStroke } from '../../src/model/quantize';
import { formatBlockLine, parseBlockLine } from '../../src/format/block-line';
import { generateHandwriting } from '../fixtures/handwriting';
import { generateId } from '../../src/format/id';
import type { Drawing, RawPoint } from '../../src/model/types';

const SIZE_BUDGET_BYTES = 30 * 1024; // SC-004: dense block <= 30KB (30,720 bytes)
const MAX_POINT_DEVIATION = 1.0;

function pointToSegmentDistance(
	p: { x: number; y: number },
	a: { x: number; y: number },
	b: { x: number; y: number },
): number {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const lengthSquared = dx * dx + dy * dy;
	if (lengthSquared === 0) return Math.hypot(p.x - a.x, p.y - a.y);
	let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared;
	t = Math.max(0, Math.min(1, t));
	const projX = a.x + t * dx;
	const projY = a.y + t * dy;
	return Math.hypot(p.x - projX, p.y - projY);
}

function distanceToPolyline(p: { x: number; y: number }, polyline: RawPoint[]): number {
	if (polyline.length === 1) {
		return Math.hypot(p.x - (polyline[0] as RawPoint).x, p.y - (polyline[0] as RawPoint).y);
	}
	let min = Infinity;
	for (let i = 0; i < polyline.length - 1; i++) {
		min = Math.min(min, pointToSegmentDistance(p, polyline[i] as RawPoint, polyline[i + 1] as RawPoint));
	}
	return min;
}

function buildDrawing(width: number, height: number): { drawing: Drawing; rawStrokes: RawPoint[][] } {
	const rawStrokes = generateHandwriting(42, width, height, { rows: 6, glyphsPerRow: 14 });
	const strokes = rawStrokes.map((raw) => commitStroke(raw, width, height));
	const drawing: Drawing = { version: 1, id: generateId(), width, height, strokes };
	return { drawing, rawStrokes };
}

describe.each([
	{ label: '700x260', width: 700, height: 260 },
	{ label: '1000x700', width: 1000, height: 700 },
])('dense handwriting round-trip and size budget ($label)', ({ width, height }) => {
	it('encodes within the 30KB size budget and round-trips exactly', () => {
		const { drawing } = buildDrawing(width, height);
		const line = formatBlockLine(drawing);

		expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(SIZE_BUDGET_BYTES);

		const decoded = parseBlockLine(line);
		expect(decoded).toEqual(drawing);
	});

	it('keeps every committed point within 1.0 unit of the raw polyline', () => {
		const { drawing, rawStrokes } = buildDrawing(width, height);
		drawing.strokes.forEach((stroke, i) => {
			const raw = rawStrokes[i] as RawPoint[];
			for (const point of stroke.points) {
				expect(distanceToPolyline(point, raw)).toBeLessThanOrEqual(MAX_POINT_DEVIATION);
			}
		});
	});
});
