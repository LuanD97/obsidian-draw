import { simplify } from './simplify';
import type { Point, RawPoint, Stroke } from './types';

const RDP_EPSILON = 0.5;

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

export function commitStroke(raw: RawPoint[], width: number, height: number): Stroke {
	const simplified = simplify(raw, RDP_EPSILON);

	const points: Point[] = [];
	for (const pt of simplified) {
		const x = clamp(Math.round(pt.x), 0, width);
		const y = clamp(Math.round(pt.y), 0, height);
		const p = clamp(Math.round(pt.pressure * 255), 0, 255);
		const prev = points[points.length - 1];
		if (prev && prev.x === x && prev.y === y) continue;
		points.push({ x, y, p });
	}

	if (points.length === 0) {
		const first = raw[0] as RawPoint;
		points.push({
			x: clamp(Math.round(first.x), 0, width),
			y: clamp(Math.round(first.y), 0, height),
			p: clamp(Math.round(first.pressure * 255), 0, 255),
		});
	}

	return { points };
}
