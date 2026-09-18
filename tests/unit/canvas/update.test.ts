import { describe, expect, it } from 'vitest';
import { applyAnnotationUpdate } from '../../../src/canvas/update';
import { locateAnnotation } from '../../../src/canvas/locate';

describe('applyAnnotationUpdate', () => {
	it('replaces only the target annotation payload line, byte-identical elsewhere', () => {
		const text = 'before\n```ink-canvas\ncv1;id=aaaaaaaa;XYZ\n```\nafter\n';
		const loc = locateAnnotation(text, 'aaaaaaaa');
		if (loc.kind !== 'found') throw new Error('unreachable');
		const newLine = 'cv1;id=aaaaaaaa;NEWDATA';

		const result = applyAnnotationUpdate(text, 'aaaaaaaa', newLine);

		expect(result.kind).toBe('updated');
		expect(result.text).toBe(text.slice(0, loc.start) + newLine + text.slice(loc.end));
	});

	it('leaves text unchanged with not-found when the id is absent', () => {
		const text = '```ink-canvas\ncv1;id=aaaaaaaa;\n```\n';
		const result = applyAnnotationUpdate(text, 'zzzzzzzz', 'cv1;id=zzzzzzzz;X');
		expect(result).toEqual({ kind: 'not-found', text });
	});

	it('leaves text unchanged with duplicate when the id appears in two blocks', () => {
		const block = '```ink-canvas\ncv1;id=aaaaaaaa;\n```\n';
		const text = block + block;
		const result = applyAnnotationUpdate(text, 'aaaaaaaa', 'cv1;id=aaaaaaaa;X');
		expect(result).toEqual({ kind: 'duplicate', text });
	});

	it('does not touch a same-id ink block', () => {
		const text = '```ink\nv1;id=aaaaaaaa;700x260;\n```\n';
		const result = applyAnnotationUpdate(text, 'aaaaaaaa', 'cv1;id=aaaaaaaa;X');
		expect(result).toEqual({ kind: 'not-found', text });
	});
});
