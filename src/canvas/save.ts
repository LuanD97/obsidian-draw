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
