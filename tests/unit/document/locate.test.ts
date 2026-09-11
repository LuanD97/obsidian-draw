import { describe, expect, it } from 'vitest';
import { locateBlock } from '../../../src/document/locate';

function block(id: string, fence = '```'): string {
	return `${fence}ink\nv1;id=${id};700x260;\n${fence}\n`;
}

describe('locateBlock', () => {
	it('finds a single block with exact start/end of the payload', () => {
		const text = `intro\n${block('aaaaaaaa')}outro\n`;
		const loc = locateBlock(text, 'aaaaaaaa');
		expect(loc.kind).toBe('found');
		if (loc.kind !== 'found') throw new Error('unreachable');
		expect(text.slice(loc.start, loc.end)).toBe('v1;id=aaaaaaaa;700x260;');
		expect(loc.prefix).toBe('');
	});

	it('finds the right block among several with different ids', () => {
		const text = block('aaaaaaaa') + '\n' + block('bbbbbbbb') + '\n' + block('cccccccc');
		const loc = locateBlock(text, 'bbbbbbbb');
		expect(loc.kind).toBe('found');
		if (loc.kind !== 'found') throw new Error('unreachable');
		expect(text.slice(loc.start, loc.end)).toBe('v1;id=bbbbbbbb;700x260;');
	});

	it('returns not-found when the id is absent', () => {
		const text = block('aaaaaaaa');
		expect(locateBlock(text, 'zzzzzzzz')).toEqual({ kind: 'not-found' });
	});

	it('returns duplicate with count 2 when the id appears in two blocks', () => {
		const text = block('aaaaaaaa') + '\n' + block('aaaaaaaa');
		expect(locateBlock(text, 'aaaaaaaa')).toEqual({ kind: 'duplicate', count: 2 });
	});

	it('recognises ~~~ fences', () => {
		const text = block('aaaaaaaa', '~~~');
		const loc = locateBlock(text, 'aaaaaaaa');
		expect(loc.kind).toBe('found');
	});

	it('recognises a four-backtick fence', () => {
		const text = block('aaaaaaaa', '````');
		const loc = locateBlock(text, 'aaaaaaaa');
		expect(loc.kind).toBe('found');
	});

	it('does not count an ink block nested inside an outer fence', () => {
		const text = '````md\n' + block('aaaaaaaa') + '````\n';
		expect(locateBlock(text, 'aaaaaaaa')).toEqual({ kind: 'not-found' });
	});

	it('requires the info string to be exactly "ink" (ignores inked/ink2), allows trailing spaces', () => {
		const inked = '```inked\nv1;id=aaaaaaaa;700x260;\n```\n';
		const ink2 = '```ink2\nv1;id=bbbbbbbb;700x260;\n```\n';
		expect(locateBlock(inked, 'aaaaaaaa')).toEqual({ kind: 'not-found' });
		expect(locateBlock(ink2, 'bbbbbbbb')).toEqual({ kind: 'not-found' });

		const withTrailingSpace = '```ink   \nv1;id=cccccccc;700x260;\n```\n';
		expect(locateBlock(withTrailingSpace, 'cccccccc').kind).toBe('found');
	});

	it('finds a block prefixed with "> " (callout) and returns that prefix', () => {
		const text = '> ```ink\n> v1;id=aaaaaaaa;700x260;\n> ```\n';
		const loc = locateBlock(text, 'aaaaaaaa');
		expect(loc.kind).toBe('found');
		if (loc.kind !== 'found') throw new Error('unreachable');
		expect(loc.prefix).toBe('> ');
		expect(text.slice(loc.start, loc.end)).toBe('v1;id=aaaaaaaa;700x260;');
	});

	it('finds a block prefixed with "> > " (nested blockquote)', () => {
		const text = '> > ```ink\n> > v1;id=aaaaaaaa;700x260;\n> > ```\n';
		const loc = locateBlock(text, 'aaaaaaaa');
		expect(loc.kind).toBe('found');
		if (loc.kind !== 'found') throw new Error('unreachable');
		expect(loc.prefix).toBe('> > ');
	});

	it('finds a block indented with two spaces', () => {
		const text = '  ```ink\n  v1;id=aaaaaaaa;700x260;\n  ```\n';
		const loc = locateBlock(text, 'aaaaaaaa');
		expect(loc.kind).toBe('found');
		if (loc.kind !== 'found') throw new Error('unreachable');
		expect(loc.prefix).toBe('  ');
	});

	it('excludes the trailing \\r on CRLF files', () => {
		const text = '```ink\r\nv1;id=aaaaaaaa;700x260;\r\n```\r\n';
		const loc = locateBlock(text, 'aaaaaaaa');
		expect(loc.kind).toBe('found');
		if (loc.kind !== 'found') throw new Error('unreachable');
		// end sits right before the \r, so the payload slice never includes it
		expect(text[loc.end]).toBe('\r');
		expect(text.slice(loc.start, loc.end)).toBe('v1;id=aaaaaaaa;700x260;');
		expect(text.slice(loc.start, loc.end)).not.toContain('\r');
	});

	it('handles an unclosed fence at end of file', () => {
		const text = '```ink\nv1;id=aaaaaaaa;700x260;\n';
		const loc = locateBlock(text, 'aaaaaaaa');
		expect(loc.kind).toBe('found');
		if (loc.kind !== 'found') throw new Error('unreachable');
		expect(text.slice(loc.start, loc.end)).toBe('v1;id=aaaaaaaa;700x260;');
	});

	it('tolerates blank lines around the content line', () => {
		const text = '```ink\n\n\nv1;id=aaaaaaaa;700x260;\n\n```\n';
		const loc = locateBlock(text, 'aaaaaaaa');
		expect(loc.kind).toBe('found');
		if (loc.kind !== 'found') throw new Error('unreachable');
		expect(text.slice(loc.start, loc.end)).toBe('v1;id=aaaaaaaa;700x260;');
	});
});
