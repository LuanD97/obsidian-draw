import { describe, expect, it } from 'vitest';
import { listAnnotationBlocks } from '../../../src/canvas/scan';

describe('listAnnotationBlocks', () => {
	it('returns [] for an empty note', () => {
		expect(listAnnotationBlocks('')).toEqual([]);
	});

	it('returns only the ink-canvas blocks, ignoring an ink block', () => {
		const text =
			'para one\n' +
			'\n' +
			'```ink\n' +
			'v1;id=aaaaaaaa;700x260;\n' +
			'```\n' +
			'\n' +
			'para two\n' +
			'\n' +
			'```ink-canvas\n' +
			'cv1;id=bbbbbbbb;XYZ\n' +
			'```\n' +
			'\n' +
			'```ink-canvas\n' +
			'cv1;id=cccccccc;\n' +
			'```\n';

		const refs = listAnnotationBlocks(text);
		expect(refs).toHaveLength(2);
		expect(refs.map((r) => r.id)).toEqual(['bbbbbbbb', 'cccccccc']);

		const first = refs[0]!;
		expect(text.slice(first.payloadStart, first.payloadEnd)).toBe('cv1;id=bbbbbbbb;XYZ');
		expect(text.slice(first.blockStart, first.blockEnd)).toBe('```ink-canvas\ncv1;id=bbbbbbbb;XYZ\n```');

		const second = refs[1]!;
		expect(text.slice(second.payloadStart, second.payloadEnd)).toBe('cv1;id=cccccccc;');
	});

	it('still returns a ref for a malformed ink-canvas block rather than throwing', () => {
		const text = '```ink-canvas\nnot-a-valid-header-at-all\n```\n';
		expect(() => listAnnotationBlocks(text)).not.toThrow();
		const refs = listAnnotationBlocks(text);
		expect(refs).toHaveLength(1);
		expect(refs[0]!.id).toBe('');
	});
});
