import { describe, expect, it } from 'vitest';
import { insertionText } from '../../../src/document/insert';

const BLOCK_MD = '```ink\nv1;id=aaaaaaaa;700x260;\n```\n';

describe('insertionText', () => {
	it('returns just the block markdown when the current line is empty', () => {
		expect(insertionText('', BLOCK_MD)).toBe(BLOCK_MD);
	});

	it('adds a leading newline when the current line is non-empty, so the block starts on its own line', () => {
		expect(insertionText('some existing text', BLOCK_MD)).toBe('\n' + BLOCK_MD);
	});

	it('always ends with a newline', () => {
		expect(insertionText('', BLOCK_MD).endsWith('\n')).toBe(true);
		expect(insertionText('text', BLOCK_MD).endsWith('\n')).toBe(true);
	});
});
