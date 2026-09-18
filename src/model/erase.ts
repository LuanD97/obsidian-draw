import type { Point, Stroke } from './types';

export const ERASER_RADIUS = 8;

// Matches the perfect-freehand base size (STROKE_OPTIONS.size = 3) used for
// rendering, so the hit area roughly tracks what's visibly drawn.
const STROKE_HALF_WIDTH = 1.5;

// Exposed as an object (rather than a plain function export) so tests can spy
// on it to prove the bounding-box check below actually skips segment work for
// far-away strokes, without changing hitStrokes's public signature.
export const internal = {
	pointToSegmentDistance(
		px: number,
		py: number,
		ax: number,
		ay: number,
		bx: number,
		by: number,
	): number {
		const dx = bx - ax;
		const dy = by - ay;
		const lengthSq = dx * dx + dy * dy;
		if (lengthSq === 0) return Math.hypot(px - ax, py - ay);
		const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
		return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
	},
};

export interface BoundingBox {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
}

export function boundingBox(stroke: Stroke): BoundingBox {
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const p of stroke.points) {
		if (p.x < minX) minX = p.x;
		if (p.y < minY) minY = p.y;
		if (p.x > maxX) maxX = p.x;
		if (p.y > maxY) maxY = p.y;
	}
	return { minX, minY, maxX, maxY };
}

function strokeHit(stroke: Stroke, at: { x: number; y: number }, threshold: number): boolean {
	const box = boundingBox(stroke);
	if (
		at.x < box.minX - threshold ||
		at.x > box.maxX + threshold ||
		at.y < box.minY - threshold ||
		at.y > box.maxY + threshold
	) {
		return false;
	}

	const points = stroke.points;
	if (points.length === 1) {
		const p = points[0] as Point;
		return Math.hypot(at.x - p.x, at.y - p.y) <= threshold;
	}

	for (let i = 0; i < points.length - 1; i++) {
		const a = points[i] as Point;
		const b = points[i + 1] as Point;
		const distance = internal.pointToSegmentDistance(at.x, at.y, a.x, a.y, b.x, b.y);
		if (distance <= threshold) return true;
	}
	return false;
}

export function hitStrokes(strokes: Stroke[], at: { x: number; y: number }, radius: number): number[] {
	const threshold = radius + STROKE_HALF_WIDTH;
	const hits: number[] = [];
	for (let i = 0; i < strokes.length; i++) {
		if (strokeHit(strokes[i] as Stroke, at, threshold)) hits.push(i);
	}
	return hits;
}
