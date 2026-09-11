import { locateBlock } from '../document/locate';
import { parseBlockLine } from '../format/block-line';
import { EditingSession } from '../editor/session';
import { SaveQueue } from '../editor/save-queue';
import { saveBlock, type ProcessingVault, type TFileLike } from './vault-save';

export interface OpenEditorDeps {
	file: TFileLike;
	id: string;
	vault: ProcessingVault;
	openViews(): { save(): Promise<void> }[];
	read(file: TFileLike): Promise<string>;
	isOverlayOpen(): boolean;
	openOverlay(file: TFileLike, session: EditingSession, queue: SaveQueue): void;
	notice(message: string): void;
}

const NOTICE_MESSAGES = {
	'not-found': "This drawing's block was not found in the note",
	duplicate: "This drawing's block appears more than once",
	malformed: "Can't read this drawing",
	'unsupported-version': 'Made with a newer version of the plugin',
};

export async function openEditorFlow(deps: OpenEditorDeps): Promise<void> {
	if (deps.isOverlayOpen()) return;

	await Promise.all(deps.openViews().map((view) => view.save()));
	const text = await deps.read(deps.file);

	const loc = locateBlock(text, deps.id);
	if (loc.kind === 'not-found' || loc.kind === 'duplicate') {
		deps.notice(NOTICE_MESSAGES[loc.kind]);
		return;
	}

	let drawing;
	try {
		drawing = parseBlockLine(text.slice(loc.start, loc.end));
	} catch (e) {
		const kind = e instanceof Error && 'kind' in e ? (e as { kind: keyof typeof NOTICE_MESSAGES }).kind : 'malformed';
		deps.notice(NOTICE_MESSAGES[kind] ?? NOTICE_MESSAGES.malformed);
		return;
	}

	const session = new EditingSession(drawing);
	const queue = new SaveQueue(
		async (line) => {
			const outcome = await saveBlock(deps.vault, deps.file, session.id, line);
			if (outcome.kind === 'updated' || outcome.kind === 'unchanged') {
				session.markSaved(line);
			}
			return outcome;
		},
		{
			debounceMs: 500,
			onOutcome: (outcome) => session.handleOutcome(outcome),
		},
	);

	deps.openOverlay(deps.file, session, queue);
}
