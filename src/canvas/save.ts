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
export async function saveDirtyAnnotations(
	vault: ProcessingVault,
	file: TFileLike,
	entries: DirtyAnnotationSave[],
): Promise<AnnotationSaveOutcome> {
	if (entries.length === 0) return { kind: 'unchanged' };

	let kind: AnnotationSaveOutcome['kind'] = 'unchanged';
	try {
		await vault.process(file, (data) => {
			let text = data;
			for (const entry of entries) {
				if (entry.pos !== null) {
					const blockMarkdown = '```ink-canvas\n' + entry.line + '\n```\n';
					text = insertAnnotationAfterParagraph(text, entry.pos, blockMarkdown);
					kind = 'updated';
					continue;
				}
				const result = applyAnnotationUpdate(text, entry.id, entry.line);
				text = result.text;
				if (result.kind === 'updated') kind = 'updated';
				else if (kind === 'unchanged') kind = result.kind;
			}
			return text;
		});
	} catch {
		return { kind: 'file-missing' };
	}
	return { kind };
}
