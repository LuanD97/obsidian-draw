import { encodePayload, decodePayload } from '../format/codec';
import { DecodeError } from '../format/errors';
import type { Stroke } from '../model/types';

export { DecodeError };

export interface Annotation {
	id: string;
	strokes: Stroke[];
}

const LINE_RE = /^cv(\d+);id=([0-9a-z]{8});([A-Za-z0-9+/]*={0,2})$/;

// Canvas Mode has no bounded canvas, so a stroke's first point is a signed
// offset from the annotation's anchor and may be negative (data-model.md
// Annotation, contracts/canvas-annotation-format.md). format/codec.ts's
// decodePayload is reused unchanged and only accepts coordinates in [0,
// bound]; every point is shifted into that range on encode and shifted back
// on decode. The shift is invisible outside this module: it cancels out of
// the deltas between points, which are unaffected by a constant offset, so
// only the payload's validation range differs from Block Mode's real
// width/height (research.md R6).
const SHIFT = 100_000;
const SANITY_BOUND = 2 * SHIFT;

function shiftStrokes(strokes: Stroke[], by: number): Stroke[] {
	return strokes.map((stroke) => ({
		points: stroke.points.map((point) => ({ ...point, x: point.x + by, y: point.y + by })),
	}));
}

export function formatAnnotationLine(a: Annotation): string {
	return `cv1;id=${a.id};${encodePayload(shiftStrokes(a.strokes, SHIFT))}`;
}

export function parseAnnotationLine(line: string): Annotation {
	const trimmed = line.replace(/\s+$/, '');
	const match = LINE_RE.exec(trimmed);
	if (!match) {
		throw new DecodeError('malformed', 'annotation line does not match the cv1 grammar');
	}
	const [, versionStr, id, payload] = match as unknown as [string, string, string, string];

	const version = Number(versionStr);
	if (version !== 1) {
		throw new DecodeError('unsupported-version', `unsupported annotation version cv${versionStr}`);
	}

	const strokes = shiftStrokes(decodePayload(payload, SANITY_BOUND, SANITY_BOUND), -SHIFT);

	return { id, strokes };
}
