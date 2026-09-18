import { describe, expect, it } from 'vitest';
import { insertAnnotationAfterParagraph } from '../../../src/canvas/insert';

const NEW_BLOCK = '```ink-canvas\ncv1;id=newnewnw;\n```\n';

describe('insertAnnotationAfterParagraph', () => {
	it('inserts right after the paragraph, before the next paragraph, given a position anywhere inside it', () => {
		const text = 'para one line one\npara one line two\n\npara two\n';
		const pos = text.indexOf('line two'); // inside the first paragraph, second line

		const result = insertAnnotationAfterParagraph(text, pos, NEW_BLOCK);

		expect(result).toBe('para one line one\npara one line two\n\n' + NEW_BLOCK + '\npara two\n');
	});

	it('appends at the end of the file for a position on the last paragraph', () => {
		const text = 'para one\n\npara two\n';
		const pos = text.indexOf('para two');

		const result = insertAnnotationAfterParagraph(text, pos, NEW_BLOCK);

		expect(result).toBe('para one\n\npara two\n\n' + NEW_BLOCK);
	});

	it('appends at the end of a file with no trailing newline', () => {
		const text = 'only paragraph';
		const result = insertAnnotationAfterParagraph(text, 0, NEW_BLOCK);
		expect(result).toBe('only paragraph\n\n' + NEW_BLOCK);
	});

	it('inserts after an existing ink-canvas block that immediately follows the paragraph, not before it', () => {
		const existing = '```ink-canvas\ncv1;id=aaaaaaaa;\n```\n';
		const text = 'para one\n\n' + existing + '\npara two\n';
		const pos = text.indexOf('para one');

		const result = insertAnnotationAfterParagraph(text, pos, NEW_BLOCK);

		expect(result).toBe('para one\n\n' + existing + '\n' + NEW_BLOCK + '\npara two\n');
	});

	it('inserts after an existing ink block that immediately follows the paragraph, not before it', () => {
		const existing = '```ink\nv1;id=aaaaaaaa;700x260;\n```\n';
		const text = 'para one\n\n' + existing + '\npara two\n';
		const pos = text.indexOf('para one');

		const result = insertAnnotationAfterParagraph(text, pos, NEW_BLOCK);

		expect(result).toBe('para one\n\n' + existing + '\n' + NEW_BLOCK + '\npara two\n');
	});

	it('leaves all other text byte-identical', () => {
		const text = 'intro\n\npara one\nmore text\n\npara two\n\nconclusion\n';
		const pos = text.indexOf('more text');

		const result = insertAnnotationAfterParagraph(text, pos, NEW_BLOCK);

		expect(result.startsWith('intro\n\npara one\nmore text\n\n' + NEW_BLOCK + '\npara two')).toBe(true);
		expect(result.endsWith('\n\nconclusion\n')).toBe(true);
	});

	it('works against CRLF text', () => {
		const text = 'para one\r\n\r\npara two\r\n';
		const pos = text.indexOf('para one');

		const result = insertAnnotationAfterParagraph(text, pos, NEW_BLOCK);

		expect(result).toBe('para one\r\n\r\n' + NEW_BLOCK + '\npara two\r\n');
	});
});
