import { locateBlock, type BlockLocation } from '../document/locate';

export type AnnotationLocation = BlockLocation;

export function locateAnnotation(text: string, id: string): AnnotationLocation {
	return locateBlock(text, id, 'ink-canvas');
}
