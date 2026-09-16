import type { RawPoint } from './types';

// A pen-down/pen-up taper barely moves in x,y while pressure ramps sharply,
// so its perpendicular distance from the segment endpoints is near zero no
// matter how small epsilon is - a purely positional distance can never keep
// it. Significance is normalised against this fixed pressure budget (out of
// RawPoint.pressure's 0..1 range) and combined with the spatial one, so a
// point that diverges enough on either axis survives simplification.
const PRESSURE_EPSILON = 0.15;

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

// How far p's pressure is from the pressure linearly interpolated between a
// and b at p's position in the index range (t = 0 at a, 1 at b) - points
// sampled roughly evenly in time, so index position approximates where
// along the stroke p falls.
function pressureDeviation(p: RawPoint, a: RawPoint, b: RawPoint, t: number): number {
	const interpolated = a.pressure + (b.pressure - a.pressure) * t;
	return Math.abs(p.pressure - interpolated);
}

function significance(p: RawPoint, a: RawPoint, b: RawPoint, t: number, epsilon: number): number {
	const spatial = perpendicularDistance(p, a, b) / epsilon;
	const pressure = pressureDeviation(p, a, b, t) / PRESSURE_EPSILON;
	return Math.max(spatial, pressure);
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
		const span = end - start;

		let maxSignificance = -1;
		let maxIndex = -1;
		for (let i = start + 1; i < end; i++) {
			const s = significance(points[i] as RawPoint, a, b, (i - start) / span, epsilon);
			if (s > maxSignificance) {
				maxSignificance = s;
				maxIndex = i;
			}
		}

		if (maxSignificance > 1) {
			keep.add(maxIndex);
			stack.push([start, maxIndex]);
			stack.push([maxIndex, end]);
		}
	}

	return points.filter((_, i) => keep.has(i));
}
