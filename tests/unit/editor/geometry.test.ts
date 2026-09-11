import { describe, expect, it } from 'vitest';
import { toCanvasPoint } from '../../../src/editor/geometry';

describe('toCanvasPoint', () => {
	it('maps client coordinates through the surface rect at scale 1', () => {
		const result = toCanvasPoint({ x: 120, y: 80 }, { left: 20, top: 10 }, 1);
		expect(result).toEqual({ x: 100, y: 70 });
	});

	it('maps client coordinates through the surface rect at scale 0.5', () => {
		const result = toCanvasPoint({ x: 120, y: 80 }, { left: 20, top: 10 }, 0.5);
		expect(result).toEqual({ x: 200, y: 140 });
	});

	it('returns floats, not rounded integers', () => {
		const result = toCanvasPoint({ x: 21, y: 11 }, { left: 20, top: 10 }, 0.5);
		expect(result).toEqual({ x: 2, y: 2 });
		const fractional = toCanvasPoint({ x: 20.3, y: 10.3 }, { left: 20, top: 10 }, 1);
		expect(fractional.x).toBeCloseTo(0.3);
		expect(fractional.y).toBeCloseTo(0.3);
	});
});
