import { applyBlockUpdate, type UpdateResult } from '../document/update';

export type AnnotationUpdateResult = UpdateResult;

export function applyAnnotationUpdate(text: string, id: string, newLine: string): AnnotationUpdateResult {
	return applyBlockUpdate(text, id, newLine, 'ink-canvas');
}
