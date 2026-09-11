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
});
