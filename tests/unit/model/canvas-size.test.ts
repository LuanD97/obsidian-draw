import { describe, expect, it } from 'vitest';
import { contentWidth, defaultSize, fitScale } from '../../../src/model/canvas-size';

describe('defaultSize', () => {
	it('falls back to 700x260 when no column width was measured', () => {
		expect(defaultSize(null)).toEqual({ width: 700, height: 260 });
	});

	it('clamps a narrow measurement up to 200', () => {
		expect(defaultSize(150)).toEqual({ width: 200, height: 260 });
	});

	it('clamps a wide measurement down to 2000', () => {
		expect(defaultSize(3000)).toEqual({ width: 2000, height: 260 });
	});

	it('rounds down a fractional measurement', () => {
		expect(defaultSize(812.7)).toEqual({ width: 812, height: 260 });
	});
});

describe('contentWidth', () => {
	it('subtracts left and right padding from the client width', () => {
		expect(contentWidth(800, 20, 30)).toBe(750);
	});
});

describe('fitScale', () => {
	it('returns 1 when the size fits within the available area', () => {
		expect(fitScale({ width: 400, height: 200 }, { width: 800, height: 600 })).toBe(1);
	});

	it('returns min(availW/w, availH/h) when the size does not fit', () => {
		const scale = fitScale({ width: 1000, height: 500 }, { width: 400, height: 300 });
		expect(scale).toBeCloseTo(Math.min(400 / 1000, 300 / 500));
	});
});
