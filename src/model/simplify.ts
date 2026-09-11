import type { RawPoint } from './types';

function perpendicularDistance(p: RawPoint, a: RawPoint, b: RawPoint): number {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const lengthSquared = dx * dx + dy * dy;
	if (lengthSquared === 0) {
		return Math.hypot(p.x - a.x, p.y - a.y);
	}
	// area of the triangle a,b,p (via cross product) / base length = height
	const cross = Math.abs(dy * (p.x - a.x) - dx * (p.y - a.y));
	return cross / Math.sqrt(lengthSquared);
}

export function simplify(points: RawPoint[], epsilon: number): RawPoint[] {
	if (points.length <= 2) return points;

	// Iterative RDP using an explicit stack of [start, end] index ranges to
	// simplify, avoiding recursion depth issues on long strokes.
	const keep = new Set<number>([0, points.length - 1]);
	const stack: [number, number][] = [[0, points.length - 1]];

	while (stack.length > 0) {
		const [start, end] = stack.pop() as [number, number];
		if (end - start < 2) continue;

		const a = points[start] as RawPoint;
		const b = points[end] as RawPoint;

		let maxDist = -1;
		let maxIndex = -1;
		for (let i = start + 1; i < end; i++) {
			const dist = perpendicularDistance(points[i] as RawPoint, a, b);
			if (dist > maxDist) {
				maxDist = dist;
				maxIndex = i;
			}
		}

		if (maxDist > epsilon) {
			keep.add(maxIndex);
			stack.push([start, maxIndex]);
			stack.push([maxIndex, end]);
		}
	}

	return points.filter((_, i) => keep.has(i));
}
