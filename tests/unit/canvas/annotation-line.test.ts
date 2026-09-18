import { describe, expect, it } from 'vitest';
import {
	formatAnnotationLine,
	parseAnnotationLine,
	DecodeError,
} from '../../../src/canvas/annotation-line';
import type { Annotation } from '../../../src/canvas/annotation-line';

const emptyAnnotation: Annotation = { id: 'k3f9x2ab', strokes: [] };

const annotationWithStrokes: Annotation = {
	id: 'a1b2c3d4',
	strokes: [
		{
			points: [
				{ x: 1, y: 2, p: 10 },
				{ x: 5, y: 6, p: 20 },
			],
		},
	],
};

const annotationWithNegativeFirstPoint: Annotation = {
	id: 'b2c3d4e5',
	strokes: [
		{
			points: [
				{ x: -50, y: -30, p: 100 },
				{ x: -10, y: 5, p: 120 },
			],
		},
	],
};

describe('formatAnnotationLine / parseAnnotationLine round-trip', () => {
	it('round-trips an empty annotation', () => {
		const line = formatAnnotationLine(emptyAnnotation);
		expect(parseAnnotationLine(line)).toEqual(emptyAnnotation);
	});

	it('round-trips an annotation with strokes', () => {
		const line = formatAnnotationLine(annotationWithStrokes);
		expect(parseAnnotationLine(line)).toEqual(annotationWithStrokes);
	});

	it('round-trips an annotation whose first point has negative x0/y0', () => {
		const line = formatAnnotationLine(annotationWithNegativeFirstPoint);
		expect(parseAnnotationLine(line)).toEqual(annotationWithNegativeFirstPoint);
	});

	it('formats an empty annotation as cv1;id=<id>; (empty payload)', () => {
		expect(formatAnnotationLine(emptyAnnotation)).toBe('cv1;id=k3f9x2ab;');
	});
});

describe('parseAnnotationLine rejections', () => {
	function expectMalformed(line: string): void {
		expect(() => parseAnnotationLine(line)).toThrow(DecodeError);
		try {
			parseAnnotationLine(line);
		} catch (e) {
			expect((e as DecodeError).kind).toBe('malformed');
		}
	}

	it('rejects a missing field (no payload segment at all)', () => {
		expectMalformed('cv1;id=k3f9x2ab');
	});

	it('rejects a wrong-length id', () => {
		expectMalformed('cv1;id=abc;');
	});

	it('rejects an id with invalid characters', () => {
		expectMalformed('cv1;id=AAAAAAAA;');
	});

	it('rejects invalid payload characters', () => {
		expectMalformed('cv1;id=k3f9x2ab;not-valid-base64!!');
	});

	it('treats cv2 (unknown version) as unsupported-version', () => {
		expect(() => parseAnnotationLine('cv2;id=k3f9x2ab;')).toThrow(DecodeError);
		try {
			parseAnnotationLine('cv2;id=k3f9x2ab;');
		} catch (e) {
			expect((e as DecodeError).kind).toBe('unsupported-version');
		}
	});

	it('ignores trailing whitespace', () => {
		const line = formatAnnotationLine(emptyAnnotation);
		expect(parseAnnotationLine(line + '   \n')).toEqual(emptyAnnotation);
	});
});
