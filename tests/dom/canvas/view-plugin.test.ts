// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { computeAnnotationDecorations } from '../../../src/canvas/view-plugin';

function decorationRanges(text: string): { from: number; to: number }[] {
	const set = computeAnnotationDecorations(text);
	const ranges: { from: number; to: number }[] = [];
	const cursor = set.iter();
	while (cursor.value) {
		ranges.push({ from: cursor.from, to: cursor.to });
		cursor.next();
	}
	return ranges;
}

describe('computeAnnotationDecorations', () => {
	it('replaces exactly the block full range (fence to fence) with a zero-size widget', () => {
		const text = 'para\n\n```ink-canvas\ncv1;id=aaaaaaaa;XYZ\n```\n\npara two\n';
		const blockStart = text.indexOf('```ink-canvas');
		const blockEnd = text.indexOf('```', blockStart + 3) + 3;

		const ranges = decorationRanges(text);

		expect(ranges).toEqual([{ from: blockStart, to: blockEnd }]);
	});

	it('produces no decorations for a doc with only an ink block', () => {
		const text = '```ink\nv1;id=aaaaaaaa;700x260;\n```\n';
		expect(decorationRanges(text)).toEqual([]);
	});

	it('updates the decoration range after a doc change moves the block position', () => {
		const block = '```ink-canvas\ncv1;id=aaaaaaaa;\n```\n';
		const prefix = 'prefix text\n\n';

		const rangesBefore = decorationRanges(block);
		const rangesAfter = decorationRanges(prefix + block);

		expect(rangesBefore).toHaveLength(1);
		expect(rangesAfter).toHaveLength(1);
		expect(rangesAfter[0]!.from).toBe(rangesBefore[0]!.from + prefix.length);
		expect(rangesAfter[0]!.to).toBe(rangesBefore[0]!.to + prefix.length);
	});

	it('handles two ink-canvas blocks independently', () => {
		const text =
			'```ink-canvas\ncv1;id=aaaaaaaa;\n```\n\n' + 'para\n\n' + '```ink-canvas\ncv1;id=bbbbbbbb;\n```\n';
		expect(decorationRanges(text)).toHaveLength(2);
	});
});
