import { describe, expect, it } from 'vitest';
import { saveNewAnnotation, saveExistingAnnotation, saveDirtyAnnotations } from '../../../src/canvas/save';
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

describe('saveDirtyAnnotations', () => {
	it('returns an empty map and does not touch the file for an empty entry list', async () => {
		const path = 'note.md';
		const before = 'para one\n';
		const vault = new FakeVault({ [path]: before });

		const outcomes = await saveDirtyAnnotations(vault, { path }, []);

		expect(outcomes.size).toBe(0);
		expect(vault.read(path)).toBe(before);
	});

	it('inserts a brand-new annotation and updates an existing one in a single vault.process call', async () => {
		const path = 'note.md';
		const before = 'para one\n\n```ink-canvas\ncv1;id=bbbbbbbb;OLD\n```\n\npara two\n';
		const vault = new FakeVault({ [path]: before });
		const pos = before.indexOf('para one');

		const outcomes = await saveDirtyAnnotations(vault, { path }, [
			{ id: 'bbbbbbbb', line: 'cv1;id=bbbbbbbb;NEW', pos: null },
			{ id: 'aaaaaaaa', line: 'cv1;id=aaaaaaaa;', pos },
		]);

		expect(outcomes.get('bbbbbbbb')).toEqual({ kind: 'updated' });
		expect(outcomes.get('aaaaaaaa')).toEqual({ kind: 'updated' });
		const saved = vault.read(path) as string;
		expect(saved).toContain('cv1;id=bbbbbbbb;NEW');
		expect(saved).not.toContain('cv1;id=bbbbbbbb;OLD');
		expect(saved).toContain('cv1;id=aaaaaaaa;');
	});

	it('reports a duplicate id as a per-entry failure without masking another entry that succeeded', async () => {
		const path = 'note.md';
		const dupeBlock = '```ink-canvas\ncv1;id=bbbbbbbb;\n```\n';
		const before = dupeBlock + '\n' + dupeBlock + '\n```ink-canvas\ncv1;id=aaaaaaaa;OLD\n```\n';
		const vault = new FakeVault({ [path]: before });

		const outcomes = await saveDirtyAnnotations(vault, { path }, [
			{ id: 'bbbbbbbb', line: 'cv1;id=bbbbbbbb;NEW', pos: null },
			{ id: 'aaaaaaaa', line: 'cv1;id=aaaaaaaa;NEW', pos: null },
		]);

		expect(outcomes.get('bbbbbbbb')).toEqual({ kind: 'duplicate' });
		expect(outcomes.get('aaaaaaaa')).toEqual({ kind: 'updated' });
		const saved = vault.read(path) as string;
		expect(saved).toContain('cv1;id=aaaaaaaa;NEW');
		// the duplicated blocks are both left exactly as they were
		expect(saved).toContain(dupeBlock);
	});

	it('returns file-missing for every entry when the file no longer exists', async () => {
		const vault = new FakeVault({});
		const outcomes = await saveDirtyAnnotations(vault, { path: 'gone.md' }, [
			{ id: 'aaaaaaaa', line: 'cv1;id=aaaaaaaa;', pos: 0 },
			{ id: 'bbbbbbbb', line: 'cv1;id=bbbbbbbb;', pos: null },
		]);
		expect(outcomes.get('aaaaaaaa')).toEqual({ kind: 'file-missing' });
		expect(outcomes.get('bbbbbbbb')).toEqual({ kind: 'file-missing' });
	});
});
