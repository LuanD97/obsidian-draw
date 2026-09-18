import { insertAnnotationAfterParagraph } from './insert';
import { applyAnnotationUpdate } from './update';

export interface AnnotationSaveOutcome {
	kind: 'updated' | 'unchanged' | 'not-found' | 'duplicate' | 'file-missing';
}

export interface TFileLike {
	path: string;
}

export interface ProcessingVault {
	process(file: TFileLike, fn: (data: string) => string): Promise<string>;
}

// New annotation (data-model.md "New annotation" save flow): the callback
// runs against vault.process's live `data` argument, never a copy captured
// before this save fired, so a concurrent edit (typing, or sync) that
// happened since Canvas Mode was turned on is respected.
export async function saveNewAnnotation(
	vault: ProcessingVault,
	file: TFileLike,
	pos: number,
	blockMarkdown: string,
): Promise<AnnotationSaveOutcome> {
	try {
		await vault.process(file, (data) => insertAnnotationAfterParagraph(data, pos, blockMarkdown));
	} catch {
		return { kind: 'file-missing' };
	}
	return { kind: 'updated' };
}

// Existing annotation (data-model.md "Existing annotation" save flow):
// locates it fresh by id against the current file text and replaces only its
// payload line.
export async function saveExistingAnnotation(
	vault: ProcessingVault,
	file: TFileLike,
	id: string,
	line: string,
): Promise<AnnotationSaveOutcome> {
	let kind: AnnotationSaveOutcome['kind'] = 'not-found';
	try {
		await vault.process(file, (data) => {
			const result = applyAnnotationUpdate(data, id, line);
			kind = result.kind;
			return result.text;
		});
	} catch {
		return { kind: 'file-missing' };
	}
	return { kind };
}

export interface DirtyAnnotationSave {
	id: string;
	line: string;
	// The pen-down offset to anchor a brand-new annotation to; null for an
	// annotation that has already been saved at least once (located by id
	// and updated in place instead).
	pos: number | null;
}

// One SaveQueue instance covers a whole open Canvas Mode note (data-model.md
// CanvasModeNoteState), so a single debounced save may need to persist
// several dirty annotations at once; this applies every pending one inside
// one vault.process call, so the note is only rewritten once per save tick.
// Returns a per-id outcome (rather than one aggregate) so a caller can clear
// only the ids that actually succeeded and keep retrying the rest — folding
// every entry into one aggregate kind would let one annotation's `duplicate`
// (save refused) get masked by another's `updated` in the same batch,
// silently dropping the failed one from future retries (constitution III).
export async function saveDirtyAnnotations(
	vault: ProcessingVault,
	file: TFileLike,
	entries: DirtyAnnotationSave[],
): Promise<Map<string, AnnotationSaveOutcome>> {
	const outcomes = new Map<string, AnnotationSaveOutcome>();
	if (entries.length === 0) return outcomes;

	try {
		await vault.process(file, (data) => {
			let text = data;
			for (const entry of entries) {
				if (entry.pos !== null) {
					const blockMarkdown = '```ink-canvas\n' + entry.line + '\n```\n';
					text = insertAnnotationAfterParagraph(text, entry.pos, blockMarkdown);
					outcomes.set(entry.id, { kind: 'updated' });
					continue;
				}
				const result = applyAnnotationUpdate(text, entry.id, entry.line);
				text = result.text;
				outcomes.set(entry.id, { kind: result.kind });
			}
			return text;
		});
	} catch {
		for (const entry of entries) outcomes.set(entry.id, { kind: 'file-missing' });
	}
	return outcomes;
}
