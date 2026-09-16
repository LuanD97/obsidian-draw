import { describe, expect, it } from 'vitest';
import {
	clampSize,
	contentWidth,
	defaultSize,
	fitScale,
	minSize,
	resizeBounds,
} from '../../../src/model/canvas-size';
import type { Stroke } from '../../../src/model/types';

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

describe('minSize', () => {
	it('is 64x64 for no strokes', () => {
		expect(minSize([])).toEqual({ width: 64, height: 64 });
	});

	it('is max(64, bbox right + 4) x max(64, bbox bottom + 4)', () => {
		const strokes: Stroke[] = [
			{ points: [{ x: 10, y: 10, p: 100 }, { x: 200, y: 50, p: 100 }] },
			{ points: [{ x: 30, y: 300, p: 100 }] },
		];
		expect(minSize(strokes)).toEqual({ width: 204, height: 304 });
	});

	it('never returns below 64 even for strokes confined to a small corner', () => {
		const strokes: Stroke[] = [{ points: [{ x: 1, y: 1, p: 100 }] }];
		expect(minSize(strokes)).toEqual({ width: 64, height: 64 });
	});
});

describe('clampSize', () => {
	it('clamps each dimension between min and max', () => {
		const result = clampSize(
			{ width: 50, height: 5000 },
			{ width: 100, height: 100 },
			{ width: 2000, height: 2000 },
		);
		expect(result).toEqual({ width: 100, height: 2000 });
	});

	it('caps at 4096 even when max is larger', () => {
		const result = clampSize(
			{ width: 5000, height: 5000 },
			{ width: 64, height: 64 },
			{ width: 8000, height: 8000 },
		);
		expect(result).toEqual({ width: 4096, height: 4096 });
	});

	it('min wins when min > max', () => {
		const result = clampSize(
			{ width: 500, height: 500 },
			{ width: 900, height: 900 },
			{ width: 300, height: 300 },
		);
		expect(result).toEqual({ width: 900, height: 900 });
	});

	it('passes a value already inside the bounds through unchanged', () => {
		const result = clampSize(
			{ width: 700, height: 260 },
			{ width: 64, height: 64 },
			{ width: 2000, height: 2000 },
		);
		expect(result).toEqual({ width: 700, height: 260 });
	});
});

describe('resizeBounds', () => {
	it('min is minSize(strokes) and max is the larger of current/available, capped at 4096', () => {
		const strokes: Stroke[] = [{ points: [{ x: 10, y: 10, p: 100 }] }];
		const bounds = resizeBounds({ width: 700, height: 260 }, strokes, { width: 900, height: 200 });
		expect(bounds.min).toEqual(minSize(strokes));
		expect(bounds.max).toEqual({ width: 900, height: 260 });
	});

	it('keeps width 1100 when only height is dragged and available is narrower', () => {
		const bounds = resizeBounds({ width: 1100, height: 260 }, [], { width: 800, height: 900 });
		expect(bounds.max.width).toBe(1100);
		expect(bounds.max.height).toBe(900);
	});

	it('caps max at 4096', () => {
		const bounds = resizeBounds({ width: 4000, height: 4000 }, [], { width: 5000, height: 5000 });
		expect(bounds.max).toEqual({ width: 4096, height: 4096 });
	});
});
