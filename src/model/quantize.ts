import type { Point, RawPoint, Stroke } from './types';

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

// Points are kept as captured (only rounded, clamped and deduplicated), not
// geometrically simplified: RDP always collapses a pen-down/pen-up taper
// (position barely moves while pressure ramps) to 1-2 points regardless of
// epsilon, discarding most of the pressure signal and producing blank/gappy
// patches on re-render. A dense block still comfortably fits the 30KB
// budget without it (tests/integration/roundtrip-size.test.ts).
export function commitStroke(raw: RawPoint[], width: number, height: number): Stroke {
	const points: Point[] = [];
	for (const pt of raw) {
		const x = clamp(Math.round(pt.x), 0, width);
		const y = clamp(Math.round(pt.y), 0, height);
		const p = clamp(Math.round(pt.pressure * 255), 0, 255);
		const prev = points[points.length - 1];
		// Only an exact (x, y, pressure) duplicate is redundant; a point that
		// differs in pressure alone still carries information (e.g. two
		// samples of a taper landing on the same pixel).
		if (prev && prev.x === x && prev.y === y && prev.p === p) continue;
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
