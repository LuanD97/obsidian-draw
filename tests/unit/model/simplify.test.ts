import { describe, expect, it } from 'vitest';
import { simplify } from '../../../src/model/simplify';
import type { RawPoint } from '../../../src/model/types';

function pt(x: number, y: number, pressure = 0.5): RawPoint {
	return { x, y, pressure };
}

describe('simplify (Ramer-Douglas-Peucker)', () => {
	it('collapses collinear points to their endpoints', () => {
		const points = [pt(0, 0), pt(5, 0), pt(10, 0)];
		const result = simplify(points, 0.5);
		expect(result).toEqual([pt(0, 0), pt(10, 0)]);
	});

	it('keeps a right-angle corner', () => {
		const points = [pt(0, 0), pt(10, 0), pt(10, 10)];
		const result = simplify(points, 0.5);
		expect(result).toEqual([pt(0, 0), pt(10, 0), pt(10, 10)]);
	});

	it('drops a point with deviation <= epsilon', () => {
		// midpoint deviates 0.4 units from the straight line 0,0 -> 10,0
		const points = [pt(0, 0), pt(5, 0.4), pt(10, 0)];
		const result = simplify(points, 0.5);
		expect(result).toEqual([pt(0, 0), pt(10, 0)]);
	});

	it('keeps a point with deviation > epsilon', () => {
		const points = [pt(0, 0), pt(5, 0.6), pt(10, 0)];
		const result = simplify(points, 0.5);
		expect(result).toEqual([pt(0, 0), pt(5, 0.6), pt(10, 0)]);
	});

	it('keeps the pressure of kept points', () => {
		const points = [pt(0, 0, 0.2), pt(10, 0, 0.9)];
		const result = simplify(points, 0.5);
		expect(result[0]?.pressure).toBe(0.2);
		expect(result[1]?.pressure).toBe(0.9);
	});

	it('returns a single point unchanged', () => {
		const points = [pt(3, 4, 0.7)];
		expect(simplify(points, 0.5)).toEqual(points);
	});

	it('returns two points unchanged', () => {
		const points = [pt(0, 0), pt(10, 10)];
		expect(simplify(points, 0.5)).toEqual(points);
	});

	// Regression: a stroke's pen-down/pen-up taper barely moves in x,y while
	// pressure ramps sharply, so a purely positional RDP always collapses it
	// (near-zero spatial deviation, however small epsilon is), discarding
	// the pressure ramp that made it a taper. On re-render this showed up as
	// blank/gappy patches at stroke ends instead of a smooth fade.
	it('keeps a point whose pressure diverges from the endpoints even when nearly collinear', () => {
		const points = [
			pt(0, 0, 0.05),
			pt(2, 0, 0.05),
			pt(4, 0, 0.05),
			pt(5, 0, 0.9),
			pt(6, 0, 0.05),
			pt(8, 0, 0.05),
			pt(10, 0, 0.05),
		];
		const result = simplify(points, 0.5);
		expect(result.some((p) => p.pressure === 0.9)).toBe(true);
	});

	it('still collapses collinear points when pressure also varies linearly between the endpoints', () => {
		const points = [pt(0, 0, 0.1), pt(5, 0, 0.5), pt(10, 0, 0.9)];
		const result = simplify(points, 0.5);
		expect(result).toEqual([pt(0, 0, 0.1), pt(10, 0, 0.9)]);
	});
});
