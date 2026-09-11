import { describe, expect, it } from 'vitest';
import {
	formatBlockLine,
	parseBlockLine,
	newBlockMarkdown,
	DecodeError,
} from '../../../src/format/block-line';
import type { Drawing } from '../../../src/model/types';

const emptyDrawing: Drawing = { version: 1, id: 'k3f9x2ab', width: 700, height: 260, strokes: [] };

const drawingWithStrokes: Drawing = {
	version: 1,
	id: 'a1b2c3d4',
	width: 500,
	height: 300,
	strokes: [
		{
			points: [
				{ x: 1, y: 2, p: 10 },
				{ x: 5, y: 6, p: 20 },
			],
		},
	],
};

describe('formatBlockLine / parseBlockLine round-trip', () => {
	it('round-trips an empty drawing', () => {
		const line = formatBlockLine(emptyDrawing);
		expect(parseBlockLine(line)).toEqual(emptyDrawing);
	});

	it('round-trips a drawing with strokes', () => {
		const line = formatBlockLine(drawingWithStrokes);
		expect(parseBlockLine(line)).toEqual(drawingWithStrokes);
	});

	it('formats an empty drawing as v1;id=<id>;700x260;', () => {
		expect(formatBlockLine(emptyDrawing)).toBe('v1;id=k3f9x2ab;700x260;');
	});
});

describe('parseBlockLine rejections', () => {
	function expectMalformed(line: string): void {
		expect(() => parseBlockLine(line)).toThrow(DecodeError);
		try {
			parseBlockLine(line);
		} catch (e) {
			expect((e as DecodeError).kind).toBe('malformed');
		}
	}

	it('rejects a missing field', () => {
		expectMalformed('v1;id=k3f9x2ab;700x260');
	});

	it('rejects an extra field', () => {
		expectMalformed('v1;id=k3f9x2ab;700x260;;extra');
	});

	it('rejects an id of the wrong length', () => {
		expectMalformed('v1;id=short;700x260;');
	});

	it('rejects an id with invalid characters', () => {
		expectMalformed('v1;id=K3F9X2AB;700x260;');
	});

	it('rejects a size of 63', () => {
		expectMalformed('v1;id=k3f9x2ab;63x260;');
	});

	it('rejects a size of 4097', () => {
		expectMalformed('v1;id=k3f9x2ab;4097x260;');
	});

	it('rejects a non-integer size', () => {
		expectMalformed('v1;id=k3f9x2ab;700.5x260;');
	});

	it('rejects invalid payload characters', () => {
		expectMalformed('v1;id=k3f9x2ab;700x260;not valid base64!!');
	});

	it('reports v2 as unsupported-version', () => {
		expect(() => parseBlockLine('v2;id=k3f9x2ab;700x260;')).toThrow(DecodeError);
		try {
			parseBlockLine('v2;id=k3f9x2ab;700x260;');
		} catch (e) {
			expect((e as DecodeError).kind).toBe('unsupported-version');
		}
	});

	it('ignores trailing whitespace', () => {
		expect(parseBlockLine('v1;id=k3f9x2ab;700x260;   ')).toEqual(emptyDrawing);
	});
});

describe('newBlockMarkdown', () => {
	it('returns exactly the fenced ink block', () => {
		const md = newBlockMarkdown(emptyDrawing);
		expect(md).toBe('```ink\nv1;id=k3f9x2ab;700x260;\n```\n');
	});
});
