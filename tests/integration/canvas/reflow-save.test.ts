import { describe, expect, it } from 'vitest';
import { saveExistingAnnotation, saveDirtyAnnotations } from '../../../src/canvas/save';
import { FakeVault } from '../fake-vault';

describe('edge case: paragraph deleted', () => {
	it('leaves the file uncorrupted and updates the block, now reattached to whatever precedes it', async () => {
		const path = 'note.md';
		// The annotation was anchored to "para B"; some other edit (sync, or
		// the user) deletes that paragraph entirely, so the block is now
		// directly adjacent to "para A" instead (its new de-facto anchor —
		// research.md R3: the anchor is just wherever the block's line sits,
		// nothing to actively "reattach").
		const afterDeletion = 'para A\n\n```ink-canvas\ncv1;id=aaaaaaaa;OLD\n```\n\npara C\n';
		const vault = new FakeVault({ [path]: afterDeletion });

		const outcome = await saveExistingAnnotation(vault, { path }, 'aaaaaaaa', 'cv1;id=aaaaaaaa;NEW');

		expect(outcome).toEqual({ kind: 'updated' });
		const saved = vault.read(path) as string;
		expect(saved).toBe('para A\n\n```ink-canvas\ncv1;id=aaaaaaaa;NEW\n```\n\npara C\n');
		// para A and para C — everything but the payload line — are untouched.
		expect(saved.startsWith('para A\n\n')).toBe(true);
		expect(saved.endsWith('\n\npara C\n')).toBe(true);
	});
});

describe('edge case: duplicate annotation id', () => {
	it('refuses the save and keeps both copies of the drawing (via saveExistingAnnotation)', async () => {
		const path = 'note.md';
		const block = '```ink-canvas\ncv1;id=aaaaaaaa;ORIGINAL\n```\n';
		const before = block + '\n' + block;
		const vault = new FakeVault({ [path]: before });

		const outcome = await saveExistingAnnotation(vault, { path }, 'aaaaaaaa', 'cv1;id=aaaaaaaa;EDITED');

		expect(outcome).toEqual({ kind: 'duplicate' });
		// Refused, not silently resolved: the file is byte-identical to
		// before, so neither copy of the drawing is lost (constitution III).
		expect(vault.read(path)).toBe(before);
	});

	it('refuses the save and keeps both copies of the drawing (via saveDirtyAnnotations batch)', async () => {
		const path = 'note.md';
		const block = '```ink-canvas\ncv1;id=aaaaaaaa;ORIGINAL\n```\n';
		const before = block + '\n' + block;
		const vault = new FakeVault({ [path]: before });

		const outcomes = await saveDirtyAnnotations(vault, { path }, [
			{ id: 'aaaaaaaa', line: 'cv1;id=aaaaaaaa;EDITED', pos: null },
		]);

		expect(outcomes.get('aaaaaaaa')).toEqual({ kind: 'duplicate' });
		expect(vault.read(path)).toBe(before);
	});
});
