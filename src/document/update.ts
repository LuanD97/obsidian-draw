import { locateBlock } from './locate';

export type UpdateResult =
	| { kind: 'updated' | 'unchanged'; text: string }
	| { kind: 'not-found' | 'duplicate'; text: string };

export function applyBlockUpdate(
	text: string,
	id: string,
	newLine: string,
	fenceInfo = 'ink',
): UpdateResult {
	const loc = locateBlock(text, id, fenceInfo);

	if (loc.kind === 'not-found') return { kind: 'not-found', text };
	if (loc.kind === 'duplicate') return { kind: 'duplicate', text };

	const current = text.slice(loc.start, loc.end);
	if (current === newLine) return { kind: 'unchanged', text };

	const updated = text.slice(0, loc.start) + newLine + text.slice(loc.end);
	return { kind: 'updated', text: updated };
}

export function appendBlock(text: string, blockMarkdown: string): string {
	if (text.length === 0 || text.endsWith('\n')) {
		return text + blockMarkdown;
	}
	return text + '\n' + blockMarkdown;
}
