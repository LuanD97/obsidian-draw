import { describe, expect, it } from 'vitest';
import { saveNewAnnotation, saveExistingAnnotation } from '../../../src/canvas/save';
import { FakeVault } from '../fake-vault';

describe('saveNewAnnotation', () => {
	it('inserts the block after the paragraph nearest the pen-down position in the current stored text, not a stale copy', async () => {
		const path = 'note.md';
		const staleText = 'para one\n\npara two\n';
		const vault = new FakeVault({ [path]: staleText });

		// Simulate the file changing on disk (typing, or sync) after Canvas
		// Mode was turned on but before this stroke's save fires.
		await vault.process({ path }, () => 'intro\n\npara one\n\npara two\n');
		const currentText = vault.read(path) as string;
		const pos = currentText.indexOf('para one');
		const blockMarkdown = '```ink-canvas\ncv1;id=aaaaaaaa;\n```\n';

		const outcome = await saveNewAnnotation(vault, { path }, pos, blockMarkdown);

		expect(outcome).toEqual({ kind: 'updated' });
		expect(vault.read(path)).toBe('intro\n\npara one\n\n' + blockMarkdown + '\npara two\n');
	});

	it('returns file-missing when the file no longer exists', async () => {
		const vault = new FakeVault({});
		const outcome = await saveNewAnnotation(vault, { path: 'gone.md' }, 0, '```ink-canvas\ncv1;id=aaaaaaaa;\n```\n');
		expect(outcome).toEqual({ kind: 'file-missing' });
	});
});

describe('saveExistingAnnotation', () => {
	it('updates only the target annotation payload line on a second save', async () => {
		const path = 'note.md';
		const before = 'para one\n\n```ink-canvas\ncv1;id=aaaaaaaa;\n```\n\npara two\n';
		const vault = new FakeVault({ [path]: before });
		const newLine = 'cv1;id=aaaaaaaa;XYZ';

		const outcome = await saveExistingAnnotation(vault, { path }, 'aaaaaaaa', newLine);

		expect(outcome).toEqual({ kind: 'updated' });
		expect(vault.read(path)).toBe('para one\n\n```ink-canvas\n' + newLine + '\n```\n\npara two\n');
	});

	it('returns not-found without modifying the file when the id is absent', async () => {
		const path = 'note.md';
		const before = '```ink-canvas\ncv1;id=aaaaaaaa;\n```\n';
		const vault = new FakeVault({ [path]: before });

		const outcome = await saveExistingAnnotation(vault, { path }, 'zzzzzzzz', 'cv1;id=zzzzzzzz;X');

		expect(outcome).toEqual({ kind: 'not-found' });
		expect(vault.read(path)).toBe(before);
	});
});
