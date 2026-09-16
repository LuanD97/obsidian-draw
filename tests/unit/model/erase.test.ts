import { describe, expect, it, vi } from 'vitest';
import { hitStrokes, internal } from '../../../src/model/erase';
import type { Stroke } from '../../../src/model/types';

function horizontalStroke(): Stroke {
	return {
		points: [
			{ x: 0, y: 0, p: 100 },
			{ x: 100, y: 0, p: 100 },
		],
	};
}

function dotStroke(): Stroke {
	return { points: [{ x: 50, y: 50, p: 100 }] };
}

describe('hitStrokes', () => {
	it('hits a point within radius + strokeHalfWidth of a segment', () => {
		// threshold = 8 (radius) + 1.5 (half width) = 9.5
		const hits = hitStrokes([horizontalStroke()], { x: 50, y: 9 }, 8);
		expect(hits).toEqual([0]);
	});

	it('misses a point just outside radius + strokeHalfWidth of a segment', () => {
		const hits = hitStrokes([horizontalStroke()], { x: 50, y: 10 }, 8);
		expect(hits).toEqual([]);
	});

	it('can hit a single-point (dot) stroke', () => {
		const hits = hitStrokes([dotStroke()], { x: 54, y: 50 }, 8);
		expect(hits).toEqual([0]);
	});

	it('misses a dot stroke outside the threshold', () => {
		const hits = hitStrokes([dotStroke()], { x: 65, y: 50 }, 8);
		expect(hits).toEqual([]);
	});

	it('rejects a stroke whose bounding box is far away without running segment checks', () => {
		const spy = vi.spyOn(internal, 'pointToSegmentDistance');
		const near = horizontalStroke();
		const far: Stroke = {
			points: [
				{ x: 5000, y: 5000, p: 100 },
				{ x: 5100, y: 5000, p: 100 },
			],
		};

		const hits = hitStrokes([near, far], { x: 50, y: 0 }, 8);

		expect(hits).toEqual([0]);
		// only the near stroke's single segment should have been measured
		expect(spy).toHaveBeenCalledTimes(1);
		spy.mockRestore();
	});

	it('returns hit indices in ascending order', () => {
		const strokes: Stroke[] = [
			{ points: [{ x: 0, y: 0, p: 100 }, { x: 10, y: 0, p: 100 }] },
			{ points: [{ x: 500, y: 500, p: 100 }, { x: 510, y: 500, p: 100 }] },
			{ points: [{ x: 20, y: 0, p: 100 }, { x: 30, y: 0, p: 100 }] },
		];
		const hits = hitStrokes(strokes, { x: 15, y: 0 }, 8);
		expect(hits).toEqual([0, 2]);
	});
});
