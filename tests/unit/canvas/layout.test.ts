import { describe, expect, it } from 'vitest';
import { computeMarginBands, toOverlayPoint } from '../../../src/canvas/layout';

describe('computeMarginBands', () => {
	it('computes symmetric left/right bands for a centered content column', () => {
		const bands = computeMarginBands(1000, 150, 700);
		expect(bands.left).toEqual({ start: 0, width: 150 });
		expect(bands.right).toEqual({ start: 850, width: 150 });
	});

	it('computes an asymmetric right band when the content column is not centered', () => {
		const bands = computeMarginBands(900, 50, 700);
		expect(bands.left).toEqual({ start: 0, width: 50 });
		expect(bands.right).toEqual({ start: 750, width: 150 });
	});

	it('yields zero-width margins on both sides when the scroller matches the content column exactly', () => {
		const bands = computeMarginBands(700, 0, 700);
		expect(bands.left.width).toBe(0);
		expect(bands.right.width).toBe(0);
	});

	it('yields zero-width margins on both sides when the scroller is narrower than the content column', () => {
		const bands = computeMarginBands(600, 0, 700);
		expect(bands.left.width).toBe(0);
		expect(bands.right.width).toBe(0);
	});
});

describe('toOverlayPoint', () => {
	it('converts a client point at the scroller origin with no scroll to (0, 0)', () => {
		const point = toOverlayPoint({ x: 100, y: 50 }, { left: 100, top: 50 }, { left: 0, top: 0 });
		expect(point).toEqual({ x: 0, y: 0 });
	});

	it('adds the current scroll offset', () => {
		const point = toOverlayPoint({ x: 120, y: 80 }, { left: 100, top: 50 }, { left: 0, top: 400 });
		expect(point).toEqual({ x: 20, y: 430 });
	});

	it('accounts for the scroller not starting at the viewport origin', () => {
		const point = toOverlayPoint({ x: 250, y: 150 }, { left: 200, top: 100 }, { left: 0, top: 0 });
		expect(point).toEqual({ x: 50, y: 50 });
	});
});
