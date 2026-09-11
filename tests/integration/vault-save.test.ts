import { describe, expect, it } from 'vitest';
import { saveBlock } from '../../src/obsidian/vault-save';
import { FakeVault } from './fake-vault';

describe('saveBlock (basic path)', () => {
	it('returns updated and stores the new text when the block is found', async () => {
		const path = 'note.md';
		const before = '```ink\nv1;id=aaaaaaaa;700x260;\n```\n';
		const vault = new FakeVault({ [path]: before });
		const newLine = 'v1;id=aaaaaaaa;700x260;XYZ';

		const outcome = await saveBlock(vault, { path }, 'aaaaaaaa', newLine);

		expect(outcome).toEqual({ kind: 'updated' });
		expect(vault.read(path)).toBe('```ink\n' + newLine + '\n```\n');
	});

	it('returns unchanged and leaves the stored text identical when the line does not change', async () => {
		const path = 'note.md';
		const line = 'v1;id=aaaaaaaa;700x260;';
		const before = '```ink\n' + line + '\n```\n';
		const vault = new FakeVault({ [path]: before });

		const outcome = await saveBlock(vault, { path }, 'aaaaaaaa', line);

		expect(outcome).toEqual({ kind: 'unchanged' });
		expect(vault.read(path)).toBe(before);
	});
});
