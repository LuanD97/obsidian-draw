import { describe, expect, it } from 'vitest';
import { computeMarginBands } from '../../../src/canvas/layout';

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
