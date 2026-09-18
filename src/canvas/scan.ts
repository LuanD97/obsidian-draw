import { scanFencedBlocks } from '../document/locate';

export interface AnnotationBlockRef {
	id: string;
	blockStart: number;
	blockEnd: number;
	payloadStart: number;
	payloadEnd: number;
}

// Loose on purpose: a header that doesn't match this (or has no id at all)
// still produces a ref with an empty id, so the caller can decide to skip it
// rather than this function throwing (data-model.md AnnotationBlockRef).
const ID_RE = /^cv\d+;id=([0-9a-z]{8});/;

export function listAnnotationBlocks(text: string): AnnotationBlockRef[] {
	return scanFencedBlocks(text, 'ink-canvas').map((ref) => ({
		id: ID_RE.exec(ref.content)?.[1] ?? '',
		blockStart: ref.blockStart,
		blockEnd: ref.blockEnd,
		payloadStart: ref.payloadStart,
		payloadEnd: ref.payloadEnd,
	}));
}
