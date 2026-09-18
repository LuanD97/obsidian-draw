import { describe, expect, it } from 'vitest';
import { locateAnnotation } from '../../../src/canvas/locate';

describe('locateAnnotation', () => {
	it('finds a single ink-canvas block by id', () => {
		const text = '```ink-canvas\ncv1;id=aaaaaaaa;XYZ\n```\n';
		const loc = locateAnnotation(text, 'aaaaaaaa');
		expect(loc.kind).toBe('found');
		if (loc.kind !== 'found') throw new Error('unreachable');
		expect(text.slice(loc.start, loc.end)).toBe('cv1;id=aaaaaaaa;XYZ');
	});

	it('ignores a same-id ink block (wrong fence language)', () => {
		const text = '```ink\nv1;id=aaaaaaaa;700x260;\n```\n';
		expect(locateAnnotation(text, 'aaaaaaaa')).toEqual({ kind: 'not-found' });
	});

	it('returns not-found when the id is absent', () => {
		const text = '```ink-canvas\ncv1;id=aaaaaaaa;\n```\n';
		expect(locateAnnotation(text, 'zzzzzzzz')).toEqual({ kind: 'not-found' });
	});

	it('returns duplicate with count 2 when the id appears in two ink-canvas blocks', () => {
		const block = '```ink-canvas\ncv1;id=aaaaaaaa;\n```\n';
		const text = block + '\n' + block;
		expect(locateAnnotation(text, 'aaaaaaaa')).toEqual({ kind: 'duplicate', count: 2 });
	});
});
