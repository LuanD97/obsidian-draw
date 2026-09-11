import { applyBlockUpdate } from '../document/update';
import type { SaveOutcome } from '../editor/save-queue';

export interface TFileLike {
	path: string;
}

export interface ProcessingVault {
	process(file: TFileLike, fn: (data: string) => string): Promise<string>;
}

export async function saveBlock(
	vault: ProcessingVault,
	file: TFileLike,
	id: string,
	line: string,
): Promise<SaveOutcome> {
	let kind: SaveOutcome['kind'] = 'not-found';
	try {
		await vault.process(file, (data) => {
			const result = applyBlockUpdate(data, id, line);
			kind = result.kind;
			return result.text;
		});
	} catch {
		return { kind: 'file-missing' };
	}
	return { kind };
}
