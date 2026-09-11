import { describe, expect, it } from 'vitest';
import { strokeOutlinePath } from '../../../src/render/outline';
import type { Stroke } from '../../../src/model/types';

function pathBoundingHeight(path: string): number {
	const numbers = (path.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
	const ys = numbers.filter((_, i) => i % 2 === 1);
	return Math.max(...ys) - Math.min(...ys);
}

describe('strokeOutlinePath', () => {
	it('returns a non-empty path starting with M and ending with Z', () => {
		const stroke: Stroke = {
			points: [
				{ x: 0, y: 0, p: 128 },
				{ x: 10, y: 0, p: 128 },
				{ x: 20, y: 0, p: 128 },
			],
		};
		const path = strokeOutlinePath(stroke);
		expect(path.length).toBeGreaterThan(0);
		expect(path.startsWith('M')).toBe(true);
		expect(path.endsWith('Z')).toBe(true);
	});

	it('gives a closed dot path for a single-point stroke', () => {
		const stroke: Stroke = { points: [{ x: 5, y: 5, p: 128 }] };
		const path = strokeOutlinePath(stroke);
		expect(path.length).toBeGreaterThan(0);
		expect(path.startsWith('M')).toBe(true);
		expect(path.endsWith('Z')).toBe(true);
	});

	it('is deterministic', () => {
		const stroke: Stroke = {
			points: [
				{ x: 0, y: 0, p: 200 },
				{ x: 15, y: 3, p: 210 },
				{ x: 30, y: 0, p: 190 },
			],
		};
		expect(strokeOutlinePath(stroke)).toBe(strokeOutlinePath(stroke));
	});

	it('makes a higher-pressure stroke wider than a lower-pressure one', () => {
		const line = (p: number): Stroke => ({
			points: [
				{ x: 0, y: 50, p },
				{ x: 20, y: 50, p },
				{ x: 40, y: 50, p },
				{ x: 60, y: 50, p },
			],
		});
		const thin = pathBoundingHeight(strokeOutlinePath(line(50)));
		const thick = pathBoundingHeight(strokeOutlinePath(line(230)));
		expect(thick).toBeGreaterThan(thin);
	});
});
