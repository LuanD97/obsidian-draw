import { describe, expect, it, vi } from 'vitest';
import { openEditorFlow } from '../../src/obsidian/flows';
import { EditingSession } from '../../src/editor/session';
import { SaveQueue } from '../../src/editor/save-queue';
import { FakeVault } from './fake-vault';
import type { OpenEditorDeps } from '../../src/obsidian/flows';

const ID = 'aaaaaaaa';
const LINE = `v1;id=${ID};700x260;`;
const BLOCK = '```ink\n' + LINE + '\n```\n';

function makeDeps(overrides: Partial<OpenEditorDeps> = {}): OpenEditorDeps {
	return {
		file: { path: 'note.md' },
		id: ID,
		vault: new FakeVault({ 'note.md': BLOCK }),
		openViews: () => [],
		read: async () => BLOCK,
		isOverlayOpen: () => false,
		openOverlay: vi.fn(),
		notice: vi.fn(),
		...overrides,
	};
}

describe('openEditorFlow', () => {
	it('saves every open view before reading the file (recorded call order)', async () => {
		const order: string[] = [];
		const view = { save: vi.fn(async () => void order.push('view-save')) };
		const deps = makeDeps({
			openViews: () => [view],
			read: async () => {
				order.push('read');
				return BLOCK;
			},
		});

		await openEditorFlow(deps);

		expect(order).toEqual(['view-save', 'read']);
	});

	it('opens the overlay with the parsed drawing when the block is found and valid', async () => {
		const deps = makeDeps();
		await openEditorFlow(deps);

		expect(deps.openOverlay).toHaveBeenCalledTimes(1);
		const call = (deps.openOverlay as ReturnType<typeof vi.fn>).mock.calls[0] as unknown[];
		const [file, session] = call as [unknown, EditingSession, SaveQueue];
		expect(file).toEqual({ path: 'note.md' });
		expect(session).toBeInstanceOf(EditingSession);
		expect(session.drawing).toEqual({ version: 1, id: ID, width: 700, height: 260, strokes: [] });
	});

	it('shows a notice and opens nothing when the block is missing', async () => {
		const deps = makeDeps({ read: async () => 'no ink block here' });
		await openEditorFlow(deps);

		expect(deps.notice).toHaveBeenCalledTimes(1);
		expect(deps.openOverlay).not.toHaveBeenCalled();
	});

	it('shows a notice and opens nothing when the id is duplicated', async () => {
		const deps = makeDeps({ read: async () => BLOCK + BLOCK });
		await openEditorFlow(deps);

		expect(deps.notice).toHaveBeenCalledTimes(1);
		expect(deps.openOverlay).not.toHaveBeenCalled();
	});

	it('shows a notice and opens nothing when the block is malformed', async () => {
		const malformed = '```ink\nv1;id=' + ID + ';700x260;not-valid-base64!!\n```\n';
		const deps = makeDeps({ read: async () => malformed });
		await openEditorFlow(deps);

		expect(deps.notice).toHaveBeenCalledTimes(1);
		expect(deps.openOverlay).not.toHaveBeenCalled();
	});

	it('does nothing (not even save or read) when the overlay is already open', async () => {
		const view = { save: vi.fn(async () => {}) };
		const read = vi.fn(async () => BLOCK);
		const deps = makeDeps({ isOverlayOpen: () => true, openViews: () => [view], read });

		await openEditorFlow(deps);

		expect(view.save).not.toHaveBeenCalled();
		expect(read).not.toHaveBeenCalled();
		expect(deps.openOverlay).not.toHaveBeenCalled();
	});

	it('creates a SaveQueue whose save function reads session.id at call time', async () => {
		// A second, distinct empty block representing the id the session will
		// be switched to mid-flight (simulating what "Append to note" does in
		// US3, without depending on that not-yet-built feature).
		const otherLine = 'v1;id=bbbbbbbb;700x260;';
		const otherBlock = '```ink\n' + otherLine + '\n```\n';
		const combined = BLOCK + '\n' + otherBlock;
		const vault = new FakeVault({ 'note.md': combined });

		const deps = makeDeps({ vault, read: async () => combined });
		await openEditorFlow(deps);

		const call = (deps.openOverlay as ReturnType<typeof vi.fn>).mock.calls[0] as unknown[];
		const [, session, queue] = call as [unknown, EditingSession, SaveQueue];

		session.addStroke([
			{ x: 0, y: 0, pressure: 0.5 },
			{ x: 10, y: 10, pressure: 0.5 },
		]);
		// Simulate an id switch (the real switch happens via "Append to note" in US3).
		session.drawing = { ...session.drawing, id: 'bbbbbbbb' };
		queue.schedule(session.currentLine());
		await queue.flush();

		const after = vault.read('note.md') as string;
		expect(after).toContain(session.currentLine()); // the bbbbbbbb block now carries the stroke
		expect(after).toContain(LINE); // the original aaaaaaaa block is untouched
	});

	it('wires the SaveQueue onOutcome to session.handleOutcome', async () => {
		const deps = makeDeps();
		await openEditorFlow(deps);

		const call = (deps.openOverlay as ReturnType<typeof vi.fn>).mock.calls[0] as unknown[];
		const [, session, queue] = call as [unknown, EditingSession, SaveQueue];
		const handleOutcome = vi.spyOn(session, 'handleOutcome');

		queue.schedule(session.currentLine());
		await queue.flush();

		expect(handleOutcome).toHaveBeenCalledWith({ kind: 'unchanged' });
	});
});
