import { describe, expect, it } from 'vitest';
import { applyBlockUpdate, appendBlock } from '../../../src/document/update';
import { locateBlock } from '../../../src/document/locate';

describe('applyBlockUpdate', () => {
	it('returns updated text equal to the exact slice replacement', () => {
		const text = 'before\n```ink\nv1;id=aaaaaaaa;700x260;\n```\nafter\n';
		const loc = locateBlock(text, 'aaaaaaaa');
		if (loc.kind !== 'found') throw new Error('unreachable');
		const newLine = 'v1;id=aaaaaaaa;700x260;AAAA';

		const result = applyBlockUpdate(text, 'aaaaaaaa', newLine);

		expect(result.kind).toBe('updated');
		expect(result.text).toBe(text.slice(0, loc.start) + newLine + text.slice(loc.end));
	});

	it('returns unchanged with identical text when the line does not change', () => {
		const text = '```ink\nv1;id=aaaaaaaa;700x260;\n```\n';
		const result = applyBlockUpdate(text, 'aaaaaaaa', 'v1;id=aaaaaaaa;700x260;');
		expect(result).toEqual({ kind: 'unchanged', text });
	});

	it('returns not-found unchanged when the id is absent', () => {
		const text = '```ink\nv1;id=aaaaaaaa;700x260;\n```\n';
		const result = applyBlockUpdate(text, 'zzzzzzzz', 'v1;id=zzzzzzzz;700x260;X');
		expect(result).toEqual({ kind: 'not-found', text });
	});

	it('returns duplicate unchanged when the id appears twice', () => {
		const block = '```ink\nv1;id=aaaaaaaa;700x260;\n```\n';
		const text = block + block;
		const result = applyBlockUpdate(text, 'aaaaaaaa', 'v1;id=aaaaaaaa;700x260;X');
		expect(result).toEqual({ kind: 'duplicate', text });
	});

	it('preserves CRLF line endings outside the replaced payload', () => {
		const text = '```ink\r\nv1;id=aaaaaaaa;700x260;\r\n```\r\n';
		const newLine = 'v1;id=aaaaaaaa;700x260;BB';
		const result = applyBlockUpdate(text, 'aaaaaaaa', newLine);
		expect(result.kind).toBe('updated');
		expect(result.text).toBe('```ink\r\n' + newLine + '\r\n```\r\n');
	});

	it('preserves a callout ("> ") prefix', () => {
		const text = '> ```ink\n> v1;id=aaaaaaaa;700x260;\n> ```\n';
		const newLine = 'v1;id=aaaaaaaa;700x260;CC';
		const result = applyBlockUpdate(text, 'aaaaaaaa', newLine);
		expect(result.kind).toBe('updated');
		expect(result.text).toBe('> ```ink\n> ' + newLine + '\n> ```\n');
	});
});

describe('appendBlock', () => {
	it('adds exactly one separating newline when the text does not end with one', () => {
		const text = 'some note text without trailing newline';
		const md = '```ink\nv1;id=aaaaaaaa;700x260;\n```\n';
		const result = appendBlock(text, md);
		expect(result).toBe(text + '\n' + md);
	});

	it('does not add an extra newline when the text already ends with one', () => {
		const text = 'some note text\n';
		const md = '```ink\nv1;id=aaaaaaaa;700x260;\n```\n';
		const result = appendBlock(text, md);
		expect(result).toBe(text + md);
	});

	it('leaves existing text untouched', () => {
		const text = 'line one\nline two\n';
		const md = '```ink\nv1;id=aaaaaaaa;700x260;\n```\n';
		const result = appendBlock(text, md);
		expect(result.startsWith(text)).toBe(true);
	});
});
